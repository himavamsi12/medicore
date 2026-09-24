"use client";

import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BedDouble } from "lucide-react";
import type { AdmissionView } from "@/types";
import { doctorService } from "@/services/doctorService";
import { ipdService } from "@/services/ipdService";
import { DataTable, columnsFor, type Columns } from "@/components/data/data-table";
import { FacetFilter, SearchInput, Segmented } from "@/components/data/filters";
import { StatusBadge } from "@/components/feedback/status-badge";
import { PageHeader } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { useListParams } from "@/hooks/use-list-params";
import { date, dateTime } from "@/lib/format";

const col = columnsFor<AdmissionView>();

const columns: Columns<AdmissionView> = [
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
          {a.ipNo} · {a.patient.ageLabel} {a.patient.gender[0]}
        </p>
      </div>
    ),
  }),
  col.accessor((a) => a.bed.code, {
    id: "bed",
    header: "Bed",
    cell: ({ row: { original: a } }) => (
      <div className="whitespace-nowrap">
        <p className="num text-[13px] font-medium">{a.bed.code}</p>
        <p className="text-xs text-muted-foreground">{a.ward.name}</p>
      </div>
    ),
  }),
  col.accessor("reason", { header: "Reason", enableSorting: false, meta: { hideBelow: "xl", className: "max-w-64" }, cell: (c) => <span className="line-clamp-2 text-[13px] text-muted-foreground">{c.getValue()}</span> }),
  col.accessor((a) => a.doctor.name, { id: "doctor", header: "Consultant", enableSorting: false, meta: { hideBelow: "lg", className: "text-[13px]" } }),
  col.accessor("admittedAt", { id: "admittedAt", header: "Admitted", meta: { hideBelow: "md", className: "text-[13px] whitespace-nowrap" }, cell: (c) => dateTime(c.getValue()) }),
  col.accessor("lengthOfStayDays", { id: "los", header: "LOS", meta: { numeric: true }, cell: (c) => `${c.getValue()} d` }),
  col.accessor("news2", { id: "news2", header: "NEWS2", meta: { numeric: true }, cell: (c) => (c.getValue() === undefined ? "-" : <StatusBadge tone={c.getValue()! >= 7 ? "critical" : c.getValue()! >= 5 ? "warning" : "neutral"}>{c.getValue()}</StatusBadge>) }),
  col.accessor("acuity", { id: "acuity", header: "Acuity", cell: (c) => <StatusBadge status={c.getValue()} /> }),
  col.accessor("status", { header: "Status", enableSorting: false, cell: (c) => <StatusBadge status={c.getValue()} /> }),
  col.accessor("expectedDischarge", { id: "expectedDischarge", header: "EDD", meta: { hideBelow: "xl", className: "text-[13px] whitespace-nowrap" }, cell: (c) => date(c.getValue(), "d MMM") }),
];

export default function AdmissionsPage() {
  const lp = useListParams({ sort: { id: "admittedAt", desc: true }, ignore: ["view"] });
  const view = (lp.get("view") as "active" | "discharged" | "all") ?? "active";
  const params = { ...lp.params, filters: { ...lp.params.filters, active: view === "active" ? "true" : view === "discharged" ? "false" : undefined } };
  const q = useQuery({ queryKey: ["admissions", params], queryFn: () => ipdService.getAdmissions(params), placeholderData: keepPreviousData });
  const wards = useQuery({ queryKey: ["wards"], queryFn: () => ipdService.getWards(), staleTime: Infinity });
  const doctors = useQuery({ queryKey: ["doctors-all"], queryFn: () => doctorService.listAll(), staleTime: 60_000 });
  const f = lp.params.filters ?? {};
  const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : v ? [String(v)] : []);
  return (
    <>
      <PageHeader title="Admissions" description="Inpatient census with early warning scores." actions={<Button variant="outline" render={<Link href="/ipd/beds" />} nativeButton={false}><BedDouble /> Bed map</Button>} />
      <DataTable
        label="Admissions"
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
        rowHref={(r) => `/ipd/admissions/${r.id}`}
        rowTone={(r) => (r.news2 !== undefined && r.news2 >= 7 ? "bg-critical-soft/30" : undefined)}
        empty={{ icon: BedDouble, title: "No admissions match" }}
        toolbar={
          <>
            <Segmented label="Census" value={view} onChange={(v) => lp.set({ view: v === "active" ? undefined : v })} options={[{ value: "active", label: "In hospital" }, { value: "discharged", label: "Discharged" }, { value: "all", label: "All" }]} />
            <SearchInput value={lp.params.search} onChange={lp.setSearch} placeholder="Patient, IP no, bed, diagnosis" label="Search admissions" />
            <FacetFilter title="Ward" options={(wards.data ?? []).filter((w) => w.type !== "ER").map((w) => ({ value: w.id, label: w.name }))} selected={arr(f.wardId)} onChange={(v) => lp.setFilter("wardId", v)} />
            <FacetFilter title="Acuity" options={["Critical", "Serious", "Stable"].map((s) => ({ value: s, label: s }))} selected={arr(f.acuity)} onChange={(v) => lp.setFilter("acuity", v)} />
            <FacetFilter title="Status" options={["Admitted", "Discharge planned", "Discharged", "LAMA"].map((s) => ({ value: s, label: s }))} selected={arr(f.status)} onChange={(v) => lp.setFilter("status", v)} />
            <FacetFilter title="Consultant" options={(doctors.data ?? []).filter((d) => d.inpatients > 0).map((d) => ({ value: d.id, label: d.name, count: d.inpatients }))} selected={arr(f.doctorId)} onChange={(v) => lp.setFilter("doctorId", v)} />
          </>
        }
        mobileCard={(a) => (
          <div className="flex items-start gap-3">
            <span className="num w-16 shrink-0 text-xs font-semibold">{a.bed.code}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{a.patient.fullName}</p>
              <p className="truncate text-xs text-muted-foreground">
                Day {a.lengthOfStayDays + 1} · {a.reason}
              </p>
            </div>
            {a.news2 !== undefined && <StatusBadge tone={a.news2 >= 7 ? "critical" : a.news2 >= 5 ? "warning" : "neutral"}>NEWS2 {a.news2}</StatusBadge>}
          </div>
        )}
      />
    </>
  );
}
