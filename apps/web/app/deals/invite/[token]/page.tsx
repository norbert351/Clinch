'use client';

import { use, useState, useEffect } from 'react';
import { AlertCircle, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo, EmptyState, DealStatusBadge, DealTypeChip, USDCAmount, WalletAddress } from '@/components/clinch';
import { useWallet } from '@/components/wallet-context';
import { useDealByInvite } from '@/hooks/useDeals';
import { formatUSDC, formatExpiry, truncateAddress } from '@/lib/format';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface InvitePageProps {
  params: Promise<{ token: string }>;
}

function InvitePageContent({ token }: { token: string }) {
  const [mounted, setMounted] = useState(false);
  const { isConnected, address, hasSigned, signMessage, connect } = useWallet();
  const router = useRouter();
  const { data: deal, isLoading, error } = useDealByInvite(token);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!deal || !address || !hasSigned || !mounted) return;
    const isCounterparty = address?.toLowerCase() === deal.partyB.toLowerCase();
    const isPartyBDeposited = false;
    if (isCounterparty && isPartyBDeposited) {
      router.push(`/deals/${deal.onChainId}`);
    }
  }, [deal, address, hasSigned, mounted, router]);

  const handleJoinDeal = () => {
    if (!hasSigned) {
      signMessage();
    } else {
      router.push(`/deals/${deal?.onChainId}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-clinch-bg-page">
        <Loader2 className="h-8 w-8 animate-spin text-clinch-accent" />
      </div>
    );
  }

  if (error || !deal) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-clinch-bg-page p-4">
        <div className="w-full max-w-md rounded-2xl border border-clinch-border-default bg-clinch-bg-card p-8">
          <div className="mb-6 flex justify-center">
            <Logo />
          </div>

          <EmptyState
            icon={FileText}
            title="Invite not found"
            description="This invite link is invalid or has expired. Ask the deal creator to send you a new invite."
            action={
              <Link href="/">
                <Button className="gap-2 bg-clinch-accent text-white hover:bg-clinch-accent-hover">
                  Go to homepage
                </Button>
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const isAlreadyParty = address?.toLowerCase() === deal.partyA.toLowerCase() || 
                          address?.toLowerCase() === deal.partyB.toLowerCase();
  const isOneSidedDeal = deal.dealType === 'OneSided';
  const isCounterparty = address?.toLowerCase() === deal.partyB.toLowerCase();
  const totalAmount = isOneSidedDeal 
    ? parseFloat(deal.amountA) || 0 
    : (parseFloat(deal.amountA) || 0) + (parseFloat(deal.amountB) || 0);
  const expiryDate = deal.expiryTimestamp
    ? new Date(deal.expiryTimestamp)
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  return (
    <div className="flex min-h-screen items-center justify-center bg-clinch-bg-page p-4">
      <div className="w-full max-w-md rounded-2xl border border-clinch-border-default bg-clinch-bg-card p-8">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>

        <h2 className="text-center text-h3 text-clinch-text-primary">
          {isOneSidedDeal && isCounterparty 
            ? 'You have been hired for this job' 
            : 'You have been invited to a deal'}
        </h2>

        <div className="my-5 border-t border-clinch-border-default" />

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <DealStatusBadge status={deal.status} />
            <DealTypeChip type={deal.dealType === 'MutualStake' ? 'mutual' : 'one-sided'} />
          </div>

          {deal.title && (
            <h3 className="text-[15px] font-medium text-clinch-text-primary">
              {deal.title}
            </h3>
          )}

          {deal.description && (
            <p className="text-sm text-clinch-text-secondary">
              {deal.description}
            </p>
          )}

          <div className="space-y-2 rounded-lg bg-clinch-bg-elevated p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-clinch-text-tertiary">{isOneSidedDeal ? 'Client' : 'Creator'}</span>
              <WalletAddress address={deal.partyA} showCopy={false} />
            </div>
            {isOneSidedDeal ? (
              <>
                <div className="flex justify-between">
                  <span className="text-clinch-text-tertiary">Escrow payment</span>
                  <span className="text-clinch-text-primary">
                    {formatUSDC(parseFloat(deal.amountA) || 0)} USDC
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-clinch-text-tertiary">Your payout</span>
                  <span className="text-clinch-text-primary">
                    {formatUSDC((parseFloat(deal.amountA) || 0) * 0.975)} USDC
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-clinch-text-tertiary">Your deposit</span>
                  <span className="text-clinch-text-primary">
                    {formatUSDC(parseFloat(deal.amountB) || 0)} USDC
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-clinch-text-tertiary">Total amount</span>
                  <USDCAmount amount={totalAmount} size="sm" />
                </div>
              </>
            )}
            <div className="flex justify-between">
              <span className="text-clinch-text-tertiary">Expires</span>
              <span className="text-clinch-text-secondary">
                {mounted ? formatExpiry(expiryDate).text : '...'}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-5 border-t border-clinch-border-default" />

        {isAlreadyParty ? (
          <>
            <p className="mb-4 text-center text-sm text-clinch-success">
              You are already a party to this deal
            </p>
            <Link href={`/deals/${deal.onChainId}`}>
              <Button className="w-full bg-clinch-accent py-3 text-white hover:bg-clinch-accent-hover">
                View Deal
              </Button>
            </Link>
          </>
        ) : !isConnected ? (
          <>
            <p className="mb-4 text-center text-sm text-clinch-text-secondary">
              Connect your wallet to review and join this deal
            </p>
            <Button
              onClick={connect}
              className="w-full bg-clinch-accent py-3 text-white hover:bg-clinch-accent-hover"
            >
              Connect Wallet
            </Button>
          </>
        ) : !hasSigned ? (
          <>
            <p className="mb-4 text-center text-sm text-clinch-text-secondary">
              Sign in with Ethereum to join this deal
            </p>
            <Button
              onClick={signMessage}
              className="w-full bg-clinch-accent py-3 text-white hover:bg-clinch-accent-hover"
            >
              Sign In
            </Button>
          </>
        ) : (
          <>
            <p className="mb-4 text-center text-sm text-clinch-text-secondary">
              {isOneSidedDeal && isCounterparty
                ? `You have been hired for this job. No deposit required — complete work to receive payment.`
                : 'You can now join this deal'}
            </p>
            <Link href={`/deals/${deal.onChainId}`}>
              <Button className="w-full bg-clinch-accent py-3 text-white hover:bg-clinch-accent-hover">
                {isOneSidedDeal && isCounterparty ? 'View Job Details' : 'View Deal'}
              </Button>
            </Link>
          </>
        )}

        <p className="mt-4 text-center text-xs text-clinch-text-tertiary">
          {isOneSidedDeal
            ? 'Payment held in escrow until work is completed and confirmed.'
            : 'Funds are held in escrow until both parties agree or arbitration resolves the deal.'}
        </p>
      </div>
    </div>
  );
}

export default function InvitePage({ params }: InvitePageProps) {
  const { token } = use(params);

  return <InvitePageContent token={token} />;
}
