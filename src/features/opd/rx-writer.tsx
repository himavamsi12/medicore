"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertOctagon, AlertTriangle, Info, Pill, ShieldCheck, Trash2 } from "lucide-react";
import type { Drug, DrugAlert, Frequency, Route } from "@/types";
import { aiService } from "@/services/aiService";
import { pharmacyService } from "@/services/pharmacyService";
import { AiPanel, Analyzing } from "@/components/ai/ai";
import { AsyncCombobox } from "@/components/forms/async-combobox";
import { StatusBadge } from "@/components/feedback/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ICON_STROKE } from "@/lib/constants";
import { cn } from "@/lib/utils";

export interface RxDraftItem {
  key: string;
  drug: Drug & { onHand: number };
  dose: string;
  frequency: Frequency;
  route: Route;
  durationDays: number;
  instructions: string;
}

export const FREQUENCIES: { value: Frequency; label: string; perDay: number }[] = [
  { value: "1-0-0", label: "1-0-0 (morning)", perDay: 1 },
  { value: "0-1-0", label: "0-1-0 (afternoon)", perDay: 1 },
  { value: "0-0-1", label: "0-0-1 (night)", perDay: 1 },
  { value: "1-0-1", label: "1-0-1 (twice)", perDay: 2 },
  { value: "1-1-1", label: "1-1-1 (thrice)", perDay: 3 },
  { value: "1-1-1-1", label: "1-1-1-1 (four times)", perDay: 4 },
  { value: "0-0-0-1", label: "0-0-0-1 (bedtime)", perDay: 1 },
  { value: "Q6H", label: "Every 6 hours", perDay: 4 },
  { value: "Q8H", label: "Every 8 hours", perDay: 3 },
  { value: "SOS", label: "SOS (as needed)", perDay: 1 },
  { value: "STAT", label: "STAT (once)", perDay: 1 },
  { value: "Weekly", label: "Once weekly", perDay: 1 / 7 },
];
const ROUTES: Route[] = ["Oral", "IV", "IM", "SC", "Inhalation", "Topical", "Sublingual", "Nasal", "Ophthalmic"];
const INSTRUCTIONS = ["After food", "Before food", "Before breakfast, empty stomach", "At bedtime", "With plenty of water", "Only if needed", "Rinse mouth after use"];

export function defaultsFor(d: Drug): Pick<RxDraftItem, "dose" | "route" | "frequency" | "instructions"> {
  const route: Route = d.form === "Injection" || d.form === "Infusion" ? "IV" : d.form === "Inhaler" || d.form === "Drops" ? "Inhalation" : d.form === "Ointment" ? "Topical" : "Oral";
  const dose = d.form === "Tablet" ? "1 tab" : d.form === "Capsule" ? "1 cap" : d.form === "Syrup" || d.form === "Suspension" ? "5 ml" : d.form === "Inhaler" ? "2 puffs" : d.form === "Ointment" ? "Thin layer" : d.strength;
  return { dose, route, frequency: "1-0-1", instructions: route === "Oral" ? "After food" : "As directed" };
}

export function quantityFor(item: Pick<RxDraftItem, "frequency" | "durationDays" | "drug">): number {
  const perDay = FREQUENCIES.find((f) => f.value === item.frequency)?.perDay ?? 1;
  if (["Tablet", "Capsule", "Injection", "Infusion"].includes(item.drug.form)) return Math.max(1, Math.ceil(perDay * item.durationDays));
  return 1;
}

const SEV_ICON = { Contraindicated: AlertOctagon, Major: AlertTriangle, Moderate: AlertTriangle, Minor: Info } as const;
const SEV_TONE = { Contraindicated: "critical", Major: "critical", Moderate: "warning", Minor: "neutral" } as const;

export function blockingAlerts(alerts: DrugAlert[] | undefined): DrugAlert[] {
  return (alerts ?? []).filter((a) => a.severity === "Contraindicated" || a.severity === "Major");
}

export function RxWriter({
  items,
  onChange,
  patientId,
  acknowledged,
  onAcknowledge,
  overrideReason,
  onOverrideReason,
}: {
  items: RxDraftItem[];
  onChange: (items: RxDraftItem[]) => void;
  patientId: string;
  acknowledged: boolean;
  onAcknowledge: (v: boolean) => void;
  overrideReason: string;
  onOverrideReason: (v: string) => void;
}) {
  const drugIds = items.map((i) => i.drug.id);
  const check = useQuery({ queryKey: ["rx-check", patientId, drugIds], queryFn: () => aiService.checkPrescription(patientId, drugIds), enabled: drugIds.length > 0, placeholderData: (prev) => prev });
  const update = (key: string, patch: Partial<RxDraftItem>) => onChange(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const alerts = drugIds.length ? check.data?.alerts ?? [] : [];
  const blocking = blockingAlerts(alerts);

  return (
    <div className="grid gap-4 2xl:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-3">
        <AsyncCombobox<Drug & { onHand: number }>
          label="Add medicine"
          hideLabel
          placeholder="Search brand or generic, e.g. Dolo, pantoprazole"
          queryKey="drugs"
          search={(q) => pharmacyService.searchDrugs(q, 10)}
          getKey={(d) => d.id}
          onSelect={(d) => {
            if (items.some((i) => i.drug.id === d.id)) return;
            onChange([...items, { key: `${d.id}-${Date.now()}`, drug: d, durationDays: 5, ...defaultsFor(d) }]);
          }}
          renderItem={(d) => (
            <span className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {d.brand} <span className="font-normal text-muted-foreground">{d.strength}</span>
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {d.generic} · {d.form} · Sch. {d.schedule}
                </span>
              </span>
              <span className={cn("num shrink-0 text-xs", d.onHand === 0 ? "text-critical-fg" : "text-muted-foreground")}>{d.onHand === 0 ? "Out of stock" : `${d.onHand} in stock`}</span>
            </span>
          )}
        />
        {items.length === 0 ? (
          <p className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
            <Pill className="size-4" strokeWidth={ICON_STROKE} /> No medicines added. Search above to prescribe.
          </p>
        ) : (
          <ol className="space-y-2">
            {items.map((it, idx) => {
              const itemAlerts = alerts.filter((a) => a.drugs.some((x) => x.startsWith(it.drug.brand)));
              const worst = itemAlerts[0];
              return (
                <li key={it.key} className={cn("rounded-lg border p-3", worst && (worst.severity === "Contraindicated" || worst.severity === "Major") && "border-critical/40 bg-critical-soft/20")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        <span className="num mr-1.5 text-muted-foreground">{idx + 1}.</span>
                        {it.drug.brand} <span className="font-normal text-muted-foreground">{it.drug.strength}</span>
                        {it.drug.highAlert && <StatusBadge tone="warning" className="ml-2">High alert</StatusBadge>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {it.drug.generic} · {it.drug.form}
                      </p>
                    </div>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${it.drug.brand}`} onClick={() => onChange(items.filter((i) => i.key !== it.key))}>
                      <Trash2 />
                    </Button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.6fr)_minmax(0,1.4fr)_minmax(0,0.4fr)]">
                    <label className="grid gap-1 text-[11px] text-muted-foreground">
                      Dose
                      <input value={it.dose} onChange={(e) => update(it.key, { dose: e.target.value })} className="h-8 rounded-md border border-input bg-card px-2 text-sm text-foreground outline-none focus-visible:border-ring" />
                    </label>
                    <label className="grid gap-1 text-[11px] text-muted-foreground">
                      Frequency
                      <select value={it.frequency} onChange={(e) => update(it.key, { frequency: e.target.value as Frequency })} className="h-8 rounded-md border border-input bg-card px-1.5 text-sm text-foreground outline-none focus-visible:border-ring">
                        {FREQUENCIES.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-[11px] text-muted-foreground">
                      Route
                      <select value={it.route} onChange={(e) => update(it.key, { route: e.target.value as Route })} className="h-8 rounded-md border border-input bg-card px-1.5 text-sm text-foreground outline-none focus-visible:border-ring">
                        {ROUTES.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-[11px] text-muted-foreground">
                      Days
                      <input type="number" min={1} max={180} value={it.durationDays} onChange={(e) => update(it.key, { durationDays: Math.max(1, Number(e.target.value) || 1) })} className="num h-8 rounded-md border border-input bg-card px-2 text-sm text-foreground outline-none focus-visible:border-ring" />
                    </label>
                    <label className="col-span-2 grid gap-1 text-[11px] text-muted-foreground md:col-span-1">
                      Instructions
                      <input list="rx-instructions" value={it.instructions} onChange={(e) => update(it.key, { instructions: e.target.value })} className="h-8 rounded-md border border-input bg-card px-2 text-sm text-foreground outline-none focus-visible:border-ring" />
                    </label>
                    <div className="grid gap-1 text-[11px] text-muted-foreground">
                      Qty
                      <span className="num flex h-8 items-center text-sm text-foreground">{quantityFor(it)}</span>
                    </div>
                  </div>
                  {worst && (
                    <p className={cn("mt-2 flex items-center gap-1.5 text-xs", SEV_TONE[worst.severity] === "critical" ? "text-critical-fg" : "text-warning-fg")}>
                      <AlertTriangle className="size-3.5" /> {worst.severity}: {worst.title}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        <datalist id="rx-instructions">
          {INSTRUCTIONS.map((i) => (
            <option key={i} value={i} />
          ))}
        </datalist>
      </div>

      <AiPanel title="Drug safety check" meta={drugIds.length ? check.data?.meta : undefined} className="self-start">
        {drugIds.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Checks each medicine against allergies, current medications, conditions, kidney function and duplicate therapy as you prescribe.</p>
        ) : check.isLoading ? (
          <Analyzing label="Checking" steps={["Allergy list", "Current medications", "Problem list and eGFR", "Interaction knowledge base"]} />
        ) : alerts.length === 0 ? (
          <p className="flex items-center gap-2 p-4 text-sm text-stable-fg">
            <ShieldCheck className="size-4" /> No interactions or allergy conflicts found.
          </p>
        ) : (
          <div className={cn("space-y-3 p-4 transition-opacity", check.isFetching && "opacity-60")} aria-live="polite">
            <ul className="space-y-3">
              {alerts.map((a) => {
                const Icon = SEV_ICON[a.severity];
                return (
                  <li key={a.id} className="space-y-1">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <Icon className={cn("size-4 shrink-0", SEV_TONE[a.severity] === "critical" ? "text-critical-fg" : SEV_TONE[a.severity] === "warning" ? "text-warning-fg" : "text-muted-foreground")} aria-hidden />
                      {a.title}
                    </p>
                    <div className="flex flex-wrap gap-1.5 pl-6">
                      <StatusBadge tone={SEV_TONE[a.severity]}>{a.severity}</StatusBadge>
                      <span className="text-xs text-muted-foreground">{a.drugs.join(" + ")}</span>
                    </div>
                    <p className="pl-6 text-xs text-muted-foreground">{a.detail}</p>
                    <p className="pl-6 text-xs">
                      <span className="font-medium">Suggestion: </span>
                      {a.recommendation}
                    </p>
                  </li>
                );
              })}
            </ul>
            {blocking.length > 0 && (
              <div className="space-y-2 rounded-lg border border-critical/30 bg-critical-soft/30 p-3">
                <label className="flex items-start gap-2 text-xs font-medium">
                  <Checkbox checked={acknowledged} onCheckedChange={(v) => onAcknowledge(Boolean(v))} className="mt-0.5" />
                  I have reviewed {blocking.length === 1 ? "this alert" : `these ${blocking.length} alerts`} and wish to proceed
                </label>
                {acknowledged && (
                  <label className="grid gap-1 text-xs">
                    Reason for override
                    <input value={overrideReason} onChange={(e) => onOverrideReason(e.target.value)} placeholder="e.g. Benefit outweighs risk, INR to be monitored" className="h-8 rounded-md border border-input bg-card px-2 text-sm outline-none focus-visible:border-ring" />
                  </label>
                )}
              </div>
            )}
          </div>
        )}
      </AiPanel>
    </div>
  );
}
