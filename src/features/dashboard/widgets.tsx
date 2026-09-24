"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, BedDouble, CalendarPlus, ClipboardList, UserPlus } from "lucide-react";
import type { Role } from "@/types";
import { aiService } from "@/services/aiService";
import { appointmentService } from "@/services/appointmentService";
import { billingService } from "@/services/billingService";
import { dashboardService } from "@/services/dashboardService";
import { erService } from "@/services/erService";
import { ipdService } from "@/services/ipdService";
import { labService } from "@/services/labService";
import { notificationService } from "@/services/notificationService";
import { nursingService } from "@/services/nursingService";
import { pharmacyService } from "@/services/pharmacyService";
import { reportService } from "@/services/reportService";
import { BarsChart, ChartCard, TrendChart } from "@/components/charts/charts";
import { KpiTile } from "@/components/data/kpi-tile";
import { EmptyState, ErrorState, KpiSkeleton, PanelSkeleton } from "@/components/feedback/states";
import { SeverityDot, StatusBadge } from "@/components/feedback/status-badge";
import { Panel } from "@/components/layout/page";
import { AiPanel } from "@/components/ai/ai";
import { Button } from "@/components/ui/button";
import { ICON_STROKE, STALE } from "@/lib/constants";
import { TRIAGE_META } from "@/lib/clinical";
import { todayLocal } from "@/lib/dates";
import { ago, date, inr, inrCompact, minutesLabel, number, time } from "@/lib/format";
import { MODULE_ICON } from "@/lib/nav";
import { ROLE_PERSONA } from "@/lib/rbac";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";

const ViewAll = ({ href, label = "View all" }: { href: string; label?: string }) => (
  <Button variant="ghost" size="xs" render={<Link href={href} />} nativeButton={false}>
    {label} <ArrowRight />
  </Button>
);

export function KpiRow({ role }: { role: Role }) {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["kpis", role], queryFn: () => dashboardService.getKpis(role), staleTime: STALE.live, refetchInterval: 60_000 });
  if (isLoading) return <KpiSkeleton count={role === "Admin" ? 6 : 5} />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  return (
    <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-3", data!.length === 6 ? "xl:grid-cols-6" : "xl:grid-cols-5")}>
      {data!.map((k) => (
        <KpiTile key={k.id} kpi={k} />
      ))}
    </div>
  );
}

/* ---------- Activity & alerts ---------- */

export function ActivityFeed({ className }: { className?: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["activity"], queryFn: () => notificationService.pollActivity(24), refetchInterval: 12_000, staleTime: 5_000 });
  return (
    <Panel
      title="Live activity"
      className={className}
      actions={
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-stable opacity-50 motion-reduce:hidden" />
            <span className="relative inline-flex size-2 rounded-full bg-stable" />
          </span>
          Live
        </span>
      }
    >
      {isLoading ? (
        <PanelSkeleton lines={8} />
      ) : (
        <ol className="max-h-[440px] divide-y overflow-y-auto scrollbar-thin" aria-live="polite" aria-label="Recent activity">
          <AnimatePresence initial={false}>
            {data!.map((e) => {
              const Icon = MODULE_ICON[e.module] ?? MODULE_ICON.Default;
              return (
                <motion.li key={e.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <Link href={e.href ?? "#"} className="flex gap-3 px-4 py-2.5 hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none">
                    <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground", e.severity === "critical" && "bg-critical-soft text-critical-fg")}>
                      <Icon className="size-3.5" strokeWidth={ICON_STROKE} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 text-[13px] leading-snug">
                      <span className="font-medium">{e.actor}</span> <span className="text-muted-foreground">{e.verb}</span> {e.target}
                      <span className="block text-[11px] text-subtle-foreground">
                        {e.module} · {ago(e.at)}
                      </span>
                    </span>
                  </Link>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      )}
    </Panel>
  );
}

export function AlertsPanel({ role, className }: { role: Role; className?: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["notifications", role], queryFn: () => notificationService.getForRole(role), staleTime: STALE.live });
  const alerts = (data ?? []).filter((n) => n.severity === "critical" || n.severity === "warning").slice(0, 6);
  return (
    <Panel title="Needs attention" description="Critical and warning alerts for your role" className={className}>
      {isLoading ? (
        <PanelSkeleton lines={5} />
      ) : alerts.length === 0 ? (
        <EmptyState compact title="Nothing urgent" description="No critical or warning alerts right now." />
      ) : (
        <ul className="divide-y">
          {alerts.map((a) => (
            <li key={a.id}>
              <Link href={a.href ?? "#"} className="flex gap-3 px-4 py-2.5 hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none">
                <SeverityDot tone={a.severity} className="mt-1.5" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium">{a.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{a.body}</span>
                </span>
                <span className="shrink-0 text-[11px] text-subtle-foreground">{ago(a.at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ---------- Admin charts ---------- */

const shortDate = (d: string) => date(d, "d MMM");

export function OpdTrend() {
  const { data, isLoading } = useQuery({ queryKey: ["report-daily", 30], queryFn: () => reportService.getDaily(30) });
  const rows = (data ?? []).map((d) => ({ date: d.date, opd: d.opdFootfall, er: d.erArrivals }));
  return (
    <ChartCard title="Patient footfall" description="Last 30 days" loading={isLoading} table={{ columns: ["Date", "OPD", "Emergency"], rows: rows.map((r) => [shortDate(r.date), r.opd, r.er]) }}>
      <TrendChart data={rows} x="date" xFormat={shortDate} labelFormat={(d) => date(d, "EEE, d MMM")} series={[{ key: "opd", label: "OPD visits", type: "area" }, { key: "er", label: "Emergency arrivals" }]} />
    </ChartCard>
  );
}

export function OccupancyByWard() {
  const { data, isLoading } = useQuery({ queryKey: ["occupancy"], queryFn: () => ipdService.getOccupancy(), staleTime: STALE.live });
  const rows = (data ?? []).filter((w) => w.ward.type !== "ER").map((w) => ({ ward: w.ward.name.replace("General Ward", "General").replace(" Unit", ""), pct: Math.round((w.occupied / w.total) * 100), label: `${w.occupied}/${w.total}` }));
  return (
    <ChartCard title="Occupancy by ward" description="Occupied beds as a share of ward capacity" loading={isLoading} height={300} actions={<ViewAll href="/ipd/beds" label="Bed map" />} table={{ columns: ["Ward", "Occupied", "Occupancy"], rows: rows.map((r) => [r.ward, r.label, `${r.pct}%`]) }}>
      <BarsChart data={rows} x="ward" layout="horizontal" height={300} categoryWidth={132} format={(v) => `${v}%`} series={[{ key: "pct", label: "Occupancy" }]} />
    </ChartCard>
  );
}

export function RevenueStreams() {
  const { data, isLoading } = useQuery({ queryKey: ["revenue-summary", 30], queryFn: () => reportService.getRevenueSummary(30) });
  const change = data ? ((data.total - data.previousTotal) / data.previousTotal) * 100 : 0;
  return (
    <ChartCard
      title="Revenue, last 30 days"
      description={data ? `${inrCompact(data.total)} gross · ${change >= 0 ? "+" : ""}${change.toFixed(1)}% vs previous 30 days` : undefined}
      loading={isLoading}
      table={data ? { columns: ["Stream", "Revenue"], rows: data.byStream.map((s) => [s.stream, inr(s.value)]) } : undefined}
      actions={<ViewAll href="/reports" label="Reports" />}
    >
      {data && <BarsChart data={data.byStream} x="stream" format={inrCompact} series={[{ key: "value", label: "Revenue" }]} height={220} />}
    </ChartCard>
  );
}

export function OccupancyForecast() {
  const { data, isLoading } = useQuery({ queryKey: ["forecasts"], queryFn: () => aiService.getForecasts(), staleTime: STALE.standard });
  const f = data?.find((x) => x.id === "bed-occupancy");
  const lastActual = f?.points.filter((p) => p.actual !== undefined).at(-1)?.date;
  return (
    <AiPanel title="Bed occupancy forecast" meta={f?.meta}>
      {isLoading || !f ? (
        <PanelSkeleton lines={6} />
      ) : (
        <div className="pb-2">
          <p className="px-4 pt-3 text-sm">{f.summary}</p>
          <TrendChart
            data={f.points as unknown as Record<string, unknown>[]}
            x="date"
            xFormat={shortDate}
            labelFormat={(d) => date(d, "EEE, d MMM")}
            format={(v) => `${Math.round(v)}%`}
            series={[{ key: "actual", label: "Actual" }, { key: "forecast", label: "Forecast", slot: 1 }]}
            band={{ lower: "lower", upper: "upper", slot: 1 }}
            forecastFrom={lastActual}
            height={220}
          />
        </div>
      )}
    </AiPanel>
  );
}

export function ErSnapshot() {
  const { data, isLoading } = useQuery({ queryKey: ["er-active"], queryFn: () => erService.getActive(), staleTime: STALE.live, refetchInterval: 30_000 });
  return (
    <Panel title="Emergency now" description={data ? `${data.length} patients in the department` : undefined} actions={<ViewAll href="/emergency" label="Triage board" />}>
      {isLoading ? (
        <PanelSkeleton lines={5} />
      ) : (
        <ul className="divide-y">
          {data!.slice(0, 6).map((e) => {
            const meta = e.triageLevel ? TRIAGE_META[e.triageLevel] : undefined;
            return (
              <li key={e.id}>
                <Link href={`/emergency/${e.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none">
                  <StatusBadge tone={meta?.severity ?? "neutral"} className="w-24 justify-center">
                    {e.triageLevel ? `L${e.triageLevel} ${meta!.color}` : "Untriaged"}
                  </StatusBadge>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{e.patient.fullName}</span>
                    <span className="block truncate text-xs text-muted-foreground">{e.chiefComplaint}</span>
                  </span>
                  <span className="num shrink-0 text-xs text-muted-foreground">{minutesLabel(e.waitingMinutes)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ---------- Doctor ---------- */

export function DoctorQueue() {
  const doctorId = ROLE_PERSONA.Doctor.doctorId!;
  const { data, isLoading } = useQuery({ queryKey: ["queue", todayLocal(), doctorId], queryFn: () => appointmentService.getQueue(todayLocal(), doctorId), staleTime: STALE.live, refetchInterval: 30_000 });
  const active = (data ?? []).filter((a) => ["In consultation", "Checked in", "Scheduled"].includes(a.status));
  return (
    <Panel title="My OPD queue" description="Today, in token order" actions={<ViewAll href="/opd/queue" label="Queue board" />}>
      {isLoading ? (
        <PanelSkeleton lines={6} />
      ) : active.length === 0 ? (
        <EmptyState compact title="Queue is clear" description="No patients waiting for you right now." />
      ) : (
        <ul className="divide-y">
          {active.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="num flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold">{a.token ?? "-"}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-medium">{a.patient.fullName}</span>
                  <span className="text-xs text-muted-foreground">
                    {a.patient.ageLabel} {a.patient.gender[0]}
                  </span>
                  {a.patient.allergies.length > 0 && <StatusBadge tone="critical">Allergy</StatusBadge>}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {a.time} · {a.type} · {a.reason}
                </span>
              </span>
              <StatusBadge status={a.status} className="hidden sm:inline-flex" />
              {a.status !== "Scheduled" && (
                <Button size="sm" variant={a.status === "In consultation" ? "default" : "outline"} render={<Link href={`/opd/consult/${a.id}`} />} nativeButton={false}>
                  {a.status === "In consultation" ? "Continue" : "Start"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function MyInpatients({ doctorId }: { doctorId?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admissions", { active: true, doctorId }],
    queryFn: () => ipdService.getAdmissions({ filters: { active: "true", doctorId }, sort: [{ id: "news2", desc: true }], pageSize: 8 }),
    staleTime: STALE.live,
  });
  return (
    <Panel title={doctorId ? "My inpatients" : "Sickest inpatients"} description="Sorted by early warning score" actions={<ViewAll href="/ipd/admissions" />}>
      {isLoading ? (
        <PanelSkeleton lines={6} />
      ) : data!.rows.length === 0 ? (
        <EmptyState compact title="No inpatients" />
      ) : (
        <ul className="divide-y">
          {data!.rows.map((a) => (
            <li key={a.id}>
              <Link href={`/ipd/admissions/${a.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none">
                <span className="num w-16 shrink-0 text-xs font-medium">{a.bed.code}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{a.patient.fullName}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    Day {a.lengthOfStayDays + 1} · {a.reason}
                  </span>
                </span>
                {a.news2 !== undefined && <StatusBadge tone={a.news2 >= 7 ? "critical" : a.news2 >= 5 ? "warning" : a.news2 >= 1 ? "neutral" : "stable"}>NEWS2 {a.news2}</StatusBadge>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ---------- Nurse ---------- */

export function WardWatchlist({ wardId }: { wardId: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["ward-patients", wardId], queryFn: () => nursingService.getWardPatients(wardId), staleTime: STALE.live, refetchInterval: 60_000 });
  return (
    <Panel title="Ward watchlist" description="Highest early warning scores first" actions={<ViewAll href="/nursing" label="Nursing station" />}>
      {isLoading ? (
        <PanelSkeleton lines={6} />
      ) : (
        <ul className="divide-y">
          {data!.map((p) => (
            <li key={p.admission.id}>
              <Link href={`/nursing?patient=${p.admission.patientId}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none">
                <span className="num w-16 shrink-0 text-xs font-medium">{p.admission.bed.code}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{p.admission.patient.fullName}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {p.latestVitals ? `SpO₂ ${p.latestVitals.spo2}% · RR ${p.latestVitals.respRate} · HR ${p.latestVitals.pulse} · ${time(p.latestVitals.recordedAt)}` : "No vitals"}
                  </span>
                </span>
                {p.dueMeds > 0 && <StatusBadge tone="info">{p.dueMeds} meds due</StatusBadge>}
                <StatusBadge tone={(p.news2 ?? 0) >= 7 ? "critical" : (p.news2 ?? 0) >= 5 ? "warning" : "stable"}>NEWS2 {p.news2 ?? "-"}</StatusBadge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function MarDue({ wardId }: { wardId: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["mar", wardId], queryFn: () => nursingService.getMar({ wardId }), staleTime: STALE.live });
  const now = useNow();
  const due = (data ?? []).filter((m) => m.status === "Due" && new Date(m.scheduledAt).getTime() < now + 3 * 3600000).slice(0, 8);
  return (
    <Panel title="Medications due" description="Next 3 hours and overdue" actions={<ViewAll href="/nursing?tab=mar" label="MAR" />}>
      {isLoading ? (
        <PanelSkeleton lines={5} />
      ) : due.length === 0 ? (
        <EmptyState compact title="Nothing due" description="No medications due in the next 3 hours." />
      ) : (
        <ul className="divide-y">
          {due.map((m) => {
            const overdue = new Date(m.scheduledAt).getTime() < now - 30 * 60000;
            return (
              <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className={cn("num w-12 shrink-0 text-xs font-medium", overdue && "text-critical-fg")}>{time(m.scheduledAt)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{m.drug}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {m.dose} {m.route} · {m.patient.fullName} ({m.bedCode})
                  </span>
                </span>
                {m.highAlert && <StatusBadge tone="warning">High alert</StatusBadge>}
                {overdue && <StatusBadge tone="critical">Overdue</StatusBadge>}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ---------- Receptionist ---------- */

export function QuickActions() {
  const actions = [
    { label: "Register patient", href: "/patients/new", icon: UserPlus, hint: "New UHID with ABHA linking" },
    { label: "Book appointment", href: "/opd/appointments?book=1", icon: CalendarPlus, hint: "Doctor-wise slots" },
    { label: "OPD queue", href: "/opd/queue", icon: ClipboardList, hint: "Check in and call tokens" },
    { label: "Bed availability", href: "/ipd/beds", icon: BedDouble, hint: "Live ward map" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {actions.map((a) => (
        <Link key={a.href} href={a.href} className="group flex items-center gap-3 rounded-xl border bg-card p-3.5 transition-colors hover:border-border-strong hover:bg-accent/40 focus-visible:outline-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-info-soft text-info-fg">
            <a.icon className="size-4.5" strokeWidth={ICON_STROKE} aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium">{a.label}</span>
            <span className="block truncate text-xs text-muted-foreground">{a.hint}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

export function AppointmentsToday() {
  const { data, isLoading } = useQuery({ queryKey: ["queue", todayLocal(), "all"], queryFn: () => appointmentService.getQueue(todayLocal()), staleTime: STALE.live });
  const byDoctor = new Map<string, { name: string; dept: string; waiting: number; done: number; total: number }>();
  for (const a of data ?? []) {
    const e = byDoctor.get(a.doctorId) ?? { name: a.doctor.name, dept: a.doctor.departmentName, waiting: 0, done: 0, total: 0 };
    e.total++;
    if (a.status === "Checked in") e.waiting++;
    if (a.status === "Completed") e.done++;
    byDoctor.set(a.doctorId, e);
  }
  const rows = [...byDoctor.values()].sort((a, b) => b.waiting - a.waiting).slice(0, 10);
  return (
    <Panel title="Doctors in OPD today" description="Waiting patients per consultant" actions={<ViewAll href="/opd/queue" label="Queue board" />}>
      {isLoading ? (
        <PanelSkeleton lines={8} />
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-2 text-left font-medium">Doctor</th>
              <th className="px-3 py-2 text-right font-medium">Waiting</th>
              <th className="px-3 py-2 text-right font-medium">Seen</th>
              <th className="px-4 py-2 text-right font-medium">Booked</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.name}>
                <td className="px-4 py-2">
                  <span className="block text-[13px] font-medium">{r.name}</span>
                  <span className="block text-xs text-muted-foreground">{r.dept}</span>
                </td>
                <td className={cn("num px-3 py-2 text-right", r.waiting >= 4 && "font-semibold text-warning-fg")}>{r.waiting}</td>
                <td className="num px-3 py-2 text-right">{r.done}</td>
                <td className="num px-4 py-2 text-right">{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

/* ---------- Lab ---------- */

export function LabPipeline() {
  const { data, isLoading } = useQuery({ queryKey: ["lab-pipeline"], queryFn: () => labService.getPipeline(), staleTime: STALE.live, refetchInterval: 45_000 });
  const stages = ["Ordered", "Collected", "Processing", "Resulted"] as const;
  return (
    <Panel title="Sample pipeline" description="Open orders, STAT first" actions={<ViewAll href="/lab/samples" label="Tracking board" />}>
      {isLoading ? (
        <PanelSkeleton lines={6} />
      ) : (
        <>
          <div className="grid grid-cols-4 divide-x border-b">
            {stages.map((s) => (
              <div key={s} className="px-4 py-3">
                <p className="text-xs text-muted-foreground">{s}</p>
                <p className="text-xl font-semibold">{data!.filter((o) => o.status === s).length}</p>
              </div>
            ))}
          </div>
          <ul className="divide-y">
            {data!
              .filter((o) => o.status !== "Verified")
              .slice(0, 7)
              .map((o) => (
                <li key={o.id}>
                  <Link href={`/lab/orders/${o.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none">
                    <StatusBadge status={o.priority} className="w-16 justify-center" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{o.tests.map((t) => t.name).join(", ")}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {o.patient.fullName} · {o.location ?? o.source} · {o.sampleId}
                      </span>
                    </span>
                    <StatusBadge status={o.status} />
                  </Link>
                </li>
              ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

export function LabTatTrend() {
  const { data, isLoading } = useQuery({ queryKey: ["report-daily", 30], queryFn: () => reportService.getDaily(30) });
  const rows = (data ?? []).map((d) => ({ date: d.date, tat: d.labTatMedianMin }));
  return (
    <ChartCard title="Median turnaround time" description="Order to verified, minutes" loading={isLoading} table={{ columns: ["Date", "Median TAT (min)"], rows: rows.map((r) => [shortDate(r.date), r.tat]) }}>
      <TrendChart data={rows} x="date" xFormat={shortDate} format={(v) => `${Math.round(v)} min`} series={[{ key: "tat", label: "Median TAT", type: "area" }]} reference={{ y: 120, label: "Target 120 min" }} />
    </ChartCard>
  );
}

/* ---------- Pharmacy ---------- */

export function PendingPrescriptions() {
  const { data, isLoading } = useQuery({ queryKey: ["rx-queue", "pending-dash"], queryFn: () => pharmacyService.getQueue({ filters: { status: ["Pending", "Partially dispensed"] }, pageSize: 8 }), staleTime: STALE.live });
  return (
    <Panel title="Prescriptions to dispense" description={data ? `${data.total} waiting` : undefined} actions={<ViewAll href="/pharmacy/queue" label="Queue" />}>
      {isLoading ? (
        <PanelSkeleton lines={6} />
      ) : (
        <ul className="divide-y">
          {data!.rows.map((rx) => (
            <li key={rx.id}>
              <Link href={`/pharmacy/dispense/${rx.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none">
                <StatusBadge tone={rx.source === "ER" ? "critical" : rx.source === "IPD" ? "info" : "neutral"} className="w-11 justify-center">
                  {rx.source}
                </StatusBadge>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{rx.patient.fullName}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {rx.items.length} items · {rx.doctor.name} · {ago(rx.createdAt)}
                  </span>
                </span>
                {rx.items.some((i) => i.onHand < i.qty - i.dispensedQty) && <StatusBadge tone="warning">Stock short</StatusBadge>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function StockForecast() {
  const { data, isLoading } = useQuery({ queryKey: ["stock-forecast"], queryFn: () => aiService.getStockForecast(), staleTime: STALE.standard });
  return (
    <AiPanel title="Demand forecast, next 14 days" meta={data ? { confidence: 0.78, model: "medicore-clinical-assist (mock)", generatedAt: new Date().toISOString(), latencyMs: 0, sources: [{ label: "Dispensing, last 14 days" }, { label: "Seasonal fever pattern" }, { label: "Stock on hand" }] } : undefined}>
      {isLoading ? (
        <PanelSkeleton lines={6} />
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-2 text-left font-medium">Drug</th>
              <th className="px-3 py-2 text-right font-medium">On hand</th>
              <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Demand 14 d</th>
              <th className="px-3 py-2 text-right font-medium">Cover</th>
              <th className="px-4 py-2 text-right font-medium">Suggest</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data!.slice(0, 7).map((r) => (
              <tr key={r.drugId}>
                <td className="max-w-48 truncate px-4 py-2 text-[13px]">{r.drug}</td>
                <td className="num px-3 py-2 text-right">{number(r.onHand)}</td>
                <td className="num hidden px-3 py-2 text-right sm:table-cell">{number(r.forecast14d)}</td>
                <td className={cn("num px-3 py-2 text-right", r.daysOfCover < 3 && "font-semibold text-critical-fg")}>{r.daysOfCover >= 999 ? "-" : `${r.daysOfCover} d`}</td>
                <td className="num px-4 py-2 text-right font-medium">{number(r.suggestedOrder)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AiPanel>
  );
}

/* ---------- Billing ---------- */

export function CollectionsByMode() {
  const { data, isLoading } = useQuery({ queryKey: ["billing-stats"], queryFn: () => billingService.stats(), staleTime: STALE.live });
  const rows = Object.entries(data?.byMode ?? {}).map(([mode, value]) => ({ mode, value: Math.round(value) })).sort((a, b) => b.value - a.value);
  return (
    <ChartCard title="Collections today by mode" loading={isLoading} table={{ columns: ["Mode", "Amount"], rows: rows.map((r) => [r.mode, inr(r.value)]) }}>
      {rows.length ? <BarsChart data={rows} x="mode" format={inrCompact} series={[{ key: "value", label: "Collected" }]} height={220} /> : <EmptyState compact title="No collections yet today" />}
    </ChartCard>
  );
}

export function ClaimsAtRisk() {
  const { data: claims, isLoading } = useQuery({ queryKey: ["claims", "open-dash"], queryFn: () => billingService.getClaims({ filters: { open: "true" }, pageSize: 6 }), staleTime: STALE.standard });
  const ids = claims?.rows.map((c) => c.id) ?? [];
  const audits = useQuery({ queryKey: ["claim-audits", ids], queryFn: () => Promise.all(ids.map((id) => aiService.auditClaim(id))), enabled: ids.length > 0, staleTime: STALE.standard });
  const rows = (claims?.rows ?? []).map((c, i) => ({ c, a: audits.data?.[i] })).sort((x, y) => (y.a?.denialRisk ?? 0) - (x.a?.denialRisk ?? 0));
  return (
    <AiPanel title="Claims at risk of denial" meta={audits.data?.[0]?.meta}>
      {isLoading || audits.isLoading ? (
        <PanelSkeleton lines={6} />
      ) : (
        <ul className="divide-y">
          {rows.map(({ c, a }) => (
            <li key={c.id}>
              <Link href={`/billing/claims/${c.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">
                    {c.patient.fullName} <span className="font-normal text-muted-foreground">· {c.insurerName}</span>
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{a?.reasons[0]?.label ?? "No risk factors found"}</span>
                </span>
                <span className="num text-xs">{inrCompact(c.claimedAmount)}</span>
                {a && <StatusBadge tone={a.level === "Low" ? "stable" : a.level === "Moderate" ? "warning" : "critical"}>{Math.round(a.denialRisk * 100)}% risk</StatusBadge>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AiPanel>
  );
}

