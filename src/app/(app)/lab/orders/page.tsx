"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import type { LabOrderView } from "@/types";
import { labService } from "@/services/labService";
import { DataTable, columnsFor, type Columns } from "@/components/data/data-table";
import { DateRangeFilter, FacetFilter, SearchInput, Segmented } from "@/components/data/filters";
import { StatusBadge } from "@/components/feedback/status-badge";
import { PageHeader } from "@/components/layout/page";
import { useListParams } from "@/hooks/use-list-params";
import { dateTime, minutesLabel } from "@/lib/format";

const col = columnsFor<LabOrderView>();

const columns: Columns<LabOrderView> = [
  col.accessor("orderedAt", {
    id: "orderedAt",
    header: "Ordered",
    cell: ({ row: { original: o } }) => (
      <div className="whitespace-nowrap">
        <p className="num text-[13px]">{dateTime(o.orderedAt)}</p>
        <p className="num text-xs text-muted-foreground">{o.orderNo}</p>
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
          {o.patient.uhid} · {o.patient.ageLabel} {o.patient.gender[0]} · {o.location ?? o.source}
        </p>
      </div>
    ),
  }),
  col.accessor((o) => o.tests.map((t) => t.name).join(", "), {
    id: "tests",
    header: "Tests",
    enableSorting: false,
    meta: { className: "max-w-72" },
    cell: (c) => <span className="line-clamp-2 text-[13px]">{c.getValue()}</span>,
  }),
  col.accessor("sampleId", { header: "Sample", enableSorting: false, meta: { hideBelow: "xl", className: "num text-xs text-muted-foreground" } }),
  col.accessor("priority", { id: "priority", header: "Priority", cell: (c) => <StatusBadge status={c.getValue()} /> }),
  col.accessor("status", { id: "status", header: "Status", cell: (c) => <StatusBadge status={c.getValue()} /> }),
  col.display({
    id: "flags",
    header: "Flags",
    meta: { hideBelow: "md" },
    cell: ({ row: { original: o } }) =>
      o.criticalCount ? <StatusBadge tone="critical">{o.criticalCount} critical</StatusBadge> : o.abnormalCount ? <StatusBadge tone="warning">{o.abnormalCount} abnormal</StatusBadge> : o.results.length ? <StatusBadge tone="stable">Normal</StatusBadge> : <span className="text-xs text-muted-foreground">-</span>,
  }),
  col.accessor("tatMinutes", { id: "tat", header: "TAT", meta: { numeric: true, hideBelow: "lg" }, cell: (c) => (c.getValue() !== undefined ? minutesLabel(c.getValue()!) : "-") }),
  col.accessor((o) => o.orderedBy.name, { id: "orderedBy", header: "Ordered by", enableSorting: false, meta: { hideBelow: "xl", className: "text-[13px] text-muted-foreground" } }),
];

export default function LabOrdersPage() {
  const lp = useListParams({ sort: { id: "orderedAt", desc: true }, ignore: ["view"] });
  const view = (lp.get("view") as "pending" | "all") ?? "pending";
  const params = { ...lp.params, filters: { ...lp.params.filters, pending: view === "pending" ? "true" : undefined } };
  const q = useQuery({ queryKey: ["lab-orders", params], queryFn: () => labService.getOrders(params), placeholderData: keepPreviousData });
  const f = lp.params.filters ?? {};
  const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : v ? [String(v)] : []);
  return (
    <>
      <PageHeader title="Lab orders" description="Laboratory information system worklist. Open an order to enter or verify results." />
      <DataTable
        label="Lab orders"
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
        rowHref={(r) => `/lab/orders/${r.id}`}
        rowTone={(r) => (r.criticalCount ? "bg-critical-soft/30" : undefined)}
        empty={{ icon: FlaskConical, title: "No lab orders match" }}
        toolbar={
          <>
            <Segmented label="Worklist" value={view} onChange={(v) => lp.set({ view: v === "pending" ? undefined : v })} options={[{ value: "pending", label: "Pending" }, { value: "all", label: "All orders" }]} />
            <SearchInput value={lp.params.search} onChange={lp.setSearch} placeholder="Patient, order no, sample, test" label="Search lab orders" />
            <FacetFilter title="Status" options={["Ordered", "Collected", "Processing", "Resulted", "Verified", "Rejected"].map((s) => ({ value: s, label: s }))} selected={arr(f.status)} onChange={(v) => lp.setFilter("status", v)} />
            <FacetFilter title="Priority" options={["STAT", "Urgent", "Routine"].map((s) => ({ value: s, label: s }))} selected={arr(f.priority)} onChange={(v) => lp.setFilter("priority", v)} />
            <FacetFilter title="Source" options={["OPD", "IPD", "ER"].map((s) => ({ value: s, label: s }))} selected={arr(f.source)} onChange={(v) => lp.setFilter("source", v)} />
            <FacetFilter title="Section" options={["Haematology", "Biochemistry", "Clinical Pathology", "Microbiology", "Serology", "Immunoassay", "Coagulation"].map((s) => ({ value: s, label: s }))} selected={arr(f.category)} onChange={(v) => lp.setFilter("category", v)} />
            <FacetFilter title="Results" single options={[{ value: "critical", label: "Critical values" }, { value: "abnormal", label: "Any abnormal" }]} selected={arr(f.abnormal)} onChange={(v) => lp.setFilter("abnormal", v)} />
            <DateRangeFilter from={lp.params.dateFrom} to={lp.params.dateTo} onChange={lp.setDateRange} />
          </>
        }
        mobileCard={(o) => (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{o.patient.fullName}</p>
              <p className="line-clamp-1 text-xs text-muted-foreground">{o.tests.map((t) => t.name).join(", ")}</p>
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
