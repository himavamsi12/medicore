"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, PlusCircle, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ICON_STROKE } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Debounced search box. Label is visually hidden but present for screen readers. */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search",
  className,
  label = "Search",
  autoFocus,
}: {
  value?: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  label?: string;
  autoFocus?: boolean;
}) {
  const [local, setLocal] = useState(value ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setLocal(value ?? "");
  }
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div className={cn("relative w-full sm:w-64", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" strokeWidth={ICON_STROKE} aria-hidden />
      <input
        type="search"
        aria-label={label}
        autoFocus={autoFocus}
        value={local}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value;
          setLocal(v);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => onChange(v), 280);
        }}
        className="h-8 w-full rounded-lg border border-input bg-card pr-8 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 dark:bg-input/30 [&::-webkit-search-cancel-button]:hidden"
      />
      {local && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setLocal("");
            onChange("");
          }}
          className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export interface FacetOption {
  value: string;
  label: string;
  count?: number;
}

/** Multi-select faceted filter (popover with checkable options). */
export function FacetFilter({
  title,
  options,
  selected,
  onChange,
  single = false,
}: {
  title: string;
  options: FacetOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  single?: boolean;
}) {
  const [q, setQ] = useState("");
  const visible = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()));
  const toggle = (v: string) => {
    if (single) onChange(selected.includes(v) ? [] : [v]);
    else onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  };
  const selectedLabels = options.filter((o) => selected.includes(o.value)).map((o) => o.label);
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className={cn("h-8 border-dashed", selected.length && "border-solid")}>
            <PlusCircle strokeWidth={ICON_STROKE} className="text-muted-foreground" />
            {title}
            {selected.length > 0 && (
              <>
                <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
                <span className="max-w-40 truncate rounded bg-secondary px-1.5 text-xs font-normal">{selected.length > 2 ? `${selected.length} selected` : selectedLabels.join(", ")}</span>
              </>
            )}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-60 gap-0 p-1">
        {options.length > 7 && (
          <div className="p-1 pb-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Filter ${title.toLowerCase()}`} aria-label={`Filter ${title} options`} className="h-7 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring" />
          </div>
        )}
        <div role="listbox" aria-multiselectable={!single} aria-label={title} className="max-h-64 overflow-auto scrollbar-thin">
          {visible.map((o) => {
            const on = selected.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => toggle(o.value)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              >
                <span className={cn("flex size-4 items-center justify-center rounded-[4px] border", on ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                  {on && <Check className="size-3" />}
                </span>
                <span className="flex-1 truncate">{o.label}</span>
                {o.count !== undefined && <span className="num text-xs text-muted-foreground">{o.count}</span>}
              </button>
            );
          })}
          {!visible.length && <p className="px-2 py-3 text-center text-xs text-muted-foreground">No options</p>}
        </div>
        {selected.length > 0 && (
          <div className="mt-1 border-t p-1">
            <Button variant="ghost" size="sm" className="w-full justify-center" onClick={() => onChange([])}>
              Clear filter
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Compact single choice rendered as a segmented control. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex h-8 items-center rounded-lg border bg-muted/60 p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex h-full items-center gap-1.5 rounded-md px-2.5 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1",
            value === o.value && "bg-card text-foreground shadow-[var(--shadow-raise)] ring-1 ring-border",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="num text-[11px] text-muted-foreground">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function DateRangeFilter({ from, to, onChange }: { from?: string; to?: string; onChange: (from?: string, to?: string) => void }) {
  const active = Boolean(from || to);
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className={cn("h-8", !active && "border-dashed")}>
            {active ? `${from ?? "…"} to ${to ?? "…"}` : "Date range"}
            <ChevronDown strokeWidth={ICON_STROKE} className="text-muted-foreground" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-64">
        <div className="grid gap-3">
          <label className="grid gap-1.5 text-xs font-medium">
            From
            <input type="date" value={from ?? ""} max={to} onChange={(e) => onChange(e.target.value || undefined, to)} className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring" />
          </label>
          <label className="grid gap-1.5 text-xs font-medium">
            To
            <input type="date" value={to ?? ""} min={from} onChange={(e) => onChange(from, e.target.value || undefined)} className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring" />
          </label>
          {active && (
            <Button variant="ghost" size="sm" onClick={() => onChange(undefined, undefined)}>
              Clear dates
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
