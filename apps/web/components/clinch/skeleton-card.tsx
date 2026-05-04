'use client';

import { cn } from '@/lib/utils';

function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded bg-clinch-bg-elevated',
        className
      )}
    />
  );
}

export function DealCardSkeleton() {
  return (
    <div className="rounded-xl border border-clinch-border-default bg-clinch-bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <Shimmer className="h-6 w-16" />
            <Shimmer className="h-5 w-20" />
          </div>
          <Shimmer className="h-5 w-48" />
          <Shimmer className="h-4 w-32" />
        </div>
        <div className="text-right">
          <Shimmer className="ml-auto h-6 w-24" />
          <Shimmer className="ml-auto mt-2 h-4 w-20" />
        </div>
      </div>
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-clinch-border-default bg-clinch-bg-card p-4">
      <Shimmer className="h-4 w-16" />
      <Shimmer className="mt-2 h-7 w-24" />
    </div>
  );
}

export function DealDetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Shimmer className="h-6 w-20" />
        <Shimmer className="h-5 w-24" />
        <Shimmer className="h-4 w-16" />
      </div>
      
      {/* Title */}
      <Shimmer className="h-8 w-64" />
      <Shimmer className="h-4 w-full max-w-md" />

      {/* Cards */}
      <div className="grid gap-6 lg:grid-cols-[1fr,380px]">
        <div className="space-y-6">
          {/* Parties card */}
          <div className="rounded-xl border border-clinch-border-default bg-clinch-bg-card p-6">
            <Shimmer className="mb-4 h-5 w-32" />
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Shimmer className="h-8 w-8 rounded-full" />
                  <div>
                    <Shimmer className="h-4 w-28" />
                    <Shimmer className="mt-1 h-3 w-16" />
                  </div>
                </div>
                <Shimmer className="h-4 w-24" />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Shimmer className="h-8 w-8 rounded-full" />
                  <div>
                    <Shimmer className="h-4 w-28" />
                    <Shimmer className="mt-1 h-3 w-16" />
                  </div>
                </div>
                <Shimmer className="h-4 w-24" />
              </div>
            </div>
          </div>

          {/* Terms card */}
          <div className="rounded-xl border border-clinch-border-default bg-clinch-bg-card p-6">
            <Shimmer className="mb-4 h-5 w-24" />
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex justify-between">
                  <Shimmer className="h-4 w-28" />
                  <Shimmer className="h-4 w-20" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Action panel */}
        <div className="rounded-xl border border-clinch-border-default bg-clinch-bg-card p-6">
          <div className="mb-4 text-center">
            <Shimmer className="mx-auto h-7 w-32" />
            <Shimmer className="mx-auto mt-1 h-3 w-20" />
          </div>
          <div className="my-6 border-t border-clinch-border-default" />
          <Shimmer className="h-5 w-40" />
          <Shimmer className="mt-2 h-4 w-full" />
          <Shimmer className="mt-4 h-12 w-full" />
        </div>
      </div>
    </div>
  );
}

export function ArbitrationCardSkeleton() {
  return (
    <div className="rounded-xl border border-clinch-border-default bg-clinch-bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <Shimmer className="h-6 w-40" />
            <Shimmer className="h-5 w-16" />
          </div>
          <div className="flex items-center gap-2">
            <Shimmer className="h-4 w-24" />
            <Shimmer className="h-4 w-4" />
            <Shimmer className="h-4 w-24" />
          </div>
          <Shimmer className="h-4 w-32" />
        </div>
        <div className="text-right space-y-2">
          <Shimmer className="ml-auto h-6 w-24" />
          <Shimmer className="ml-auto h-4 w-20" />
        </div>
      </div>
      <div className="mt-4 border-t border-clinch-border-default pt-4">
        <div className="flex gap-4">
          <div className="flex-1">
            <Shimmer className="h-3 w-20" />
            <Shimmer className="mt-1 h-4 w-24" />
          </div>
          <div className="flex-1">
            <Shimmer className="h-3 w-20" />
            <Shimmer className="mt-1 h-4 w-24" />
          </div>
        </div>
      </div>
    </div>
  );
}
