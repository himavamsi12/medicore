import { differenceInMinutes, format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday } from "date-fns";

const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat("en-IN");

/** ₹1,24,500 (Indian digit grouping). */
export function inr(value: number, paise = false): string {
  return (paise ? inr2 : inr0).format(value);
}

/** Compact INR using lakh / crore: ₹4.2 L, ₹1.38 Cr. */
export function inrCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(abs >= 1e8 ? 1 : 2)} Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(abs >= 1e6 ? 1 : 2)} L`;
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)}K`;
  return `${sign}₹${Math.round(abs)}`;
}

export function number(value: number, decimals = 0): string {
  return decimals ? value.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : num.format(value);
}

export function percent(value: number, decimals = 0): string {
  return `${value.toFixed(decimals)}%`;
}

export function date(value: string | Date, pattern = "d MMM yyyy"): string {
  return format(typeof value === "string" ? new Date(value.length === 10 ? `${value}T00:00:00` : value) : value, pattern);
}

export function time(value: string | Date): string {
  return format(typeof value === "string" ? new Date(value) : value, "HH:mm");
}

export function dateTime(value: string | Date): string {
  return format(typeof value === "string" ? new Date(value) : value, "d MMM, HH:mm");
}

/** "Today 14:20", "Yesterday 09:10", "12 Sep 08:05". */
export function relativeDay(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (isToday(d)) return `Today ${format(d, "HH:mm")}`;
  if (isYesterday(d)) return `Yesterday ${format(d, "HH:mm")}`;
  if (isTomorrow(d)) return `Tomorrow ${format(d, "HH:mm")}`;
  return format(d, "d MMM, HH:mm");
}

/** "4 min ago", "2 h ago" with short units. */
export function ago(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const mins = differenceInMinutes(new Date(), d);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)} h ago`;
  return formatDistanceToNowStrict(d, { addSuffix: true });
}

export function minutesLabel(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function initials(name: string): string {
  return name
    .replace(/^(Dr\.|Baby of)\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function maskAbha(abha?: string): string {
  if (!abha) return "Not linked";
  return `${abha.slice(0, 3)}XXXX-XXXX-${abha.slice(-4)}`;
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
