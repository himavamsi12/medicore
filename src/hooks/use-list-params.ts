"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import type { FilterValue, ListParams, SortSpec } from "@/types";

const RESERVED = new Set(["search", "page", "size", "sort", "from", "to", "tab"]);

/**
 * List state (search, filters, sort, page, date range) stored in the URL so
 * views are shareable and survive reloads. Multi-value filters are comma joined.
 */
export function useListParams(defaults: { pageSize?: number; sort?: SortSpec; filters?: Record<string, FilterValue>; /** URL keys that are UI state, not filters */ ignore?: string[] } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const params: ListParams = useMemo(() => {
    const filters: Record<string, FilterValue> = { ...(defaults.filters ?? {}) };
    sp.forEach((value, key) => {
      if (RESERVED.has(key) || defaults.ignore?.includes(key)) return;
      filters[key] = value.includes(",") ? value.split(",") : value;
    });
    const sortRaw = sp.get("sort");
    const sort: SortSpec[] | undefined = sortRaw
      ? sortRaw.split(",").map((s) => {
          const [id, dir] = s.split(":");
          return { id, desc: dir === "desc" };
        })
      : defaults.sort
        ? [defaults.sort]
        : undefined;
    return {
      search: sp.get("search") ?? undefined,
      page: Number(sp.get("page") ?? 0),
      pageSize: Number(sp.get("size") ?? defaults.pageSize ?? 20),
      sort,
      filters,
      dateFrom: sp.get("from") ?? undefined,
      dateTo: sp.get("to") ?? undefined,
    };
    // defaults are static per call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  const update = useCallback(
    (patch: Record<string, string | string[] | number | undefined | null>, resetPage = true) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) next.delete(k);
        else next.set(k, Array.isArray(v) ? v.join(",") : String(v));
      }
      if (resetPage && !("page" in patch)) next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, sp],
  );

  return {
    params,
    setSearch: (search: string) => update({ search }),
    setFilter: (key: string, value: string | string[] | undefined) => update({ [key]: value }),
    setSort: (sort: SortSpec[]) => update({ sort: sort.map((s) => `${s.id}:${s.desc ? "desc" : "asc"}`).join(",") || undefined }),
    setPage: (page: number) => update({ page: page || undefined }, false),
    setPageSize: (size: number) => update({ size }),
    setDateRange: (from?: string, to?: string) => update({ from, to }),
    clearAll: () => router.replace(pathname, { scroll: false }),
    get: (key: string) => sp.get(key) ?? undefined,
    set: update,
  };
}

export type ListParamsApi = ReturnType<typeof useListParams>;
