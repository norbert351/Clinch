'use client';

import { useEffect, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { Navbar, Sidebar, MobileNav } from '@/components/clinch';
import { useWallet } from '@/components/wallet-context';
import { getNotifications, getUnreadNotificationCount, getToken } from '@/lib/api';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isConnected, address, hasSigned } = useWallet();
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery({
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

    const socketUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const socket = io(socketUrl, {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
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
    <div className="flex min-h-screen flex-col bg-clinch-bg-page">
      <Navbar showWallet unreadCount={unreadCount} />
      <div className="flex flex-1">
        <Sidebar showArbitration />
        <main className="flex-1 pb-20 md:pb-0">
          {children}
        </main>
      </div>
      <MobileNav showArbitration />
    </div>
  );
}
