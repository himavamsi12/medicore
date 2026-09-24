import type { DoctorView, Weekday } from "@/types";
import { cn } from "@/lib/utils";

const DAYS: Weekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function SessionDays({ doctor }: { doctor: Pick<DoctorView, "sessions"> }) {
  if (!doctor.sessions.length) return <span className="text-xs text-muted-foreground">No OPD (inpatient / on call)</span>;
  return (
    <span className="flex gap-0.5" aria-label={`OPD on ${doctor.sessions.map((s) => s.day).join(", ")}`}>
      {DAYS.map((d) => {
        const on = doctor.sessions.some((s) => s.day === d);
        return (
          <span key={d} aria-hidden className={cn("flex h-5 w-6 items-center justify-center rounded text-[10px] font-medium", on ? "bg-info-soft text-info-fg" : "bg-muted text-subtle-foreground")}>
            {d[0]}
          </span>
        );
      })}
    </span>
  );
}
