"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Barcode, TestTubes } from "lucide-react";
import type { LabOrderStatus, LabOrderView } from "@/types";
import { labService } from "@/services/labService";
import { KanbanBoard } from "@/components/data/kanban";
import { PanelSkeleton } from "@/components/feedback/states";
import { StatusBadge } from "@/components/feedback/status-badge";
import { PageHeader } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-current-user";
import { can } from "@/lib/rbac";
import { STALE } from "@/lib/constants";
import { ago, minutesLabel } from "@/lib/format";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";

const NEXT: Partial<Record<LabOrderStatus, { to: LabOrderStatus; label: string }>> = {
  Ordered: { to: "Collected", label: "Mark collected" },
  Rejected: { to: "Collected", label: "Redraw collected" },
  Collected: { to: "Processing", label: "Receive in lab" },
};

function SampleCard({ o }: { o: LabOrderView }) {
  const qc = useQueryClient();
  const { role, user } = useCurrentUser();
  const now = useNow();
  const next = NEXT[o.status];
  const advance = useMutation({
    mutationFn: (to: LabOrderStatus) => labService.advance(o.id, to, user?.name),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["lab-pipeline"] });
      qc.invalidateQueries({ queryKey: ["lab-orders"] });
      toast.success(`${r.sampleId}: ${r.status.toLowerCase()}`);
    },
  });
  const tat = Math.max(...o.tests.map((t) => t.tatHours)) * 60 * (o.priority === "STAT" ? 0.35 : o.priority === "Urgent" ? 0.6 : 1);
  const elapsed = Math.round((now - new Date(o.orderedAt).getTime()) / 60000);
  const late = o.status !== "Verified" && elapsed > tat;
  const allowed = next && (next.to === "Collected" ? can(role, "lab.collect") : can(role, "lab.result"));
  return (
    <article className={cn("rounded-lg border bg-card p-3 shadow-[var(--shadow-raise)]", o.priority === "STAT" && "border-l-4 border-l-critical", late && "border-warning/60")}>
      <div className="flex items-center justify-between gap-2">
        <span className="num flex items-center gap-1 text-xs font-medium">
          <Barcode className="size-3.5" aria-hidden /> {o.sampleId}
        </span>
        <StatusBadge status={o.priority} />
      </div>
      <Link href={`/lab/orders/${o.id}`} className="mt-1.5 block text-sm font-medium hover:underline">
        {o.patient.fullName}
      </Link>
      <p className="text-xs text-muted-foreground">
        {o.patient.ageLabel} {o.patient.gender[0]} · {o.location ?? o.source}
      </p>
      <p className="mt-1 line-clamp-2 text-[13px]">{o.tests.map((t) => t.name).join(", ")}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {o.tests[0]?.sampleType} · {o.tests[0]?.container}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className={cn("text-[11px]", late ? "font-medium text-warning-fg" : "text-muted-foreground")}>
          {late ? `Over target by ${minutesLabel(elapsed - Math.round(tat))}` : `Ordered ${ago(o.orderedAt)}`}
        </span>
        {o.criticalCount > 0 && <StatusBadge tone="critical">Critical</StatusBadge>}
        {o.status === "Rejected" && <StatusBadge tone="critical">Redraw: {o.rejectionReason}</StatusBadge>}
      </div>
      <div className="mt-2.5 flex gap-2">
        {next && allowed && (
          <Button size="sm" className="h-9 flex-1" disabled={advance.isPending} onClick={() => advance.mutate(next.to)}>
            {next.label} <ArrowRight />
          </Button>
        )}
        {(o.status === "Processing" || o.status === "Resulted") && can(role, "lab.result") && (
          <Button size="sm" className="h-9 flex-1" render={<Link href={`/lab/orders/${o.id}`} />} nativeButton={false}>
            {o.status === "Resulted" ? "Verify" : "Enter results"}
          </Button>
        )}
      </div>
    </article>
  );
}

export default function SampleTrackingPage() {
  const q = useQuery({ queryKey: ["lab-pipeline"], queryFn: () => labService.getPipeline(), staleTime: STALE.live, refetchInterval: 30_000 });
  const rows = q.data ?? [];
  return (
    <>
      <PageHeader title="Sample tracking" description="Collected, processing and verified samples from the last 36 hours. STAT first." />
      {q.isLoading ? (
        <PanelSkeleton lines={12} className="rounded-xl border" />
      ) : (
        <KanbanBoard
          label="Sample tracking board"
          columns={[
            { id: "ordered", title: "To collect", tone: "neutral", items: rows.filter((o) => o.status === "Ordered" || o.status === "Rejected"), hint: "Phlebotomy worklist", empty: "Nothing to collect" },
            { id: "collected", title: "Collected", tone: "info", items: rows.filter((o) => o.status === "Collected"), hint: "In transit to lab", empty: "No samples in transit" },
            { id: "processing", title: "Processing", tone: "warning", items: rows.filter((o) => o.status === "Processing" || o.status === "Resulted"), hint: "On analysers or awaiting verification", empty: "Nothing on the bench" },
            { id: "verified", title: "Verified (6 h)", tone: "stable", items: rows.filter((o) => o.status === "Verified"), empty: "No reports released yet" },
          ]}
          getKey={(o) => o.id}
          renderCard={(o) => <SampleCard o={o} />}
          minColumnWidth={290}
        />
      )}
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <TestTubes className="size-3.5" aria-hidden /> Rejected samples (haemolysed, clotted, mislabelled) move back to the collection worklist for redraw.
      </p>
    </>
  );
}
