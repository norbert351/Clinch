import { Request, Response, NextFunction } from 'express';
import { getDealByOnChainId } from '../deals/deals.service';
import { successResponse, errorResponse } from '../../middleware/error.middleware';
import { db } from '../../config/db';
import { deals, disputes } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { emitDealUpdateToUsers } from '../../socket/gateway';
import { sendNotification, notifyArbitrator } from '../../modules/notifications/notifications.service';
import { config } from '../../config/env';

const PLATFORM_ARBITRATOR = config.admin.arbitrator;
const PLATFORM_FEE_BPS = config.fees.platformFee;

export async function resolveDisputeHandler(
  req: Request & { wallet?: string },
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const caller = req.wallet?.toLowerCase();
    const { onChainId, outcome } = req.body as {
      onChainId: number;
      outcome: 'PartyAWins' | 'PartyBWins' | 'Split';
    };

    if (!caller) {
      res.status(401).json(errorResponse('Unauthorized'));
      return;
    }

    const deal = await getDealByOnChainId(BigInt(onChainId));

    if (!deal) {
      res.status(404).json(errorResponse('Deal not found'));
      return;
    }

    if (deal.status !== 'Disputed') {
      res.status(400).json(errorResponse('Deal is not in Disputed status'));
      return;
    }

    const arbitrator = deal.arbitratorWallet || PLATFORM_ARBITRATOR;
    
    if (caller !== arbitrator.toLowerCase()) {
      res.status(403).json(errorResponse('Only arbitrator can resolve this dispute'));
      return;
    }

    const amountA = parseFloat(deal.amountA) || 0;
    const amountB = parseFloat(deal.amountB) || 0;
    const totalPot = amountA + amountB;
    const platformFeeNum = totalPot * (PLATFORM_FEE_BPS / 10000);
    const winnerPayout = totalPot - platformFeeNum;

    await db
      .update(deals)
      .set({
        status: 'Resolved',
        winner: outcome,
        winnerPayout: winnerPayout.toString(),
        platformFee: platformFeeNum.toString(),
        updatedAt: new Date(),
      })
      .where(eq(deals.onChainId, onChainId));

    await db
      .update(disputes)
      .set({
        ruling: outcome,
        ruledByWallet: caller,
        ruledAt: new Date(),
        resolvedAt: new Date(),
      })
      .where(eq(disputes.onChainId, onChainId));

    emitDealUpdateToUsers(onChainId, deal.partyA, deal.partyB, {
      type: 'Resolved',
      winner: outcome,
      winnerPayout,
      platformFee: platformFeeNum,
      resolvedByArbitrator: true,
    });

    await sendNotification('deal-settled', deal.partyA, {
      onChainId,
      status: 'Resolved',
      winner: outcome,
    });
    await sendNotification('deal-settled', deal.partyB, {
      onChainId,
      status: 'Resolved',
      winner: outcome,
    });
    await notifyArbitrator('dispute-resolved', {
      onChainId,
      winner: outcome,
    });

    res.json(successResponse({
      outcome,
      winnerPayout,
      platformFee: platformFeeNum,
    }));
  } catch (err) {
    console.error('[resolveDispute] Error:', err);
    next(err);
  }
}