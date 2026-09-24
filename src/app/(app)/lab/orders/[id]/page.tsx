"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Loader2, Printer, ShieldCheck, XCircle } from "lucide-react";
import type { LabParameter } from "@/types";
import { labService } from "@/services/labService";
import { ErrorState, PanelSkeleton } from "@/components/feedback/states";
import { StatusBadge } from "@/components/feedback/status-badge";
import { TextareaField } from "@/components/forms/fields";
import { Field, PageHeader, Panel } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FlagMark, LabInterpreter, LabResultsTable } from "@/features/lab/lab-results";
import { useCurrentUser } from "@/hooks/use-current-user";
import { flagResult, formatRange } from "@/lib/clinical";
import { can } from "@/lib/rbac";
import { dateTime, minutesLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const STEPS = ["Ordered", "Collected", "Processing", "Resulted", "Verified"] as const;
const REJECT_REASONS = ["Haemolysed sample", "Clotted EDTA sample", "Insufficient volume", "Label mismatch", "Wrong container"];

export default function LabOrderPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { role, user } = useCurrentUser();
  const q = useQuery({ queryKey: ["lab-order", id], queryFn: () => labService.getOrder(id) });
  const history = useQuery({ queryKey: ["lab-orders", "patient", q.data?.patientId], queryFn: () => labService.getOrdersByPatient(q.data!.patientId), enabled: Boolean(q.data) });
  const [values, setValues] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState<string>();
  const [readBack, setReadBack] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0]);

  const invalidate = () => ["lab-order", "lab-orders", "lab-pipeline", "notifications", "kpis", "timeline"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const save = useMutation({
    mutationFn: (verify: boolean) => {
      const o = q.data!;
      const out = o.tests.flatMap((t) =>
        t.parameters.map((p) => {
          const raw = values[`${t.code}.${p.code}`] ?? String(o.results.find((r) => r.testCode === t.code && r.paramCode === p.code)?.value ?? "");
          return { testCode: t.code, paramCode: p.code, value: p.options ? raw : Number(raw) };
        }),
      );
      return labService.saveResults(o.id, out, remarks ?? o.remarks, verify, user?.name ?? "Pathologist");
    },
    onSuccess: (r) => {
      invalidate();
      setValues({});
      toast.success(r.status === "Verified" ? "Report verified and released" : "Results saved", { description: r.criticalCount ? `${r.criticalCount} critical value${r.criticalCount > 1 ? "s" : ""}. Treating team notified.` : undefined });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });
  const reject = useMutation({
    mutationFn: () => labService.advance(id, "Rejected", user?.name, rejectReason),
    onSuccess: () => {
      invalidate();
      setRejecting(false);
      toast.success("Sample rejected. Sent back for redraw.");
    },
  });

  if (q.isLoading) return <PanelSkeleton lines={12} className="rounded-xl border" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const o = q.data!;
  const editable = can(role, "lab.result") && ["Collected", "Processing", "Resulted"].includes(o.status);
  const canVerify = can(role, "lab.verify");
  const stepIdx = STEPS.indexOf(o.status as (typeof STEPS)[number]);
  const stamps: Record<string, string | undefined> = { Ordered: o.orderedAt, Collected: o.collectedAt, Processing: o.processingAt, Resulted: o.resultedAt, Verified: o.verifiedAt };

  const valueOf = (testCode: string, p: LabParameter) => values[`${testCode}.${p.code}`] ?? String(o.results.find((r) => r.testCode === testCode && r.paramCode === p.code)?.value ?? "");
  const previousOf = (paramCode: string) =>
    (history.data ?? [])
      .filter((x) => x.id !== o.id && x.orderedAt < o.orderedAt)
      .flatMap((x) => x.results.filter((r) => r.paramCode === paramCode).map((r) => ({ v: r.value, at: x.resultedAt ?? x.orderedAt })))[0];
  const allParams = o.tests.flatMap((t) => t.parameters.map((p) => ({ t, p })));
  const complete = allParams.every(({ t, p }) => valueOf(t.code, p).trim() !== "" && (p.options || !Number.isNaN(Number(valueOf(t.code, p)))));
  const criticalNow = allParams.some(({ t, p }) => {
    const raw = valueOf(t.code, p);
    if (!raw) return false;
    const f = flagResult(p, p.options ? raw : Number(raw));
    return f === "HH" || f === "LL";
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title={o.tests.map((t) => t.name).join(", ")}
        breadcrumbs={[{ label: "Lab orders", href: "/lab/orders" }, { label: o.orderNo }]}
        meta={
          <>
            <StatusBadge status={o.status} />
            <StatusBadge status={o.priority} />
            <span className="num">Sample {o.sampleId}</span>
            <span>{o.source}{o.location ? ` · ${o.location}` : ""}</span>
            {o.tatMinutes !== undefined && <span>TAT {minutesLabel(o.tatMinutes)}</span>}
          </>
        }
        actions={
          <>
            {editable && (
              <Button variant="ghost" onClick={() => setRejecting(true)}>
                <XCircle /> Reject sample
              </Button>
            )}
            {(o.status === "Verified" || o.status === "Resulted") && (
              <Button variant="outline" render={<Link href={`/print/lab/${o.id}`} target="_blank" />} nativeButton={false}>
                <Printer /> Print report
              </Button>
            )}
          </>
        }
      />

      <ol className="grid grid-cols-5 gap-1 rounded-xl border bg-card p-3" aria-label="Sample progress">
        {STEPS.map((s, i) => (
          <li key={s} className="min-w-0">
            <div className={cn("h-1.5 rounded-full", i <= stepIdx ? "bg-primary" : "bg-muted")} aria-hidden />
            <p className={cn("mt-1.5 text-xs font-medium", i > stepIdx && "text-muted-foreground")}>{s}</p>
            <p className="num truncate text-[11px] text-muted-foreground">{stamps[s] ? dateTime(stamps[s]!) : "-"}</p>
          </li>
        ))}
      </ol>
      {o.status === "Rejected" && <p role="alert" className="rounded-lg border border-critical/40 bg-critical-soft/40 px-4 py-2.5 text-sm text-critical-fg">Sample rejected: {o.rejectionReason}. Awaiting redraw.</p>}

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-4">
          <Panel title="Patient and order">
            <dl className="grid grid-cols-2 gap-4 p-4 md:grid-cols-4">
              <Field label="Patient">
                <Link href={`/patients/${o.patientId}`} className="hover:underline">
                  {o.patient.fullName}
                </Link>
              </Field>
              <Field label="UHID">{o.patient.uhid}</Field>
              <Field label="Age / sex">{`${o.patient.ageLabel} / ${o.patient.gender}`}</Field>
              <Field label="Ordered by">{o.orderedBy.name}</Field>
              <Field label="Collected by">{o.collectedBy}</Field>
              <Field label="Sample">{o.tests[0]?.sampleType}</Field>
              <Field label="Container">{o.tests[0]?.container}</Field>
              <Field label="Verified by">{o.verifiedBy}</Field>
            </dl>
          </Panel>

          {editable ? (
            <Panel title="Result entry" description="Flags update as you type. Previous values shown for delta check.">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save.mutate(false);
                }}
              >
                {o.tests.map((t) => (
                  <fieldset key={t.code} className="border-b">
                    <legend className="w-full bg-muted/40 px-4 py-1.5 text-xs font-medium text-muted-foreground">{t.name}</legend>
                    <div className="divide-y">
                      {t.parameters.map((p) => {
                        const raw = valueOf(t.code, p);
                        const flag = raw ? flagResult(p, p.options ? raw : Number(raw)) : undefined;
                        const prev = previousOf(p.code);
                        const inputId = `r-${t.code}-${p.code}`;
                        return (
                          <div key={p.code} className={cn("grid items-center gap-2 px-4 py-2 sm:grid-cols-[1.4fr_1fr_auto_1fr]", (flag === "HH" || flag === "LL") && "bg-critical-soft/40")}>
                            <label htmlFor={inputId} className="text-sm">
                              {p.name}
                              {p.unit && <span className="text-xs text-muted-foreground"> ({p.unit})</span>}
                            </label>
                            {p.options ? (
                              <select id={inputId} value={raw} onChange={(e) => setValues((v) => ({ ...v, [`${t.code}.${p.code}`]: e.target.value }))} className="h-8 rounded-md border border-input bg-card px-2 text-sm outline-none focus-visible:border-ring">
                                <option value="">Select</option>
                                {p.options.map((opt) => (
                                  <option key={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : (
                              <input id={inputId} inputMode="decimal" value={raw} onChange={(e) => setValues((v) => ({ ...v, [`${t.code}.${p.code}`]: e.target.value }))} className="num h-8 rounded-md border border-input bg-card px-2 text-right text-sm outline-none focus-visible:border-ring" />
                            )}
                            <span className="min-w-24">{flag && <FlagMark flag={flag} />}</span>
                            <span className="text-xs text-muted-foreground">
                              Ref {formatRange(p)}
                              {prev && <span className="block">Prev {String(prev.v)}</span>}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
                <div className="grid gap-3 p-4">
                  <TextareaField label="Remarks" rows={2} value={remarks ?? o.remarks ?? ""} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Smear reviewed. Platelet clumps not seen." />
                  {criticalNow && (
                    <label className="flex items-start gap-2 rounded-lg border border-critical/40 bg-critical-soft/40 p-3 text-sm">
                      <Checkbox checked={readBack} onCheckedChange={(v) => setReadBack(Boolean(v))} className="mt-0.5" />
                      Critical value communicated to the treating team with read-back, and documented.
                    </label>
                  )}
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button type="submit" variant="outline" disabled={!complete || save.isPending}>
                      <Check /> Save results
                    </Button>
                    {canVerify && (
                      <Button type="button" onClick={() => save.mutate(true)} disabled={!complete || save.isPending || (criticalNow && !readBack)}>
                        {save.isPending ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Verify and release
                      </Button>
                    )}
                  </div>
                  {!complete && <p className="text-xs text-muted-foreground">Enter every parameter to save.</p>}
                </div>
              </form>
            </Panel>
          ) : (
            <Panel title="Results" description={o.verifiedAt ? `Verified ${dateTime(o.verifiedAt)} by ${o.verifiedBy}` : undefined}>
              <LabResultsTable order={o} />
              {o.remarks && <p className="border-t px-4 py-2.5 text-sm"><span className="font-medium">Remarks: </span>{o.remarks}</p>}
            </Panel>
          )}
        </div>
        {o.results.length > 0 && <LabInterpreter orderId={o.id} />}
      </div>

      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject sample {o.sampleId}</DialogTitle>
            <DialogDescription>The order returns to the collection worklist and the ward is asked to redraw.</DialogDescription>
          </DialogHeader>
          <div role="radiogroup" aria-label="Rejection reason" className="grid gap-1.5">
            {REJECT_REASONS.map((r) => (
              <label key={r} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-info-soft">
                <input type="radio" name="reason" checked={rejectReason === r} onChange={() => setRejectReason(r)} className="accent-[var(--primary)]" />
                {r}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => reject.mutate()} disabled={reject.isPending}>
              Reject sample
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
