'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Bell, Copy, LogOut, User, Check, ExternalLink, Loader2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Logo } from './logo';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useWallet } from '@/components/wallet-context';
import { truncateAddress, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '@/lib/api';

interface NavbarProps {
  showWallet?: boolean;
  unreadCount?: number;
  breadcrumb?: React.ReactNode;
}

export function Navbar({ showWallet = true, unreadCount = 0, breadcrumb }: NavbarProps) {
  const { isConnected, address, disconnect, hasSigned, isSigning, signMessage } = useWallet();
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
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
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
    <>
      <nav className="sticky top-0 z-50 h-16 border-b border-clinch-border-default bg-clinch-bg-page/80 backdrop-blur-sm">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-6">
            <Link href="/">
              <Logo />
            </Link>
            {breadcrumb && (
              <div className="hidden text-sm text-clinch-text-tertiary md:block">
                {breadcrumb}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {showWallet && !mounted && (
              <div className="h-9 w-32 animate-pulse rounded-lg bg-clinch-bg-surface" />
            )}
            {showWallet && mounted && isConnected && (
              <>
                {/* Notification Bell */}
                <DropdownMenu open={notifOpen} onOpenChange={setNotifOpen}>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="relative flex h-9 w-9 items-center justify-center rounded-lg text-clinch-text-tertiary transition-colors hover:bg-clinch-bg-elevated hover:text-clinch-text-secondary"
                      aria-label="Notifications"
                    >
                      <Bell className="h-4.5 w-4.5" />
                      {unreadCount > 0 && (
                        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-clinch-accent px-1 text-[10px] font-medium text-white">
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-80 border-clinch-border-default bg-clinch-bg-elevated p-0"
                  >
                    <div className="flex items-center justify-between border-b border-clinch-border-default px-3 py-2">
                      <span className="text-sm font-medium text-clinch-text-primary">Notifications</span>
                      {notifications.length > 0 && (
                        <button
                          onClick={handleMarkAllRead}
                          className="text-xs text-clinch-accent hover:text-clinch-accent-hover"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-8 text-center">
                          <Bell className="mx-auto h-6 w-6 text-clinch-text-tertiary" />
                          <p className="mt-2 text-xs text-clinch-text-tertiary">
                            No notifications yet
                          </p>
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <button
                            key={n.id}
                            onClick={() => handleMarkRead(n.id)}
                            className={cn(
                              'w-full border-b border-clinch-border-default px-3 py-2.5 text-left transition-colors hover:bg-clinch-bg-card',
                              !n.read && 'bg-clinch-accent-muted/30'
                            )}
                          >
                            <div className="flex items-start gap-2">
                              {!n.read && (
                                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-clinch-accent" />
                              )}
                              <div className={cn('min-w-0', !n.read && 'ml-0')}>
                                <p className="text-sm font-medium text-clinch-text-primary">
                                  {n.title || 'Deal update'}
                                </p>
                                <p className="mt-0.5 text-xs text-clinch-text-tertiary line-clamp-2">
                                  {n.message}
                                </p>
                                {n.sentAt && (
                                  <p className="mt-1 text-[10px] text-clinch-text-tertiary">
                                    {timeAgo(new Date(n.sentAt))}
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

                {/* Wallet Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2 rounded-full border border-clinch-border-default bg-clinch-bg-card px-3 py-1.5 font-mono text-sm text-clinch-text-secondary transition-colors hover:border-clinch-border-hover hover:text-clinch-text-primary">
                      <span
                        className={cn(
                          'h-2 w-2 rounded-full',
                          hasSigned ? 'bg-clinch-success' : 'bg-clinch-warning'
                        )}
                      />
                      {truncateAddress(address!)}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-56 border-clinch-border-default bg-clinch-bg-elevated p-1"
                  >
                    {/* Full address (copyable) */}
                    <div className="px-2 py-2">
                      <div className="mb-1 text-xs text-clinch-text-tertiary">
                        Connected wallet
                      </div>
                      <div className="break-all font-mono text-xs text-clinch-text-secondary">
                        {address}
                      </div>
                    </div>
                    <DropdownMenuSeparator className="bg-clinch-border-default" />
                    <DropdownMenuItem asChild>
                      <Link
                        href="/profile"
                        className="flex cursor-pointer items-center gap-2 text-clinch-text-secondary hover:text-clinch-text-primary"
                      >
                        <User className="h-4 w-4" />
                        View Profile
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
                      {copied ? 'Copied!' : 'Copy Address'}
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a
                        href={`https://explorer.arc.network/address/${address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex cursor-pointer items-center gap-2 text-clinch-text-secondary hover:text-clinch-text-primary"
                      >
                        <ExternalLink className="h-4 w-4" />
                        View on Explorer
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
              </>
            )}

            {showWallet && mounted && !isConnected && (
              <ConnectButton.Custom>
                {({ account, chain, openConnectModal, openAccountModal, openChainModal, mounted }) => {
                  const ready = mounted;
                  const connected = ready && account && chain;

                  return (
                    <div
                      {...(!ready && {
                        'aria-hidden': true,
                        'style': {
                          opacity: 0,
                          pointerEvents: 'none',
                          userSelect: 'none',
                        },
                      })}
                    >
                      {(() => {
                        if (!connected) {
                          return (
                            <Button
                              onClick={openConnectModal}
                              className="bg-clinch-accent px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-clinch-accent-hover"
                            >
                              Connect Wallet
                            </Button>
                          );
                        }

                        if (chain.unsupported) {
                          return (
                            <Button
                              onClick={openChainModal}
                              className="bg-clinch-danger px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-clinch-danger/90"
                            >
                              Wrong network
                            </Button>
                          );
                        }

                        return (
                          <div className="flex items-center gap-2">
                            <Button
                              onClick={openChainModal}
                              className="flex items-center gap-2 border border-clinch-border-default bg-clinch-bg-card px-3 py-1.5 text-sm font-medium text-clinch-text-secondary transition-colors hover:border-clinch-border-hover hover:text-clinch-text-primary"
                            >
                              {chain.hasIcon && chain.iconUrl && (
                                <img
                                  alt={chain.name ?? 'Chain icon'}
                                  src={chain.iconUrl}
                                  className="h-5 w-5"
                                />
                              )}
                              {chain.name}
                            </Button>

                            <Button
                              onClick={openAccountModal}
                              className="flex items-center gap-2 border border-clinch-border-default bg-clinch-bg-card px-3 py-1.5 font-mono text-sm text-clinch-text-secondary transition-colors hover:border-clinch-border-hover hover:text-clinch-text-primary"
                            >
                              <span
                                className={cn(
                                  'h-2 w-2 rounded-full',
                                  hasSigned ? 'bg-clinch-success' : 'bg-clinch-warning'
                                )}
                              />
                              {truncateAddress(account.address)}
                            </Button>
                          </div>
                        );
                      })()}
                    </div>
                  );
                }}
              </ConnectButton.Custom>
            )}
          </div>
        </div>
      </nav>

      {/* SIWE signing banner */}
      {showWallet && mounted && isConnected && !hasSigned && (
        <div className="border-b border-clinch-warning/30 bg-clinch-warning-muted px-4 py-2">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {isSigning && <Loader2 className="h-4 w-4 animate-spin text-clinch-warning" />}
              <p className="text-sm text-clinch-warning">
                {isSigning ? 'Verifying wallet ownership... Please sign the message in your wallet.' : 'Please sign the authentication message in your wallet to continue'}
              </p>
            </div>
            {!isSigning && (
              <Button
                onClick={signMessage}
                size="sm"
                className="bg-clinch-warning text-clinch-bg-page hover:bg-clinch-warning/90"
              >
                Sign now
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
