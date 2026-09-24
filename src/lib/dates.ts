import { format } from "date-fns";

/**
 * Local calendar date ("yyyy-MM-dd") for either a plain date string or an ISO
 * timestamp. Never slice ISO timestamps: they are UTC, and IST is +05:30.
 */
export function localDate(value: string | Date): string {
  if (typeof value === "string" && value.length === 10) return value;
  return format(typeof value === "string" ? new Date(value) : value, "yyyy-MM-dd");
}

export function todayLocal(): string {
  return format(new Date(), "yyyy-MM-dd");
}
