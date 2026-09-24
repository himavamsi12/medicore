"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface UiState {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  commandOpen: boolean;
  density: "comfortable" | "compact";
  recentPatients: { id: string; name: string; uhid: string }[];
  toggleSidebar: () => void;
  setMobileNav: (open: boolean) => void;
  setCommandOpen: (open: boolean) => void;
  setDensity: (d: UiState["density"]) => void;
  pushRecentPatient: (p: { id: string; name: string; uhid: string }) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      mobileNavOpen: false,
      commandOpen: false,
      density: "comfortable",
      recentPatients: [],
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setMobileNav: (open) => set({ mobileNavOpen: open }),
      setCommandOpen: (open) => set({ commandOpen: open }),
      setDensity: (density) => set({ density }),
      pushRecentPatient: (p) => set((s) => ({ recentPatients: [p, ...s.recentPatients.filter((x) => x.id !== p.id)].slice(0, 6) })),
    }),
    {
      name: "medicore.ui",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, density: s.density, recentPatients: s.recentPatients }),
    },
  ),
);
