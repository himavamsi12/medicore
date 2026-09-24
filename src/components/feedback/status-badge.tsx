import { cn } from "@/lib/utils";
import type { Severity } from "@/types";

const TONE: Record<Severity, string> = {
  critical: "bg-critical-soft text-critical-fg",
  warning: "bg-warning-soft text-warning-fg",
  stable: "bg-stable-soft text-stable-fg",
  info: "bg-info-soft text-info-fg",
  neutral: "bg-neutral-soft text-neutral-fg",
};

const DOT: Record<Severity, string> = {
  critical: "bg-critical",
  warning: "bg-warning",
  stable: "bg-stable",
  info: "bg-info",
  neutral: "bg-neutral",
};

/**
 * One semantic map for every status string in the product. Status colour always
 * ships with its text label, never colour alone.
 */
const STATUS_TONE: Record<string, Severity> = {
  // clinical acuity
  Critical: "critical", Serious: "warning", Stable: "stable",
  // patients & admissions
  Admitted: "info", "In ER": "warning", OPD: "neutral", Discharged: "neutral", Inactive: "neutral", "Discharge planned": "stable", LAMA: "warning", Expired: "neutral",
  // appointments
  Scheduled: "neutral", "Checked in": "info", "In consultation": "stable", Completed: "neutral", Cancelled: "neutral", "No show": "warning",
  // beds
  Occupied: "info", Available: "stable", Cleaning: "warning", Reserved: "neutral", Maintenance: "neutral",
  // ER
  Waiting: "warning", "In triage": "info", "Under treatment": "info", Observation: "neutral", "Referred out": "neutral",
  // lab & radiology
  Ordered: "neutral", Collected: "info", Processing: "info", Resulted: "warning", Verified: "stable", Rejected: "critical", Acquired: "info", Reported: "warning",
  // pharmacy
  Pending: "warning", "Partially dispensed": "info", Dispensed: "stable",
  // OT
  "Pre-op": "info", "In progress": "warning", Recovery: "stable", Postponed: "neutral",
  // billing
  Draft: "neutral", Unpaid: "warning", "Partially paid": "info", Paid: "stable", "Insurance pending": "info",
  "Pre-auth requested": "neutral", "Pre-auth approved": "info", "Query raised": "warning", "Final bill submitted": "info", Approved: "stable", "Partially approved": "warning", Settled: "stable",
  // inventory
  "Pending approval": "warning", Sent: "info", "Partially received": "info", Received: "stable", "In stock": "stable", Low: "warning", "Out of stock": "critical",
  // blood
  "Cross-matching": "info", Ready: "stable", Issued: "neutral", Quarantine: "warning",
  // staff
  Active: "stable", "On leave": "neutral", "Notice period": "warning", Present: "stable", Late: "warning", Absent: "critical", "Half day": "info", "Week off": "neutral",
  // doctors
  "In OPD": "info", "In surgery": "warning", "On rounds": "info", "Off duty": "neutral",
  // priority
  STAT: "critical", Urgent: "warning", Routine: "neutral",
};

export function statusTone(status: string): Severity {
  return STATUS_TONE[status] ?? "neutral";
}

export function StatusBadge({
  status,
  tone,
  dot = false,
  className,
  children,
}: {
  status?: string;
  tone?: Severity;
  dot?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const t = tone ?? (status ? statusTone(status) : "neutral");
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-[11px] leading-none font-medium whitespace-nowrap", TONE[t], className)}>
      {dot && <span aria-hidden className={cn("size-1.5 rounded-full", DOT[t])} />}
      {children ?? status}
    </span>
  );
}

export function SeverityDot({ tone, className }: { tone: Severity; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", DOT[tone], className)} />;
}

export const toneText: Record<Severity, string> = {
  critical: "text-critical-fg",
  warning: "text-warning-fg",
  stable: "text-stable-fg",
  info: "text-info-fg",
  neutral: "text-muted-foreground",
};

export const toneBorder: Record<Severity, string> = {
  critical: "border-l-critical",
  warning: "border-l-warning",
  stable: "border-l-stable",
  info: "border-l-info",
  neutral: "border-l-border-strong",
};
