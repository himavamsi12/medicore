"use client";

import { AlertTriangle, RotateCw, type LucideIcon, Inbox, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ICON_STROKE } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "gap-2 px-4 py-8" : "gap-3 px-6 py-16", className)}>
      <div className="flex size-10 items-center justify-center rounded-xl border bg-muted/60 text-muted-foreground">
        <Icon className="size-5" strokeWidth={ICON_STROKE} aria-hidden />
      </div>
      <div className="max-w-sm space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error?: unknown; onRetry?: () => void; className?: string }) {
  const message = error instanceof Error ? error.message : "Something went wrong while loading this.";
  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center gap-3 px-6 py-12 text-center", className)}>
      <div className="flex size-10 items-center justify-center rounded-xl bg-critical-soft text-critical-fg">
        <AlertTriangle className="size-5" strokeWidth={ICON_STROKE} aria-hidden />
      </div>
      <div className="max-w-sm space-y-1">
        <p className="text-sm font-medium">Could not load data</p>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw strokeWidth={ICON_STROKE} /> Try again
        </Button>
      )}
    </div>
  );
}

export function AccessDenied({ action }: { action?: React.ReactNode }) {
  return (
    <EmptyState
      icon={ShieldOff}
      title="This area is outside your role"
      description="Your current role does not include access to this module. Switch to a role that does to continue."
      action={action}
    />
  );
}

/* ---------- Skeletons shaped like the real layout ---------- */

export function TableSkeleton({ rows = 8, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="divide-y" aria-hidden>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="grid items-center gap-4 px-4 py-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }).map((__, c) => (
            <Skeleton key={c} className={cn("h-3.5", c === 0 ? "w-4/5" : c === columns - 1 ? "w-1/2" : "w-3/5")} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function KpiSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-xl border bg-card p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

export function PanelSkeleton({ lines = 5, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-3 p-4", className)} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3.5" style={{ width: `${90 - ((i * 17) % 40)}%` }} />
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 220 }: { height?: number }) {
  return (
    <div className="flex items-end gap-2 px-4 pb-4" style={{ height }} aria-hidden>
      {Array.from({ length: 18 }).map((_, i) => (
        <Skeleton key={i} className="flex-1" style={{ height: `${30 + ((i * 37) % 60)}%` }} />
      ))}
    </div>
  );
}
