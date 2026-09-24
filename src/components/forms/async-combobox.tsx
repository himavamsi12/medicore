"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Accessible async combobox (ARIA 1.2 pattern): type to search, arrow keys to
 * move, Enter to pick, Escape to close. Results come from a service query.
 */
export function AsyncCombobox<T>({
  label,
  placeholder,
  queryKey,
  search,
  getKey,
  renderItem,
  onSelect,
  minChars = 0,
  hideLabel = false,
  className,
  autoFocus,
  emptyText = "No matches",
  error,
}: {
  label: string;
  placeholder?: string;
  queryKey: string;
  search: (q: string) => Promise<T[]>;
  getKey: (item: T) => string;
  renderItem: (item: T, active: boolean) => React.ReactNode;
  onSelect: (item: T) => void;
  minChars?: number;
  hideLabel?: boolean;
  className?: string;
  autoFocus?: boolean;
  emptyText?: string;
  error?: string;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim()), 200);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = useQuery({ queryKey: ["combobox", queryKey, debounced], queryFn: () => search(debounced), enabled: open && debounced.length >= minChars, staleTime: 30_000 });
  const items = q.data ?? [];

  const pick = (item: T) => {
    onSelect(item);
    setText("");
    setOpen(false);
    setActive(0);
  };

  return (
    <div ref={boxRef} className={cn("relative grid gap-1.5", className)}>
      <label htmlFor={id} className={cn("text-[13px] font-medium", hideLabel && "sr-only")}>
        {label}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open && items[active] ? `${id}-opt-${active}` : undefined}
          aria-invalid={Boolean(error) || undefined}
          autoFocus={autoFocus}
          autoComplete="off"
          value={text}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(items.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter" && open && items[active]) {
              e.preventDefault();
              pick(items[active]);
            } else if (e.key === "Escape") setOpen(false);
          }}
          className="h-9 w-full rounded-lg border border-input bg-card pr-8 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/35 aria-invalid:border-destructive dark:bg-input/30"
        />
        {q.isFetching && <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />}
      </div>
      {error && <p className="text-xs text-critical-fg" role="alert">{error}</p>}
      {open && debounced.length >= minChars && (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          className="absolute top-full right-0 left-0 z-[var(--z-overlay)] mt-1 max-h-72 overflow-y-auto rounded-lg border bg-popover p-1 shadow-[var(--shadow-popover)] scrollbar-thin"
        >
          {q.isLoading && <li className="px-2 py-2 text-xs text-muted-foreground">Searching…</li>}
          {!q.isLoading && items.length === 0 && <li className="px-2 py-2 text-xs text-muted-foreground">{emptyText}</li>}
          {items.map((item, i) => (
            <li
              key={getKey(item)}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(item);
              }}
              className={cn("cursor-default rounded-md px-2 py-1.5 text-sm", i === active && "bg-accent")}
            >
              {renderItem(item, i === active)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
