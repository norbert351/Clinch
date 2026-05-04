'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Plus, FileText } from 'lucide-react';
import { io } from 'socket.io-client';
import { Button } from '@/components/ui/button';
import { DealCard, StatCard, EmptyState } from '@/components/clinch';
import { formatUSDC } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useDeals, useRefreshDeals } from '@/hooks/useDeals';
import { getToken } from '@/lib/api';
import type { Deal, DealStatus, DealWithDeposits } from '@/lib/types';

type TabFilter = 'all' | DealStatus;

const tabs: { value: TabFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'Pending', label: 'Pending' },
  { value: 'Active', label: 'Active' },
  { value: 'Disputed', label: 'Disputed' },
  { value: 'Resolved', label: 'Resolved' },
  { value: 'Cancelled', label: 'Closed' },
];

function getDisplayStatus(deal: Deal): string {
  const dwd = deal as DealWithDeposits;

  // Use backend-computed status if available
  if (dwd.computedStatus) return dwd.computedStatus;

  const isOneSided = deal.dealType === 'OneSided';

  if (deal.status === 'Active') {
    if (isOneSided) {
      if (!Boolean(dwd.partyADeposited)) return 'Pending';
      return 'Active';
    } else {
      if (!Boolean(dwd.partyADeposited) || !Boolean(dwd.partyBDeposited)) return 'Pending';
      return 'Active';
    }
  }
  return deal.status;
}

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const { data, isLoading, error, refetch } = useDeals(1, 50);
  const refreshDeals = useRefreshDeals();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-refresh polling fallback every 15s
  useEffect(() => {
    if (!mounted) return;
    const interval = setInterval(() => {
      refetch();
    }, 15_000);
    return () => clearInterval(interval);
  }, [mounted, refetch]);

  // Socket.IO real-time updates — join user room on mount
  useEffect(() => {
    if (!mounted) return;

    const token = getToken();
    if (!token) return;

    let wallet: string | undefined;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      wallet = payload.address || payload.walletAddress || undefined;
    } catch {
      return;
    }

    if (!wallet) return;

    const socketUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const socket = io(socketUrl, {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      socket.emit('join-user', { address: wallet });
    });

    socket.on('deal:update', () => {
      refreshDeals();
    });

    socket.on('deal:new', () => {
      refreshDeals();
    });

    return () => {
      socket.disconnect();
    };
  }, [mounted, refreshDeals]);

  const deals = data?.items || [];

  const filteredDeals = useMemo(() => {
    if (activeTab === 'all') return deals;
    if (activeTab === 'Cancelled') {
      return deals.filter((d: Deal) => {
        const s = getDisplayStatus(d);
        return s === 'Cancelled' || s === 'Expired';
      });
    }
    return deals.filter((d: Deal) => getDisplayStatus(d) === activeTab);
  }, [deals, activeTab]);

  const tabCounts = useMemo(() => {
    return {
      all: deals.length,
      Pending: deals.filter((d: Deal) => getDisplayStatus(d) === 'Pending').length,
      Active: deals.filter((d: Deal) => getDisplayStatus(d) === 'Active').length,
      Disputed: deals.filter((d: Deal) => getDisplayStatus(d) === 'Disputed').length,
      Resolved: deals.filter((d: Deal) => getDisplayStatus(d) === 'Resolved').length,
      Cancelled: deals.filter((d: Deal) => {
        const s = getDisplayStatus(d);
        return s === 'Cancelled' || s === 'Expired';
      }).length,
    };
  }, [deals]);

  const stats = useMemo(() => {
    const activeDeals = deals.filter((d: Deal) => getDisplayStatus(d) === 'Active');
    const pendingDeals = deals.filter((d: Deal) => getDisplayStatus(d) === 'Pending');
    const allLiveDeals = [...activeDeals, ...pendingDeals];

    const totalLocked = allLiveDeals.reduce((sum: number, d: Deal) => {
      const dwd = d as DealWithDeposits;
      const amountA = parseFloat(d.amountA) || 0;
      const amountB = parseFloat(d.amountB) || 0;
      return sum +
        (dwd.partyADeposited ? amountA : 0) +
        (dwd.partyBDeposited ? amountB : 0);
    }, 0);

    return {
      totalDeals: deals.length,
      activeDeals: activeDeals.length,
      totalLocked,
      disputedDeals: deals.filter((d: Deal) => d.status === 'Disputed').length,
      pendingDeals: pendingDeals.length,
    };
  }, [deals]);

  const mapDealToUI = (deal: Deal) => {
    const dwd = deal as DealWithDeposits;
    const displayStatus = getDisplayStatus(deal);

    const statusMap: Record<string, 'active' | 'pending' | 'disputed' | 'resolved' | 'cancelled' | 'expired'> = {
      Active: 'active',
      Pending: 'pending',
      Disputed: 'disputed',
      Resolved: 'resolved',
      Cancelled: 'cancelled',
      Expired: 'expired',
    };

    const cardStatus = statusMap[displayStatus] ?? 'pending';

    return {
      id: String(deal.onChainId),
      title: deal.title ?? undefined,
      description: deal.description ?? undefined,
      status: cardStatus,
      type: deal.dealType === 'MutualStake' ? 'mutual' as const : 'one-sided' as const,
      creator: {
        address: deal.partyA,
        depositAmount: parseFloat(deal.amountA) || 0,
        hasDeposited: Boolean(dwd?.partyADeposited),
        hasVoted: false,
      },
      counterparty: {
        address: deal.partyB,
        depositAmount: parseFloat(deal.amountB) || 0,
        hasDeposited: Boolean(dwd?.partyBDeposited),
        hasVoted: false,
      },
      arbitrator: deal.arbitratorWallet ?? undefined,
      platformFee: parseFloat(deal.feePercent) || 0,
      createdAt: new Date(deal.createdAt),
      expiresAt: new Date(deal.expiryTimestamp),
    };
  };

  return (
    <div className="px-4 pb-16 pt-8 md:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-h1 text-clinch-text-primary">My Deals</h1>
            <p className="mt-1 text-sm text-clinch-text-secondary">
              Overview of all your agreements
            </p>
          </div>
          <Link href="/deals/new">
            <Button className="gap-2 bg-clinch-accent text-white hover:bg-clinch-accent-hover">
              <Plus className="h-4 w-4" />
              New Deal
            </Button>
          </Link>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard
            label="Total Deals"
            value={stats.totalDeals}
          />
          <StatCard
            label="Active"
            value={stats.activeDeals}
            valueClassName="text-clinch-accent"
          />
          <StatCard
            label="Total Locked"
            value={`${formatUSDC(stats.totalLocked)} USDC`}
            valueClassName="text-clinch-accent"
          />
          <StatCard
            label="Disputed"
            value={stats.disputedDeals}
            valueClassName={
              stats.disputedDeals > 0 ? 'text-clinch-warning' : ''
            }
          />
        </div>

        <div className="mb-6 flex gap-1 border-b border-clinch-border-default">
          {tabs.map((tab) => {
            const count = tabCounts[tab.value as keyof typeof tabCounts] ?? 0;
            const isActive = activeTab === tab.value;

            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-colors',
                  isActive
                    ? 'border-clinch-accent font-medium text-clinch-text-primary'
                    : 'border-transparent text-clinch-text-tertiary hover:text-clinch-text-secondary'
                )}
              >
                {tab.label}
                {count > 0 && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-xs',
                      isActive
                        ? 'bg-clinch-accent-muted text-clinch-accent'
                        : 'bg-clinch-bg-elevated text-clinch-text-tertiary'
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {!mounted ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl bg-clinch-bg-card" />
            ))}
          </div>
        ) : isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl bg-clinch-bg-card" />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            icon={FileText}
            title="Failed to load deals"
            description="Please try refreshing the page"
            action={
              <Button onClick={() => refreshDeals()}>
                Retry
              </Button>
            }
          />
        ) : filteredDeals.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No deals found"
            description={
              activeTab === 'all'
                ? 'Create your first deal to get started'
                : `No ${activeTab.toLowerCase()} deals at the moment`
            }
            action={
              activeTab === 'all' ? (
                <Link href="/deals/new">
                  <Button className="gap-2 bg-clinch-accent text-white hover:bg-clinch-accent-hover">
                    <Plus className="h-4 w-4" />
                    Create Deal
                  </Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-3">
            {filteredDeals.map((deal: Deal) => (
              <DealCard key={deal.id} deal={mapDealToUI(deal)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
