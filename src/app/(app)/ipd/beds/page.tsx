"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BedDouble, Sparkles, Wrench, X } from "lucide-react";
import type { BedStatus, BedView, WardType } from "@/types";
import { ipdService } from "@/services/ipdService";
import { patientService } from "@/services/patientService";
import { Segmented } from "@/components/data/filters";
import { EmptyState, PanelSkeleton } from "@/components/feedback/states";
import { StatusBadge, statusTone } from "@/components/feedback/status-badge";
import { Field, PageHeader } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AdmitDialog } from "@/features/ipd/admit-dialog";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useListParams } from "@/hooks/use-list-params";
import { can, canAccess } from "@/lib/rbac";
import { ICON_STROKE, STALE } from "@/lib/constants";
import { ago, date, inr } from "@/lib/format";
import { cn } from "@/lib/utils";

const TILE: Record<BedStatus, string> = {
  Occupied: "bg-card border-border-strong",
  Available: "bg-stable-soft/50 border-stable/50 border-dashed",
  Cleaning: "bg-warning-soft/60 border-warning/50",
  Reserved: "bg-info-soft/50 border-info/40",
  Maintenance: "bg-muted border-border",
};

const TYPES: ("All" | WardType)[] = ["All", "ICU", "HDU", "NICU", "General", "Semi-private", "Private", "Suite", "ER"];

function BedTile({ bed, onOpen, highlight }: { bed: BedView; onOpen: () => void; highlight?: boolean }) {
  const acuity = bed.admission?.acuity;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${bed.code}, ${bed.status}${bed.patient ? `, ${bed.patient.fullName}` : ""}`}
      className={cn(
        "group relative flex h-[104px] flex-col rounded-lg border p-2.5 text-left transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2",
        TILE[bed.status],
        acuity === "Critical" && "border-l-4 border-l-critical",
        acuity === "Serious" && "border-l-4 border-l-warning",
        highlight && "ring-2 ring-primary",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="num text-xs font-semibold">{bed.code}</span>
        {bed.news2 !== undefined && bed.news2 >= 5 && <StatusBadge tone={bed.news2 >= 7 ? "critical" : "warning"}>{bed.news2}</StatusBadge>}
        {bed.status !== "Occupied" && <span className="text-[10px] font-medium text-muted-foreground">{bed.status}</span>}
      </div>
      {bed.patient ? (
        <>
          <p className="mt-1.5 line-clamp-1 text-[13px] font-medium">{bed.patient.fullName}</p>
          <p className="text-[11px] text-muted-foreground">
            {bed.patient.ageLabel} {bed.patient.gender[0]}
            {bed.patient.allergies.length > 0 && <span className="text-critical-fg"> · Allergy</span>}
          </p>
          <p className="mt-auto line-clamp-1 text-[11px] text-muted-foreground">{bed.doctorName ?? bed.admission?.reason}</p>
        </>
      ) : (
        <div className="mt-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {bed.status === "Available" && <BedDouble className="size-3.5 text-stable-fg" strokeWidth={ICON_STROKE} />}
          {bed.status === "Cleaning" && <Sparkles className="size-3.5 text-warning-fg" strokeWidth={ICON_STROKE} />}
          {bed.status === "Maintenance" && <Wrench className="size-3.5" strokeWidth={ICON_STROKE} />}
          {bed.status === "Available" ? "Ready" : `since ${ago(bed.statusSince)}`}
        </div>
      )}
    </button>
  );
}

export default function BedMapPage() {
  const { role } = useCurrentUser();
  const qc = useQueryClient();
  const lp = useListParams({ ignore: ["ward", "type", "admit", "bed"] });
  const type = (lp.get("type") as (typeof TYPES)[number]) ?? "All";
  const wardFilter = lp.get("ward");
  const admitFor = lp.get("admit");
  const [open, setOpen] = useState<BedView>();
  const [admitBed, setAdmitBed] = useState<BedView>();

  const beds = useQuery({ queryKey: ["beds"], queryFn: () => ipdService.getBeds(), staleTime: STALE.live, refetchInterval: 30_000 });
  const occ = useQuery({ queryKey: ["occupancy"], queryFn: () => ipdService.getOccupancy(), staleTime: STALE.live });
  const admitPatient = useQuery({ queryKey: ["patient", admitFor], queryFn: () => patientService.getById(admitFor!), enabled: Boolean(admitFor) });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Exclude<BedStatus, "Occupied"> }) => ipdService.setBedStatus(id, status),
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: ["beds"] });
      qc.invalidateQueries({ queryKey: ["occupancy"] });
      toast.success(`${b.code} marked ${b.status.toLowerCase()}`);
      setOpen(b);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const all = beds.data ?? [];
  const shown = all.filter((b) => (type === "All" || b.ward.type === type) && (!wardFilter || b.wardId === wardFilter));
  const wards = [...new Map(shown.map((b) => [b.wardId, b.ward])).values()];
  const totals = (["Occupied", "Available", "Cleaning", "Reserved", "Maintenance"] as BedStatus[]).map((s) => ({ s, n: shown.filter((b) => b.status === s).length }));
  const canAdmit = can(role, "admission.manage");

  return (
    <>
      <PageHeader
        title="Bed map"
        description="Live status of every bed. Select a bed to admit, transfer or update housekeeping."
        actions={canAccess(role, "/ipd/admissions") && <Button variant="outline" render={<Link href="/ipd/admissions" />} nativeButton={false}>Admissions list</Button>}
      />
      {admitFor && admitPatient.data && (
        <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-info/40 bg-info-soft/50 px-4 py-3 text-sm">
          <span>
            Select an <span className="font-medium">available</span> bed to admit <span className="font-medium">{admitPatient.data.fullName}</span> ({admitPatient.data.uhid}).
          </span>
          <Button variant="ghost" size="icon-sm" aria-label="Cancel admission" onClick={() => lp.set({ admit: undefined }, false)}>
            <X />
          </Button>
        </div>
      )}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="overflow-x-auto scrollbar-thin">
          <Segmented label="Ward type" value={type} onChange={(v) => lp.set({ type: v === "All" ? undefined : v, ward: undefined }, false)} options={TYPES.map((t) => ({ value: t, label: t, count: t === "All" ? all.filter((b) => b.status === "Available").length : all.filter((b) => b.ward.type === t && b.status === "Available").length }))} />
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground" aria-label="Bed status legend">
          {totals.map(({ s, n }) => (
            <span key={s} className="flex items-center gap-1.5">
              <span aria-hidden className={cn("size-3 rounded border", TILE[s])} />
              {s} <span className="num font-medium text-foreground">{n}</span>
            </span>
          ))}
        </div>
      </div>

      {beds.isLoading ? (
        <PanelSkeleton lines={14} className="rounded-xl border" />
      ) : wards.length === 0 ? (
        <EmptyState icon={BedDouble} title="No beds in this view" />
      ) : (
        <div className="space-y-5">
          {wards.map((w) => {
            const o = occ.data?.find((x) => x.ward.id === w.id);
            const wb = shown.filter((b) => b.wardId === w.id);
            return (
              <section key={w.id} aria-labelledby={`ward-${w.id}`} className="rounded-xl border bg-card">
                <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-2.5">
                  <h2 id={`ward-${w.id}`} className="text-sm font-medium">
                    {w.name}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {w.floor}, {w.wing} · {inr(w.dailyRate)}/day
                  </span>
                  {o && (
                    <span className="ml-auto flex items-center gap-3 text-xs">
                      <span className="num">
                        <span className="font-semibold">{o.occupied}</span>/{o.total} occupied
                      </span>
                      <span className="num text-stable-fg">{o.available} free</span>
                      {o.nurseInCharge && <span className="hidden text-muted-foreground md:inline">NIC {o.nurseInCharge}</span>}
                    </span>
                  )}
                </header>
                <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">
                  {wb.map((b) => (
                    <BedTile key={b.id} bed={b} highlight={Boolean(admitFor) && b.status === "Available"} onOpen={() => (admitFor && b.status === "Available" && canAdmit ? setAdmitBed(b) : setOpen(b))} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Sheet open={Boolean(open)} onOpenChange={(o) => !o && setOpen(undefined)}>
        <SheetContent className="w-full sm:max-w-md">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  Bed {open.code} <StatusBadge tone={statusTone(open.status)}>{open.status}</StatusBadge>
                </SheetTitle>
                <SheetDescription>
                  {open.ward.name}, {open.ward.floor} · {inr(open.ward.dailyRate)}/day
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-5 overflow-y-auto px-4 pb-6">
                {open.features.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {open.features.map((f) => (
                      <StatusBadge key={f} tone="neutral">
                        {f}
                      </StatusBadge>
                    ))}
                  </div>
                )}
                {open.patient && open.admission ? (
                  <>
                    <dl className="grid grid-cols-2 gap-3">
                      <Field label="Patient" className="col-span-2">
                        {open.patient.fullName} · {open.patient.ageLabel} {open.patient.gender[0]}
                      </Field>
                      <Field label="IP number">{open.admission.ipNo}</Field>
                      <Field label="Acuity">{open.admission.acuity}</Field>
                      <Field label="Admitted">{date(open.admission.admittedAt, "d MMM, HH:mm")}</Field>
                      <Field label="Expected discharge">{date(open.admission.expectedDischarge)}</Field>
                      <Field label="Consultant" className="col-span-2">{open.doctorName}</Field>
                      <Field label="Reason" className="col-span-2">{open.admission.reason}</Field>
                      {open.news2 !== undefined && <Field label="Latest NEWS2">{open.news2}</Field>}
                    </dl>
                    <div className="flex flex-wrap gap-2">
                      <Button render={<Link href={`/ipd/admissions/${open.admission.id}`} />} nativeButton={false}>
                        Open admission
                      </Button>
                      {can(role, "bed.transfer") && (
                        <Button variant="outline" render={<Link href={`/ipd/admissions/${open.admission.id}?tab=transfer`} />} nativeButton={false}>
                          Transfer
                        </Button>
                      )}
                      <Button variant="ghost" render={<Link href={`/patients/${open.patient.id}`} />} nativeButton={false}>
                        Patient record
                      </Button>
                    </div>
                  </>
                ) : open.patient ? (
                  <p className="text-sm">
                    Emergency patient: <Link className="font-medium underline" href={`/patients/${open.patient.id}`}>{open.patient.fullName}</Link>
                  </p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">Status since {ago(open.statusSince)}.</p>
                    <div className="flex flex-wrap gap-2">
                      {open.status === "Available" && canAdmit && open.ward.type !== "ER" && (
                        <Button
                          onClick={() => {
                            setAdmitBed(open);
                            setOpen(undefined);
                          }}
                        >
                          Admit patient
                        </Button>
                      )}
                      {open.status !== "Available" && (
                        <Button variant="outline" onClick={() => setStatus.mutate({ id: open.id, status: "Available" })}>
                          Mark ready
                        </Button>
                      )}
                      {open.status === "Available" && (
                        <>
                          <Button variant="outline" onClick={() => setStatus.mutate({ id: open.id, status: "Reserved" })}>
                            Reserve
                          </Button>
                          <Button variant="ghost" onClick={() => setStatus.mutate({ id: open.id, status: "Maintenance" })}>
                            Maintenance
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {admitBed && (
        <AdmitDialog
          bed={admitBed}
          patientId={admitFor}
          onClose={() => {
            setAdmitBed(undefined);
          }}
        />
      )}
    </>
  );
}
