"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HeartPulse, Maximize2, Megaphone, Minimize2, Stethoscope } from "lucide-react";
import type { AppointmentView } from "@/types";
import { appointmentService } from "@/services/appointmentService";
import { doctorService } from "@/services/doctorService";
import { KanbanBoard, type KanbanColumn } from "@/components/data/kanban";
import { EmptyState, PanelSkeleton } from "@/components/feedback/states";
import { StatusBadge } from "@/components/feedback/status-badge";
import { PageHeader } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { CheckInDialog } from "@/features/opd/check-in-dialog";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useListParams } from "@/hooks/use-list-params";
import { can, ROLE_PERSONA } from "@/lib/rbac";
import { ICON_STROKE, STALE } from "@/lib/constants";
import { todayLocal } from "@/lib/dates";
import { minutesLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

function QueueCard({ a, onCheckIn }: { a: AppointmentView; onCheckIn: (a: AppointmentView) => void }) {
  const qc = useQueryClient();
  const { role } = useCurrentUser();
  const call = useMutation({
    mutationFn: () => appointmentService.updateStatus(a.id, "In consultation"),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["queue"] });
      toast.success(`Calling token ${r.token}`, { description: `${r.patient.fullName} to ${r.doctor.name}'s room` });
    },
  });
  const noShow = useMutation({
    mutationFn: () => appointmentService.updateStatus(a.id, "No show"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["queue"] }),
  });
  const longWait = (a.waitMinutes ?? 0) >= 45;
  return (
    <article className={cn("rounded-lg border bg-card p-3 shadow-[var(--shadow-raise)]", a.status === "In consultation" && "border-stable/50", longWait && "border-warning/60")}>
      <div className="flex items-start gap-3">
        <span className={cn("num flex size-11 shrink-0 items-center justify-center rounded-lg text-lg font-semibold", a.token ? "bg-info-soft text-info-fg" : "bg-muted text-muted-foreground")} aria-label={a.token ? `Token ${a.token}` : "No token yet"}>
          {a.token ?? a.time}
        </span>
        <div className="min-w-0 flex-1">
          <Link href={`/patients/${a.patientId}`} className="block truncate text-sm font-medium hover:underline">
            {a.patient.fullName}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {a.patient.ageLabel} {a.patient.gender[0]} · {a.type} · {a.time}
          </p>
          <p className="mt-0.5 line-clamp-1 text-xs">{a.reason}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {a.patient.allergies.length > 0 && <StatusBadge tone="critical">Allergy</StatusBadge>}
        {a.vitals ? (
          <StatusBadge tone="stable">
            <HeartPulse className="size-3" /> Vitals
          </StatusBadge>
        ) : (
          a.status !== "Scheduled" && <StatusBadge tone="neutral">No vitals</StatusBadge>
        )}
        {a.status === "Checked in" && a.waitMinutes !== undefined && <StatusBadge tone={longWait ? "warning" : "neutral"}>Waiting {minutesLabel(a.waitMinutes)}</StatusBadge>}
        {a.patient.paymentCategory !== "Self-pay" && <StatusBadge tone="info">{a.patient.paymentCategory}</StatusBadge>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {a.status === "Scheduled" && can(role, "appointment.book") && (
          <>
            <Button size="sm" className="h-9 flex-1" onClick={() => onCheckIn(a)}>
              Check in
            </Button>
            <Button size="sm" variant="ghost" className="h-9" onClick={() => noShow.mutate()}>
              No-show
            </Button>
          </>
        )}
        {a.status === "Checked in" && (
          <>
            <Button size="sm" variant="outline" className="h-9 flex-1" onClick={() => call.mutate()} disabled={call.isPending}>
              <Megaphone /> Call in
            </Button>
            {can(role, "consult.write") && (
              <Button size="sm" className="h-9 flex-1" render={<Link href={`/opd/consult/${a.id}`} />} nativeButton={false}>
                <Stethoscope /> Consult
              </Button>
            )}
          </>
        )}
        {a.status === "In consultation" && can(role, "consult.write") && (
          <Button size="sm" className="h-9 flex-1" render={<Link href={`/opd/consult/${a.id}`} />} nativeButton={false}>
            Continue consultation
          </Button>
        )}
      </div>
    </article>
  );
}

function NowServing({ rows }: { rows: AppointmentView[] }) {
  const byDoctor = new Map<string, { doctor: AppointmentView["doctor"]; current?: AppointmentView; next: AppointmentView[] }>();
  for (const a of rows) {
    const e = byDoctor.get(a.doctorId) ?? { doctor: a.doctor, next: [] };
    if (a.status === "In consultation") e.current = a;
    if (a.status === "Checked in") e.next.push(a);
    byDoctor.set(a.doctorId, e);
  }
  const list = [...byDoctor.values()].filter((e) => e.current || e.next.length);
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-live="polite">
      {list.map((e) => (
        <div key={e.doctor.id} className="rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">{e.doctor.departmentName}</p>
          <p className="text-lg font-semibold">{e.doctor.name}</p>
          <div className="mt-4 flex items-end justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Now serving</p>
              <p className="num text-5xl font-semibold text-primary">{e.current?.token ?? "-"}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Next</p>
              <p className="num text-2xl font-medium">{e.next.slice(0, 3).map((n) => n.token).join("  ") || "-"}</p>
            </div>
          </div>
        </div>
      ))}
      {!list.length && <EmptyState title="No active queues" />}
    </div>
  );
}

export default function QueuePage() {
  const { role } = useCurrentUser();
  const lp = useListParams({ ignore: ["doctor", "display"] });
  const defaultDoctor = role === "Doctor" ? ROLE_PERSONA.Doctor.doctorId : undefined;
  const doctorId = lp.get("doctor") ?? defaultDoctor ?? "";
  const display = lp.get("display") === "1";
  const [checkIn, setCheckIn] = useState<AppointmentView>();
  const today = todayLocal();
  const doctors = useQuery({ queryKey: ["doctors-all"], queryFn: () => doctorService.listAll(), staleTime: 60_000 });
  const q = useQuery({ queryKey: ["queue", today, doctorId || "all"], queryFn: () => appointmentService.getQueue(today, doctorId || undefined), staleTime: STALE.live, refetchInterval: 20_000 });
  const rows = q.data ?? [];
  const opdDoctors = (doctors.data ?? []).filter((d) => d.opdToday > 0);

  const columns: KanbanColumn<AppointmentView>[] = [
    { id: "scheduled", title: "Yet to arrive", tone: "neutral", items: rows.filter((a) => a.status === "Scheduled").sort((a, b) => a.time.localeCompare(b.time)), empty: "Everyone booked has arrived" },
    { id: "waiting", title: "Waiting", tone: "warning", items: rows.filter((a) => a.status === "Checked in"), hint: "In token order", empty: "No one waiting" },
    { id: "consult", title: "With doctor", tone: "stable", items: rows.filter((a) => a.status === "In consultation"), empty: "No consultation in progress" },
    { id: "done", title: "Seen", tone: "neutral", items: rows.filter((a) => a.status === "Completed" || a.status === "No show").reverse(), empty: "No completed visits yet" },
  ];

  return (
    <div className={cn(display && "fixed inset-0 z-[var(--z-overlay)] overflow-auto bg-background p-6")}>
      <PageHeader
        title={display ? "Now serving" : "OPD queue"}
        description={display ? undefined : "Live token board. Refreshes every 20 seconds."}
        actions={
          <>
            <label className="flex items-center gap-2 text-sm">
              <span className="sr-only">Doctor</span>
              <select
                value={doctorId}
                onChange={(e) => lp.set({ doctor: e.target.value || undefined }, false)}
                className="h-9 max-w-64 rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring"
              >
                <option value="">All doctors ({opdDoctors.length} in OPD)</option>
                {opdDoctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} · {d.departmentName}
                  </option>
                ))}
              </select>
            </label>
            <Button variant="outline" onClick={() => lp.set({ display: display ? undefined : "1" }, false)}>
              {display ? <Minimize2 strokeWidth={ICON_STROKE} /> : <Maximize2 strokeWidth={ICON_STROKE} />}
              {display ? "Exit display" : "TV display"}
            </Button>
          </>
        }
      />
      {q.isLoading ? (
        <PanelSkeleton lines={10} className="rounded-xl border" />
      ) : display ? (
        <NowServing rows={rows} />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
            <span>
              <span className="font-semibold text-foreground">{columns[1].items.length}</span> waiting
            </span>
            <span>
              <span className="font-semibold text-foreground">{columns[3].items.filter((a) => a.status === "Completed").length}</span> seen
            </span>
            <span>
              Longest wait <span className="font-semibold text-foreground">{minutesLabel(Math.max(0, ...columns[1].items.map((a) => a.waitMinutes ?? 0)))}</span>
            </span>
          </div>
          <KanbanBoard label="OPD queue" columns={columns} getKey={(a) => a.id} renderCard={(a) => <QueueCard a={a} onCheckIn={setCheckIn} />} minColumnWidth={300} />
        </>
      )}
      {checkIn && <CheckInDialog appt={checkIn} onClose={() => setCheckIn(undefined)} />}
    </div>
  );
}
