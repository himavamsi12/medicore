import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { Kpi } from "@/types";
import { Sparkline } from "@/components/charts/charts";
import { SeverityDot } from "@/components/feedback/status-badge";
import { inrCompact, minutesLabel, number } from "@/lib/format";
import { cn } from "@/lib/utils";

export function formatKpi(k: Pick<Kpi, "value" | "format">): string {
  switch (k.format) {
    case "percent":
      return `${k.value.toFixed(1)}%`;
    case "inr":
      return inrCompact(k.value);
    case "minutes":
      return minutesLabel(k.value);
    default:
      return number(k.value);
  }
}

function DeltaText({ kpi }: { kpi: Kpi }) {
  if (kpi.delta === undefined) return <span className="text-muted-foreground">{kpi.deltaLabel}</span>;
  const directional = kpi.format === "percent" || (kpi.goodDirection && kpi.deltaLabel?.includes("vs"));
  if (!directional) {
    const val = kpi.deltaLabel?.includes("value") ? inrCompact(kpi.delta) : number(kpi.delta);
    return (
      <span className="text-muted-foreground">
        <span className="font-medium text-foreground">{val}</span> {kpi.deltaLabel}
      </span>
    );
  }
  const up = kpi.delta >= 0;
  const good = kpi.goodDirection ? (kpi.goodDirection === "up") === up : undefined;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="flex items-center gap-1 text-muted-foreground">
      <span className={cn("flex items-center font-medium", good === undefined ? "text-foreground" : good ? "text-stable-fg" : "text-critical-fg")}>
        <Icon className="size-3.5" aria-hidden />
        {up ? "+" : ""}
        {kpi.delta}
        {kpi.format === "percent" ? " pts" : "%"}
      </span>
      {kpi.deltaLabel?.replace("pts ", "")}
    </span>
  );
}

export function KpiTile({ kpi, className }: { kpi: Kpi; className?: string }) {
  const body = (
    <div className={cn("group flex h-full flex-col gap-2 rounded-xl border bg-card p-4 transition-colors", kpi.href && "hover:border-border-strong hover:bg-accent/40", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-muted-foreground">{kpi.label}</p>
        {kpi.severity && kpi.severity !== "neutral" && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <SeverityDot tone={kpi.severity} />
            <span className="sr-only">{kpi.severity}</span>
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-3">
        <p className="text-2xl font-semibold tracking-tight">{formatKpi(kpi)}</p>
        {kpi.spark && <Sparkline values={kpi.spark} label={`${kpi.label}, last ${kpi.spark.length} days`} />}
      </div>
      <div className="min-h-4 text-xs">
        <DeltaText kpi={kpi} />
      </div>
    </div>
  );
  return kpi.href ? (
    <Link href={kpi.href} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2">
      {body}
    </Link>
  ) : (
    body
  );
}
