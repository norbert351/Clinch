import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  valueClassName?: string;
  className?: string;
}

export function StatCard({
  label,
  value,
  subtext,
  valueClassName,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-clinch-border-default bg-clinch-bg-card p-5',
        className
      )}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-clinch-text-tertiary">
        {label}
      </div>
      <div
        className={cn(
          'mt-1 text-2xl font-semibold text-clinch-text-primary',
          valueClassName
        )}
      >
        {value}
      </div>
      {subtext && (
        <div className="mt-1 text-xs text-clinch-text-secondary">{subtext}</div>
      )}
    </div>
  );
}
