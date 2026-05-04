'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Scale, AlertTriangle, TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { DealStatusBadge, EmptyState } from '@/components/clinch';
import { formatRelativeTime, truncateAddress } from '@/lib/format';
import { cn } from '@/lib/utils';
import { usePendingDisputes } from '@/hooks/useDeals';
import { useContract } from '@/hooks/useContract';
import { useWallet } from '@/components/wallet-context';
import { toast } from 'react-hot-toast';

const PLATFORM_ARBITRATOR_ADDR = '0xdd4c983Cd57Ee7A6F8Ef0BbB8715B19bdF5C1b61';

const rulingOptions = [
  { value: 'PartyAWins' as const, label: 'Creator wins — all funds to creator', icon: TrendingUp },
  { value: 'PartyBWins' as const, label: 'Counterparty wins — all funds to counterparty', icon: TrendingDown },
  { value: 'Split' as const, label: 'Split — each party gets their deposit back', icon: Minus },
];

const oneSidedRulingOptions = [
  { value: 'PartyBWins' as const, label: 'Worker completed the work — release payment', icon: TrendingDown },
  { value: 'PartyAWins' as const, label: 'Work NOT completed — refund client', icon: TrendingUp },
];

export default function ArbitrationPage() {
  const [expandedDeal, setExpandedDeal] = useState<number | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<'PartyAWins' | 'PartyBWins' | 'Split' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const { address, hasSigned } = useWallet();
  const queryClient = useQueryClient();
  const { data: disputes, isLoading } = usePendingDisputes();
  const { resolveDispute } = useContract();

  const handleResolve = async (onChainId: number) => {
    if (!selectedOutcome || !address || !hasSigned) {
      toast.error('Please sign in first');
      return;
    }

    setIsProcessing(true);
    try {
      const txHash = await resolveDispute(onChainId, selectedOutcome);
      if (txHash) {
        toast.success('Ruling submitted! Funds will be distributed shortly.');
        setExpandedDeal(null);
        setSelectedOutcome(null);
        queryClient.invalidateQueries({ queryKey: ['disputes', 'pending'] });
        queryClient.invalidateQueries({ queryKey: ['deals'] });
      }
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('not arbitrator') || msg.includes('not authorized')) {
        toast.error('You are not the arbitrator for this deal');
      } else {
        toast.error('Failed to resolve dispute');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-clinch-accent" />
      </div>
    );
  }

  const myDisputes = disputes || [];

  return (
    <div className="px-4 pb-16 pt-8 md:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <h1 className="text-h1 text-clinch-text-primary">Arbitration</h1>
          <p className="mt-1 text-sm text-clinch-text-secondary">
            Deals requiring your ruling
          </p>
        </div>

        {myDisputes.length === 0 ? (
          <EmptyState
            icon={Scale}
            title="No pending arbitrations"
            description="You have no disputed deals assigned to you at the moment"
          />
        ) : (
          <div className="space-y-4">
            {myDisputes.map((dispute: any) => {
              const isExpanded = expandedDeal === Number(dispute.onChainId);
              const deal = dispute.deal;
              const isOneSided = deal?.dealType === 'OneSided';
              const options = isOneSided ? oneSidedRulingOptions : rulingOptions;
              const createdAt = dispute.createdAt ? new Date(dispute.createdAt) : new Date();

              return (
                <div key={dispute.id} className="rounded-xl border border-clinch-status-disputed-border bg-clinch-bg-card p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <DealStatusBadge status="Disputed" />
                      <span className="text-sm text-clinch-text-tertiary">
                        Raised {formatRelativeTime(createdAt)}
                      </span>
                    </div>
                  </div>

                  <h3 className="mt-3 text-[15px] font-medium text-clinch-text-primary">
                    Deal #{dispute.onChainId}
                    {deal?.title && ` — ${deal.title}`}
                  </h3>

                  {/* Party info */}
                  {deal && (
                    <div className="mt-3 rounded-lg bg-clinch-bg-elevated p-3 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-clinch-text-tertiary">
                          {isOneSided ? 'Client' : 'Creator'}
                        </span>
                        <span className="font-mono text-clinch-text-primary">
                          {truncateAddress(deal.partyA)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-clinch-text-tertiary">
                          {isOneSided ? 'Worker' : 'Counterparty'}
                        </span>
                        <span className="font-mono text-clinch-text-primary">
                          {truncateAddress(deal.partyB)}
                        </span>
                      </div>
                      {deal.amountA && (
                        <div className="flex justify-between">
                          <span className="text-clinch-text-tertiary">Total at stake</span>
                          <span className="font-medium text-clinch-text-primary">
                            {isOneSided
                              ? `${parseFloat(deal.amountA || '0').toFixed(2)} USDC`
                              : `${(parseFloat(deal.amountA || '0') + parseFloat(deal.amountB || '0')).toFixed(2)} USDC`}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {dispute.reasonText && (
                    <p className="mt-2 text-sm text-clinch-text-secondary">
                      Reason: {dispute.reasonText}
                    </p>
                  )}

                  {!isExpanded ? (
                    <Button
                      onClick={() => setExpandedDeal(Number(dispute.onChainId))}
                      className="mt-4 w-full bg-clinch-accent text-white hover:bg-clinch-accent-hover sm:w-auto"
                    >
                      Rule on this deal
                    </Button>
                  ) : (
                    <div className="mt-4 border-t border-clinch-border-default pt-4">
                      <h4 className="mb-3 text-h4 text-clinch-text-primary">Submit your ruling</h4>
                      <p className="mb-3 text-xs text-clinch-text-secondary">
                        Your ruling is final and executes on-chain immediately.
                        Funds are distributed after your transaction confirms.
                      </p>
                      <div className="space-y-2">
                        {options.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => setSelectedOutcome(option.value)}
                            className={cn(
                              'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all',
                              selectedOutcome === option.value
                                ? 'border-clinch-accent bg-clinch-accent-muted'
                                : 'border-clinch-border-default hover:border-clinch-border-hover'
                            )}
                          >
                            <option.icon className={cn(
                              'h-4 w-4 shrink-0',
                              selectedOutcome === option.value ? 'text-clinch-accent' : 'text-clinch-text-tertiary'
                            )} />
                            <span className="text-sm font-medium text-clinch-text-primary">
                              {option.label}
                            </span>
                          </button>
                        ))}
                      </div>

                      <div className="mt-4 flex gap-2">
                        <Button
                          variant="ghost"
                          onClick={() => { setExpandedDeal(null); setSelectedOutcome(null); }}
                          className="border-clinch-border-default text-clinch-text-secondary"
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={() => handleResolve(Number(dispute.onChainId))}
                          disabled={!selectedOutcome || isProcessing}
                          className="flex-1 border-clinch-danger bg-clinch-danger-muted text-clinch-danger hover:bg-clinch-danger/20"
                        >
                          {isProcessing ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Resolving...</>
                          ) : (
                            'Submit ruling — this is final'
                          )}
                        </Button>
                      </div>

                      <div className="mt-3 flex items-start gap-2 rounded-lg bg-clinch-warning-muted p-3">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-clinch-warning" />
                        <p className="text-xs text-clinch-text-secondary">
                          This ruling executes immediately on-chain and cannot be reversed.
                          Funds (minus the 2% platform fee) are sent to the winning party.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}