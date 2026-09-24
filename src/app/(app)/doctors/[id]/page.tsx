"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { CalendarPlus, Mail, Phone, Star } from "lucide-react";
import type { Weekday } from "@/types";
import { appointmentService } from "@/services/appointmentService";
import { doctorService } from "@/services/doctorService";
import { reportService } from "@/services/reportService";
import { EmptyState, ErrorState, PanelSkeleton } from "@/components/feedback/states";
import { StatusBadge } from "@/components/feedback/status-badge";
import { Field, PageHeader, Panel } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-current-user";
import { canAccess } from "@/lib/rbac";
import { ICON_STROKE } from "@/lib/constants";
import { date, inr, minutesLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const WEEK: Weekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function DoctorProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { role } = useCurrentUser();
  const q = useQuery({ queryKey: ["doctor", id], queryFn: () => doctorService.getById(id) });
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(new Date(), i)), []);
  const [dayIdx, setDayIdx] = useState(0);
  const dayStr = format(days[dayIdx], "yyyy-MM-dd");
  const slots = useQuery({ queryKey: ["slots", id, dayStr], queryFn: () => doctorService.getSlots(id, dayStr) });
  const perf = useQuery({ queryKey: ["doctor-performance"], queryFn: () => reportService.getDoctorPerformance() });
  const upcoming = useQuery({ queryKey: ["appointments", { doctorId: id, upcoming: true }], queryFn: () => appointmentService.getAll({ filters: { doctorId: id, status: ["Scheduled", "Checked in"] }, dateFrom: format(new Date(), "yyyy-MM-dd"), sort: [{ id: "date", desc: false }], pageSize: 6 }) });

  if (q.isLoading) return <PanelSkeleton lines={10} className="rounded-xl border" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const mine = perf.data?.find((x) => x.doctorId === id);
  const canBook = canAccess(role, "/opd/appointments");

  return (
    <div className="space-y-4">
      <PageHeader
        title={d.name}
        description={`${d.designation}, ${d.departmentName} · ${d.qualifications}`}
        breadcrumbs={[{ label: "Doctors", href: "/doctors" }, { label: d.name }]}
        meta={
          <>
            <StatusBadge status={d.status} />
            <span>{d.registrationNo}</span>
            <span>{d.experienceYears} years experience</span>
            <span className="flex items-center gap-1">
              <Star className="size-3.5 text-warning" aria-hidden /> {d.rating}
            </span>
          </>
        }
        actions={
          canBook && d.sessions.length > 0 && (
            <Button render={<Link href={`/opd/appointments?book=1&doctor=${d.id}`} />} nativeButton={false}>
              <CalendarPlus /> Book appointment
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "OPD today", value: d.opdToday },
          { label: "Inpatients", value: d.inpatients },
          { label: "Consultation fee", value: inr(d.consultationFee), sub: `Follow-up ${inr(d.followUpFee)}` },
          { label: "Consults (14 days)", value: mine?.consults ?? "-", sub: mine ? `${mine.noShowRate}% no-show · avg wait ${minutesLabel(mine.avgWaitMin)}` : undefined },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{k.value}</p>
            {k.sub && <p className="mt-0.5 text-xs text-muted-foreground">{k.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Panel title="Availability" description={`${d.slotMinutes}-minute slots`}>
            <div role="tablist" aria-label="Day" className="flex gap-1 overflow-x-auto border-b px-3 py-2 scrollbar-thin">
              {days.map((day, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={i === dayIdx}
                  onClick={() => setDayIdx(i)}
                  className={cn("flex min-w-14 flex-col items-center rounded-lg px-2.5 py-1.5 text-xs hover:bg-accent focus-visible:outline-2", i === dayIdx && "bg-info-soft text-info-fg")}
                >
                  <span className="font-medium">{i === 0 ? "Today" : format(day, "EEE")}</span>
                  <span className="num text-muted-foreground">{format(day, "d MMM")}</span>
                </button>
              ))}
            </div>
            {slots.isLoading ? (
              <PanelSkeleton lines={3} />
            ) : !slots.data?.length ? (
              <EmptyState compact title="No OPD session" description="The doctor does not hold OPD on this day." />
            ) : (
              <div className="grid grid-cols-4 gap-1.5 p-3 sm:grid-cols-6 lg:grid-cols-8">
                {slots.data.map((s) =>
                  s.available && canBook ? (
                    <Link key={s.time} href={`/opd/appointments?book=1&doctor=${d.id}&date=${dayStr}&time=${s.time}`} className="num flex h-8 items-center justify-center rounded-lg border bg-card text-xs hover:border-primary hover:bg-info-soft focus-visible:outline-2" aria-label={`Book ${s.time}`}>
                      {s.time}
                    </Link>
                  ) : (
                    <span key={s.time} className={cn("num flex h-8 items-center justify-center rounded-lg text-xs", s.available ? "border bg-card" : "bg-muted text-subtle-foreground line-through")} aria-label={`${s.time} ${s.available ? "available" : "booked"}`}>
                      {s.time}
                    </span>
                  ),
                )}
              </div>
            )}
            {slots.data && slots.data.length > 0 && (
              <p className="border-t px-4 py-2 text-xs text-muted-foreground">
                {slots.data.filter((s) => s.available).length} of {slots.data.length} slots open
              </p>
            )}
          </Panel>

          <Panel title="Weekly OPD schedule">
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {WEEK.map((day) => {
                  const s = d.sessions.find((x) => x.day === day);
                  return (
                    <tr key={day}>
                      <th scope="row" className="w-24 px-4 py-2 text-left text-[13px] font-medium">
                        {day}
                      </th>
                      <td className="num px-4 py-2 text-[13px]">{s ? `${s.start} to ${s.end}` : <span className="text-muted-foreground">No OPD</span>}</td>
                      <td className="px-4 py-2 text-right text-xs text-muted-foreground">{s ? `Room ${s.room}` : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Profile">
            <div className="space-y-3 p-4 text-sm">
              <p className="leading-relaxed text-muted-foreground">{d.bio}</p>
              <div className="flex flex-wrap gap-1.5">
                {d.specialInterests.map((s) => (
                  <StatusBadge key={s} tone="info">
                    {s}
                  </StatusBadge>
                ))}
              </div>
              <dl className="grid grid-cols-2 gap-3 pt-1">
                <Field label="Languages">{d.languages.join(", ")}</Field>
                <Field label="Joined">{date(d.joinedAt)}</Field>
                <Field label="Phone">
                  <a className="inline-flex items-center gap-1 hover:underline" href={`tel:${d.phone.replace(/\s/g, "")}`}>
                    <Phone className="size-3" strokeWidth={ICON_STROKE} />
                    {d.phone}
                  </a>
                </Field>
                <Field label="Email">
                  <a className="inline-flex items-center gap-1 hover:underline" href={`mailto:${d.email}`}>
                    <Mail className="size-3" strokeWidth={ICON_STROKE} />
                    {d.email}
                  </a>
                </Field>
              </dl>
            </div>
          </Panel>
          <Panel title="Upcoming appointments">
            {upcoming.isLoading ? (
              <PanelSkeleton lines={4} />
            ) : !upcoming.data?.rows.length ? (
              <EmptyState compact title="Nothing upcoming" />
            ) : (
              <ul className="divide-y">
                {upcoming.data.rows.map((a) => (
                  <li key={a.id}>
                    <Link href={`/patients/${a.patientId}`} className="flex items-center gap-3 px-4 py-2 hover:bg-accent/40">
                      <span className="num w-20 shrink-0 text-xs text-muted-foreground">
                        {date(a.date, "d MMM")} {a.time}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px]">{a.patient.fullName}</span>
                      <StatusBadge status={a.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
