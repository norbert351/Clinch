'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DealStatusBadge } from './deal-status-badge';
import { DealTypeChip } from './deal-type-chip';
import { USDCAmount } from './usdc-amount';
import { truncateAddress, formatRelativeTime, formatExpiry } from '@/lib/format';

interface DealCardData {
  id: string;
  title?: string;
  description?: string;
  status: 'active' | 'disputed' | 'resolved' | 'cancelled' | 'expired' | 'pending';
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
}

interface DealCardProps {
  deal: DealCardData;
  className?: string;
}

export function DealCard({ deal, className }: DealCardProps) {
  const totalAmount = deal.creator.depositAmount + deal.counterparty.depositAmount;
  const expiry = formatExpiry(deal.expiresAt);
  const createdAgo = formatRelativeTime(deal.createdAt);

  const counterpartyAddress = deal.counterparty.address;

  return (
    <Link href={`/deals/${deal.id}`} className="block">
      <div
        className={cn(
          'rounded-xl border border-clinch-border-default bg-clinch-bg-card p-5 transition-all hover:border-clinch-border-hover',
          className
        )}
      >
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <DealStatusBadge status={deal.status} />
              <DealTypeChip type={deal.type} />
            </div>
            <h3 className="mt-2 text-[15px] font-medium text-clinch-text-primary">
              {deal.title || (
                <span className="text-clinch-text-tertiary">Untitled deal</span>
              )}
            </h3>
            <div className="mt-2 flex gap-4 text-sm text-clinch-text-secondary">
              <span>
                With{' '}
                <span className="font-mono text-clinch-text-secondary">
                  {truncateAddress(counterpartyAddress)}
                </span>
              </span>
              <span className="text-clinch-text-tertiary">{createdAgo}</span>
            </div>
          </div>

          <div className="text-right">
            <USDCAmount amount={totalAmount} />
            {deal.type === 'one-sided' && (
              <div className="mt-1 text-xs text-clinch-text-tertiary">
                One-sided
              </div>
            )}
            <div
              className={cn(
                'mt-1 text-xs',
                expiry.isExpired
                  ? 'text-clinch-danger'
                  : 'text-clinch-text-tertiary'
              )}
            >
              {expiry.text}
            </div>
          </div>
        </div>

        {deal.status === 'disputed' && (
          <div className="mt-4 flex items-center gap-1.5 border-t border-clinch-border-default pt-4 text-xs text-clinch-warning">
            <AlertTriangle className="h-3 w-3" />
            <span>
              Dispute raised {formatRelativeTime(deal.createdAt)} — arbitration
              pending
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
