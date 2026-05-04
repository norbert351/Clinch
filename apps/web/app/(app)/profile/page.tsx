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

export default function ProfilePage() {
  const { address, disconnect, user, isConnected, hasSigned } = useWallet();
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [saved, setSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <h1 className="text-h1 text-clinch-text-primary">Profile</h1>
        </div>

        <div className="mb-6 rounded-xl border border-clinch-border-default bg-clinch-bg-card p-6">
          <h3 className="mb-4 text-h4 text-clinch-text-primary">Wallet</h3>

          <div className="flex items-center gap-3">
            <div className="flex-1 rounded-lg border border-clinch-border-default bg-clinch-bg-page px-4 py-3">
              <span className="font-mono text-sm text-clinch-text-primary">
                {address || 'Not connected'}
              </span>
            </div>
            <Button
              variant="ghost"
              onClick={handleCopyAddress}
              disabled={!address}
              className="h-11 w-11 border-clinch-border-default p-0 text-clinch-text-tertiary hover:text-clinch-text-primary"
            >
              {copied ? (
                <Check className="h-4 w-4 text-clinch-success" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-clinch-success" />
              <span className="text-sm text-clinch-success">
                Connected to Arc Network
              </span>
            </div>
            <button
              onClick={disconnect}
              className="flex items-center gap-2 text-sm text-clinch-text-tertiary transition-colors hover:text-clinch-danger"
            >
              <LogOut className="h-4 w-4" />
              Disconnect
            </button>
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-clinch-border-default bg-clinch-bg-card p-6">
          <h3 className="mb-4 text-h4 text-clinch-text-primary">
            Notification preferences
          </h3>

          <div className="space-y-4">
            <div>
              <Label htmlFor="email" className="mb-2 block text-sm font-medium text-clinch-text-primary">
                Email address
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="border-clinch-border-default bg-clinch-bg-input text-clinch-text-primary placeholder:text-clinch-text-tertiary focus:border-clinch-accent focus:ring-1 focus:ring-clinch-accent/30"
              />
            </div>

            <div>
              <Label htmlFor="displayName" className="mb-2 block text-sm font-medium text-clinch-text-primary">
                Display name <span className="text-clinch-text-tertiary">(optional)</span>
              </Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How you want to be identified"
                className="border-clinch-border-default bg-clinch-bg-input text-clinch-text-primary placeholder:text-clinch-text-tertiary focus:border-clinch-accent focus:ring-1 focus:ring-clinch-accent/30"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-clinch-border-default bg-clinch-bg-page px-4 py-3">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-clinch-text-tertiary" />
                <div>
                  <p className="text-sm font-medium text-clinch-text-primary">
                    Email notifications
                  </p>
                  <p className="text-xs text-clinch-text-tertiary">
                    Receive deal updates via email
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEmailNotifications(!emailNotifications)}
                className={cn(
                  'relative h-6 w-11 rounded-full transition-colors',
                  emailNotifications
                    ? 'bg-clinch-accent'
                    : 'bg-clinch-bg-elevated'
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
              className="bg-clinch-accent text-white hover:bg-clinch-accent-hover"
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

            <p className="text-xs text-clinch-text-tertiary">
              Your email is only used to send deal notifications. It is never
              stored on-chain.
            </p>
          </div>
        </div>

        <RecentNotifications />
      </div>
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
      <div className="rounded-xl border border-clinch-border-default bg-clinch-bg-card p-6">
        <h3 className="mb-4 text-h4 text-clinch-text-primary">
          Recent notifications
        </h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-clinch-bg-elevated" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-clinch-border-default bg-clinch-bg-card p-6">
      <h3 className="mb-4 text-h4 text-clinch-text-primary">
        Recent notifications
      </h3>

      {notifications.length === 0 ? (
        <div className="py-8 text-center">
          <Bell className="mx-auto h-8 w-8 text-clinch-text-tertiary" />
          <p className="mt-2 text-sm text-clinch-text-tertiary">
            No notifications yet
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.slice(0, 10).map((n) => (
            <div
              key={n.id}
              className={cn(
                'rounded-lg border border-clinch-border-default px-4 py-3',
                !n.read && 'border-l-2 border-l-clinch-accent bg-clinch-accent-muted/10'
              )}
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-clinch-text-primary">
                    {n.title || 'Deal update'}
                  </p>
                  <p className="mt-0.5 text-xs text-clinch-text-tertiary">
                    {n.message}
                  </p>
                </div>
                {n.sentAt && (
                  <span className="ml-3 shrink-0 text-[10px] text-clinch-text-tertiary">
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
