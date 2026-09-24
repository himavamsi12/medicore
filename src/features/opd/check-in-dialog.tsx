"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { AppointmentView } from "@/types";
import { appointmentService } from "@/services/appointmentService";
import { TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCurrentUser } from "@/hooks/use-current-user";

const FIELDS = [
  { key: "bpSystolic", label: "BP systolic", unit: "mmHg", min: 50, max: 260 },
  { key: "bpDiastolic", label: "BP diastolic", unit: "mmHg", min: 30, max: 160 },
  { key: "pulse", label: "Pulse", unit: "/min", min: 20, max: 240 },
  { key: "spo2", label: "SpO₂", unit: "%", min: 50, max: 100 },
  { key: "tempF", label: "Temperature", unit: "°F", min: 90, max: 110, step: 0.1 },
  { key: "respRate", label: "Resp. rate", unit: "/min", min: 4, max: 60 },
  { key: "weightKg", label: "Weight", unit: "kg", min: 1, max: 250, step: 0.1 },
] as const;

type Key = (typeof FIELDS)[number]["key"];

/** Check-in with optional triage vitals (captured at the OPD nursing desk). */
export function CheckInDialog({ appt, onClose }: { appt: AppointmentView; onClose: () => void }) {
  const qc = useQueryClient();
  const { user } = useCurrentUser();
  const [values, setValues] = useState<Partial<Record<Key, string>>>({});
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({});
  const m = useMutation({
    mutationFn: (withVitals: boolean) => {
      const num = (k: Key) => Number(values[k]);
      return appointmentService.checkIn(
        appt.id,
        withVitals
          ? { bpSystolic: num("bpSystolic"), bpDiastolic: num("bpDiastolic"), pulse: num("pulse"), spo2: num("spo2"), tempF: num("tempF"), respRate: num("respRate") || 16, weightKg: values.weightKg ? num("weightKg") : undefined, recordedBy: user?.name ?? "OPD Nurse" }
          : undefined,
      );
    },
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ["queue"] });
      qc.invalidateQueries({ queryKey: ["appointments"] });
      toast.success(`Token ${a.token} issued`, { description: `${a.patient.fullName} is waiting for ${a.doctor.name}` });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Check-in failed"),
  });

  const submit = (withVitals: boolean) => {
    if (withVitals) {
      const errs: Partial<Record<Key, string>> = {};
      for (const f of FIELDS) {
        const raw = values[f.key];
        if (!raw) {
          if (f.key !== "weightKg" && f.key !== "respRate") errs[f.key] = "Required";
          continue;
        }
        const v = Number(raw);
        if (Number.isNaN(v) || v < f.min || v > f.max) errs[f.key] = `Enter ${f.min}-${f.max}`;
      }
      setErrors(errs);
      if (Object.keys(errs).length) return;
    }
    m.mutate(withVitals);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Check in {appt.patient.fullName}</DialogTitle>
          <DialogDescription>
            {appt.time} with {appt.doctor.name}. Record triage vitals now or let the doctor capture them.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(true);
          }}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {FIELDS.map((f) => (
              <TextField
                key={f.key}
                label={`${f.label} (${f.unit})`}
                inputMode="decimal"
                type="number"
                step={"step" in f ? f.step : 1}
                value={values[f.key] ?? ""}
                error={errors[f.key]}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => submit(false)} disabled={m.isPending}>
              Check in without vitals
            </Button>
            <Button type="submit" disabled={m.isPending}>
              {m.isPending && <Loader2 className="animate-spin" />} Check in and save vitals
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
