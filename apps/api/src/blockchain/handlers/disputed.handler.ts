import { db } from '../../config/db';
import { contractEvents, deals, disputes } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { emitDealUpdate, emitDealUpdateToUsers } from '../../socket/gateway';
import { sendNotification, notifyArbitrator } from '../../modules/notifications/notifications.service';
import { config } from '../../config/env';

const PLATFORM_ARBITRATOR = config.admin.arbitrator;

export async function handleDisputed(
  event: {
    dealId: bigint;
    raisedBy: `0x${string}`;
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
    eventName: 'Disputed',
    txHash,
    blockNumber: Number(blockNumber),
    rawPayload: {
      dealId: event.dealId?.toString(),
      raisedBy: event.raisedBy,
    } as Record<string, unknown>,
  });

  const onChainId = Number(event.dealId);
  const raisedBy = event.raisedBy.toLowerCase();

  const deal = await db.query.deals.findFirst({
    where: eq(deals.onChainId, onChainId),
  });

  if (!deal) {
    console.error('[Disputed] Deal not found:', onChainId);
    return;
  }

  let arbitrator = deal.arbitratorWallet;
  
  if (!arbitrator || arbitrator === '0x0000000000000000000000000000000000000000') {
    arbitrator = PLATFORM_ARBITRATOR;
  }

  await db
    .update(deals)
    .set({ 
      status: 'Disputed', 
      arbitratorWallet: arbitrator,
      updatedAt: new Date() 
    })
    .where(eq(deals.onChainId, onChainId));

  const existingDispute = await db.query.disputes.findFirst({
    where: eq(disputes.onChainId, onChainId),
  });

  if (!existingDispute) {
    await db.insert(disputes).values({
      onChainId,
      raisedBy,
      reasonText: 'Dispute raised by party',
    });
  }

  emitDealUpdateToUsers(onChainId, deal.partyA, deal.partyB, { 
    type: 'Disputed', 
    raisedBy,
    arbitrator,
  });

  await notifyArbitrator('dispute-opened', {
    onChainId,
    partyA: deal.partyA,
    partyB: deal.partyB,
    arbitratorWallet: arbitrator,
  });
}