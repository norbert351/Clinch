import { db } from '../../config/db';
import { deals, deposits, votes, disputes } from '../../db/schema';
import { eq, ne, and, or, inArray, sql, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { Deal } from '../../db/schema';
import { getPublicClient } from '../../config/rpc';
import { CONTRACT_ABI, config } from '../../blockchain/contract';
import { generateDisputeAnalysis, generateDisputeSummary } from '../ai/ai.service';

export interface DealWithDetails extends Deal {
  depositList?: typeof deposits.$inferSelect[];
  voteList?: typeof votes.$inferSelect[];
  dispute?: typeof disputes.$inferSelect | null;
  partyADeposited: boolean;
  partyBDeposited: boolean;
  partyAVoted?: boolean;
  partyBVoted?: boolean;
  partyAVoteOutcome?: string | null;
  partyBVoteOutcome?: string | null;
  computedStatus?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function getDeals(
  page: number = 1,
  pageSize: number = 20,
  status?: string,
  walletAddress?: string
): Promise<PaginatedResult<DealWithDetails>> {
  const offset = (page - 1) * pageSize;

  const validStatuses = ['Active', 'Disputed', 'Resolved', 'Cancelled', 'Expired'];

  let baseConditions = undefined as ReturnType<typeof eq> | undefined;

  if (status && validStatuses.includes(status)) {
    baseConditions = eq(deals.status, status);
  }

  if (walletAddress) {
    const wallet = walletAddress.toLowerCase();
    const walletFilter = or(
      eq(deals.partyA, wallet),
      eq(deals.partyB, wallet)
    );
    baseConditions = baseConditions
      ? and(baseConditions, walletFilter)
      : walletFilter;
  }

  const [items, countResult] = await Promise.all([
    db
      .select()
      .from(deals)
      .where(baseConditions)
      .orderBy(desc(deals.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(deals)
      .where(baseConditions),
  ]);

  const enriched = await Promise.all(
    items.map(async (deal) => {
      const depositList = await db
        .select()
        .from(deposits)
        .where(eq(deposits.onChainId, deal.onChainId));

      const partyADeposited =
        deal.partyADepositComplete ||
        depositList.some(
          (d) => d.party.toLowerCase() === deal.partyA.toLowerCase()
        );

      const partyBDeposited =
        deal.partyBDepositComplete ||
        depositList.some(
          (d) => d.party.toLowerCase() === deal.partyB.toLowerCase()
        );

      // Compute normalized UI status
      const isOneSided = deal.dealType === 'OneSided';
      let computedStatus = deal.status;

      if (deal.status === 'Active') {
        if (isOneSided) {
          computedStatus = partyADeposited ? 'Active' : 'Pending';
        } else {
          computedStatus = (partyADeposited && partyBDeposited) ? 'Active' : 'Pending';
        }
      }

      return {
        ...deal,
        depositList,
        partyADeposited,
        partyBDeposited,
        computedStatus,
      };
    })
  );

  const total = countResult[0]?.count ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  return { items: enriched as DealWithDetails[], total, page, pageSize, totalPages };
}

export async function getDealByOnChainId(onChainId: bigint): Promise<DealWithDetails | null> {
  const deal = await db.query.deals.findFirst({
    where: eq(deals.onChainId, Number(onChainId)),
  });

  if (!deal) {
    return null;
  }

  const [depositList, voteList, dispute] = await Promise.all([
    db
      .select()
      .from(deposits)
      .where(eq(deposits.onChainId, Number(onChainId))),
    db
      .select()
      .from(votes)
      .where(eq(votes.onChainId, Number(onChainId))),
    db.query.disputes.findFirst({
      where: eq(disputes.onChainId, Number(onChainId)),
    }).catch(() => null),
  ]);

  const localPartyADeposited = deal.partyADepositComplete || depositList.some(
    (d) => d.party.toLowerCase() === deal.partyA.toLowerCase()
  );
  const localPartyBDeposited = deal.partyBDepositComplete || depositList.some(
    (d) => d.party.toLowerCase() === deal.partyB.toLowerCase()
  );

  let onChainPartyADeposited = false;
  let onChainPartyBDeposited = false;
  let onChainStatus = deal.status;

  try {
    const rpcClient = getPublicClient();
    const contractAddress = config.blockchain.contractAddress as `0x${string}`;

    if (deal.partyA) {
      onChainPartyADeposited = await rpcClient.readContract({
        address: contractAddress,
        abi: CONTRACT_ABI,
        functionName: 'hasDeposited',
        args: [BigInt(onChainId), deal.partyA as `0x${string}`],
      }) as boolean;
    }

    if (deal.partyB) {
      onChainPartyBDeposited = await rpcClient.readContract({
        address: contractAddress,
        abi: CONTRACT_ABI,
        functionName: 'hasDeposited',
        args: [BigInt(onChainId), deal.partyB as `0x${string}`],
      }) as boolean;
    }

    const onChainDeal = await rpcClient.readContract({
      address: contractAddress,
      abi: CONTRACT_ABI,
      functionName: 'getDeal',
      args: [BigInt(onChainId)],
    }) as unknown as readonly [string, string, number, number, bigint, bigint, bigint, bigint, bigint, string, bigint];
    
    const statusNum = Number(onChainDeal[3]);
    const statusMap: Record<number, string> = {
      0: 'Active',
      1: 'Confirmed',
      2: 'Disputed',
      3: 'Resolved',
      4: 'Cancelled',
      5: 'Expired',
    };
    onChainStatus = statusMap[statusNum] || 'Active';
  } catch (err) {
    console.error('[getDealByOnChainId] On-chain check failed:', err);
  }

  const finalPartyADeposited = onChainPartyADeposited || localPartyADeposited;
  const finalPartyBDeposited = onChainPartyBDeposited || localPartyBDeposited;

  const needsUpdate = 
    deal.status !== onChainStatus ||
    deal.partyADepositComplete !== finalPartyADeposited ||
    deal.partyBDepositComplete !== finalPartyBDeposited;

  if (needsUpdate) {
    await db.update(deals)
      .set({
        status: onChainStatus,
        partyADepositComplete: finalPartyADeposited,
        partyBDepositComplete: finalPartyBDeposited,
        updatedAt: new Date(),
      })
      .where(eq(deals.onChainId, Number(onChainId)));
  }

  const partyAVoted = voteList.some(
    (v) => v.party.toLowerCase() === deal.partyA.toLowerCase()
  );
  const partyBVoted = voteList.some(
    (v) => v.party.toLowerCase() === deal.partyB.toLowerCase()
  );
  const partyAVoteOutcome = voteList.find(
    (v) => v.party.toLowerCase() === deal.partyA.toLowerCase()
  )?.outcome || null;
  const partyBVoteOutcome = voteList.find(
    (v) => v.party.toLowerCase() === deal.partyB.toLowerCase()
  )?.outcome || null;

  if (onChainStatus === 'Active' && partyAVoted && partyBVoted && partyAVoteOutcome !== partyBVoteOutcome) {
    console.log('[getDealByOnChainId] Vote mismatch detected - updating to Disputed:', {
      onChainId,
      partyAVoteOutcome,
      partyBVoteOutcome,
    });
    onChainStatus = 'Disputed';
    
    const existingDispute = await db.query.disputes.findFirst({
      where: eq(disputes.onChainId, Number(onChainId)),
    });

    if (!existingDispute) {
      await db.insert(disputes).values({
        onChainId: Number(onChainId),
        raisedBy: deal.partyA,
        reasonText: `Vote mismatch: ${partyAVoteOutcome} vs ${partyBVoteOutcome}`,
      });
    }

    await db.update(deals)
      .set({
        status: onChainStatus,
        arbitratorWallet: config.admin.arbitrator,
        partyADepositComplete: finalPartyADeposited,
        partyBDepositComplete: finalPartyBDeposited,
        updatedAt: new Date(),
      })
      .where(eq(deals.onChainId, Number(onChainId)));

    setTimeout(() => {
      void Promise.allSettled([
        generateDisputeSummary(Number(onChainId)),
        generateDisputeAnalysis(Number(onChainId)),
      ]).then((results) => {
        results.forEach((result) => {
          if (result.status === 'rejected') {
            console.warn('[getDealByOnChainId] AI dispute generation failed:', result.reason);
          }
        });
      });
    }, 100);
  }

  return {
    ...deal,
    depositList,
    voteList,
    dispute,
    partyADeposited: finalPartyADeposited,
    partyBDeposited: finalPartyBDeposited,
    partyAVoted,
    partyBVoted,
    partyAVoteOutcome,
    partyBVoteOutcome,
  } as DealWithDetails;
}

export async function getDealByInviteToken(token: string): Promise<Deal | null> {
  const deal = await db.query.deals.findFirst({
    where: eq(deals.inviteToken, token),
  });
  return deal || null;
}

export async function updateDealMetadata(
  onChainId: bigint,
  metadata: { title?: string; description?: string; inviteToken?: string }
): Promise<Deal | null> {
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (metadata.title !== undefined) updateData.title = metadata.title;
  if (metadata.description !== undefined) updateData.description = metadata.description;
  if (metadata.inviteToken !== undefined) updateData.inviteToken = metadata.inviteToken;

  const [updated] = await db
    .update(deals)
    .set(updateData)
    .where(eq(deals.onChainId, Number(onChainId)))
    .returning();

  return updated || null;
}

export async function getActiveDeals(): Promise<Deal[]> {
  const activeDeals = await db
    .select()
    .from(deals)
    .where(
      inArray(deals.status, ['Active', 'Disputed'])
    );

  return activeDeals;
}

export interface PublicPlatformStats {
  totalVolumeLocked: string;
  activeDeals: number;
}

export async function getPublicPlatformStats(): Promise<PublicPlatformStats> {
  const [volumeResult, countResult] = await Promise.all([
    db
      .select({
        total: sql<string>`COALESCE(SUM(CAST(${deals.amountA} AS numeric) + CAST(${deals.amountB} AS numeric)), 0)::text`,
      })
      .from(deals)
      .where(eq(deals.status, 'Active')),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(deals)
      .where(eq(deals.status, 'Active')),
  ]);

  return {
    totalVolumeLocked: volumeResult[0]?.total || '0',
    activeDeals: countResult[0]?.count || 0,
  };
}

export function generateInviteToken(): string {
  return nanoid(12);
}
