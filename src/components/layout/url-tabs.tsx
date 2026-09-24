"use client";

import { useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export interface TabDef {
  id: string;
  label: string;
  count?: number;
}

/** Tab state lives in ?tab= so views are linkable. Arrow keys move between tabs (WAI-ARIA tabs pattern). */
export function useUrlTab(tabs: TabDef[], fallback = tabs[0]?.id) {
  const sp = useSearchParams();
  const t = sp.get("tab");
  return tabs.some((x) => x.id === t) ? t! : fallback;
}

export function UrlTabs({ tabs, className, label }: { tabs: TabDef[]; className?: string; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const active = useUrlTab(tabs);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (id: string, focus = false) => {
    const next = new URLSearchParams(sp.toString());
    if (id === tabs[0].id) next.delete("tab");
    else next.set("tab", id);
    router.replace(`${pathname}${next.toString() ? `?${next}` : ""}`, { scroll: false });
    if (focus) refs.current[tabs.findIndex((t) => t.id === id)]?.focus();
  };

  return (
    <div role="tablist" aria-label={label} className={cn("flex gap-1 overflow-x-auto border-b scrollbar-thin", className)}>
      {tabs.map((t, i) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={on}
            aria-controls={`panel-${t.id}`}
            tabIndex={on ? 0 : -1}
            onClick={() => select(t.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") select(tabs[(i + 1) % tabs.length].id, true);
              if (e.key === "ArrowLeft") select(tabs[(i - 1 + tabs.length) % tabs.length].id, true);
            }}
            className={cn(
              "relative flex h-10 shrink-0 items-center gap-1.5 px-3 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px]",
              on && "font-medium text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary",
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="num rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} className={className}>
      {children}
    </div>
  );
}
