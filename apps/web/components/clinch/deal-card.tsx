'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, MessageSquareText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DealStatusBadge } from './deal-status-badge';
import { formatExpiry, formatRelativeTime, truncateAddress } from '@/lib/format';

type DealCardStatus =
  | 'active'
  | 'awaiting-deposit'
  | 'in-review'
  | 'disputed'
  | 'resolved'
  | 'closed'
  | 'cancelled'
  | 'expired'
  | 'pending';

interface DealCardData {
  id: string;
  title?: string;
  description?: string;
  status: DealCardStatus | string;
  type: 'mutual' | 'one-sided';
  creator: {
    address: string;
    depositAmount: number;
    hasDeposited: boolean;
    hasVoted: boolean;
  };
  counterparty: {
    address: string;
    depositAmount: number;
    hasDeposited: boolean;
    hasVoted: boolean;
  };
  arbitrator?: string;
  platformFee: number;
  createdAt: Date;
  expiresAt: Date;
  unreadCount?: number;
}

interface DealCardProps {
  deal: DealCardData;
  className?: string;
}

function normalizeCardStatus(status: string): DealCardStatus {
  const normalized = status.toLowerCase().replace(/\s+/g, '-');
  if (normalized === 'confirmed') return 'in-review';
  if (normalized === 'closed') return 'closed';
  if (normalized === 'cancelled') return 'closed';
  if (normalized === 'expired') return 'expired';
  if (normalized === 'active') return 'active';
  if (normalized === 'disputed') return 'disputed';
  if (normalized === 'resolved') return 'resolved';
  if (normalized === 'awaiting-deposit') return 'awaiting-deposit';
  return 'pending';
}

export function DealCard({ deal, className }: DealCardProps) {
  const totalAmount = deal.creator.depositAmount + deal.counterparty.depositAmount;
  const expiry = formatExpiry(deal.expiresAt);
  const createdAgo = formatRelativeTime(deal.createdAt);
  const status = normalizeCardStatus(String(deal.status));
  const depositCount =
    Number(deal.creator.hasDeposited) + Number(deal.counterparty.hasDeposited);
  const depositTotal = deal.type === 'one-sided' ? 1 : 2;
  const unreadBadge = deal.unreadCount
    ? deal.unreadCount > 9
      ? '9+'
      : String(deal.unreadCount)
    : null;
  const statusColor = {
    active: 'border-l-active',
    'awaiting-deposit': 'border-l-pending',
    'in-review': 'border-l-resolve',
    disputed: 'border-l-dispute',
    resolved: 'border-l-resolve',
    closed: 'border-l-closed',
    cancelled: 'border-l-closed',
    expired: 'border-l-closed',
    pending: 'border-l-pending',
  }[status];

  return (
    <Link
      href={`/deals/${deal.id}`}
      className={cn(
        'group block border border-[var(--border-subtle)] border-l-[3px] bg-[var(--bg-surface)] p-4',
        'transition-colors hover:border-[var(--border-default)] hover:bg-[var(--bg-elevated)]/30 md:px-5',
        statusColor,
        className,
      )}
    >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(190px,0.55fr)_190px] lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-[var(--text-tertiary)]">
                #{deal.id}
              </span>
              <span className="border border-[var(--border-subtle)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-tertiary)]">
                {deal.type === 'mutual' ? 'MUTUAL' : 'ONE-SIDED'}
              </span>
              {unreadBadge && (
                <span className="inline-flex items-center gap-1 border border-[var(--accent-blue)]/35 px-2 py-1 font-mono text-[10px] font-medium leading-none text-[var(--accent-blue)]">
                  <MessageSquareText className="h-3 w-3" />
                  {unreadBadge}
                </span>
              )}
            </div>

            <h3 className="mt-2 truncate font-sans text-[15px] font-medium text-[var(--text-primary)]">
              {deal.title || (
                <span className="text-[var(--text-tertiary)]">Untitled Agreement</span>
              )}
            </h3>
            {deal.description && (
              <p className="mt-1 line-clamp-1 max-w-2xl text-sm text-[var(--text-secondary)]">
                {deal.description}
              </p>
            )}
            <div className="mt-2 font-mono text-[11px] text-[var(--text-tertiary)]">
              Counterparty {truncateAddress(deal.counterparty.address)}
            </div>
          </div>

          <div className="min-w-0">
            <div className="font-mono text-[16px] text-[var(--text-primary)]">
              {totalAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              <span className="ml-1 text-[12px] text-[var(--text-secondary)]">USDC</span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              {Array.from({ length: depositTotal }).map((_, index) => (
                <span
                  key={index}
                  className={cn(
                    'h-1.5 w-8 bg-[var(--border-default)]',
                    index < depositCount && 'bg-[var(--accent-blue)]',
                  )}
                />
              ))}
              <span className="font-mono text-[11px] text-[var(--text-tertiary)]">
                {depositCount}/{depositTotal}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 lg:justify-end">
            <div className="space-y-2 lg:text-right">
              <DealStatusBadge status={status} pulse={status === 'active'} />
              <div className="font-mono text-[11px] text-[var(--text-tertiary)]">
                {createdAgo} - {expiry.text}
              </div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-colors group-hover:text-[var(--accent-blue)]" />
          </div>
        </div>

        {status === 'disputed' && (
          <div className="mt-4 flex items-center gap-2 border-l-2 border-[var(--status-dispute)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-secondary)]">
            <AlertTriangle className="h-3.5 w-3.5" />
            AI dispute coordination active. Evidence and summary are ready for review.
          </div>
        )}
    </Link>
  );
}
