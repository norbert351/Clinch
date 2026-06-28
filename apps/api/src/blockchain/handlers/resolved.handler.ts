import { db } from '../../config/db';
import { contractEvents, deals, disputes } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { emitDealUpdateToUsers } from '../../socket/gateway';
import { sendNotification, notifyArbitrator } from '../../modules/notifications/notifications.service';
import { config } from '../../config/env';
import { generateSettlementSummary } from '../../modules/ai/ai.service';
import { postTimelineMessage } from './timeline';
import { trackAnalyticsEvent } from '../../modules/analytics/analytics.service';
import { dispatchWebhooks } from '../../modules/developer/developer.service';

const PLATFORM_FEE_BPS = config.fees.platformFee;
const PLATFORM_WALLET = config.admin.wallet;

export async function handleResolved(
  event: {
    dealId: bigint;
    winner: `0x${string}`;
    outcome: number;
  },
  txHash: string,
  blockNumber: bigint
): Promise<void> {
  const existingEvent = await db.query.contractEvents.findFirst({
    where: eq(contractEvents.txHash, txHash),
  });

  if (existingEvent) {
    return;
  }

  await db.insert(contractEvents).values({
    onChainId: Number(event.dealId),
    eventName: 'Resolved',
    txHash,
    blockNumber: Number(blockNumber),
    rawPayload: {
      dealId: event.dealId?.toString(),
      winner: event.winner,
      outcome: event.outcome,
    } as Record<string, unknown>,
  });

  const onChainId = Number(event.dealId);

  const statusMap: Record<number, string> = {
    0: 'PartyAWins',
    1: 'PartyBWins',
    2: 'Split',
  };
  const winnerOutcome = statusMap[Number(event.outcome)] || 'None';

  const deal = await db.query.deals.findFirst({
    where: eq(deals.onChainId, onChainId),
  });

  if (!deal) {
    console.error('[Resolved] Deal not found:', onChainId);
    return;
  }

  if (deal.status === 'Resolved') {
    return;
  }

  const amountA = parseFloat(deal.amountA) || 0;
  const amountB = parseFloat(deal.amountB) || 0;
  const totalPot = amountA + amountB;

  const platformFeeNum = totalPot * (PLATFORM_FEE_BPS / 10000);
  const winnerPayout = totalPot - platformFeeNum;

  const winnerAddress = event.winner.toLowerCase();

  await db
    .update(deals)
    .set({ 
      status: 'Resolved', 
      winner: winnerOutcome,
      winnerPayout: winnerPayout.toString(),
      platformFee: platformFeeNum.toString(),
      updatedAt: new Date() 
    })
    .where(eq(deals.onChainId, onChainId));

  await db
    .update(disputes)
    .set({
      ruling: winnerOutcome,
      ruledByWallet: winnerAddress,
      ruledAt: new Date(),
      resolvedAt: new Date(),
    })
    .where(eq(disputes.onChainId, onChainId));

  await sendNotification('deal-settled', deal.partyA, {
    onChainId,
    status: 'Resolved',
    winner: winnerOutcome,
    winnerPayout: winnerPayout.toString(),
  });
  await sendNotification('deal-settled', deal.partyB, {
    onChainId,
    status: 'Resolved',
    winner: winnerOutcome,
    winnerPayout: winnerPayout.toString(),
  });

  await notifyArbitrator('dispute-resolved', {
    onChainId,
    winner: winnerOutcome,
  });

  dispatchWebhooks('deal.resolved', { onChainId, winner: winnerOutcome, winnerPayout, platformFee: platformFeeNum }).catch(() => {});
  emitDealUpdateToUsers(onChainId, deal.partyA, deal.partyB, { 
    type: 'Resolved', 
    winner: winnerOutcome,
    winnerPayout,
    platformFee: platformFeeNum,
    totalPot,
    winnerAddress,
  });

  await postTimelineMessage(
    onChainId,
    `Funds distributed. Outcome: ${winnerOutcome}. Winner payout: ${winnerPayout.toFixed(2)} USDC.`,
  );

  trackAnalyticsEvent({
    type: 'DEAL_RESOLVED',
    wallet: winnerAddress,
    dealId: onChainId,
    amount: totalPot,
    metadata: {
      outcome: winnerOutcome,
      winnerPayout,
      platformFee: platformFeeNum,
      txHash,
    },
  });

  setTimeout(() => {
    void generateSettlementSummary(onChainId).catch((err) => {
      console.warn('[Resolved] AI settlement summary failed:', err);
    });
  }, 100);
}
