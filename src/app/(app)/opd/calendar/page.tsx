"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { addDays, format, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { AppointmentView, DoctorView, OpdSession, Weekday } from "@/types";
import { appointmentService } from "@/services/appointmentService";
import { doctorService } from "@/services/doctorService";
import { Segmented } from "@/components/data/filters";
import { EmptyState, PanelSkeleton } from "@/components/feedback/states";
import { statusTone } from "@/components/feedback/status-badge";
import { PageHeader } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useListParams } from "@/hooks/use-list-params";
import { can, ROLE_PERSONA } from "@/lib/rbac";
import { todayLocal } from "@/lib/dates";
import { cn } from "@/lib/utils";

const ROW_PX = 22; // per 15 minutes
const WEEK: Weekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const wdOf = (d: string) => format(new Date(`${d}T00:00:00`), "EEE") as Weekday;

const TONE_BG: Record<string, string> = {
  critical: "bg-critical-soft border-critical/40 text-critical-fg",
  warning: "bg-warning-soft border-warning/50 text-warning-fg",
  stable: "bg-stable-soft border-stable/40 text-stable-fg",
  info: "bg-info-soft border-info/40 text-info-fg",
  neutral: "bg-card border-border-strong text-foreground",
};

function Column({ title, subtitle, session, appts, start, end, bookHref }: { title: string; subtitle?: string; session?: OpdSession; appts: AppointmentView[]; start: number; end: number; bookHref?: (time: string) => string }) {
  const height = ((end - start) / 15) * ROW_PX;
  const slots = session ? Array.from({ length: (toMin(session.end) - toMin(session.start)) / 15 }, (_, i) => toMin(session.start) + i * 15) : [];
  return (
    <div className="min-w-[168px] flex-1 border-l">
      <div className="sticky top-0 z-[var(--z-sticky)] h-14 border-b bg-card px-2 py-1.5">
        <p className="truncate text-[13px] font-medium">{title}</p>
        <p className="truncate text-[11px] text-muted-foreground">{subtitle ?? (session ? `${session.start} to ${session.end} · ${session.room}` : "No OPD")}</p>
      </div>
      <div className="relative" style={{ height }}>
        {session && <div aria-hidden className="absolute inset-x-0 bg-info-soft/30" style={{ top: ((toMin(session.start) - start) / 15) * ROW_PX, height: ((toMin(session.end) - toMin(session.start)) / 15) * ROW_PX }} />}
        {bookHref &&
          slots
            .filter((m) => !appts.some((a) => toMin(a.time) <= m && m < toMin(a.time) + a.durationMin))
            .map((m) => (
              <Link key={m} href={bookHref(fmt(m))} aria-label={`Book ${fmt(m)}`} className="absolute inset-x-1 rounded-md text-[10px] text-transparent hover:bg-accent hover:text-muted-foreground focus-visible:text-muted-foreground focus-visible:outline-2" style={{ top: ((m - start) / 15) * ROW_PX + 1, height: ROW_PX - 2 }}>
                <span className="px-1.5">+ {fmt(m)}</span>
              </Link>
            ))}
        {appts.map((a) => {
          const top = ((toMin(a.time) - start) / 15) * ROW_PX;
          const h = Math.max(ROW_PX - 2, (a.durationMin / 15) * ROW_PX - 2);
          const tone = statusTone(a.status);
          return (
            <Link
              key={a.id}
              href={a.status === "Checked in" || a.status === "In consultation" ? `/opd/consult/${a.id}` : `/patients/${a.patientId}`}
              className={cn("absolute inset-x-1 overflow-hidden rounded-md border px-1.5 py-0.5 text-[11px] leading-tight hover:brightness-95 focus-visible:outline-2", TONE_BG[tone], a.status === "Cancelled" && "line-through opacity-60")}
              style={{ top: top + 1, height: h }}
              title={`${a.time} ${a.patient.fullName} (${a.status})`}
            >
              <span className="num font-medium">{a.time}</span> <span className="font-medium">{a.patient.fullName}</span>
              {h > 30 && <span className="block truncate opacity-80">{a.status} · {a.reason}</span>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const { role } = useCurrentUser();
  const lp = useListParams({ ignore: ["day", "dept", "doctor", "view"] });
  const dateStr = lp.get("day") ?? todayLocal();
  const view = (lp.get("view") as "day" | "week") ?? "day";
  const doctors = useQuery({ queryKey: ["doctors-all"], queryFn: () => doctorService.listAll(), staleTime: 60_000 });
  const depts = useQuery({ queryKey: ["departments"], queryFn: () => doctorService.getDepartments(), staleTime: Infinity });
  const opdDoctors = (doctors.data ?? []).filter((d) => d.sessions.length);
  const defaultDoc = role === "Doctor" ? ROLE_PERSONA.Doctor.doctorId : opdDoctors[0]?.id;
  const deptId = lp.get("dept") ?? "DEP-GM";
  const doctorId = lp.get("doctor") ?? defaultDoc ?? "";
  const weekStart = startOfWeek(new Date(`${dateStr}T00:00:00`), { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => format(addDays(weekStart, i), "yyyy-MM-dd"));

  const range = view === "day" ? { dateFrom: dateStr, dateTo: dateStr } : { dateFrom: weekDays[0], dateTo: weekDays[6] };
  const filters = view === "day" ? { departmentId: deptId } : { doctorId };
  const appts = useQuery({
    queryKey: ["appointments", "calendar", view, range, filters],
    queryFn: () => appointmentService.getAll({ ...range, filters, pageSize: 500, sort: [{ id: "date", desc: false }] }),
    enabled: view === "day" || Boolean(doctorId),
  });

  const dayDoctors = opdDoctors.filter((d) => d.departmentId === deptId);
  const doc = opdDoctors.find((d) => d.id === doctorId);
  const sessions: OpdSession[] = view === "day" ? dayDoctors.flatMap((d) => d.sessions.filter((s) => s.day === wdOf(dateStr))) : (doc?.sessions ?? []);
  const start = sessions.length ? Math.min(...sessions.map((s) => toMin(s.start))) : 9 * 60;
  const end = sessions.length ? Math.max(...sessions.map((s) => toMin(s.end))) : 13 * 60;
  const hours = Array.from({ length: Math.ceil((end - start) / 60) }, (_, i) => start + i * 60);

  const shift = (days: number) => lp.set({ day: format(addDays(new Date(`${dateStr}T00:00:00`), days), "yyyy-MM-dd") }, false);
  const canBook = can(role, "appointment.book");
  const bookHref = (d: DoctorView, day: string) => (canBook ? (t: string) => `/opd/appointments?book=1&doctor=${d.id}&date=${day}&time=${t}` : undefined);
  const rows = appts.data?.rows ?? [];

  return (
    <>
      <PageHeader
        title="Doctor calendar"
        description={view === "day" ? format(new Date(`${dateStr}T00:00:00`), "EEEE, d MMMM yyyy") : `Week of ${format(weekStart, "d MMM yyyy")}`}
        actions={
          <>
            <Segmented label="View" value={view} onChange={(v) => lp.set({ view: v === "day" ? undefined : v }, false)} options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }]} />
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" onClick={() => shift(view === "day" ? -1 : -7)} aria-label="Previous">
                <ChevronLeft />
              </Button>
              <Button variant="outline" onClick={() => lp.set({ day: undefined }, false)}>
                Today
              </Button>
              <Button variant="outline" size="icon" onClick={() => shift(view === "day" ? 1 : 7)} aria-label="Next">
                <ChevronRight />
              </Button>
            </div>
            {view === "day" ? (
              <select aria-label="Department" value={deptId} onChange={(e) => lp.set({ dept: e.target.value }, false)} className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring">
                {(depts.data ?? []).filter((d) => opdDoctors.some((x) => x.departmentId === d.id)).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            ) : (
              <select aria-label="Doctor" value={doctorId} onChange={(e) => lp.set({ doctor: e.target.value }, false)} className="h-9 max-w-60 rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring">
                {opdDoctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
          </>
        }
      />
      <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted-foreground" aria-label="Legend">
        {["Scheduled", "Checked in", "In consultation", "Completed", "No show"].map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span aria-hidden className={cn("size-3 rounded border", TONE_BG[statusTone(s)])} />
            {s}
          </span>
        ))}
        {canBook && <span>· Click an empty slot to book</span>}
      </div>
      {appts.isLoading || doctors.isLoading ? (
        <PanelSkeleton lines={14} className="rounded-xl border" />
      ) : view === "day" && dayDoctors.length === 0 ? (
        <EmptyState title="No OPD doctors in this department" />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="flex max-h-[calc(100dvh-240px)] overflow-auto scrollbar-thin">
            <div className="sticky left-0 z-[var(--z-sticky)] w-14 shrink-0 bg-card">
              <div className="h-14 border-b" />
              <div className="relative" style={{ height: ((end - start) / 15) * ROW_PX }}>
                {hours.map((h) => (
                  <span key={h} className="num absolute right-2 -translate-y-1/2 text-[11px] text-muted-foreground" style={{ top: ((h - start) / 15) * ROW_PX }}>
                    {fmt(h)}
                  </span>
                ))}
              </div>
            </div>
            <div className="relative flex min-w-0 flex-1">
              <div aria-hidden className="pointer-events-none absolute inset-x-0 top-14 bottom-0">
                {hours.map((h) => (
                  <div key={h} className="absolute inset-x-0 border-t" style={{ top: ((h - start) / 15) * ROW_PX }} />
                ))}
              </div>
              {view === "day"
                ? dayDoctors.map((d) => (
                    <Column key={d.id} title={d.name} session={d.sessions.find((s) => s.day === wdOf(dateStr))} appts={rows.filter((a) => a.doctorId === d.id && a.date === dateStr)} start={start} end={end} bookHref={bookHref(d, dateStr)} />
                  ))
                : doc &&
                  weekDays.map((day, i) => (
                    <Column key={day} title={`${WEEK[i]} ${format(new Date(`${day}T00:00:00`), "d MMM")}`} session={doc.sessions.find((s) => s.day === WEEK[i])} appts={rows.filter((a) => a.date === day)} start={start} end={end} bookHref={bookHref(doc, day)} />
                  ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
