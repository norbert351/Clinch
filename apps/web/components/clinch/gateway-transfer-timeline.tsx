import { Check, Clock, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GatewayTimelineItem } from '@/lib/types';

interface GatewayTransferTimelineProps {
  items: GatewayTimelineItem[];
  compact?: boolean;
}

function StepIcon({ status }: { status: GatewayTimelineItem['status'] }) {
  if (status === 'complete') return <Check className="h-3.5 w-3.5" />;
  if (status === 'active') return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
  return <Clock className="h-3.5 w-3.5" />;
}

export function GatewayTransferTimeline({
  items,
  compact = false,
}: GatewayTransferTimelineProps) {
  return (
    <div className={cn('space-y-3', compact && 'space-y-2')}>
      {items.map((item, index) => (
        <div key={item.key} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full border text-xs',
                item.status === 'complete' && 'border-clinch-success bg-clinch-success-muted text-clinch-success',
                item.status === 'active' && 'border-clinch-accent bg-clinch-accent-muted text-clinch-accent',
                item.status === 'pending' && 'border-clinch-border-default bg-clinch-bg-elevated text-clinch-text-tertiary',
                item.status === 'failed' && 'border-clinch-danger bg-clinch-danger-muted text-clinch-danger',
              )}
            >
              <StepIcon status={item.status} />
            </span>
            {index < items.length - 1 && (
              <span className="mt-1 h-5 w-px bg-clinch-border-default" />
            )}
          </div>
          <div className="min-w-0 pb-2">
            <div className="text-sm font-medium text-clinch-text-primary">
              {item.label}
            </div>
            {!compact && item.detail && (
              <div className="mt-0.5 text-xs text-clinch-text-tertiary">
                {item.detail}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
