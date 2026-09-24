"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Clock, Pause, X } from "lucide-react";
import type { MarStatus, MarView } from "@/types";
import { nursingService } from "@/services/nursingService";
import { EmptyState, PanelSkeleton } from "@/components/feedback/states";
import { StatusBadge } from "@/components/feedback/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useNow } from "@/hooks/use-now";
import { can } from "@/lib/rbac";
import { time } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Medication Administration Record for today, grouped by due hour.
 * High-alert medicines require an independent double-check before "Given".
 */
export function MarChart({ wardId, admissionId }: { wardId?: string; admissionId?: string }) {
  const qc = useQueryClient();
  const { role, user } = useCurrentUser();
  const now = useNow();
  const q = useQuery({ queryKey: ["mar", wardId ?? admissionId], queryFn: () => nursingService.getMar({ wardId, admissionId }) });
  const [confirm, setConfirm] = useState<{ entry: MarView; status: Exclude<MarStatus, "Due"> }>();
  const [checked, setChecked] = useState(false);
  const [note, setNote] = useState("");
  const act = useMutation({
    mutationFn: (p: { id: string; status: Exclude<MarStatus, "Due">; note?: string }) => nursingService.administer(p.id, p.status, user?.name ?? "Staff Nurse", p.note),
    onSuccess: (m) => {
      qc.invalidateQueries({ queryKey: ["mar"] });
      qc.invalidateQueries({ queryKey: ["ward-patients"] });
      qc.invalidateQueries({ queryKey: ["kpis"] });
      toast.success(`${m.drug.split(" (")[0]}: ${m.status.toLowerCase()}`);
      setConfirm(undefined);
    },
  });
  const canGive = can(role, "mar.administer");

  if (q.isLoading) return <PanelSkeleton lines={10} />;
  const rows = q.data ?? [];
  if (!rows.length) return <EmptyState title="No scheduled medications today" />;
  const hours = [...new Set(rows.map((r) => new Date(r.scheduledAt).getHours()))].sort((a, b) => a - b);
  const counts = { due: rows.filter((r) => r.status === "Due").length, given: rows.filter((r) => r.status === "Given").length, overdue: rows.filter((r) => r.status === "Due" && new Date(r.scheduledAt).getTime() < now - 30 * 60000).length };

  const start = (entry: MarView, status: Exclude<MarStatus, "Due">) => {
    if (status === "Given" && !entry.highAlert) act.mutate({ id: entry.id, status });
    else {
      setChecked(false);
      setNote("");
      setConfirm({ entry, status });
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 border-b px-4 py-2.5 text-xs text-muted-foreground">
        <span>
          <span className="font-semibold text-foreground">{counts.given}</span> given
        </span>
        <span>
          <span className="font-semibold text-foreground">{counts.due}</span> due
        </span>
        <span className={cn(counts.overdue && "text-critical-fg")}>
          <span className="font-semibold">{counts.overdue}</span> overdue
        </span>
      </div>
      <ol className="divide-y">
        {hours.map((h) => {
          const group = rows.filter((r) => new Date(r.scheduledAt).getHours() === h);
          const past = new Date(group[0].scheduledAt).getTime() < now;
          return (
            <li key={h} className="grid gap-2 px-4 py-3 md:grid-cols-[72px_1fr]">
              <p className={cn("num flex items-center gap-1.5 text-sm font-semibold", !past && "text-muted-foreground")}>
                <Clock className="size-3.5" aria-hidden />
                {String(h).padStart(2, "0")}:00
              </p>
              <ul className="space-y-1.5">
                {group.map((m) => {
                  const overdue = m.status === "Due" && new Date(m.scheduledAt).getTime() < now - 30 * 60000;
                  return (
                    <li key={m.id} className={cn("flex flex-col gap-2 rounded-lg border px-3 py-2 sm:flex-row sm:items-center", overdue && "border-critical/40 bg-critical-soft/30")}>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
                          {m.drug}
                          {m.highAlert && <StatusBadge tone="warning">High alert</StatusBadge>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {m.dose} · {m.route} · {m.patient.fullName} ({m.bedCode})
                          {m.givenAt && ` · given ${time(m.givenAt)} by ${m.givenBy}`}
                          {m.note && ` · ${m.note}`}
                        </p>
                      </div>
                      {m.status === "Due" && canGive ? (
                        <div className="flex gap-1.5">
                          {overdue && <StatusBadge tone="critical">Overdue</StatusBadge>}
                          <Button size="sm" className="h-9 sm:h-7" onClick={() => start(m, "Given")} aria-label={`Mark ${m.drug} given`}>
                            <Check /> Give
                          </Button>
                          <Button size="sm" variant="outline" className="h-9 sm:h-7" onClick={() => start(m, "Held")} aria-label={`Hold ${m.drug}`}>
                            <Pause /> Hold
                          </Button>
                          <Button size="sm" variant="ghost" className="h-9 sm:h-7" onClick={() => start(m, "Refused")} aria-label={`Patient refused ${m.drug}`}>
                            <X /> Refused
                          </Button>
                        </div>
                      ) : (
                        <StatusBadge tone={m.status === "Given" ? "stable" : m.status === "Due" ? "neutral" : "warning"}>{m.status}</StatusBadge>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>

      <Dialog open={Boolean(confirm)} onOpenChange={(o) => !o && setConfirm(undefined)}>
        <DialogContent className="sm:max-w-md">
          {confirm && (
            <>
              <DialogHeader>
                <DialogTitle>{confirm.status === "Given" ? "High-alert medication" : `Record ${confirm.status.toLowerCase()}`}</DialogTitle>
                <DialogDescription>
                  {confirm.entry.drug} · {confirm.entry.dose} {confirm.entry.route} · {confirm.entry.patient.fullName} ({confirm.entry.bedCode})
                </DialogDescription>
              </DialogHeader>
              <form
                className="grid gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  act.mutate({ id: confirm.entry.id, status: confirm.status, note: note || undefined });
                }}
              >
                {confirm.status === "Given" ? (
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox checked={checked} onCheckedChange={(v) => setChecked(Boolean(v))} className="mt-0.5" />
                    Independent double-check done: right patient, drug, dose, route and time verified by a second nurse.
                  </label>
                ) : (
                  <label className="grid gap-1.5 text-[13px] font-medium">
                    Reason
                    <input required value={note} onChange={(e) => setNote(e.target.value)} placeholder={confirm.status === "Held" ? "e.g. SBP 92, held as per order" : "e.g. Nausea, doctor informed"} className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm font-normal outline-none focus-visible:border-ring" />
                  </label>
                )}
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setConfirm(undefined)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={(confirm.status === "Given" && !checked) || act.isPending}>
                    Confirm
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
