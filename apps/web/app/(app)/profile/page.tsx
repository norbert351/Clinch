'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Check, LogOut, Bell, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWallet } from '@/components/wallet-context';
import { updateUser, getNotifications } from '@/lib/api';
import { toast } from 'react-hot-toast';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { GatewayFundingModal, UnifiedBalanceCard } from '@/components/clinch';
import { useUnifiedBalance } from '@/hooks/useUnifiedBalance';

export default function ProfilePage() {
  const { address, disconnect, user, isConnected, hasSigned } = useWallet();
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [saved, setSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fundingOpen, setFundingOpen] = useState(false);
  const { data: unifiedBalance, isLoading: isBalanceLoading } = useUnifiedBalance(
    !!address && hasSigned,
    address,
  );

  useEffect(() => {
    if (user) {
      setEmail(user.email || '');
      setDisplayName(user.displayName || '');
      setEmailNotifications(user.emailNotifications !== false);
    }
  }, [user]);

  const handleCopyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSave = async () => {
    if (!hasSigned) {
      toast.error('Please sign in first');
      return;
    }
    setIsLoading(true);
    try {
      const updated = await updateUser({
        email: email || undefined,
        displayName: displayName || undefined,
        emailNotifications,
      });
      if (updated) {
        setSaved(true);
        toast.success('Profile updated');
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (err) {
      toast.error('Failed to update profile');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="px-4 pb-16 pt-8 md:px-8">
      <div className="mx-auto max-w-lg">
        <div className="mb-8">
          <div className="font-sans text-[11px] uppercase tracking-[0.12em] text-text-tertiary">
            Account
          </div>
          <h1 className="mt-2 text-3xl font-semibold text-text-primary">Profile</h1>
        </div>

        <div className="mb-6">
          <UnifiedBalanceCard
            balance={unifiedBalance}
            isLoading={isBalanceLoading}
            onFund={() => setFundingOpen(true)}
          />
        </div>

        <div className="mb-6 border border-border-subtle bg-surface p-6">
          <h3 className="mb-4 font-sans text-[11px] uppercase tracking-[0.12em] text-text-tertiary">Your Wallet</h3>

          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1 border border-border-subtle bg-elevated px-4 py-3">
              <span className="font-mono text-sm text-text-primary">
                {address || 'Not connected'}
              </span>
            </div>
            <Button
              variant="ghost"
              onClick={handleCopyAddress}
              disabled={!address}
              className="h-11 w-11 border border-border-subtle p-0 text-text-tertiary hover:text-text-primary"
            >
              {copied ? (
                <Check className="h-4 w-4 text-active" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-active pulse-dot" />
              <span className="font-mono text-[12px] text-active">
                Connected to Arc Network
              </span>
            </div>
            <button
              onClick={disconnect}
              className="flex items-center gap-2 text-xs text-text-tertiary transition-colors hover:text-dispute"
            >
              <LogOut className="h-4 w-4" />
              Disconnect
            </button>
          </div>
        </div>

        <div className="rule-gradient mb-6" />

        <div className="mb-6 border border-border-subtle bg-surface p-6">
          <h3 className="mb-4 text-lg font-semibold text-text-primary">
            Notification preferences
          </h3>

          <div className="space-y-4">
            <div>
              <Label htmlFor="email" className="mb-2 block font-sans text-[11px] font-medium uppercase tracking-[0.12em] text-text-tertiary">
                Email address
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="rounded-none border border-border-subtle bg-elevated text-text-primary placeholder:text-text-tertiary focus:border-usdc focus:ring-0"
              />
            </div>

            <div>
              <Label htmlFor="displayName" className="mb-2 block font-sans text-[11px] font-medium uppercase tracking-[0.12em] text-text-tertiary">
                Display name <span className="text-text-tertiary">(optional)</span>
              </Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How you want to be identified"
                className="rounded-none border border-border-subtle bg-elevated text-text-primary placeholder:text-text-tertiary focus:border-usdc focus:ring-0"
              />
            </div>

            <div className="flex items-center justify-between border border-border-subtle bg-void px-4 py-3">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-text-tertiary" />
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    Email notifications
                  </p>
                  <p className="text-xs text-text-tertiary">
                    Receive deal updates via email
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEmailNotifications(!emailNotifications)}
                className={cn(
                  'relative h-6 w-11 rounded-full transition-colors',
                  emailNotifications
                    ? 'bg-usdc'
                    : 'bg-elevated'
                )}
                role="switch"
                aria-checked={emailNotifications}
              >
                <span
                  className={cn(
                    'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                    emailNotifications ? 'translate-x-5' : 'translate-x-0'
                  )}
                />
              </button>
            </div>

            <Button
              onClick={handleSave}
              disabled={isLoading}
              className="btn-sharp bg-usdc text-white hover:bg-cyan"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : saved ? (
                'Saved!'
              ) : (
                'Save preferences'
              )}
            </Button>

            <p className="text-xs text-text-tertiary">
              Your email is only used to send deal notifications. It is never
              stored on-chain.
            </p>
          </div>
        </div>

        <RecentNotifications />
      </div>
      <GatewayFundingModal open={fundingOpen} onOpenChange={setFundingOpen} />
    </div>
  );
}

function RecentNotifications() {
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: getNotifications,
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="border border-border-subtle bg-surface p-6">
        <h3 className="mb-4 text-h4 text-text-primary">
          Recent notifications
        </h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse bg-elevated" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border-subtle bg-surface p-6">
      <h3 className="mb-4 text-h4 text-text-primary">
        Recent notifications
      </h3>

      {notifications.length === 0 ? (
        <div className="py-8 text-center">
          <div className="font-mono text-[48px] leading-none text-text-tertiary">—</div>
          <p className="mt-2 text-sm text-text-tertiary">
            No notifications yet
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.slice(0, 10).map((n) => (
            <div
              key={n.id}
              className={cn(
                'flex items-start gap-3 border border-border-subtle px-4 py-3',
                !n.read && 'border-l-2 border-l-usdc bg-usdc-dim/10'
              )}
            >
              <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-text-tertiary' : 'bg-cyan')} />
              <div className="flex min-w-0 flex-1 items-start justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary">
                    {n.title || 'Deal update'}
                  </p>
                  <p className="mt-0.5 text-xs text-text-tertiary">
                    {n.message}
                  </p>
                </div>
                {n.sentAt && (
                  <span className="ml-3 shrink-0 text-[10px] text-text-tertiary">
                    {timeAgo(new Date(n.sentAt))}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

