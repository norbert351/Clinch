'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { use } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  CheckCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Check,
  FileText,
  Loader2,
  RefreshCw,
  Share2,
  Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AIDisputeAssistant,
  AISummaryCard,
  DealStatusBadge,
  WalletAddress,
  ActivityTimeline,
  EmptyState,
  DepositFlow,
  DealChat,
  UnifiedBalanceCard,
} from '@/components/clinch';
import { useWallet } from '@/components/wallet-context';
import {
  useDeal,
  useRefreshDeals,
} from '@/hooks/useDeals';
import type { DealWithDeposits } from '@/lib/types';
import { useContract } from '@/hooks/useContract';
import {
  formatRelativeTime,
  formatExpiry,
  formatDate,
  formatUSDC,
} from '@/lib/format';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import type { Deal, TimelineEvent } from '@/lib/types';
import { API_URL, getToken } from '@/lib/api';
import { PLATFORM_ARBITRATOR } from '@/lib/contract';

// ─── helpers ────────────────────────────────────────────────────────────────

function AddressAvatar({ address }: { address: string }) {
  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center font-mono text-[11px] font-medium text-white"
      style={{ background: 'var(--gradient-brand)' }}
    >
      {address.slice(2, 4).toUpperCase()}
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 border border-border-subtle px-2 py-1 text-xs font-medium
        text-text-tertiary transition-colors
        hover:border-border-default hover:text-text-primary"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-active" />
          <span className="text-active">Copied</span>
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}

// ─── types ───────────────────────────────────────────────────────────────────

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

interface DealDetailPageProps {
  params: Promise<{ id: string }>;
}

// ─── page ────────────────────────────────────────────────────────────────────

export default function DealDetailPage({ params }: DealDetailPageProps) {
  const [mounted, setMounted] = useState(false);
  const [userVote, setUserVote] = useState<string | null>(null);
  const { id } = use(params);
  const onChainId = parseInt(id, 10);

  const { address, hasSigned } = useWallet();
  const { data: deal, isLoading, refetch } = useDeal(onChainId);
  const refreshDeals = useRefreshDeals();
  const queryClient = useQueryClient();
  const {
    deposit: contractDeposit,
    submitVote: contractSubmitVote,
    raiseDispute: contractRaiseDispute,
    resolveDispute: contractResolveDispute,
    requestCancel: contractRequestCancel,
    expireDeal: contractExpireDeal,
  } = useContract();

  const [selectedOutcome, setSelectedOutcome] = useState<
    'PartyAWins' | 'PartyBWins' | 'Split' | null
  >(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [hasCancelRequested, setHasCancelRequested] = useState(false);
  const rulingSectionRef = useRef<HTMLDivElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  // ── mounted guard ──────────────────────────────────────────────────────────
  useEffect(() => {
    setMounted(true);
  }, []);

  // ── socket – join deal room and invalidate query on update ─────────────────
  useEffect(() => {
    if (!onChainId || !mounted || !hasSigned || !address) return;

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
    socketRef.current = socket;

    socket.emit('join-deal', { onChainId });

    socket.on('deal-updated', () => {
      queryClient.invalidateQueries({ queryKey: ['deal', onChainId] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['disputes'] });
      queryClient.invalidateQueries({ queryKey: ['disputes', 'ai', onChainId] });
      refetch();
    });

    socket.on('connect_error', (err) => {
      console.warn('[Socket] Connection error:', err.message);
      socket.io.engine?.on('close', () => {});
    });

    return () => {
      socket.emit('leave-deal', { onChainId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [onChainId, mounted, hasSigned, address, queryClient, refetch]);

  // ── polling while syncing ──────────────────────────────────────────────────
  useEffect(() => {
    if (isLoading) {
      setSyncing(true);
      let attempts = 0;
      const maxAttempts = 15;

      const poll = async () => {
        attempts++;
        await refetch();
        if (deal || attempts >= maxAttempts) {
          setSyncing(false);
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      };

      pollRef.current = setInterval(poll, 2000);
      return () => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      };
    } else {
      setSyncing(false);
    }
  }, [isLoading, deal, refetch]);

  // ── map API deal to UI shape ───────────────────────────────────────────────
  const mapDealToUI = (d: Deal): DealCardData => {
    const dwd = d as DealWithDeposits & {
      partyAVoted?: boolean;
      partyBVoted?: boolean;
      partyAVoteOutcome?: string | null;
      partyBVoteOutcome?: string | null;
    };
    const isOneSidedDeal = d.dealType === 'OneSided';

    const isPending = isOneSidedDeal
      ? !dwd?.partyADeposited
      : d.status === 'Active' &&
        (!dwd?.partyADeposited || !dwd?.partyBDeposited);

    const isCreatorAddr = address?.toLowerCase() === d.partyA.toLowerCase();
    const creatorHasVoted = d.partyA && dwd?.partyAVoted !== undefined
      ? dwd.partyAVoted
      : false;
    const counterpartyHasVoted = d.partyB && dwd?.partyBVoted !== undefined
      ? dwd.partyBVoted
      : false;
    const userHasVoted = isCreatorAddr ? creatorHasVoted : counterpartyHasVoted;

    return {
      id: String(d.onChainId),
      title: d.title,
      description: d.description,
      status: (isPending ? 'pending' : d.status.toLowerCase()) as DealCardData['status'],
      type: d.dealType === 'MutualStake' ? 'mutual' : 'one-sided',
      creator: {
        address: d.partyA,
        depositAmount: parseFloat(d.amountA) || 0,
        hasDeposited: dwd?.partyADeposited ?? false,
        hasVoted: creatorHasVoted,
      },
      counterparty: {
        address: d.partyB,
        depositAmount: parseFloat(d.amountB) || 0,
        hasDeposited: dwd?.partyBDeposited ?? false,
        hasVoted: counterpartyHasVoted,
      },
      arbitrator: d.arbitratorWallet,
      platformFee: parseFloat(d.feePercent) || 0,
      createdAt: new Date(d.createdAt),
      expiresAt: new Date(d.expiryTimestamp),
    };
  };

  const mappedDeal = deal ? mapDealToUI(deal) : null;

  // ── action handlers ────────────────────────────────────────────────────────
  const requireAuth = (): boolean => {
    if (!address || !hasSigned) {
      toast.error('Please connect your wallet and sign in');
      return false;
    }
    return true;
  };

  const handleDeposit = async (amount: string) => {
    if (!requireAuth()) return;
    setIsProcessing(true);
    try {
      const txHash = await contractDeposit(onChainId, amount);
      if (txHash) {
        toast.success('Deposit successful!');
        queryClient.invalidateQueries({ queryKey: ['deal', onChainId] });
        queryClient.invalidateQueries({ queryKey: ['deals'] });
        refreshDeals();
        await refetch();
      }
    } catch (err) {
      console.error('[Deposit] Error:', err);
      toast.error('Failed to deposit');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmitVote = async () => {
    if (!requireAuth() || !selectedOutcome) {
      if (!selectedOutcome) toast.error('Please select an outcome');
      return;
    }
    setIsProcessing(true);
    try {
      const txHash = await contractSubmitVote(onChainId, selectedOutcome);
      if (txHash) {
        toast.success('Vote submitted!');
        setUserVote(selectedOutcome);

        // Wait for backend to process the VoteSubmitted event
        await new Promise(r => setTimeout(r, 3000));
        await refetch();
        refreshDeals();

        // After refetch, check if votes mismatch
        // The backend will have updated partyAVoteOutcome/partyBVoteOutcome
        const freshDeal = deal as DealWithDeposits & {
          partyAVoted?: boolean;
          partyBVoted?: boolean;
          partyAVoteOutcome?: string | null;
          partyBVoteOutcome?: string | null;
        };

        if (
          freshDeal?.partyAVoted &&
          freshDeal?.partyBVoted &&
          freshDeal?.partyAVoteOutcome &&
          freshDeal?.partyBVoteOutcome &&
          freshDeal.partyAVoteOutcome !== freshDeal.partyBVoteOutcome
        ) {
          toast('Votes don\'t agree — raising a dispute for arbitration', {
            icon: '⚠️',
            duration: 5000,
          });

          try {
            const disputeHash = await contractRaiseDispute(onChainId);
            if (disputeHash) {
              toast.success('Dispute raised. The arbitrator has been notified.');
              await refetch();
            }
          } catch (disputeErr: any) {
            // Dispute may already exist on-chain — not fatal
            console.warn('[Vote] raiseDispute call:', disputeErr?.message);
            if (!disputeErr?.message?.includes('already')) {
              toast('Dispute detection active. Arbitrator will be notified.', {
                icon: 'ℹ️'
              });
            }
          }
        }

        refreshDeals();
        await refetch();
      }
    } catch (err) {
      console.error('[Vote] Error:', err);
      toast.error('Failed to submit vote');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRaiseDispute = async () => {
    if (!requireAuth()) return;
    setIsProcessing(true);
    try {
      const txHash = await contractRaiseDispute(onChainId);
      if (txHash) {
        toast.success('Dispute raised!');
        refreshDeals();
        await refetch();
      }
    } catch (err) {
      console.error('[Dispute] Error:', err);
      toast.error('Failed to raise dispute');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResolveDispute = async () => {
    if (!requireAuth() || !selectedOutcome) {
      if (!selectedOutcome) toast.error('Please select an outcome');
      return;
    }
    setIsProcessing(true);
    try {
      const txHash = await contractResolveDispute(onChainId, selectedOutcome);
      if (txHash) {
        toast.success('Dispute resolved!');
        refreshDeals();
        await refetch();
      }
    } catch (err) {
      console.error('[Resolve] Error:', err);
      toast.error('Failed to resolve dispute');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRequestCancel = async () => {
    if (!requireAuth()) return;
    setIsProcessing(true);
    try {
      const txHash = await contractRequestCancel(onChainId);
      if (txHash) {
        setHasCancelRequested(true);
        toast.success('Cancel request submitted. Waiting for counterparty.');
        refreshDeals();
        await refetch();
      }
    } catch (err) {
      console.error('[Cancel] Error:', err);
      toast.error('Failed to request cancel');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExpireDeal = async () => {
    if (!requireAuth()) return;
    setIsProcessing(true);
    try {
      const txHash = await contractExpireDeal(onChainId);
      if (txHash) {
        toast.success('Deal expired — funds returned.');
        refreshDeals();
        await refetch();
      }
    } catch (err) {
      console.error('[Expire] Error:', err);
      toast.error('Failed to expire deal');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── skeleton on server + before mount ─────────────────────────────────────
  if (!mounted) {
    return (
      <div className="flex flex-col gap-4 p-8">
        <div className="h-8 w-48 animate-pulse bg-elevated" />
        <div className="h-64 animate-pulse bg-elevated" />
        <div className="h-48 animate-pulse bg-elevated" />
      </div>
    );
  }

  if (isLoading || syncing) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-usdc" />
        {syncing && (
          <div className="mt-4 flex items-center gap-2 text-sm text-text-secondary">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Syncing deal with blockchain…</span>
          </div>
        )}
      </div>
    );
  }

  if (!mappedDeal) {
    return (
      <div className="px-4 pb-16 pt-8 md:px-8">
        <div className="mx-auto max-w-5xl">
          <Link
            href="/dashboard"
            className="mb-6 inline-flex items-center gap-2 text-sm text-text-tertiary
              transition-colors hover:text-text-secondary"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
          <EmptyState
            icon={FileText}
            title="Deal not found"
            description="This deal does not exist or has not been indexed yet."
            action={
              <Link href="/deals/new">
                <Button className="btn-sharp gap-2 bg-usdc text-white hover:bg-[#1A5FA8]">
                  Create a new deal
                </Button>
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  // ── derived values ─────────────────────────────────────────────────────────
  const d = mappedDeal;
  const isOneSided = d.type === 'one-sided';
  const isCreator = address?.toLowerCase() === d.creator.address.toLowerCase();
  const isCounterparty =
    address?.toLowerCase() === d.counterparty.address.toLowerCase();

  const isFinalized = d.status === 'resolved' || d.status === 'cancelled' || d.status === 'expired';

  // Arbitrator: treat zero-address as "no arbitrator set"
  const isZeroAddress =
    !d.arbitrator ||
    d.arbitrator === '0x0000000000000000000000000000000000000000';
  const effectiveArbitrator = (isZeroAddress ? PLATFORM_ARBITRATOR : d.arbitrator) ?? PLATFORM_ARBITRATOR;
  const displayArbitrator = effectiveArbitrator;
  const isArbitrator =
    !!address &&
    address.toLowerCase() === effectiveArbitrator.toLowerCase();
  const isParty = isCreator || isCounterparty;

  const userParty = isCreator ? d.creator : d.counterparty;

  const timelineEvents: TimelineEvent[] = [];

  const totalAmount = d.creator.depositAmount + d.counterparty.depositAmount;
  const expiry = formatExpiry(d.expiresAt);

  const partyALabel = isOneSided ? 'Client' : 'Creator';
  const partyBLabel = isOneSided ? 'Worker' : 'Counterparty';
  const depositLabel = isOneSided ? 'Escrow payment' : 'Creator deposit';

  // Status-aware deposit display — resolved/closed deals should never show "Awaiting deposit"
  function getDepositStatus(hasDeposited: boolean): {
    icon: typeof CheckCircle | typeof Clock | typeof Check;
    label: string;
    color: string;
  } {
    const isTerminal = d.status === 'resolved' || d.status === 'cancelled' || d.status === 'expired';
    const isDisputed = d.status === 'disputed';

    if (isTerminal) {
      return { icon: CheckCircle, label: 'Settled', color: 'text-text-tertiary' };
    }
    if (isDisputed) {
      return hasDeposited
        ? { icon: CheckCircle, label: 'Locked (In Dispute)', color: 'text-pending' }
        : { icon: Clock, label: 'Locked', color: 'text-text-tertiary' };
    }
    if (hasDeposited) {
      return { icon: CheckCircle, label: 'Deposited', color: 'text-active' };
    }
    return { icon: Clock, label: isOneSided ? 'Awaiting payment' : 'Awaiting deposit', color: 'text-pending' };
  }

  const creatorDeposit = getDepositStatus(d.creator.hasDeposited);
  const counterpartyDeposit = getDepositStatus(d.counterparty.hasDeposited);

  // FIX: OneSided must have BOTH outcome options so creator can say
  // "work done → pay worker" OR "work not done → refund me".
  // Split is hidden for OneSided (makes no sense for freelance escrow).
  // Labels differ by party for OneSided.
  const outcomeOptions = isOneSided
    ? isCreator
      ? [
          {
            value: 'PartyBWins' as const,
            label: 'Work completed',
            description: `Payment released to ${partyBLabel}`,
            icon: TrendingDown,
          },
          {
            value: 'PartyAWins' as const,
            label: 'Work NOT completed',
            description: `Funds returned to ${partyALabel}`,
            icon: TrendingUp,
          },
        ]
      : [
          {
            value: 'PartyBWins' as const,
            label: 'I completed the work',
            description: 'Payment released to you',
            icon: TrendingDown,
          },
          {
            value: 'PartyAWins' as const,
            label: 'Work was not completed',
            description: 'Funds returned to client',
            icon: TrendingUp,
          },
        ]
    : [
        {
          value: 'PartyAWins' as const,
          label: `${partyALabel} wins`,
          description: 'All funds go to creator',
          icon: TrendingUp,
        },
        {
          value: 'PartyBWins' as const,
          label: `${partyBLabel} wins`,
          description: 'All funds go to counterparty',
          icon: TrendingDown,
        },
        {
          value: 'Split' as const,
          label: 'Split (refund)',
          description: 'Each party receives their deposit back',
          icon: Minus,
        },
      ];

  // invite link — only meaningful while counterparty has not deposited
  const showInviteLink =
    isCreator &&
    deal?.inviteToken &&
    !d.counterparty.hasDeposited &&
    (d.status === 'active' || d.status === 'pending');

  const inviteUrl =
    typeof window !== 'undefined' && deal?.inviteToken
      ? `${window.location.origin}/deals/invite/${deal.inviteToken}`
      : '';

  // conditions that control the action panel sections
  const needsDeposit =
    (d.status === 'active' || d.status === 'pending') &&
    isParty &&
    !userParty.hasDeposited &&
    (!isOneSided || isCreator); // counterparty never deposits on one-sided

  const canVote =
    d.status === 'active' &&
    isParty &&
    !userParty.hasVoted &&
    !userVote &&
    // for mutual stake both must have deposited; for one-sided only creator
    (isOneSided
      ? d.creator.hasDeposited
      : d.creator.hasDeposited && d.counterparty.hasDeposited);

  const canCancel = d.status === 'active' && isParty;
  const canExpire = expiry.isExpired && d.status === 'active';
  const handleApplyAIRecommendation = (outcome: 'PartyAWins' | 'PartyBWins' | 'Split') => {
    setSelectedOutcome(outcome);
    toast('Recommendation applied — scroll down to confirm', {
      icon: '✦',
      duration: 4000,
    });
    rulingSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="px-4 pb-16 pt-8 md:px-8">
      <div className="mx-auto max-w-7xl">
        {/* back link */}
        <Link
          href="/dashboard"
          className="mb-6 inline-flex items-center gap-2 text-sm text-text-tertiary
            transition-colors hover:text-text-secondary"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to dashboard
        </Link>

        {/* status row */}
        <div className="mb-6">
          <div className="mb-1 flex items-center gap-3">
            <span className="font-mono text-[14px] text-text-tertiary">
              #{onChainId}
            </span>
            <DealStatusBadge status={d.status} />
            <span className="border border-border-subtle px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-text-tertiary">
              {d.type === 'mutual' ? 'MUTUAL STAKE' : 'ONE-SIDED'}
            </span>
          </div>
          <h1 className="font-sans text-[24px] font-semibold text-text-primary">
            {d.title || 'Untitled Agreement'}
          </h1>
          <p className="mt-1 font-mono text-[11px] text-text-tertiary">
            Created {formatRelativeTime(d.createdAt)}
          </p>
          {d.description && (
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary">
              {d.description}
            </p>
          )}
        </div>

        {/* description */}
        {false && d.description && (
          <p className="mb-6 max-w-2xl text-sm leading-relaxed text-text-secondary">
            {d.description}
          </p>
        )}

        {/* invite link */}
        {showInviteLink && (
          <div className="mb-6 border border-dashed border-border-default bg-elevated p-4">
            <p className="mb-1 font-sans text-[11px] font-medium uppercase tracking-[0.12em] text-text-tertiary">
              Share with Counterparty
            </p>
            <p className="mb-3 text-xs text-text-tertiary">
              Send this link so your counterparty can review and deposit their
              share.
            </p>
            <div className="flex items-center gap-2 border border-border-subtle bg-surface px-3 py-2">
              <span className="flex-1 truncate font-mono text-xs text-text-secondary">
                {inviteUrl}
              </span>
              <CopyButton value={inviteUrl} />
              <button
                onClick={() => window.open(inviteUrl, '_blank')}
                className="p-1 text-text-tertiary transition-colors
                  hover:text-text-secondary"
                aria-label="Open invite link"
              >
                <Share2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mt-2 text-xs text-text-tertiary">
              This link expires when the deal expires or is cancelled.
            </p>
          </div>
        )}

        {/* two-column layout */}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* ── left column ── */}
          <div className="order-2 space-y-6 lg:order-1">
            {/* parties card */}
            <div className="mb-4 border border-border-subtle bg-surface">
              <div className="border-b border-border-subtle px-5 py-3">
                <p className="font-sans text-[11px] font-medium uppercase tracking-[0.14em] text-text-tertiary">
                  Parties & Deposits
                </p>
              </div>

              <div className="divide-y divide-border-subtle">
                {/* party A (creator / client) */}
                <div className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3">
                    <AddressAvatar address={d.creator.address} />
                    <div>
                      <WalletAddress address={d.creator.address} />
                      <div className="font-sans text-[10px] uppercase tracking-wide text-text-tertiary">
                        {partyALabel} {isCreator && '(You)'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-[15px] text-text-primary">
                      {formatUSDC(d.creator.depositAmount)} <span className="text-[11px] text-text-secondary">USDC</span>
                    </div>
                    <div className="mt-1 flex items-center justify-end gap-2">
                    <creatorDeposit.icon className={`h-4 w-4 ${creatorDeposit.color}`} />
                    <span className={`font-mono text-xs ${creatorDeposit.color}`}>
                      {creatorDeposit.label}
                    </span>
                    </div>
                  </div>
                </div>

                {/* party B (counterparty / worker) */}
                <div className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3">
                    <AddressAvatar address={d.counterparty.address} />
                    <div>
                      <WalletAddress address={d.counterparty.address} />
                      <div className="font-sans text-[10px] uppercase tracking-wide text-text-tertiary">
                        {partyBLabel} {isCounterparty && '(You)'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-[15px] text-text-primary">
                      {formatUSDC(d.counterparty.depositAmount)} <span className="text-[11px] text-text-secondary">USDC</span>
                    </div>
                    <div className="mt-1 flex items-center justify-end gap-2">
                    {isOneSided ? (
                      <>
                        <CheckCircle className="h-4 w-4 text-text-tertiary" />
                        <span className="font-mono text-xs text-text-tertiary">
                          {d.status === 'resolved' || d.status === 'cancelled' || d.status === 'expired' ? 'Settled' : 'No deposit required'}
                        </span>
                      </>
                    ) : (
                      <>
                        <counterpartyDeposit.icon className={`h-4 w-4 ${counterpartyDeposit.color}`} />
                        <span className={`font-mono text-xs ${counterpartyDeposit.color}`}>
                          {counterpartyDeposit.label}
                        </span>
                      </>
                    )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-border-default px-5 py-3">
                <span className="font-sans text-[11px] uppercase tracking-[0.12em] text-text-tertiary">Total Escrowed</span>
                <span className="font-mono text-[18px] text-text-primary">
                  {formatUSDC(totalAmount)} <span className="text-[12px] text-text-secondary">USDC</span>
                </span>
              </div>
            </div>

            <DealChat
              onChainId={onChainId}
              status={d.status}
              dealType={deal?.dealType || (isOneSided ? 'OneSided' : 'MutualStake')}
              currentWallet={address}
              currentRole={
                isArbitrator
                  ? 'arbitrator'
                  : isCreator
                    ? isOneSided ? 'client' : 'creator'
                    : isCounterparty
                      ? isOneSided ? 'worker' : 'counterparty'
                      : undefined
              }
              isParticipant={Boolean(isParty)}
              isArbitrator={Boolean(isArbitrator)}
            />

            {d.status === 'resolved' && (
              <AISummaryCard
                title="AI settlement report"
                summary={deal?.aiSettlementSummary}
                generatedAt={deal?.aiSummaryGeneratedAt}
                status={deal?.aiSettlementSummary ? 'Generated' : deal?.aiSummaryStatus}
              />
            )}

            {d.status === 'disputed' && (
              <AISummaryCard
                title="AI dispute briefing"
                summary={deal?.aiDisputeSummary}
                generatedAt={deal?.aiSummaryGeneratedAt}
                status={deal?.aiDisputeSummary ? 'Generated' : deal?.aiSummaryStatus}
              />
            )}

            {d.status === 'disputed' && (
              <AIDisputeAssistant
                onChainId={onChainId}
                isArbitrator={isArbitrator}
                isOneSided={isOneSided}
                partyALabel={partyALabel}
                partyBLabel={partyBLabel}
                onApplyRecommendation={isArbitrator ? handleApplyAIRecommendation : undefined}
              />
            )}

            {/* deal terms card */}
            <div className="border border-border-subtle bg-surface p-6">
              <h3 className="mb-4 text-base font-semibold text-text-primary">
                Deal terms
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-tertiary">{depositLabel}</span>
                  <span className="text-text-primary">
                    {formatUSDC(d.creator.depositAmount)} USDC
                  </span>
                </div>

                {isOneSided ? (
                  <div className="flex justify-between">
                    <span className="text-text-tertiary">
                      Net payout to {partyBLabel}
                    </span>
                    <span className="text-text-primary">
                      {formatUSDC(
                        d.creator.depositAmount * (1 - d.platformFee / 10000)
                      )}{' '}
                      USDC
                    </span>
                  </div>
                ) : (
                  <div className="flex justify-between">
                    <span className="text-text-tertiary">
                      {partyBLabel} deposit
                    </span>
                    <span className="text-text-primary">
                      {formatUSDC(d.counterparty.depositAmount)} USDC
                    </span>
                  </div>
                )}

                <div className="flex justify-between">
                  <span className="text-text-tertiary">Platform fee</span>
                  <span className="text-text-primary">
                    {(d.platformFee / 100).toFixed(1)}%
                  </span>
                </div>

                {d.status === 'active' && !isOneSided && (
                  <div className="flex justify-between text-xs">
                    <span className="text-text-tertiary">Payout to winner</span>
                    <span className="text-active">
                      {formatUSDC(
                        totalAmount * (1 - d.platformFee / 10000)
                      )} USDC
                    </span>
                  </div>
                )}

                <div className="flex justify-between">
                  <span className="text-text-tertiary">Arbitrator</span>
                  <span className="text-text-primary">
                    {displayArbitrator.slice(0, 6)}…{displayArbitrator.slice(-4)}
                    <span className="ml-1 text-xs text-text-tertiary">(Platform)</span>
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-text-tertiary">Created</span>
                  <span className="text-text-primary">
                    {formatDate(d.createdAt)}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-text-tertiary">Expires</span>
                  <span
                    className={cn(
                      'text-text-primary',
                      expiry.isExpired && 'text-dispute'
                    )}
                  >
                    {formatDate(d.expiresAt)} ({expiry.text})
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-text-tertiary">Deal type</span>
                  <span className="text-text-primary">
                    {d.type === 'mutual' ? 'Mutual Stake' : 'One-Sided'}
                  </span>
                </div>
              </div>
            </div>

            {/* timeline card */}
            <div className="border border-border-subtle bg-surface p-6">
              <h3 className="mb-4 text-base font-semibold text-text-primary">
                Activity timeline
              </h3>
              <ActivityTimeline events={timelineEvents} />
            </div>
          </div>

          {/* ── right column — action panel ── */}
          <div className="order-1 lg:order-2 lg:sticky lg:top-4 lg:h-fit">
            <div className="border border-border-subtle bg-surface p-6">
              {/* total locked */}
              <div className="mb-4 text-center">
                <div className="font-mono text-3xl text-text-primary">
                  {formatUSDC(totalAmount)} <span className="text-sm text-text-secondary">USDC</span>
                </div>
                <div className="text-xs text-text-tertiary">
                  Total locked
                </div>
              </div>

              <div className="rule-gradient mb-6" />

              {/* connected-as row */}
              {address && (
                <div className="mb-4 bg-elevated px-3 py-2 text-xs">
                  <span className="text-text-tertiary">Connected as: </span>
                  <span className="font-mono text-text-secondary">
                    {address.slice(0, 6)}…{address.slice(-4)}
                  </span>
                  {isParty && (
                    <span className="text-text-tertiary">
                      {' '}
                      ({isCreator ? partyALabel : partyBLabel})
                    </span>
                  )}
                  {isArbitrator && (
                    <span className="text-text-tertiary"> (Arbitrator)</span>
                  )}
                </div>
              )}

              {/* ── SCENARIO 1: deposit required ── */}
              {needsDeposit && (
                <>
                  <h4 className="mb-1 text-h4 text-text-primary">
                    {isOneSided ? 'Fund this escrow' : 'Your deposit is required'}
                  </h4>
                  <p className="mb-4 text-sm text-text-secondary">
                    {isOneSided
                      ? `Deposit ${formatUSDC(userParty.depositAmount)} USDC to fund this escrow. ${partyBLabel} receives payment on completion.`
                      : 'To activate this deal, deposit your share of the funds.'}
                  </p>

                  {/* payout reminder */}
                  <div className="mb-4 border border-border-subtle
                    bg-elevated px-3 py-2 text-xs text-text-tertiary">
                    Payout will go to:{' '}
                    <span className="font-mono">
                      {address?.slice(0, 6)}…{address?.slice(-4)}
                    </span>
                  </div>

                  {/* FIX: proper JSX — no broken ternary, no orphan fragments */}
                  <DepositFlow
                    amount={userParty.depositAmount}
                    walletAddress={address!}
                    onDeposit={async () => {
                      await handleDeposit(String(userParty.depositAmount));
                    }}
                  />

                  {isProcessing && (
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-usdc" />
                      <span className="text-sm text-text-secondary">
                        Processing…
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* ── SCENARIO 1b: counterparty on one-sided deal ── */}
              {isOneSided &&
                isCounterparty &&
                (d.status === 'active' || d.status === 'pending') &&
                d.creator.hasDeposited && (
                  <div className="border border-border-subtle
                    bg-elevated p-4">
                    <h4 className="mb-1 text-sm font-medium text-text-primary">
                      You have been hired
                    </h4>
                    <p className="text-xs text-text-secondary">
                      The client has locked{' '}
                      {formatUSDC(d.creator.depositAmount)} USDC in escrow.
                      Complete the work then both parties submit the outcome.
                    </p>
                    <p className="mt-2 text-xs font-medium text-active">
                      Your potential payout:{' '}
                      {formatUSDC(
                        d.creator.depositAmount * (1 - d.platformFee / 10000)
                      )}{' '}
                      USDC
                    </p>
                  </div>
                )}

              {/* ── SCENARIO 2: submit outcome / vote ── */}
              {canVote && (
                <>
                  <h4 className="mb-1 text-h4 text-text-primary">
                    Submit your outcome
                  </h4>
                  <p className="mb-4 text-sm text-text-secondary">
                    What was the result of this agreement?
                  </p>

                  <div className="space-y-2">
                    {outcomeOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setSelectedOutcome(option.value)}
                        className={cn(
                          'flex w-full items-center gap-3 border p-4 text-left transition-all',
                          selectedOutcome === option.value
                            ? 'border-usdc bg-usdc-dim'
                            : 'border-border-subtle hover:border-border-default'
                        )}
                      >
                        <option.icon
                          className={cn(
                            'h-5 w-5 shrink-0',
                            selectedOutcome === option.value
                              ? 'text-usdc'
                              : 'text-text-tertiary'
                          )}
                        />
                        <div>
                          <div className="font-medium text-text-primary">
                            {option.label}
                          </div>
                          <div className="text-xs text-text-tertiary">
                            {option.description}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  <Button
                    onClick={handleSubmitVote}
                    disabled={!selectedOutcome || isProcessing}
                    className="mt-4 w-full bg-usdc text-white
                      hover:bg-[#1A5FA8] disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Submitting…
                      </>
                    ) : (
                      'Submit outcome'
                    )}
                  </Button>

                  <div className="my-4 border-t border-border-subtle" />

                  <Button
                    variant="ghost"
                    onClick={handleRaiseDispute}
                    disabled={isProcessing}
                    className="w-full border border-border-subtle
                      text-text-secondary hover:border-border-default"
                  >
                    Raise a dispute instead
                  </Button>
                  <p className="mt-2 text-center text-xs text-text-tertiary">
                    Disputes can be raised 24 hours after deal creation
                  </p>
                </>
              )}

              {/* ── SCENARIO 3: waiting for other party ── */}
              {d.status === 'active' &&
                isParty &&
                (userParty.hasVoted || userVote) && (
                  <div className="border border-border-subtle
                    bg-elevated p-4">
                    <p className="text-sm font-medium text-text-primary">
                      Your outcome is submitted
                    </p>
                    {userVote && (
                      <p className="mt-1 text-xs text-active">
                        You voted: {userVote === 'PartyAWins' ? 'Party A Wins' : userVote === 'PartyBWins' ? 'Party B Wins' : 'Split'}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-text-secondary">
                      Waiting for the other party to submit their outcome…
                    </p>
                  </div>
                )}

              {/* ── SCENARIO 4: arbitrator ruling ── */}
              {d.status === 'disputed' && isArbitrator && (
                <div ref={rulingSectionRef}>
                  <div className="mb-4 border border-pending/40 bg-pending/10 p-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-pending" />
                      <div>
                        <p className="text-sm font-medium text-pending">
                          You are the designated arbitrator
                        </p>
                        <p className="mt-1 text-xs text-text-secondary">
                          Your ruling executes on-chain immediately and is
                          final. It cannot be undone.
                        </p>
                      </div>
                    </div>
                  </div>

                  <h4 className="mb-4 text-h4 text-text-primary">
                    Submit ruling
                  </h4>

                  <div className="space-y-2">
                    {outcomeOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setSelectedOutcome(option.value)}
                        className={cn(
                          'flex w-full items-center gap-3 border p-4 text-left transition-all',
                          selectedOutcome === option.value
                            ? 'border-usdc bg-usdc-dim'
                            : 'border-border-subtle hover:border-border-default'
                        )}
                      >
                        <option.icon
                          className={cn(
                            'h-5 w-5 shrink-0',
                            selectedOutcome === option.value
                              ? 'text-usdc'
                              : 'text-text-tertiary'
                          )}
                        />
                        <div>
                          <div className="font-medium text-text-primary">
                            {option.label}
                          </div>
                          <div className="text-xs text-text-tertiary">
                            {option.description}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  <Button
                    onClick={handleResolveDispute}
                    disabled={!selectedOutcome || isProcessing}
                    className="mt-4 w-full border border-dispute
                      bg-dispute/10 text-dispute
                      hover:bg-dispute/20 disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Resolving…
                      </>
                    ) : (
                      'Submit ruling'
                    )}
                  </Button>
                </div>
              )}

              {/* ── SCENARIO 5: under arbitration (party view) ── */}
              {d.status === 'disputed' && isParty && !isArbitrator && (
                <div className="border border-pending/40 bg-pending/10 p-4">
                  <h4 className="font-medium text-pending">
                    Under arbitration
                  </h4>
                  <p className="mt-2 text-sm text-text-secondary">
                    The arbitrator has been notified. They have 24 hours to
                    rule before the platform admin can step in.
                  </p>
                </div>
              )}

              {/* ── SCENARIO 6: resolved ── */}
              {d.status === 'resolved' && (
                <div className="flex flex-col items-center text-center">
                  <div className="flex h-12 w-12 items-center justify-center
                    rounded-full bg-active/10">
                    <Check className="h-6 w-6 text-active" />
                  </div>
                  <h4 className="mt-3 text-h4 text-text-primary">
                    Settlement complete
                  </h4>
                  <p className="mt-1 text-sm text-text-secondary">
                    Funds have been sent to the winning wallet.
                  </p>
                  <div className="mt-4 w-full space-y-2 bg-elevated p-4 text-left">
                    <div className="flex justify-between text-sm">
                      <span className="text-text-tertiary">Total deposited</span>
                      <span>{formatUSDC(totalAmount)} USDC</span>
                    </div>
                    <div className="flex justify-between text-sm text-dispute">
                      <span>Platform fee ({(d.platformFee / 100).toFixed(1)}%)</span>
                      <span>- {formatUSDC(totalAmount * d.platformFee / 10000)} USDC</span>
                    </div>
                    <div className="flex justify-between text-sm font-medium text-active">
                      <span>Winner received</span>
                      <span>{formatUSDC(totalAmount * (1 - d.platformFee / 10000))} USDC</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── SCENARIO 7: cancelled ── */}
              {d.status === 'cancelled' && (
                <div className="flex flex-col items-center text-center">
                  <h4 className="text-h4 text-text-primary">
                    Deal cancelled
                  </h4>
                  <p className="mt-2 text-sm text-text-secondary">
                    All deposited funds have been returned.
                  </p>
                </div>
              )}

              {/* ── SCENARIO 8: expired ── */}
              {d.status === 'expired' && (
                <div className="flex flex-col items-center text-center">
                  <div className="flex h-12 w-12 items-center justify-center
                    rounded-full bg-elevated">
                    <Clock className="h-6 w-6 text-text-tertiary" />
                  </div>
                  <h4 className="mt-3 text-h4 text-text-primary">
                    Deal expired
                  </h4>
                  <p className="mt-2 text-sm text-text-secondary">
                    All deposited funds have been returned.
                  </p>
                </div>
              )}

              {/* ── mutual cancel (bottom of active panel) ── */}
              {canCancel && (
                <div className="mt-6 border-t border-border-subtle pt-4">
                  {hasCancelRequested ? (
                    <div className="bg-elevated px-3 py-2 text-center">
                      <p className="text-xs text-text-secondary">
                        You have requested cancellation.
                      </p>
                      <p className="text-xs text-text-tertiary">
                        Waiting for the other party to confirm.
                      </p>
                    </div>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        onClick={handleRequestCancel}
                        disabled={isProcessing}
                        className="w-full border border-border-subtle
                          text-text-tertiary hover:text-dispute
                          hover:border-dispute"
                      >
                        {isProcessing ? 'Processing...' : 'Request mutual cancel'}
                      </Button>
                      <p className="mt-1 text-center text-xs text-text-tertiary">
                        Both parties must request. All deposits will be returned.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* expire deal card */}
            {canExpire && (
              <div className="mt-4 border border-border-subtle
                bg-elevated p-4">
                <p className="text-sm text-text-secondary">
                  This deal has passed its expiry date. Funds can be reclaimed.
                </p>
                <Button
                  variant="ghost"
                  onClick={handleExpireDeal}
                  disabled={isProcessing}
                  className="mt-2 w-full border border-border-subtle
                    text-text-secondary hover:text-text-primary"
                >
                  {isProcessing ? 'Processing…' : 'Trigger expiry and reclaim funds'}
                </Button>
              </div>
            )}
            {needsDeposit && (
              <div className="mt-4">
                <UnifiedBalanceCard />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

