import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  valueClassName?: string;
  className?: string;
  icon?: LucideIcon;
  trend?: string;
  tone?: 'blue' | 'emerald' | 'amber' | 'violet' | 'slate';
}

const toneClasses = {
  blue: 'border-t-usdc text-usdc',
  emerald: 'border-t-active text-active',
  amber: 'border-t-pending text-pending',
  violet: 'border-t-resolve text-resolve',
  slate: 'border-t-border-strong text-text-secondary',
};

export function StatCard({
  label,
  value,
  subtext,
  valueClassName,
  className,
  icon: Icon,
  trend,
  tone = 'blue',
}: StatCardProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden border border-border-subtle border-t-2 bg-surface p-6 transition-colors hover:border-border-default',
        toneClasses[tone],
        className,
      )}
    >
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <div className="font-sans text-[11px] font-medium uppercase tracking-[0.12em] text-text-tertiary">
            {label}
          </div>
          <div
            className={cn(
              'mt-2 font-mono text-3xl text-text-primary tabular-nums',
              valueClassName,
            )}
          >
            {value}
          </div>
        </div>
        {Icon && (
          <div className="flex h-9 w-9 items-center justify-center border border-border-subtle bg-elevated text-text-secondary">
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
      {(subtext || trend) && (
        <div className="relative mt-3 flex items-center justify-between gap-3 text-xs">
          {subtext && <span className="text-text-secondary">{subtext}</span>}
          {trend && <span className="text-text-secondary">{trend}</span>}
        </div>
      )}
    </div>
  );
}
