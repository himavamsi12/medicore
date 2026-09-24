/** ISO-8601 timestamp string, e.g. "2026-09-23T10:15:00.000Z". */
export type ISODateTime = string;
/** Calendar date string, "yyyy-MM-dd". */
export type ISODate = string;
/** Amount in Indian Rupees (whole rupees, may include paise as decimals). */
export type INR = number;

export type Gender = "Male" | "Female" | "Other";
export type BloodGroup = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";

export type Severity = "critical" | "warning" | "stable" | "info" | "neutral";

export type Priority = "Routine" | "Urgent" | "STAT";

export interface SortSpec {
  id: string;
  desc: boolean;
}

export type FilterValue = string | string[] | number | boolean | undefined;

/** Standard list query contract. Every list endpoint accepts this shape. */
export interface ListParams {
  search?: string;
  page?: number; // 0-based
  pageSize?: number;
  sort?: SortSpec[];
  filters?: Record<string, FilterValue>;
  dateFrom?: ISODate;
  dateTo?: ISODate;
}

export interface Paginated<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
}

export interface PersonRef {
  id: string;
  name: string;
}
