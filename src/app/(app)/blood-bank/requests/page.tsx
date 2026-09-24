"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Plus, X } from "lucide-react";
import type { BloodComponent, BloodGroup, BloodRequestStatus, BloodRequestView, PatientSummary, Priority } from "@/types";
import { bloodService } from "@/services/bloodService";
import { doctorService } from "@/services/doctorService";
import { patientService } from "@/services/patientService";
import { KanbanBoard } from "@/components/data/kanban";
import { PanelSkeleton } from "@/components/feedback/states";
import { StatusBadge } from "@/components/feedback/status-badge";
import { AsyncCombobox } from "@/components/forms/async-combobox";
import { SelectField, TextField, TextareaField } from "@/components/forms/fields";
import { PageHeader } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCurrentUser } from "@/hooks/use-current-user";
import { can } from "@/lib/rbac";
import { STALE } from "@/lib/constants";
import { ago, dateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const NEXT: Partial<Record<BloodRequestStatus, { to: BloodRequestStatus; label: string }>> = {
  Pending: { to: "Cross-matching", label: "Start cross-match" },
  "Cross-matching": { to: "Ready", label: "Compatible, reserve units" },
  Ready: { to: "Issued", label: "Issue units" },
};

const COMPONENTS: BloodComponent[] = ["PRBC", "Whole blood", "FFP", "Platelets (RDP)", "Platelets (SDP)", "Cryoprecipitate"];

function RequestCard({ r }: { r: BloodRequestView }) {
  const qc = useQueryClient();
  const { role } = useCurrentUser();
  const next = NEXT[r.status];
  const advance = useMutation({
    mutationFn: (to: BloodRequestStatus) => bloodService.advance(r.id, to),
    onSuccess: (x) => {
      ["blood-requests", "blood-inventory", "blood-units"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success(`${x.requestNo}: ${x.status.toLowerCase()}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });
  const short = r.status !== "Issued" && r.status !== "Ready" && r.compatibleAvailable < r.units;
  return (
    <article className={cn("rounded-lg border bg-card p-3 shadow-[var(--shadow-raise)]", r.priority === "STAT" && "border-l-4 border-l-critical")}>
      <div className="flex items-center justify-between gap-2">
        <span className="num text-xs font-medium">{r.requestNo}</span>
        <StatusBadge status={r.priority} />
      </div>
      <Link href={`/patients/${r.patientId}`} className="mt-1.5 block text-sm font-medium hover:underline">
        {r.patient.fullName}
      </Link>
      <p className="text-xs text-muted-foreground">
        {r.patient.ageLabel} {r.patient.gender[0]} · {r.location}
      </p>
      <p className="mt-1.5 text-[13px]">
        <span className="font-semibold">{r.group}</span> {r.component} × <span className="num">{r.units}</span>
      </p>
      <p className="line-clamp-2 text-xs text-muted-foreground">{r.indication}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <span>Needed by {dateTime(r.requiredBy)}</span>
        <span>· {ago(r.requestedAt)}</span>
        {short && <StatusBadge tone="critical">Only {r.compatibleAvailable} compatible</StatusBadge>}
      </div>
      {can(role, "blood.issue") && r.status !== "Issued" && r.status !== "Cancelled" && (
        <div className="mt-2.5 flex gap-2">
          {next && (
            <Button size="sm" className="h-9 flex-1" disabled={advance.isPending || (next.to === "Ready" && short)} onClick={() => advance.mutate(next.to)}>
              {next.label} <ArrowRight />
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-9" aria-label={`Cancel request ${r.requestNo}`} disabled={advance.isPending} onClick={() => advance.mutate("Cancelled")}>
            <X />
          </Button>
        </div>
      )}
    </article>
  );
}

function NewRequestDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { user } = useCurrentUser();
  const doctors = useQuery({ queryKey: ["doctors", "all"], queryFn: () => doctorService.listAll(), enabled: open, staleTime: STALE.reference });
  const [patient, setPatient] = useState<PatientSummary>();
  const [form, setForm] = useState({ component: "PRBC" as BloodComponent, units: "1", priority: "Urgent" as Priority, indication: "", location: "", requiredBy: "4", doctorId: "" });
  const [tried, setTried] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const doctorId = form.doctorId || user?.doctorId || doctors.data?.[0]?.id || "";
  const units = Number(form.units);
  const valid = patient && units >= 1 && units <= 10 && form.indication.trim().length > 3 && form.location.trim() && doctorId;

  const create = useMutation({
    mutationFn: () =>
      bloodService.createRequest({
        patientId: patient!.id,
        group: patient!.bloodGroup as BloodGroup,
        component: form.component,
        units,
        priority: form.priority,
        indication: form.indication.trim(),
        location: form.location.trim(),
        requestedById: doctorId,
        requiredBy: new Date(Date.now() + Number(form.requiredBy) * 3600000).toISOString(),
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["blood-requests"] });
      toast.success(`Request ${r.requestNo} raised`, { description: `${r.compatibleAvailable} compatible ${r.component} units on the shelf` });
      onOpenChange(false);
      setPatient(undefined);
      setTried(false);
      setForm((f) => ({ ...f, indication: "", location: "" }));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New blood request</DialogTitle>
          <DialogDescription>Group is taken from the patient record. Cross-match confirms compatibility before issue.</DialogDescription>
        </DialogHeader>
        <form
          id="blood-request"
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setTried(true);
            if (valid) create.mutate();
          }}
        >
          {patient ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{patient.fullName}</p>
                <p className="num text-xs text-muted-foreground">
                  {patient.uhid} · {patient.ageLabel} {patient.gender[0]} · Group <span className="font-semibold text-foreground">{patient.bloodGroup}</span>
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Change patient" onClick={() => setPatient(undefined)}>
                <X />
              </Button>
            </div>
          ) : (
            <AsyncCombobox<PatientSummary>
              label="Patient"
              placeholder="Name, UHID or mobile"
              queryKey="patients"
              minChars={2}
              search={(q) => patientService.search(q, 8)}
              getKey={(p) => p.id}
              onSelect={setPatient}
              error={tried && !patient ? "Select a patient" : undefined}
              renderItem={(p) => (
                <span className="block">
                  <span className="block font-medium">{p.fullName}</span>
                  <span className="num block text-xs text-muted-foreground">
                    {p.uhid} · {p.ageLabel} {p.gender[0]} · {p.bloodGroup}
                  </span>
                </span>
              )}
            />
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField label="Component" value={form.component} onChange={set("component")} options={COMPONENTS} wrapperClassName="sm:col-span-2" />
            <TextField label="Units" type="number" min={1} max={10} value={form.units} onChange={set("units")} error={tried && !(units >= 1 && units <= 10) ? "1 to 10" : undefined} required />
            <SelectField label="Priority" value={form.priority} onChange={set("priority")} options={["STAT", "Urgent", "Routine"]} />
            <SelectField label="Needed within" value={form.requiredBy} onChange={set("requiredBy")} options={[{ value: "1", label: "1 hour" }, { value: "4", label: "4 hours" }, { value: "12", label: "12 hours" }, { value: "24", label: "24 hours" }]} />
            <TextField label="Location" value={form.location} onChange={set("location")} placeholder="e.g. ICU-04" error={tried && !form.location.trim() ? "Required" : undefined} required />
          </div>
          <TextareaField label="Indication" rows={2} value={form.indication} onChange={set("indication")} placeholder="e.g. Hb 6.2 g/dL with active GI bleed" error={tried && form.indication.trim().length <= 3 ? "Enter the clinical indication" : undefined} required />
          <SelectField label="Requesting doctor" value={doctorId} onChange={set("doctorId")} options={(doctors.data ?? []).map((d) => ({ value: d.id, label: `${d.name} · ${d.departmentName}` }))} />
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="blood-request" disabled={create.isPending}>
            Raise request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function BloodRequestsPage() {
  const [open, setOpen] = useState(false);
  const { role } = useCurrentUser();
  const q = useQuery({ queryKey: ["blood-requests"], queryFn: () => bloodService.getRequests(), staleTime: STALE.live, refetchInterval: 30_000 });
  const rows = q.data ?? [];
  const by = (...s: BloodRequestStatus[]) => rows.filter((r) => s.includes(r.status));
  return (
    <>
      <PageHeader
        title="Blood requests"
        breadcrumbs={[{ label: "Blood bank", href: "/blood-bank" }, { label: "Requests" }]}
        description="Transfusion requests from wards, OT and ER. STAT first."
        actions={
          (can(role, "blood.issue") || role === "Doctor") && (
            <Button onClick={() => setOpen(true)}>
              <Plus /> New request
            </Button>
          )
        }
      />
      {q.isLoading ? (
        <PanelSkeleton lines={12} className="rounded-xl border" />
      ) : (
        <KanbanBoard
          label="Blood request board"
          columns={[
            { id: "pending", title: "Pending", tone: "warning", items: by("Pending"), hint: "Awaiting sample and cross-match", empty: "No pending requests" },
            { id: "xm", title: "Cross-matching", tone: "info", items: by("Cross-matching"), empty: "Nothing on the bench" },
            { id: "ready", title: "Ready to issue", tone: "stable", items: by("Ready"), hint: "Units reserved", empty: "No units reserved" },
            { id: "done", title: "Issued / cancelled", tone: "neutral", items: by("Issued", "Cancelled"), empty: "None yet" },
          ]}
          getKey={(r) => r.id}
          renderCard={(r) => <RequestCard r={r} />}
          minColumnWidth={290}
        />
      )}
      <NewRequestDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
