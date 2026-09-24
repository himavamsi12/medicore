"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Role } from "@/types";

interface SessionState {
  role: Role;
  setRole: (role: Role) => void;
}

/**
 * Current role for the mock RBAC. Persisted to localStorage; hydration is
 * deferred (skipHydration) and triggered by <StoreHydration /> after mount so
 * server and first client render always agree.
 */
export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      role: "Admin",
      setRole: (role) => set({ role }),
    }),
    { name: "medicore.session", storage: createJSONStorage(() => localStorage), skipHydration: true },
  ),
);
