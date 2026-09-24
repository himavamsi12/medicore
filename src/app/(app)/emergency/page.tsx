"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ambulance, Loader2, Plus, Siren, Timer } from "lucide-react";
import type { ErCase, ErCaseView, PatientSummary } from "@/types";
import { erService } from "@/services/erService";
import { ipdService } from "@/services/ipdService";
import { patientService } from "@/services/patientService";
import { KanbanBoard } from "@/components/data/kanban";
import { AsyncCombobox } from "@/components/forms/async-combobox";
import { SelectField, TextField } from "@/components/forms/fields";
import { KpiSkeleton, PanelSkeleton } from "@/components/feedback/states";
import { StatusBadge } from "@/components/feedback/status-badge";
import { PageHeader, Panel } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LEVEL_BORDER, TriageChip, TriageDialog } from "@/features/emergency/triage-dialog";
import { useCurrentUser } from "@/hooks/use-current-user";
import { can } from "@/lib/rbac";
import { TRIAGE_META } from "@/lib/clinical";
import { ICON_STROKE, STALE } from "@/lib/constants";
import { minutesLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const TARGET_MIN: Record<number, number> = { 1: 0, 2: 10, 3: 30, 4: 60, 5: 120 };

function ErCard({ c, onTriage }: { c: ErCaseView; onTriage: (c: ErCaseView) => void }) {
  const { role } = useCurrentUser();
  const breach = c.status === "Waiting" && c.triageLevel && c.waitingMinutes > TARGET_MIN[c.triageLevel];
  return (
    <article className={cn("rounded-lg border border-l-4 bg-card p-3 shadow-[var(--shadow-raise)]", c.triageLevel ? LEVEL_BORDER[c.triageLevel] : "border-l-border-strong")}>
      <div className="flex items-start justify-between gap-2">
        <TriageChip level={c.triageLevel} />
        <span className={cn("num flex items-center gap-1 text-xs", breach ? "font-semibold text-critical-fg" : "text-muted-foreground")}>
          <Timer className="size-3.5" aria-hidden /> {minutesLabel(c.waitingMinutes)}
        </span>
      </div>
      <Link href={`/emergency/${c.id}`} className="mt-2 block truncate text-sm font-medium hover:underline">
        {c.patient.fullName}
      </Link>
      <p className="text-xs text-muted-foreground">
        {c.patient.ageLabel} {c.patient.gender[0]} · {c.arrivalMode}
        {c.bedCode && ` · ${c.bedCode}`}
      </p>
      <p className="mt-1 line-clamp-2 text-[13px]">{c.chiefComplaint}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {c.mlc && <StatusBadge tone="critical">MLC</StatusBadge>}
        {c.patient.allergies.length > 0 && <StatusBadge tone="warning">Allergy</StatusBadge>}
        {c.vitals && (
          <StatusBadge tone="neutral">
            SpO₂ {c.vitals.spo2}% · HR {c.vitals.pulse} · BP {c.vitals.bpSystolic}
          </StatusBadge>
        )}
        {c.doctor && <StatusBadge tone="info">{c.doctor.name}</StatusBadge>}
      </div>
      <div className="mt-3 flex gap-2">
        {can(role, "triage.assign") && (c.status === "Waiting" || c.status === "In triage") && (
          <Button size="sm" className="h-9 flex-1" onClick={() => onTriage(c)}>
            {c.triageLevel ? "Re-triage" : "Triage now"}
          </Button>
        )}
        <Button size="sm" variant="outline" className="h-9 flex-1" render={<Link href={`/emergency/${c.id}`} />} nativeButton={false}>
          Open case
        </Button>
      </div>
    </article>
  );
}

function RegisterDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [patient, setPatient] = useState<PatientSummary>();
  const [complaint, setComplaint] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [mode, setMode] = useState<ErCase["arrivalMode"]>("Walk-in");
  const [mlc, setMlc] = useState(false);
  const reg = useMutation({
    mutationFn: () => erService.register({ patientId: patient!.id, arrivalMode: mode, chiefComplaint: complaint.trim(), symptoms: symptoms.split(",").map((s) => s.trim()).filter(Boolean), mlc }),
    onSuccess: (c) => {
      ["er-active", "er-stats", "kpis", "activity"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success(`${c.patient.fullName} registered`, { description: `${c.caseNo}. Awaiting triage.` });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not register"),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Register ER arrival</DialogTitle>
          <DialogDescription>Search an existing UHID. For unknown patients, register a temporary record from Patients first.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (patient && complaint.trim()) reg.mutate();
          }}
        >
          {patient ? (
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <span>
                <span className="font-medium">{patient.fullName}</span> <span className="num text-xs text-muted-foreground">{patient.uhid}</span>
              </span>
              <Button type="button" variant="ghost" size="xs" onClick={() => setPatient(undefined)}>
                Change
              </Button>
            </div>
          ) : (
            <AsyncCombobox<PatientSummary> label="Patient" placeholder="Name, UHID or mobile" queryKey="patients" minChars={2} search={(q) => patientService.search(q, 8)} getKey={(p) => p.id} onSelect={setPatient} renderItem={(p) => <span><span className="block font-medium">{p.fullName}</span><span className="num block text-xs text-muted-foreground">{p.uhid} · {p.ageLabel} {p.gender[0]}</span></span>} />
          )}
          <TextField label="Chief complaint" required value={complaint} onChange={(e) => setComplaint(e.target.value)} placeholder="e.g. Chest pain for 1 hour" />
          <TextField label="Symptoms" hint="Comma separated" value={symptoms} onChange={(e) => setSymptoms(e.target.value)} placeholder="sweating, breathlessness" />
          <SelectField label="Arrival mode" value={mode} onChange={(e) => setMode(e.target.value as ErCase["arrivalMode"])} options={["Walk-in", "Ambulance (108)", "Private ambulance", "Referral", "Police"]} />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={mlc} onCheckedChange={(v) => setMlc(Boolean(v))} /> Medico-legal case (RTA, assault, poisoning, burns)
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!patient || !complaint.trim() || reg.isPending}>
              {reg.isPending && <Loader2 className="animate-spin" />} Register arrival
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function EmergencyPage() {
  const { role } = useCurrentUser();
  const [triage, setTriage] = useState<ErCaseView>();
  const [register, setRegister] = useState(false);
  const q = useQuery({ queryKey: ["er-active"], queryFn: () => erService.getActive(), staleTime: STALE.live, refetchInterval: 20_000 });
  const stats = useQuery({ queryKey: ["er-stats"], queryFn: () => erService.stats(), staleTime: STALE.live, refetchInterval: 30_000 });
  const beds = useQuery({ queryKey: ["beds", "er"], queryFn: () => ipdService.getBeds({ wardId: "WRD-ER" }), staleTime: STALE.live });
  const rows = q.data ?? [];
  const sortByAcuity = (a: ErCaseView, b: ErCaseView) => (a.triageLevel ?? 9) - (b.triageLevel ?? 9) || a.arrivedAt.localeCompare(b.arrivedAt);

  return (
    <>
      <PageHeader
        title="Emergency"
        description="Triage board. Levels follow the Emergency Severity Index (1 most urgent)."
        actions={
          can(role, "triage.assign") && (
            <Button onClick={() => setRegister(true)}>
              <Plus /> Register arrival
            </Button>
          )
        }
      />
      {stats.isLoading ? (
        <KpiSkeleton count={5} />
      ) : (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            { l: "In department", v: stats.data!.active },
            { l: "Awaiting triage", v: stats.data!.byLevel.untriaged, warn: stats.data!.byLevel.untriaged > 0 },
            { l: "Level 1-2", v: stats.data!.byLevel["1"] + stats.data!.byLevel["2"], crit: stats.data!.byLevel["1"] + stats.data!.byLevel["2"] > 0 },
            { l: "Door to triage (avg)", v: minutesLabel(stats.data!.avgDoorToTriage) },
            { l: "Arrivals today", v: stats.data!.arrivalsToday, sub: `${stats.data!.mlcToday} MLC` },
          ].map((k) => (
            <div key={k.l} className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">{k.l}</p>
              <p className={cn("mt-1 text-2xl font-semibold", k.crit && "text-critical-fg", k.warn && "text-warning-fg")}>{k.v}</p>
              {k.sub && <p className="text-xs text-muted-foreground">{k.sub}</p>}
            </div>
          ))}
        </div>
      )}

      <Panel title="ER beds" className="mb-4">
        {beds.isLoading ? (
          <PanelSkeleton lines={2} />
        ) : (
          <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4 lg:grid-cols-8">
            {(beds.data ?? []).map((b) => {
              const occupant = rows.find((r) => r.bedId === b.id);
              return (
                <div key={b.id} className={cn("rounded-lg border p-2.5", occupant ? "bg-card" : b.status === "Cleaning" ? "border-warning/50 bg-warning-soft/50" : "border-dashed border-stable/50 bg-stable-soft/40", occupant?.triageLevel && cn("border-l-4", LEVEL_BORDER[occupant.triageLevel]))}>
                  <p className="num text-xs font-semibold">{b.code}</p>
                  {occupant ? (
                    <Link href={`/emergency/${occupant.id}`} className="block truncate text-[13px] font-medium hover:underline">
                      {occupant.patient.fullName}
                    </Link>
                  ) : (
                    <p className="text-[13px] text-muted-foreground">{b.status === "Occupied" ? "Occupied" : b.status}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground">{b.features.includes("Resuscitation bay") ? "Resus bay" : "Trolley"}</p>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {q.isLoading ? (
        <PanelSkeleton lines={10} className="rounded-xl border" />
      ) : (
        <KanbanBoard
          label="Emergency triage board"
          columns={[
            { id: "wait", title: "Waiting and triage", tone: "warning", items: rows.filter((r) => r.status === "Waiting" || r.status === "In triage").sort(sortByAcuity), hint: "Untriaged first, then by level", empty: "No one waiting" },
            { id: "treat", title: "Under treatment", tone: "critical", items: rows.filter((r) => r.status === "Under treatment").sort(sortByAcuity), empty: "No active treatment" },
            { id: "obs", title: "Observation", tone: "info", items: rows.filter((r) => r.status === "Observation").sort(sortByAcuity), empty: "No patients in observation" },
          ]}
          getKey={(c) => c.id}
          renderCard={(c) => <ErCard c={c} onTriage={setTriage} />}
          minColumnWidth={320}
        />
      )}
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground" aria-label="Triage legend">
        {([1, 2, 3, 4, 5] as const).map((l) => (
          <span key={l} className="flex items-center gap-1.5">
            <TriageChip level={l} /> {TRIAGE_META[l].label}, {TRIAGE_META[l].target}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <Ambulance className="size-3.5" strokeWidth={ICON_STROKE} /> Wait turns red when the target time is breached
        </span>
      </div>
      {triage && <TriageDialog c={triage} onClose={() => setTriage(undefined)} />}
      {register && <RegisterDialog onClose={() => setRegister(false)} />}
      <span className="sr-only" aria-live="polite">
        <Siren /> {rows.filter((r) => r.triageLevel === 1).length} level 1 patients
      </span>
    </>
  );
}
