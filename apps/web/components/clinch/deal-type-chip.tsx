import { cn } from '@/lib/utils';

type DealTypeUI = 'mutual' | 'one-sided';

interface DealTypeChipProps {
  type: DealTypeUI | string;
  className?: string;
}

export function DealTypeChip({ type, className }: DealTypeChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-clinch-border-default bg-clinch-bg-elevated px-2 py-0.5 text-[11px] font-medium text-clinch-text-secondary',
        className
      )}
    >
      {type === 'mutual' ? 'Mutual' : 'One-Sided'}
    </span>
  );
}
