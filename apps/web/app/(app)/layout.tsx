'use client';

export const dynamic = 'force-dynamic';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { Bell } from 'lucide-react';
import { Sidebar, MobileNav } from '@/components/clinch';
import { ClinchLogo } from '@/components/clinch/logo';
import { ThemeToggle } from '@/components/clinch/theme-toggle';
import { useWallet } from '@/components/wallet-context';
import { API_URL, getNotifications, getUnreadNotificationCount, getToken } from '@/lib/api';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isConnected, address, hasSigned } = useWallet();
  const queryClient = useQueryClient();

  useQuery({
    queryKey: ['notifications'],
    queryFn: getNotifications,
    enabled: !!hasSigned && !!address,
    refetchInterval: 30000,
  });

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: getUnreadNotificationCount,
    enabled: !!hasSigned && !!address,
    refetchInterval: 30000,
  });

  // Socket.IO real-time notification listener
  useEffect(() => {
    if (!hasSigned || !address) return;

    const token = getToken();
    if (!token) return;

    const socket = io(API_URL, {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      auth: { token },
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      socket.emit('join-user', { address });
    });

    const handleNewNotification = () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    };

    socket.on('notification:new', handleNewNotification);

    return () => {
      socket.off('notification:new', handleNewNotification);
      socket.disconnect();
    };
  }, [hasSigned, address, queryClient]);

  return (
    <div className="flex min-h-screen bg-[var(--bg-void)] text-[var(--text-primary)]">
      <Sidebar showArbitration />
      <div className="flex min-h-screen flex-1 flex-col md:ml-[240px]">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-sidebar)] px-4 md:px-6">
          <div className="md:hidden">
            <ClinchLogo size={26} showText textSize="text-base" />
          </div>
          <div className="hidden md:block" />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button
              type="button"
              aria-label="Notifications"
              className="relative flex h-8 w-8 items-center justify-center border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-cyan)] hover:text-[var(--accent-cyan)]"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center bg-[var(--status-dispute)] px-1 font-mono text-[9px] text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {isConnected && address && (
              <div className="flex items-center gap-2 border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5 font-mono text-[12px] text-[var(--text-secondary)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-active)] pulse-dot" />
                <span>{address.slice(0, 6)}...{address.slice(-4)}</span>
              </div>
            )}
          </div>
        </header>
        <main className="flex-1 overflow-auto pb-24 md:pb-0">
          {children}
        </main>
      </div>
      <MobileNav showArbitration />
    </div>
  );
}
