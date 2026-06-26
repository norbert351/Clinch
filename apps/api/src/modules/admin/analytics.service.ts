import { db, sql as pgSql } from '../../config/db';
import {
  users, deals, deposits, votes, disputes,
  messages, contractEvents,
} from '../../db/schema';
import { eq, gte, desc, sql } from 'drizzle-orm';

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getAnalyticsDashboard() {
  const now = new Date();
  const today = startOfToday();
  const day7 = daysAgo(7);
  const day30 = daysAgo(30);

  // ── USER METRICS ──

  const [totalUsersResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users);

  const [newTodayResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(gte(users.createdAt, today));

  const [new7Result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(gte(users.createdAt, day7));

  const [new30Result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(gte(users.createdAt, day30));

  const userGrowthRaw = await pgSql`
    SELECT
      DATE(created_at) as date,
      COUNT(*)::int as count
    FROM users
    WHERE created_at >= ${day30}
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `;

  // ── DEAL METRICS ──

  const [totalDealsResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(deals);

  const [dealsTodayResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(deals)
    .where(gte(deals.createdAt, today));

  const [deals7Result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(deals)
    .where(gte(deals.createdAt, day7));

  const [deals30Result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(deals)
    .where(gte(deals.createdAt, day30));

  const dealsByStatus = await pgSql`
    SELECT status, COUNT(*)::int as count
    FROM deals
    GROUP BY status
    ORDER BY count DESC
  `;

  const dealsByType = await pgSql`
    SELECT deal_type, COUNT(*)::int as count
    FROM deals
    GROUP BY deal_type
  `;

  const dealGrowthRaw = await pgSql`
    SELECT
      DATE(created_at) as date,
      COUNT(*)::int as count
    FROM deals
    WHERE created_at >= ${day30}
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `;

  // ── VOLUME & REVENUE ──

  const volumeRaw = await pgSql`
    SELECT COALESCE(SUM(amount::numeric), 0)::float as total
    FROM deposits
  `;

  const volume30Raw = await pgSql`
    SELECT COALESCE(SUM(amount::numeric), 0)::float as total
    FROM deposits
    WHERE deposited_at >= ${day30}
  `;

  const lockedRaw = await pgSql`
    SELECT
      COALESCE(SUM(dep.amount::numeric), 0)::float as locked
    FROM deposits dep
    INNER JOIN deals d ON d.on_chain_id = dep.on_chain_id
    WHERE d.status IN ('Active', 'Disputed')
  `;

  const feesRaw = await pgSql`
    SELECT
      COALESCE(
        SUM(
          (SELECT COALESCE(SUM(dep.amount::numeric), 0)
           FROM deposits dep
           WHERE dep.on_chain_id = d.on_chain_id)
          * (d.fee_percent::numeric / 100)
        ), 0
      )::float as total_fees
    FROM deals d
    WHERE d.status = 'Resolved'
  `;

  const feesMonthRaw = await pgSql`
    SELECT
      COALESCE(
        SUM(
          (SELECT COALESCE(SUM(dep.amount::numeric), 0)
           FROM deposits dep
           WHERE dep.on_chain_id = d.on_chain_id)
          * (d.fee_percent::numeric / 100)
        ), 0
      )::float as fees_month
    FROM deals d
    WHERE d.status = 'Resolved'
      AND d.updated_at >= DATE_TRUNC('month', NOW())
  `;

  const volumeChartRaw = await pgSql`
    SELECT
      DATE(deposited_at) as date,
      COALESCE(SUM(amount::numeric), 0)::float as volume
    FROM deposits
    WHERE deposited_at >= ${day30}
    GROUP BY DATE(deposited_at)
    ORDER BY date ASC
  `;

  // ── ACTIVITY METRICS ──

  const [totalDepositsResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(deposits);

  const [totalVotesResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(votes);

  const [totalDisputesResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(disputes);

  const resolvedDisputesResult = await pgSql`
    SELECT COUNT(*)::int as count
    FROM disputes
    WHERE ruling IS NOT NULL
  `;

  const [totalMessagesResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages);

  const avgLifetimeRaw = await pgSql`
    SELECT
      COALESCE(
        AVG(
          EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400
        ), 0
      )::float as avg_days
    FROM deals
    WHERE status = 'Resolved'
  `;

  const activeDealsRaw = await pgSql`
    SELECT
      m.on_chain_id,
      d.title,
      d.status,
      COUNT(m.id)::int as message_count
    FROM messages m
    LEFT JOIN deals d ON d.on_chain_id = m.on_chain_id
    WHERE m.is_system = false
    GROUP BY m.on_chain_id, d.title, d.status
    ORDER BY message_count DESC
    LIMIT 5
  `;

  // ── RECENT EVENTS ──
  // contractEvents uses indexedAt, not createdAt

  const recentEvents = await db
    .select()
    .from(contractEvents)
    .orderBy(desc(contractEvents.indexedAt))
    .limit(20);

  // ── ASSEMBLE ──

  const totalDealsVal = totalDealsResult?.count ?? 0;
  const totalDisputes = totalDisputesResult?.count ?? 0;
  const resolvedDisputes = (resolvedDisputesResult as any)?.[0]?.count ?? 0;

  return {
    users: {
      total: totalUsersResult?.count ?? 0,
      newToday: newTodayResult?.count ?? 0,
      new7Days: new7Result?.count ?? 0,
      new30Days: new30Result?.count ?? 0,
      growthChart: userGrowthRaw ?? [],
    },
    deals: {
      total: totalDealsVal,
      today: dealsTodayResult?.count ?? 0,
      last7Days: deals7Result?.count ?? 0,
      last30Days: deals30Result?.count ?? 0,
      byStatus: dealsByStatus ?? [],
      byType: dealsByType ?? [],
      growthChart: dealGrowthRaw ?? [],
    },
    volume: {
      totalDeposited: (volumeRaw as any)?.[0]?.total ?? 0,
      last30Days: (volume30Raw as any)?.[0]?.total ?? 0,
      currentlyLocked: (lockedRaw as any)?.[0]?.locked ?? 0,
      totalFees: (feesRaw as any)?.[0]?.total_fees ?? 0,
      feesThisMonth: (feesMonthRaw as any)?.[0]?.fees_month ?? 0,
      volumeChart: volumeChartRaw ?? [],
    },
    activity: {
      totalDeposits: totalDepositsResult?.count ?? 0,
      totalVotes: totalVotesResult?.count ?? 0,
      totalDisputes,
      resolvedDisputes,
      disputeResolutionRate: totalDisputes > 0
        ? Math.round((resolvedDisputes / totalDisputes) * 100)
        : 0,
      avgDealLifetimeDays: parseFloat(
        ((avgLifetimeRaw as any)?.[0]?.avg_days ?? 0).toFixed(1),
      ),
      totalMessages: totalMessagesResult?.count ?? 0,
      mostActiveDeals: activeDealsRaw ?? [],
    },
    recentEvents: recentEvents.map((e) => ({
      id: e.id,
      eventName: e.eventName,
      onChainId: e.onChainId,
      txHash: e.txHash,
      blockNumber: e.blockNumber,
      rawPayload: e.rawPayload,
      createdAt: e.indexedAt,
    })),
    generatedAt: now.toISOString(),
  };
}

export type AnalyticsDashboard = Awaited<ReturnType<typeof getAnalyticsDashboard>>;
