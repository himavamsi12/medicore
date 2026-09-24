"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BedDouble, LogOut, Send } from "lucide-react";
import type { ErStatus } from "@/types";
import { doctorService } from "@/services/doctorService";
import { erService } from "@/services/erService";
import { ipdService } from "@/services/ipdService";
import { patientService } from "@/services/patientService";
import { ErrorState, PanelSkeleton } from "@/components/feedback/states";
import { StatusBadge } from "@/components/feedback/status-badge";
import { SelectField, TextareaField } from "@/components/forms/fields";
import { Field, PageHeader, Panel } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { TriageChip, TriageDialog } from "@/features/emergency/triage-dialog";
import { VitalsGrid, LabsTab, PatientBanner } from "@/features/patients/profile";
import { useCurrentUser } from "@/hooks/use-current-user";
import { can } from "@/lib/rbac";
import { TRIAGE_META } from "@/lib/clinical";
import { dateTime, minutesLabel } from "@/lib/format";

const ACTIVE: ErStatus[] = ["Waiting", "In triage", "Under treatment", "Observation"];

export default function ErCasePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { role } = useCurrentUser();
  const [triage, setTriage] = useState(false);
  const q = useQuery({ queryKey: ["er-case", id], queryFn: () => erService.getById(id) });
  const patient = useQuery({ queryKey: ["patient", q.data?.patientId], queryFn: () => patientService.getById(q.data!.patientId), enabled: Boolean(q.data) });
  const doctors = useQuery({ queryKey: ["doctors-all"], queryFn: () => doctorService.listAll(), staleTime: 60_000 });
  const beds = useQuery({ queryKey: ["beds", "er"], queryFn: () => ipdService.getBeds({ wardId: "WRD-ER" }) });
  const [notes, setNotes] = useState<string>();
  const update = useMutation({
    mutationFn: (patch: Parameters<typeof erService.assign>[1]) => erService.assign(id, patch),
    onSuccess: (r) => {
      ["er-case", "er-active", "er-stats", "beds", "kpis", "patient"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success(`Updated: ${r.status}${r.bedCode ? ` · ${r.bedCode}` : ""}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });
  if (q.isLoading) return <PanelSkeleton lines={12} className="rounded-xl border" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const c = q.data!;
  const active = ACTIVE.includes(c.status);
  const canAct = can(role, "triage.assign");

  return (
    <div className="space-y-4">
      <PageHeader
        title={c.caseNo}
        breadcrumbs={[{ label: "Emergency", href: "/emergency" }, { label: c.patient.fullName }]}
        meta={
          <>
            <TriageChip level={c.triageLevel} />
            <StatusBadge status={c.status} />
            {c.mlc && <StatusBadge tone="critical">Medico-legal case</StatusBadge>}
            <span>Arrived {dateTime(c.arrivedAt)} by {c.arrivalMode}</span>
            <span>{active ? `In department ${minutesLabel(c.waitingMinutes)}` : c.disposition}</span>
          </>
        }
        actions={
          active &&
          canAct && (
            <Button variant="outline" onClick={() => setTriage(true)}>
              {c.triageLevel ? "Re-triage" : "Triage now"}
            </Button>
          )
        }
      />
      {patient.data && <PatientBanner p={patient.data} />}
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          <Panel title="Presentation">
            <dl className="grid grid-cols-2 gap-4 p-4 md:grid-cols-3">
              <Field label="Chief complaint" className="col-span-2 md:col-span-3">{c.chiefComplaint}</Field>
              <Field label="Symptoms">{c.symptoms.join(", ") || "Not recorded"}</Field>
              <Field label="Triage">{c.triageLevel ? `Level ${c.triageLevel}, ${TRIAGE_META[c.triageLevel].label}` : "Pending"}</Field>
              <Field label="Triaged by">{c.triagedBy ? `${c.triagedBy}, ${dateTime(c.triagedAt!)}` : undefined}</Field>
            </dl>
          </Panel>
          <Panel title="Triage vitals">
            <VitalsGrid v={c.vitals} />
          </Panel>
          <LabsTab patientId={c.patientId} />
        </div>
        <aside className="min-w-0 space-y-4">
          <Panel title="Care team and bed">
            <div className="grid gap-3 p-4">
              <SelectField label="ER doctor" disabled={!active || !canAct} value={c.doctorId ?? ""} placeholder="Assign doctor" onChange={(e) => update.mutate({ doctorId: e.target.value, status: c.status === "Waiting" || c.status === "In triage" ? "Under treatment" : c.status })} options={(doctors.data ?? []).filter((d) => ["DEP-EM", "DEP-CCM", "DEP-GM"].includes(d.departmentId)).map((d) => ({ value: d.id, label: `${d.name} · ${d.departmentName}` }))} />
              <SelectField label="ER bed" disabled={!active || !canAct} value={c.bedId ?? ""} placeholder="Assign bed" onChange={(e) => update.mutate({ bedId: e.target.value })} options={(beds.data ?? []).filter((b) => b.id === c.bedId || b.status !== "Occupied").map((b) => ({ value: b.id, label: `${b.code}${b.features.includes("Resuscitation bay") ? " (resus)" : ""}${b.status === "Cleaning" ? " (cleaning)" : ""}` }))} />
              {active && canAct && c.status !== "Observation" && (
                <Button variant="outline" onClick={() => update.mutate({ status: "Observation" })}>
                  Move to observation
                </Button>
              )}
            </div>
          </Panel>
          <Panel title="Notes">
            <div className="grid gap-2 p-4">
              <TextareaField label="Clinical notes" rows={4} value={notes ?? c.notes} readOnly={!active || !canAct} onChange={(e) => setNotes(e.target.value)} />
              {active && canAct && notes !== undefined && notes !== c.notes && (
                <Button size="sm" variant="outline" onClick={() => update.mutate({ notes })}>
                  Save notes
                </Button>
              )}
            </div>
          </Panel>
          {active && canAct && (
            <Panel title="Disposition">
              <div className="grid gap-2 p-4">
                <Button onClick={() => router.push(`/ipd/beds?admit=${c.patientId}`)}>
                  <BedDouble /> Admit to ward or ICU
                </Button>
                <Button variant="outline" onClick={() => update.mutate({ status: "Discharged", disposition: "Discharged from ER with advice" })}>
                  <LogOut /> Discharge from ER
                </Button>
                <Button variant="ghost" onClick={() => update.mutate({ status: "Referred out", disposition: "Referred to higher centre" })}>
                  <Send /> Refer out
                </Button>
                <p className="text-xs text-muted-foreground">Admitting releases the ER bed once the patient reaches the ward.</p>
              </div>
            </Panel>
          )}
          <Button variant="ghost" className="w-full" render={<Link href={`/patients/${c.patientId}`} />} nativeButton={false}>
            Open full record
          </Button>
        </aside>
      </div>
      {triage && <TriageDialog c={c} onClose={() => setTriage(false)} />}
    </div>
  );
}
