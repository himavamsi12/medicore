"use client";

import { useQuery } from "@tanstack/react-query";
import { sessionService } from "@/services/sessionService";
import { useSession } from "@/stores/session";

export function useCurrentUser() {
  const role = useSession((s) => s.role);
  const q = useQuery({ queryKey: ["session", role], queryFn: () => sessionService.getUser(role), staleTime: Infinity });
  return { role, user: q.data, loading: q.isLoading };
}
