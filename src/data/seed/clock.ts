import { addDays, addMinutes, format, setHours, setMinutes, startOfDay } from "date-fns";

/**
 * All mock timestamps are anchored to the moment the data module loads,
 * so "today", "this week" and "overdue" always read naturally.
 */
export const NOW = new Date();
export const TODAY = startOfDay(NOW);

/**
 * OPD "clinic clock". Outside clinic hours (before 09:30 or after 17:30) the
 * mock OPD behaves as if it is 11:20 so queues and consultations look alive.
 * All other timestamps use the real NOW.
 */
export const CLINIC_NOW: Date = (() => {
  const h = NOW.getHours() + NOW.getMinutes() / 60;
  if (h >= 9.5 && h < 17.5) return NOW;
  return setMinutes(setHours(TODAY, 11), 20);
})();

export function iso(d: Date): string {
  return d.toISOString();
}

export function day(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/** A date `offset` days from today at hh:mm local time. */
export function at(offsetDays: number, hh: number, mm = 0): Date {
  return setMinutes(setHours(addDays(TODAY, offsetDays), hh), mm);
}

export function minutesAgo(min: number): Date {
  return addMinutes(NOW, -min);
}

export function hoursAgo(h: number): Date {
  return addMinutes(NOW, -Math.round(h * 60));
}

export function daysAgo(d: number): Date {
  return addDays(NOW, -d);
}

export function daysFromToday(d: number): string {
  return day(addDays(TODAY, d));
}
