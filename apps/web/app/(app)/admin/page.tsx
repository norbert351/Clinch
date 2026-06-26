'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users, TrendingUp, DollarSign, Activity,
  FileText, MessageSquare, Scale, Loader2,
  RefreshCw, AlertTriangle, ArrowUpRight,
  BarChart3, Clock, CheckCircle,
} from 'lucide-react';
import { useWallet } from '@/components/wallet-context';
import { getAdminAnalyticsDashboard } from '@/lib/api';
import type { AnalyticsDashboard } from '@/lib/api';
import { formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const ADMIN_WALLETS = [
  '0xBd1e427b1177f82C4255eB24172895A2a17eD686'.toLowerCase(),
  '0xdd4c983Cd57Ee7A6F8Ef0BbB8715B19bdF5C1b61'.toLowerCase(),
];

function formatUSDC(n: number): string {
  if (!n || isNaN(n)) return '0.00';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function MetricCard({
  label, value, sub, icon: Icon, accent = false, className,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className={cn(
      'rounded-xl border bg-clinch-bg-card p-5',
      accent
        ? 'border-clinch-accent/30 bg-clinch-accent-muted/20'
        : 'border-clinch-border-default',
      className,
    )}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-clinch-text-tertiary">
          {label}
        </span>
        <div className={cn(
          'flex h-8 w-8 items-center justify-center rounded-lg',
          accent ? 'bg-clinch-accent-muted' : 'bg-clinch-bg-elevated',
        )}>
          <Icon className={cn(
            'h-4 w-4',
            accent ? 'text-clinch-accent' : 'text-clinch-text-secondary',
          )} />
        </div>
      </div>
      <div className={cn(
        'text-2xl font-bold tabular-nums',
        accent ? 'text-clinch-accent' : 'text-clinch-text-primary',
      )}>
        {value}
      </div>
      {sub && (
        <p className="mt-1 text-xs text-clinch-text-tertiary">{sub}</p>
      )}
    </div>
  );
}

function MiniBarChart({
  data, valueKey, label, color = 'bg-clinch-accent',
}: {
  data: Array<Record<string, unknown>>;
  valueKey: string;
  label: string;
  color?: string;
}) {
  if (!data?.length) return (
    <div className="flex h-24 items-center justify-center">
      <p className="text-xs text-clinch-text-tertiary">No data yet</p>
    </div>
  );

  const max = Math.max(...data.map((d) => Number(d[valueKey]) || 0), 1);

  return (
    <div>
      <p className="mb-2 text-xs text-clinch-text-tertiary">{label}</p>
      <div className="flex h-16 items-end gap-0.5">
        {data.map((d, i) => {
          const val = Number(d[valueKey]) || 0;
          const height = Math.max((val / max) * 100, val > 0 ? 8 : 2);
          return (
            <div
              key={i}
              className="group relative flex-1"
              title={`${String(d.date)}: ${val}`}
            >
              <div
                className={cn(
                  'w-full rounded-sm transition-opacity',
                  color,
                  val === 0 ? 'opacity-10' : 'opacity-80 hover:opacity-100',
                )}
                style={{ height: `${height}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-clinch-text-tertiary">
        <span>{String(data[0]?.date)?.slice(5)}</span>
        <span>{String(data[data.length - 1]?.date)?.slice(5)}</span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    Active:    'bg-clinch-success-muted text-clinch-success',
    Pending:   'bg-amber-500/10 text-amber-400',
    Disputed:  'bg-clinch-warning-muted text-clinch-warning',
    Resolved:  'bg-clinch-accent-muted text-clinch-accent',
    Cancelled: 'bg-clinch-bg-elevated text-clinch-text-tertiary',
    Expired:   'bg-clinch-bg-elevated text-clinch-text-tertiary',
  };
  return (
    <span className={cn(
      'rounded-full px-2 py-0.5 text-[10px] font-medium',
      colors[status] || 'bg-clinch-bg-elevated text-clinch-text-tertiary',
    )}>
      {status}
    </span>
  );
}

function EventIcon({ name }: { name: string }) {
  const icons: Record<string, React.ElementType> = {
    DealCreated:   FileText,
    Deposited:     DollarSign,
    VoteSubmitted: CheckCircle,
    Disputed:      Scale,
    Resolved:      TrendingUp,
    Cancelled:     AlertTriangle,
    Expired:       Clock,
  };
  const Icon = icons[name] || Activity;
  return <Icon className="h-3.5 w-3.5" />;
}

export default function AdminAnalyticsPage() {
  const { address, hasSigned } = useWallet();
  const router = useRouter();
  const [data, setData] = useState<AnalyticsDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = !!address && ADMIN_WALLETS.includes(address.toLowerCase());

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getAdminAnalyticsDashboard();
      if (result) {
        setData(result);
        setLastRefreshed(new Date());
      } else {
        setError('Access denied or data unavailable');
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to load analytics');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!hasSigned || !address) return;
    if (!isAdmin) {
      router.replace('/dashboard');
      return;
    }
    load();
  }, [hasSigned, address, isAdmin]);

  if (!hasSigned || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-clinch-text-tertiary" />
          <p className="text-sm text-clinch-text-secondary">Admin access required</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pb-16 pt-8 md:px-8">
      <div className="mx-auto max-w-7xl">

        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <h1 className="text-h1 text-clinch-text-primary">Analytics</h1>
              <span className="rounded-full bg-clinch-accent-muted px-2 py-0.5 text-xs font-medium text-clinch-accent">
                Admin only
              </span>
            </div>
            <p className="text-sm text-clinch-text-secondary">
              Clinch platform metrics — real data from production DB
            </p>
            {lastRefreshed && (
              <p className="mt-1 text-xs text-clinch-text-tertiary">
                Last refreshed: {formatRelativeTime(lastRefreshed)}
              </p>
            )}
          </div>
          <Button
            onClick={load}
            disabled={isLoading}
            variant="ghost"
            className="gap-2 border border-clinch-border-default"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-32">
            <div className="text-center">
              <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-clinch-accent" />
              <p className="text-sm text-clinch-text-secondary">Loading platform analytics...</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <div className="flex items-center justify-center py-32">
            <div className="text-center">
              <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-clinch-danger" />
              <p className="text-sm text-clinch-text-secondary">{error}</p>
              <Button onClick={load} className="mt-4" size="sm">Retry</Button>
            </div>
          </div>
        )}

        {/* Dashboard */}
        {data && !isLoading && (
          <div className="space-y-8">

            {/* ── SECTION 1: Users ── */}
            <section>
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-clinch-text-tertiary">
                <Users className="h-4 w-4" />
                Users
              </h2>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <MetricCard label="Total Users" value={data.users.total.toLocaleString()} icon={Users} accent />
                <MetricCard label="New Today" value={data.users.newToday} icon={ArrowUpRight} />
                <MetricCard label="New Last 7 Days" value={data.users.new7Days} icon={ArrowUpRight} />
                <MetricCard label="New Last 30 Days" value={data.users.new30Days} icon={ArrowUpRight} />
              </div>
              {data.users.growthChart.length > 0 && (
                <div className="mt-4 rounded-xl border border-clinch-border-default bg-clinch-bg-card p-5">
                  <MiniBarChart
                    data={data.users.growthChart as unknown as Array<Record<string, unknown>>}
                    valueKey="count"
                    label="Daily new users — last 30 days"
                    color="bg-clinch-accent"
                  />
                </div>
              )}
            </section>

            {/* ── SECTION 2: Volume & Revenue ── */}
            <section>
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-clinch-text-tertiary">
                <DollarSign className="h-4 w-4" />
                Volume & Revenue
              </h2>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
                <MetricCard
                  label="Total Volume"
                  value={`$${formatUSDC(data.volume.totalDeposited)}`}
                  sub="USDC deposited all time"
                  icon={TrendingUp}
                  accent
                />
                <MetricCard
                  label="Currently Locked"
                  value={`$${formatUSDC(data.volume.currentlyLocked)}`}
                  sub="In active deals"
                  icon={DollarSign}
                />
                <MetricCard
                  label="Volume (30d)"
                  value={`$${formatUSDC(data.volume.last30Days)}`}
                  sub="Last 30 days"
                  icon={BarChart3}
                />
                <MetricCard
                  label="Total Fees Earned"
                  value={`$${formatUSDC(data.volume.totalFees)}`}
                  sub="2% of resolved volume"
                  icon={DollarSign}
                  accent
                />
                <MetricCard
                  label="Fees This Month"
                  value={`$${formatUSDC(data.volume.feesThisMonth)}`}
                  sub="Current month"
                  icon={TrendingUp}
                />
              </div>
              {data.volume.volumeChart.length > 0 && (
                <div className="mt-4 rounded-xl border border-clinch-border-default bg-clinch-bg-card p-5">
                  <MiniBarChart
                    data={data.volume.volumeChart as unknown as Array<Record<string, unknown>>}
                    valueKey="volume"
                    label="Daily USDC volume — last 30 days"
                    color="bg-emerald-500"
                  />
                </div>
              )}
            </section>

            {/* ── SECTION 3: Deals ── */}
            <section>
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-clinch-text-tertiary">
                <FileText className="h-4 w-4" />
                Deals
              </h2>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <MetricCard label="Total Deals" value={data.deals.total.toLocaleString()} icon={FileText} accent />
                <MetricCard label="Created Today" value={data.deals.today} icon={ArrowUpRight} />
                <MetricCard label="Last 7 Days" value={data.deals.last7Days} icon={ArrowUpRight} />
                <MetricCard label="Last 30 Days" value={data.deals.last30Days} icon={ArrowUpRight} />
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {/* By status */}
                <div className="rounded-xl border border-clinch-border-default bg-clinch-bg-card p-5">
                  <p className="mb-4 text-sm font-medium text-clinch-text-primary">Deals by status</p>
                  <div className="space-y-2.5">
                    {(data.deals.byStatus as Array<{ status: string; count: number }>).map((s) => {
                      const pct = data.deals.total > 0 ? Math.round((s.count / data.deals.total) * 100) : 0;
                      return (
                        <div key={s.status}>
                          <div className="mb-1 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <StatusBadge status={s.status} />
                              <span className="text-xs text-clinch-text-secondary">{s.count} deals</span>
                            </div>
                            <span className="text-xs font-medium text-clinch-text-tertiary">{pct}%</span>
                          </div>
                          <div className="h-1 overflow-hidden rounded-full bg-clinch-bg-elevated">
                            <div
                              className="h-full rounded-full bg-clinch-accent opacity-60"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* By type + chart */}
                <div className="rounded-xl border border-clinch-border-default bg-clinch-bg-card p-5">
                  <p className="mb-4 text-sm font-medium text-clinch-text-primary">Deal types</p>
                  <div className="mb-4 space-y-2">
                    {(data.deals.byType as Array<{ deal_type: string; count: number }>).map((t) => {
                      const pct = data.deals.total > 0 ? Math.round((t.count / data.deals.total) * 100) : 0;
                      return (
                        <div key={t.deal_type} className="flex items-center justify-between">
                          <span className="text-sm text-clinch-text-secondary">
                            {t.deal_type === 'MutualStake' ? 'Mutual Stake' : 'One-Sided Escrow'}
                          </span>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-clinch-text-primary">{t.count}</span>
                            <span className="w-8 text-right text-xs text-clinch-text-tertiary">{pct}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {data.deals.growthChart.length > 0 && (
                    <MiniBarChart
                      data={data.deals.growthChart as unknown as Array<Record<string, unknown>>}
                      valueKey="count"
                      label="Daily new deals — last 30 days"
                      color="bg-clinch-accent"
                    />
                  )}
                </div>
              </div>
            </section>

            {/* ── SECTION 4: Platform Activity ── */}
            <section>
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-clinch-text-tertiary">
                <Activity className="h-4 w-4" />
                Platform Activity
              </h2>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <MetricCard label="Total Deposits" value={data.activity.totalDeposits.toLocaleString()} icon={DollarSign} />
                <MetricCard label="Total Votes" value={data.activity.totalVotes.toLocaleString()} icon={CheckCircle} />
                <MetricCard label="Disputes Raised" value={data.activity.totalDisputes} icon={Scale} />
                <MetricCard
                  label="Resolution Rate"
                  value={`${data.activity.disputeResolutionRate}%`}
                  sub={`${data.activity.resolvedDisputes} of ${data.activity.totalDisputes} resolved`}
                  icon={CheckCircle}
                  accent={data.activity.disputeResolutionRate > 50}
                />
                <MetricCard
                  label="Avg Deal Lifetime"
                  value={`${data.activity.avgDealLifetimeDays}d`}
                  sub="Create → resolve"
                  icon={Clock}
                />
                <MetricCard label="Messages Sent" value={data.activity.totalMessages.toLocaleString()} icon={MessageSquare} />
              </div>

              {/* Most active deals */}
              {data.activity.mostActiveDeals.length > 0 && (
                <div className="mt-4 rounded-xl border border-clinch-border-default bg-clinch-bg-card p-5">
                  <p className="mb-4 text-sm font-medium text-clinch-text-primary">Most active deals (by messages)</p>
                  <div className="space-y-2">
                    {(data.activity.mostActiveDeals as Array<{
                      on_chain_id: number; title: string | null; status: string; message_count: number;
                    }>).map((d, i) => (
                      <div key={d.on_chain_id} className="flex items-center justify-between rounded-lg bg-clinch-bg-elevated px-3 py-2">
                        <div className="flex items-center gap-3">
                          <span className="w-5 text-center text-xs font-bold text-clinch-text-tertiary">{i + 1}</span>
                          <div>
                            <p className="text-sm font-medium text-clinch-text-primary">{d.title || `Deal #${d.on_chain_id}`}</p>
                            <p className="text-xs text-clinch-text-tertiary">#{d.on_chain_id}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <StatusBadge status={d.status} />
                          <span className="flex items-center gap-1 text-xs text-clinch-text-secondary">
                            <MessageSquare className="h-3 w-3" />
                            {d.message_count}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* ── SECTION 5: Recent Events Feed ── */}
            <section>
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-clinch-text-tertiary">
                <Activity className="h-4 w-4" />
                Live Event Feed
                <span className="rounded-full bg-clinch-bg-elevated px-2 py-0.5 text-[10px] text-clinch-text-tertiary">
                  last 20 on-chain events
                </span>
              </h2>
              <div className="rounded-xl border border-clinch-border-default bg-clinch-bg-card">
                {data.recentEvents.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-sm text-clinch-text-tertiary">No on-chain events recorded yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-clinch-border-default">
                    {data.recentEvents.map((event) => (
                      <div key={event.id} className="flex items-center gap-4 px-5 py-3 hover:bg-clinch-bg-elevated transition-colors">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-clinch-bg-elevated text-clinch-text-secondary">
                          <EventIcon name={event.eventName} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-clinch-text-primary">{event.eventName}</span>
                            <span className="text-xs text-clinch-text-tertiary">Deal #{event.onChainId}</span>
                          </div>
                          <p className="truncate font-mono text-[10px] text-clinch-text-tertiary">{event.txHash}</p>
                        </div>
                        <span className="shrink-0 text-xs text-clinch-text-tertiary">
                          {formatRelativeTime(new Date(event.createdAt))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Footer */}
            <div className="border-t border-clinch-border-default pt-4 text-center">
              <p className="text-xs text-clinch-text-tertiary">
                Data generated at {new Date(data.generatedAt).toLocaleString()} ·
                Admin-only view · {address?.slice(0, 6)}...{address?.slice(-4)}
              </p>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
