'use client';

import { useState } from 'react';
import { Check, Loader2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatUSDC, truncateAddress } from '@/lib/format';
import { cn } from '@/lib/utils';

type DepositStep = 'approve' | 'deposit';
type StepState = 'pending' | 'active' | 'complete';

interface DepositFlowProps {
  amount: number;
  walletAddress: string;
  onApprove?: () => Promise<void>;
  onDeposit: () => Promise<void>;
  disabled?: boolean;
}

export function DepositFlow({
  amount,
  walletAddress,
  onApprove,
  onDeposit,
  disabled = false,
}: DepositFlowProps) {
  const [currentStep, setCurrentStep] = useState<DepositStep>(onApprove ? 'approve' : 'deposit');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const steps: { key: DepositStep; label: string; description: string }[] = onApprove ? [
    {
      key: 'approve',
      label: 'Approve USDC',
      description: 'Allow the contract to access your USDC',
    },
    {
      key: 'deposit',
      label: 'Deposit',
      description: `Send ${formatUSDC(amount)} USDC to escrow`,
    },
  ] : [
    {
      key: 'deposit',
      label: 'Deposit',
      description: `Send ${formatUSDC(amount)} USDC to escrow`,
    },
  ];

  const getStepState = (stepKey: DepositStep): StepState => {
    const stepIndex = steps.findIndex((s) => s.key === stepKey);
    const currentIndex = steps.findIndex((s) => s.key === currentStep);

    if (stepIndex < currentIndex) return 'complete';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
  };

  const handleApprove = async () => {
    if (!onApprove) return;
    setIsLoading(true);
    setError(null);
    try {
      await onApprove();
      setCurrentStep('deposit');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeposit = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await onDeposit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deposit failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Progress indicator */}
      <div className="flex items-center gap-3">
        {steps.map((step, index) => {
          const state = getStepState(step.key);
          return (
            <div key={step.key} className="flex flex-1 items-center">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors',
                    state === 'complete' && 'border-clinch-success bg-clinch-success text-white',
                    state === 'active' && 'border-clinch-accent bg-clinch-accent text-white',
                    state === 'pending' && 'border-clinch-border-default bg-transparent text-clinch-text-tertiary'
                  )}
                >
                  {state === 'complete' ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={cn(
                    'text-sm font-medium',
                    state === 'active' && 'text-clinch-text-primary',
                    state !== 'active' && 'text-clinch-text-tertiary'
                  )}
                >
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'mx-3 h-0.5 flex-1',
                    getStepState(steps[index + 1].key) !== 'pending'
                      ? 'bg-clinch-accent'
                      : 'bg-clinch-border-default'
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Amount display */}
      <div className="rounded-lg bg-clinch-bg-elevated p-4 text-center">
        <div className="text-sm text-clinch-text-tertiary">Amount required</div>
        <div className="mt-1 text-2xl font-semibold text-clinch-text-primary tabular-nums">
          {formatUSDC(amount)} USDC
        </div>
      </div>

      {/* Payout address notice */}
      <div className="flex items-start gap-3 rounded-lg border border-clinch-border-default bg-clinch-bg-card p-4">
        <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-clinch-text-tertiary" />
        <div className="text-sm">
          <p className="text-clinch-text-secondary">
            Payout will go to your connected wallet:
          </p>
          <p className="mt-1 font-mono text-clinch-text-primary">
            {truncateAddress(walletAddress)}
          </p>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="rounded-lg border border-clinch-danger bg-clinch-danger-muted p-3 text-sm text-clinch-danger">
          {error}
        </div>
      )}

      {/* Action button */}
      {currentStep === 'approve' ? (
        <div className="space-y-2">
          <Button
            onClick={handleApprove}
            disabled={disabled || isLoading}
            className="w-full bg-clinch-accent py-3 text-white hover:bg-clinch-accent-hover"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Waiting for wallet...
              </>
            ) : (
              'Step 1: Approve USDC spending'
            )}
          </Button>
          <p className="text-center text-xs text-clinch-text-tertiary">
            This allows the contract to pull USDC from your wallet. It is not a transfer.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <Button
            onClick={handleDeposit}
            disabled={disabled || isLoading}
            className="w-full bg-clinch-accent py-3 text-white hover:bg-clinch-accent-hover"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Depositing...
              </>
            ) : (
              `Step 2: Deposit ${formatUSDC(amount)} USDC`
            )}
          </Button>
          <p className="text-center text-xs text-clinch-text-tertiary">
            Your funds will be held in the smart contract until the deal resolves.
          </p>
        </div>
      )}
    </div>
  );
}
