'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Plus, Scale, User } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileNavProps {
  showArbitration?: boolean;
}

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Deals' },
  { href: '/deals/new', icon: Plus, label: 'New' },
  { href: '/arbitration', icon: Scale, label: 'Arbitration', requiresArbitrator: true },
  { href: '/profile', icon: User, label: 'Profile' },
];

export function MobileNav({ showArbitration = false }: MobileNavProps) {
  const pathname = usePathname();

  const filteredItems = navItems.filter(
    (item) => !item.requiresArbitrator || showArbitration
  );

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-clinch-border-default bg-clinch-bg-page md:hidden">
      <div className="flex items-center justify-around px-2 py-2">
        {filteredItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-1 rounded-lg px-4 py-2 transition-colors',
                isActive
                  ? 'text-clinch-accent'
                  : 'text-clinch-text-tertiary hover:text-clinch-text-secondary'
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
