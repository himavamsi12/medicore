"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import { navForRole, type NavItem } from "@/lib/nav";
import { ICON_STROKE, APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useSession } from "@/stores/session";
import { useUi } from "@/stores/ui";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function itemActive(pathname: string, item: NavItem) {
  if (isActive(pathname, item.href)) return true;
  const base = `/${item.href.split("/")[1]}`;
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 rounded-md focus-visible:outline-2" aria-label={`${APP_NAME} home`}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Plus className="size-4" strokeWidth={3} aria-hidden />
      </span>
      {!collapsed && (
        <span className="leading-tight">
          <span className="block text-sm font-semibold tracking-tight">{APP_NAME}</span>
          <span className="block text-[11px] text-muted-foreground">Bengaluru</span>
        </span>
      )}
    </Link>
  );
}

function NavEntry({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = itemActive(pathname, item);
  const [open, setOpen] = useState(active);
  const [prevActive, setPrevActive] = useState(active);
  if (active !== prevActive) {
    setPrevActive(active);
    if (active) setOpen(true);
  }
  const Icon = item.icon;
  const hasChildren = Boolean(item.children && item.children.length > 1);
  const base = cn(
    "group flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px]",
    active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
  );
  const icon = <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} strokeWidth={ICON_STROKE} aria-hidden />;

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger render={<Link href={item.href} onClick={onNavigate} aria-label={item.label} aria-current={active ? "page" : undefined} className={cn(base, "justify-center px-0")} />}>
          {icon}
        </TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  }
  if (!hasChildren) {
    return (
      <Link href={item.children?.[0]?.href ?? item.href} onClick={onNavigate} className={base} aria-current={active ? "page" : undefined}>
        {icon}
        <span className="truncate">{item.label}</span>
      </Link>
    );
  }
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} className={base} aria-expanded={open}>
        {icon}
        <span className="flex-1 truncate text-left">{item.label}</span>
        <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <ul className="mt-0.5 mb-1 ml-[18px] space-y-0.5 border-l pl-2.5">
          {item.children!.map((c) => {
            const best = item.children!.filter((x) => isActive(pathname, x.href)).sort((a, b) => b.href.length - a.href.length)[0];
            const on = best?.href === c.href;
            return (
              <li key={c.href}>
                <Link
                  href={c.href}
                  onClick={onNavigate}
                  aria-current={on ? "page" : undefined}
                  className={cn("flex h-7 items-center rounded-md px-2 text-[13px] text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-2", on && "font-medium text-foreground")}
                >
                  {c.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function SidebarNav({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const role = useSession((s) => s.role);
  const groups = navForRole(role);
  return (
    <nav aria-label="Main" className="flex-1 space-y-4 overflow-y-auto px-2 py-3 scrollbar-thin">
      {groups.map((g) => (
        <div key={g.label}>
          {!collapsed && <p className="mb-1 px-2 text-[11px] font-medium text-subtle-foreground">{g.label}</p>}
          <div className="space-y-0.5">
            {g.items.map((item) => (
              <NavEntry key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar() {
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const toggle = useUi((s) => s.toggleSidebar);
  return (
    <aside
      className={cn("sticky top-0 z-[var(--z-sidebar)] hidden h-dvh shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200 ease-[var(--ease-out-quint)] lg:flex", collapsed ? "w-[60px]" : "w-[244px]")}
      aria-label="Sidebar"
    >
      <div className={cn("flex h-14 items-center border-b px-3", collapsed && "justify-center px-0")}>
        <Logo collapsed={collapsed} />
      </div>
      <SidebarNav collapsed={collapsed} />
      <div className={cn("border-t p-2", collapsed && "flex justify-center")}>
        <button
          type="button"
          onClick={toggle}
          className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-2"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="mx-auto size-4" strokeWidth={ICON_STROKE} /> : <PanelLeftClose className="size-4" strokeWidth={ICON_STROKE} />}
          {!collapsed && "Collapse"}
          {!collapsed && <kbd className="ml-auto">[</kbd>}
        </button>
      </div>
    </aside>
  );
}
