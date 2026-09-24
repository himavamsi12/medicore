"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useEffect, useState } from "react";
import { MotionConfig } from "motion/react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { STALE } from "@/lib/constants";
import { useSession } from "@/stores/session";
import { useUi } from "@/stores/ui";

function StoreHydration() {
  useEffect(() => {
    void useSession.persist.rehydrate();
    void useUi.persist.rehydrate();
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: STALE.standard, refetchOnWindowFocus: false, retry: 1 },
          mutations: { retry: 0 },
        },
      }),
  );
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={client}>
        <MotionConfig reducedMotion="user" transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
          <TooltipProvider delay={350}>
            <StoreHydration />
            {children}
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </MotionConfig>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
