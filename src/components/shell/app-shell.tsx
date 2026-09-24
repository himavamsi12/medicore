"use client";

import { usePathname } from "next/navigation";
import { AccessDenied, KpiSkeleton, PanelSkeleton } from "@/components/feedback/states";
import { useHydrated } from "@/hooks/use-hydrated";
import { canAccess } from "@/lib/rbac";
import { useSession } from "@/stores/session";
import { CommandBar } from "./command-bar";
import { Sidebar } from "./sidebar";
import { RoleSwitcher, Topbar } from "./topbar";

/** Blocks routes outside the current role with a clear, recoverable state. */
function RoleGate({ children }: { children: React.ReactNode }) {
  const role = useSession((s) => s.role);
  const pathname = usePathname();
  const hydrated = useHydrated();
  // All data comes from client-side services: render page content after hydration
  // so server HTML (skeleton) and the first client render always agree.
  if (!hydrated) {
    return (
      <div className="space-y-5" aria-busy>
        <PanelSkeleton lines={2} className="px-0" />
        <KpiSkeleton />
      </div>
    );
  }
  if (!canAccess(role, pathname)) {
    return (
      <div className="py-16">
        <AccessDenied
          action={
            <div className="rounded-lg border bg-card p-1">
              <RoleSwitcher />
            </div>
          }
        />
      </div>
    );
  }
  return <>{children}</>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-background">
      <a href="#main" className="sr-only z-[var(--z-toast)] rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1600px] min-w-0 flex-1 px-4 py-5 outline-none md:px-6 md:py-6">
          <RoleGate>{children}</RoleGate>
        </main>
      </div>
      <CommandBar />
    </div>
  );
}
