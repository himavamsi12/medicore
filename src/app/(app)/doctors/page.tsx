"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Stethoscope } from "lucide-react";
import type { DoctorView, Weekday } from "@/types";
import { doctorService } from "@/services/doctorService";
import { DataTable, columnsFor, type Columns } from "@/components/data/data-table";
import { FacetFilter, SearchInput } from "@/components/data/filters";
import { StatusBadge } from "@/components/feedback/status-badge";
import { PageHeader } from "@/components/layout/page";
import { useListParams } from "@/hooks/use-list-params";
import { inr } from "@/lib/format";
import { SessionDays } from "@/features/doctors/session-days";

const DAYS: Weekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const col = columnsFor<DoctorView>();

const columns: Columns<DoctorView> = [
  col.accessor("name", {
    id: "name",
    header: "Doctor",
    cell: ({ row: { original: d } }) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{d.name}</p>
        <p className="truncate text-xs text-muted-foreground">{d.designation}</p>
      </div>
    ),
  }),
  col.accessor("departmentName", { id: "departmentName", header: "Department", meta: { className: "text-[13px]" } }),
  col.accessor("qualifications", { header: "Qualifications", enableSorting: false, meta: { hideBelow: "xl", className: "max-w-64 text-xs text-muted-foreground" }, cell: (c) => <span className="line-clamp-1">{c.getValue()}</span> }),
  col.display({ id: "days", header: "OPD days", meta: { hideBelow: "lg" }, cell: ({ row }) => <SessionDays doctor={row.original} /> }),
  col.accessor("status", { header: "Now", enableSorting: false, cell: (c) => <StatusBadge status={c.getValue()} /> }),
  col.accessor("opdToday", { id: "opdToday", header: "OPD today", meta: { numeric: true } }),
  col.accessor("inpatients", { id: "inpatients", header: "Inpatients", meta: { numeric: true, hideBelow: "md" } }),
  col.accessor("experienceYears", { id: "experienceYears", header: "Exp.", meta: { numeric: true, hideBelow: "lg" }, cell: (c) => `${c.getValue()} y` }),
  col.accessor("consultationFee", { id: "consultationFee", header: "Fee", meta: { numeric: true, hideBelow: "md" }, cell: (c) => inr(c.getValue()) }),
];

export default function DoctorsPage() {
  const lp = useListParams({ sort: { id: "departmentName", desc: false }, pageSize: 50 });
  const q = useQuery({ queryKey: ["doctors", lp.params], queryFn: () => doctorService.getAll(lp.params), placeholderData: keepPreviousData });
  const depts = useQuery({ queryKey: ["departments"], queryFn: () => doctorService.getDepartments(), staleTime: Infinity });
  const f = lp.params.filters ?? {};
  const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : v ? [String(v)] : []);
  return (
    <>
      <PageHeader title="Doctors" description="Consultants, OPD sessions and live availability." />
      <DataTable
        label="Doctors"
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
        rowHref={(r) => `/doctors/${r.id}`}
        empty={{ icon: Stethoscope, title: "No doctors match" }}
        toolbar={
          <>
            <SearchInput value={lp.params.search} onChange={lp.setSearch} placeholder="Name, speciality, interest" label="Search doctors" />
            <FacetFilter title="Department" options={(depts.data ?? []).filter((d) => d.doctorCount).map((d) => ({ value: d.id, label: d.name, count: d.doctorCount }))} selected={arr(f.departmentId)} onChange={(v) => lp.setFilter("departmentId", v)} />
            <FacetFilter title="Now" options={["Available", "In OPD", "On rounds", "In surgery", "Off duty", "On leave"].map((s) => ({ value: s, label: s }))} selected={arr(f.status)} onChange={(v) => lp.setFilter("status", v)} />
            <FacetFilter title="OPD day" single options={DAYS.map((d) => ({ value: d, label: d }))} selected={arr(f.day)} onChange={(v) => lp.setFilter("day", v)} />
          </>
        }
        mobileCard={(d) => (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{d.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {d.departmentName} · {d.designation}
              </p>
              <div className="mt-1.5">
                <SessionDays doctor={d} />
              </div>
            </div>
            <StatusBadge status={d.status} />
          </div>
        )}
      />
    </>
  );
}
