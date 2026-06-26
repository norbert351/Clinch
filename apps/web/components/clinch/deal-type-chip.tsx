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
        'inline-flex items-center border border-border-subtle bg-elevated px-2.5 py-1 font-mono text-[10px] uppercase leading-none tracking-[0.1em] text-text-secondary',
        className
      )}
    >
      {type === 'mutual' ? 'Mutual stake' : 'One-sided'}
    </span>
  );
}
