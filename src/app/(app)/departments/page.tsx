"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import type { DepartmentKind } from "@/types";
import { doctorService } from "@/services/doctorService";
import { reportService } from "@/services/reportService";
import { Segmented, SearchInput } from "@/components/data/filters";
import { EmptyState, ErrorState, PanelSkeleton } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page";
import { inrCompact } from "@/lib/format";

export default function DepartmentsPage() {
  const q = useQuery({ queryKey: ["departments"], queryFn: () => doctorService.getDepartments() });
  const rev = useQuery({ queryKey: ["dept-revenue", 30], queryFn: () => reportService.getDepartmentRevenue(30) });
  const [kind, setKind] = useState<"All" | DepartmentKind>("All");
  const [search, setSearch] = useState("");
  const rows = useMemo(
    () => (q.data ?? []).filter((d) => (kind === "All" || d.kind === kind) && `${d.name} ${d.services.join(" ")}`.toLowerCase().includes(search.toLowerCase())),
    [q.data, kind, search],
  );

  return (
    <>
      <PageHeader title="Departments" description="Specialities, heads of department, services and today's load." />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Department or service" label="Search departments" />
        <Segmented label="Department type" value={kind} onChange={setKind} options={(["All", "Clinical", "Diagnostic", "Support"] as const).map((k) => ({ value: k, label: k }))} />
      </div>
      {q.isLoading ? (
        <PanelSkeleton lines={12} className="rounded-xl border" />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Building2} title="No departments match" />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <ul className="divide-y">
            {rows.map((d) => {
              const r = rev.data?.find((x) => x.departmentId === d.id);
              return (
                <li key={d.id}>
                  <Link href={`/departments/${d.id}`} className="grid gap-2 px-4 py-3.5 hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none md:grid-cols-[1.6fr_1fr_repeat(4,minmax(0,0.55fr))] md:items-center md:gap-4">
                    <div className="min-w-0">
                      <p className="font-medium">{d.name}</p>
                      <p className="line-clamp-1 text-xs text-muted-foreground">{d.services.join(" · ")}</p>
                    </div>
                    <div className="min-w-0 text-[13px]">
                      <p className="truncate">{d.head?.name ?? <span className="text-muted-foreground">No HOD</span>}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {d.floor} · ext {d.extension}
                      </p>
                    </div>
                    {[
                      { label: "Doctors", value: d.doctorCount },
                      { label: "OPD today", value: d.opdToday },
                      { label: "Inpatients", value: d.inpatients },
                      { label: "Revenue 30 d", value: r ? inrCompact(r.revenue) : "-" },
                    ].map((m) => (
                      <div key={m.label} className="flex items-baseline justify-between gap-2 md:block md:text-right">
                        <p className="text-xs text-muted-foreground md:hidden">{m.label}</p>
                        <p className="num text-sm">{m.value}</p>
                        <p className="hidden text-[11px] text-muted-foreground md:block">{m.label}</p>
                      </div>
                    ))}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
