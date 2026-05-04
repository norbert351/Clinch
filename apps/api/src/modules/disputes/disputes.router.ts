import { Request, Response, NextFunction } from 'express';
import {
  getDisputesForArbitrator,
  getDisputeByOnChainId,
  createDispute,
} from './disputes.service';
import { successResponse, errorResponse } from '../../middleware/error.middleware';
import { db } from '../../config/db';
import { disputes } from '../../db/schema';
import { eq } from 'drizzle-orm';

export async function getPendingDisputesHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const wallet = req.wallet!;
    console.log('[GET /disputes/pending] arbitrator wallet:', wallet);
    
    const result = await getDisputesForArbitrator(wallet);
    
    console.log('[GET /disputes/pending] returning:', result.length, 'disputes');
    res.json(successResponse(result));
  } catch (err) {
    next(err);
  }
}

export async function getDisputeByDealHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { onChainId } = req.params;
    const onChainIdStr = Array.isArray(onChainId) ? onChainId[0] : onChainId;
    const onChainIdNum = parseInt(onChainIdStr);
    const dispute = await getDisputeByOnChainId(BigInt(onChainIdNum));
    res.json(successResponse(dispute || null));
  } catch (err) {
    next(err);
  }
}

export async function raiseDisputeHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const wallet = req.wallet!;
    const { onChainId } = req.params;
    const { reasonText } = req.body as { reasonText?: string };
    const onChainIdStr = Array.isArray(onChainId) ? onChainId[0] : onChainId;
    const onChainIdNum = parseInt(onChainIdStr);

    if (isNaN(onChainIdNum)) {
      res.status(400).json(errorResponse('Invalid onChainId'));
      return;
    }

    const existing = await getDisputeByOnChainId(BigInt(onChainIdNum));
    if (existing) {
      res.status(400).json(errorResponse('Dispute already exists for this deal'));
      return;
    }

    const dispute = await createDispute(BigInt(onChainIdNum), wallet, reasonText);
    res.json(successResponse(dispute));
  } catch (err) {
    next(err);
  }
}