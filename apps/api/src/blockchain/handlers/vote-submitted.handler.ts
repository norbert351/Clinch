import { db } from '../../config/db';
import { contractEvents, votes, deals, disputes } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { emitDealUpdateToUsers } from '../../socket/gateway';
import { sendNotification, notifyArbitrator } from '../../modules/notifications/notifications.service';
import { generateDisputeAnalysis, generateDisputeSummary } from '../../modules/ai/ai.service';
import { OUTCOMES } from '../contract';
import { config } from '../../config/env';
import { postTimelineMessage } from './timeline';
import { trackAnalyticsEvent } from '../../modules/analytics/analytics.service';

const PLATFORM_ARBITRATOR = config.admin.arbitrator;

function serializeEventPayload(payload: { dealId: bigint; party: string; outcome: number }): Record<string, unknown> {
  return {
    dealId: Number(payload.dealId),
    party: payload.party,
    outcome: payload.outcome,
  };
}

function getPartyLabel(deal: typeof deals.$inferSelect, party: string): string {
  if (party === deal.partyA.toLowerCase()) {
    return deal.dealType === 'OneSided' ? 'Client' : 'Creator';
  }
  if (party === deal.partyB.toLowerCase()) {
    return deal.dealType === 'OneSided' ? 'Worker' : 'Counterparty';
  }
  return 'Participant';
}

export async function handleVoteSubmitted(
  event: {
    dealId: bigint;
    party: `0x${string}`;
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
    eventName: 'VoteSubmitted',
    txHash,
    blockNumber: Number(blockNumber),
    rawPayload: serializeEventPayload(event),
  });

  const outcomeText = OUTCOMES[event.outcome] || `Unknown_${event.outcome}`;
  const onChainId = Number(event.dealId);
  const party = event.party.toLowerCase();

  await db.insert(votes).values({
    onChainId,
    party,
    outcome: outcomeText,
  }).onConflictDoNothing();

  const deal = await db.query.deals.findFirst({
    where: eq(deals.onChainId, onChainId),
  });

  if (!deal) {
    console.error('[VoteSubmitted] Deal not found:', onChainId);
    return;
  }

  if (deal.status === 'Resolved' || deal.status === 'Cancelled' || deal.status === 'Expired') {
    return;
  }

  await postTimelineMessage(
    onChainId,
    `${getPartyLabel(deal, party)} submitted outcome: ${outcomeText}.`,
  );

  const allVotes = await db.select().from(votes).where(eq(votes.onChainId, onChainId));

  if (allVotes.length >= 1) {
    const dealType = deal.dealType;
    const isOneSided = dealType === 'OneSided';

    const aVote = allVotes.find(v => v.party === deal.partyA.toLowerCase());
    const bVote = allVotes.find(v => v.party === deal.partyB.toLowerCase());

    if (aVote && bVote && aVote.outcome !== bVote.outcome) {
      if (deal.status !== 'Disputed') {
        let arbitrator = deal.arbitratorWallet;
        
        if (
          !arbitrator ||
          arbitrator === '0x0000000000000000000000000000000000000000' ||
          arbitrator.trim() === ''
        ) {
          arbitrator = PLATFORM_ARBITRATOR;
        }

        const existingDispute = await db.query.disputes.findFirst({
          where: eq(disputes.onChainId, onChainId),
        });

        if (!existingDispute) {
          await db.insert(disputes).values({
            onChainId,
            raisedBy: party,
            reasonText: `Vote mismatch: ${aVote.outcome} vs ${bVote.outcome}`,
          });
        }

        await db.update(deals)
          .set({ 
            status: 'Disputed', 
            arbitratorWallet: arbitrator,
            updatedAt: new Date() 
          })
          .where(eq(deals.onChainId, onChainId));

        emitDealUpdateToUsers(onChainId, deal.partyA, deal.partyB, {
          type: 'Disputed',
          reason: 'Vote mismatch',
          partyAOutcome: aVote.outcome,
          partyBOutcome: bVote.outcome,
          arbitrator,
        });

        await postTimelineMessage(
          onChainId,
          `Votes disagreed: creator voted ${aVote.outcome} and counterparty voted ${bVote.outcome}.`,
        );

        trackAnalyticsEvent({
          type: 'DISPUTE_OPENED',
          wallet: party,
          dealId: onChainId,
          amount: (Number(deal.amountA) || 0) + (Number(deal.amountB) || 0),
          metadata: {
            source: 'vote_mismatch',
            partyAOutcome: aVote.outcome,
            partyBOutcome: bVote.outcome,
            arbitrator,
          },
        });

        setTimeout(() => {
          void Promise.allSettled([
            generateDisputeSummary(onChainId),
          ]).then((results) => {
            results.forEach((result) => {
              if (result.status === 'rejected') {
                console.warn('[VoteSubmitted] AI dispute generation failed:', result.reason);
              }
            });
          });
        }, 100);

        generateDisputeAnalysis(onChainId)
          .then(result => {
            if (result) {
              console.log(
                '[VoteSubmitted] AI dispute analysis saved:',
                onChainId,
                '| Recommended:',
                result.recommendedOutcome,
                '| Confidence:',
                result.confidence
              );
            }
          })
          .catch(err => {
            console.warn(
              '[VoteSubmitted] AI analysis failed (non-fatal):',
              err?.message
            );
          });

        await notifyArbitrator('dispute-opened', {
          onChainId,
          partyA: deal.partyA,
          partyB: deal.partyB,
          arbitratorWallet: arbitrator,
        });
      }
    }
  }

  const otherParty =
    party === deal.partyA.toLowerCase()
      ? deal.partyB
      : deal.partyA;

  await sendNotification('outcome-submitted', otherParty, {
    onChainId,
  });

  emitDealUpdateToUsers(onChainId, deal.partyA, deal.partyB, {
    type: 'VoteSubmitted',
    party: event.party,
    outcome: outcomeText,
    totalVotes: allVotes.length,
  });
}
