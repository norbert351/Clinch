type DealStatusUI =
  | 'active'
  | 'awaiting-deposit'
  | 'in-review'
  | 'disputed'
  | 'resolved'
  | 'closed'
  | 'cancelled'
  | 'expired'
  | 'pending';

interface DealStatusBadgeProps {
  status: DealStatusUI | string;
  className?: string;
  pulse?: boolean;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  active: { label: 'ACTIVE', color: 'var(--status-active)' },
  pending: { label: 'PENDING', color: 'var(--status-pending)' },
  'awaiting-deposit': { label: 'PENDING', color: 'var(--status-pending)' },
  'in-review': { label: 'IN REVIEW', color: 'var(--status-resolve)' },
  disputed: { label: 'DISPUTED', color: 'var(--status-dispute)' },
  resolved: { label: 'RESOLVED', color: 'var(--status-resolve)' },
  cancelled: { label: 'CANCELLED', color: 'var(--status-closed)' },
  expired: { label: 'EXPIRED', color: 'var(--status-closed)' },
  closed: { label: 'CLOSED', color: 'var(--status-closed)' },
  Active: { label: 'ACTIVE', color: 'var(--status-active)' },
  Pending: { label: 'PENDING', color: 'var(--status-pending)' },
  Disputed: { label: 'DISPUTED', color: 'var(--status-dispute)' },
  Resolved: { label: 'RESOLVED', color: 'var(--status-resolve)' },
  Cancelled: { label: 'CANCELLED', color: 'var(--status-closed)' },
  Expired: { label: 'EXPIRED', color: 'var(--status-closed)' },
};

export function DealStatusBadge({
  status,
  className,
}: DealStatusBadgeProps) {
  const raw = String(status || '');
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-');
  const config =
    statusConfig[normalized] ||
    statusConfig[raw] ||
    { label: raw.toUpperCase(), color: 'var(--status-closed)' };

  return (
    <span
      className={[
        'inline-flex items-center pl-2 font-mono text-[10px] uppercase tracking-[0.1em]',
        className || '',
      ].join(' ')}
      style={{
        color: config.color,
        borderLeft: `2px solid ${config.color}`,
      }}
    >
      {config.label}
    </span>
  );
}
