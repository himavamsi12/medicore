"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import type { Admission, BedView, Diagnosis, PatientSummary } from "@/types";
import { doctorService } from "@/services/doctorService";
import { ipdService } from "@/services/ipdService";
import { patientService } from "@/services/patientService";
import { referenceService, type Icd10Code } from "@/services/referenceService";
import { AsyncCombobox } from "@/components/forms/async-combobox";
import { ChoiceChips, SelectField, TextField } from "@/components/forms/fields";
import { StatusBadge } from "@/components/feedback/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inr } from "@/lib/format";

export function AdmitDialog({ bed, patientId, onClose }: { bed: BedView; patientId?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [patient, setPatient] = useState<PatientSummary>();
  const pre = useQuery({ queryKey: ["patient", patientId], queryFn: () => patientService.getById(patientId!), enabled: Boolean(patientId) && !patient });
  const chosen = patient ?? pre.data;
  const doctors = useQuery({ queryKey: ["doctors-all"], queryFn: () => doctorService.listAll(), staleTime: 60_000 });
  const [doctorId, setDoctorId] = useState("");
  const [type, setType] = useState<Admission["admissionType"]>("Emergency");
  const [reason, setReason] = useState("");
  const [dx, setDx] = useState<Diagnosis[]>([]);
  const [los, setLos] = useState(3);
  const [tried, setTried] = useState(false);

  const admit = useMutation({
    mutationFn: () => ipdService.admit({ patientId: chosen!.id, bedId: bed.id, admittingDoctorId: doctorId, admissionType: type, reason: reason.trim(), provisionalDiagnosis: dx, expectedDischarge: format(addDays(new Date(), los), "yyyy-MM-dd") }),
    onSuccess: (a) => {
      ["beds", "occupancy", "admissions", "patient", "patients", "kpis"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success(`${a.patient.fullName} admitted to ${a.bed.code}`, { description: `${a.ipNo} under ${a.doctor.name}` });
      onClose();
      router.push(`/ipd/admissions/${a.id}`);
    },
    onError: (e) => toast.error("Admission failed", { description: e instanceof Error ? e.message : undefined }),
  });

  const errors = { patient: !chosen, doctor: !doctorId, reason: reason.trim().length < 4 };
  const valid = !Object.values(errors).some(Boolean);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Admit to {bed.code}</DialogTitle>
          <DialogDescription>
            {bed.ward.name}, {bed.ward.floor} · {inr(bed.ward.dailyRate)} per day{bed.features.length ? ` · ${bed.features.join(", ")}` : ""}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setTried(true);
            if (valid) admit.mutate();
          }}
        >
          {chosen ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2">
              <div>
                <p className="text-sm font-medium">{chosen.fullName}</p>
                <p className="num text-xs text-muted-foreground">
                  {chosen.uhid} · {chosen.ageLabel} {chosen.gender[0]} · {chosen.paymentCategory}
                </p>
              </div>
              {chosen.allergies.length > 0 && <StatusBadge tone="critical">Allergy</StatusBadge>}
              {!patientId && (
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Change patient" onClick={() => setPatient(undefined)}>
                  <X />
                </Button>
              )}
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
              error={tried && errors.patient ? "Select a patient" : undefined}
              renderItem={(p) => (
                <span className="flex items-center justify-between gap-2">
                  <span>
                    <span className="block font-medium">{p.fullName}</span>
                    <span className="num block text-xs text-muted-foreground">
                      {p.uhid} · {p.ageLabel} {p.gender[0]}
                    </span>
                  </span>
                  <StatusBadge status={p.status} />
                </span>
              )}
            />
          )}
          {chosen?.status === "Admitted" && <p className="text-xs text-critical-fg">This patient already has an active admission. Use a transfer instead.</p>}
          <SelectField
            label="Admitting consultant"
            required
            placeholder="Select consultant"
            value={doctorId}
            onChange={(e) => setDoctorId(e.target.value)}
            error={tried && errors.doctor ? "Select a consultant" : undefined}
            options={(doctors.data ?? []).filter((d) => !["DEP-RAD", "DEP-ANA", "DEP-LAB"].includes(d.departmentId)).map((d) => ({ value: d.id, label: `${d.name} · ${d.departmentName}` }))}
          />
          <ChoiceChips label="Admission type" value={type} onChange={setType} options={["Emergency", "Elective", "Day care"] as const} />
          <TextField label="Reason for admission" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Community-acquired pneumonia with hypoxia" error={tried && errors.reason ? "Describe the reason" : undefined} />
          <div className="grid gap-2">
            <AsyncCombobox<Icd10Code>
              label="Provisional diagnosis (ICD-10)"
              placeholder="Search code or term"
              queryKey="icd10"
              search={(q) => referenceService.searchIcd10(q)}
              getKey={(c) => c.code}
              onSelect={(c) => setDx((cur) => (cur.some((d) => d.code === c.code) ? cur : [...cur, { code: c.code, name: c.name, type: "Provisional" }]))}
              renderItem={(c) => (
                <span className="flex gap-3">
                  <span className="num w-16 shrink-0 text-xs text-muted-foreground">{c.code}</span>
                  <span className="truncate">{c.name}</span>
                </span>
              )}
            />
            {dx.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {dx.map((d) => (
                  <button key={d.code} type="button" onClick={() => setDx((cur) => cur.filter((x) => x.code !== d.code))} className="inline-flex h-6 items-center gap-1 rounded-full bg-secondary px-2 text-xs hover:bg-accent" aria-label={`Remove ${d.name}`}>
                    <span className="num text-muted-foreground">{d.code}</span> {d.name} <X className="size-3" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <SelectField label="Expected length of stay" value={String(los)} onChange={(e) => setLos(Number(e.target.value))} options={[1, 2, 3, 4, 5, 7, 10, 14].map((d) => ({ value: String(d), label: `${d} day${d > 1 ? "s" : ""} (till ${format(addDays(new Date(), d), "d MMM")})` }))} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={admit.isPending || chosen?.status === "Admitted"}>
              {admit.isPending && <Loader2 className="animate-spin" />} Admit to {bed.code}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
