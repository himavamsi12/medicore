"use client";

import { AnimatePresence, motion } from "motion/react";
import type { Severity } from "@/types";
import { SeverityDot } from "@/components/feedback/status-badge";
import { cn } from "@/lib/utils";

export interface KanbanColumn<T> {
  id: string;
  title: string;
  tone?: Severity;
  items: T[];
  hint?: string;
  empty?: string;
}

/**
 * Status board. Columns scroll horizontally with snap on tablets and phones,
 * and sit side by side on wide screens. Moving cards is done with explicit
 * buttons on each card (keyboard and touch friendly), not drag and drop.
 */
export function KanbanBoard<T>({
  columns,
  getKey,
  renderCard,
  className,
  label,
  minColumnWidth = 280,
}: {
  columns: KanbanColumn<T>[];
  getKey: (item: T) => string;
  renderCard: (item: T, column: KanbanColumn<T>) => React.ReactNode;
  className?: string;
  label: string;
  minColumnWidth?: number;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      className={cn("flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 scrollbar-thin xl:grid xl:snap-none xl:overflow-visible", className)}
      style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
    >
      {columns.map((col) => (
        <section key={col.id} aria-label={`${col.title}, ${col.items.length}`} className="flex max-h-[calc(100dvh-220px)] w-(--col-w) shrink-0 snap-start flex-col rounded-xl border bg-muted/40 xl:max-h-none xl:w-auto xl:min-w-0" style={{ "--col-w": `min(86vw, ${minColumnWidth}px)` } as React.CSSProperties}>
          <header className="flex items-center gap-2 border-b px-3 py-2.5">
            {col.tone && <SeverityDot tone={col.tone} />}
            <h2 className="text-sm font-medium">{col.title}</h2>
            <span className="num ml-auto rounded-full bg-card px-2 text-xs text-muted-foreground ring-1 ring-border">{col.items.length}</span>
          </header>
          {col.hint && <p className="border-b px-3 py-1.5 text-[11px] text-muted-foreground">{col.hint}</p>}
          <ol className="flex-1 space-y-2 overflow-y-auto p-2 scrollbar-thin">
            <AnimatePresence initial={false}>
              {col.items.map((item) => (
                <motion.li key={getKey(item)} layout initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}>
                  {renderCard(item, col)}
                </motion.li>
              ))}
            </AnimatePresence>
            {col.items.length === 0 && <li className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">{col.empty ?? "Nothing here"}</li>}
          </ol>
        </section>
      ))}
    </div>
  );
}
