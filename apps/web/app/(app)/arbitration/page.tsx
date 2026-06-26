'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Clock3,
  FileCheck2,
  FileText,
  GitBranch,
  Loader2,
  MessageSquareText,
  Minus,
  Scale,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AIDisputeAssistant, DealStatusBadge, EmptyState } from '@/components/clinch';
import { formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { usePendingDisputes } from '@/hooks/useDeals';
import { useContract } from '@/hooks/useContract';
import { useWallet } from '@/components/wallet-context';
import { API_URL, getToken } from '@/lib/api';
import { toast } from 'react-hot-toast';
import { PLATFORM_ARBITRATOR } from '@/lib/contract';

const rulingOptions = [
  {
    value: 'PartyAWins' as const,
    label: 'Creator wins',
    detail: 'Release settlement to the creator wallet.',
    icon: TrendingUp,
  },
  {
    value: 'PartyBWins' as const,
    label: 'Counterparty wins',
    detail: 'Release settlement to the counterparty wallet.',
    icon: TrendingDown,
  },
  {
    value: 'Split' as const,
    label: 'Split settlement',
    detail: 'Return each party deposit after contract fee.',
    icon: Minus,
  },
];

const oneSidedRulingOptions = [
  {
    value: 'PartyBWins' as const,
    label: 'Worker completed delivery',
    detail: 'Release the funded escrow to the worker.',
    icon: TrendingDown,
  },
  {
    value: 'PartyAWins' as const,
    label: 'Refund client',
    detail: 'Return funds when work was not completed.',
    icon: TrendingUp,
  },
];

const insightCards = [
  ['Indexed record', 'Only dispute metadata, votes, deposits, and cached AI analysis are shown here.', FileCheck2, 'emerald'],
  ['Neutral review', 'AI analysis stays read-only until an arbitrator chooses to apply it.', ShieldCheck, 'blue'],
  ['Confidence tracked', 'Lower confidence appears when the indexed record is sparse or contradictory.', AlertTriangle, 'amber'],
  ['Manual ruling', 'The final on-chain settlement still requires a human submission.', GitBranch, 'violet'],
] as const;

const disputeStats = [
  { label: 'Open disputes', icon: Scale, tone: 'blue' },
  { label: 'Cached analyses', icon: Sparkles, tone: 'emerald' },
  { label: 'One-sided cases', icon: FileText, tone: 'violet' },
  { label: 'USDC at stake', icon: Clock3, tone: 'amber' },
] as const;

export default function ArbitrationPage() {
  const [expandedDeal, setExpandedDeal] = useState<number | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<
    'PartyAWins' | 'PartyBWins' | 'Split' | null
  >(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const { address, hasSigned } = useWallet();
  const queryClient = useQueryClient();
  const { data: disputes, isLoading } = usePendingDisputes();
  const { resolveDispute } = useContract();

  const myDisputes = disputes || [];
  const disputeRoomIds = useMemo(
    () => myDisputes.map((dispute: any) => Number(dispute.onChainId)).filter(Boolean),
    [myDisputes],
  );
  const disputeRoomKey = disputeRoomIds.join(',');

  useEffect(() => {
    if (!hasSigned || !address || disputeRoomIds.length === 0) return;
    const token = getToken();
    if (!token) return;

    const socket = io(API_URL, {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      auth: { token },
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
      timeout: 5000,
    });

    const refreshDisputes = (payload?: { onChainId?: number }) => {
      queryClient.invalidateQueries({ queryKey: ['disputes', 'pending'] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      if (payload?.onChainId) {
        queryClient.invalidateQueries({ queryKey: ['disputes', 'ai', Number(payload.onChainId)] });
        queryClient.invalidateQueries({ queryKey: ['deal', Number(payload.onChainId)] });
      }
    };

    socket.on('connect', () => {
      disputeRoomIds.forEach((onChainId) => {
        socket.emit('join-deal', { onChainId });
      });
    });
    socket.on('deal-updated', refreshDisputes);

    return () => {
      disputeRoomIds.forEach((onChainId) => {
        socket.emit('leave-deal', { onChainId });
      });
      socket.off('deal-updated', refreshDisputes);
      socket.disconnect();
    };
  }, [hasSigned, address, disputeRoomKey, queryClient]);

  const stats = useMemo(() => {
    const cachedAnalyses = myDisputes.filter((dispute: any) => Boolean(dispute.aiAnalysis)).length;
    const oneSidedCases = myDisputes.filter((dispute: any) => dispute.deal?.dealType === 'OneSided').length;
    const lockedAmount = myDisputes.reduce((total: number, dispute: any) => {
      if (!dispute.deal) return total;
      const partyA = parseFloat(dispute.deal.amountA || '0') || 0;
      const partyB = dispute.deal.dealType === 'MutualStake'
        ? parseFloat(dispute.deal.amountB || '0') || 0
        : 0;
      return total + partyA + partyB;
    }, 0);

    return {
      open: myDisputes.length,
      cached: cachedAnalyses,
      oneSided: oneSidedCases,
      lockedAmount,
    };
  }, [myDisputes]);

  const handleResolve = async (onChainId: number) => {
    if (!selectedOutcome || !address || !hasSigned) {
      toast.error('Please sign in first');
      return;
    }

    setIsProcessing(true);
    try {
      const txHash = await resolveDispute(onChainId, selectedOutcome);
      if (txHash) {
        toast.success('Ruling submitted. Settlement will execute on-chain.');
        setExpandedDeal(null);
        setSelectedOutcome(null);
        queryClient.invalidateQueries({ queryKey: ['disputes', 'pending'] });
        queryClient.invalidateQueries({ queryKey: ['deals'] });
      }
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('not arbitrator') || msg.includes('not authorized')) {
        toast.error('You are not the arbitrator for this agreement');
      } else {
        toast.error('Failed to resolve dispute');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-usdc" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 md:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-dispute">
              <Scale className="h-3.5 w-3.5" />
              Arbitration
            </div>
            <h1 className="mt-2 text-3xl font-bold text-text-primary">
              Arbitration
            </h1>
            <p className="mt-3 max-w-2xl text-sm font-light leading-6 text-text-secondary md:text-base">
              Evidence timelines, lightweight discussion, AI summaries, settlement progress, and on-chain arbitrator rulings in one operational view.
            </p>
          </div>
          <Link href="/dashboard">
            <Button variant="ghost" className="btn-sharp h-10 border border-border-subtle bg-surface/70 text-text-primary hover:bg-elevated">
              Back to command center
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {disputeStats.map(({ label, icon: Icon, tone }, index) => {
            const value =
              index === 0
                ? stats.open
                : index === 1
                ? stats.cached
                : index === 2
                  ? stats.oneSided
                  : `${stats.lockedAmount.toFixed(2)} USDC`;

            return (
              <div key={label} className="border border-border-subtle bg-surface p-4 transition-colors hover:bg-elevated">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-tertiary">
                    {label}
                  </div>
                  <Icon
                    className={cn(
                      'h-4 w-4',
                      tone === 'blue' && 'text-usdc',
                      tone === 'violet' && 'text-violet',
                      tone === 'emerald' && 'text-active',
                      tone === 'amber' && 'text-pending',
                    )}
                  />
                </div>
                <div className="mt-2 text-2xl font-semibold text-text-primary tabular-nums">
                  {String(value)}
                </div>
              </div>
            );
          })}
        </div>

        {myDisputes.length === 0 ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
            <EmptyState
              icon={Scale}
              title="No pending arbitrations"
              description="When a disagreement appears, Clinch will organize evidence, AI summaries, and the ruling workflow here."
              className="border border-border-subtle bg-surface"
            />
            <AIPanel />
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              {myDisputes.map((dispute: any) => {
                const isExpanded = expandedDeal === Number(dispute.onChainId);
                const deal = dispute.deal;
                const isOneSided = deal?.dealType === 'OneSided';
                const options = isOneSided ? oneSidedRulingOptions : rulingOptions;
                const createdAt = dispute.createdAt ? new Date(dispute.createdAt) : new Date();
                const totalAtStake = deal
                  ? isOneSided
                    ? parseFloat(deal.amountA || '0')
                    : parseFloat(deal.amountA || '0') + parseFloat(deal.amountB || '0')
                  : 0;
                const dealArbitrator = deal?.arbitratorWallet?.toLowerCase() || '';
                const effectiveArbitrator =
                  !dealArbitrator || dealArbitrator === '0x0000000000000000000000000000000000000000'
                    ? PLATFORM_ARBITRATOR
                    : dealArbitrator;
                const isArbitratorForDispute =
                  !!address && address.toLowerCase() === effectiveArbitrator.toLowerCase();

                return (
                  <motion.div
                    key={dispute.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="border border-border-subtle border-l-[3px] border-l-dispute bg-surface"
                  >
                    <div className="border-b border-border-subtle p-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <DealStatusBadge status="Disputed" pulse />
                            <span className="border border-border-subtle bg-elevated/60 px-2.5 py-1 font-mono text-[11px] text-text-tertiary">
                              Raised {formatRelativeTime(createdAt)}
                            </span>
                          </div>
                          <h3 className="mt-3 text-lg font-semibold text-text-primary">
                            Agreement #{dispute.onChainId}
                            {deal?.title && ` - ${deal.title}`}
                          </h3>
                          {dispute.reasonText && (
                            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                              {dispute.reasonText}
                            </p>
                          )}
                        </div>
                        <div className="border border-border-subtle bg-void p-3 text-right">
                          <div className="text-[11px] uppercase tracking-[0.12em] text-text-tertiary">
                            At stake
                          </div>
                          <div className="mt-1 text-xl font-semibold text-text-primary tabular-nums">
                            {totalAtStake.toFixed(2)} USDC
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-0 lg:grid-cols-[1fr_0.8fr]">
                      <div className="border-b border-border-subtle p-5 lg:border-b-0 lg:border-r">
                        <h4 className="text-sm font-semibold text-text-primary">
                          Evidence timeline
                        </h4>
                        <div className="mt-4 space-y-4">
                          {[
                            ['Agreement terms locked', 'The indexed deal record is available for review.', ShieldCheck],
                            ['Dispute opened', 'Conflicting vote records moved the deal into arbitration.', AlertTriangle],
                            ['Evidence record ready', 'Deposits, votes, and dispute text are available to inspect.', FileCheck2],
                            ['AI analysis synced', 'Cached analysis updates once the backend finishes processing.', SearchCheck],
                          ].map(([title, description, Icon], index) => (
                            <div key={String(title)} className="flex gap-3">
                              <div className="flex flex-col items-center">
                                <span className="flex h-8 w-8 items-center justify-center border border-border-subtle bg-elevated text-usdc">
                                  <Icon className="h-4 w-4" />
                                </span>
                                {index < 3 && <span className="mt-2 w-px flex-1 bg-border-subtle" />}
                              </div>
                              <div className="pb-4">
                                <div className="text-sm font-medium text-text-primary">{String(title)}</div>
                                <p className="mt-1 text-xs leading-5 text-text-secondary">{String(description)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="p-5">
                        <div className="border border-border-subtle bg-void p-4">
                          <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                            <MessageSquareText className="h-4 w-4 text-usdc" />
                            Discussion thread
                          </div>
                          <div className="mt-4 space-y-3">
                            <div className="bg-surface p-3 text-xs leading-5 text-text-secondary">
                              {dispute.reasonText || 'The dispute reason is recorded in the indexed deal log.'}
                            </div>
                            <div className="ml-5 border border-border-subtle bg-elevated/60 p-3 text-xs leading-5 text-text-secondary">
                              The AI assistant compares the indexed votes and deposits against the dispute record.
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 border border-border-subtle bg-void p-4">
                          <div className="mb-2 flex items-center justify-between text-sm">
                            <span className="font-semibold text-text-primary">
                              AI analysis status
                            </span>
                            <span className="text-text-tertiary">
                              {dispute.aiAnalysis ? 'Cached' : 'Syncing'}
                            </span>
                          </div>
                          <Progress value={dispute.aiAnalysis ? 100 : 0} />
                          <p className="mt-3 text-xs leading-5 text-text-secondary">
                            {dispute.aiAnalysis
                              ? 'Cached analysis is ready for review.'
                              : 'The assistant will populate once the backend finishes processing.'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-border-subtle p-5">
                      {!isExpanded ? (
                        <Button
                          onClick={() => setExpandedDeal(Number(dispute.onChainId))}
                          className="btn-sharp border border-border-strong bg-transparent text-text-primary hover:bg-elevated"
                        >
                          Rule on this deal
                        </Button>
                      ) : (
                        <div id={`arbitration-ruling-${dispute.onChainId}`}>
                          <div className="mb-4">
                            <DisputeAIBlock
                              onChainId={Number(dispute.onChainId)}
                              isArbitrator={true}
                              disputeMode={deal?.dealType}
                              onApplyRecommendation={(outcome) => {
                                setSelectedOutcome(outcome);
                                toast('AI recommendation applied', { icon: '✦' });
                              }}
                            />
                          </div>

                          <h4 className="text-sm font-semibold text-text-primary">
                            Submit arbitrator ruling
                          </h4>
                          <p className="mt-1 text-xs leading-5 text-text-secondary">
                            The selected ruling executes on-chain. Review the AI summary and evidence before submitting.
                          </p>

                          <div className="mt-4 grid gap-2 md:grid-cols-3">
                            {options.map((option) => (
                              <button
                                key={option.value}
                                onClick={() => setSelectedOutcome(option.value)}
                                className={cn(
                                  'border p-4 text-left transition-all',
                                  selectedOutcome === option.value
                                    ? 'border-usdc bg-usdc-dim'
                                    : 'border-border-subtle bg-void hover:border-border-default',
                                )}
                              >
                                <option.icon
                                  className={cn(
                                    'h-4 w-4',
                                    selectedOutcome === option.value
                                      ? 'text-usdc'
                                      : 'text-text-tertiary',
                                  )}
                                />
                                <div className="mt-3 text-sm font-semibold text-text-primary">
                                  {option.label}
                                </div>
                                <p className="mt-1 text-xs leading-5 text-text-secondary">
                                  {option.detail}
                                </p>
                              </button>
                            ))}
                          </div>

                          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setExpandedDeal(null);
                                setSelectedOutcome(null);
                              }}
                              className="border border-border-subtle text-text-secondary hover:bg-elevated"
                            >
                              Cancel
                            </Button>
                            <Button
                              onClick={() => handleResolve(Number(dispute.onChainId))}
                              disabled={!selectedOutcome || isProcessing}
                              className="btn-sharp flex-1 bg-dispute text-white hover:bg-dispute/90"
                            >
                              {isProcessing ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Resolving
                                </>
                              ) : (
                                'Submit Ruling - This is final'
                              )}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <div className="space-y-6">
              <AIPanel />
              <InsightGrid />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DisputeAIBlock({
  onChainId,
  isArbitrator,
  disputeMode,
  onApplyRecommendation,
}: {
  onChainId: number;
  isArbitrator: boolean;
  disputeMode?: 'OneSided' | 'MutualStake';
  onApplyRecommendation: (outcome: 'PartyAWins' | 'PartyBWins' | 'Split') => void;
}) {
  const isOneSided = disputeMode === 'OneSided';

  return (
    <AIDisputeAssistant
      onChainId={onChainId}
      isArbitrator={isArbitrator}
      isOneSided={isOneSided}
      partyALabel={isOneSided ? 'Client' : 'Creator'}
      partyBLabel={isOneSided ? 'Worker' : 'Counterparty'}
      onApplyRecommendation={onApplyRecommendation}
    />
  );
}

function AIPanel() {
  return (
    <div className="border border-border-subtle bg-surface p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-text-primary">
            AI dispute workspace
          </div>
          <div className="text-xs text-text-tertiary">
            Cached analysis appears when a dispute is selected.
          </div>
        </div>
        <Sparkles className="h-5 w-5 text-usdc" />
      </div>
      <p className="mt-4 text-sm leading-6 text-text-secondary">
        The assistant surfaces the indexed dispute record, summarizes both positions, and leaves the final ruling to the arbitrator.
      </p>
      <div className="mt-4 border border-border-subtle bg-void p-3 text-xs leading-5 text-text-tertiary">
        Open a dispute to load the cached analysis and the ruling controls.
      </div>
    </div>
  );
}

function InsightGrid() {
  return (
    <div className="grid gap-3">
      {insightCards.map(([title, description, Icon, tone]) => (
        <div key={title} className="border border-border-subtle bg-surface p-4">
          <div className="flex gap-3">
            <div
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center border',
                tone === 'amber' && 'border-pending/30 bg-elevated text-pending',
                tone === 'blue' && 'border-usdc/25 bg-usdc-dim text-usdc',
                tone === 'emerald' && 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300',
                tone === 'violet' && 'border-violet/25 bg-violet-dim text-violet',
              )}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-text-primary">{title}</div>
              <p className="mt-1 text-xs leading-5 text-text-secondary">{description}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

