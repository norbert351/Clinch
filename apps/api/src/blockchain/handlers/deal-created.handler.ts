import { db } from '../../config/db';
import { contractEvents, deals } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { emitDealUpdate, emitDealUpdateToUsers } from '../../socket/gateway';
import { sendNotification } from '../../modules/notifications/notifications.service';
import { EscrowEventArgs } from '../contract';
import { config } from '../../config/env';

const PLATFORM_ARBITRATOR = config.admin.arbitrator;

export async function handleDealCreated(
  event: {
    dealId: bigint;
    partyA: `0x${string}`;
    partyB: `0x${string}`;
    dealType: number;
    amountA: bigint;
    amountB: bigint;
    arbitrator: `0x${string}`;
    feePercent: bigint;
    expiryTimestamp: bigint;
  },
  txHash: string,
  blockNumber: bigint
): Promise<void> {
  try {
    const onChainId = Number(event.dealId);

    const dealTypeString = event.dealType === 1 ? 'OneSided' : 'MutualStake';

    const amountAString = (Number(event.amountA) / 1e6).toString();
    const amountBString = (Number(event.amountB) / 1e6).toString();

    const expiryDate = new Date(Number(event.expiryTimestamp) * 1000);

    const existingEvent = await db.query.contractEvents.findFirst({
      where: eq(contractEvents.txHash, txHash),
    });

    if (!existingEvent) {
      await db.insert(contractEvents).values({
        onChainId,
        eventName: 'DealCreated',
        txHash,
        blockNumber: Number(blockNumber),
        rawPayload: {
          dealId: event.dealId?.toString(),
          partyA: event.partyA,
          partyB: event.partyB,
          dealType: event.dealType,
          amountA: event.amountA?.toString(),
          amountB: event.amountB?.toString(),
          arbitrator: event.arbitrator,
          feePercent: event.feePercent?.toString(),
          expiryTimestamp: event.expiryTimestamp?.toString(),
        } as Record<string, unknown>,
      });
    }

    const existingDeal = await db.query.deals.findFirst({
      where: eq(deals.onChainId, onChainId),
    });

    if (!existingDeal) {
      const inviteToken = nanoid(12);

      const [savedDeal] = await db.insert(deals).values({
        onChainId,
        partyA: event.partyA.toLowerCase(),
        partyB: event.partyB.toLowerCase(),
        dealType: dealTypeString,
        status: 'Active',
        amountA: amountAString,
        amountB: amountBString,
        arbitratorWallet: PLATFORM_ARBITRATOR,
        feePercent: (Number(event.feePercent) / 100).toString(),
        expiryTimestamp: expiryDate,
        inviteToken,
      }).returning();

      emitDealUpdateToUsers(Number(event.dealId), event.partyA, event.partyB, { type: 'DealCreated', event });

      await sendNotification('deal-invite', event.partyB, {
        onChainId: Number(event.dealId),
        dealType: dealTypeString,
        amountA: amountAString,
        amountB: amountBString,
      });
    }
  } catch (error: any) {
    console.error('[DealCreated] CRITICAL: Handler crashed:', error?.message || error);
    console.error('[DealCreated] Error stack:', error?.stack);
    throw error;
  }
}
