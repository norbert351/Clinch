'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { io } from 'socket.io-client';
import {
  Activity,
  ArrowLeftRight,
  Droplets,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { GatewayFundingModal } from '@/components/clinch';
import { Button } from '@/components/ui/button';
import { useWallet } from '@/components/wallet-context';
import { useUnifiedBalance } from '@/hooks/useUnifiedBalance';
import { API_URL, getPublicActivity } from '@/lib/api';
import { formatUSDC, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { PublicActivityItem } from '@/lib/types';

function normalizeStatus(status: string): 'active' | 'pending' | 'disputed' | 'resolved' | 'closed' {
  const normalized = status.toLowerCase();
  if (normalized.includes('disput')) return 'disputed';
  if (normalized.includes('resolv')) return 'resolved';
  if (normalized.includes('clos') || normalized.includes('cancel') || normalized.includes('expir')) return 'closed';
  if (normalized.includes('active')) return 'active';
  return 'pending';
}

function statusColor(status: string): string {
  const normalized = normalizeStatus(status);
  return {
    active: 'border-l-active text-active',
    pending: 'border-l-pending text-pending',
    disputed: 'border-l-dispute text-dispute',
    resolved: 'border-l-resolve text-resolve',
    closed: 'border-l-closed text-closed',
  }[normalized];
}

function ActivityCard({ item }: { item: PublicActivityItem }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className={cn(
        'animate-fade-in-up border border-border-subtle border-l-[3px] bg-surface p-4',
        statusColor(item.status),
      )}
    >
      <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] text-text-tertiary">
        <span className="border border-border-subtle px-2 py-1 text-text-secondary">
          {item.dealType}
        </span>
        <span>#{item.onChainId}</span>
        <span>{timeAgo(new Date(item.updatedAt || item.createdAt))}</span>
      </div>
      <div className="mt-4 font-mono text-2xl text-text-primary">
        {formatUSDC(item.amountUSDC)}
        <span className="ml-2 text-sm text-text-secondary">USDC</span>
      </div>
      <div className="mt-4 status-badge inline-flex text-current">
        {normalizeStatus(item.status).toUpperCase()}
      </div>
    </motion.div>
  );
}

function BalancePanel({
  onFund,
}: {
  onFund: () => void;
}) {
  const { address, hasSigned } = useWallet();
  const { data: unifiedBalance, isLoading } = useUnifiedBalance(!!address && hasSigned);
  const total = unifiedBalance?.totalBalance;
  const chains = unifiedBalance?.chains ?? [];

  const rows = [
    { key: 'ARC-TESTNET', label: 'Arc Testnet', color: 'bg-arc' },
    { key: 'BASE-SEPOLIA', label: 'Base Sepolia', color: 'bg-[#0052FF]' },
    { key: 'ETH-SEPOLIA', label: 'Eth Sepolia', color: 'bg-[#627EEA]' },
  ].map((row) => {
    const chain = chains.find((item) => item.key === row.key || item.chainName === row.label);
    return {
      ...row,
      balance: chain?.balance ?? null,
    };
  });

  return (
    <section className="border border-border-subtle bg-surface p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-text-primary">USDC Balance</h2>
        <span className="border border-border-default px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-text-secondary">
          Circle Gateway
        </span>
      </div>
      {isLoading ? (
        <div className="mt-8 flex h-20 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-usdc" />
        </div>
      ) : (
        <>
          <div className="mt-8 font-mono text-[48px] leading-none text-text-primary">
            {total === null || total === undefined ? '--' : formatUSDC(total)}
            <span className="ml-2 text-2xl text-text-secondary">USDC</span>
          </div>
          <div className="mt-2 text-sm text-text-secondary">across 3 networks</div>
          <div className="mt-8 space-y-3">
            {rows.map((row) => (
              <div key={row.key} className="flex items-center justify-between border-t border-border-subtle pt-3">
                <div className="flex items-center gap-3 text-sm text-text-primary">
                  <span className={cn('h-2 w-2 rounded-full', row.color)} />
                  {row.label}
                </div>
                <div className="font-mono text-sm text-text-secondary">
                  {row.balance === null ? '--' : formatUSDC(row.balance)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <Button
        onClick={onFund}
        className="btn-sharp mt-8 w-full bg-usdc py-3 text-white hover:bg-[#1A5FA8]"
      >
        Fund from another chain →
      </Button>
    </section>
  );
}

function RouteCard({
  icon: Icon,
  title,
  description,
  cta,
  href,
}: {
  icon: typeof Droplets;
  title: string;
  description: string;
  cta: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      target="_blank"
      className="block border border-border-subtle bg-surface p-4 transition-colors hover:border-border-default"
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-arc" />
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-text-secondary">{description}</p>
          <div className="mt-3 inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.1em] text-usdc">
            {cta}
            <ExternalLink className="h-3 w-3" />
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function ActivityPage() {
  const queryClient = useQueryClient();
  const [fundingOpen, setFundingOpen] = useState(false);

  const { data: activity = [], isLoading } = useQuery({
    queryKey: ['public-activity', 20],
    queryFn: () => getPublicActivity(20),
    refetchInterval: 15_000,
  });

  const feed = useMemo(() => activity.slice(0, 20), [activity]);

  useEffect(() => {
    const socket = io(API_URL, {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
    });

    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ['public-activity'] });
    };

    socket.on('connect', () => {
      socket.emit('join-public-activity');
    });
    socket.on('deal-updated', refresh);
    socket.on('deal:update', refresh);
    socket.on('deal:new', refresh);
    socket.on('public:activity:update', refresh);

    return () => {
      socket.emit('leave-public-activity');
      socket.off('deal-updated', refresh);
      socket.off('deal:update', refresh);
      socket.off('deal:new', refresh);
      socket.off('public:activity:update', refresh);
      socket.disconnect();
    };
  }, [queryClient]);

  return (
    <div className="px-4 py-8 md:px-6">
      <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[2fr_3fr]">
        <section className="border border-border-subtle bg-void p-5">
          <div className="flex items-center gap-3">
          <span className="h-2.5 w-2.5 rounded-full bg-active pulse-dot" />
            <h1 className="text-2xl font-semibold text-text-primary">Live Escrows</h1>
          </div>
          <p className="mt-2 text-sm text-text-secondary">
            Updated in real time via Arc Network
          </p>

          <div className="mt-6 space-y-3">
            {isLoading ? (
              [1, 2, 3, 4].map((item) => (
                <div key={item} className="h-28 animate-pulse border border-border-subtle bg-surface" />
              ))
            ) : feed.length === 0 ? (
              <div className="border border-dashed border-border-default p-12 text-center">
                <div className="font-mono text-[80px] leading-none text-text-tertiary">--</div>
                <h2 className="mt-4 text-lg font-semibold text-text-primary">No public escrows yet</h2>
                <p className="mt-2 text-sm text-text-secondary">New public agreements will appear here once indexed.</p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {feed.map((item) => (
                  <ActivityCard key={`${item.onChainId}-${item.updatedAt}`} item={item} />
                ))}
              </AnimatePresence>
            )}
          </div>
        </section>

        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
            <BalancePanel onFund={() => setFundingOpen(true)} />
            <div className="border border-border-subtle bg-surface p-4">
              <div
                className="relative mx-auto overflow-hidden border-[6px] border-elevated shadow-2xl"
                style={{
                  borderRadius: '40px',
                  width: '220px',
                  aspectRatio: '9 / 19.5',
                  boxShadow: '0 40px 80px -20px rgba(0,0,0,0.8), 0 0 40px #2775CA20',
                }}
              >
                <Image
                  src="/phone.jpg"
                  alt="Clinch on mobile"
                  fill
                  className="object-cover"
                  style={{ opacity: 0.9 }}
                  sizes="220px"
                />
                <div className="absolute left-1/2 top-3 h-6 w-20 -translate-x-1/2 rounded-full bg-void" />
              </div>
            </div>
          </div>

          <section className="border border-border-subtle bg-void p-5">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-text-primary">Deposit Routes</h2>
              <Activity className="h-5 w-5 text-text-tertiary" />
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              <RouteCard
                icon={Droplets}
                title="Arc Testnet Faucet"
                description="Get test USDC directly on Arc."
                cta="Get Testnet USDC →"
                href="https://faucet.circle.com/"
              />
              <RouteCard
                icon={ArrowLeftRight}
                title="Bridge from Base"
                description="Bridge USDC from Base Sepolia to Arc."
                cta="Open Bridge →"
                href="https://bridge.circle.com/"
              />
              <RouteCard
                icon={ArrowLeftRight}
                title="Bridge from Ethereum"
                description="Bridge USDC from Ethereum Sepolia."
                cta="Open Bridge →"
                href="https://bridge.circle.com/"
              />
            </div>
          </section>
        </div>
      </div>
      <GatewayFundingModal open={fundingOpen} onOpenChange={setFundingOpen} />
    </div>
  );
}
