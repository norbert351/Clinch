'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  FileText,
  Filter,
  ListFilter,
  LockKeyhole,
  Plus,
  Search,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { io } from 'socket.io-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DealCard,
  DealCardSkeleton,
  EmptyState,
  GatewayFundingModal,
  StatCardSkeleton,
} from '@/components/clinch';
import { AgentWalletCard } from '@/components/agent/agent-wallet-card';
import { useWallet } from '@/components/wallet-context';
import { useDeals, useRefreshDeals } from '@/hooks/useDeals';
import { useUnifiedBalance } from '@/hooks/useUnifiedBalance';
import { useMyAnalytics } from '@/hooks/useAnalytics';
import { API_URL, getToken, getUnreadCounts } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Deal, DealWithDeposits, UserAnalyticsStats } from '@/lib/types';

type TabFilter = 'all' | 'Pending' | 'Active' | 'Disputed' | 'Resolved' | 'Closed';
type DashboardDealCardStatus =
  | 'active'
  | 'pending'
  | 'disputed'
  | 'resolved'
  | 'closed'
  | 'cancelled'
  | 'expired';

const tabs: { value: TabFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'Pending', label: 'Pending' },
  { value: 'Active', label: 'Active' },
  { value: 'Disputed', label: 'Disputed' },
  { value: 'Resolved', label: 'Resolved' },
  { value: 'Closed', label: 'Closed' },
];

const chainConfig = [
  { name: 'Arc Testnet', key: 'ARC-TESTNET', color: '#00D4FF', chainId: 5042002 },
  { name: 'Base Sepolia', key: 'BASE-SEPOLIA', color: '#0052FF', chainId: 84532 },
  { name: 'Eth Sepolia', key: 'ETH-SEPOLIA', color: '#627EEA', chainId: 11155111 },
] as const;

function getDisplayStatus(deal: Deal): string {
  const dwd = deal as DealWithDeposits;

  if (dwd.computedStatus) return dwd.computedStatus;

  if (deal.status === 'Active') {
    const isOneSided = deal.dealType === 'OneSided';
    if (isOneSided) {
      if (!Boolean(dwd.partyADeposited)) return 'Pending';
      return 'Active';
    }
    if (!Boolean(dwd.partyADeposited) || !Boolean(dwd.partyBDeposited)) {
      return 'Pending';
    }
    return 'Active';
  }

  if (deal.status === 'Cancelled' || deal.status === 'Expired') return 'Closed';
  return deal.status;
}

function agreementAmount(deal: Deal): number {
  return (parseFloat(deal.amountA) || 0) + (parseFloat(deal.amountB) || 0);
}

function toCardStatus(status: string): DashboardDealCardStatus {
  const normalized = status.toLowerCase();
  if (
    normalized === 'active' ||
    normalized === 'pending' ||
    normalized === 'disputed' ||
    normalized === 'resolved' ||
    normalized === 'closed' ||
    normalized === 'cancelled' ||
    normalized === 'expired'
  ) {
    return normalized;
  }

  return 'pending';
}

function formatAmount(value: number | null | undefined): string {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return numeric.toFixed(2);
}

function emptyAnalytics(): UserAnalyticsStats {
  return {
    totalDeals: 0,
    activeDeals: 0,
    pendingDeals: 0,
    disputedDeals: 0,
    resolvedDeals: 0,
    closedDeals: 0,
    completedDeals: 0,
    totalLockedUSDC: 0,
    totalUSDCLocked: 0,
    totalEarned: 0,
    totalPaid: 0,
    totalRefunded: 0,
    totalFeesPaid: 0,
    totalMessages: 0,
    unreadMessages: 0,
    activeConversations: 0,
    completionRate: 0,
    disputeRate: 0,
    successRate: 0,
    dealStatus: {
      total: 0,
      active: 0,
      pending: 0,
      disputed: 0,
      resolved: 0,
      closed: 0,
    },
    financial: {
      totalLockedUSDC: 0,
      totalEarned: 0,
      totalPaid: 0,
      totalRefunded: 0,
      totalFeesPaid: 0,
    },
    engagement: {
      totalMessages: 0,
      unreadMessages: 0,
      activeConversations: 0,
    },
    reputation: {
      completionRate: 0,
      disputeRate: 0,
      successRate: 0,
    },
  };
}

function PrimaryStatCard({
  label,
  value,
  subLabel,
  borderColor,
  onClick,
  actionRequired,
}: {
  label: string;
  value: string | number;
  subLabel: string;
  borderColor: string;
  onClick?: () => void;
  actionRequired?: boolean;
}) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (onClick && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onClick();
        }
      }}
      className={cn(
        'border border-[var(--border-subtle)] border-t-2 bg-[var(--bg-surface)] p-6',
        'transition-colors hover:bg-[var(--bg-elevated)]',
        onClick && 'cursor-pointer',
        actionRequired && 'hover:border-[var(--status-dispute)]',
      )}
      style={{ borderTopColor: borderColor }}
    >
      <p className="mb-3 font-sans text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
        {label}
      </p>
      <p className="mb-1.5 font-mono text-[34px] leading-none tracking-tight text-[var(--text-primary)]">
        {value}
      </p>
      <p className="font-sans text-[12px] text-[var(--text-secondary)]">
        {subLabel}
      </p>
      {actionRequired && (
        <div className="mt-2 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-dispute)] animate-pulse" />
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--status-dispute)]">
            Action required
          </span>
        </div>
      )}
    </div>
  );
}

function SecondaryStatCard({
  label,
  value,
  subLabel,
  borderColor,
}: {
  label: string;
  value: string;
  subLabel: string;
  borderColor: string;
}) {
  return (
    <div
      className="border border-[var(--border-subtle)] border-t-2 bg-[var(--bg-surface)] px-5 py-4 transition-colors hover:bg-[var(--bg-elevated)]"
      style={{ borderTopColor: borderColor }}
    >
      <p className="mb-2 font-sans text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
        {label}
      </p>
      <p className="mb-1 font-mono text-[20px] leading-none text-[var(--text-primary)]">
        {value}
        <span className="ml-1 text-[12px] text-[var(--text-secondary)]">USDC</span>
      </p>
      <p className="font-sans text-[11px] text-[var(--text-secondary)]">
        {subLabel}
      </p>
    </div>
  );
}

function BalanceCard({
  isConnected,
  isLoading,
  balance,
  onFund,
}: {
  isConnected: boolean;
  isLoading: boolean;
  balance: ReturnType<typeof useUnifiedBalance>['data'];
  onFund: () => void;
}) {
  const rows = chainConfig.map((chain) => {
    const match = balance?.chains.find(
      (item) => item.key === chain.key || item.chainName === chain.name,
    );
    return {
      ...chain,
      balance: match?.balance ?? 0,
    };
  });
  const allZero = rows.every((row) => !row.balance || row.balance <= 0);

  return (
    <section className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="font-sans text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
          USDC Balance
        </p>
        <span className="border border-[var(--accent-cyan-dim)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--accent-cyan)]">
          Circle Gateway
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
        <div>
          <p className="font-mono text-[40px] leading-none text-[var(--text-primary)]">
            {formatAmount(balance?.totalBalance)}
            <span className="ml-2 text-[16px] text-[var(--text-secondary)]">USDC</span>
          </p>
          <p className="mt-2 font-sans text-[12px] text-[var(--text-secondary)]">
            Available across supported testnet chains
          </p>
          <button
            type="button"
            onClick={onFund}
            disabled={!isConnected}
            className="btn-sharp mt-5 inline-flex items-center gap-2 bg-[var(--accent-blue)] px-4 py-2 font-sans text-[13px] font-medium text-white transition-colors hover:bg-[var(--accent-cyan)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Fund Balance
          </button>
        </div>

        <div>
          {!isConnected ? (
            <p className="border border-dashed border-[var(--border-default)] bg-[var(--bg-void)] p-4 font-sans text-[13px] leading-6 text-[var(--text-secondary)]">
              Connect your wallet to see USDC balances across Arc Testnet, Base Sepolia, and Ethereum Sepolia.
            </p>
          ) : isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-9 animate-pulse bg-[var(--bg-elevated)]" />
              ))}
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {rows.map((chain) => (
                  <div
                    key={chain.chainId}
                    className="flex items-center justify-between border-b border-[var(--border-subtle)] py-2 last:border-0"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: chain.color }}
                      />
                      <span className="font-sans text-[13px] text-[var(--text-secondary)]">
                        {chain.name}
                      </span>
                    </div>
                    <span className="font-mono text-[13px] text-[var(--text-primary)]">
                      {formatAmount(chain.balance)}
                      <span className="ml-1 text-[11px] text-[var(--text-tertiary)]">USDC</span>
                    </span>
                  </div>
                ))}
              </div>
              {allZero && (
                <div className="mt-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-tertiary)]">
                    No USDC found on testnet chains
                  </p>
                  <a
                    href="https://faucet.arc.network"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex font-sans text-[12px] text-[var(--accent-cyan)] hover:underline"
                  >
                    Get testnet USDC →
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'recent' | 'amount' | 'status'>('recent');
  const [showFundingModal, setShowFundingModal] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({});
  const { address, hasSigned } = useWallet();
  const walletAddress = address?.toLowerCase();
  const canLoadWalletData = mounted && Boolean(walletAddress) && hasSigned;
  const { data, isLoading, error, refetch } = useDeals(
    1,
    80,
    undefined,
    canLoadWalletData ? walletAddress : null,
  );
  const { data: unifiedBalance, isLoading: isBalanceLoading } = useUnifiedBalance(
    canLoadWalletData,
    walletAddress,
  );
  const {
    data: userAnalytics,
    isLoading: isAnalyticsLoading,
    refetch: refetchAnalytics,
  } = useMyAnalytics(canLoadWalletData);
  const refreshDeals = useRefreshDeals();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!canLoadWalletData) {
      setUnreadCounts({});
      return;
    }
    void getUnreadCounts().then(setUnreadCounts).catch(() => {});
  }, [canLoadWalletData, walletAddress]);

  useEffect(() => {
    if (!mounted || !hasSigned || !address) return;
    const token = getToken();
    if (!token) return;

    const socket = io(API_URL, {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      auth: { token },
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      socket.emit('join-user', { address });
    });

    const refreshWalletStats = () => {
      void refetchAnalytics();
    };

    socket.on('deal:update', () => {
      refreshDeals();
      refreshWalletStats();
    });
    socket.on('deal:new', () => {
      refreshDeals();
      refreshWalletStats();
    });
    socket.on('notification:new', () => {
      refreshDeals();
      void getUnreadCounts().then(setUnreadCounts).catch(() => {});
      refreshWalletStats();
    });
    socket.on('messages:unread-updated', () => {
      void getUnreadCounts().then(setUnreadCounts).catch(() => {});
    });

    void getUnreadCounts().then(setUnreadCounts).catch(() => {});

    return () => {
      socket.disconnect();
    };
  }, [mounted, hasSigned, address, refreshDeals, refetchAnalytics]);

  useEffect(() => {
    if (!canLoadWalletData) return;
    const interval = setInterval(() => {
      void refetch();
      if (walletAddress) {
        void refetchAnalytics();
      }
    }, 15_000);
    return () => clearInterval(interval);
  }, [canLoadWalletData, refetch, refetchAnalytics, walletAddress]);

  const deals = canLoadWalletData ? data?.items || [] : [];

  const filteredDeals = useMemo(() => {
    const matchesSearch = (deal: Deal) => {
      if (!search.trim()) return true;
      const haystack = [
        deal.title,
        deal.description,
        deal.partyA,
        deal.partyB,
        String(deal.onChainId),
        getDisplayStatus(deal),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(search.toLowerCase());
    };

    const filtered = deals.filter((deal) => {
      if (!matchesSearch(deal)) return false;
      const status = getDisplayStatus(deal);
      if (activeTab === 'all') return true;
      if (activeTab === 'Closed') return status === 'Closed';
      return status === activeTab;
    });

    return filtered.sort((a, b) => {
      if (sort === 'amount') return agreementAmount(b) - agreementAmount(a);
      if (sort === 'status') return getDisplayStatus(a).localeCompare(getDisplayStatus(b));
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [deals, activeTab, search, sort]);

  const tabCounts = useMemo(() => {
    return {
      all: deals.length,
      Pending: deals.filter((d) => getDisplayStatus(d) === 'Pending').length,
      Active: deals.filter((d) => getDisplayStatus(d) === 'Active').length,
      Disputed: deals.filter((d) => getDisplayStatus(d) === 'Disputed').length,
      Resolved: deals.filter((d) => getDisplayStatus(d) === 'Resolved').length,
      Closed: deals.filter((d) => getDisplayStatus(d) === 'Closed').length,
    };
  }, [deals]);

  const analytics = userAnalytics || emptyAnalytics();
  const stats = {
    totalDeals: userAnalytics?.totalDeals ?? deals.length,
    activeDeals: userAnalytics?.activeDeals ?? tabCounts.Active,
    disputedDeals: userAnalytics?.disputedDeals ?? tabCounts.Disputed,
    totalLocked: analytics.financial?.totalLockedUSDC ?? analytics.totalLockedUSDC ?? analytics.totalUSDCLocked ?? 0,
    totalEarned: analytics.financial?.totalEarned ?? analytics.totalEarned ?? 0,
    totalPaid: analytics.financial?.totalPaid ?? analytics.totalPaid ?? 0,
    totalRefunded: analytics.financial?.totalRefunded ?? analytics.totalRefunded ?? 0,
    totalFees: analytics.financial?.totalFeesPaid ?? analytics.totalFeesPaid ?? 0,
  };

  const dashboardLoading = !mounted || (canLoadWalletData && isLoading);
  const statsLoading = !mounted || (canLoadWalletData && isAnalyticsLoading);
  const hasAnyDeals = canLoadWalletData && deals.length > 0;

  return (
    <div className="mx-auto max-w-[1200px] px-6 pb-16 pt-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-sans text-[28px] font-semibold text-[var(--text-primary)]">
            My Deals
          </h1>
          <p className="mt-1 font-sans text-[13px] text-[var(--text-secondary)]">
            Overview of your escrow agreements
          </p>
        </div>
        <Link
          href="/deals/new"
          className="btn-sharp flex items-center gap-2 bg-[var(--accent-blue)] px-5 py-2.5 font-sans text-[13px] font-semibold text-white transition-colors hover:bg-[var(--accent-cyan)]"
        >
          <Plus className="h-4 w-4" />
          New Deal
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {statsLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <PrimaryStatCard
              label="Total deals"
              value={stats.totalDeals}
              subLabel="All time"
              borderColor="var(--accent-blue)"
            />
            <PrimaryStatCard
              label="Active now"
              value={stats.activeDeals}
              subLabel={stats.activeDeals === 0 ? 'No pending deposits' : 'In progress'}
              borderColor="var(--status-active)"
            />
            <PrimaryStatCard
              label="Locked USDC"
              value={`${formatAmount(stats.totalLocked)} USDC`}
              subLabel="Your active deposits"
              borderColor="var(--accent-cyan)"
            />
            <PrimaryStatCard
              label="Disputed"
              value={stats.disputedDeals}
              subLabel={stats.disputedDeals === 0 ? 'No open disputes' : 'Needs attention'}
              borderColor="var(--status-dispute)"
              actionRequired={stats.disputedDeals > 0}
              onClick={stats.disputedDeals > 0 ? () => router.push('/arbitration') : undefined}
            />
          </>
        )}
      </div>

      <div className="mt-6">
        <AgentWalletCard />
      </div>

      <div className="mt-6">
        <BalanceCard
          isConnected={canLoadWalletData}
          isLoading={!mounted || (canLoadWalletData && isBalanceLoading)}
          balance={unifiedBalance}
          onFund={() => setShowFundingModal(true)}
        />
      </div>

      <div className="my-6 rule-gradient" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {statsLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <SecondaryStatCard
              label="Earned"
              value={formatAmount(stats.totalEarned)}
              subLabel="Net resolved payouts"
              borderColor="var(--status-active)"
            />
            <SecondaryStatCard
              label="Paid out"
              value={formatAmount(stats.totalPaid)}
              subLabel="Your deposits made"
              borderColor="var(--accent-blue)"
            />
            <SecondaryStatCard
              label="Refunded"
              value={formatAmount(stats.totalRefunded)}
              subLabel="Returned funds"
              borderColor="var(--accent-cyan)"
            />
            <SecondaryStatCard
              label="Fees paid"
              value={formatAmount(stats.totalFees)}
              subLabel="Resolved deal fees"
              borderColor="var(--accent-violet)"
            />
          </>
        )}
      </div>

      {!canLoadWalletData && mounted && (
        <div className="mt-6 border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
                <LockKeyhole className="h-4 w-4 text-[var(--text-secondary)]" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-[var(--text-primary)]">
                  Connect a wallet to view agreements
                </h2>
                <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
                  Your dashboard only shows escrows where the connected wallet is a participant.
                </p>
              </div>
            </div>
            <Link href="/deals/new">
              <Button variant="ghost" className="btn-sharp border border-[var(--border-default)] text-[var(--text-secondary)]">
                Prepare agreement
              </Button>
            </Link>
          </div>
        </div>
      )}

      <section className="mt-6 border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <div className="flex flex-col gap-3 border-b border-[var(--border-subtle)] p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2 font-sans text-[13px] text-[var(--text-secondary)]">
            <Filter className="h-4 w-4" />
            Deal list
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--text-tertiary)]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search deals, wallets, or status"
                disabled={!canLoadWalletData}
                className="h-9 w-full border-[var(--border-subtle)] bg-[var(--bg-elevated)] pl-9 font-mono text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent-blue)] focus:ring-0 sm:w-80"
              />
            </div>
            <Select value={sort} onValueChange={(value) => setSort(value as typeof sort)}>
              <SelectTrigger
                className="h-9 w-full border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] sm:w-40"
                disabled={!canLoadWalletData}
              >
                <ListFilter className="h-4 w-4" />
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Most recent</SelectItem>
                <SelectItem value="amount">Largest amount</SelectItem>
                <SelectItem value="status">Status</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mb-0 flex items-center gap-0 border-b border-[var(--border-subtle)]">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.value;
            const count = tabCounts[tab.value as keyof typeof tabCounts] ?? 0;

            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  'flex items-center gap-2 border-b-2 px-5 py-3 -mb-px',
                  'font-sans text-[13px] transition-colors',
                  isActive
                    ? 'border-[var(--accent-blue)] text-[var(--text-primary)]'
                    : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]',
                )}
              >
                {tab.label}
                {count > 0 && (
                  <span
                    className={cn(
                      'px-1.5 py-0.5 font-mono text-[10px]',
                      isActive
                        ? 'bg-[var(--accent-blue-dim)] text-[var(--accent-blue)]'
                        : 'bg-[var(--bg-elevated)] text-[var(--text-tertiary)]',
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-4">
          {dashboardLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <DealCardSkeleton key={i} />
              ))}
            </div>
          ) : error ? (
            <EmptyState
              icon={FileText}
              title="Failed to load deals"
              description="Refresh the page or retry the request."
              action={<Button onClick={() => refreshDeals()}>Retry</Button>}
            />
          ) : !canLoadWalletData ? (
            <EmptyState
              icon={ShieldCheck}
              title="Wallet not connected"
              description="Connect and sign in to load your escrow agreements."
            />
          ) : filteredDeals.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={search || activeTab !== 'all' ? 'No deals match' : 'No deals yet'}
              description={
                search || activeTab !== 'all'
                  ? 'Try a different search or filter.'
                  : 'Create a deal or accept an invite to start tracking escrow activity.'
              }
              action={
                <div className="flex flex-col items-center gap-3">
                  <Link href="/deals/new">
                    <Button className="btn-sharp bg-[var(--accent-blue)] px-6 py-3 text-white hover:bg-[var(--accent-cyan)]">
                      Create Deal
                    </Button>
                  </Link>
                  <Link
                    href="/activity"
                    className="font-sans text-[13px] text-[var(--text-tertiary)] underline underline-offset-4 transition-colors hover:text-[var(--accent-cyan)]"
                  >
                    View live escrows on the platform
                  </Link>
                </div>
              }
            />
          ) : (
            <div className="grid gap-3">
              {filteredDeals.map((deal: Deal) => (
                <DealCard
                  key={deal.id}
                  deal={{
                    id: String(deal.onChainId),
                    title: deal.title ?? undefined,
                    description: deal.description ?? undefined,
                    status: toCardStatus(getDisplayStatus(deal)),
                    type: deal.dealType === 'MutualStake' ? 'mutual' : 'one-sided',
                    creator: {
                      address: deal.partyA,
                      depositAmount: parseFloat(deal.amountA) || 0,
                      hasDeposited: Boolean((deal as DealWithDeposits).partyADeposited),
                      hasVoted: false,
                    },
                    counterparty: {
                      address: deal.partyB,
                      depositAmount: parseFloat(deal.amountB) || 0,
                      hasDeposited: Boolean((deal as DealWithDeposits).partyBDeposited),
                      hasVoted: false,
                    },
                    arbitrator: deal.arbitratorWallet ?? undefined,
                    platformFee: parseFloat(deal.feePercent) || 0,
                    createdAt: new Date(deal.createdAt),
                    expiresAt: new Date(deal.expiryTimestamp),
                    unreadCount: unreadCounts[Number(deal.onChainId)] || 0,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {hasAnyDeals && (
        <div className="mt-8 flex justify-center">
          <Link
            href="/activity"
            className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent-cyan)]"
          >
            <Activity className="h-3.5 w-3.5" />
            View platform activity →
          </Link>
        </div>
      )}

      <GatewayFundingModal open={showFundingModal} onOpenChange={setShowFundingModal} />
    </div>
  );
}
