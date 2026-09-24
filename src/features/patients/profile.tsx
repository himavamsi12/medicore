"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  BedDouble,
  CalendarPlus,
  FileText,
  FlaskConical,
  HeartPulse,
  Pill,
  Receipt,
  ScanLine,
  Scissors,
  Siren,
  Sparkles,
  Stethoscope,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { PatientDetail, TimelineEventKind, Vitals } from "@/types";
import { aiService } from "@/services/aiService";
import { appointmentService } from "@/services/appointmentService";
import { billingService } from "@/services/billingService";
import { ipdService } from "@/services/ipdService";
import { labService } from "@/services/labService";
import { patientService } from "@/services/patientService";
import { AiPanel, Analyzing, MarkdownLite, ReviewBar, RiskScoreCard, useAiStream, type ReviewDecision } from "@/components/ai/ai";
import { ChartCard, TrendChart } from "@/components/charts/charts";
import { EmptyState, ErrorState, PanelSkeleton } from "@/components/feedback/states";
import { StatusBadge, statusTone, toneText } from "@/components/feedback/status-badge";
import { Field, Panel } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { LabInterpreter, LabResultsTable } from "@/features/lab/lab-results";
import { fToC, news2 } from "@/lib/clinical";
import { ICON_STROKE, STALE } from "@/lib/constants";
import { date, dateTime, inr, maskAbha, relativeDay, time } from "@/lib/format";
import { cn } from "@/lib/utils";

/* ---------------- Banner ---------------- */

export function PatientBanner({ p, actions }: { p: PatientDetail; actions?: React.ReactNode }) {
  const location = p.activeAdmission ? `${p.activeAdmission.ward.name}, ${p.activeAdmission.bed.code}` : p.activeErCase ? "Emergency department" : undefined;
  return (
    <section aria-label="Patient identification" className="rounded-xl border bg-card">
      <div className="flex flex-col gap-4 p-4 md:flex-row md:items-start md:justify-between md:p-5">
        <div className="flex min-w-0 gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
            <UserRound className="size-6" strokeWidth={ICON_STROKE} aria-hidden />
          </div>
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{p.fullName}</h1>
              <StatusBadge status={p.status} />
              {p.activeAdmission && <StatusBadge status={p.activeAdmission.acuity} />}
              {p.flags.map((f) => (
                <StatusBadge key={f} tone={f === "DNR" || f === "MLC" ? "critical" : "warning"}>
                  {f}
                </StatusBadge>
              ))}
            </div>
            <p className="num flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-muted-foreground">
              <span>{p.uhid}</span>
              <span>
                {p.ageLabel} · {p.gender}
              </span>
              <span>DOB {date(p.dob)}</span>
              <span>Blood {p.bloodGroup}</span>
              <span>ABHA {maskAbha(p.abhaNumber)}</span>
              <span>{p.phone}</span>
            </p>
            {location && (
              <p className="flex items-center gap-1.5 text-[13px]">
                {p.activeErCase ? <Siren className="size-3.5 text-critical-fg" /> : <BedDouble className="size-3.5 text-info-fg" />}
                <span className="font-medium">{location}</span>
                {p.activeAdmission && (
                  <span className="text-muted-foreground">
                    · {p.activeAdmission.ipNo} · under {p.activeAdmission.doctor.name} · day {p.activeAdmission.lengthOfStayDays + 1}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t px-4 py-2.5 text-[13px] md:px-5">
        <span className="flex items-center gap-2">
          <AlertTriangle className={cn("size-4", p.allergies.length ? "text-critical-fg" : "text-muted-foreground")} aria-hidden />
          <span className="text-muted-foreground">Allergies</span>
          {p.allergies.length ? (
            <span className="flex flex-wrap gap-1.5">
              {p.allergies.map((a) => (
                <StatusBadge key={a.substance} tone={a.severity === "Severe" ? "critical" : "warning"} className="normal-case">
                  {a.substance}
                </StatusBadge>
              ))}
            </span>
          ) : (
            <span>No known allergies</span>
          )}
        </span>
        <span className="text-muted-foreground">
          Payer <span className="text-foreground">{p.insurance ? `${p.insurance.payerName}${p.insurance.tpaName ? ` via ${p.insurance.tpaName}` : ""}` : p.paymentCategory}</span>
        </span>
        {p.primaryDoctor && (
          <span className="text-muted-foreground">
            Primary <span className="text-foreground">{p.primaryDoctor.name}</span>
          </span>
        )}
      </div>
    </section>
  );
}

/* ---------------- AI patient summary ---------------- */

export function AiPatientSummary({ patientId }: { patientId: string }) {
  const start = useMemo(() => (signal: AbortSignal) => aiService.streamPatientSummary(patientId, signal), [patientId]);
  const ai = useAiStream(start);
  const [decision, setDecision] = useState<ReviewDecision>();
  return (
    <AiPanel
      title="Patient summary"
      meta={ai.phase === "done" || ai.phase === "streaming" ? ai.meta : undefined}
      onRegenerate={ai.phase === "done" ? () => { setDecision(undefined); ai.run(); } : undefined}
      footer={ai.phase === "done" && <ReviewBar decision={decision} acceptLabel="Mark as reviewed" onAccept={() => setDecision("accepted")} onDismiss={() => setDecision("dismissed")} />}
    >
      {ai.phase === "idle" && (
        <div className="flex flex-col items-start gap-3 p-4">
          <p className="text-sm text-muted-foreground">One-click summary of problems, course, key results, medications, allergies and care gaps from the full record.</p>
          <Button size="sm" onClick={ai.run}>
            <Sparkles /> Summarise record
          </Button>
        </div>
      )}
      {ai.phase === "analyzing" && <Analyzing label="Reading the record" steps={["Problem list and allergies", "Encounters and admissions", "Laboratory and imaging results", "Medications and vitals", "Composing summary"]} />}
      {(ai.phase === "streaming" || ai.phase === "done") && (
        <div className={cn("max-h-[560px] overflow-y-auto p-4 scrollbar-thin", decision === "dismissed" && "opacity-50")} aria-live="polite" aria-busy={ai.phase === "streaming"}>
          <MarkdownLite text={ai.text} streaming={ai.phase === "streaming"} />
        </div>
      )}
      {ai.phase === "error" && <ErrorState error={ai.error} onRetry={ai.run} />}
    </AiPanel>
  );
}

/* ---------------- Vitals ---------------- */

function vitalTone(kind: string, v: number): "critical" | "warning" | undefined {
  switch (kind) {
    case "spo2":
      return v < 92 ? "critical" : v < 95 ? "warning" : undefined;
    case "pulse":
      return v > 130 || v < 45 ? "critical" : v > 100 || v < 55 ? "warning" : undefined;
    case "rr":
      return v > 24 || v < 9 ? "critical" : v > 20 ? "warning" : undefined;
    case "sbp":
      return v < 90 || v > 200 ? "critical" : v < 100 || v > 160 ? "warning" : undefined;
    case "temp":
      return v >= 103 ? "critical" : v >= 100.4 ? "warning" : undefined;
  }
}

export function VitalsGrid({ v }: { v?: Vitals }) {
  if (!v) return <EmptyState compact icon={HeartPulse} title="No vitals recorded" />;
  const score = news2(v);
  const items = [
    { label: "BP", value: `${v.bpSystolic}/${v.bpDiastolic}`, unit: "mmHg", tone: vitalTone("sbp", v.bpSystolic) },
    { label: "Pulse", value: v.pulse, unit: "/min", tone: vitalTone("pulse", v.pulse) },
    { label: "SpO₂", value: v.spo2, unit: v.onOxygen ? "% on O₂" : "%", tone: vitalTone("spo2", v.spo2) },
    { label: "Resp. rate", value: v.respRate, unit: "/min", tone: vitalTone("rr", v.respRate) },
    { label: "Temp", value: v.tempF, unit: "°F", tone: vitalTone("temp", v.tempF) },
    { label: "NEWS2", value: score, unit: "", tone: score >= 7 ? ("critical" as const) : score >= 5 ? ("warning" as const) : undefined },
  ];
  return (
    <div>
      <div className="grid grid-cols-3 divide-x divide-y sm:grid-cols-6 sm:divide-y-0">
        {items.map((i) => (
          <div key={i.label} className="px-3 py-3">
            <p className="text-xs text-muted-foreground">{i.label}</p>
            <p className={cn("text-lg font-semibold", i.tone && toneText[i.tone])}>
              {i.value}
              <span className="ml-0.5 text-xs font-normal text-muted-foreground">{i.unit}</span>
            </p>
          </div>
        ))}
      </div>
      <p className="border-t px-4 py-2 text-xs text-muted-foreground">
        Recorded {relativeDay(v.recordedAt)} by {v.recordedBy} · {v.source}
        {v.grbs ? ` · GRBS ${v.grbs} mg/dL` : ""}
        {v.consciousness && v.consciousness !== "Alert" ? ` · ${v.consciousness}` : ""}
      </p>
    </div>
  );
}

export function VitalsTab({ patientId }: { patientId: string }) {
  const q = useQuery({ queryKey: ["vitals", patientId], queryFn: () => patientService.getVitals(patientId, 60), staleTime: STALE.live });
  if (q.isLoading) return <PanelSkeleton lines={10} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const rows = (q.data ?? []).map((v) => ({ at: v.recordedAt, sbp: v.bpSystolic, dbp: v.bpDiastolic, pulse: v.pulse, spo2: v.spo2, rr: v.respRate, temp: v.tempF, news: news2(v) }));
  if (!rows.length) return <EmptyState icon={HeartPulse} title="No vitals on record" />;
  const lbl = (d: string) => dateTime(d);
  const x = (d: string) => (rows.length > 20 ? date(d, "d MMM HH:mm") : time(d));
  const tbl = (key: keyof (typeof rows)[number], name: string) => ({ columns: ["Time", name], rows: rows.map((r) => [dateTime(r.at), r[key] as number]) });
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Blood pressure" description="mmHg" table={{ columns: ["Time", "Systolic", "Diastolic"], rows: rows.map((r) => [dateTime(r.at), r.sbp, r.dbp]) }} height={200}>
          <TrendChart data={rows} x="at" xFormat={x} labelFormat={lbl} height={200} series={[{ key: "sbp", label: "Systolic" }, { key: "dbp", label: "Diastolic", slot: 2 }]} />
        </ChartCard>
        <ChartCard title="Early warning score (NEWS2)" description="Aggregate of 7 parameters" table={tbl("news", "NEWS2")} height={200}>
          <TrendChart data={rows} x="at" xFormat={x} labelFormat={lbl} height={200} series={[{ key: "news", label: "NEWS2", type: "area" }]} reference={{ y: 5, label: "Urgent review 5" }} yDomain={[0, "auto"]} />
        </ChartCard>
        <ChartCard title="Pulse" description="beats/min" table={tbl("pulse", "Pulse")} height={200}>
          <TrendChart data={rows} x="at" xFormat={x} labelFormat={lbl} height={200} series={[{ key: "pulse", label: "Pulse" }]} />
        </ChartCard>
        <ChartCard title="Oxygen saturation" description="SpO₂ %" table={tbl("spo2", "SpO2")} height={200}>
          <TrendChart data={rows} x="at" xFormat={x} labelFormat={lbl} height={200} series={[{ key: "spo2", label: "SpO₂" }]} yDomain={[80, 100]} reference={{ y: 94, label: "94%" }} />
        </ChartCard>
        <ChartCard title="Respiratory rate" description="breaths/min" table={tbl("rr", "Resp. rate")} height={200}>
          <TrendChart data={rows} x="at" xFormat={x} labelFormat={lbl} height={200} series={[{ key: "rr", label: "Resp. rate" }]} />
        </ChartCard>
        <ChartCard title="Temperature" description="°F" table={tbl("temp", "Temp °F")} height={200}>
          <TrendChart data={rows} x="at" xFormat={x} labelFormat={(d) => `${dateTime(d)}`} format={(v) => v.toFixed(1)} height={200} series={[{ key: "temp", label: "Temperature" }]} reference={{ y: 100.4, label: "Fever 100.4" }} />
        </ChartCard>
      </div>
      <Panel title="Readings" description={`${rows.length} most recent`}>
        <div className="max-h-96 overflow-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
              <tr className="border-b">
                {["Time", "BP", "Pulse", "SpO₂", "RR", "Temp", "NEWS2", "By"].map((h, i) => (
                  <th key={h} className={cn("px-3 py-2 font-medium first:pl-4", i > 0 && i < 7 ? "text-right" : "text-left")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...(q.data ?? [])].reverse().map((v) => (
                <tr key={v.id}>
                  <td className="px-3 py-1.5 pl-4 whitespace-nowrap">{dateTime(v.recordedAt)}</td>
                  <td className="num px-3 py-1.5 text-right">
                    {v.bpSystolic}/{v.bpDiastolic}
                  </td>
                  <td className="num px-3 py-1.5 text-right">{v.pulse}</td>
                  <td className="num px-3 py-1.5 text-right">{v.spo2}</td>
                  <td className="num px-3 py-1.5 text-right">{v.respRate}</td>
                  <td className="num px-3 py-1.5 text-right">
                    {v.tempF} <span className="text-xs text-muted-foreground">({fToC(v.tempF)} °C)</span>
                  </td>
                  <td className="num px-3 py-1.5 text-right">{news2(v)}</td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{v.recordedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

/* ---------------- Timeline ---------------- */

const KIND_ICON: Record<TimelineEventKind, LucideIcon> = {
  registration: UserRound,
  visit: Stethoscope,
  admission: BedDouble,
  discharge: BedDouble,
  transfer: Activity,
  lab: FlaskConical,
  radiology: ScanLine,
  prescription: Pill,
  procedure: Scissors,
  er: Siren,
  vitals: HeartPulse,
  bill: Receipt,
};

export function TimelineTab({ patientId }: { patientId: string }) {
  const q = useQuery({ queryKey: ["timeline", patientId], queryFn: () => patientService.getTimeline(patientId) });
  const [kinds, setKinds] = useState<string[]>([]);
  if (q.isLoading) return <PanelSkeleton lines={12} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const all = q.data ?? [];
  const present = [...new Set(all.map((e) => e.kind))];
  const events = kinds.length ? all.filter((e) => kinds.includes(e.kind)) : all;
  return (
    <Panel
      title="Clinical timeline"
      description={`${all.length} events`}
      actions={
        <div className="hidden flex-wrap gap-1 md:flex" role="group" aria-label="Filter events">
          {present.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kinds.includes(k)}
              onClick={() => setKinds((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]))}
              className={cn("h-6 rounded-full border px-2 text-[11px] capitalize hover:bg-accent", kinds.includes(k) && "border-primary bg-info-soft text-info-fg")}
            >
              {k}
            </button>
          ))}
        </div>
      }
    >
      <ol className="relative px-4 py-4">
        <span aria-hidden className="absolute top-6 bottom-6 left-[31px] w-px bg-border" />
        {events.map((e) => {
          const Icon = KIND_ICON[e.kind];
          const tone = e.severity ?? "neutral";
          const body = (
            <div className="relative flex gap-3 rounded-lg px-1 py-2 hover:bg-accent/40">
              <span className={cn("relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border bg-card", tone === "critical" && "border-critical/40 text-critical-fg", tone === "warning" && "border-warning/50 text-warning-fg")}>
                <Icon className="size-3.5" strokeWidth={ICON_STROKE} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="text-[13px] font-medium">{e.title}</p>
                  <time className="text-xs text-muted-foreground" dateTime={e.at}>
                    {dateTime(e.at)}
                  </time>
                </div>
                {e.detail && <p className="text-[13px] text-muted-foreground">{e.detail}</p>}
                {e.actor && <p className="text-xs text-subtle-foreground">{e.actor}</p>}
              </div>
            </div>
          );
          return <li key={e.id}>{e.href ? <Link href={e.href} className="block rounded-lg focus-visible:outline-2">{body}</Link> : body}</li>;
        })}
      </ol>
    </Panel>
  );
}

/* ---------------- Labs ---------------- */

export function LabsTab({ patientId }: { patientId: string }) {
  const q = useQuery({ queryKey: ["lab-orders", "patient", patientId], queryFn: () => labService.getOrdersByPatient(patientId) });
  const [param, setParam] = useState<string>();
  const [openId, setOpenId] = useState<string>();
  const numericParams = useMemo(() => {
    const m = new Map<string, { code: string; name: string; unit: string; refLow?: number; refHigh?: number }>();
    for (const o of q.data ?? []) for (const t of o.tests) for (const p of t.parameters) if (p.refLow !== undefined && o.results.some((r) => r.paramCode === p.code)) m.set(p.code, { code: p.code, name: p.name, unit: p.unit, refLow: p.refLow, refHigh: p.refHigh });
    return [...m.values()];
  }, [q.data]);
  const selected = param ?? numericParams.find((p) => (q.data ?? []).some((o) => o.results.some((r) => r.paramCode === p.code && r.flag !== "N")))?.code ?? numericParams[0]?.code;
  const trend = useQuery({ queryKey: ["lab-trend", patientId, selected], queryFn: () => labService.getParameterTrend(patientId, selected!), enabled: Boolean(selected) });
  const meta = numericParams.find((p) => p.code === selected);

  if (q.isLoading) return <PanelSkeleton lines={10} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data?.length) return <EmptyState icon={FlaskConical} title="No lab orders" description="Orders placed from OPD, IPD or ER appear here." />;
  const current = openId ?? q.data.find((o) => o.results.length)?.id;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        {meta && (
          <ChartCard
            title={`${meta.name} trend`}
            description={meta.unit}
            height={200}
            actions={
              <label className="flex items-center gap-2 text-xs">
                <span className="sr-only">Parameter</span>
                <select value={selected} onChange={(e) => setParam(e.target.value)} className="h-7 rounded-md border border-input bg-card px-1.5 text-xs outline-none focus-visible:border-ring">
                  {numericParams.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            }
            table={{ columns: ["Date", meta.name], rows: (trend.data ?? []).map((t) => [dateTime(t.at), t.value]) }}
          >
            <TrendChart
              data={(trend.data ?? []).map((t) => ({ at: t.at, value: t.value }))}
              x="at"
              xFormat={(d) => date(d, "d MMM")}
              labelFormat={dateTime}
              height={200}
              series={[{ key: "value", label: meta.name }]}
              reference={meta.refHigh !== undefined ? { y: meta.refHigh, label: `Upper limit ${meta.refHigh}` } : undefined}
            />
          </ChartCard>
        )}
        <Panel title="Orders" description={`${q.data.length} orders, newest first`} bodyClassName="divide-y">
          {q.data.map((o) => {
            const open = o.id === current;
            return (
              <div key={o.id}>
                <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? "" : o.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{o.tests.map((t) => t.name).join(", ")}</span>
                    <span className="num block text-xs text-muted-foreground">
                      {o.orderNo} · {dateTime(o.orderedAt)} · {o.orderedBy.name}
                    </span>
                  </span>
                  {o.criticalCount > 0 && <StatusBadge tone="critical">{o.criticalCount} critical</StatusBadge>}
                  {o.abnormalCount > 0 && o.criticalCount === 0 && <StatusBadge tone="warning">{o.abnormalCount} abnormal</StatusBadge>}
                  <StatusBadge status={o.status} />
                </button>
                {open && (
                  <div className="border-t bg-muted/20 pb-2">
                    <LabResultsTable order={o} dense />
                    <div className="flex justify-end px-4 pt-1">
                      <Button variant="ghost" size="xs" render={<Link href={`/print/lab/${o.id}`} />} nativeButton={false}>
                        <FileText /> Printable report
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </Panel>
      </div>
      {current && <LabInterpreter key={current} orderId={current} />}
    </div>
  );
}

/* ---------------- Medications ---------------- */

export function MedicationsPanel({ patientId }: { patientId: string }) {
  const q = useQuery({ queryKey: ["medications", patientId], queryFn: () => patientService.getMedications(patientId) });
  return (
    <Panel title="Current medications" description="Active orders, recent prescriptions and home medications">
      {q.isLoading ? (
        <PanelSkeleton lines={4} />
      ) : !q.data?.length ? (
        <EmptyState compact icon={Pill} title="No active medications" />
      ) : (
        <ul className="divide-y">
          {q.data.map((m) => (
            <li key={m.drugId} className="flex items-center gap-3 px-4 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">
                  {m.brand} <span className="font-normal text-muted-foreground">{m.strength}</span>
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {m.generic} · {m.dose} · {m.frequency}
                </span>
              </span>
              <StatusBadge tone={m.source === "Home medication" ? "neutral" : "info"}>{m.source}</StatusBadge>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ---------------- Admissions, documents, billing ---------------- */

export function AdmissionsTab({ patientId }: { patientId: string }) {
  const q = useQuery({ queryKey: ["admissions", "patient", patientId], queryFn: () => ipdService.getAdmissionsByPatient(patientId) });
  if (q.isLoading) return <PanelSkeleton lines={6} />;
  if (!q.data?.length) return <EmptyState icon={BedDouble} title="No admissions" />;
  return (
    <Panel title="Admissions" bodyClassName="divide-y">
      {q.data.map((a) => (
        <Link key={a.id} href={`/ipd/admissions/${a.id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-accent/40 sm:flex-row sm:items-center sm:gap-4">
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium">{a.reason}</span>
            <span className="num block text-xs text-muted-foreground">
              {a.ipNo} · {a.ward.name} {a.bed.code} · {a.doctor.name}
            </span>
          </span>
          <span className="text-xs text-muted-foreground">
            {date(a.admittedAt)} to {a.dischargedAt ? date(a.dischargedAt) : "present"} · {a.lengthOfStayDays} d
          </span>
          <StatusBadge status={a.status} />
        </Link>
      ))}
    </Panel>
  );
}

export function DocumentsTab({ patientId }: { patientId: string }) {
  const q = useQuery({ queryKey: ["documents", patientId], queryFn: () => patientService.getDocuments(patientId) });
  if (q.isLoading) return <PanelSkeleton lines={6} />;
  if (!q.data?.length) return <EmptyState icon={FileText} title="No documents" />;
  return (
    <Panel title="Documents" description="Scanned and system-generated records" bodyClassName="divide-y">
      {q.data.map((d) => (
        <div key={d.id} className="flex items-center gap-3 px-4 py-2.5">
          <FileText className="size-4 shrink-0 text-muted-foreground" strokeWidth={ICON_STROKE} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">{d.title}</span>
            <span className="block text-xs text-muted-foreground">
              {d.kind} · {d.uploadedBy} · {date(d.uploadedAt)} · {d.sizeKb} KB
            </span>
          </span>
        </div>
      ))}
    </Panel>
  );
}

export function BillingTab({ patientId }: { patientId: string }) {
  const q = useQuery({ queryKey: ["bills", "patient", patientId], queryFn: () => billingService.getBillsByPatient(patientId) });
  if (q.isLoading) return <PanelSkeleton lines={6} />;
  if (!q.data?.length) return <EmptyState icon={Receipt} title="No bills" />;
  return (
    <Panel title="Bills" bodyClassName="divide-y">
      {q.data.map((b) => (
        <Link key={b.id} href={`/billing/bills/${b.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40">
          <span className="min-w-0 flex-1">
            <span className="num block text-[13px] font-medium">{b.billNo}</span>
            <span className="block text-xs text-muted-foreground">
              {b.encounterType} · {date(b.createdAt)} · {b.items.length} items
            </span>
          </span>
          <span className="num text-right text-[13px]">
            {inr(b.totals.net)}
            {b.totals.due > 0 && <span className="block text-xs text-warning-fg">{inr(b.totals.due)} due</span>}
          </span>
          <StatusBadge status={b.status} />
        </Link>
      ))}
    </Panel>
  );
}

/* ---------------- Overview ---------------- */

export function OverviewTab({ p }: { p: PatientDetail }) {
  const risks = useQuery({ queryKey: ["risk", p.id], queryFn: () => aiService.getRiskScores(p.id), enabled: Boolean(p.activeAdmission || p.latestVitals), staleTime: STALE.live });
  const appts = useQuery({ queryKey: ["appointments", "patient", p.id], queryFn: () => appointmentService.getByPatient(p.id) });
  const labs = useQuery({ queryKey: ["lab-orders", "patient", p.id], queryFn: () => labService.getOrdersByPatient(p.id) });
  const upcoming = (appts.data ?? []).filter((a) => a.status === "Scheduled" || a.status === "Checked in").slice(0, 3);
  const abnormal = (labs.data ?? []).filter((o) => o.abnormalCount > 0).slice(0, 4);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
      <div className="min-w-0 space-y-4">
        <AiPatientSummary patientId={p.id} />
        <Panel title="Latest vitals" actions={<Button variant="ghost" size="xs" render={<Link href={`/patients/${p.id}?tab=vitals`} />} nativeButton={false}>Trends</Button>}>
          <VitalsGrid v={p.latestVitals} />
        </Panel>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Problem list">
            {p.conditions.length ? (
              <ul className="divide-y">
                {p.conditions.map((c) => (
                  <li key={c.code} className="flex items-center gap-3 px-4 py-2">
                    <span className="num w-16 shrink-0 text-xs text-muted-foreground">{c.code}</span>
                    <span className="min-w-0 flex-1 text-[13px]">{c.name}</span>
                    <StatusBadge tone={c.chronic ? "neutral" : "info"}>{c.chronic ? "Chronic" : "Active"}</StatusBadge>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact title="No problems recorded" />
            )}
          </Panel>
          <MedicationsPanel patientId={p.id} />
        </div>
        <Panel title="Recent abnormal results" actions={<Button variant="ghost" size="xs" render={<Link href={`/patients/${p.id}?tab=labs`} />} nativeButton={false}>All labs</Button>}>
          {labs.isLoading ? (
            <PanelSkeleton lines={3} />
          ) : abnormal.length ? (
            <ul className="divide-y">
              {abnormal.map((o) => (
                <li key={o.id} className="px-4 py-2">
                  <p className="text-[13px] font-medium">
                    {o.tests.map((t) => t.name).join(", ")} <span className="font-normal text-muted-foreground">· {relativeDay(o.resultedAt ?? o.orderedAt)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {o.results
                      .filter((r) => r.flag !== "N")
                      .slice(0, 4)
                      .map((r) => {
                        const pm = o.tests.flatMap((t) => t.parameters).find((x) => x.code === r.paramCode);
                        return `${pm?.name} ${r.value}${pm?.unit ? ` ${pm.unit}` : ""} (${r.flag})`;
                      })
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact title="No abnormal results" />
          )}
        </Panel>
      </div>
      <div className="min-w-0 space-y-4">
        {(risks.data?.length ?? 0) > 0 && (
          <AiPanel title="Clinical risk scores" meta={risks.data?.[0]?.meta}>
            <div className="space-y-2 p-3">
              {risks.data!.map((r) => (
                <RiskScoreCard key={r.kind} score={r} compact={r.level === "Low"} />
              ))}
            </div>
          </AiPanel>
        )}
        {risks.isLoading && <PanelSkeleton lines={6} className="rounded-xl border" />}
        <Panel title="Demographics">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4">
            <Field label="Address">{`${p.address.line1}, ${p.address.city}`}</Field>
            <Field label="PIN code">{p.address.pincode}</Field>
            <Field label="Language">{p.preferredLanguage}</Field>
            <Field label="Occupation">{p.occupation}</Field>
            <Field label="Marital status">{p.maritalStatus}</Field>
            <Field label="Email">{p.email}</Field>
            <Field label="Emergency contact" className="col-span-2">{`${p.emergencyContact.name} (${p.emergencyContact.relation}) · ${p.emergencyContact.phone}`}</Field>
            {p.insurance && (
              <>
                <Field label="Policy">{p.insurance.policyNo}</Field>
                <Field label="Valid till">{date(p.insurance.validTill)}</Field>
                <Field label="Sum insured">{inr(p.insurance.sumInsured)}</Field>
              </>
            )}
            <Field label="Registered">{date(p.registeredAt)}</Field>
          </dl>
        </Panel>
        <Panel title="Upcoming appointments">
          {upcoming.length ? (
            <ul className="divide-y">
              {upcoming.map((a) => (
                <li key={a.id} className="px-4 py-2">
                  <p className="text-[13px] font-medium">{a.doctor.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {date(a.date, "EEE d MMM")} at {a.time} · {a.doctor.departmentName} · <span className={toneText[statusTone(a.status)]}>{a.status}</span>
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={CalendarPlus} title="Nothing booked" />
          )}
        </Panel>
      </div>
    </div>
  );
}
