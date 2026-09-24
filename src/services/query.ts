import type { FilterValue, ListParams, Paginated } from "@/types";
import { localDate } from "@/lib/dates";

export interface QueryConfig<T> {
  /** Strings to match free-text search against. */
  search?: (row: T) => (string | undefined)[];
  /** Filter predicates keyed by filter id. Receives the raw filter value. */
  filters?: Record<string, (row: T, value: FilterValue) => boolean>;
  /** Sort accessors keyed by column id. */
  sort?: Record<string, (row: T) => string | number | undefined>;
  /** Optional date accessor for dateFrom / dateTo range filters. */
  date?: (row: T) => string | undefined;
  defaultSort?: { id: string; desc: boolean };
}

export const DEFAULT_PAGE_SIZE = 20;

const asArray = (v: FilterValue): string[] => (v === undefined || v === "" ? [] : Array.isArray(v) ? v : [String(v)]);

/** Match helper for multi-select filters: row value must be one of the selected values. */
export function oneOf(value: string | undefined, filter: FilterValue): boolean {
  const selected = asArray(filter);
  return selected.length === 0 || (value !== undefined && selected.includes(value));
}

/**
 * Applies search, filters, date range, sort and pagination the way a real list
 * API would. All list endpoints in the mock service layer use this.
 */
export function runQuery<T>(rows: T[], params: ListParams = {}, config: QueryConfig<T> = {}): Paginated<T> {
  let out = rows;

  const q = params.search?.trim().toLowerCase();
  if (q && config.search) {
    const terms = q.split(/\s+/);
    out = out.filter((row) => {
      const hay = config.search!(row).filter(Boolean).join(" ").toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }

  if (params.filters && config.filters) {
    for (const [key, value] of Object.entries(params.filters)) {
      const fn = config.filters[key];
      if (!fn || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) continue;
      out = out.filter((row) => fn(row, value));
    }
  }

  if ((params.dateFrom || params.dateTo) && config.date) {
    out = out.filter((row) => {
      const raw = config.date!(row);
      const d = raw ? localDate(raw) : undefined;
      if (!d) return false;
      if (params.dateFrom && d < params.dateFrom) return false;
      if (params.dateTo && d > params.dateTo) return false;
      return true;
    });
  }

  const sorts = params.sort?.length ? params.sort : config.defaultSort ? [config.defaultSort] : [];
  if (sorts.length && config.sort) {
    out = [...out].sort((a, b) => {
      for (const s of sorts) {
        const acc = config.sort![s.id];
        if (!acc) continue;
        const av = acc(a);
        const bv = acc(b);
        if (av === bv) continue;
        if (av === undefined) return 1;
        if (bv === undefined) return -1;
        const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), "en-IN", { numeric: true });
        if (cmp !== 0) return s.desc ? -cmp : cmp;
      }
      return 0;
    });
  }

  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  const total = out.length;
  const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  const page = Math.min(Math.max(0, params.page ?? 0), maxPage);
  return { rows: out.slice(page * pageSize, page * pageSize + pageSize), total, page, pageSize };
}

/** Count rows per value of a field: used for faceted filter counts. */
export function facetCounts<T>(rows: T[], accessor: (row: T) => string | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = accessor(r);
    if (k !== undefined) out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
