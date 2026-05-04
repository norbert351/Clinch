import { db } from '../../config/db';
import { contractEvents, deals } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { emitDealUpdateToUsers } from '../../socket/gateway';
import { sendNotification } from '../../modules/notifications/notifications.service';

export async function handleCancelled(
  event: {
    dealId: bigint;
    partyA: `0x${string}`;
    partyB: `0x${string}`;
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
    eventName: 'Cancelled',
    txHash,
    blockNumber: Number(blockNumber),
    rawPayload: {
      dealId: event.dealId?.toString(),
      partyA: event.partyA,
      partyB: event.partyB,
    } as Record<string, unknown>,
  });

  await db
    .update(deals)
    .set({ status: 'Cancelled', updatedAt: new Date() })
    .where(eq(deals.onChainId, Number(event.dealId)));

  await sendNotification('deal-expired', event.partyA, {
    onChainId: Number(event.dealId),
  });
  await sendNotification('deal-expired', event.partyB, {
    onChainId: Number(event.dealId),
  });

  emitDealUpdateToUsers(Number(event.dealId), event.partyA, event.partyB, { type: 'Cancelled', event });
}
