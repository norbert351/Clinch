'use client';

import { useState } from 'react';
import { Activity, ShieldCheck, WalletCards } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatUSDC } from '@/lib/format';
import { useUnifiedBalance, type UnifiedBalanceData } from '@/hooks/useUnifiedBalance';
import { GatewayFundingModal } from './gateway-funding-modal';

interface UnifiedBalanceCardProps {
  className?: string;
  balance?: UnifiedBalanceData | null;
  isLoading?: boolean;
  onFund?: (() => void) | undefined;
}

export function UnifiedBalanceCard({
  className,
  balance: externalBalance,
  isLoading: externalLoading,
  onFund: externalOnFund,
}: UnifiedBalanceCardProps) {
  const [fundingOpen, setFundingOpen] = useState(false);
  const internal = useUnifiedBalance(true);
  const data = externalBalance !== undefined ? externalBalance : internal.data;
  const isLoading = externalLoading !== undefined ? externalLoading : internal.isLoading;
  const onFund = externalOnFund !== undefined ? externalOnFund : (() => setFundingOpen(true));
  const total = data?.totalBalance;
  const chains = data?.chains ?? [];

  return (
    <>
      <section className={cn('border border-border-subtle bg-surface/80 p-5', className)}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-text-tertiary">
              <WalletCards className="h-3.5 w-3.5 text-usdc" />
              Unified balance
            </div>
            <h2 className="mt-2 text-lg font-semibold text-text-primary">
              Unified USDC balance
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-text-secondary">
              Fund USDC from supported testnets and use it for Arc escrow deposits.
            </p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="gap-2 border border-border-subtle"
            onClick={onFund}
          >
            Fund balance
          </Button>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="border border-border-subtle bg-void/55 p-4">
            <div className="text-xs font-medium uppercase tracking-[0.14em] text-text-tertiary">
              Spendable now
            </div>
            {isLoading ? (
              <div className="mt-3 h-10 w-40 animate-pulse rounded bg-elevated" />
            ) : (
              <div className="mt-3 text-4xl font-semibold tracking-tight text-text-primary tabular-nums">
                {total === null || total === undefined ? '--' : formatUSDC(total)}
                <span className="ml-2 text-sm font-medium text-text-tertiary">USDC</span>
              </div>
            )}
          </div>

          <div className="border border-border-subtle bg-void/55 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-text-tertiary">
                Chain breakdown
              </div>
              <Activity className="h-4 w-4 text-text-tertiary" />
            </div>
            <div className="mt-3 space-y-2">
              {chains.map((chain) => (
                <div key={chain.key} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          chain.key === 'ARC-TESTNET' ? '#00D4FF' :
                          chain.key === 'BASE-SEPOLIA' ? '#0052FF' :
                          '#627EEA',
                      }}
                    />
                    <span className="text-sm text-text-secondary">{chain.chainName}</span>
                  </div>
                  <span className="text-sm font-medium text-text-primary tabular-nums">
                    {isLoading ? (
                      <span className="inline-block h-4 w-16 animate-pulse rounded bg-[var(--bg-elevated)]" />
                    ) : chain.balance === null ? (
                      <span className="text-xs text-text-tertiary">unavailable</span>
                    ) : (
                      <>
                        {formatUSDC(chain.balance)}
                        <span className="ml-1 text-xs text-text-tertiary">USDC</span>
                      </>
                    )}
                  </span>
                </div>
              ))}
              {chains.length === 0 && (
                <div className="text-sm text-text-tertiary">Connect wallet to load balances.</div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 border border-border-subtle bg-void/55 p-3 text-xs text-text-tertiary">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-active" />
          Backed by Circle Gateway testnet balances. Use "Fund balance" to move USDC between chains.
        </div>
      </section>
      {externalOnFund === undefined && (
        <GatewayFundingModal open={fundingOpen} onOpenChange={setFundingOpen} />
      )}
    </>
  );
}
