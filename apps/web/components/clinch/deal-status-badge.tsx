import { cn } from '@/lib/utils';

type DealStatusUI = 'active' | 'disputed' | 'resolved' | 'cancelled' | 'expired' | 'pending';

interface DealStatusBadgeProps {
  status: DealStatusUI | string;
  className?: string;
}

const statusConfig: Record<
  DealStatusUI,
  { label: string; className: string }
> = {
  active: {
    label: 'Active',
    className: 'text-clinch-status-active-text bg-clinch-status-active-bg border-clinch-status-active-border',
  },
  disputed: {
    label: 'Disputed',
    className: 'text-clinch-status-disputed-text bg-clinch-status-disputed-bg border-clinch-status-disputed-border',
  },
  resolved: {
    label: 'Resolved',
    className: 'text-clinch-status-resolved-text bg-clinch-status-resolved-bg border-clinch-status-resolved-border',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'text-clinch-status-cancelled-text bg-clinch-status-cancelled-bg border-clinch-status-cancelled-border',
  },
  expired: {
    label: 'Expired',
    className: 'text-clinch-status-cancelled-text bg-clinch-status-cancelled-bg border-clinch-status-cancelled-border',
  },
  pending: {
    label: 'Pending',
    className: 'text-clinch-status-pending-text bg-clinch-status-pending-bg border-clinch-status-pending-border',
  },
};

export function DealStatusBadge({ status, className }: DealStatusBadgeProps) {
  const config = statusConfig[status as DealStatusUI] || statusConfig.pending;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
