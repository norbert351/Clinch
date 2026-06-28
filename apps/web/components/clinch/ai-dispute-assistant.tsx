'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useWalletClient } from 'wagmi';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  generateDisputeAIAnalysis,
  getDisputeAIAnalysis,
} from '@/lib/api';
import type { DisputeAIAnalysis } from '@/lib/types';

interface AIDisputeAssistantProps {
  onChainId: number;
  isArbitrator: boolean;
  isOneSided: boolean;
  partyALabel: string;
  partyBLabel: string;
  onApplyRecommendation?: (
    outcome: 'PartyAWins' | 'PartyBWins' | 'Split'
  ) => void;
  initialAnalysis?: DisputeAIAnalysis | null;
}

function outcomeLabel(
  outcome: 'PartyAWins' | 'PartyBWins' | 'Split',
  isOneSided: boolean,
  partyALabel: string,
  partyBLabel: string,
): string {
  if (outcome === 'PartyAWins') {
    return isOneSided ? 'Refund client' : `${partyALabel} wins`;
  }
  if (outcome === 'PartyBWins') {
    return isOneSided ? 'Pay worker' : `${partyBLabel} wins`;
  }
  return 'Split — each party recovers their deposit';
}

function confidenceClass(confidence: DisputeAIAnalysis['confidence']): string {
  if (confidence === 'High') return 'border-[--status-active] text-[--status-active]';
  if (confidence === 'Medium') return 'border-[--status-pending] text-[--status-pending]';
  return 'border-[--border-subtle] text-[--text-tertiary]';
}

function ScoreBar({
  label,
  score,
  isLeading,
}: {
  label: string;
  score: number;
  isLeading: boolean;
}) {
  const width = Math.min(100, Math.max(0, score * 10));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-sans text-[--text-secondary]">{label}</span>
        <span className="font-mono text-[10px] text-[--text-tertiary]">{score}/10</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-[--bg-elevated]">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            isLeading ? 'bg-[--status-active]' : 'bg-[--text-tertiary]',
          )}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

export function AIDisputeAssistant({
  onChainId,
  isArbitrator,
  isOneSided,
  partyALabel,
  partyBLabel,
  onApplyRecommendation,
  initialAnalysis,
}: AIDisputeAssistantProps) {
  const [analysis, setAnalysis] = useState<DisputeAIAnalysis | null>(initialAnalysis ?? null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCoolingDown, setIsCoolingDown] = useState(false);
  const [expanded, setExpanded] = useState(Boolean(initialAnalysis));
  const cooldownRef = useRef(false);
  const { data: walletClient } = useWalletClient();

  function startFailureCooldown() {
    cooldownRef.current = true;
    setIsCoolingDown(true);
    setTimeout(() => {
      cooldownRef.current = false;
      setIsCoolingDown(false);
    }, 5000);
  }

  useEffect(() => {
    let cancelled = false;

    if (initialAnalysis) {
      setAnalysis(initialAnalysis);
      setExpanded(true);
      return;
    }

    async function loadCachedAnalysis() {
      const cached = await getDisputeAIAnalysis(onChainId);
      if (cancelled) return;
      if (cached) {
        setAnalysis(cached);
        setExpanded(true);
      }
    }

    void loadCachedAnalysis();

    return () => {
      cancelled = true;
    };
  }, [initialAnalysis, onChainId]);

  async function handleGenerate() {
    if (isLoading || cooldownRef.current) return;

    if (!walletClient) {
      toast.error('Wallet not connected. Please connect your wallet.');
      return;
    }

    setIsLoading(true);
    try {
      console.log(
        '[AI Dispute] Initiating x402 payment for deal:',
        onChainId,
      );

      toast('Processing payment...', {
        id: 'x402-payment',
        duration: 30000,
      });

      const result = await generateDisputeAIAnalysis(
        onChainId,
        walletClient,
      );

      toast.dismiss('x402-payment');

      if (result) {
        setAnalysis(result);
        setExpanded(true);
        toast.success('AI analysis complete · $0.001 USDC paid');
      } else {
        toast.error('Analysis unavailable. Try again.');
        startFailureCooldown();
      }
    } catch (err: any) {
      toast.dismiss('x402-payment');

      const message = err?.message || '';
      const lowerMessage = message.toLowerCase();

      if (lowerMessage.includes('insufficient') ||
          lowerMessage.includes('balance')) {
        toast(
          'Insufficient USDC on Base Sepolia. Get testnet USDC at faucet.circle.com',
          { duration: 10000 },
        );
      } else if (message.includes('USDC')) {
        toast.error(message, { duration: 8000 });
      } else if (lowerMessage.includes('payment')) {
        toast.error(
          'Payment failed. Ensure you have USDC on Base Sepolia.',
          { duration: 8000 },
        );
      } else if (lowerMessage.includes('rejected') ||
                 lowerMessage.includes('denied')) {
        toast('Payment cancelled.');
      } else {
        toast.error('Analysis failed. Try again.');
      }
      startFailureCooldown();
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRegenerate() {
    if (isLoading || cooldownRef.current) return;

    setAnalysis(null);
    setExpanded(false);
    await handleGenerate();
  }

  if (isLoading) {
    return (
      <div className="border border-[--border-subtle] bg-[--bg-surface] p-5">
        <div className="flex items-center gap-3">
          <Loader2 className="h-4 w-4 animate-spin text-[--accent-usdc]" />
          <div>
            <div className="font-sans text-sm font-semibold text-[--text-primary]">
              Analyzing dispute...
            </div>
            <div className="mt-1 font-sans text-xs text-[--text-tertiary]">
              Reading deal context, votes, and chat history
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="border border-[--border-subtle] bg-[--bg-surface] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 font-sans text-sm font-semibold text-[--text-primary]">
              ✦ AI Dispute Assistant
            </div>
            <p className="mt-2 font-sans text-[13px] leading-relaxed text-[--text-secondary]">
              Get an AI analysis of this dispute
            </p>
          </div>
          <div className="text-right">
            <Button
              onClick={handleGenerate}
              disabled={isLoading || isCoolingDown || !walletClient}
              className="bg-[--accent-usdc] font-sans font-semibold text-white hover:bg-[--accent-usdc]"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  Processing payment...
                </>
              ) : isCoolingDown ? (
                'Please wait...'
              ) : !walletClient ? (
                'Connect wallet to analyze'
              ) : (
                'Analyze · $0.001 USDC'
              )}
            </Button>
            <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
              Powered by Circle Nanopayments · Base Sepolia
            </p>
          </div>
        </div>
      </div>
    );
  }

  const label = outcomeLabel(
    analysis.recommendedOutcome,
    isOneSided,
    partyALabel,
    partyBLabel,
  );
  const creatorScore = analysis.creatorScore ?? 5;
  const counterpartyScore = analysis.counterpartyScore ?? 5;

  return (
    <div className="border border-[--border-subtle] bg-[--bg-surface] p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 font-sans text-sm font-semibold text-[--text-primary]">
          ✦ AI Dispute Assistant
        </div>
        <div
          className={cn(
            'border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em]',
            confidenceClass(analysis.confidence),
          )}
        >
          {analysis.confidence} confidence
        </div>
      </div>

      <p className="mt-4 font-sans text-[13px] leading-relaxed text-[--text-secondary]">
        {analysis.analysis}
      </p>

      <div className="mt-5 space-y-4">
        <ScoreBar
          label={`${partyALabel} position`}
          score={creatorScore}
          isLeading={creatorScore >= counterpartyScore}
        />
        <ScoreBar
          label={`${partyBLabel} position`}
          score={counterpartyScore}
          isLeading={counterpartyScore >= creatorScore}
        />
      </div>

      <div className="mt-5 border-l-2 border-[--accent-usdc] bg-[--bg-elevated] px-4 py-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[--text-tertiary]">
          AI recommendation
        </div>
        <div className="mt-1 font-sans text-[15px] font-semibold text-[--text-primary]">
          {label}
        </div>
        {analysis.reasoning && (
          <p className="mt-2 font-sans text-xs leading-relaxed text-[--text-secondary]">
            {analysis.reasoning}
          </p>
        )}
      </div>

      {isArbitrator && onApplyRecommendation && (
        <Button
          onClick={() => {
            onApplyRecommendation(analysis.recommendedOutcome);
            toast('Recommendation applied — review and confirm');
          }}
          className="mt-5 w-full bg-[--accent-usdc] font-sans font-semibold text-white hover:bg-[--accent-usdc]"
        >
          Apply · {label}
        </Button>
      )}

      {analysis.cached && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={isLoading || isCoolingDown}
            className="font-mono text-[10px] text-[--text-tertiary] hover:text-[--text-secondary]"
          >
            Regenerate
          </button>
        </div>
      )}

      <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-[--text-tertiary]">
        AI advisory only · arbitrator decides on-chain
      </div>
    </div>
  );
}
