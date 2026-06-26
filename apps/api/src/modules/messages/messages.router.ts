import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { errorResponse, successResponse } from '../../middleware/error.middleware';
import { sendNotification } from '../notifications/notifications.service';
import {
  editMessage,
  getMessageNotificationRecipients,
  getMessages,
  getUnreadCountsForWallet,
  markDealMessagesRead,
  searchMessages,
  sendMessage,
} from './messages.service';
import {
  emitDealMessage,
  emitDealMessageRead,
  emitDealMessageUpdated,
  emitToUser,
} from '../../socket/gateway';
import { trackAnalyticsEvent } from '../analytics/analytics.service';

const onChainIdSchema = z.coerce.number().int().positive();
const messageIdSchema = z.string().uuid();
const messageBodySchema = z.object({
  content: z.string().max(1000),
});
const readBodySchema = z.object({
  messageId: z.string().uuid().optional(),
});
const notificationThrottle = new Map<string, number>();

function parseOnChainId(value: unknown): number | null {
  const parsed = onChainIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function normalizeWallet(wallet: string): string {
  return wallet.trim().toLowerCase();
}

function shouldNotify(key: string): boolean {
  const now = Date.now();
  const previous = notificationThrottle.get(key) || 0;

  if (now - previous < 30_000) {
    return false;
  }

  notificationThrottle.set(key, now);
  return true;
}

async function notifyRecipients(
  onChainId: number,
  senderAddress: string,
  content: string,
): Promise<void> {
  const recipients = await getMessageNotificationRecipients(onChainId, senderAddress);

  await Promise.all(
    recipients.map(async (wallet) => {
      const throttleKey = `${onChainId}:${normalizeWallet(senderAddress)}:${wallet}`;
      emitToUser(wallet, 'messages:unread-updated', { onChainId });
      if (!shouldNotify(throttleKey)) return;

      await sendNotification('new-message', wallet, {
        onChainId,
        metadata: {
          senderAddress: normalizeWallet(senderAddress),
          preview: content.slice(0, 140),
          href: `/deals/${onChainId}`,
        },
      } as any);
    }),
  );
}

export async function getDealMessagesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const wallet = req.wallet;
    const onChainId = parseOnChainId(req.params.onChainId);

    if (!wallet) {
      res.status(401).json(errorResponse('Wallet authentication required'));
      return;
    }

    if (!onChainId) {
      res.status(400).json(errorResponse('Invalid onChainId'));
      return;
    }

    const before = typeof req.query.before === 'string' ? req.query.before : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const result = await getMessages({
      onChainId,
      walletAddress: wallet,
      before,
      limit,
    });

    res.json(successResponse(result));
  } catch (err) {
    next(err);
  }
}

export async function sendDealMessageHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const wallet = req.wallet;
    const onChainId = parseOnChainId(req.params.onChainId);

    if (!wallet) {
      res.status(401).json(errorResponse('Wallet authentication required'));
      return;
    }

    if (!onChainId) {
      res.status(400).json(errorResponse('Invalid onChainId'));
      return;
    }

    const parsed = messageBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(errorResponse('Invalid message content'));
      return;
    }

    const message = await sendMessage({
      onChainId,
      walletAddress: wallet,
      content: parsed.data.content,
    });

    trackAnalyticsEvent({
      type: 'MESSAGE_SENT',
      wallet,
      dealId: onChainId,
      metadata: {
        messageId: message.id,
        senderRole: message.senderRole,
      },
    });

    await markDealMessagesRead({
      onChainId,
      walletAddress: wallet,
      messageId: message.id,
    }).catch((readErr) => {
      console.warn('[Messages] Failed to mark sender read:', readErr);
    });

    emitDealMessage(onChainId, message);
    void notifyRecipients(onChainId, wallet, message.content).catch((notifyErr) => {
      console.warn('[Messages] Notification failed:', notifyErr);
    });

    res.status(201).json(successResponse(message));
  } catch (err) {
    next(err);
  }
}

export async function markDealMessagesReadHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const wallet = req.wallet;
    const onChainId = parseOnChainId(req.params.onChainId);

    if (!wallet) {
      res.status(401).json(errorResponse('Wallet authentication required'));
      return;
    }

    if (!onChainId) {
      res.status(400).json(errorResponse('Invalid onChainId'));
      return;
    }

    const parsed = readBodySchema.safeParse(req.body || {});
    if (!parsed.success) {
      res.status(400).json(errorResponse('Invalid read payload'));
      return;
    }

    await markDealMessagesRead({
      onChainId,
      walletAddress: wallet,
      messageId: parsed.data.messageId,
    });

    emitDealMessageRead(onChainId, normalizeWallet(wallet));
    res.json(successResponse({ ok: true }));
  } catch (err) {
    next(err);
  }
}

export async function getUnreadCountsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const wallet = req.wallet;

    if (!wallet) {
      res.status(401).json(errorResponse('Wallet authentication required'));
      return;
    }

    const counts = await getUnreadCountsForWallet(wallet);
    res.json(successResponse(counts));
  } catch (err) {
    next(err);
  }
}

export async function searchDealMessagesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const wallet = req.wallet;
    const onChainId = parseOnChainId(req.params.onChainId);

    if (!wallet) {
      res.status(401).json(errorResponse('Wallet authentication required'));
      return;
    }

    if (!onChainId) {
      res.status(400).json(errorResponse('Invalid onChainId'));
      return;
    }

    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!query) {
      res.json(successResponse([]));
      return;
    }

    const results = await searchMessages({
      onChainId,
      walletAddress: wallet,
      query,
    });

    res.json(successResponse(results));
  } catch (err) {
    next(err);
  }
}

export async function editDealMessageHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const wallet = req.wallet;
    const onChainId = parseOnChainId(req.params.onChainId);
    const messageId = messageIdSchema.safeParse(req.params.messageId);

    if (!wallet) {
      res.status(401).json(errorResponse('Wallet authentication required'));
      return;
    }

    if (!onChainId || !messageId.success) {
      res.status(400).json(errorResponse('Invalid message identifier'));
      return;
    }

    const parsed = messageBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(errorResponse('Invalid message content'));
      return;
    }

    const message = await editMessage({
      onChainId,
      walletAddress: wallet,
      messageId: messageId.data,
      content: parsed.data.content,
    });

    emitDealMessageUpdated(onChainId, message);
    res.json(successResponse(message));
  } catch (err) {
    next(err);
  }
}
