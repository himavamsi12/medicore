"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { toast } from "sonner";
import { CheckCircle2, FileText, Loader2, Printer, Save, X } from "lucide-react";
import type { Diagnosis, Priority, SoapNote } from "@/types";
import { aiService } from "@/services/aiService";
import { appointmentService } from "@/services/appointmentService";
import { labService } from "@/services/labService";
import { patientService } from "@/services/patientService";
import { pharmacyService } from "@/services/pharmacyService";
import { referenceService, type Icd10Code } from "@/services/referenceService";
import { AsyncCombobox } from "@/components/forms/async-combobox";
import { TextareaField } from "@/components/forms/fields";
import { EmptyState, ErrorState, PanelSkeleton } from "@/components/feedback/states";
import { StatusBadge } from "@/components/feedback/status-badge";
import { PageHeader, Panel } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { MedicationsPanel, PatientBanner, VitalsGrid } from "@/features/patients/profile";
import { RxWriter, blockingAlerts, quantityFor, type RxDraftItem } from "@/features/opd/rx-writer";
import { AiScribe } from "@/features/opd/scribe";
import { useCurrentUser } from "@/hooks/use-current-user";
import { can } from "@/lib/rbac";
import { date, dateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const QUICK_LABS = ["CBC", "RFT", "LFT", "LIPID", "HBA1C", "FBS", "TFT", "URINE", "CRP", "DENGUE", "MPAG", "WIDAL", "VITD", "COAG"];
const FOLLOW_UP = [
  { label: "None", days: 0 },
  { label: "3 days", days: 3 },
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
  { label: "3 months", days: 90 },
];

export default function ConsultationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { role } = useCurrentUser();

  const appt = useQuery({ queryKey: ["appointment", id], queryFn: () => appointmentService.getById(id) });
  const patientId = appt.data?.patientId;
  const patient = useQuery({ queryKey: ["patient", patientId], queryFn: () => patientService.getById(patientId!), enabled: Boolean(patientId) });
  const history = useQuery({ queryKey: ["appointments", "patient", patientId], queryFn: () => appointmentService.getByPatient(patientId!), enabled: Boolean(patientId) });
  const tests = useQuery({ queryKey: ["lab-tests"], queryFn: () => labService.getTests(), staleTime: Infinity });

  const [soap, setSoap] = useState<SoapNote>({ subjective: "", objective: "", assessment: "", plan: "" });
  const [complaint, setComplaint] = useState("");
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [rx, setRx] = useState<RxDraftItem[]>([]);
  const [labs, setLabs] = useState<string[]>([]);
  const [labPriority, setLabPriority] = useState<Priority>("Routine");
  const [followUpDays, setFollowUpDays] = useState(14);
  const [advice, setAdvice] = useState("");
  const [ack, setAck] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [loadedFor, setLoadedFor] = useState<string>();
  const [done, setDone] = useState<{ rxId?: string }>();

  // Seed the form once from any saved draft on the appointment
  if (appt.data && loadedFor !== appt.data.id) {
    setLoadedFor(appt.data.id);
    const c = appt.data.consultation;
    setComplaint(c?.chiefComplaint ?? appt.data.reason);
    if (c) {
      setSoap(c.soap);
      setDiagnoses(c.diagnoses);
      setAdvice(c.advice ?? "");
    }
  }

  const drugIds = useMemo(() => rx.map((r) => r.drug.id), [rx]);
  const rxCheck = useQuery({ queryKey: ["rx-check", patientId, drugIds], queryFn: () => aiService.checkPrescription(patientId!, drugIds), enabled: Boolean(patientId) && drugIds.length > 0 });
  const blocking = drugIds.length ? blockingAlerts(rxCheck.data?.alerts) : [];

  // Mark the visit as in consultation when the doctor opens it
  const startVisit = useMutation({
    mutationFn: () => appointmentService.updateStatus(id, "In consultation"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["queue"] });
      qc.invalidateQueries({ queryKey: ["appointment", id] });
    },
  });
  useEffect(() => {
    if (appt.data?.status === "Checked in" && can(role, "consult.write")) startVisit.mutate();
    // run once per appointment load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appt.data?.id]);

  const save = useMutation({
    mutationFn: async (complete: boolean) => {
      const a = appt.data!;
      let rxId: string | undefined;
      let labIds: string[] = a.consultation?.labOrderIds ?? [];
      if (complete && rx.length) {
        const created = await pharmacyService.createPrescription({
          patientId: a.patientId,
          doctorId: a.doctorId,
          source: "OPD",
          encounterId: a.id,
          diagnosis: diagnoses.map((d) => d.name).join(", ") || complaint,
          notes: ack && overrideReason ? `Safety alert override: ${overrideReason}` : undefined,
          items: rx.map((r) => ({ drugId: r.drug.id, dose: r.dose, frequency: r.frequency, route: r.route, durationDays: r.durationDays, instructions: r.instructions, qty: quantityFor(r) })),
        });
        rxId = created.id;
      }
      if (complete && labs.length) {
        const order = await labService.createOrder({ patientId: a.patientId, orderedById: a.doctorId, source: "OPD", encounterId: a.id, priority: labPriority, testCodes: labs });
        labIds = [...labIds, order.id];
      }
      await appointmentService.saveConsultation(
        a.id,
        {
          chiefComplaint: complaint,
          soap,
          diagnoses: diagnoses.map((d) => ({ ...d, type: complete ? "Final" : d.type })),
          prescriptionId: rxId ?? a.consultation?.prescriptionId,
          labOrderIds: labIds,
          radiologyOrderIds: a.consultation?.radiologyOrderIds ?? [],
          followUpOn: followUpDays ? format(addDays(new Date(), followUpDays), "yyyy-MM-dd") : undefined,
          advice,
        },
        complete,
      );
      return { complete, rxId };
    },
    onSuccess: ({ complete, rxId }) => {
      qc.invalidateQueries({ queryKey: ["queue"] });
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["appointment", id] });
      qc.invalidateQueries({ queryKey: ["patient", patientId] });
      if (complete) {
        setDone({ rxId });
        toast.success("Consultation completed", { description: [rxId && "Prescription sent to pharmacy", labs.length && `${labs.length} lab test${labs.length > 1 ? "s" : ""} ordered`].filter(Boolean).join(" · ") || undefined });
      } else toast.success("Draft saved");
    },
    onError: (e) => toast.error("Could not save", { description: e instanceof Error ? e.message : undefined }),
  });

  if (appt.isLoading || (patientId && patient.isLoading)) return <PanelSkeleton lines={12} className="rounded-xl border" />;
  if (appt.error) return <ErrorState error={appt.error} onRetry={() => appt.refetch()} />;
  const a = appt.data!;
  const p = patient.data;
  const readOnly = !can(role, "consult.write") || a.status === "Completed" || a.status === "Cancelled";
  const problems: string[] = [];
  if (!diagnoses.length) problems.push("Add at least one diagnosis");
  if (blocking.length && !ack) problems.push("Review the drug safety alerts");
  if (blocking.length && ack && overrideReason.trim().length < 5) problems.push("Give a reason for overriding the safety alert");

  if (done) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <div className="rounded-xl border bg-card p-6 text-center">
          <CheckCircle2 className="mx-auto size-10 text-stable" aria-hidden />
          <h1 className="mt-3 text-lg font-semibold">Consultation completed</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {a.patient.fullName} · token {a.token ?? "-"} · {a.doctor.name}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {done.rxId && (
              <Button variant="outline" render={<Link href={`/print/prescription/${done.rxId}`} target="_blank" />} nativeButton={false}>
                <Printer /> Print prescription
              </Button>
            )}
            <Button variant="outline" render={<Link href={`/patients/${a.patientId}`} />} nativeButton={false}>
              Open record
            </Button>
            <Button onClick={() => router.push("/opd/queue")}>Next patient</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Consultation"
        breadcrumbs={[{ label: "OPD queue", href: "/opd/queue" }, { label: a.patient.fullName }]}
        meta={
          <>
            <StatusBadge status={a.status} />
            <span>Token {a.token ?? "-"}</span>
            <span>
              {date(a.date, "d MMM")} {a.time}
            </span>
            <span>{a.doctor.name}</span>
            <span>{a.type}</span>
          </>
        }
      />
      {p && <PatientBanner p={p} />}

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          <Panel title="Vitals" description={a.vitals ? "Recorded at check-in" : undefined}>
            <VitalsGrid v={a.vitals ?? p?.latestVitals} />
          </Panel>

          {!readOnly && (
            <AiScribe
              appointmentId={a.id}
              onApply={(s, dx) => {
                setSoap(s);
                if (dx.length) setDiagnoses((cur) => [...cur, ...dx.filter((d) => !cur.some((c) => c.code === d.code))]);
                toast.success("Scribe note applied", { description: "Review and edit before completing." });
              }}
            />
          )}

          <Panel title="Clinical note">
            <div className="grid gap-4 p-4">
              <TextareaField label="Chief complaint" rows={1} className="min-h-9" value={complaint} readOnly={readOnly} onChange={(e) => setComplaint(e.target.value)} />
              <div className="grid gap-4 md:grid-cols-2">
                {(["subjective", "objective", "assessment", "plan"] as const).map((k) => (
                  <TextareaField key={k} label={k[0].toUpperCase() + k.slice(1)} rows={4} readOnly={readOnly} value={soap[k]} onChange={(e) => setSoap((s) => ({ ...s, [k]: e.target.value }))} />
                ))}
              </div>
            </div>
          </Panel>

          <Panel title="Diagnosis" description="ICD-10">
            <div className="space-y-3 p-4">
              {!readOnly && (
                <AsyncCombobox<Icd10Code>
                  label="Search ICD-10"
                  hideLabel
                  placeholder="Search code or term, e.g. E11, dengue, hypertension"
                  queryKey="icd10"
                  search={(q) => referenceService.searchIcd10(q)}
                  getKey={(c) => c.code}
                  onSelect={(c) => setDiagnoses((cur) => (cur.some((d) => d.code === c.code) ? cur : [...cur, { code: c.code, name: c.name, type: "Provisional" }]))}
                  renderItem={(c) => (
                    <span className="flex items-center gap-3">
                      <span className="num w-20 shrink-0 text-xs text-muted-foreground">{c.code}</span>
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      <span className="text-[11px] text-subtle-foreground">{c.chapter}</span>
                    </span>
                  )}
                />
              )}
              {diagnoses.length === 0 ? (
                <p className="text-sm text-muted-foreground">No diagnosis added.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {diagnoses.map((d) => (
                    <li key={d.code} className="flex items-center gap-3 px-3 py-2">
                      <span className="num w-20 shrink-0 text-xs text-muted-foreground">{d.code}</span>
                      <span className="min-w-0 flex-1 text-sm">{d.name}</span>
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => setDiagnoses((cur) => cur.map((x) => (x.code === d.code ? { ...x, type: x.type === "Final" ? "Provisional" : "Final" } : x)))}
                        className="rounded-full focus-visible:outline-2"
                        aria-label={`${d.type} diagnosis. Toggle`}
                      >
                        <StatusBadge tone={d.type === "Final" ? "stable" : "neutral"}>{d.type}</StatusBadge>
                      </button>
                      {!readOnly && (
                        <Button variant="ghost" size="icon-sm" aria-label={`Remove ${d.name}`} onClick={() => setDiagnoses((cur) => cur.filter((x) => x.code !== d.code))}>
                          <X />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>

          {!readOnly && can(role, "prescription.write") && (
            <Panel title="Prescription">
              <div className="p-4">
                {p && <RxWriter items={rx} onChange={setRx} patientId={p.id} acknowledged={ack} onAcknowledge={setAck} overrideReason={overrideReason} onOverrideReason={setOverrideReason} />}
              </div>
            </Panel>
          )}

          {!readOnly && (
            <Panel title="Investigations">
              <div className="space-y-3 p-4">
                <div role="group" aria-label="Lab tests" className="flex flex-wrap gap-1.5">
                  {QUICK_LABS.map((code) => {
                    const t = tests.data?.find((x) => x.code === code);
                    const on = labs.includes(code);
                    return (
                      <button
                        key={code}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setLabs((cur) => (on ? cur.filter((x) => x !== code) : [...cur, code]))}
                        className={cn("h-8 rounded-lg border px-2.5 text-xs hover:border-border-strong focus-visible:outline-2", on && "border-primary bg-info-soft font-medium text-info-fg")}
                        title={t ? `${t.name} · ₹${t.price} · TAT ${t.tatHours} h` : code}
                      >
                        {t?.name.replace(/ \(.*\)/, "") ?? code}
                      </button>
                    );
                  })}
                </div>
                {labs.length > 0 && (
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="text-muted-foreground">
                      {labs.length} test{labs.length > 1 ? "s" : ""} · ₹{labs.reduce((s, c) => s + (tests.data?.find((t) => t.code === c)?.price ?? 0), 0).toLocaleString("en-IN")}
                    </span>
                    <label className="flex items-center gap-2 text-xs">
                      Priority
                      <select value={labPriority} onChange={(e) => setLabPriority(e.target.value as Priority)} className="h-7 rounded-md border border-input bg-card px-1.5 text-xs outline-none focus-visible:border-ring">
                        <option>Routine</option>
                        <option>Urgent</option>
                        <option>STAT</option>
                      </select>
                    </label>
                  </div>
                )}
              </div>
            </Panel>
          )}

          <Panel title="Advice and follow-up">
            <div className="grid gap-4 p-4 md:grid-cols-[1fr_220px]">
              <TextareaField label="Advice to patient" rows={3} readOnly={readOnly} value={advice} onChange={(e) => setAdvice(e.target.value)} placeholder="Diet, activity, warning signs to watch for" />
              <div className="grid content-start gap-1.5">
                <span className="text-[13px] font-medium" id="fu-label">
                  Review after
                </span>
                <div role="radiogroup" aria-labelledby="fu-label" className="grid grid-cols-3 gap-1.5">
                  {FOLLOW_UP.map((f) => (
                    <button key={f.label} type="button" role="radio" aria-checked={followUpDays === f.days} disabled={readOnly} onClick={() => setFollowUpDays(f.days)} className={cn("h-8 rounded-lg border text-xs focus-visible:outline-2", followUpDays === f.days && "border-primary bg-info-soft font-medium text-info-fg")}>
                      {f.label}
                    </button>
                  ))}
                </div>
                {followUpDays > 0 && <p className="text-xs text-muted-foreground">On {format(addDays(new Date(), followUpDays), "EEE d MMM yyyy")}</p>}
              </div>
            </div>
          </Panel>
        </div>

        <aside className="min-w-0 space-y-4" aria-label="Patient context">
          {p && <MedicationsPanel patientId={p.id} />}
          <Panel title="Previous visits">
            {history.isLoading ? (
              <PanelSkeleton lines={4} />
            ) : (
              (() => {
                const past = (history.data ?? []).filter((h) => h.id !== a.id && h.status === "Completed").slice(0, 5);
                return past.length ? (
                  <ul className="divide-y">
                    {past.map((h) => (
                      <li key={h.id} className="px-4 py-2.5">
                        <p className="text-[13px] font-medium">{date(h.date, "d MMM yyyy")} · {h.doctor.name}</p>
                        <p className="line-clamp-2 text-xs text-muted-foreground">{h.consultation?.diagnoses.map((d) => d.name).join(", ") || h.reason}</p>
                        {h.consultation?.soap.plan && <p className="mt-0.5 line-clamp-2 text-xs">{h.consultation.soap.plan}</p>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState compact icon={FileText} title="First visit" />
                );
              })()
            )}
          </Panel>
          {p && (
            <Button variant="outline" className="w-full" render={<Link href={`/patients/${p.id}`} target="_blank" />} nativeButton={false}>
              Open full record
            </Button>
          )}
          {a.consultation?.completedAt && <p className="text-xs text-muted-foreground">Completed {dateTime(a.consultation.completedAt)}</p>}
        </aside>
      </div>

      {!readOnly && (
        <div className="sticky bottom-0 z-[var(--z-sticky)] -mx-4 border-t bg-background/90 backdrop-blur-md md:-mx-6">
          <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center md:px-6">
            <p className="flex-1 text-xs text-muted-foreground" aria-live="polite">
              {problems.length ? problems.join(" · ") : `${rx.length} medicine${rx.length === 1 ? "" : "s"} · ${labs.length} test${labs.length === 1 ? "" : "s"} · ${diagnoses.length} diagnosis${diagnoses.length === 1 ? "" : "es"}`}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => save.mutate(false)} disabled={save.isPending}>
                <Save /> Save draft
              </Button>
              <Button onClick={() => save.mutate(true)} disabled={save.isPending || problems.length > 0}>
                {save.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Complete consultation
              </Button>
            </div>
          </div>
        </div>
      )}
      {readOnly && <p className="text-xs text-muted-foreground">This consultation is read-only for your role or its status.</p>}
    </div>
  );
}
