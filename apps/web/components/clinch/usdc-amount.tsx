import { cn } from '@/lib/utils';
import { formatUSDC } from '@/lib/format';

interface USDCAmountProps {
  amount: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function USDCAmount({
  amount,
  className,
  size = 'md',
  showLabel = true,
}: USDCAmountProps) {
  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-[15px]',
    lg: 'text-2xl',
  };

  return (
    <span
      className={cn(
        'tabular-nums font-medium text-clinch-text-primary',
        sizeClasses[size],
        className
      )}
    >
      {formatUSDC(amount)}
      {showLabel && <span className="ml-1 text-clinch-text-secondary">USDC</span>}
    </span>
  );
}
