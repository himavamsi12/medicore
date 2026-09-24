"use client";

import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { UserPlus, Users, X } from "lucide-react";
import type { PatientListItem } from "@/types";
import { patientService } from "@/services/patientService";
import { DataTable, columnsFor, type Columns } from "@/components/data/data-table";
import { DateRangeFilter, FacetFilter, SearchInput } from "@/components/data/filters";
import { StatusBadge } from "@/components/feedback/status-badge";
import { PageHeader } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { useListParams } from "@/hooks/use-list-params";
import { useCurrentUser } from "@/hooks/use-current-user";
import { can } from "@/lib/rbac";
import { date, maskAbha, relativeDay } from "@/lib/format";

const col = columnsFor<PatientListItem>();

const columns: Columns<PatientListItem> = [
  col.accessor("fullName", {
    id: "fullName",
    header: "Patient",
    cell: ({ row: { original: p } }) => (
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{p.fullName}</span>
          {p.allergies.length > 0 && <StatusBadge tone="critical">Allergy</StatusBadge>}
          {p.flags.includes("MLC") && <StatusBadge tone="warning">MLC</StatusBadge>}
        </div>
        <p className="num text-xs text-muted-foreground">
          {p.uhid} · {p.ageLabel} {p.gender[0]} · {p.bloodGroup}
        </p>
      </div>
    ),
  }),
  col.accessor("phone", { header: "Phone", enableSorting: false, meta: { className: "num text-[13px] whitespace-nowrap", hideBelow: "lg" } }),
  col.accessor("abhaNumber", { header: "ABHA", enableSorting: false, meta: { className: "num text-xs text-muted-foreground whitespace-nowrap", hideBelow: "xl" }, cell: (c) => maskAbha(c.getValue()) }),
  col.accessor("conditions", {
    header: "Problems",
    enableSorting: false,
    meta: { hideBelow: "lg", className: "max-w-64" },
    cell: (c) => <span className="line-clamp-1 text-[13px] text-muted-foreground">{c.getValue().join(", ") || "None recorded"}</span>,
  }),
  col.accessor("status", {
    id: "status",
    header: "Status",
    cell: ({ row: { original: p } }) => (
      <div className="flex items-center gap-2">
        <StatusBadge status={p.status} />
        {p.location && <span className="num text-xs whitespace-nowrap text-muted-foreground">{p.location}</span>}
      </div>
    ),
  }),
  col.accessor("paymentCategory", { header: "Payer", enableSorting: false, meta: { hideBelow: "md", className: "text-[13px]" } }),
  col.accessor("lastVisitAt", { id: "lastVisitAt", header: "Last visit", meta: { hideBelow: "xl", className: "text-[13px] whitespace-nowrap text-muted-foreground" }, cell: (c) => (c.getValue() ? relativeDay(c.getValue()!) : "-") }),
  col.accessor("registeredAt", { id: "registeredAt", header: "Registered", meta: { className: "text-[13px] whitespace-nowrap text-muted-foreground" }, cell: (c) => date(c.getValue()) }),
];

const STATUS = ["OPD", "Admitted", "In ER", "Discharged"];
const PAYERS = ["Self-pay", "Insurance", "Corporate", "PMJAY", "CGHS"];

export default function PatientsPage() {
  const lp = useListParams({ sort: { id: "registeredAt", desc: true } });
  const { role } = useCurrentUser();
  const q = useQuery({ queryKey: ["patients", lp.params], queryFn: () => patientService.getAll(lp.params), placeholderData: keepPreviousData });
  const f = lp.params.filters ?? {};
  const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : v ? [String(v)] : []);

  return (
    <>
      <PageHeader
        title="Patients"
        description="Registry of all registered patients with UHID and ABHA linkage."
        actions={
          can(role, "patient.register") && (
            <Button render={<Link href="/patients/new" />} nativeButton={false}>
              <UserPlus /> Register patient
            </Button>
          )
        }
      />
      <DataTable
        label="Patients"
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
        rowHref={(r) => `/patients/${r.id}`}
        empty={{ icon: Users, title: "No patients match", description: "Try a different name, UHID, phone number or filter." }}
        toolbar={
          <>
            <SearchInput value={lp.params.search} onChange={lp.setSearch} placeholder="Name, UHID, phone, ABHA" label="Search patients" />
            <FacetFilter title="Status" options={STATUS.map((s) => ({ value: s, label: s }))} selected={arr(f.status)} onChange={(v) => lp.setFilter("status", v)} />
            <FacetFilter title="Payer" options={PAYERS.map((s) => ({ value: s, label: s }))} selected={arr(f.paymentCategory)} onChange={(v) => lp.setFilter("paymentCategory", v)} />
            <FacetFilter title="Gender" options={["Male", "Female", "Other"].map((s) => ({ value: s, label: s }))} selected={arr(f.gender)} onChange={(v) => lp.setFilter("gender", v)} />
            <FacetFilter title="Allergies" single options={[{ value: "yes", label: "Has allergies" }, { value: "no", label: "No known allergies" }]} selected={arr(f.hasAllergy)} onChange={(v) => lp.setFilter("hasAllergy", v)} />
            {typeof f.condition === "string" && (
              <Button variant="secondary" size="sm" onClick={() => lp.setFilter("condition", undefined)}>
                Condition: {f.condition} <X />
              </Button>
            )}
            <DateRangeFilter from={lp.params.dateFrom} to={lp.params.dateTo} onChange={lp.setDateRange} />
          </>
        }
        mobileCard={(p) => (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{p.fullName}</p>
              <p className="num text-xs text-muted-foreground">
                {p.uhid} · {p.ageLabel} {p.gender[0]} · {p.phone}
              </p>
              <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{p.conditions.join(", ") || "No problems recorded"}</p>
            </div>
            <StatusBadge status={p.status} />
          </div>
        )}
      />
    </>
  );
}
