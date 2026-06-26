import { sql } from '../../config/db';

const RECENT_SETTLEMENT_DAYS = 7;

export interface PublicMetrics {
  totalDeals: number;
  activeDeals: number;
  disputedDeals: number;
  resolvedDeals: number;
  totalEscrowedUSDC: number;
  avgSettlementTime: number | null;
  recentSettlementCount: number;
  recentSettlementWindowDays: number;
}

export interface PublicActivityItem {
  onChainId: number;
  agreementLabel: string;
  status: string;
  settlementState: string;
  amountUSDC: number;
  depositedUSDC: number;
  dealType: string;
  createdAt: string;
  updatedAt: string;
}

interface MetricsRow {
  totalDeals: number;
  activeDeals: number;
  disputedDeals: number;
  resolvedDeals: number;
  avgSettlementTime: number | null;
  recentSettlementCount: number;
}

interface EscrowRow {
  totalEscrowedUSDC: string | number | null;
}

interface ActivityRow {
  onChainId: number;
  dealType: string;
  status: string;
  amountA: string | number | null;
  amountB: string | number | null;
  partyADepositComplete: boolean;
  partyBDepositComplete: boolean;
  depositedUSDC: string | number | null;
  voteCount: number | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

function toNumber(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundUSDC(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isFunded(row: ActivityRow): boolean {
  const isOneSided = row.dealType === 'OneSided';
  return isOneSided
    ? row.partyADepositComplete || toNumber(row.depositedUSDC) > 0
    : row.partyADepositComplete && row.partyBDepositComplete;
}

function derivePublicStatus(row: ActivityRow): string {
  if (row.status === 'Resolved') return 'Resolved';
  if (row.status === 'Disputed') return 'Disputed';
  if (row.status === 'Cancelled' || row.status === 'Expired') return 'Closed';
  if (row.status === 'Active' && (row.voteCount ?? 0) > 0) return 'In Review';
  if (row.status === 'Active' && !isFunded(row)) return 'Awaiting Deposit';
  return row.status;
}

function deriveSettlementState(row: ActivityRow, publicStatus: string): string {
  if (publicStatus === 'Resolved') return 'Settled';
  if (publicStatus === 'Disputed') return 'Dispute coordination';
  if (publicStatus === 'Closed') return 'Closed';
  if (publicStatus === 'In Review') return 'Outcome review';
  if (publicStatus === 'Awaiting Deposit') return 'Funding';
  return 'Escrow funded';
}

function formatDealType(dealType: string): string {
  if (dealType === 'MutualStake') return 'Mutual stake';
  if (dealType === 'OneSided') return 'One-sided';
  return dealType;
}

export async function getPublicMetrics(): Promise<PublicMetrics> {
  const [metricsRows, escrowRows] = await Promise.all([
    sql<MetricsRow[]>`
      select
        count(*)::int as "totalDeals",
        count(*) filter (where status = 'Active')::int as "activeDeals",
        count(*) filter (where status = 'Disputed')::int as "disputedDeals",
        count(*) filter (where status = 'Resolved')::int as "resolvedDeals",
        round(avg(extract(epoch from (updated_at - created_at))) filter (where status = 'Resolved'))::int as "avgSettlementTime",
        count(*) filter (
          where status = 'Resolved'
            and updated_at >= now() - (${RECENT_SETTLEMENT_DAYS}::text || ' days')::interval
        )::int as "recentSettlementCount"
      from deals
    `,
    sql<EscrowRow[]>`
      select
        coalesce(sum(dep.amount::numeric), 0)::text as "totalEscrowedUSDC"
      from deposits dep
      inner join deals d on d.on_chain_id = dep.on_chain_id
      where d.status in ('Active', 'Disputed')
    `,
  ]);

  const metrics = metricsRows[0];
  const escrow = escrowRows[0];

  return {
    totalDeals: Number(metrics?.totalDeals ?? 0),
    activeDeals: Number(metrics?.activeDeals ?? 0),
    disputedDeals: Number(metrics?.disputedDeals ?? 0),
    resolvedDeals: Number(metrics?.resolvedDeals ?? 0),
    totalEscrowedUSDC: roundUSDC(toNumber(escrow?.totalEscrowedUSDC)),
    avgSettlementTime:
      metrics?.avgSettlementTime === null || metrics?.avgSettlementTime === undefined
        ? null
        : Number(metrics.avgSettlementTime),
    recentSettlementCount: Number(metrics?.recentSettlementCount ?? 0),
    recentSettlementWindowDays: RECENT_SETTLEMENT_DAYS,
  };
}

export async function getPublicActivity(limit = 8): Promise<PublicActivityItem[]> {
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 50);

  const rows = await sql<ActivityRow[]>`
    with deposit_totals as (
      select
        on_chain_id,
        coalesce(sum(amount::numeric), 0)::text as deposited_usdc
      from deposits
      group by on_chain_id
    ),
    vote_totals as (
      select
        on_chain_id,
        count(*)::int as vote_count
      from votes
      group by on_chain_id
    )
    select
      d.on_chain_id as "onChainId",
      d.deal_type as "dealType",
      d.status as "status",
      d.amount_a as "amountA",
      d.amount_b as "amountB",
      d.party_a_deposit_complete as "partyADepositComplete",
      d.party_b_deposit_complete as "partyBDepositComplete",
      coalesce(dep.deposited_usdc, '0') as "depositedUSDC",
      coalesce(v.vote_count, 0)::int as "voteCount",
      d.created_at as "createdAt",
      d.updated_at as "updatedAt"
    from deals d
    left join deposit_totals dep on dep.on_chain_id = d.on_chain_id
    left join vote_totals v on v.on_chain_id = d.on_chain_id
    order by d.updated_at desc, d.created_at desc
    limit ${safeLimit}
  `;

  return rows.map((row) => {
    const status = derivePublicStatus(row);
    const amountUSDC = toNumber(row.amountA) + toNumber(row.amountB);

    return {
      onChainId: row.onChainId,
      agreementLabel: `Agreement #${row.onChainId}`,
      status,
      settlementState: deriveSettlementState(row, status),
      amountUSDC: roundUSDC(amountUSDC),
      depositedUSDC: roundUSDC(toNumber(row.depositedUSDC)),
      dealType: formatDealType(row.dealType),
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    };
  });
}
