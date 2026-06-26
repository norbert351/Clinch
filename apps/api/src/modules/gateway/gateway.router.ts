import { createPublicKey, createVerify } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { successResponse, errorResponse } from '../../middleware/error.middleware';
import {
  applyGatewayWebhookEvent,
  applyTransferWebhookEvent,
  applyTransactionWebhookEvent,
  createGatewayDepositIntent,
  createGatewayTransferIntent,
  fetchCircleNotificationPublicKey,
  getBalanceBreakdown,
  getCompletedTransfers,
  getPendingTransfers,
  getSupportedGatewayChains,
  getUnifiedBalance,
  markGatewayDepositSubmitted,
  markGatewayTransferFailed,
  markGatewayTransferMintSubmitted,
  submitGatewayTransferSignature,
} from './gateway.service';

const chainKeySchema = z.enum(['ETH-SEPOLIA', 'BASE-SEPOLIA', 'ARC-TESTNET']);
const amountSchema = z.union([
  z.string().trim().regex(/^\d+(\.\d{1,6})?$/),
  z.number().positive(),
]);

const createDepositSchema = z.object({
  sourceChainKey: chainKeySchema,
  amount: amountSchema,
});

const createTransferSchema = z.object({
  sourceChainKey: chainKeySchema,
  destinationChainKey: chainKeySchema,
  recipient: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  amount: amountSchema,
});

const sourceSubmittedSchema = z.object({
  sourceTxHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

const transferSignatureSchema = z.object({
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
});

const mintSubmittedSchema = z.object({
  destinationTxHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

const failureSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

const publicKeyCache = new Map<string, { publicKey: string; expiresAt: number }>();

function getParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] : value ?? '';
}

function getHeader(req: Request, name: string): string {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function getRawBody(req: Request): Buffer {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8');
  return Buffer.from(JSON.stringify(req.body ?? {}), 'utf8');
}

async function getCachedCirclePublicKey(keyId: string): Promise<string> {
  const cached = publicKeyCache.get(keyId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.publicKey;
  }

  const publicKey = await fetchCircleNotificationPublicKey(keyId);
  publicKeyCache.set(keyId, {
    publicKey,
    expiresAt: Date.now() + 60 * 60 * 1000,
  });
  return publicKey;
}

async function verifyCircleWebhookSignature(req: Request): Promise<boolean> {
  const keyId = getHeader(req, 'x-circle-key-id');
  const signature = getHeader(req, 'x-circle-signature');
  if (!keyId || !signature) return false;

  const publicKey = await getCachedCirclePublicKey(keyId);
  const keyObject = createPublicKey({
    key: Buffer.from(publicKey, 'base64'),
    format: 'der',
    type: 'spki',
  });
  const verifier = createVerify('SHA256');
  verifier.update(getRawBody(req));
  verifier.end();

  try {
    return verifier.verify(keyObject, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}

function getNotificationType(payload: Record<string, unknown>): string {
  const direct = payload.notificationType || payload.type || payload.eventType;
  if (typeof direct === 'string') return direct;

  const data = payload.data;
  if (data && typeof data === 'object') {
    const nested = (data as Record<string, unknown>).notificationType ||
      (data as Record<string, unknown>).type ||
      (data as Record<string, unknown>).eventType;
    if (typeof nested === 'string') return nested;
  }

  return '';
}

function getNotificationPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const notification = payload.notification;
  if (notification && typeof notification === 'object' && !Array.isArray(notification)) {
    return notification as Record<string, unknown>;
  }

  const data = payload.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return payload;
}

export async function getGatewayChainsHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.json(successResponse(await getSupportedGatewayChains()));
  } catch (err) {
    next(err);
  }
}

export async function getUnifiedBalanceHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.json(successResponse(await getUnifiedBalance(req.wallet!)));
  } catch (err) {
    next(err);
  }
}

export async function getBalanceBreakdownHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.json(successResponse(await getBalanceBreakdown(req.wallet!)));
  } catch (err) {
    next(err);
  }
}

export async function getPendingTransfersHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.json(successResponse(await getPendingTransfers(req.wallet!)));
  } catch (err) {
    next(err);
  }
}

export async function getCompletedTransfersHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.json(successResponse(await getCompletedTransfers(req.wallet!)));
  } catch (err) {
    next(err);
  }
}

export async function createDepositIntentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = createDepositSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(errorResponse(parsed.error.message));
      return;
    }

    res.json(successResponse(await createGatewayDepositIntent({
      walletAddress: req.wallet!,
      sourceChainKey: parsed.data.sourceChainKey,
      amount: parsed.data.amount,
    })));
  } catch (err) {
    next(err);
  }
}

export async function markDepositSubmittedHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = sourceSubmittedSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(errorResponse(parsed.error.message));
      return;
    }

    const transfer = await markGatewayDepositSubmitted({
      transferId: getParam(req.params.transferId),
      walletAddress: req.wallet!,
      sourceTxHash: parsed.data.sourceTxHash,
    });
    if (!transfer) {
      res.status(404).json(errorResponse('Deposit record not found'));
      return;
    }

    res.json(successResponse(transfer));
  } catch (err) {
    next(err);
  }
}

export async function createTransferIntentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = createTransferSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(errorResponse(parsed.error.message));
      return;
    }

    res.json(successResponse(await createGatewayTransferIntent({
      walletAddress: req.wallet!,
      sourceChainKey: parsed.data.sourceChainKey,
      destinationChainKey: parsed.data.destinationChainKey,
      recipient: parsed.data.recipient,
      amount: parsed.data.amount,
    })));
  } catch (err) {
    next(err);
  }
}

export async function submitTransferSignatureHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = transferSignatureSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(errorResponse(parsed.error.message));
      return;
    }

    res.json(successResponse(await submitGatewayTransferSignature({
      transferId: getParam(req.params.transferId),
      walletAddress: req.wallet!,
      signature: parsed.data.signature,
    })));
  } catch (err) {
    next(err);
  }
}

export async function markTransferMintSubmittedHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = mintSubmittedSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(errorResponse(parsed.error.message));
      return;
    }

    const transfer = await markGatewayTransferMintSubmitted({
      transferId: getParam(req.params.transferId),
      walletAddress: req.wallet!,
      destinationTxHash: parsed.data.destinationTxHash,
    });
    if (!transfer) {
      res.status(404).json(errorResponse('Transfer not found'));
      return;
    }

    res.json(successResponse(transfer));
  } catch (err) {
    next(err);
  }
}

export async function markTransferFailedHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = failureSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(errorResponse(parsed.error.message));
      return;
    }

    const transfer = await markGatewayTransferFailed({
      transferId: getParam(req.params.transferId),
      walletAddress: req.wallet!,
      reason: parsed.data.reason,
    });
    if (!transfer) {
      res.status(404).json(errorResponse('Transfer not found'));
      return;
    }

    res.json(successResponse(transfer));
  } catch (err) {
    next(err);
  }
}

export async function circleWebhookHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const verified = await verifyCircleWebhookSignature(req);
    if (!verified) {
      res.status(401).json(errorResponse('Invalid Circle webhook signature'));
      return;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(getRawBody(req).toString('utf8')) as Record<string, unknown>;
    } catch {
      res.status(400).json(errorResponse('Invalid JSON payload'));
      return;
    }

    const notificationType = getNotificationType(parsed);
    if (!notificationType) {
      res.status(400).json(errorResponse('Missing Circle notification type'));
      return;
    }

    const eventId =
      typeof parsed.id === 'string'
        ? parsed.id
        : typeof parsed.notificationId === 'string'
          ? parsed.notificationId
          : null;

    const eventPayload = getNotificationPayload(parsed);

    if (
      notificationType === 'gateway.deposit.finalized' ||
      notificationType === 'gateway.mint.forwarded' ||
      notificationType === 'gateway.mint.finalized'
    ) {
      await applyGatewayWebhookEvent({
        eventId,
        notificationType,
        payload: eventPayload,
      });
    } else if (
      notificationType === 'transfer.completed' ||
      notificationType === 'transfer.failed'
    ) {
      await applyTransferWebhookEvent({
        eventId,
        notificationType,
        payload: eventPayload,
      });
    } else if (
      notificationType === 'transaction.confirmed' ||
      notificationType === 'transaction.failed'
    ) {
      await applyTransactionWebhookEvent({
        eventId,
        notificationType,
        payload: eventPayload,
      });
    }

    res.json(successResponse({ received: true }));
  } catch (err) {
    next(err);
  }
}
