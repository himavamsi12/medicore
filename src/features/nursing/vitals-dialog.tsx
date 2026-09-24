"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { PatientSummary, Vitals } from "@/types";
import { patientService } from "@/services/patientService";
import { SelectField, TextField } from "@/components/forms/fields";
import { StatusBadge } from "@/components/feedback/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCurrentUser } from "@/hooks/use-current-user";
import { news2, news2Components } from "@/lib/clinical";

const NUM = [
  { key: "bpSystolic", label: "Systolic BP", unit: "mmHg", min: 40, max: 260 },
  { key: "bpDiastolic", label: "Diastolic BP", unit: "mmHg", min: 20, max: 160 },
  { key: "pulse", label: "Pulse", unit: "/min", min: 20, max: 250 },
  { key: "respRate", label: "Resp. rate", unit: "/min", min: 4, max: 70 },
  { key: "spo2", label: "SpO₂", unit: "%", min: 50, max: 100 },
  { key: "tempF", label: "Temperature", unit: "°F", min: 88, max: 110, step: 0.1 },
  { key: "painScore", label: "Pain score", unit: "0-10", min: 0, max: 10 },
  { key: "grbs", label: "GRBS", unit: "mg/dL", min: 20, max: 600 },
] as const;
type NumKey = (typeof NUM)[number]["key"];
const REQUIRED: NumKey[] = ["bpSystolic", "bpDiastolic", "pulse", "respRate", "spo2", "tempF"];

/** Bedside vitals entry with live NEWS2 so escalation is visible before saving. */
export function VitalsDialog({ patient, source = "IPD", onClose }: { patient: PatientSummary; source?: Vitals["source"]; onClose: () => void }) {
  const qc = useQueryClient();
  const { user } = useCurrentUser();
  const [v, setV] = useState<Partial<Record<NumKey, string>>>({});
  const [consciousness, setConsciousness] = useState<NonNullable<Vitals["consciousness"]>>("Alert");
  const [onOxygen, setOnOxygen] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<NumKey, string>>>({});

  const complete = REQUIRED.every((k) => v[k] && !Number.isNaN(Number(v[k])));
  const preview = complete ? { respRate: Number(v.respRate), spo2: Number(v.spo2), bpSystolic: Number(v.bpSystolic), pulse: Number(v.pulse), tempF: Number(v.tempF), consciousness, onOxygen } : undefined;
  const score = preview ? news2(preview) : undefined;
  const single3 = preview ? news2Components(preview).some((c) => c.points === 3) : false;

  const save = useMutation({
    mutationFn: () =>
      patientService.recordVitals({
        patientId: patient.id,
        recordedBy: user?.name ?? "Staff Nurse",
        source,
        bpSystolic: Number(v.bpSystolic),
        bpDiastolic: Number(v.bpDiastolic),
        pulse: Number(v.pulse),
        respRate: Number(v.respRate),
        spo2: Number(v.spo2),
        tempF: Number(v.tempF),
        painScore: v.painScore ? Number(v.painScore) : undefined,
        grbs: v.grbs ? Number(v.grbs) : undefined,
        consciousness,
        onOxygen,
        gcs: consciousness === "Alert" ? 15 : consciousness === "Voice" ? 13 : consciousness === "Pain" ? 9 : consciousness === "Unresponsive" ? 5 : 14,
      }),
    onSuccess: () => {
      ["vitals", "ward-patients", "risk", "patient", "admission", "admissions", "beds", "kpis"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success("Vitals recorded", { description: score !== undefined ? `NEWS2 ${score}${score >= 5 ? ". Escalate per protocol." : ""}` : undefined });
      onClose();
    },
  });

  const submit = () => {
    const errs: Partial<Record<NumKey, string>> = {};
    for (const f of NUM) {
      const raw = v[f.key];
      if (!raw) {
        if (REQUIRED.includes(f.key)) errs[f.key] = "Required";
        continue;
      }
      const n = Number(raw);
      if (Number.isNaN(n) || n < f.min || n > f.max) errs[f.key] = `${f.min}-${f.max}`;
    }
    setErrors(errs);
    if (!Object.keys(errs).length) save.mutate();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Record vitals</DialogTitle>
          <DialogDescription>
            {patient.fullName} · {patient.ageLabel} {patient.gender[0]} · {patient.uhid}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {NUM.map((f) => (
              <TextField
                key={f.key}
                label={`${f.label}`}
                hint={f.unit}
                type="number"
                inputMode="decimal"
                step={"step" in f ? f.step : 1}
                required={REQUIRED.includes(f.key)}
                value={v[f.key] ?? ""}
                error={errors[f.key]}
                onChange={(e) => setV((cur) => ({ ...cur, [f.key]: e.target.value }))}
              />
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
            <SelectField label="Level of consciousness (ACVPU)" value={consciousness} onChange={(e) => setConsciousness(e.target.value as NonNullable<Vitals["consciousness"]>)} options={["Alert", "New confusion", "Voice", "Pain", "Unresponsive"]} />
            <label className="flex h-9 items-center gap-2 text-sm">
              <Checkbox checked={onOxygen} onCheckedChange={(c) => setOnOxygen(Boolean(c))} /> On supplemental oxygen
            </label>
          </div>
          <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2.5" aria-live="polite">
            <span className="text-sm text-muted-foreground">NEWS2 (live)</span>
            {score === undefined ? (
              <span className="text-sm text-muted-foreground">Enter the six core values</span>
            ) : (
              <span className="flex items-center gap-2">
                <span className="text-xl font-semibold">{score}</span>
                <StatusBadge tone={score >= 7 ? "critical" : score >= 5 ? "warning" : single3 ? "warning" : "stable"}>{score >= 7 ? "Emergency response" : score >= 5 ? "Urgent response" : single3 ? "Urgent ward review" : score >= 1 ? "Low" : "Routine"}</StatusBadge>
              </span>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />} Save vitals
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
