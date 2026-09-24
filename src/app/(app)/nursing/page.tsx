"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Check, HeartPulse, Loader2, Pill, Siren } from "lucide-react";
import type { NursingPatient } from "@/types";
import { aiService } from "@/services/aiService";
import { ipdService } from "@/services/ipdService";
import { nursingService } from "@/services/nursingService";
import { AiPanel, Analyzing, RiskScoreCard } from "@/components/ai/ai";
import { Sparkline } from "@/components/charts/charts";
import { EmptyState, PanelSkeleton } from "@/components/feedback/states";
import { StatusBadge } from "@/components/feedback/status-badge";
import { SelectField, TextareaField } from "@/components/forms/fields";
import { PageHeader, Panel } from "@/components/layout/page";
import { TabPanel, UrlTabs, useUrlTab, type TabDef } from "@/components/layout/url-tabs";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MarChart } from "@/features/nursing/mar";
import { VitalsDialog } from "@/features/nursing/vitals-dialog";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useListParams } from "@/hooks/use-list-params";
import { can, ROLE_PERSONA } from "@/lib/rbac";
import { ICON_STROKE, STALE } from "@/lib/constants";
import { ago, dateTime, time } from "@/lib/format";
import { cn } from "@/lib/utils";

const TABS: TabDef[] = [
  { id: "patients", label: "Patients" },
  { id: "mar", label: "Medication chart" },
  { id: "handover", label: "Shift handover" },
];

function PatientCard({ p, onVitals, onRisk, highlight }: { p: NursingPatient; onVitals: () => void; onRisk: () => void; highlight?: boolean }) {
  const { role } = useCurrentUser();
  const v = p.latestVitals;
  const score = p.news2 ?? 0;
  const tone = score >= 7 ? "critical" : score >= 5 ? "warning" : score >= 1 ? "neutral" : "stable";
  return (
    <article className={cn("flex flex-col rounded-xl border bg-card", score >= 7 && "border-critical/50", score >= 5 && score < 7 && "border-warning/60", highlight && "ring-2 ring-primary")}>
      <div className="flex items-start gap-3 p-3.5">
        <span className="num flex h-10 w-14 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold">{p.admission.bed.code.split("-")[1] ?? p.admission.bed.code}</span>
        <div className="min-w-0 flex-1">
          <Link href={`/ipd/admissions/${p.admission.id}`} className="block truncate font-medium hover:underline">
            {p.admission.patient.fullName}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {p.admission.patient.ageLabel} {p.admission.patient.gender[0]} · day {p.admission.lengthOfStayDays + 1} · {p.admission.reason}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <StatusBadge status={p.admission.acuity} />
            {p.admission.patient.allergies.length > 0 && <StatusBadge tone="critical">Allergy: {p.admission.patient.allergies.map((a) => a.substance).join(", ")}</StatusBadge>}
            {p.admission.patient.flags.filter((f) => f !== "Pregnant").map((f) => (
              <StatusBadge key={f} tone="warning">
                {f}
              </StatusBadge>
            ))}
            {p.admission.isolation && <StatusBadge tone="warning">{p.admission.isolation} isolation</StatusBadge>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-muted-foreground">NEWS2</p>
          <p className={cn("text-2xl leading-none font-semibold", tone === "critical" && "text-critical-fg", tone === "warning" && "text-warning-fg")}>{p.news2 ?? "-"}</p>
          <Sparkline values={p.news2Trend} className="mt-1 h-6 w-20" label={`NEWS2 trend: ${p.news2Trend.join(", ")}`} />
        </div>
      </div>
      <div className="grid grid-cols-5 border-t text-center">
        {[
          { l: "BP", v: v ? `${v.bpSystolic}/${v.bpDiastolic}` : "-" },
          { l: "HR", v: v?.pulse ?? "-" },
          { l: "SpO₂", v: v ? `${v.spo2}${v.onOxygen ? "*" : ""}` : "-" },
          { l: "RR", v: v?.respRate ?? "-" },
          { l: "T °F", v: v?.tempF ?? "-" },
        ].map((x) => (
          <div key={x.l} className="px-1 py-2">
            <p className="text-[10px] text-muted-foreground">{x.l}</p>
            <p className="num text-[13px] font-medium">{x.v}</p>
          </div>
        ))}
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2 border-t px-3.5 py-2.5">
        <span className="text-[11px] text-muted-foreground">{v ? `Vitals ${ago(v.recordedAt)}` : "No vitals"}</span>
        {p.overdueMeds > 0 && <StatusBadge tone="critical">{p.overdueMeds} overdue</StatusBadge>}
        {p.dueMeds > 0 && (
          <StatusBadge tone="info">
            <Pill className="size-3" /> {p.dueMeds} due
          </StatusBadge>
        )}
        <div className="ml-auto flex gap-1.5">
          <Button size="sm" variant="ghost" className="h-9 sm:h-7" onClick={onRisk}>
            Risk
          </Button>
          {can(role, "vitals.record") && (
            <Button size="sm" className="h-9 sm:h-7" onClick={onVitals}>
              <HeartPulse /> Vitals
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

function RiskSheet({ p, onClose }: { p: NursingPatient; onClose: () => void }) {
  const q = useQuery({ queryKey: ["risk", p.admission.patientId], queryFn: () => aiService.getRiskScores(p.admission.patientId), staleTime: STALE.live });
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{p.admission.patient.fullName}</SheetTitle>
          <SheetDescription>
            {p.admission.bed.code} · {p.admission.reason}
          </SheetDescription>
        </SheetHeader>
        <div className="overflow-y-auto px-4 pb-6">
          <AiPanel title="Clinical risk scores" meta={q.data?.[0]?.meta}>
            {q.isLoading ? (
              <Analyzing steps={["Latest vitals", "Lab markers", "Admission history"]} />
            ) : (
              <div className="space-y-2 p-3">
                {(q.data ?? []).map((r) => (
                  <RiskScoreCard key={r.kind} score={r} compact={r.level === "Low"} />
                ))}
              </div>
            )}
          </AiPanel>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Handover({ wardId }: { wardId: string }) {
  const qc = useQueryClient();
  const { role, user } = useCurrentUser();
  const q = useQuery({ queryKey: ["handovers", wardId], queryFn: () => nursingService.getHandovers(wardId) });
  const patients = useQuery({ queryKey: ["ward-patients", wardId], queryFn: () => nursingService.getWardPatients(wardId) });
  const [form, setForm] = useState({ patientId: "", situation: "", background: "", assessment: "", recommendation: "" });
  const add = useMutation({
    mutationFn: () => nursingService.addHandover({ wardId, fromStaffId: user?.staffId ?? user?.id ?? "", patientId: form.patientId || undefined, situation: form.situation, background: form.background, assessment: form.assessment, recommendation: form.recommendation }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["handovers", wardId] });
      setForm({ patientId: "", situation: "", background: "", assessment: "", recommendation: "" });
      toast.success("Handover note added");
    },
  });
  const ack = useMutation({
    mutationFn: (id: string) => nursingService.acknowledgeHandover(id, user?.staffId ?? ""),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["handovers", wardId] });
      qc.invalidateQueries({ queryKey: ["kpis"] });
    },
  });
  const valid = form.situation.trim() && form.assessment.trim() && form.recommendation.trim();
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
      <Panel title="Handover notes" description="SBAR format, most recent first">
        {q.isLoading ? (
          <PanelSkeleton lines={8} />
        ) : !q.data?.length ? (
          <EmptyState compact title="No handover notes yet" />
        ) : (
          <ol className="divide-y">
            {q.data.map((h) => (
              <li key={h.id} className="space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <StatusBadge tone="neutral">{h.shift} shift</StatusBadge>
                  {h.patientName && (
                    <span className="font-medium text-foreground">
                      {h.bedCode} · {h.patientName}
                    </span>
                  )}
                  <span>
                    by {h.fromName}, {dateTime(h.createdAt)}
                  </span>
                  {h.acknowledged ? (
                    <StatusBadge tone="stable">
                      <Check className="size-3" /> Acknowledged
                    </StatusBadge>
                  ) : (
                    can(role, "vitals.record") && (
                      <Button size="xs" variant="outline" className="ml-auto" onClick={() => ack.mutate(h.id)}>
                        Acknowledge
                      </Button>
                    )
                  )}
                </div>
                <dl className="grid gap-x-4 gap-y-1.5 text-[13px] sm:grid-cols-[110px_1fr]">
                  {(
                    [
                      ["Situation", h.situation],
                      ["Background", h.background],
                      ["Assessment", h.assessment],
                      ["Recommendation", h.recommendation],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-xs font-medium text-muted-foreground">{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ol>
        )}
      </Panel>
      {can(role, "vitals.record") && (
        <Panel title="New handover note">
          <form
            className="grid gap-3 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) add.mutate();
            }}
          >
            <SelectField label="Patient" placeholder="Whole ward" value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })} options={(patients.data ?? []).map((p) => ({ value: p.admission.patientId, label: `${p.admission.bed.code} · ${p.admission.patient.fullName}` }))} />
            <TextareaField label="Situation" required rows={2} value={form.situation} onChange={(e) => setForm({ ...form, situation: e.target.value })} />
            <TextareaField label="Background" rows={2} value={form.background} onChange={(e) => setForm({ ...form, background: e.target.value })} />
            <TextareaField label="Assessment" required rows={2} value={form.assessment} onChange={(e) => setForm({ ...form, assessment: e.target.value })} />
            <TextareaField label="Recommendation" required rows={2} value={form.recommendation} onChange={(e) => setForm({ ...form, recommendation: e.target.value })} />
            <Button type="submit" disabled={!valid || add.isPending}>
              {add.isPending && <Loader2 className="animate-spin" />} Add to handover
            </Button>
          </form>
        </Panel>
      )}
    </div>
  );
}

export default function NursingStationPage() {
  const { role } = useCurrentUser();
  const lp = useListParams({ ignore: ["ward", "patient"] });
  const tab = useUrlTab(TABS);
  const wardId = lp.get("ward") ?? (role === "Nurse" ? ROLE_PERSONA.Nurse.wardId! : "WRD-HDU");
  const focus = lp.get("patient");
  const wards = useQuery({ queryKey: ["occupancy"], queryFn: () => ipdService.getOccupancy(), staleTime: STALE.live });
  const q = useQuery({ queryKey: ["ward-patients", wardId], queryFn: () => nursingService.getWardPatients(wardId), staleTime: STALE.live, refetchInterval: 60_000 });
  const [vitalsFor, setVitalsFor] = useState<NursingPatient>();
  const [riskFor, setRiskFor] = useState<NursingPatient>();
  const ward = wards.data?.find((w) => w.ward.id === wardId);
  const escalate = (q.data ?? []).filter((p) => (p.news2 ?? 0) >= 5);

  return (
    <>
      <PageHeader
        title="Nursing station"
        description={ward ? `${ward.ward.name} · ${ward.ward.floor}, ${ward.ward.wing} · ${ward.occupied} patients${ward.nurseInCharge ? ` · NIC ${ward.nurseInCharge}` : ""}` : undefined}
        actions={
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only">Ward</span>
            <select value={wardId} onChange={(e) => lp.set({ ward: e.target.value, patient: undefined }, false)} className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring">
              {(wards.data ?? [])
                .filter((w) => w.ward.type !== "ER" && w.occupied > 0)
                .map((w) => (
                  <option key={w.ward.id} value={w.ward.id}>
                    {w.ward.name} ({w.occupied})
                  </option>
                ))}
            </select>
          </label>
        }
      />
      {escalate.length > 0 && (
        <div role="alert" className="mb-4 flex flex-col gap-2 rounded-xl border border-critical/40 bg-critical-soft/50 px-4 py-3 sm:flex-row sm:items-center">
          <Siren className="size-5 shrink-0 text-critical-fg" strokeWidth={ICON_STROKE} aria-hidden />
          <p className="flex-1 text-sm">
            <span className="font-medium text-critical-fg">
              {escalate.length} patient{escalate.length > 1 ? "s" : ""} need{escalate.length === 1 ? "s" : ""} escalation:
            </span>{" "}
            {escalate.map((p) => `${p.admission.bed.code} ${p.admission.patient.fullName} (NEWS2 ${p.news2})`).join(", ")}. Inform the doctor and increase monitoring frequency.
          </p>
        </div>
      )}
      <UrlTabs tabs={TABS.map((t) => (t.id === "patients" ? { ...t, count: q.data?.length } : t))} label="Nursing station sections" className="mb-4" />
      <TabPanel id={tab}>
        {tab === "patients" &&
          (q.isLoading ? (
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <PanelSkeleton key={i} lines={5} className="rounded-xl border" />
              ))}
            </div>
          ) : !q.data?.length ? (
            <EmptyState icon={AlertTriangle} title="No patients in this ward" />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {q.data.map((p) => (
                <PatientCard key={p.admission.id} p={p} highlight={focus === p.admission.patientId} onVitals={() => setVitalsFor(p)} onRisk={() => setRiskFor(p)} />
              ))}
            </div>
          ))}
        {tab === "mar" && (
          <Panel title="Medication administration record" description={`Today, ${ward?.ward.name ?? ""}. High-alert medicines need a double-check.`}>
            <MarChart wardId={wardId} />
          </Panel>
        )}
        {tab === "handover" && <Handover wardId={wardId} />}
      </TabPanel>
      <p className="mt-3 text-xs text-muted-foreground">* SpO₂ on supplemental oxygen. Last refreshed {time(new Date())}.</p>
      {vitalsFor && <VitalsDialog patient={vitalsFor.admission.patient} onClose={() => setVitalsFor(undefined)} />}
      {riskFor && <RiskSheet p={riskFor} onClose={() => setRiskFor(undefined)} />}
    </>
  );
}
