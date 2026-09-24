"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ScanLine } from "lucide-react";
import type { RadiologyOrderView } from "@/types";
import { radiologyService } from "@/services/radiologyService";
import { DataTable, columnsFor, type Columns } from "@/components/data/data-table";
import { DateRangeFilter, FacetFilter, SearchInput, Segmented } from "@/components/data/filters";
import { StatusBadge } from "@/components/feedback/status-badge";
import { PageHeader } from "@/components/layout/page";
import { useListParams } from "@/hooks/use-list-params";
import { dateTime } from "@/lib/format";

const col = columnsFor<RadiologyOrderView>();

const columns: Columns<RadiologyOrderView> = [
  col.accessor("orderedAt", {
    id: "orderedAt",
    header: "Ordered",
    cell: ({ row: { original: o } }) => (
      <div className="whitespace-nowrap">
        <p className="num text-[13px]">{dateTime(o.orderedAt)}</p>
        <p className="num text-xs text-muted-foreground">{o.accessionNo}</p>
      </div>
    ),
  }),
  col.accessor((o) => o.patient.fullName, {
    id: "patient",
    header: "Patient",
    cell: ({ row: { original: o } }) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{o.patient.fullName}</p>
        <p className="num truncate text-xs text-muted-foreground">
          {o.patient.uhid} · {o.patient.ageLabel} {o.patient.gender[0]} · {o.source}
        </p>
      </div>
    ),
  }),
  col.accessor("modality", { id: "modality", header: "Modality", cell: (c) => <span className="text-[13px] font-medium">{c.getValue()}</span> }),
  col.accessor("study", {
    header: "Study",
    enableSorting: false,
    meta: { className: "max-w-72" },
    cell: ({ row: { original: o } }) => (
      <div className="min-w-0">
        <p className="line-clamp-1 text-[13px]">{o.study}</p>
        <p className="line-clamp-1 text-xs text-muted-foreground">{o.clinicalHistory}</p>
      </div>
    ),
  }),
  col.accessor("priority", { id: "priority", header: "Priority", cell: (c) => <StatusBadge status={c.getValue()} /> }),
  col.accessor("status", { id: "status", header: "Status", cell: (c) => <StatusBadge status={c.getValue()} /> }),
  col.accessor((o) => o.radiologist?.name ?? o.orderedBy.name, {
    id: "people",
    header: "Radiologist / referrer",
    enableSorting: false,
    meta: { hideBelow: "xl", className: "text-[13px] text-muted-foreground" },
    cell: ({ row: { original: o } }) => (
      <div>
        <p>{o.radiologist?.name ?? "Unassigned"}</p>
        <p className="text-xs">Ref {o.orderedBy.name}</p>
      </div>
    ),
  }),
];

export default function RadiologyPage() {
  const lp = useListParams({ sort: { id: "orderedAt", desc: true }, ignore: ["view"] });
  const view = (lp.get("view") as "reporting" | "all") ?? "reporting";
  const params = { ...lp.params, filters: { ...lp.params.filters, worklist: view === "reporting" ? "true" : undefined } };
  const q = useQuery({ queryKey: ["radiology-orders", params], queryFn: () => radiologyService.getOrders(params), placeholderData: keepPreviousData });
  const f = lp.params.filters ?? {};
  const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : v ? [String(v)] : []);
  return (
    <>
      <PageHeader title="Radiology" description="Imaging worklist. Open a study to view images, review AI findings and report." />
      <DataTable
        label="Radiology orders"
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
        rowHref={(r) => `/radiology/${r.id}`}
        empty={{ icon: ScanLine, title: "No studies match" }}
        toolbar={
          <>
            <Segmented label="Worklist" value={view} onChange={(v) => lp.set({ view: v === "reporting" ? undefined : v })} options={[{ value: "reporting", label: "To report" }, { value: "all", label: "All studies" }]} />
            <SearchInput value={lp.params.search} onChange={lp.setSearch} placeholder="Patient, accession, study" label="Search radiology orders" />
            <FacetFilter title="Modality" options={["X-Ray", "CT", "MRI", "USG", "Mammography"].map((s) => ({ value: s, label: s }))} selected={arr(f.modality)} onChange={(v) => lp.setFilter("modality", v)} />
            <FacetFilter title="Status" options={["Ordered", "Scheduled", "Acquired", "Reported", "Verified"].map((s) => ({ value: s, label: s }))} selected={arr(f.status)} onChange={(v) => lp.setFilter("status", v)} />
            <FacetFilter title="Priority" options={["STAT", "Urgent", "Routine"].map((s) => ({ value: s, label: s }))} selected={arr(f.priority)} onChange={(v) => lp.setFilter("priority", v)} />
            <FacetFilter title="Source" options={["OPD", "IPD", "ER"].map((s) => ({ value: s, label: s }))} selected={arr(f.source)} onChange={(v) => lp.setFilter("source", v)} />
            <DateRangeFilter from={lp.params.dateFrom} to={lp.params.dateTo} onChange={lp.setDateRange} />
          </>
        }
        mobileCard={(o) => (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{o.patient.fullName}</p>
              <p className="line-clamp-1 text-xs text-muted-foreground">{o.study}</p>
              <p className="num text-xs text-muted-foreground">{dateTime(o.orderedAt)}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <StatusBadge status={o.status} />
              <StatusBadge status={o.priority} />
            </div>
          </div>
        )}
      />
    </>
  );
}
