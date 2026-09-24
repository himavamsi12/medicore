"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import type { AppointmentType, BookingChannel, PatientSummary } from "@/types";
import { appointmentService } from "@/services/appointmentService";
import { doctorService } from "@/services/doctorService";
import { patientService } from "@/services/patientService";
import { AsyncCombobox } from "@/components/forms/async-combobox";
import { ChoiceChips, SelectField, TextField } from "@/components/forms/fields";
import { EmptyState, PanelSkeleton } from "@/components/feedback/states";
import { StatusBadge } from "@/components/feedback/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface BookingPrefill {
  patientId?: string;
  doctorId?: string;
  date?: string;
  time?: string;
}

export function BookingDialog({ open, onOpenChange, prefill }: { open: boolean; onOpenChange: (o: boolean) => void; prefill?: BookingPrefill }) {
  const qc = useQueryClient();
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => format(addDays(new Date(), i), "yyyy-MM-dd")), []);
  const [patient, setPatient] = useState<PatientSummary>();
  const [deptId, setDeptId] = useState("");
  const [doctorId, setDoctorId] = useState(prefill?.doctorId ?? "");
  const [date, setDate] = useState(prefill?.date ?? days[0]);
  const [time, setTime] = useState(prefill?.time ?? "");
  const [type, setType] = useState<AppointmentType>("New");
  const [channel, setChannel] = useState<BookingChannel>("Front desk");
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);

  const prefilledPatient = useQuery({ queryKey: ["patient", prefill?.patientId], queryFn: () => patientService.getById(prefill!.patientId!), enabled: Boolean(prefill?.patientId) && !patient });
  const chosenPatient = patient ?? (prefilledPatient.data ? { ...prefilledPatient.data } : undefined);
  const doctors = useQuery({ queryKey: ["doctors-all"], queryFn: () => doctorService.listAll(), staleTime: 60_000 });
  const depts = useQuery({ queryKey: ["departments"], queryFn: () => doctorService.getDepartments(), staleTime: Infinity });
  const opdDoctors = (doctors.data ?? []).filter((d) => d.sessions.length > 0);
  const doctor = opdDoctors.find((d) => d.id === doctorId);
  const effectiveDept = deptId || doctor?.departmentId || "";
  const slots = useQuery({ queryKey: ["slots", doctorId, date], queryFn: () => doctorService.getSlots(doctorId, date), enabled: Boolean(doctorId) });

  const book = useMutation({
    mutationFn: () => appointmentService.book({ patientId: chosenPatient!.id, doctorId, date, time, type, channel, reason: reason.trim() || "Consultation" }),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["queue"] });
      qc.invalidateQueries({ queryKey: ["slots"] });
      qc.invalidateQueries({ queryKey: ["kpis"] });
      toast.success("Appointment booked", { description: `${a.patient.fullName} with ${a.doctor.name}, ${format(new Date(`${a.date}T00:00:00`), "EEE d MMM")} at ${a.time}` });
      onOpenChange(false);
    },
    onError: (e) => toast.error("Could not book", { description: e instanceof Error ? e.message : undefined }),
  });

  const missing = !chosenPatient ? "Select a patient" : !doctorId ? "Select a doctor" : !time ? "Pick a time slot" : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>Book appointment</DialogTitle>
          <DialogDescription>Slots update live as other desks book.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-5 px-5 py-5"
          onSubmit={(e) => {
            e.preventDefault();
            setTried(true);
            if (!missing) book.mutate();
          }}
        >
          {chosenPatient ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{chosenPatient.fullName}</p>
                <p className="num text-xs text-muted-foreground">
                  {chosenPatient.uhid} · {chosenPatient.ageLabel} {chosenPatient.gender[0]} · {chosenPatient.phone}
                </p>
              </div>
              {chosenPatient.allergies.length > 0 && <StatusBadge tone="critical">Allergy</StatusBadge>}
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Change patient" onClick={() => { setPatient(undefined); prefilledPatient.refetch(); }}>
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
              error={tried && !chosenPatient ? "Select a patient" : undefined}
              renderItem={(p) => (
                <span className="flex items-center justify-between gap-3">
                  <span>
                    <span className="block font-medium">{p.fullName}</span>
                    <span className="num block text-xs text-muted-foreground">
                      {p.uhid} · {p.ageLabel} {p.gender[0]} · {p.phone}
                    </span>
                  </span>
                  <StatusBadge status={p.status} />
                </span>
              )}
            />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Department"
              value={effectiveDept}
              placeholder="All departments"
              options={(depts.data ?? []).filter((d) => opdDoctors.some((x) => x.departmentId === d.id)).map((d) => ({ value: d.id, label: d.name }))}
              onChange={(e) => {
                setDeptId(e.target.value);
                setDoctorId("");
                setTime("");
              }}
            />
            <SelectField
              label="Doctor"
              required
              value={doctorId}
              placeholder="Select doctor"
              error={tried && !doctorId ? "Select a doctor" : undefined}
              options={opdDoctors.filter((d) => !effectiveDept || d.departmentId === effectiveDept).map((d) => ({ value: d.id, label: `${d.name} · ₹${d.consultationFee}` }))}
              onChange={(e) => {
                setDoctorId(e.target.value);
                setTime("");
              }}
            />
          </div>

          <div className="grid gap-1.5">
            <span className="text-[13px] font-medium" id="date-label">
              Date
            </span>
            <div role="radiogroup" aria-labelledby="date-label" className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
              {days.map((d, i) => {
                const wd = format(new Date(`${d}T00:00:00`), "EEE");
                const works = !doctor || doctor.sessions.some((s) => s.day === wd);
                return (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={date === d}
                    disabled={!works}
                    onClick={() => {
                      setDate(d);
                      setTime("");
                    }}
                    className={cn("flex min-w-14 shrink-0 flex-col items-center rounded-lg border px-2 py-1.5 text-xs hover:border-border-strong focus-visible:outline-2 disabled:opacity-35", date === d && "border-primary bg-info-soft text-info-fg")}
                  >
                    <span className="font-medium">{i === 0 ? "Today" : wd}</span>
                    <span className="num text-muted-foreground">{format(new Date(`${d}T00:00:00`), "d MMM")}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-1.5">
            <span className="text-[13px] font-medium" id="slot-label">
              Time slot
            </span>
            {!doctorId ? (
              <p className="rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">Select a doctor to see open slots.</p>
            ) : slots.isLoading ? (
              <PanelSkeleton lines={2} className="px-0" />
            ) : !slots.data?.length ? (
              <EmptyState compact title="No OPD session on this day" />
            ) : (
              <div role="radiogroup" aria-labelledby="slot-label" className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
                {slots.data.map((s) => (
                  <button
                    key={s.time}
                    type="button"
                    role="radio"
                    aria-checked={time === s.time}
                    disabled={!s.available}
                    onClick={() => setTime(s.time)}
                    className={cn("num h-8 rounded-lg border text-xs hover:border-primary focus-visible:outline-2 disabled:border-transparent disabled:bg-muted disabled:text-subtle-foreground disabled:line-through", time === s.time && "border-primary bg-primary text-primary-foreground")}
                  >
                    {s.time}
                  </button>
                ))}
              </div>
            )}
            {tried && doctorId && !time && <p className="text-xs text-critical-fg">Pick a time slot</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <ChoiceChips label="Visit type" value={type} onChange={setType} options={["New", "Follow-up", "Review", "Teleconsult"] as const} />
            <SelectField label="Booked via" value={channel} onChange={(e) => setChannel(e.target.value as BookingChannel)} options={["Front desk", "Phone", "Patient app", "Walk-in", "Referral"]} />
          </div>
          <TextField label="Reason for visit" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Fever for 3 days" />

          <DialogFooter className="-mx-5 -mb-5 mt-1 px-5">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={book.isPending}>
              {book.isPending && <Loader2 className="animate-spin" />}
              {doctor && time ? `Book ${format(new Date(`${date}T00:00:00`), "d MMM")} at ${time}` : "Book appointment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
