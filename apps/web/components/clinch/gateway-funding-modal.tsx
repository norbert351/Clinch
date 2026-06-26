'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { formatUSDC } from '@/lib/format';
import { useUnifiedBalance } from '@/hooks/useUnifiedBalance';
import { arcTestnet, baseSepolia, ethereumSepolia } from '@/lib/wagmi-config';

type FlowStep = 'idle' | 'switching' | 'depositing' | 'spending' | 'success' | 'error';

interface GatewayFundingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const sourceChainOptions = [
  { key: 'Base_Sepolia' as const, label: 'Base Sepolia', chain: baseSepolia },
  { key: 'Ethereum_Sepolia' as const, label: 'Ethereum Sepolia', chain: ethereumSepolia },
] as const;

function stepMessage(step: FlowStep, amount: string, sourceLabel: string | undefined, error: string | null): string {
  switch (step) {
    case 'switching':
      return 'Switching wallet network...';
    case 'depositing':
      return `Depositing ${amount} USDC from ${sourceLabel ?? 'source'}...`;
    case 'spending':
      return 'Spending USDC to Arc Testnet...';
    case 'success':
      return `Successfully deposited ${amount} USDC to Arc Testnet`;
    case 'error':
      return error ?? 'Transaction failed';
    default:
      return '';
  }
}

export function GatewayFundingModal({ open, onOpenChange }: GatewayFundingModalProps) {
  const { isConnected, address } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { data: balance, deposit, spend } = useUnifiedBalance(open && isConnected);

  const [sourceChainKey, setSourceChainKey] = useState<'Base_Sepolia' | 'Ethereum_Sepolia'>('Base_Sepolia');
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<FlowStep>('idle');
  const [error, setError] = useState<string | null>(null);

  const selectedOption = sourceChainOptions.find((o) => o.key === sourceChainKey);
  const amountNum = Number(amount);
  const amountValid = Number.isFinite(amountNum) && amountNum > 0;
  const busy = !['idle', 'success', 'error'].includes(step);

  const sourceBalance = useMemo(() => {
    if (!balance) return null;
    const chain = balance.chains.find((c) => c.key === sourceChainKey);
    return chain?.balance ?? null;
  }, [balance, sourceChainKey]);

  useEffect(() => {
    if (!open) {
      setAmount('');
      setError(null);
      setStep('idle');
      setSourceChainKey('Base_Sepolia');
    }
  }, [open]);

  const handleSubmit = useCallback(async () => {
    if (!selectedOption) return;
    setError(null);
    setStep('switching');
    try {
      await switchChainAsync({ chainId: selectedOption.chain.id });

      setStep('depositing');
      await deposit(sourceChainKey, amount);

      setStep('spending');
      await switchChainAsync({ chainId: arcTestnet.id });
      await spend(sourceChainKey, amount, address);

      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Funding failed');
      setStep('error');
    }
  }, [selectedOption, switchChainAsync, deposit, sourceChainKey, amount, spend, address]);

  const message = stepMessage(step, amount, selectedOption?.label, error);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-clinch-border-default bg-clinch-bg-elevated">
        <DialogHeader>
          <DialogTitle className="text-clinch-text-primary">Fund Unified Balance</DialogTitle>
          <DialogDescription className="text-clinch-text-secondary">
            Deposit USDC from a source chain, then spend it to Arc Testnet for escrow deposits.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-2 block text-sm text-clinch-text-primary">Source chain</Label>
            <Select
              value={sourceChainKey}
              onValueChange={(v) => setSourceChainKey(v as 'Base_Sepolia' | 'Ethereum_Sepolia')}
              disabled={busy}
            >
              <SelectTrigger className="w-full border-clinch-border-default bg-clinch-bg-card">
                <SelectValue placeholder="Select chain" />
              </SelectTrigger>
              <SelectContent className="z-[100] border-clinch-border-default bg-clinch-bg-elevated">
                {sourceChainOptions.map((opt) => (
                  <SelectItem key={opt.key} value={opt.key}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="mt-2 text-xs text-clinch-text-tertiary">
              Balance: {sourceBalance === null ? '--' : `${formatUSDC(sourceBalance)} USDC`}
            </div>
          </div>

          <div>
            <Label className="mb-2 block text-sm text-clinch-text-primary">Amount</Label>
            <div className="relative">
              <Input
                type="number"
                min="0"
                step="0.000001"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={busy}
                className="border-clinch-border-default bg-clinch-bg-card pr-16"
                placeholder="0.00"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-clinch-text-tertiary">USDC</span>
            </div>
          </div>

          {step !== 'idle' && (
            <div
              className={cn(
                'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm',
                step === 'error'
                  ? 'border-clinch-danger/30 bg-clinch-danger-muted text-clinch-danger'
                  : 'border-clinch-border-default bg-clinch-bg-card/70 text-clinch-text-secondary',
              )}
            >
              {busy ? (
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-clinch-accent" />
              ) : step === 'success' ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-clinch-success" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span>{message}</span>
            </div>
          )}
        </div>

        <Separator className="bg-clinch-border-default" />

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {step === 'success' ? 'Close' : 'Cancel'}
          </Button>
          <Button onClick={handleSubmit} disabled={busy || !amountValid || !selectedOption}>
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              'Fund'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
