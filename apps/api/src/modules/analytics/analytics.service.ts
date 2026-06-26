import { desc, eq } from 'drizzle-orm';
import { db, sql } from '../../config/db';
import {
  analyticsEvents,
  analyticsSnapshots,
  deals,
  type NewAnalyticsEvent,
} from '../../db/schema';
import { validateAddress } from '../../middleware/validate';
import { emitAdminActivity } from '../../socket/gateway';
import {
  type AdminActivityEvent,
  type AdminAnalyticsOverview,
  type AdminChartPoint,
  type AdminDealRow,
  type AdminDisputeRow,
  type AdminMetricSummary,
  type AdminRecentUser,
  type AdminStatusDistributionPoint,
  type AdminActiveUserRow,
  type AnalyticsEventInput,
  type AnalyticsEventType,
  type UserAnalyticsStats,
} from './analytics.types';

const CLOSED_STATUSES = new Set(['Cancelled', 'Expired']);
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const SINGLE_EVENT_PER_DEAL_TYPES = new Set([
  'DEAL_CREATED',
  'DEAL_ACTIVATED',
  'DISPUTE_OPENED',
  'DEAL_RESOLVED',
]);

interface UserDealAnalyticsRow {
  id: string;
  onChainId: number;
  partyA: string;
  partyB: string;
  dealType: string;
  status: string;
  amountA: string | number | null;
  amountB: string | number | null;
  feePercent: string | number | null;
  partyADepositComplete: boolean;
  partyBDepositComplete: boolean;
  winner: string | null;
  winnerPayout: string | number | null;
  platformFee: string | number | null;
  depositedA: string | number | null;
  depositedB: string | number | null;
  depositedTotal: string | number | null;
  disputeCount: number;
}

interface UserMessageMetricsRow {
  totalMessages: number;
  activeConversations: number;
}

interface UserUnreadRow {
  unreadMessages: number;
}

interface UserGatewayMetricsRow {
  personalTransferVolume: string | number | null;
}

interface AdminMetricRow {
  totalUsers: number;
  activeUsers24h: number;
  activeUsers7d: number;
  newUsers24h: number;
  newUsers7d: number;
  totalDeals: number;
  activeDeals: number;
  disputedDeals: number;
  resolvedDeals: number;
  closedDeals: number;
  totalVolume: string | number | null;
  totalUnifiedBalanceVolume: string | number | null;
  dailyActiveWallets: number;
  totalDisputes: number;
  successfulSettlements: number;
  failedSettlements: number;
  totalFees: string | number | null;
}

interface ChainMetricRow {
  chain: string | null;
  amount: string | number | null;
}

interface UserGrowthRow {
  date: string | Date;
  count: number;
  total: number;
}

interface DealVolumeRow {
  date: string | Date;
  count: number;
  volume: string | number | null;
}

interface RevenueRow {
  date: string | Date;
  revenue: string | number | null;
}

interface StatusDistributionRow {
  status: string;
  count: number;
}

interface RetentionRow {
  date: string | Date;
  activeUsers: number;
  returningUsers: number;
  retentionRate: string | number | null;
}

interface RecentUserRow {
  id: string;
  walletAddress: string;
  displayName: string | null;
  email: string | null;
  createdAt: string | Date;
  eventCount: number;
}

interface DealTableRow {
  id: string;
  onChainId: number;
  partyA: string;
  partyB: string;
  dealType: string;
  status: string;
  amountUSDC: string | number | null;
  depositedUSDC: string | number | null;
  platformFeeUSDC: string | number | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

interface DisputeTableRow {
  id: string;
  onChainId: number;
  raisedBy: string;
  ruling: string | null;
  dealStatus: string | null;
  amountUSDC: string | number | null;
  createdAt: string | Date;
  resolvedAt: string | Date | null;
}

interface ActiveUserRow {
  walletAddress: string;
  eventCount: number;
  messageCount: number;
  dealCount: number;
  lastSeenAt: string | Date | null;
}

interface ActivityRow {
  id: string;
  type: string;
  wallet: string | null;
  dealId: number | null;
  amount: string | number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string | Date;
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundUSDC(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function roundRate(value: number): number {
  return Math.round(value * 100) / 100;
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toDateLabel(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString().slice(0, 10);
}

function normalizeOptionalWallet(wallet: string | null | undefined): string | null {
  if (!wallet) return null;

  try {
    return validateAddress(wallet);
  } catch {
    return null;
  }
}

function feeRateFromStoredPercent(value: unknown): number {
  const fee = toNumber(value);
  if (fee <= 0) return 0;

  return fee > 100 ? fee / 10_000 : fee / 100;
}

function feeAmountForDeal(row: {
  amountA: string | number | null;
  amountB: string | number | null;
  feePercent: string | number | null;
  platformFee?: string | number | null;
}): number {
  const persisted = toNumber(row.platformFee);
  if (persisted > 0) return persisted;

  const total = toNumber(row.amountA) + toNumber(row.amountB);
  return total * feeRateFromStoredPercent(row.feePercent);
}

function getDepositedA(row: UserDealAnalyticsRow): number {
  const deposited = toNumber(row.depositedA);
  if (deposited > 0) return deposited;
  return row.partyADepositComplete ? toNumber(row.amountA) : 0;
}

function getDepositedB(row: UserDealAnalyticsRow): number {
  const deposited = toNumber(row.depositedB);
  if (deposited > 0) return deposited;
  return row.partyBDepositComplete ? toNumber(row.amountB) : 0;
}

function getUserDeposit(row: UserDealAnalyticsRow, wallet: string): number {
  if (wallet === row.partyA.toLowerCase()) return getDepositedA(row);
  if (wallet === row.partyB.toLowerCase()) return getDepositedB(row);
  return 0;
}

function deriveComputedStatus(row: UserDealAnalyticsRow): 'Active' | 'Pending' | 'Disputed' | 'Resolved' | 'Closed' {
  if (row.status === 'Disputed') return 'Disputed';
  if (row.status === 'Resolved') return 'Resolved';
  if (CLOSED_STATUSES.has(row.status)) return 'Closed';

  const partyADeposited = getDepositedA(row) > 0 || row.partyADepositComplete;
  const partyBDeposited = getDepositedB(row) > 0 || row.partyBDepositComplete;
  const isOneSided = row.dealType === 'OneSided';
  const requiredDepositsComplete = isOneSided
    ? partyADeposited
    : partyADeposited && partyBDeposited;

  return requiredDepositsComplete ? 'Active' : 'Pending';
}

function estimatePayouts(row: UserDealAnalyticsRow): { partyA: number; partyB: number; fee: number } {
  const depositedA = getDepositedA(row);
  const depositedB = getDepositedB(row);
  const totalDeposited = depositedA + depositedB || toNumber(row.amountA) + toNumber(row.amountB);
  const fee = Math.min(feeAmountForDeal(row), totalDeposited);
  const distributable = Math.max(totalDeposited - fee, 0);
  const persistedWinnerPayout = toNumber(row.winnerPayout);

  if (row.winner === 'PartyAWins') {
    return { partyA: persistedWinnerPayout || distributable, partyB: 0, fee };
  }

  if (row.winner === 'PartyBWins') {
    return { partyA: 0, partyB: persistedWinnerPayout || distributable, fee };
  }

  if (row.winner === 'Split') {
    const feeRate = feeRateFromStoredPercent(row.feePercent);
    const partyA = depositedA > 0 ? depositedA * (1 - feeRate) : 0;
    return { partyA, partyB: Math.max(distributable - partyA, 0), fee };
  }

  return { partyA: 0, partyB: 0, fee: 0 };
}

function eventToActivity(row: ActivityRow): AdminActivityEvent {
  return {
    id: row.id,
    type: row.type,
    wallet: row.wallet,
    dealId: row.dealId === null || row.dealId === undefined ? null : Number(row.dealId),
    amount: row.amount === null || row.amount === undefined ? null : roundUSDC(toNumber(row.amount)),
    metadata: row.metadata || null,
    createdAt: toIso(row.createdAt) || new Date().toISOString(),
  };
}

function sanitizeRangeDays(value: number | undefined): number {
  if (!Number.isFinite(value)) return 30;
  return Math.min(Math.max(Math.floor(value || 30), 7), 365);
}

function sanitizeLimit(value: number | undefined, fallback = 10): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.floor(value || fallback), 1), 100);
}

export async function logAnalyticsEvent(input: AnalyticsEventInput): Promise<AdminActivityEvent | null> {
  const wallet = normalizeOptionalWallet(input.wallet);
  const dealId = input.dealId ?? null;
  const amount =
    input.amount === null || input.amount === undefined
      ? null
      : roundUSDC(toNumber(input.amount)).toString();

  if (dealId !== null && SINGLE_EVENT_PER_DEAL_TYPES.has(input.type)) {
    const existing = await db.query.analyticsEvents.findFirst({
      where: (event, { and, eq }) =>
        and(eq(event.type, input.type), eq(event.dealId, dealId)),
    });

    if (existing) {
      return eventToActivity({
        id: existing.id,
        type: existing.type,
        wallet: existing.wallet,
        dealId: existing.dealId,
        amount: existing.amount,
        metadata: (existing.metadata as Record<string, unknown> | null) || null,
        createdAt: existing.createdAt,
      });
    }
  }

  const payload: NewAnalyticsEvent = {
    type: input.type,
    wallet,
    dealId,
    amount,
    metadata: input.metadata ?? null,
  };

  const [inserted] = await db.insert(analyticsEvents).values(payload).returning();
  if (!inserted) return null;

  const activity = eventToActivity({
    id: inserted.id,
    type: inserted.type,
    wallet: inserted.wallet,
    dealId: inserted.dealId,
    amount: inserted.amount,
    metadata: (inserted.metadata as Record<string, unknown> | null) || null,
    createdAt: inserted.createdAt,
  });

  emitAdminActivity(activity);
  return activity;
}

export function trackAnalyticsEvent(input: AnalyticsEventInput): void {
  void logAnalyticsEvent(input).catch((error) => {
    console.warn('[Analytics] Event logging failed:', error instanceof Error ? error.message : error);
  });
}

export async function logInviteAccepted(input: {
  walletAddress: string;
  onChainId: number;
  inviteToken?: string;
}): Promise<AdminActivityEvent | null> {
  const wallet = validateAddress(input.walletAddress);

  const deal = await db.query.deals.findFirst({
    where: eq(deals.onChainId, input.onChainId),
  });

  if (!deal) {
    throw new Error('Deal not found');
  }

  if (deal.partyB.toLowerCase() !== wallet) {
    throw new Error('Only the invited counterparty can accept this invite');
  }

  if (input.inviteToken && deal.inviteToken !== input.inviteToken) {
    throw new Error('Invite token does not match this deal');
  }

  const existing = await db.query.analyticsEvents.findFirst({
    where: (event, { and, eq }) =>
      and(
        eq(event.type, 'INVITE_ACCEPTED'),
        eq(event.wallet, wallet),
        eq(event.dealId, input.onChainId),
      ),
  });

  if (existing) {
    return eventToActivity({
      id: existing.id,
      type: existing.type,
      wallet: existing.wallet,
      dealId: existing.dealId,
      amount: existing.amount,
      metadata: (existing.metadata as Record<string, unknown> | null) || null,
      createdAt: existing.createdAt,
    });
  }

  return logAnalyticsEvent({
    type: 'INVITE_ACCEPTED',
    wallet,
    dealId: input.onChainId,
    amount: toNumber(deal.amountA) + toNumber(deal.amountB),
    metadata: {
      dealType: deal.dealType,
      inviteToken: input.inviteToken || null,
    },
  });
}

export async function getUserAnalytics(walletAddress: string): Promise<UserAnalyticsStats> {
  const wallet = validateAddress(walletAddress);

  const gatewayPromise = sql<UserGatewayMetricsRow[]>
    `select
      coalesce(sum(amount::numeric), 0)::text as "personalTransferVolume"
    from gateway_transfers
    where lower(wallet_address) = ${wallet}
      and status in ('deposit_finalized', 'completed')
  `.catch(() => [{ personalTransferVolume: '0' }]);

  const [dealRows, messageRows, unreadRows, gatewayRows] = await Promise.all([
    sql<UserDealAnalyticsRow[]>
      `with wallet_deals as (
        select *
        from deals
        where lower(party_a) = ${wallet}
           or lower(party_b) = ${wallet}
      ),
      deposit_totals as (
        select
          d.on_chain_id,
          coalesce(sum(dep.amount::numeric) filter (where lower(dep.party) = lower(d.party_a)), 0)::text as deposited_a,
          coalesce(sum(dep.amount::numeric) filter (where lower(dep.party) = lower(d.party_b)), 0)::text as deposited_b,
          coalesce(sum(dep.amount::numeric), 0)::text as deposited_total
        from wallet_deals d
        left join deposits dep on dep.on_chain_id = d.on_chain_id
        group by d.on_chain_id
      ),
      dispute_totals as (
        select on_chain_id, count(*)::int as dispute_count
        from disputes
        group by on_chain_id
      )
      select
        d.id::text as "id",
        d.on_chain_id::int as "onChainId",
        d.party_a as "partyA",
        d.party_b as "partyB",
        d.deal_type as "dealType",
        d.status,
        d.amount_a as "amountA",
        d.amount_b as "amountB",
        d.fee_percent as "feePercent",
        d.party_a_deposit_complete as "partyADepositComplete",
        d.party_b_deposit_complete as "partyBDepositComplete",
        d.winner,
        d.winner_payout as "winnerPayout",
        d.platform_fee as "platformFee",
        coalesce(dt.deposited_a, '0') as "depositedA",
        coalesce(dt.deposited_b, '0') as "depositedB",
        coalesce(dt.deposited_total, '0') as "depositedTotal",
        coalesce(dispute_totals.dispute_count, 0)::int as "disputeCount"
      from wallet_deals d
      left join deposit_totals dt on dt.on_chain_id = d.on_chain_id
      left join dispute_totals on dispute_totals.on_chain_id = d.on_chain_id
    `,
    sql<UserMessageMetricsRow[]>
      `select
        count(m.id) filter (
          where m.id is not null
            and m.deleted_at is null
            and m.is_system = false
            and lower(m.sender_address) = ${wallet}
        )::int as "totalMessages",
        count(distinct d.on_chain_id) filter (
          where m.id is not null
            and m.deleted_at is null
            and m.is_system = false
        )::int as "activeConversations"
      from deals d
      left join messages m on m.on_chain_id = d.on_chain_id
      where lower(d.party_a) = ${wallet}
         or lower(d.party_b) = ${wallet}
    `,
    sql<UserUnreadRow[]>
      `select count(m.id)::int as "unreadMessages"
      from deals d
      left join message_reads r
        on r.on_chain_id = d.on_chain_id
       and lower(r.wallet_address) = ${wallet}
      left join messages m
        on m.on_chain_id = d.on_chain_id
       and m.deleted_at is null
       and m.is_system = false
       and lower(m.sender_address) <> ${wallet}
       and (
         r.last_read_at is null
         or m.created_at > r.last_read_at
       )
      where lower(d.party_a) = ${wallet}
         or lower(d.party_b) = ${wallet}
    `,
    gatewayPromise,
  ]);

  let activeDeals = 0;
  let pendingDeals = 0;
  let disputedDeals = 0;
  let resolvedDeals = 0;
  let closedDeals = 0;
  let totalLockedUSDC = 0;
  let totalEarned = 0;
  let totalPaid = 0;
  let totalRefunded = 0;
  let totalFeesPaid = 0;
  let dealsWithDisputes = 0;

  for (const row of dealRows) {
    const status = deriveComputedStatus(row);
    const userDeposit = getUserDeposit(row, wallet);
    const depositedA = getDepositedA(row);
    const depositedB = getDepositedB(row);
    const isPartyA = wallet === row.partyA.toLowerCase();
    const userSide = isPartyA ? 'partyA' : 'partyB';

    if (status === 'Active') activeDeals += 1;
    if (status === 'Pending') pendingDeals += 1;
    if (status === 'Disputed') disputedDeals += 1;
    if (status === 'Resolved') resolvedDeals += 1;
    if (status === 'Closed') closedDeals += 1;
    if (row.disputeCount > 0 || row.status === 'Disputed') dealsWithDisputes += 1;

    if (row.status === 'Active' || row.status === 'Disputed') {
      totalLockedUSDC += userDeposit;
    }

    totalPaid += userDeposit;

    if (CLOSED_STATUSES.has(row.status)) {
      totalRefunded += userDeposit;
    }

    if (row.status === 'Resolved') {
      const payouts = estimatePayouts(row);
      const userPayout = userSide === 'partyA' ? payouts.partyA : payouts.partyB;
      const totalDeposited = depositedA + depositedB;
      const userDepositShare = totalDeposited > 0 ? userDeposit / totalDeposited : 0;
      const userFee =
        row.winner === 'Split'
          ? Math.max(userDeposit - userPayout, 0)
          : userPayout > 0
            ? payouts.fee
            : payouts.fee * userDepositShare;

      totalFeesPaid += userFee;

      if (row.dealType === 'OneSided' && isPartyA && row.winner === 'PartyAWins') {
        totalRefunded += userPayout;
      } else if (row.winner === 'Split') {
        totalRefunded += Math.min(userPayout, userDeposit);
      } else if (userPayout > 0) {
        totalEarned += userPayout;
      }
    }
  }

  const totalDeals = dealRows.length;
  const terminalDeals = resolvedDeals + closedDeals;
  const completedDeals = resolvedDeals;
  const messageMetrics = messageRows[0];
  const unreadMetrics = unreadRows[0];
  const gatewayMetrics = gatewayRows[0];

  const completionRate = totalDeals > 0 ? (resolvedDeals / totalDeals) * 100 : 0;
  const disputeRate = totalDeals > 0 ? (dealsWithDisputes / totalDeals) * 100 : 0;
  const successRate = terminalDeals > 0 ? (resolvedDeals / terminalDeals) * 100 : 0;

  const result: UserAnalyticsStats = {
    totalDeals,
    activeDeals,
    pendingDeals,
    disputedDeals,
    resolvedDeals,
    closedDeals,
    completedDeals,
    totalLockedUSDC: roundUSDC(totalLockedUSDC),
    totalUSDCLocked: roundUSDC(totalLockedUSDC),
    totalEarned: roundUSDC(totalEarned),
    totalPaid: roundUSDC(totalPaid),
    totalRefunded: roundUSDC(totalRefunded),
    totalFeesPaid: roundUSDC(totalFeesPaid),
    totalMessages: Number(messageMetrics?.totalMessages ?? 0),
    unreadMessages: Number(unreadMetrics?.unreadMessages ?? 0),
    activeConversations: Number(messageMetrics?.activeConversations ?? 0),
    completionRate: roundRate(completionRate),
    disputeRate: roundRate(disputeRate),
    successRate: roundRate(successRate),
    dealStatus: {
      total: totalDeals,
      active: activeDeals,
      pending: pendingDeals,
      disputed: disputedDeals,
      resolved: resolvedDeals,
      closed: closedDeals,
    },
    financial: {
      totalLockedUSDC: roundUSDC(totalLockedUSDC),
      personalTransferVolume: roundUSDC(toNumber(gatewayMetrics?.personalTransferVolume)),
      totalEarned: roundUSDC(totalEarned),
      totalPaid: roundUSDC(totalPaid),
      totalRefunded: roundUSDC(totalRefunded),
      totalFeesPaid: roundUSDC(totalFeesPaid),
    },
    engagement: {
      totalMessages: Number(messageMetrics?.totalMessages ?? 0),
      unreadMessages: Number(unreadMetrics?.unreadMessages ?? 0),
      activeConversations: Number(messageMetrics?.activeConversations ?? 0),
      personalDisputes: disputedDeals,
    },
    reputation: {
      completionRate: roundRate(completionRate),
      disputeRate: roundRate(disputeRate),
      successRate: roundRate(successRate),
    },
  };

  return result;
}

async function getAdminMetrics(): Promise<AdminMetricSummary> {
  try {
  const rows = await sql<AdminMetricRow[]>`
    select
      (select count(*)::int from users) as "totalUsers",
      (
        select count(distinct lower(wallet))::int
        from analytics_events
        where wallet is not null
          and created_at >= now() - interval '24 hours'
      ) as "activeUsers24h",
      (
        select count(distinct lower(wallet))::int
        from analytics_events
        where wallet is not null
          and created_at >= now() - interval '7 days'
      ) as "activeUsers7d",
      (
        select count(*)::int
        from users
        where created_at >= now() - interval '24 hours'
      ) as "newUsers24h",
      (
        select count(*)::int
        from users
        where created_at >= now() - interval '7 days'
      ) as "newUsers7d",
      count(d.id)::int as "totalDeals",
      count(d.id) filter (where d.status = 'Active')::int as "activeDeals",
      count(d.id) filter (where d.status = 'Disputed')::int as "disputedDeals",
      count(d.id) filter (where d.status = 'Resolved')::int as "resolvedDeals",
      count(d.id) filter (where d.status in ('Cancelled', 'Expired'))::int as "closedDeals",
      coalesce((select sum(amount::numeric) from deposits), 0)::text as "totalVolume",
      coalesce((select sum(amount::numeric) from gateway_transfers where status in ('deposit_finalized', 'completed')), 0)::text as "totalUnifiedBalanceVolume",
      (
        select count(distinct lower(wallet_address))::int
        from gateway_transfers
        where created_at >= now() - interval '24 hours'
      ) as "dailyActiveWallets",
      (
        select count(*)::int
        from disputes
      ) as "totalDisputes",
      (
        select count(*)::int
        from gateway_transfers
        where status = 'completed'
      ) as "successfulSettlements",
      (
        select count(*)::int
        from gateway_transfers
        where status = 'failed'
      ) as "failedSettlements",
      coalesce(sum(
        case
          when d.status = 'Resolved' then coalesce(
            d.platform_fee::numeric,
            ((d.amount_a::numeric + d.amount_b::numeric) *
              case
                when d.fee_percent::numeric > 100 then d.fee_percent::numeric / 10000
                else d.fee_percent::numeric / 100
              end
            )
          )
          else 0
        end
      ), 0)::text as "totalFees"
    from deals d
  `;

  const metrics = rows[0];
  const transferRows = await sql<ChainMetricRow[]>`
    select
      case source_domain
        when 0 then 'ethereum'
        when 6 then 'base'
        when 26 then 'arc'
        else null
      end as chain,
      coalesce(sum(amount::numeric), 0)::text as amount
    from gateway_transfers
    group by source_domain
  `;

  const depositRows = await sql<ChainMetricRow[]>`
    select
      case source_domain
        when 0 then 'ethereum'
        when 6 then 'base'
        when 26 then 'arc'
        else null
      end as chain,
      coalesce(sum(amount::numeric), 0)::text as amount
    from gateway_transfers
    where status = 'deposit_finalized'
    group by source_domain
  `;

  const transfersPerChain = Object.fromEntries(
    transferRows
      .filter((row) => row.chain)
      .map((row) => [row.chain!, roundUSDC(toNumber(row.amount))]),
  );
  const depositsPerChain = Object.fromEntries(
    depositRows
      .filter((row) => row.chain)
      .map((row) => [row.chain!, roundUSDC(toNumber(row.amount))]),
  );

  return {
    totalUsers: Number(metrics?.totalUsers ?? 0),
    activeUsers24h: Number(metrics?.activeUsers24h ?? 0),
    activeUsers7d: Number(metrics?.activeUsers7d ?? 0),
    newUsers24h: Number(metrics?.newUsers24h ?? 0),
    newUsers7d: Number(metrics?.newUsers7d ?? 0),
    totalDeals: Number(metrics?.totalDeals ?? 0),
    activeDeals: Number(metrics?.activeDeals ?? 0),
    disputedDeals: Number(metrics?.disputedDeals ?? 0),
    resolvedDeals: Number(metrics?.resolvedDeals ?? 0),
    closedDeals: Number(metrics?.closedDeals ?? 0),
    totalVolume: roundUSDC(toNumber(metrics?.totalVolume)),
    totalUnifiedBalanceVolume: roundUSDC(toNumber(metrics?.totalUnifiedBalanceVolume)),
    dailyActiveWallets: Number(metrics?.dailyActiveWallets ?? 0),
    depositsPerChain,
    transfersPerChain,
    totalDisputes: Number(metrics?.totalDisputes ?? 0),
    settlementSuccessRate:
      Number(metrics?.successfulSettlements ?? 0) + Number(metrics?.failedSettlements ?? 0) > 0
        ? roundRate(
            (Number(metrics?.successfulSettlements ?? 0) /
              (Number(metrics?.successfulSettlements ?? 0) + Number(metrics?.failedSettlements ?? 0))) *
              100,
          )
        : 0,
    growthRate:
      Number(metrics?.newUsers7d ?? 0) > 0
        ? roundRate(
            ((Number(metrics?.newUsers24h ?? 0) / Number(metrics?.newUsers7d ?? 0)) - 1) * 100,
          )
        : 0,
    totalFees: roundUSDC(toNumber(metrics?.totalFees)),
  };
  } catch {
    return {
      totalUsers: 0, activeUsers24h: 0, activeUsers7d: 0, newUsers24h: 0, newUsers7d: 0,
      totalDeals: 0, activeDeals: 0, disputedDeals: 0, resolvedDeals: 0, closedDeals: 0,
      totalVolume: 0, totalUnifiedBalanceVolume: 0, dailyActiveWallets: 0,
      depositsPerChain: {}, transfersPerChain: {}, totalDisputes: 0,
      settlementSuccessRate: 0, growthRate: 0, totalFees: 0,
    };
  }
}

async function getUserGrowth(rangeDays: number): Promise<AdminChartPoint[]> {
  const rows = await sql<UserGrowthRow[]>`
    with days as (
      select generate_series(
        current_date - (${rangeDays - 1}::text || ' days')::interval,
        current_date,
        interval '1 day'
      )::date as day
    ),
    daily as (
      select created_at::date as day, count(*)::int as count
      from users
      where created_at >= current_date - (${rangeDays - 1}::text || ' days')::interval
      group by created_at::date
    )
    select
      days.day as date,
      coalesce(daily.count, 0)::int as count,
      sum(coalesce(daily.count, 0)) over (order by days.day)::int as total
    from days
    left join daily on daily.day = days.day
    order by days.day
  `;

  return rows.map((row) => ({
    date: toDateLabel(row.date),
    count: Number(row.count ?? 0),
    total: Number(row.total ?? 0),
  }));
}

async function getDealVolume(rangeDays: number): Promise<AdminChartPoint[]> {
  const rows = await sql<DealVolumeRow[]>`
    with days as (
      select generate_series(
        current_date - (${rangeDays - 1}::text || ' days')::interval,
        current_date,
        interval '1 day'
      )::date as day
    ),
    daily as (
      select
        created_at::date as day,
        count(*)::int as count,
        coalesce(sum(amount_a::numeric + amount_b::numeric), 0)::text as volume
      from deals
      where created_at >= current_date - (${rangeDays - 1}::text || ' days')::interval
      group by created_at::date
    )
    select
      days.day as date,
      coalesce(daily.count, 0)::int as count,
      coalesce(daily.volume, '0') as volume
    from days
    left join daily on daily.day = days.day
    order by days.day
  `;

  return rows.map((row) => ({
    date: toDateLabel(row.date),
    count: Number(row.count ?? 0),
    volume: roundUSDC(toNumber(row.volume)),
  }));
}

async function getRevenue(rangeDays: number): Promise<AdminChartPoint[]> {
  const rows = await sql<RevenueRow[]>`
    with days as (
      select generate_series(
        current_date - (${rangeDays - 1}::text || ' days')::interval,
        current_date,
        interval '1 day'
      )::date as day
    ),
    daily as (
      select
        updated_at::date as day,
        coalesce(sum(coalesce(
          platform_fee::numeric,
          ((amount_a::numeric + amount_b::numeric) *
            case
              when fee_percent::numeric > 100 then fee_percent::numeric / 10000
              else fee_percent::numeric / 100
            end
          )
        )), 0)::text as revenue
      from deals
      where status = 'Resolved'
        and updated_at >= current_date - (${rangeDays - 1}::text || ' days')::interval
      group by updated_at::date
    )
    select
      days.day as date,
      coalesce(daily.revenue, '0') as revenue
    from days
    left join daily on daily.day = days.day
    order by days.day
  `;

  return rows.map((row) => ({
    date: toDateLabel(row.date),
    revenue: roundUSDC(toNumber(row.revenue)),
  }));
}

async function getStatusDistribution(): Promise<AdminStatusDistributionPoint[]> {
  const rows = await sql<StatusDistributionRow[]>`
    select status, count(*)::int as count
    from deals
    group by status
    order by count desc, status asc
  `;

  return rows.map((row) => ({
    status: row.status,
    count: Number(row.count ?? 0),
  }));
}

async function getDisputeFrequency(rangeDays: number): Promise<AdminChartPoint[]> {
  const rows = await sql<UserGrowthRow[]>`
    with days as (
      select generate_series(
        current_date - (${rangeDays - 1}::text || ' days')::interval,
        current_date,
        interval '1 day'
      )::date as day
    ),
    daily as (
      select created_at::date as day, count(*)::int as count
      from disputes
      where created_at >= current_date - (${rangeDays - 1}::text || ' days')::interval
      group by created_at::date
    )
    select
      days.day as date,
      coalesce(daily.count, 0)::int as count,
      sum(coalesce(daily.count, 0)) over (order by days.day)::int as total
    from days
    left join daily on daily.day = days.day
    order by days.day
  `;

  return rows.map((row) => ({
    date: toDateLabel(row.date),
    count: Number(row.count ?? 0),
    total: Number(row.total ?? 0),
  }));
}

async function getRetention(rangeDays: number): Promise<AdminChartPoint[]> {
  const rows = await sql<RetentionRow[]>`
    with days as (
      select generate_series(
        current_date - (${rangeDays - 1}::text || ' days')::interval,
        current_date,
        interval '1 day'
      )::date as day
    ),
    first_seen as (
      select lower(wallet) as wallet, min(created_at::date) as first_day
      from analytics_events
      where wallet is not null
      group by lower(wallet)
    ),
    daily as (
      select
        e.created_at::date as day,
        count(distinct lower(e.wallet))::int as active_users,
        count(distinct lower(e.wallet)) filter (where first_seen.first_day < e.created_at::date)::int as returning_users
      from analytics_events e
      inner join first_seen on first_seen.wallet = lower(e.wallet)
      where e.wallet is not null
        and e.created_at >= current_date - (${rangeDays - 1}::text || ' days')::interval
      group by e.created_at::date
    )
    select
      days.day as date,
      coalesce(daily.active_users, 0)::int as "activeUsers",
      coalesce(daily.returning_users, 0)::int as "returningUsers",
      case
        when coalesce(daily.active_users, 0) = 0 then 0
        else round((daily.returning_users::numeric / daily.active_users::numeric) * 100, 2)
      end::text as "retentionRate"
    from days
    left join daily on daily.day = days.day
    order by days.day
  `;

  return rows.map((row) => ({
    date: toDateLabel(row.date),
    activeUsers: Number(row.activeUsers ?? 0),
    returningUsers: Number(row.returningUsers ?? 0),
    retentionRate: roundRate(toNumber(row.retentionRate)),
  }));
}

async function getRecentUsers(limit: number): Promise<AdminRecentUser[]> {
  const rows = await sql<RecentUserRow[]>`
    select
      u.id::text as id,
      u.wallet_address as "walletAddress",
      u.display_name as "displayName",
      u.email,
      u.created_at as "createdAt",
      count(e.id)::int as "eventCount"
    from users u
    left join analytics_events e on lower(e.wallet) = lower(u.wallet_address)
    group by u.id, u.wallet_address, u.display_name, u.email, u.created_at
    order by u.created_at desc
    limit ${limit}
  `;

  return rows.map((row) => ({
    id: row.id,
    walletAddress: row.walletAddress,
    displayName: row.displayName,
    email: row.email,
    createdAt: toIso(row.createdAt) || new Date().toISOString(),
    eventCount: Number(row.eventCount ?? 0),
  }));
}

function mapDealRow(row: DealTableRow): AdminDealRow {
  return {
    id: row.id,
    onChainId: Number(row.onChainId),
    partyA: row.partyA,
    partyB: row.partyB,
    dealType: row.dealType,
    status: row.status,
    amountUSDC: roundUSDC(toNumber(row.amountUSDC)),
    depositedUSDC: roundUSDC(toNumber(row.depositedUSDC)),
    platformFeeUSDC: roundUSDC(toNumber(row.platformFeeUSDC)),
    createdAt: toIso(row.createdAt) || new Date().toISOString(),
    updatedAt: toIso(row.updatedAt) || new Date().toISOString(),
  };
}

async function getDealRows(limit: number, order: 'recent' | 'highest'): Promise<AdminDealRow[]> {
  const orderSql =
    order === 'highest'
      ? sql`(d.amount_a::numeric + d.amount_b::numeric) desc, d.created_at desc`
      : sql`d.created_at desc`;

  const rows = await sql<DealTableRow[]>`
    with deposit_totals as (
      select on_chain_id, coalesce(sum(amount::numeric), 0)::text as deposited_usdc
      from deposits
      group by on_chain_id
    )
    select
      d.id::text as id,
      d.on_chain_id::int as "onChainId",
      d.party_a as "partyA",
      d.party_b as "partyB",
      d.deal_type as "dealType",
      d.status,
      (d.amount_a::numeric + d.amount_b::numeric)::text as "amountUSDC",
      coalesce(deposit_totals.deposited_usdc, '0') as "depositedUSDC",
      coalesce(d.platform_fee::numeric, 0)::text as "platformFeeUSDC",
      d.created_at as "createdAt",
      d.updated_at as "updatedAt"
    from deals d
    left join deposit_totals on deposit_totals.on_chain_id = d.on_chain_id
    order by ${orderSql}
    limit ${limit}
  `;

  return rows.map(mapDealRow);
}

async function getRecentDisputes(limit: number): Promise<AdminDisputeRow[]> {
  const rows = await sql<DisputeTableRow[]>`
    select
      dis.id::text as id,
      dis.on_chain_id::int as "onChainId",
      dis.raised_by as "raisedBy",
      dis.ruling,
      d.status as "dealStatus",
      coalesce(d.amount_a::numeric + d.amount_b::numeric, 0)::text as "amountUSDC",
      dis.created_at as "createdAt",
      dis.resolved_at as "resolvedAt"
    from disputes dis
    left join deals d on d.on_chain_id = dis.on_chain_id
    order by dis.created_at desc
    limit ${limit}
  `;

  return rows.map((row) => ({
    id: row.id,
    onChainId: Number(row.onChainId),
    raisedBy: row.raisedBy,
    ruling: row.ruling,
    dealStatus: row.dealStatus,
    amountUSDC: roundUSDC(toNumber(row.amountUSDC)),
    createdAt: toIso(row.createdAt) || new Date().toISOString(),
    resolvedAt: toIso(row.resolvedAt),
  }));
}

async function getMostActiveUsers(limit: number): Promise<AdminActiveUserRow[]> {
  const rows = await sql<ActiveUserRow[]>`
    with event_activity as (
      select
        lower(wallet) as wallet,
        count(*)::int as event_count,
        max(created_at) as last_seen_at
      from analytics_events
      where wallet is not null
      group by lower(wallet)
    ),
    message_activity as (
      select lower(sender_address) as wallet, count(*)::int as message_count
      from messages
      where is_system = false
      group by lower(sender_address)
    ),
    deal_activity as (
      select wallet, count(distinct on_chain_id)::int as deal_count
      from (
        select lower(party_a) as wallet, on_chain_id from deals
        union all
        select lower(party_b) as wallet, on_chain_id from deals
      ) parties
      where wallet <> ${ZERO_ADDRESS}
      group by wallet
    )
    select
      coalesce(event_activity.wallet, message_activity.wallet, deal_activity.wallet) as "walletAddress",
      coalesce(event_activity.event_count, 0)::int as "eventCount",
      coalesce(message_activity.message_count, 0)::int as "messageCount",
      coalesce(deal_activity.deal_count, 0)::int as "dealCount",
      event_activity.last_seen_at as "lastSeenAt"
    from event_activity
    full outer join message_activity on message_activity.wallet = event_activity.wallet
    full outer join deal_activity on deal_activity.wallet = coalesce(event_activity.wallet, message_activity.wallet)
    order by
      coalesce(event_activity.event_count, 0) desc,
      coalesce(message_activity.message_count, 0) desc,
      coalesce(deal_activity.deal_count, 0) desc
    limit ${limit}
  `;

  return rows.map((row) => ({
    walletAddress: row.walletAddress,
    eventCount: Number(row.eventCount ?? 0),
    messageCount: Number(row.messageCount ?? 0),
    dealCount: Number(row.dealCount ?? 0),
    lastSeenAt: toIso(row.lastSeenAt),
  }));
}

export async function getAdminActivity(limitInput = 20): Promise<AdminActivityEvent[]> {
  const limit = sanitizeLimit(limitInput, 20);
  const rows = await sql<ActivityRow[]>`
    select
      id::text,
      type,
      wallet,
      deal_id::int as "dealId",
      amount,
      metadata,
      created_at as "createdAt"
    from analytics_events
    order by created_at desc
    limit ${limit}
  `;

  return rows.map(eventToActivity);
}

export async function getAdminAnalyticsOverview(input: {
  rangeDays?: number;
  limit?: number;
} = {}): Promise<AdminAnalyticsOverview> {
  const rangeDays = sanitizeRangeDays(input.rangeDays);
  const limit = sanitizeLimit(input.limit, 10);

  const [
    metrics,
    userGrowth,
    dealVolume,
    revenue,
    dealStatusDistribution,
    disputeFrequency,
    retention,
    recentUsers,
    recentDeals,
    recentDisputes,
    highestValueDeals,
    mostActiveUsers,
    activity,
  ] = await Promise.all([
    getAdminMetrics(),
    getUserGrowth(rangeDays),
    getDealVolume(rangeDays),
    getRevenue(rangeDays),
    getStatusDistribution(),
    getDisputeFrequency(rangeDays),
    getRetention(rangeDays),
    getRecentUsers(limit),
    getDealRows(limit, 'recent'),
    getRecentDisputes(limit),
    getDealRows(limit, 'highest'),
    getMostActiveUsers(limit),
    getAdminActivity(20),
  ]);

  return {
    metrics,
    charts: {
      userGrowth,
      dealVolume,
      revenue,
      dealStatusDistribution,
      disputeFrequency,
      retention,
    },
    tables: {
      recentUsers,
      recentDeals,
      recentDisputes,
      highestValueDeals,
      mostActiveUsers,
    },
    activity,
    generatedAt: new Date().toISOString(),
  };
}

export async function generateAnalyticsSnapshot(): Promise<typeof analyticsSnapshots.$inferSelect> {
  const metrics = await getAdminMetrics();

  const [snapshot] = await db
    .insert(analyticsSnapshots)
    .values({
      totalUsers: metrics.totalUsers,
      activeUsers24h: metrics.activeUsers24h,
      totalDeals: metrics.totalDeals,
      activeDeals: metrics.activeDeals,
      disputedDeals: metrics.disputedDeals,
      resolvedDeals: metrics.resolvedDeals,
      totalVolume: metrics.totalVolume.toString(),
      totalFees: metrics.totalFees.toString(),
    })
    .returning();

  return snapshot;
}

export async function getAnalyticsSnapshots(limitInput = 30): Promise<Array<typeof analyticsSnapshots.$inferSelect>> {
  const limit = sanitizeLimit(limitInput, 30);
  return db
    .select()
    .from(analyticsSnapshots)
    .orderBy(desc(analyticsSnapshots.createdAt))
    .limit(limit);
}
