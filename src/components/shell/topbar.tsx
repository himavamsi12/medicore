"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Bell, CheckCheck, Menu, Monitor, Moon, Search, Sun, UserCog } from "lucide-react";
import { ROLES, type Role } from "@/types";
import { notificationService } from "@/services/notificationService";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SeverityDot } from "@/components/feedback/status-badge";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useHydrated } from "@/hooks/use-hydrated";
import { canAccess, ROLE_PERSONA } from "@/lib/rbac";
import { ICON_STROKE, STALE } from "@/lib/constants";
import { ago, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSession } from "@/stores/session";
import { useUi } from "@/stores/ui";
import { Logo, SidebarNav } from "./sidebar";

function Notifications({ role }: { role: Role }) {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ["notifications", role], queryFn: () => notificationService.getForRole(role), staleTime: STALE.live, refetchInterval: 60_000 });
  const unread = data.filter((n) => !n.read);
  const markRead = useMutation({
    mutationFn: (ids: string[]) => notificationService.markRead(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="icon" className="relative" aria-label={`Notifications, ${unread.length} unread`} />}>
        <Bell strokeWidth={ICON_STROKE} />
        {unread.length > 0 && <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-critical px-1 text-[10px] leading-4 font-semibold text-white">{unread.length > 9 ? "9+" : unread.length}</span>}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,380px)] gap-0 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <p className="text-sm font-medium">Notifications</p>
          {unread.length > 0 && (
            <Button variant="ghost" size="xs" onClick={() => markRead.mutate(unread.map((n) => n.id))}>
              <CheckCheck /> Mark all read
            </Button>
          )}
        </div>
        <ul className="max-h-[420px] divide-y overflow-y-auto scrollbar-thin" aria-live="polite">
          {isLoading && <li className="px-3 py-6 text-center text-xs text-muted-foreground">Loading…</li>}
          {!isLoading && data.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted-foreground">You are all caught up.</li>}
          {data.map((n) => (
            <li key={n.id}>
              <Link
                href={n.href ?? "#"}
                onClick={() => !n.read && markRead.mutate([n.id])}
                className={cn("flex gap-3 px-3 py-2.5 hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-none", !n.read && "bg-info-soft/30")}
              >
                <SeverityDot tone={n.severity} className="mt-1.5" />
                <div className="min-w-0 flex-1">
                  <p className={cn("text-[13px] leading-snug", !n.read && "font-medium")}>{n.title}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                  <p className="mt-0.5 text-[11px] text-subtle-foreground">
                    {n.module} · {ago(n.at)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function ThemeMenu() {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Theme" />}>
        <Sun className="dark:hidden" strokeWidth={ICON_STROKE} />
        <Moon className="hidden dark:block" strokeWidth={ICON_STROKE} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Appearance</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={(v) => setTheme(String(v))}>
            <DropdownMenuRadioItem value="light">
              <Sun /> Light
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <Moon /> Dark
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">
              <Monitor /> System
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RoleSwitcher() {
  const { role, user } = useCurrentUser();
  const setRole = useSession((s) => s.setRole);
  const router = useRouter();
  const pathname = usePathname();
  const change = (r: Role) => {
    setRole(r);
    toast.success(`Switched to ${r}`, { description: ROLE_PERSONA[r].title });
    if (!canAccess(r, pathname)) router.push("/dashboard");
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<button type="button" className="flex h-9 items-center gap-2.5 rounded-lg px-1.5 text-left hover:bg-accent focus-visible:outline-2 md:pr-2.5" aria-label={`Current role ${role}. Change role`} />}>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground">{user ? initials(user.name) : ""}</span>
        <span className="hidden min-w-0 leading-tight md:block">
          <span className="block max-w-40 truncate text-[13px] font-medium">{user?.name ?? "…"}</span>
          <span className="block text-[11px] text-muted-foreground">{role}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-1.5">
            <UserCog className="size-3.5" /> View as role (demo)
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup value={role} onValueChange={(v) => change(v as Role)}>
            {ROLES.map((r) => (
              <DropdownMenuRadioItem key={r} value={r}>
                <span className="flex flex-col">
                  <span>{r}</span>
                  <span className="text-[11px] text-muted-foreground">{ROLE_PERSONA[r].title}</span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-[11px] text-muted-foreground">No sign-in in this build. Roles change navigation, dashboards and permitted actions.</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Topbar() {
  const { role } = useCurrentUser();
  const hydrated = useHydrated();
  const openCommand = useUi((s) => s.setCommandOpen);
  const mobileOpen = useUi((s) => s.mobileNavOpen);
  const setMobile = useUi((s) => s.setMobileNav);
  return (
    <header className="sticky top-0 z-[var(--z-topbar)] flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/75 md:px-5">
      <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setMobile(true)}>
        <Menu strokeWidth={ICON_STROKE} />
      </Button>
      <div className="lg:hidden">
        <Logo collapsed />
      </div>
      <button
        type="button"
        onClick={() => openCommand(true)}
        className="mx-auto flex h-9 w-full max-w-md items-center gap-2 rounded-lg border bg-card px-3 text-sm text-muted-foreground transition-colors hover:border-border-strong focus-visible:outline-2 lg:mx-0"
        aria-label="Search or ask (Command K)"
      >
        <Search className="size-4 shrink-0" strokeWidth={ICON_STROKE} />
        <span className="truncate">Search patients or ask, e.g. which ICU beds are free</span>
        <span className="ml-auto hidden items-center gap-0.5 sm:flex">
          <kbd>⌘</kbd>
          <kbd>K</kbd>
        </span>
      </button>
      <div className="ml-auto flex items-center gap-0.5">
        {hydrated && <Notifications role={role} />}
        <ThemeMenu />
        <span aria-hidden className="mx-1.5 hidden h-6 w-px bg-border md:block" />
        {hydrated ? <RoleSwitcher /> : <span className="size-9" aria-hidden />}
      </div>
      <Sheet open={mobileOpen} onOpenChange={setMobile}>
        <SheetContent side="left" className="w-[280px] gap-0 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-14 items-center border-b px-3">
            <Logo />
          </div>
          <SidebarNav onNavigate={() => setMobile(false)} />
        </SheetContent>
      </Sheet>
    </header>
  );
}
