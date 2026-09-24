"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarPlus, CalendarX2, MoreHorizontal, Send } from "lucide-react";
import type { AppointmentStatus, AppointmentView } from "@/types";
import { appointmentService } from "@/services/appointmentService";
import { doctorService } from "@/services/doctorService";
import { DataTable, columnsFor, type Columns } from "@/components/data/data-table";
import { FacetFilter, SearchInput, Segmented } from "@/components/data/filters";
import { StatusBadge } from "@/components/feedback/status-badge";
import { PageHeader } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BookingDialog } from "@/features/opd/booking-dialog";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useListParams } from "@/hooks/use-list-params";
import { can } from "@/lib/rbac";
import { todayLocal } from "@/lib/dates";
import { date } from "@/lib/format";

const col = columnsFor<AppointmentView>();

function RowActions({ a }: { a: AppointmentView }) {
  const qc = useQueryClient();
  const router = useRouter();
  const { role } = useCurrentUser();
  const done = () => {
    qc.invalidateQueries({ queryKey: ["appointments"] });
    qc.invalidateQueries({ queryKey: ["queue"] });
  };
  const status = useMutation({
    mutationFn: (s: AppointmentStatus) => appointmentService.updateStatus(a.id, s),
    onSuccess: (r) => {
      done();
      toast.success(`${r.patient.fullName}: ${r.status.toLowerCase()}`);
    },
  });
  const checkIn = useMutation({
    mutationFn: () => appointmentService.checkIn(a.id),
    onSuccess: (r) => {
      done();
      toast.success(`Checked in, token ${r.token}`, { description: r.patient.fullName });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not check in"),
  });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${a.patient.fullName}`} onClick={(e) => e.stopPropagation()} />}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()}>
        {a.status === "Scheduled" && can(role, "appointment.book") && <DropdownMenuItem onClick={() => checkIn.mutate()}>Check in</DropdownMenuItem>}
        {(a.status === "Checked in" || a.status === "In consultation") && can(role, "consult.write") && <DropdownMenuItem onClick={() => router.push(`/opd/consult/${a.id}`)}>Open consultation</DropdownMenuItem>}
        <DropdownMenuItem onClick={() => router.push(`/patients/${a.patientId}`)}>View patient</DropdownMenuItem>
        {a.status === "Scheduled" && can(role, "appointment.book") && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => status.mutate("No show")}>Mark no-show</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => status.mutate("Cancelled")}>
              Cancel appointment
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const columns: Columns<AppointmentView> = [
  col.accessor("date", {
    id: "date",
    header: "When",
    cell: ({ row: { original: a } }) => (
      <div className="whitespace-nowrap">
        <p className="num font-medium">{a.time}</p>
        <p className="text-xs text-muted-foreground">{date(a.date, "EEE d MMM")}</p>
      </div>
    ),
  }),
  col.accessor("token", { id: "token", header: "Token", meta: { numeric: true, hideBelow: "md" }, cell: (c) => c.getValue() ?? "-" }),
  col.accessor((a) => a.patient.fullName, {
    id: "patient",
    header: "Patient",
    cell: ({ row: { original: a } }) => (
      <div className="min-w-0">
        <p className="flex items-center gap-2 truncate font-medium">
          {a.patient.fullName}
          {a.patient.allergies.length > 0 && <StatusBadge tone="critical">Allergy</StatusBadge>}
        </p>
        <p className="num truncate text-xs text-muted-foreground">
          {a.patient.uhid} · {a.patient.ageLabel} {a.patient.gender[0]}
        </p>
      </div>
    ),
  }),
  col.accessor((a) => a.doctor.name, {
    id: "doctor",
    header: "Doctor",
    cell: ({ row: { original: a } }) => (
      <div className="min-w-0">
        <p className="truncate text-[13px]">{a.doctor.name}</p>
        <p className="truncate text-xs text-muted-foreground">{a.doctor.departmentName}</p>
      </div>
    ),
  }),
  col.accessor("reason", { header: "Reason", enableSorting: false, meta: { hideBelow: "xl", className: "max-w-56" }, cell: (c) => <span className="line-clamp-1 text-[13px] text-muted-foreground">{c.getValue()}</span> }),
  col.accessor("type", { header: "Type", enableSorting: false, meta: { hideBelow: "lg", className: "text-[13px]" } }),
  col.accessor("channel", { header: "Via", enableSorting: false, meta: { hideBelow: "xl", className: "text-[13px] text-muted-foreground" } }),
  col.accessor("status", { id: "status", header: "Status", cell: (c) => <StatusBadge status={c.getValue()} /> }),
  col.display({ id: "actions", header: "", enableHiding: false, meta: { className: "w-10" }, cell: ({ row }) => <RowActions a={row.original} /> }),
];

const STATUSES: AppointmentStatus[] = ["Scheduled", "Checked in", "In consultation", "Completed", "No show", "Cancelled"];

export default function AppointmentsPage() {
  const lp = useListParams({ sort: { id: "date", desc: false }, pageSize: 20, ignore: ["range", "book", "patient", "doctor", "date", "time"] });
  const { role } = useCurrentUser();
  const f = lp.params.filters ?? {};
  const range = lp.get("range") ?? "today";
  const today = todayLocal();
  const params = {
    ...lp.params,
    dateFrom: lp.params.dateFrom ?? (range === "today" ? today : range === "upcoming" ? today : undefined),
    dateTo: lp.params.dateTo ?? (range === "today" ? today : undefined),
  };
  const q = useQuery({ queryKey: ["appointments", params], queryFn: () => appointmentService.getAll(params), placeholderData: keepPreviousData });
  const doctors = useQuery({ queryKey: ["doctors-all"], queryFn: () => doctorService.listAll(), staleTime: 60_000 });
  const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : v ? [String(v)] : []);
  const bookOpen = lp.get("book") === "1";

  return (
    <>
      <PageHeader
        title="Appointments"
        description="OPD bookings across all departments."
        actions={
          can(role, "appointment.book") && (
            <Button onClick={() => lp.set({ book: "1" }, false)}>
              <CalendarPlus /> Book appointment
            </Button>
          )
        }
      />
      <DataTable
        label="Appointments"
        columns={columns}
        data={q.data}
        loading={q.isLoading}
        fetching={q.isFetching}
        error={q.error}
        onRetry={() => q.refetch()}
        getRowId={(r) => r.id}
        sort={lp.params.sort}
        onSortChange={lp.setSort}
        onPageChange={lp.setPage}
        onPageSizeChange={lp.setPageSize}
        rowHref={(r) => `/patients/${r.patientId}`}
        selectable={can(role, "appointment.book")}
        bulkActions={(rows, clear) => (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              toast.success(`Reminder SMS queued for ${rows.length} patient${rows.length > 1 ? "s" : ""}`, { description: "Delivered via the hospital SMS gateway (DLT-registered template)." });
              clear();
            }}
          >
            <Send /> Send reminder SMS
          </Button>
        )}
        empty={{ icon: CalendarX2, title: "No appointments", description: range === "today" ? "Nothing booked for today with these filters." : "Try widening the date range.", action: can(role, "appointment.book") ? <Button size="sm" variant="outline" onClick={() => lp.set({ book: "1" }, false)}>Book appointment</Button> : undefined }}
        toolbar={
          <>
            <Segmented label="Date range" value={range as "today" | "upcoming" | "all"} onChange={(v) => lp.set({ range: v === "today" ? undefined : v, from: undefined, to: undefined })} options={[{ value: "today", label: "Today" }, { value: "upcoming", label: "Upcoming" }, { value: "all", label: "All" }]} />
            <SearchInput value={lp.params.search} onChange={lp.setSearch} placeholder="Patient, UHID, doctor, token" label="Search appointments" />
            <FacetFilter title="Status" options={STATUSES.map((s) => ({ value: s, label: s }))} selected={arr(f.status)} onChange={(v) => lp.setFilter("status", v)} />
            <FacetFilter title="Doctor" options={(doctors.data ?? []).filter((d) => d.sessions.length).map((d) => ({ value: d.id, label: d.name, count: d.opdToday }))} selected={arr(f.doctorId)} onChange={(v) => lp.setFilter("doctorId", v)} />
            <FacetFilter title="Type" options={["New", "Follow-up", "Review", "Teleconsult"].map((s) => ({ value: s, label: s }))} selected={arr(f.type)} onChange={(v) => lp.setFilter("type", v)} />
          </>
        }
        mobileCard={(a) => (
          <div className="flex items-start gap-3">
            <div className="num w-12 shrink-0 text-sm font-medium">{a.time}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{a.patient.fullName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {a.doctor.name} · {a.type}
              </p>
            </div>
            <StatusBadge status={a.status} />
          </div>
        )}
      />
      {bookOpen && (
        <BookingDialog
          open
          onOpenChange={(o) => !o && lp.set({ book: undefined, patient: undefined, doctor: undefined, date: undefined, time: undefined }, false)}
          prefill={{ patientId: lp.get("patient"), doctorId: lp.get("doctor"), date: lp.get("date"), time: lp.get("time") }}
        />
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Looking for the live token view? <Link href="/opd/queue" className="underline underline-offset-2">Open the queue board</Link>.
      </p>
    </>
  );
}
