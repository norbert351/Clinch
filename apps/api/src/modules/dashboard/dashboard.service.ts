import { db } from '../../config/db';
import { deals, deposits, votes } from '../../db/schema';
import { eq, or, sql } from 'drizzle-orm';

export interface UserDashboardStats {
  totalDeals: number;
  activeDeals: number;
  completedDeals: number;
  disputedDeals: number;
  totalLockedUSDC: number;
  pendingDeals: number;
}

export interface GlobalDashboardStats {
  totalUsers: number;
  totalDeals: number;
  activeDeals: number;
  completedDeals: number;
  disputedDeals: number;
  totalLockedUSDC: number;
  totalFeesGenerated: number;
}

export async function getUserDashboardStats(walletAddress: string): Promise<UserDashboardStats> {
  const wallet = walletAddress.toLowerCase();
  
  const allUserDeals = await db
    .select()
    .from(deals)
    .where(or(
      eq(deals.partyA, wallet),
      eq(deals.partyB, wallet)
    ));

  let activeCount = 0;
  let completedCount = 0;
  let disputedCount = 0;
  let pendingCount = 0;
  let totalLockedUSDC = 0;

  for (const deal of allUserDeals) {
    const onChainId = deal.onChainId;
    const dealDeposits = await db
      .select()
      .from(deposits)
      .where(eq(deposits.onChainId, onChainId));

    const amountA = parseFloat(deal.amountA) || 0;
    const amountB = parseFloat(deal.amountB) || 0;
    const isOneSided = deal.dealType === 'OneSided';

    const partyADeposited = deal.partyADepositComplete || dealDeposits.some(
      d => d.party.toLowerCase() === deal.partyA.toLowerCase()
    );
    const partyBDeposited = deal.partyBDepositComplete || (!isOneSided && dealDeposits.some(
      d => d.party.toLowerCase() === deal.partyB.toLowerCase()
    ));

    const isPending = deal.status === 'Active' && (
      isOneSided
        ? !partyADeposited
        : !partyADeposited || !partyBDeposited
    );
    const isActive = deal.status === 'Active' && !isPending;
    const isCompleted = deal.status === 'Resolved';
    const isDisputed = deal.status === 'Disputed';

    if (isActive) activeCount++;
    if (isCompleted) completedCount++;
    if (isDisputed) disputedCount++;
    if (isPending) pendingCount++;

    if (isActive || isPending) {
      const depositedByA = dealDeposits.some(d => d.party.toLowerCase() === deal.partyA.toLowerCase());
      const depositedByB = dealDeposits.some(d => d.party.toLowerCase() === deal.partyB.toLowerCase());
      
      if (depositedByA) totalLockedUSDC += amountA;
      if (depositedByB) totalLockedUSDC += amountB;
    }
  }

  return {
    totalDeals: allUserDeals.length,
    activeDeals: activeCount,
    completedDeals: completedCount,
    disputedDeals: disputedCount,
    totalLockedUSDC: Math.round(totalLockedUSDC * 1e6) / 1e6,
    pendingDeals: pendingCount,
  };
}

export async function getGlobalDashboardStats(): Promise<GlobalDashboardStats> {
  const allDeals = await db.select().from(deals);

  let activeCount = 0;
  let completedCount = 0;
  let disputedCount = 0;
  let totalLockedUSDC = 0;
  let totalFeesGenerated = 0;

  const uniqueUsers = new Set<string>();

  for (const deal of allDeals) {
    uniqueUsers.add(deal.partyA);
    uniqueUsers.add(deal.partyB);

    const onChainId = deal.onChainId;
    const dealDeposits = await db
      .select()
      .from(deposits)
      .where(eq(deposits.onChainId, onChainId));

    const amountA = parseFloat(deal.amountA) || 0;
    const amountB = parseFloat(deal.amountB) || 0;
    const dealType = deal.dealType;
    const isOneSided = dealType === 'OneSided';

    const partyADeposited = deal.partyADepositComplete || dealDeposits.some(
      d => d.party.toLowerCase() === deal.partyA.toLowerCase()
    );
    const partyBDeposited = deal.partyBDepositComplete || (!isOneSided && dealDeposits.some(
      d => d.party.toLowerCase() === deal.partyB.toLowerCase()
    ));

    const isPending = deal.status === 'Active' && (isOneSided ? !partyADeposited : !partyADeposited || !partyBDeposited);
    const isActive = deal.status === 'Active' && !isPending;
    const isCompleted = deal.status === 'Resolved';
    const isDisputed = deal.status === 'Disputed';

    if (isActive) activeCount++;
    if (isCompleted) completedCount++;
    if (isDisputed) disputedCount++;

    if (isActive || isPending) {
      for (const dep of dealDeposits) {
        const depAmount = parseFloat(dep.amount) || 0;
        totalLockedUSDC += depAmount;
      }
    }

    if (isCompleted) {
      const feePercent = parseFloat(deal.feePercent) || 0;
      const platformFee = feePercent > 1 ? feePercent : feePercent * 100;
      const feeRate = platformFee / 10000;
      const totalPot = amountA + amountB;
      totalFeesGenerated += totalPot * feeRate;
    }
  }

  return {
    totalUsers: uniqueUsers.size,
    totalDeals: allDeals.length,
    activeDeals: activeCount,
    completedDeals: completedCount,
    disputedDeals: disputedCount,
    totalLockedUSDC: Math.round(totalLockedUSDC * 1e6) / 1e6,
    totalFeesGenerated: Math.round(totalFeesGenerated * 1e6) / 1e6,
  };
}