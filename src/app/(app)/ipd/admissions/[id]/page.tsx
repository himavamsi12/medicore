"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRightLeft, FileText, HeartPulse, Loader2, Plus, Printer, Sparkles, Trash2 } from "lucide-react";
import type { AdmissionView, DischargeSummary } from "@/types";
import { aiService } from "@/services/aiService";
import { ipdService } from "@/services/ipdService";
import { patientService } from "@/services/patientService";
import { AiPanel, Analyzing, ReviewBar, RiskScoreCard, type ReviewDecision } from "@/components/ai/ai";
import { ChartCard, TrendChart } from "@/components/charts/charts";
import { EmptyState, ErrorState, PanelSkeleton } from "@/components/feedback/states";
import { StatusBadge } from "@/components/feedback/status-badge";
import { SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { Field, PageHeader, Panel } from "@/components/layout/page";
import { TabPanel, UrlTabs, useUrlTab, type TabDef } from "@/components/layout/url-tabs";
import { Button } from "@/components/ui/button";
import { MarChart } from "@/features/nursing/mar";
import { VitalsDialog } from "@/features/nursing/vitals-dialog";
import { LabsTab, PatientBanner, VitalsTab } from "@/features/patients/profile";
import { useCurrentUser } from "@/hooks/use-current-user";
import { news2 } from "@/lib/clinical";
import { can } from "@/lib/rbac";
import { STALE } from "@/lib/constants";
import { date, dateTime, inr, time } from "@/lib/format";

const TABS: TabDef[] = [
  { id: "overview", label: "Overview" },
  { id: "vitals", label: "Vitals" },
  { id: "labs", label: "Labs" },
  { id: "mar", label: "Medication chart" },
  { id: "transfer", label: "Transfers" },
  { id: "discharge", label: "Discharge" },
];

function Overview({ a }: { a: AdmissionView }) {
  const qc = useQueryClient();
  const { role, user } = useCurrentUser();
  const [note, setNote] = useState("");
  const risks = useQuery({ queryKey: ["risk", a.patientId], queryFn: () => aiService.getRiskScores(a.patientId), staleTime: STALE.live });
  const vitals = useQuery({ queryKey: ["vitals", a.patientId], queryFn: () => patientService.getVitals(a.patientId, 36) });
  const add = useMutation({
    mutationFn: () => ipdService.addProgressNote(a.id, note.trim(), { id: user?.id ?? "", name: user?.name ?? "", kind: role === "Nurse" ? "Nursing" : "Doctor" }),
    onSuccess: () => {
      setNote("");
      qc.invalidateQueries({ queryKey: ["admission", a.id] });
      toast.success("Note added");
    },
  });
  const trend = (vitals.data ?? []).map((v) => ({ at: v.recordedAt, news: news2(v) }));
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-4">
        <Panel title="Admission">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 md:grid-cols-4">
            <Field label="IP number">{a.ipNo}</Field>
            <Field label="Admitted">{dateTime(a.admittedAt)}</Field>
            <Field label="Type">{a.admissionType}</Field>
            <Field label="Expected discharge">{date(a.expectedDischarge)}</Field>
            <Field label="Consultant">{a.doctor.name}</Field>
            <Field label="Department">{a.doctor.departmentName}</Field>
            <Field label="Diet">{a.dietOrder}</Field>
            <Field label="Code status">{a.codeStatus}</Field>
            <Field label="Bed">{`${a.bed.code}, ${a.ward.name}`}</Field>
            <Field label="Room tariff">{`${inr(a.ward.dailyRate)}/day`}</Field>
            {a.isolation && <Field label="Isolation">{a.isolation} precautions</Field>}
            <Field label="Length of stay">{`${a.lengthOfStayDays} days`}</Field>
            <Field label="Reason" className="col-span-2 md:col-span-4">{a.reason}</Field>
            <Field label="Provisional diagnosis" className="col-span-2 md:col-span-4">
              {a.provisionalDiagnosis.map((d) => `${d.name} (${d.code})`).join("; ") || "Not recorded"}
            </Field>
          </dl>
        </Panel>
        <ChartCard title="Early warning score trend" description="NEWS2, last 36 readings" loading={vitals.isLoading} height={180} table={{ columns: ["Time", "NEWS2"], rows: trend.map((t) => [dateTime(t.at), t.news]) }}>
          <TrendChart data={trend} x="at" xFormat={time} labelFormat={dateTime} height={180} series={[{ key: "news", label: "NEWS2", type: "area" }]} reference={{ y: 5, label: "Urgent review 5" }} yDomain={[0, "auto"]} />
        </ChartCard>
        <Panel title="Progress notes" description={`${a.notes.length} entries`}>
          <ol className="divide-y">
            {[...a.notes].reverse().map((n) => (
              <li key={n.id} className="px-4 py-3">
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <StatusBadge tone={n.kind === "Doctor" ? "info" : "neutral"}>{n.kind}</StatusBadge>
                  <span className="font-medium text-foreground">{n.authorName}</span>
                  {dateTime(n.at)}
                </p>
                <p className="mt-1 text-sm leading-relaxed">{n.text}</p>
              </li>
            ))}
          </ol>
          {!a.dischargedAt && (can(role, "consult.write") || can(role, "vitals.record")) && (
            <form
              className="flex flex-col gap-2 border-t p-4 sm:flex-row sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                if (note.trim().length > 2) add.mutate();
              }}
            >
              <TextareaField label="Add a progress note" wrapperClassName="flex-1" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              <Button type="submit" disabled={add.isPending || note.trim().length < 3}>
                <Plus /> Add note
              </Button>
            </form>
          )}
        </Panel>
      </div>
      <div className="min-w-0 space-y-4">
        <AiPanel title="Clinical risk scores" meta={risks.data?.[0]?.meta} onRegenerate={() => risks.refetch()} busy={risks.isFetching}>
          {risks.isLoading ? (
            <Analyzing steps={["Latest vitals", "Inflammatory markers and lactate", "Admission history", "Scoring"]} />
          ) : (
            <div className="space-y-2 p-3">
              {(risks.data ?? []).map((r) => (
                <RiskScoreCard key={r.kind} score={r} compact={r.level === "Low"} />
              ))}
            </div>
          )}
        </AiPanel>
        {a.transfers.length > 0 && (
          <Panel title="Recent transfers">
            <ul className="divide-y">
              {a.transfers.map((t) => (
                <li key={t.id} className="px-4 py-2 text-[13px]">
                  <span className="num font-medium">
                    {t.fromBedId.replace("BED-", "")} to {t.toBedId.replace("BED-", "")}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {dateTime(t.at)} · {t.reason}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </div>
  );
}

function TransferTab({ a }: { a: AdmissionView }) {
  const qc = useQueryClient();
  const { role } = useCurrentUser();
  const [wardId, setWardId] = useState("");
  const [bedId, setBedId] = useState("");
  const [reason, setReason] = useState("");
  const wards = useQuery({ queryKey: ["occupancy"], queryFn: () => ipdService.getOccupancy() });
  const beds = useQuery({ queryKey: ["beds", "free", wardId], queryFn: () => ipdService.getBeds({ wardId, status: ["Available", "Reserved"] }), enabled: Boolean(wardId) });
  const transfer = useMutation({
    mutationFn: () => ipdService.transfer({ admissionId: a.id, toBedId: bedId, reason }),
    onSuccess: (r) => {
      ["admission", "beds", "occupancy", "admissions"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success(`Transferred to ${r.bed.code}`, { description: `${r.ward.name}. ${r.transfers.at(-1)?.fromBedId.replace("BED-", "")} marked for cleaning.` });
      setBedId("");
      setReason("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Transfer failed"),
  });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {!a.dischargedAt && can(role, "bed.transfer") ? (
        <Panel title="Transfer patient" description={`Currently in ${a.bed.code}, ${a.ward.name}`}>
          <form
            className="grid gap-4 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (bedId && reason.trim()) transfer.mutate();
            }}
          >
            <SelectField
              label="To ward"
              placeholder="Select ward"
              value={wardId}
              onChange={(e) => {
                setWardId(e.target.value);
                setBedId("");
              }}
              options={(wards.data ?? []).filter((w) => w.ward.type !== "ER" && w.available + w.reserved > 0).map((w) => ({ value: w.ward.id, label: `${w.ward.name} (${w.available} free)` }))}
            />
            {wardId && (
              <div className="grid gap-1.5">
                <span className="text-[13px] font-medium" id="bed-pick">
                  Bed
                </span>
                {beds.isLoading ? (
                  <PanelSkeleton lines={2} className="px-0" />
                ) : (
                  <div role="radiogroup" aria-labelledby="bed-pick" className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                    {(beds.data ?? []).map((b) => (
                      <button key={b.id} type="button" role="radio" aria-checked={bedId === b.id} onClick={() => setBedId(b.id)} className={`num h-9 rounded-lg border text-xs focus-visible:outline-2 ${bedId === b.id ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary"}`}>
                        {b.code}
                        {b.status === "Reserved" && " (R)"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <TextField label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Step-down from HDU, haemodynamically stable" />
            <Button type="submit" disabled={!bedId || !reason.trim() || transfer.isPending}>
              {transfer.isPending ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />} Transfer
            </Button>
          </form>
        </Panel>
      ) : (
        <Panel title="Transfer patient">
          <p className="p-4 text-sm text-muted-foreground">{a.dischargedAt ? "Patient has been discharged." : "Your role cannot transfer patients."}</p>
        </Panel>
      )}
      <Panel title="Transfer history">
        {a.transfers.length === 0 ? (
          <EmptyState compact title="No transfers during this admission" />
        ) : (
          <ol className="divide-y">
            {a.transfers.map((t) => (
              <li key={t.id} className="px-4 py-3">
                <p className="num text-sm font-medium">
                  {t.fromBedId.replace("BED-", "")} to {t.toBedId.replace("BED-", "")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {dateTime(t.at)} · {t.by}
                </p>
                <p className="text-[13px]">{t.reason}</p>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}

type Draft = Omit<DischargeSummary, "preparedAt" | "preparedBy" | "status">;

function DischargeTab({ a }: { a: AdmissionView }) {
  const qc = useQueryClient();
  const { role, user } = useCurrentUser();
  const existing = a.dischargeSummary;
  const [draft, setDraft] = useState<Draft | undefined>(existing ? { finalDiagnoses: existing.finalDiagnoses, hospitalCourse: existing.hospitalCourse, proceduresDone: existing.proceduresDone, conditionAtDischarge: existing.conditionAtDischarge, dischargeMedications: existing.dischargeMedications, followUp: existing.followUp, instructions: existing.instructions } : undefined);
  const [decision, setDecision] = useState<ReviewDecision>();
  const ai = useMutation({
    mutationFn: () => aiService.draftDischargeSummary(a.id),
    onSuccess: (r) => {
      setDraft(r.draft);
      setDecision(undefined);
    },
  });
  const save = useMutation({
    mutationFn: (finalise: boolean) => ipdService.saveDischargeSummary(a.id, { ...draft!, preparedBy: user?.name ?? "Doctor", status: finalise ? "Final" : "Draft" }, finalise),
    onSuccess: (r) => {
      ["admission", "admissions", "beds", "occupancy", "patient", "kpis"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success(r.status === "Discharged" ? `${r.patient.fullName} discharged` : "Discharge summary saved", { description: r.status === "Discharged" ? `${r.bed.code} released for cleaning` : undefined });
    },
  });
  const canWrite = can(role, "discharge.write") && !a.dischargedAt;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  if (!draft)
    return (
      <Panel title="Discharge summary">
        <div className="flex flex-col items-start gap-3 p-4">
          <p className="text-sm text-muted-foreground">{a.dischargedAt ? "No discharge summary was recorded." : "Start from a blank summary or let AI draft one from the admission record for you to edit."}</p>
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => ai.mutate()} disabled={ai.isPending}>
                {ai.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />} Draft with AI
              </Button>
              <Button variant="outline" onClick={() => setDraft({ finalDiagnoses: a.provisionalDiagnosis, hospitalCourse: "", proceduresDone: [], conditionAtDischarge: "Improved", dischargeMedications: [], followUp: "", instructions: [] })}>
                Start blank
              </Button>
            </div>
          )}
          {ai.isPending && <Analyzing label="Drafting from the record" steps={["Admission and progress notes", "Procedures and imaging", "Key laboratory results", "Discharge medications"]} />}
        </div>
      </Panel>
    );

  return (
    <div className="space-y-4">
      {ai.data && !existing && (
        <AiPanel title="AI-drafted discharge summary" meta={ai.data.meta} footer={<ReviewBar decision={decision} acceptLabel="Use draft" onAccept={() => setDecision("accepted")} onDismiss={() => { setDecision("dismissed"); setDraft(undefined); }} />}>
          <p className="px-4 py-3 text-sm text-muted-foreground">The fields below were pre-filled from the chart. Review every section before finalising.</p>
        </AiPanel>
      )}
      <Panel
        title="Discharge summary"
        description={existing ? `${existing.status} · prepared by ${existing.preparedBy}, ${dateTime(existing.preparedAt)}` : "Unsaved draft"}
        actions={
          existing && (
            <Button variant="outline" size="sm" render={<Link href={`/print/discharge/${a.id}`} target="_blank" />} nativeButton={false}>
              <Printer /> Print
            </Button>
          )
        }
      >
        <fieldset disabled={!canWrite} className="grid gap-4 p-4">
          <div className="grid gap-1.5">
            <span className="text-[13px] font-medium">Final diagnoses</span>
            <ul className="flex flex-wrap gap-1.5">
              {draft.finalDiagnoses.map((d) => (
                <li key={d.code}>
                  <StatusBadge tone="info">
                    <span className="num">{d.code}</span> {d.name}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          </div>
          <TextareaField label="Hospital course" rows={7} value={draft.hospitalCourse} onChange={(e) => set("hospitalCourse", e.target.value)} />
          <div className="grid gap-4 md:grid-cols-2">
            <TextareaField label="Procedures done (one per line)" rows={3} value={draft.proceduresDone.join("\n")} onChange={(e) => set("proceduresDone", e.target.value.split("\n").filter(Boolean))} />
            <SelectField label="Condition at discharge" value={draft.conditionAtDischarge} onChange={(e) => set("conditionAtDischarge", e.target.value as Draft["conditionAtDischarge"])} options={["Improved", "Stable", "Unchanged", "Referred"]} />
          </div>
          <div className="grid gap-2">
            <span className="text-[13px] font-medium">Discharge medications</span>
            {draft.dischargeMedications.map((m, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                {(["drug", "dose", "frequency", "duration"] as const).map((k) => (
                  <input key={k} aria-label={`${k} ${i + 1}`} value={m[k]} onChange={(e) => set("dischargeMedications", draft.dischargeMedications.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} className="h-8 rounded-md border border-input bg-card px-2 text-sm outline-none focus-visible:border-ring" placeholder={k} />
                ))}
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove medicine" onClick={() => set("dischargeMedications", draft.dischargeMedications.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => set("dischargeMedications", [...draft.dischargeMedications, { drug: "", dose: "", frequency: "1-0-1", duration: "7 days" }])}>
              <Plus /> Add medicine
            </Button>
          </div>
          <TextField label="Follow-up" value={draft.followUp} onChange={(e) => set("followUp", e.target.value)} />
          <TextareaField label="Instructions to patient (one per line)" rows={4} value={draft.instructions.join("\n")} onChange={(e) => set("instructions", e.target.value.split("\n").filter(Boolean))} />
        </fieldset>
        {canWrite && (
          <div className="flex flex-col-reverse gap-2 border-t p-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => save.mutate(false)} disabled={save.isPending}>
              Save draft
            </Button>
            <Button onClick={() => save.mutate(true)} disabled={save.isPending || !draft.hospitalCourse.trim() || (Boolean(ai.data) && !existing && decision !== "accepted")}>
              {save.isPending && <Loader2 className="animate-spin" />} Finalise and discharge
            </Button>
          </div>
        )}
      </Panel>
    </div>
  );
}

export default function AdmissionPage() {
  const { id } = useParams<{ id: string }>();
  const { role } = useCurrentUser();
  const tab = useUrlTab(TABS);
  const [vitalsOpen, setVitalsOpen] = useState(false);
  const q = useQuery({ queryKey: ["admission", id], queryFn: () => ipdService.getAdmission(id) });
  const patient = useQuery({ queryKey: ["patient", q.data?.patientId], queryFn: () => patientService.getById(q.data!.patientId), enabled: Boolean(q.data) });
  if (q.isLoading) return <PanelSkeleton lines={12} className="rounded-xl border" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const a = q.data!;
  return (
    <div className="space-y-4">
      <PageHeader
        title={`${a.ipNo}`}
        breadcrumbs={[{ label: "Admissions", href: "/ipd/admissions" }, { label: a.patient.fullName }]}
        meta={
          <>
            <StatusBadge status={a.status} />
            <StatusBadge status={a.acuity} />
            <span>
              {a.bed.code}, {a.ward.name}
            </span>
            <span>Day {a.lengthOfStayDays + 1}</span>
            {a.news2 !== undefined && <StatusBadge tone={a.news2 >= 7 ? "critical" : a.news2 >= 5 ? "warning" : "neutral"}>NEWS2 {a.news2}</StatusBadge>}
          </>
        }
        actions={
          <>
            {!a.dischargedAt && can(role, "vitals.record") && (
              <Button variant="outline" onClick={() => setVitalsOpen(true)}>
                <HeartPulse /> Record vitals
              </Button>
            )}
            <Button variant="ghost" render={<Link href={`/patients/${a.patientId}`} />} nativeButton={false}>
              <FileText /> Full record
            </Button>
          </>
        }
      />
      {patient.data && <PatientBanner p={patient.data} />}
      <UrlTabs tabs={TABS} label="Admission sections" />
      <TabPanel id={tab}>
        {tab === "overview" && <Overview a={a} />}
        {tab === "vitals" && <VitalsTab patientId={a.patientId} />}
        {tab === "labs" && <LabsTab patientId={a.patientId} />}
        {tab === "mar" && (
          <Panel title="Medication administration record" description="Today">
            <MarChart admissionId={a.id} />
          </Panel>
        )}
        {tab === "transfer" && <TransferTab a={a} />}
        {tab === "discharge" && <DischargeTab a={a} />}
      </TabPanel>
      {vitalsOpen && <VitalsDialog patient={a.patient} onClose={() => setVitalsOpen(false)} />}
    </div>
  );
}
