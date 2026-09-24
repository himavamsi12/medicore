"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Command as CommandPrimitive } from "cmdk";
import { ArrowRight, BedDouble, CalendarPlus, CornerDownLeft, FlaskConical, History, Pill, Search, Sparkles, UserPlus, UserRound, type LucideIcon } from "lucide-react";
import type { CommandResultItem } from "@/types";
import { aiService } from "@/services/aiService";
import { patientService } from "@/services/patientService";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AiDisclaimer, ConfidenceMeter } from "@/components/ai/ai";
import { StatusBadge } from "@/components/feedback/status-badge";
import { navForRole, MODULE_ICON } from "@/lib/nav";
import { canAccess } from "@/lib/rbac";
import { ICON_STROKE } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useSession } from "@/stores/session";
import { useUi } from "@/stores/ui";

const EXAMPLES = ["Show diabetic patients admitted this week", "Which ICU beds are free", "Critical lab results", "Cardiologists available today", "Low stock medicines", "Claims with queries"];

const KIND_ICON: Record<CommandResultItem["kind"], LucideIcon> = {
  patient: UserRound,
  bed: BedDouble,
  doctor: UserRound,
  lab: FlaskConical,
  drug: Pill,
  admission: BedDouble,
  appointment: CalendarPlus,
  claim: MODULE_ICON.Billing,
  nav: ArrowRight,
};

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const itemClass =
  "flex cursor-default items-center gap-3 rounded-md px-2.5 py-2 text-sm outline-none select-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground aria-disabled:opacity-50";
const groupClass = "px-1.5 py-1 [&_[cmdk-group-heading]]:px-1.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground";

export function CommandBar() {
  const open = useUi((s) => s.commandOpen);
  const setOpen = useUi((s) => s.setCommandOpen);
  const toggleSidebar = useUi((s) => s.toggleSidebar);
  const recent = useUi((s) => s.recentPatients);
  const role = useSession((s) => s.role);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const q = useDebounced(query.trim(), 380);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!useUi.getState().commandOpen);
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "[" && !typing && !e.metaKey && !e.ctrlKey) {
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen, toggleSidebar]);

  const ai = useQuery({ queryKey: ["command", role, q], queryFn: () => aiService.commandQuery(q, role), enabled: open && q.length >= 3, staleTime: 30_000 });
  const patients = useQuery({ queryKey: ["patient-search", q], queryFn: () => patientService.search(q, 5), enabled: open && q.length >= 2, staleTime: 30_000 });

  const navItems = useMemo(
    () =>
      navForRole(role).flatMap((g) =>
        g.items.flatMap((i) => (i.children && i.children.length > 1 ? i.children.map((c) => ({ label: `${i.label}: ${c.label}`, href: c.href, icon: i.icon, keywords: i.keywords ?? [] })) : [{ label: i.label, href: i.href, icon: i.icon, keywords: i.keywords ?? [] }])),
      ),
    [role],
  );
  const lower = query.trim().toLowerCase();
  const navMatches = lower ? navItems.filter((n) => [n.label, ...n.keywords].join(" ").toLowerCase().includes(lower)).slice(0, 5) : navItems.slice(0, 8);

  const actions = [
    { label: "Register new patient", href: "/patients/new", icon: UserPlus },
    { label: "Book an appointment", href: "/opd/appointments?book=1", icon: CalendarPlus },
    { label: "Find a free bed", href: "/ipd/beds", icon: BedDouble },
  ].filter((a) => canAccess(role, a.href.split("?")[0]) && navItems.some((n) => a.href.startsWith(n.href.split("?")[0]) || n.href.startsWith(a.href.split("?")[0])));

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  const aiResults = ai.data?.results.filter((r) => r.kind !== "nav") ?? [];
  const showAi = q.length >= 3;
  const aiLoading = showAi && (ai.isFetching || query.trim() !== q);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <DialogContent showCloseButton={false} className="top-[12vh] max-w-[calc(100%-1.5rem)] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogTitle className="sr-only">Search and ask</DialogTitle>
        <DialogDescription className="sr-only">Search patients, pages and records, or ask a question in plain language.</DialogDescription>
        <CommandPrimitive shouldFilter={false} loop className="flex flex-col">
          <div className="flex items-center gap-2 border-b px-3">
            {showAi ? <Sparkles className="size-4 text-info" strokeWidth={ICON_STROKE} aria-hidden /> : <Search className="size-4 text-muted-foreground" strokeWidth={ICON_STROKE} aria-hidden />}
            <CommandPrimitive.Input value={query} onValueChange={setQuery} placeholder="Search patients, pages, or ask a question" className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground" />
            <kbd>Esc</kbd>
          </div>
          <CommandPrimitive.List className="max-h-[min(62vh,520px)] overflow-y-auto overscroll-contain py-1 scrollbar-thin">
            {!lower && (
              <>
                {recent.length > 0 && (
                  <CommandPrimitive.Group heading="Recent patients" className={groupClass}>
                    {recent.map((p) => (
                      <CommandPrimitive.Item key={p.id} value={`recent-${p.id}`} onSelect={() => go(`/patients/${p.id}`)} className={itemClass}>
                        <History className="size-4 text-muted-foreground" />
                        <span className="flex-1 truncate">{p.name}</span>
                        <span className="num text-xs text-muted-foreground">{p.uhid}</span>
                      </CommandPrimitive.Item>
                    ))}
                  </CommandPrimitive.Group>
                )}
                <CommandPrimitive.Group heading="Ask in plain language" className={groupClass}>
                  {EXAMPLES.map((e) => (
                    <CommandPrimitive.Item key={e} value={`ex-${e}`} onSelect={() => setQuery(e)} className={itemClass}>
                      <Sparkles className="size-4 text-info" />
                      <span className="flex-1">{e}</span>
                    </CommandPrimitive.Item>
                  ))}
                </CommandPrimitive.Group>
                {actions.length > 0 && (
                  <CommandPrimitive.Group heading="Quick actions" className={groupClass}>
                    {actions.map((a) => (
                      <CommandPrimitive.Item key={a.href} value={`act-${a.href}`} onSelect={() => go(a.href)} className={itemClass}>
                        <a.icon className="size-4 text-muted-foreground" />
                        <span className="flex-1">{a.label}</span>
                      </CommandPrimitive.Item>
                    ))}
                  </CommandPrimitive.Group>
                )}
              </>
            )}

            {showAi && (
              <CommandPrimitive.Group heading="Answer" className={groupClass}>
                <div className="flex flex-wrap items-center gap-2 px-1.5 pb-2">
                  <AiDisclaimer />
                  {ai.data && !aiLoading && <span className="text-xs text-muted-foreground">Interpreted as: <span className="text-foreground">{ai.data.interpretation}</span></span>}
                </div>
                {aiLoading && (
                  <div className="space-y-2 px-2.5 pb-2" role="status" aria-live="polite">
                    <p className="text-xs text-muted-foreground">Understanding your question…</p>
                    {[70, 55, 62].map((w) => (
                      <div key={w} className="h-4 animate-pulse rounded bg-muted" style={{ width: `${w}%` }} />
                    ))}
                  </div>
                )}
                {!aiLoading && aiResults.length === 0 && ai.data && <p className="px-2.5 pb-2 text-sm text-muted-foreground">No matching records. Try rephrasing, for example &ldquo;free HDU beds&rdquo;.</p>}
                {!aiLoading &&
                  aiResults.map((r) => {
                    const Icon = KIND_ICON[r.kind];
                    return (
                      <CommandPrimitive.Item key={`${r.kind}-${r.id}`} value={`ai-${r.kind}-${r.id}`} onSelect={() => go(r.href)} className={itemClass}>
                        <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={ICON_STROKE} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{r.title}</span>
                          {r.subtitle && <span className="block truncate text-xs text-muted-foreground">{r.subtitle}</span>}
                        </span>
                        {r.badge && <StatusBadge tone={r.badgeTone}>{r.badge}</StatusBadge>}
                      </CommandPrimitive.Item>
                    );
                  })}
                {!aiLoading && ai.data?.viewAllHref && aiResults.length > 0 && (
                  <CommandPrimitive.Item value="ai-view-all" onSelect={() => go(ai.data!.viewAllHref!)} className={cn(itemClass, "text-info-fg")}>
                    <ArrowRight className="size-4" />
                    <span className="flex-1">Open full list</span>
                  </CommandPrimitive.Item>
                )}
              </CommandPrimitive.Group>
            )}

            {lower.length >= 2 && ai.data?.intent !== "search" && (patients.data?.length ?? 0) > 0 && (
              <CommandPrimitive.Group heading="Patients" className={groupClass}>
                {patients.data!.map((p) => (
                  <CommandPrimitive.Item key={p.id} value={`pt-${p.id}`} onSelect={() => go(`/patients/${p.id}`)} className={itemClass}>
                    <UserRound className="size-4 text-muted-foreground" strokeWidth={ICON_STROKE} />
                    <span className="flex-1 truncate">{p.fullName}</span>
                    <span className="num text-xs text-muted-foreground">
                      {p.uhid} · {p.ageLabel} {p.gender[0]}
                    </span>
                  </CommandPrimitive.Item>
                ))}
              </CommandPrimitive.Group>
            )}

            {navMatches.length > 0 && (
              <CommandPrimitive.Group heading={lower ? "Go to" : "Navigate"} className={groupClass}>
                {navMatches.map((n) => (
                  <CommandPrimitive.Item key={n.href} value={`nav-${n.href}`} onSelect={() => go(n.href)} className={itemClass}>
                    <n.icon className="size-4 text-muted-foreground" strokeWidth={ICON_STROKE} />
                    <span className="flex-1">{n.label}</span>
                  </CommandPrimitive.Item>
                ))}
              </CommandPrimitive.Group>
            )}
          </CommandPrimitive.List>
          <div className="flex items-center gap-3 border-t px-3 py-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <kbd>↑</kbd>
              <kbd>↓</kbd> move
            </span>
            <span className="flex items-center gap-1">
              <kbd>
                <CornerDownLeft className="size-3" />
              </kbd>{" "}
              open
            </span>
            {ai.data && showAi && !aiLoading && <ConfidenceMeter value={ai.data.meta.confidence} className="ml-auto" />}
          </div>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}
