import { differenceInYears, differenceInMonths, parseISO } from "date-fns";
import type { LabParameter, ResultFlag, Severity, TriageLevel } from "@/types";

/** Flag a numeric or qualitative lab result against its reference and critical ranges. */
export function flagResult(param: LabParameter, value: number | string): ResultFlag {
  if (typeof value === "string") {
    if (!param.refText) return "N";
    const v = value.trim().toLowerCase();
    const ref = param.refText.toLowerCase();
    if (v === ref || v === "nil" || v === "negative" || v === "non-reactive" || v === "no growth" || v === "< 1:80") return "N";
    return "A";
  }
  if (param.criticalLow !== undefined && value <= param.criticalLow) return "LL";
  if (param.criticalHigh !== undefined && value >= param.criticalHigh) return "HH";
  if (param.refLow !== undefined && value < param.refLow) return "L";
  if (param.refHigh !== undefined && value > param.refHigh) return "H";
  return "N";
}

export function flagSeverity(flag: ResultFlag): Severity {
  if (flag === "LL" || flag === "HH") return "critical";
  if (flag === "L" || flag === "H" || flag === "A") return "warning";
  return "neutral";
}

export function formatRange(p: LabParameter): string {
  if (p.refText) return p.refText;
  if (p.refLow !== undefined && p.refHigh !== undefined) {
    if (p.refLow === 0) return `< ${p.refHigh}`;
    return `${p.refLow} - ${p.refHigh}`;
  }
  if (p.refHigh !== undefined) return `< ${p.refHigh}`;
  if (p.refLow !== undefined) return `> ${p.refLow}`;
  return "-";
}

export function roundTo(value: number, decimals = 0): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** Age label used across the UI: "54 y", "7 m", "12 d". */
export function ageLabel(dob: string, now = new Date()): string {
  const d = parseISO(dob);
  const years = differenceInYears(now, d);
  if (years >= 2) return `${years} y`;
  const months = differenceInMonths(now, d);
  if (months >= 1) return `${months} m`;
  const days = Math.max(0, Math.round((now.getTime() - d.getTime()) / 86400000));
  return `${days} d`;
}

export function ageYears(dob: string, now = new Date()): number {
  return differenceInYears(now, parseISO(dob));
}

export const TRIAGE_META: Record<TriageLevel, { label: string; color: string; target: string; severity: Severity }> = {
  1: { label: "Resuscitation", color: "Red", target: "Immediate", severity: "critical" },
  2: { label: "Emergent", color: "Orange", target: "< 10 min", severity: "critical" },
  3: { label: "Urgent", color: "Yellow", target: "< 30 min", severity: "warning" },
  4: { label: "Less urgent", color: "Green", target: "< 60 min", severity: "stable" },
  5: { label: "Non-urgent", color: "Blue", target: "< 120 min", severity: "neutral" },
};

/* ---------- NEWS2 (Royal College of Physicians) ---------- */

export interface VitalsLike {
  respRate: number;
  spo2: number;
  bpSystolic: number;
  pulse: number;
  tempF: number;
  consciousness?: string;
  onOxygen?: boolean;
}

export function fToC(f: number): number {
  return roundTo(((f - 32) * 5) / 9, 1);
}

export function news2Components(v: VitalsLike): { label: string; value: string; points: number }[] {
  const rr = v.respRate;
  const rrP = rr <= 8 ? 3 : rr <= 11 ? 1 : rr <= 20 ? 0 : rr <= 24 ? 2 : 3;
  const s = v.spo2;
  const spP = s <= 91 ? 3 : s <= 93 ? 2 : s <= 95 ? 1 : 0;
  const o2P = v.onOxygen ? 2 : 0;
  const sbp = v.bpSystolic;
  const sbpP = sbp <= 90 ? 3 : sbp <= 100 ? 2 : sbp <= 110 ? 1 : sbp <= 219 ? 0 : 3;
  const hr = v.pulse;
  const hrP = hr <= 40 ? 3 : hr <= 50 ? 1 : hr <= 90 ? 0 : hr <= 110 ? 1 : hr <= 130 ? 2 : 3;
  const t = fToC(v.tempF);
  const tP = t <= 35 ? 3 : t <= 36 ? 1 : t <= 38 ? 0 : t <= 39 ? 1 : 2;
  const alert = !v.consciousness || v.consciousness === "Alert";
  const cP = alert ? 0 : 3;
  return [
    { label: "Respiratory rate", value: `${rr} /min`, points: rrP },
    { label: "SpO₂", value: `${s}%`, points: spP },
    { label: "Supplemental O₂", value: v.onOxygen ? "Yes" : "Room air", points: o2P },
    { label: "Systolic BP", value: `${sbp} mmHg`, points: sbpP },
    { label: "Pulse", value: `${hr} /min`, points: hrP },
    { label: "Temperature", value: `${t} °C`, points: tP },
    { label: "Consciousness", value: v.consciousness ?? "Alert", points: cP },
  ];
}

export function news2(v: VitalsLike): number {
  return news2Components(v).reduce((s, c) => s + c.points, 0);
}

export function news2Level(score: number, anySingle3 = false): "Low" | "Moderate" | "High" | "Critical" {
  if (score >= 7) return "Critical";
  if (score >= 5) return "High";
  if (score >= 1 && anySingle3) return "Moderate";
  if (score >= 1) return "Low";
  return "Low";
}
