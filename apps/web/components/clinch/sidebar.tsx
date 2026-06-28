'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  BarChart3,
  Bot,
  Code2,
  Copy,
  LayoutDashboard,
  LogOut,
  Plus,
  Scale,
  User,
} from 'lucide-react';
import { useWallet } from '@/components/wallet-context';
import { useIsAdmin } from '@/hooks/useAnalytics';
import { ClinchLogo } from './logo';
import { cn } from '@/lib/utils';

interface SidebarProps {
  showArbitration?: boolean;
}

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/agent', icon: Bot, label: 'Agent' },
  { href: '/deals/new', icon: Plus, label: 'New Deal' },
  {
    href: '/arbitration',
    icon: Scale,
    label: 'Arbitration',
    requiresArbitrator: true,
  },
  { href: '/developer', icon: Code2, label: 'Developer' },
  {
    href: '/admin',
    icon: BarChart3,
    label: 'Analytics',
    requiresAdmin: true,
  },
  { href: '/profile', icon: User, label: 'Profile' },
];

export function Sidebar({ showArbitration = false }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { address, disconnect, hasSigned } = useWallet();
  const [mounted, setMounted] = useState(false);
  const { data: isAdmin = false } = useIsAdmin(mounted && !!address && hasSigned);

  useEffect(() => {
    setMounted(true);
  }, []);

  const visibleItems = navItems.filter((item) => {
    if (item.requiresArbitrator && !showArbitration) return false;
    if (item.requiresAdmin && !isAdmin) return false;
    return true;
  });
  const mainItems = visibleItems.filter((item) =>
    ['/dashboard', '/agent', '/deals/new', '/arbitration'].includes(item.href),
  );
  const accountItems = visibleItems.filter((item) =>
    ['/developer', '/admin', '/profile'].includes(item.href),
  );

  const renderNavItem = (item: (typeof navItems)[number]) => {
    const isActive =
      pathname === item.href ||
      pathname.startsWith(`${item.href}/`);

    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          'mx-3 flex items-center gap-3 border-l-2 px-3 py-2.5',
          'font-sans text-[13px] font-medium transition-colors',
          isActive
            ? 'border-l-[var(--accent-blue)] bg-[var(--bg-elevated)] text-[var(--text-primary)]'
            : 'border-l-transparent text-[var(--text-tertiary)] hover:bg-[var(--bg-elevated)]/40 hover:text-[var(--text-secondary)]',
        )}
      >
        <item.icon
          className={cn(
            'h-[15px] w-[15px] shrink-0',
            isActive
              ? 'text-[var(--accent-blue)]'
              : 'text-[var(--text-tertiary)]',
          )}
        />
        <span>{item.label}</span>
      </Link>
    );
  };

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[240px] flex-col overflow-hidden border-r border-[var(--border-subtle)] bg-[var(--bg-sidebar)] md:flex">
      <Link
        href="/"
        className="flex shrink-0 items-center gap-2.5 border-b border-[var(--border-subtle)] px-5 py-5 hover:opacity-80 transition-opacity cursor-pointer no-underline"
      >
        <ClinchLogo size={34} showText textSize="text-xl" />
        <span className="sr-only">Escrow Protocol</span>
      </Link>

      <nav className="flex-1 overflow-y-auto py-4">
        <div className="space-y-0.5">
          {mainItems.map(renderNavItem)}
        </div>

        <hr className="rule-gradient mx-3 my-4" />
        <p className="mb-1 px-5 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
          Account
        </p>
        <div className="space-y-0.5">
          {accountItems.map(renderNavItem)}
        </div>
      </nav>

      <div className="mt-auto shrink-0 border-t border-[var(--border-subtle)] px-4 pb-5 pt-4">
        <div className="mb-3 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-active)] animate-pulse" />
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--accent-cyan)]">
            Arc Testnet
          </span>
        </div>
        {address && (
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-[11px] text-[var(--text-tertiary)]">
              {address.slice(0, 6)}...{address.slice(-4)}
            </span>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(address);
              }}
              className="text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
              aria-label="Copy address"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
        )}
        <button
          onClick={async () => {
            try {
              await disconnect();
            } catch (err) {
              console.error('[Sidebar] Disconnect failed:', err);
            }
            router.push('/');
          }}
          className="flex items-center gap-2 font-sans text-[12px] text-[var(--text-tertiary)] transition-colors cursor-pointer bg-transparent border-none p-0 hover:text-[var(--status-dispute)]"
        >
          <LogOut className="h-3.5 w-3.5" />
          Disconnect
        </button>
      </div>
    </aside>
  );
}
