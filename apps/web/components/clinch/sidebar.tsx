'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  FileText,
  Scale,
  User,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from './logo';
import { useWallet } from '@/components/wallet-context';
import { truncateAddress } from '@/lib/format';

interface SidebarProps {
  showArbitration?: boolean;
}

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/deals/new', icon: FileText, label: 'New Deal' },
  { href: '/arbitration', icon: Scale, label: 'Arbitration', requiresArbitrator: true },
  { href: '/profile', icon: User, label: 'Profile' },
];

export function Sidebar({ showArbitration = false }: SidebarProps) {
  const pathname = usePathname();
  const { address, disconnect } = useWallet();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <aside className="hidden w-55 shrink-0 border-r border-clinch-border-default bg-clinch-bg-page md:block">
      <div className="flex h-full flex-col px-4 py-6">
        <Link href="/dashboard">
          <Logo />
        </Link>

        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            if (item.requiresArbitrator && !showArbitration) return null;

            const isActive =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-clinch-accent-muted text-clinch-text-primary'
                    : 'text-clinch-text-tertiary hover:bg-clinch-bg-elevated hover:text-clinch-text-secondary'
                )}
              >
                <item.icon
                  className={cn(
                    'h-4 w-4',
                    isActive ? 'text-clinch-accent' : ''
                  )}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom: Wallet info */}
        {mounted && address && (
          <div className="mt-auto space-y-2 border-t border-clinch-border-default pt-4">
            <div className="rounded-lg bg-clinch-bg-card px-3 py-2">
              <div className="font-mono text-xs text-clinch-text-secondary">
                {truncateAddress(address)}
              </div>
            </div>
            <button
              onClick={disconnect}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-clinch-text-tertiary transition-colors hover:bg-clinch-bg-elevated hover:text-clinch-danger"
            >
              <LogOut className="h-4 w-4" />
              Disconnect
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
