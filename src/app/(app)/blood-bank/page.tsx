"use client";

import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Droplet } from "lucide-react";
import type { BloodUnit, Kpi } from "@/types";
import { bloodService } from "@/services/bloodService";
import { DataTable, columnsFor, type Columns } from "@/components/data/data-table";
import { FacetFilter, SearchInput } from "@/components/data/filters";
import { KpiTile } from "@/components/data/kpi-tile";
import { KpiSkeleton, PanelSkeleton } from "@/components/feedback/states";
import { StatusBadge } from "@/components/feedback/status-badge";
import { PageHeader, Panel } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { useListParams } from "@/hooks/use-list-params";
import { useNow } from "@/hooks/use-now";
import { date } from "@/lib/format";
import { cn } from "@/lib/utils";

const GROUPS = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"] as const;
const COMPONENTS = ["PRBC", "Whole blood", "FFP", "Platelets (RDP)", "Platelets (SDP)", "Cryoprecipitate"] as const;
/** Minimum on-shelf units per group for the commonest components before we flag low stock. */
const PAR: Partial<Record<string, number>> = { PRBC: 4, FFP: 3, "Platelets (RDP)": 2 };

const col = columnsFor<BloodUnit>();

function useColumns(): Columns<BloodUnit> {
  const now = useNow();
  return [
    col.accessor("unitNo", { header: "Unit", enableSorting: false, meta: { className: "num text-[13px]" } }),
    col.accessor("group", { id: "group", header: "Group", cell: (c) => <span className="font-semibold">{c.getValue()}</span> }),
    col.accessor("component", { id: "component", header: "Component" }),
    col.accessor("volumeMl", { header: "Volume", enableSorting: false, meta: { numeric: true, hideBelow: "md" }, cell: (c) => `${c.getValue()} ml` }),
    col.accessor("collectedAt", { id: "collectedAt", header: "Collected", meta: { hideBelow: "lg", className: "num text-[13px]" }, cell: (c) => date(c.getValue()) }),
    col.accessor("expiresAt", {
      id: "expiresAt",
      header: "Expires",
      cell: ({ row: { original: u } }) => {
        const days = Math.ceil((new Date(u.expiresAt).getTime() - now) / 86400000);
        return (
          <span className={cn("num text-[13px]", u.status === "Available" && days <= 3 && "font-medium text-warning-fg", days < 0 && "text-critical-fg")}>
            {date(u.expiresAt)}
            {u.status === "Available" && days >= 0 && days <= 7 && <span className="ml-1.5 text-xs text-muted-foreground">({days} d)</span>}
          </span>
        );
      },
    }),
    col.accessor("status", { id: "status", header: "Status", cell: (c) => <StatusBadge status={c.getValue()} /> }),
    col.accessor("source", { header: "Source", enableSorting: false, meta: { hideBelow: "xl", className: "text-[13px] text-muted-foreground" } }),
  ];
}

export default function BloodBankPage() {
  const inv = useQuery({ queryKey: ["blood-inventory"], queryFn: () => bloodService.getInventory() });
  const req = useQuery({ queryKey: ["blood-requests"], queryFn: () => bloodService.getRequests() });
  const lp = useListParams({ sort: { id: "expiresAt", desc: false } });
  const params = { ...lp.params, filters: { status: ["Available", "Reserved"], ...lp.params.filters } };
  const units = useQuery({ queryKey: ["blood-units", params], queryFn: () => bloodService.getUnits(params), placeholderData: keepPreviousData });
  const columns = useColumns();
  const f = lp.params.filters ?? {};
  const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : v ? [String(v)] : []);

  const cells = inv.data ?? [];
  const cell = (g: string, c: string) => cells.find((x) => x.group === g && x.component === c);
  const sum = (fn: (x: (typeof cells)[number]) => number) => cells.reduce((s, x) => s + fn(x), 0);
  const open = (req.data ?? []).filter((r) => r.status === "Pending" || r.status === "Cross-matching");
  const lowCount = cells.filter((x) => PAR[x.component] !== undefined && x.available < PAR[x.component]!).length;
  const kpis: Kpi[] = [
    { id: "avail", label: "Units available", value: sum((x) => x.available), format: "number", deltaLabel: `${sum((x) => x.reserved)} reserved for cross-match` },
    { id: "oneg", label: "O negative PRBC", value: cell("O-", "PRBC")?.available ?? 0, format: "number", severity: (cell("O-", "PRBC")?.available ?? 0) < 4 ? "critical" : "stable", deltaLabel: "Universal donor stock" },
    { id: "exp", label: "Expiring in 3 days", value: sum((x) => x.expiringIn3Days), format: "number", severity: sum((x) => x.expiringIn3Days) > 5 ? "warning" : "neutral", deltaLabel: "Issue first (FEFO)" },
    { id: "req", label: "Open requests", value: open.length, format: "number", severity: open.some((r) => r.priority === "STAT") ? "critical" : "neutral", deltaLabel: `${open.filter((r) => r.priority === "STAT").length} STAT`, href: "/blood-bank/requests" },
  ];

  return (
    <>
      <PageHeader
        title="Blood bank"
        description="Component inventory by group, expiry and open transfusion requests."
        actions={
          <Button render={<Link href="/blood-bank/requests" />} nativeButton={false}>
            Requests{open.length ? ` (${open.length})` : ""}
          </Button>
        }
      />
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{inv.isLoading || req.isLoading ? Array.from({ length: 4 }, (_, i) => <KpiSkeleton key={i} />) : kpis.map((k) => <KpiTile key={k.id} kpi={k} />)}</div>

        <Panel title="Stock by group and component" description={lowCount ? `${lowCount} group and component pairs below par level` : "All components at or above par level"}>
          {inv.isLoading ? (
            <PanelSkeleton lines={8} />
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[640px] text-sm">
                <caption className="sr-only">Available units by blood group and component. Reserved and expiring counts in brackets.</caption>
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th scope="col" className="px-4 py-2 text-left font-medium">
                      Group
                    </th>
                    {COMPONENTS.map((c) => (
                      <th key={c} scope="col" className="px-3 py-2 text-right font-medium">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {GROUPS.map((g) => (
                    <tr key={g}>
                      <th scope="row" className="px-4 py-2 text-left font-semibold">
                        {g}
                      </th>
                      {COMPONENTS.map((c) => {
                        const x = cell(g, c);
                        const par = PAR[c];
                        const low = par !== undefined && (x?.available ?? 0) < par;
                        const out = par !== undefined && (x?.available ?? 0) === 0;
                        return (
                          <td key={c} className={cn("num px-3 py-2 text-right", out ? "bg-critical-soft/50 text-critical-fg" : low && "bg-warning-soft/50 text-warning-fg")}>
                            <span className="font-medium">{x?.available ?? 0}</span>
                            {(x?.reserved || x?.expiringIn3Days) ? (
                              <span className="ml-1 text-xs text-muted-foreground">
                                {x.reserved ? `R${x.reserved}` : ""}
                                {x.reserved && x.expiringIn3Days ? " " : ""}
                                {x.expiringIn3Days ? `E${x.expiringIn3Days}` : ""}
                              </span>
                            ) : null}
                            {low && <span className="sr-only">{out ? " out of stock" : " below par"}</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t px-4 py-2 text-xs text-muted-foreground">R reserved for a cross-matched request · E expiring within 3 days · Shaded cells are below par (PRBC 4, FFP 3, RDP 2 per group).</p>
            </div>
          )}
        </Panel>

        <DataTable
          label="Blood units"
          columns={columns}
          data={units.data}
          loading={units.isLoading}
          fetching={units.isFetching}
          error={units.error}
          onRetry={() => units.refetch()}
          getRowId={(r) => r.id}
          sort={lp.params.sort}
          onSortChange={lp.setSort}
          onPageChange={lp.setPage}
          onPageSizeChange={lp.setPageSize}
          empty={{ icon: Droplet, title: "No units match" }}
          toolbar={
            <>
              <SearchInput value={lp.params.search} onChange={lp.setSearch} placeholder="Unit number" label="Search blood units" />
              <FacetFilter title="Group" options={GROUPS.map((s) => ({ value: s, label: s }))} selected={arr(f.group)} onChange={(v) => lp.setFilter("group", v)} />
              <FacetFilter title="Component" options={COMPONENTS.map((s) => ({ value: s, label: s }))} selected={arr(f.component)} onChange={(v) => lp.setFilter("component", v)} />
              <FacetFilter title="Status" options={["Available", "Reserved", "Issued", "Quarantine", "Expired", "Discarded"].map((s) => ({ value: s, label: s }))} selected={arr(f.status ?? ["Available", "Reserved"])} onChange={(v) => lp.setFilter("status", v)} />
            </>
          }
          mobileCard={(u) => (
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  {u.group} {u.component}
                </p>
                <p className="num text-xs text-muted-foreground">
                  {u.unitNo} · expires {date(u.expiresAt)}
                </p>
              </div>
              <StatusBadge status={u.status} />
            </div>
          )}
        />
      </div>
    </>
  );
}
