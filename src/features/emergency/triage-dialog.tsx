"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import type { ErCaseView, TriageLevel, TriageSuggestion } from "@/types";
import { aiService } from "@/services/aiService";
import { erService } from "@/services/erService";
import { AiPanel, Analyzing } from "@/components/ai/ai";
import { SelectField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCurrentUser } from "@/hooks/use-current-user";
import { TRIAGE_META } from "@/lib/clinical";
import { cn } from "@/lib/utils";

export const LEVEL_STYLE: Record<TriageLevel, string> = {
  1: "bg-critical text-white",
  2: "bg-[oklch(0.68_0.17_45)] text-white",
  3: "bg-warning text-[oklch(0.25_0.05_70)]",
  4: "bg-stable text-white",
  5: "bg-info text-white",
};
export const LEVEL_BORDER: Record<TriageLevel, string> = {
  1: "border-l-critical",
  2: "border-l-[oklch(0.68_0.17_45)]",
  3: "border-l-warning",
  4: "border-l-stable",
  5: "border-l-info",
};

export function TriageChip({ level }: { level?: TriageLevel }) {
  if (!level) return <span className="inline-flex h-6 items-center rounded-md bg-muted px-2 text-xs font-semibold text-muted-foreground">Untriaged</span>;
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs font-semibold", LEVEL_STYLE[level])}>
      L{level} <span className="font-medium">{TRIAGE_META[level].color}</span>
    </span>
  );
}

const FIELDS = [
  { key: "bpSystolic", label: "Systolic BP", min: 40, max: 260 },
  { key: "bpDiastolic", label: "Diastolic BP", min: 20, max: 160 },
  { key: "pulse", label: "Pulse", min: 20, max: 250 },
  { key: "respRate", label: "Resp. rate", min: 4, max: 70 },
  { key: "spo2", label: "SpO₂ %", min: 40, max: 100 },
  { key: "tempF", label: "Temp °F", min: 88, max: 110 },
  { key: "grbs", label: "GRBS", min: 10, max: 700 },
  { key: "painScore", label: "Pain 0-10", min: 0, max: 10 },
] as const;
type Key = (typeof FIELDS)[number]["key"];

export function TriageDialog({ c, onClose }: { c: ErCaseView; onClose: () => void }) {
  const qc = useQueryClient();
  const { user } = useCurrentUser();
  const [v, setV] = useState<Partial<Record<Key, string>>>(() => (c.vitals ? { bpSystolic: String(c.vitals.bpSystolic), bpDiastolic: String(c.vitals.bpDiastolic), pulse: String(c.vitals.pulse), respRate: String(c.vitals.respRate), spo2: String(c.vitals.spo2), tempF: String(c.vitals.tempF), grbs: c.vitals.grbs ? String(c.vitals.grbs) : "", painScore: c.vitals.painScore !== undefined ? String(c.vitals.painScore) : "" } : {}));
  const [consciousness, setConsciousness] = useState<"Alert" | "Voice" | "Pain" | "Unresponsive" | "New confusion">("Alert");
  const [level, setLevel] = useState<TriageLevel | undefined>(c.triageLevel);
  const [suggestion, setSuggestion] = useState<TriageSuggestion>();
  const num = (k: Key) => (v[k] ? Number(v[k]) : undefined);
  const vitals = { bpSystolic: num("bpSystolic"), bpDiastolic: num("bpDiastolic"), pulse: num("pulse"), respRate: num("respRate"), spo2: num("spo2"), tempF: num("tempF"), grbs: num("grbs"), painScore: num("painScore"), gcs: consciousness === "Alert" ? 15 : consciousness === "Unresponsive" ? 6 : consciousness === "Pain" ? 8 : 13 };

  const suggest = useMutation({
    mutationFn: () => aiService.suggestTriage({ age: c.patient.ageYears, complaint: c.chiefComplaint, symptoms: c.symptoms, vitals }),
    onSuccess: setSuggestion,
  });
  const save = useMutation({
    mutationFn: () =>
      erService.triage(c.id, level!, { bpSystolic: vitals.bpSystolic ?? 0, bpDiastolic: vitals.bpDiastolic ?? 0, pulse: vitals.pulse ?? 0, respRate: vitals.respRate ?? 0, spo2: vitals.spo2 ?? 0, tempF: vitals.tempF ?? 98.4, grbs: vitals.grbs, painScore: vitals.painScore, gcs: vitals.gcs, consciousness, recordedBy: user?.name ?? "ER Nurse" }, user?.name ?? "ER Nurse"),
    onSuccess: (r) => {
      ["er-active", "er-case", "er-stats", "kpis", "notifications"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success(`Triaged level ${r.triageLevel} (${TRIAGE_META[r.triageLevel!].label})`, { description: r.patient.fullName });
      onClose();
    },
  });
  const coreDone = (["bpSystolic", "pulse", "respRate", "spo2"] as Key[]).every((k) => v[k]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Triage: {c.patient.fullName}</DialogTitle>
          <DialogDescription>
            {c.patient.ageLabel} {c.patient.gender[0]} · {c.chiefComplaint} · arrived by {c.arrivalMode}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {FIELDS.map((f) => (
              <TextField key={f.key} label={f.label} type="number" inputMode="decimal" value={v[f.key] ?? ""} onChange={(e) => { setV((cur) => ({ ...cur, [f.key]: e.target.value })); setSuggestion(undefined); }} />
            ))}
          </div>
          <SelectField label="Level of consciousness" value={consciousness} onChange={(e) => { setConsciousness(e.target.value as typeof consciousness); setSuggestion(undefined); }} options={["Alert", "New confusion", "Voice", "Pain", "Unresponsive"]} />

          <AiPanel title="Smart triage" meta={suggestion?.meta}>
            {suggest.isPending ? (
              <Analyzing label="Assessing" steps={["Chief complaint and symptoms", "Vital sign thresholds", "Red-flag rules (ESI v4)"]} />
            ) : suggestion ? (
              <div className="space-y-3 p-4 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-muted-foreground">Suggested level</span>
                  <TriageChip level={suggestion.level} />
                  <span className="text-xs text-muted-foreground">
                    {TRIAGE_META[suggestion.level].label}, see within {TRIAGE_META[suggestion.level].target}
                  </span>
                  {level !== suggestion.level && (
                    <Button size="xs" variant="outline" className="ml-auto" onClick={() => setLevel(suggestion.level)}>
                      Use suggestion
                    </Button>
                  )}
                </div>
                <ul className="list-disc space-y-0.5 pl-5 text-[13px]">
                  {suggestion.rationale.map((r) => (
                    <li key={r} className={suggestion.redFlags.includes(r) ? "text-critical-fg" : undefined}>
                      {r}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">Suggested actions: {suggestion.suggestedActions.join("; ")}</p>
              </div>
            ) : (
              <div className="flex flex-col items-start gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">Suggests an ESI level from the complaint, symptoms and vitals. The triage nurse makes the final call.</p>
                <Button size="sm" variant="outline" onClick={() => suggest.mutate()} disabled={!coreDone}>
                  <Sparkles /> Suggest level
                </Button>
              </div>
            )}
          </AiPanel>

          <div className="grid gap-1.5">
            <span className="text-[13px] font-medium" id="lvl">
              Triage level (your decision)
            </span>
            <div role="radiogroup" aria-labelledby="lvl" className="grid grid-cols-5 gap-2">
              {([1, 2, 3, 4, 5] as TriageLevel[]).map((l) => (
                <button key={l} type="button" role="radio" aria-checked={level === l} onClick={() => setLevel(l)} className={cn("flex flex-col items-center rounded-lg border px-2 py-2 text-xs focus-visible:outline-2", level === l ? cn(LEVEL_STYLE[l], "border-transparent") : "hover:border-border-strong")}>
                  <span className="text-base font-semibold">{l}</span>
                  <span>{TRIAGE_META[l].color}</span>
                  <span className={cn("text-[10px]", level === l ? "opacity-90" : "text-muted-foreground")}>{TRIAGE_META[l].target}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!level || !coreDone || save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />} Save triage
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
