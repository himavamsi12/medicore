"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { settingsService } from "@/services/settingsService";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";

/** A4 sheet with hospital letterhead. Toolbar is hidden when printing. */
export function PrintSheet({ title, children, meta }: { title: string; children: React.ReactNode; meta?: React.ReactNode }) {
  const hydrated = useHydrated();
  const h = useQuery({ queryKey: ["hospital"], queryFn: () => settingsService.getHospital(), staleTime: Infinity, enabled: hydrated });
  return (
    <div className="mx-auto w-full max-w-[210mm] px-4 print:max-w-none print:px-0">
      <div className="no-print mb-4 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => history.back()}>
          <ArrowLeft /> Back
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer /> Print
        </Button>
      </div>
      <article className="min-h-[297mm] rounded-xl border bg-white p-[14mm] text-[12px] leading-relaxed text-neutral-900 shadow-[var(--shadow-popover)] print:min-h-0 print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-neutral-800 pb-3">
          <div>
            <p className="text-lg font-bold tracking-tight">{h.data?.name ?? "MediCore Hospitals"}</p>
            <p className="text-[11px] text-neutral-600">{h.data?.tagline}</p>
            <p className="text-[11px] text-neutral-600">
              {h.data ? `${h.data.address}, ${h.data.city} ${h.data.pincode}` : ""}
            </p>
          </div>
          <div className="text-right text-[11px] text-neutral-600">
            <p>Tel {h.data?.phone} · Emergency {h.data?.emergencyPhone}</p>
            <p>{h.data?.email} · {h.data?.website}</p>
            <p>GSTIN {h.data?.gstin} · NABH {h.data?.nabhNo}</p>
            <p>ABDM HFR {h.data?.hfrId}</p>
          </div>
        </header>
        <div className="mt-3 mb-4 flex items-baseline justify-between">
          <h1 className="text-base font-semibold tracking-wide uppercase">{title}</h1>
          <div className="text-[11px] text-neutral-600">{meta}</div>
        </div>
        {hydrated ? children : null}
      </article>
    </div>
  );
}
