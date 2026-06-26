'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, LayoutDashboard, MonitorCog, Plus, Scale, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWallet } from '@/components/wallet-context';
import { useIsAdmin } from '@/hooks/useAnalytics';

interface MobileNavProps {
  showArbitration?: boolean;
}

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Home' },
  { href: '/deals/new', icon: Plus, label: 'New' },
  {
    href: '/arbitration',
    icon: Scale,
    label: 'Disputes',
    requiresArbitrator: true,
  },
  {
    href: '/admin',
    icon: MonitorCog,
    label: 'Admin',
    requiresAdmin: true,
  },
  { href: '/profile', icon: User, label: 'Account' },
];

export function MobileNav({ showArbitration = false }: MobileNavProps) {
  const pathname = usePathname();
  const { address, hasSigned } = useWallet();
  const { data: isAdmin = false } = useIsAdmin(!!address && hasSigned);

  const filteredItems = navItems.filter(
    (item) =>
      (!item.requiresArbitrator || showArbitration) &&
      (!item.requiresAdmin || isAdmin),
  );

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-clinch-border-default/80 bg-clinch-bg-page/90 px-3 pb-3 pt-2 backdrop-blur-2xl md:hidden">
      <div
        className={cn(
          'mx-auto grid gap-1 rounded-xl border border-clinch-border-default bg-clinch-bg-card/75 p-1 shadow-2xl',
          filteredItems.length >= 5 ? 'max-w-md grid-cols-5' : 'max-w-sm grid-cols-4',
        )}
      >
        {filteredItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[10px] font-medium transition-all',
                isActive
                  ? 'bg-clinch-bg-elevated text-clinch-text-primary shadow-sm'
                  : 'text-clinch-text-tertiary hover:text-clinch-text-secondary',
              )}
            >
              <item.icon
                className={cn('h-4 w-4', isActive && 'text-clinch-accent')}
              />
              {item.label}
            </Link>
          );
        })}
        {filteredItems.length < 4 && (
          <Link
            href="/deals/new"
            className="flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[10px] font-medium text-clinch-text-tertiary transition-all hover:text-clinch-text-secondary"
          >
            <FileText className="h-4 w-4" />
            Deals
          </Link>
        )}
      </div>
    </nav>
  );
}
