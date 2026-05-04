import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/format';
import type { TimelineEvent } from '@/lib/types';

interface ActivityTimelineProps {
  events: TimelineEvent[];
  className?: string;
}

const eventTypeColors: Record<TimelineEvent['type'], string> = {
  deal_created: 'bg-clinch-accent',
  deposited: 'bg-clinch-success',
  vote_submitted: 'bg-clinch-accent',
  disputed: 'bg-clinch-warning',
  resolved: 'bg-clinch-success',
  cancelled: 'bg-clinch-neutral',
  expired: 'bg-clinch-neutral',
};

export function ActivityTimeline({ events, className }: ActivityTimelineProps) {
  return (
    <div className={cn('space-y-0', className)}>
      {events.map((event, index) => {
        const isLast = index === events.length - 1;

        return (
          <div key={event.id} className="relative flex gap-4">
            {/* Line and dot */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'h-2.5 w-2.5 rounded-full',
                  eventTypeColors[event.type]
                )}
              />
              {!isLast && (
                <div className="w-px flex-1 bg-clinch-border-default" />
              )}
            </div>

            {/* Content */}
            <div className={cn('pb-6', isLast && 'pb-0')}>
              <div className="text-sm font-medium text-clinch-text-primary">
                {event.description}
              </div>
              <div className="mt-0.5 text-xs text-clinch-text-tertiary">
                {formatRelativeTime(event.timestamp)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
