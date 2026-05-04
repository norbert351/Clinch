import { db } from '../../config/db';
import { contractEvents, deposits, deals } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { emitDealUpdate, emitDealUpdateToUsers } from '../../socket/gateway';
import { sendNotification } from '../../modules/notifications/notifications.service';

export async function handleDeposited(
  event: {
    dealId: bigint;
    party: `0x${string}`;
    amount: bigint;
  },
  txHash: string,
  blockNumber: bigint
): Promise<void> {
  try {
    const onChainId = Number(event.dealId);
    const amountUSDC = (Number(event.amount) / 1e6).toString();
    const party = (event.party as string).toLowerCase();

    const existingEvent = await db.query.contractEvents.findFirst({
      where: eq(contractEvents.txHash, txHash),
    });

    if (existingEvent) {
      return;
    }

    await db.insert(contractEvents).values({
      onChainId,
      eventName: 'Deposited',
      txHash,
      blockNumber: Number(blockNumber),
      rawPayload: {
        dealId: event.dealId?.toString(),
        party: event.party,
        amount: event.amount?.toString(),
      } as Record<string, unknown>,
    });

    await db.insert(deposits).values({
      onChainId,
      party,
      amount: amountUSDC,
      txHash,
    }).onConflictDoNothing();

    const deal = await db.query.deals.findFirst({
      where: eq(deals.onChainId, onChainId),
    });

    if (!deal) {
      console.error('[Deposited] Deal not found for onChainId:', onChainId);
      return;
    }

    if (party === deal.partyA.toLowerCase()) {
      await db.update(deals)
        .set({ partyADepositComplete: true, updatedAt: new Date() })
        .where(eq(deals.onChainId, onChainId));
    } else if (party === deal.partyB.toLowerCase()) {
      await db.update(deals)
        .set({ partyBDepositComplete: true, updatedAt: new Date() })
        .where(eq(deals.onChainId, onChainId));
    }

    if (deal.dealType === 'OneSided' && party === deal.partyA.toLowerCase()) {
      await db.update(deals)
        .set({
          partyADepositComplete: true,
          partyBDepositComplete: true,
          updatedAt: new Date(),
        })
        .where(eq(deals.onChainId, onChainId));
    }

    const updatedDeal = await db.query.deals.findFirst({
      where: eq(deals.onChainId, onChainId),
    });

    const partyADeposited = !!updatedDeal?.partyADepositComplete;
    const partyBDeposited = !!updatedDeal?.partyBDepositComplete;

    const dealType = deal.dealType;
    const needsPartyBDeposit = dealType === 'MutualStake';
    const bothDeposited = partyADeposited && (!needsPartyBDeposit || partyBDeposited);

    if (bothDeposited) {
      emitDealUpdateToUsers(onChainId, deal.partyA, deal.partyB, {
        type: 'BothDeposited',
        party,
        amount: amountUSDC,
        partyADeposited: true,
        partyBDeposited: true,
      });
      await sendNotification('deal-accepted', deal.partyA, {
        onChainId,
      });
      await sendNotification('deal-accepted', deal.partyB, {
        onChainId,
      });
      return;
    }

    emitDealUpdateToUsers(onChainId, deal.partyA, deal.partyB, {
      type: 'Deposited',
      party,
      amount: amountUSDC,
      partyADeposited: partyADeposited,
      partyBDeposited: partyBDeposited,
    });
  } catch (error: any) {
    console.error('[Deposited] HANDLER CRASHED:', error.message);
    console.error('[Deposited] Stack:', error.stack);
  }
}
