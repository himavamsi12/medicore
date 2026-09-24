"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { doctorService } from "@/services/doctorService";
import { reportService } from "@/services/reportService";
import { ErrorState, PanelSkeleton } from "@/components/feedback/states";
import { StatusBadge } from "@/components/feedback/status-badge";
import { PageHeader, Panel } from "@/components/layout/page";
import { TextareaField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SessionDays } from "@/features/doctors/session-days";
import { useCurrentUser } from "@/hooks/use-current-user";
import { can } from "@/lib/rbac";
import { inr, inrCompact } from "@/lib/format";

export default function DepartmentPage() {
  const { id } = useParams<{ id: string }>();
  const { role } = useCurrentUser();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["department", id], queryFn: () => doctorService.getDepartment(id) });
  const rev = useQuery({ queryKey: ["dept-revenue", 30], queryFn: () => reportService.getDepartmentRevenue(30) });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ floor: "", extension: "", description: "" });
  const save = useMutation({
    mutationFn: () => doctorService.updateDepartment(id, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["department", id] });
      qc.invalidateQueries({ queryKey: ["departments"] });
      toast.success("Department updated");
      setEditing(false);
    },
  });

  if (q.isLoading) return <PanelSkeleton lines={10} className="rounded-xl border" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const r = rev.data?.find((x) => x.departmentId === id);

  return (
    <div className="space-y-4">
      <PageHeader
        title={d.name}
        description={d.description}
        breadcrumbs={[{ label: "Departments", href: "/departments" }, { label: d.name }]}
        meta={
          <>
            <StatusBadge tone="neutral">{d.kind}</StatusBadge>
            <span>{d.floor}</span>
            <span>Extension {d.extension}</span>
            {d.head && <span>HOD {d.head.name}</span>}
          </>
        }
        actions={
          can(role, "settings.manage") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setForm({ floor: d.floor, extension: d.extension, description: d.description });
                setEditing(true);
              }}
            >
              <Pencil /> Edit details
            </Button>
          )
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Doctors", value: d.doctorCount },
          { label: "OPD today", value: d.opdToday },
          { label: "Inpatients", value: d.inpatients },
          { label: "Revenue, 30 days", value: r ? inrCompact(r.revenue) : "-", sub: r ? `${r.growth >= 0 ? "+" : ""}${r.growth}% vs previous period` : undefined },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{k.value}</p>
            {k.sub && <p className="mt-0.5 text-xs text-muted-foreground">{k.sub}</p>}
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Panel title="Doctors" description="Tap a doctor for schedule and slots">
          <ul className="divide-y">
            {d.doctors.map((doc) => (
              <li key={doc.id}>
                <Link href={`/doctors/${doc.id}`} className="grid gap-2 px-4 py-3 hover:bg-accent/40 sm:grid-cols-[1.5fr_auto_auto_auto] sm:items-center sm:gap-5">
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium">{doc.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {doc.designation} · {doc.qualifications}
                    </span>
                  </span>
                  <SessionDays doctor={doc} />
                  <span className="num text-xs text-muted-foreground">{inr(doc.consultationFee)}</span>
                  <StatusBadge status={doc.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Services">
          <ul className="space-y-1.5 p-4 text-[13px]">
            {d.services.map((s) => (
              <li key={s} className="flex items-center gap-2">
                <span aria-hidden className="size-1.5 rounded-full bg-primary" />
                {s}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit {d.name}</DialogTitle>
            <DialogDescription>Location and contact details shown to patients and staff.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Floor and block" value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} />
              <TextField label="Extension" inputMode="numeric" value={form.extension} onChange={(e) => setForm({ ...form, extension: e.target.value })} />
            </div>
            <TextareaField label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
