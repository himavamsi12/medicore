import { Suspense } from "react";

/** Chrome-less layout for printable documents. */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-muted/40 py-6 print:bg-white print:py-0">
      <Suspense>{children}</Suspense>
    </div>
  );
}
