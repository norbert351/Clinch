'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Bell,
  Check,
  Copy,
  ExternalLink,
  LogOut,
  ShieldCheck,
  User,
  Wallet,
  Zap,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useWallet } from '@/components/wallet-context';
import { cn } from '@/lib/utils';
import { truncateAddress, timeAgo } from '@/lib/format';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/api';
import { Logo } from './logo';
import { ThemeToggle } from './theme-toggle';

interface NavbarProps {
  showWallet?: boolean;
  unreadCount?: number;
  breadcrumb?: React.ReactNode;
}

export function Navbar({
  showWallet = true,
  unreadCount = 0,
  breadcrumb,
}: NavbarProps) {
  const { isConnected, address, disconnect, hasSigned, connect, isSigning, canConnect } =
    useWallet();
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: getNotifications,
    enabled: !!hasSigned && !!address && notifOpen,
    staleTime: 10_000,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleCopyAddress = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleMarkRead = async (id: string) => {
    await markNotificationRead(id);
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-clinch-border-default/80 bg-clinch-bg-page/72 backdrop-blur-2xl supports-[backdrop-filter]:bg-clinch-bg-page/58">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="group">
            <Logo />
          </Link>
          <div className="hidden items-center gap-2 rounded-full border border-clinch-border-default bg-clinch-bg-card/60 px-3 py-1.5 text-xs text-clinch-text-secondary lg:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-clinch-success status-pulse" />
            Arc Network
          </div>
          {breadcrumb && (
            <div className="hidden text-sm text-clinch-text-tertiary md:block">
              {breadcrumb}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <ThemeToggle className="hidden sm:inline-flex" />

          {showWallet && mounted && isConnected && (
            <DropdownMenu open={notifOpen} onOpenChange={setNotifOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  className="relative flex h-9 w-9 items-center justify-center rounded-md border border-clinch-border-default bg-clinch-bg-card/70 text-clinch-text-secondary transition-all hover:border-clinch-border-hover hover:bg-clinch-bg-elevated hover:text-clinch-text-primary"
                  aria-label="Notifications"
                >
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-clinch-accent px-1 text-[10px] font-semibold text-white">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-84 overflow-hidden border-clinch-border-default bg-clinch-bg-elevated/95 p-0 shadow-2xl backdrop-blur-xl"
              >
                <div className="flex items-center justify-between border-b border-clinch-border-default px-4 py-3">
                  <div>
                    <div className="text-sm font-medium text-clinch-text-primary">
                      Coordination feed
                    </div>
                    <div className="text-xs text-clinch-text-tertiary">
                      Live agreement updates
                    </div>
                  </div>
                  {notifications.length > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-xs font-medium text-clinch-accent hover:text-clinch-accent-hover"
                    >
                      Mark read
                    </button>
                  )}
                </div>
                <div className="max-h-88 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-9 text-center">
                      <ShieldCheck className="mx-auto h-7 w-7 text-clinch-text-tertiary" />
                      <p className="mt-2 text-sm font-medium text-clinch-text-secondary">
                        No new activity
                      </p>
                      <p className="mt-1 text-xs text-clinch-text-tertiary">
                        Agreement events will appear here.
                      </p>
                    </div>
                  ) : (
                    notifications.map((notification) => (
                      <button
                        key={notification.id}
                        onClick={() => handleMarkRead(notification.id)}
                        className={cn(
                          'w-full border-b border-clinch-border-default px-4 py-3 text-left transition-colors hover:bg-clinch-bg-card/80',
                          !notification.read && 'bg-clinch-accent-muted/20',
                        )}
                      >
                        <div className="flex gap-3">
                          <span
                            className={cn(
                              'mt-1 h-2 w-2 shrink-0 rounded-full',
                              notification.read
                                ? 'bg-clinch-text-tertiary'
                                : 'bg-clinch-accent status-pulse',
                            )}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-clinch-text-primary">
                              {notification.title || 'Deal update'}
                            </p>
                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-clinch-text-secondary">
                              {notification.message}
                            </p>
                            {notification.sentAt && (
                              <p className="mt-1.5 text-[11px] text-clinch-text-tertiary">
                                {timeAgo(new Date(notification.sentAt))}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {showWallet && !mounted && (
            <div className="h-9 w-36 animate-pulse rounded-md bg-clinch-bg-elevated" />
          )}

          {showWallet && mounted && isConnected && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-9 items-center gap-2 rounded-md border border-clinch-border-default bg-clinch-bg-card/80 px-3 text-sm text-clinch-text-secondary shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all hover:border-clinch-border-hover hover:bg-clinch-bg-elevated hover:text-clinch-text-primary">
                  <span
                    className={cn(
                      'h-2 w-2 rounded-full',
                      hasSigned ? 'bg-clinch-success status-pulse' : 'bg-clinch-warning',
                    )}
                  />
                  <span className="hidden sm:inline">
                    {hasSigned ? 'Signed in' : isSigning ? 'Signing' : 'Connected'}
                  </span>
                  <span className="font-mono text-xs">
                    {truncateAddress(address!)}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-72 border-clinch-border-default bg-clinch-bg-elevated/95 p-1 shadow-2xl backdrop-blur-xl"
              >
                <div className="rounded-lg bg-clinch-bg-card/70 px-3 py-3">
                  <div className="flex items-center gap-2 text-xs text-clinch-text-tertiary">
                    <Wallet className="h-3.5 w-3.5" />
                    Dynamic wallet onboarding
                  </div>
                  <div className="mt-2 break-all font-mono text-xs text-clinch-text-primary">
                    {address}
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs">
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        hasSigned ? 'bg-clinch-success' : 'bg-clinch-warning',
                      )}
                    />
                    <span className="text-clinch-text-secondary">
                      {hasSigned
                        ? 'Sign In with Ethereum verified'
                        : 'Wallet connected, signature pending'}
                    </span>
                  </div>
                </div>
                <DropdownMenuSeparator className="bg-clinch-border-default" />
                <DropdownMenuItem asChild>
                  <Link
                    href="/profile"
                    className="flex cursor-pointer items-center gap-2 text-clinch-text-secondary hover:text-clinch-text-primary"
                  >
                    <User className="h-4 w-4" />
                    Account overview
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleCopyAddress}
                  className="flex cursor-pointer items-center gap-2 text-clinch-text-secondary hover:text-clinch-text-primary"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-clinch-success" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {copied ? 'Copied address' : 'Copy address'}
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a
                    href={`https://explorer.arc.network/address/${address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex cursor-pointer items-center gap-2 text-clinch-text-secondary hover:text-clinch-text-primary"
                  >
                    <ExternalLink className="h-4 w-4" />
                    View on Arc explorer
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-clinch-border-default" />
                <DropdownMenuItem
                  onClick={disconnect}
                  className="flex cursor-pointer items-center gap-2 text-clinch-danger hover:bg-clinch-danger-muted"
                >
                  <LogOut className="h-4 w-4" />
                  Disconnect
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {showWallet && mounted && !isConnected && (
            <Button
              onClick={connect}
              disabled={!canConnect}
              className="premium-button h-9 rounded-md px-4"
            >
              <Zap className="h-4 w-4" />
              <span className="hidden sm:inline">
                {canConnect ? 'Connect wallet' : 'Loading wallet'}
              </span>
              <span className="sm:hidden">{canConnect ? 'Wallet' : 'Loading'}</span>
            </Button>
          )}
        </div>
      </div>
    </nav>
  );
}
