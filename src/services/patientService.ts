import { differenceInCalendarDays } from "date-fns";
import type {
  ListParams,
  NewPatientInput,
  Paginated,
  Patient,
  PatientDetail,
  PatientDocument,
  PatientListItem,
  PatientSummary,
  TimelineEvent,
  Vitals,
} from "@/types";
import { LAB_TEST_MAP } from "@/data/reference/labTests";
import { ageLabel, ageYears } from "@/lib/clinical";
import { mock, notFound } from "./http";
import { admissionView, currentMedications, db, doctorRef, latestVitals, nextId, patientLocation, patientSummary, vitalsSeries, type CurrentMedication } from "./mappers";
import { oneOf, runQuery } from "./query";

export type { CurrentMedication } from "./mappers";

function toListItem(p: Patient): PatientListItem {
  const doc = p.primaryDoctorId ? db().doctors.find((d) => d.id === p.primaryDoctorId) : undefined;
  return {
    ...patientSummary(p),
    abhaNumber: p.abhaNumber,
    city: p.address.city,
    registeredAt: p.registeredAt,
    lastVisitAt: p.lastVisitAt,
    conditions: p.conditions.map((c) => c.name),
    primaryDoctor: doc?.name,
    location: patientLocation(p.id),
  };
}

export const patientService = {
  getAll(params: ListParams = {}): Promise<Paginated<PatientListItem>> {
    return mock(() =>
      runQuery(db().patients.map(toListItem), params, {
        search: (r) => [r.fullName, r.uhid, r.phone.replace(/\s/g, ""), r.phone, r.abhaNumber, r.city, ...r.conditions],
        filters: {
          status: (r, v) => oneOf(r.status, v),
          gender: (r, v) => oneOf(r.gender, v),
          paymentCategory: (r, v) => oneOf(r.paymentCategory, v),
          condition: (r, v) => r.conditions.some((c) => c.toLowerCase().includes(String(v).toLowerCase())),
          hasAllergy: (r, v) => (v === "yes" ? r.allergies.length > 0 : v === "no" ? r.allergies.length === 0 : true),
        },
        sort: {
          fullName: (r) => r.fullName,
          uhid: (r) => r.uhid,
          age: (r) => r.ageYears,
          registeredAt: (r) => r.registeredAt,
          lastVisitAt: (r) => r.lastVisitAt,
          status: (r) => r.status,
        },
        date: (r) => r.registeredAt,
        defaultSort: { id: "registeredAt", desc: true },
      }),
    );
  },

  /** Lightweight lookup used by comboboxes and the command bar. */
  search(query: string, limit = 8): Promise<PatientSummary[]> {
    return mock(
      () => {
        const q = query.trim().toLowerCase();
        if (!q) return db().patients.slice(0, limit).map(patientSummary);
        const digits = q.replace(/\D/g, "");
        return db()
          .patients.filter((p) => {
            const text = [p.fullName, p.uhid, p.abhaNumber ?? ""].join(" ").toLowerCase();
            return text.includes(q) || (digits.length >= 4 && p.phone.replace(/\D/g, "").includes(digits));
          })
          .slice(0, limit)
          .map(patientSummary);
      },
      { min: 80, max: 200 },
    );
  },

  getById(id: string): Promise<PatientDetail> {
    return mock(() => {
      const d = db();
      const p = d.patients.find((x) => x.id === id) ?? notFound("Patient", id);
      const adm = d.admissions.find((a) => a.patientId === id && !a.dischargedAt);
      const er = d.erCases.find((e) => e.patientId === id && ["Waiting", "In triage", "Under treatment", "Observation"].includes(e.status));
      return {
        ...p,
        ageLabel: ageLabel(p.dob),
        ageYears: ageYears(p.dob),
        primaryDoctor: p.primaryDoctorId ? doctorRef(p.primaryDoctorId) : undefined,
        activeAdmission: adm ? admissionView(adm) : undefined,
        activeErCase: er,
        latestVitals: latestVitals(id),
      };
    });
  },

  create(input: NewPatientInput): Promise<Patient> {
    return mock(() => {
      const d = db();
      const id = nextId("PAT", d.patients, 4);
      const payer = input.insurance ? d.payers.find((x) => x.id === input.insurance!.payerId) : undefined;
      const patient: Patient = {
        id,
        uhid: `MC${String(270000 + d.patients.length * 13).padStart(7, "0")}`,
        abhaNumber: input.abhaNumber || undefined,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        fullName: `${input.firstName.trim()} ${input.lastName.trim()}`,
        gender: input.gender,
        dob: input.dob,
        bloodGroup: input.bloodGroup,
        phone: input.phone,
        email: input.email || undefined,
        address: input.address,
        maritalStatus: input.maritalStatus,
        occupation: input.occupation || undefined,
        preferredLanguage: input.preferredLanguage,
        emergencyContact: input.emergencyContact,
        allergies: input.allergies,
        conditions: [],
        homeMedications: [],
        paymentCategory: input.paymentCategory,
        insurance: input.insurance ? { ...input.insurance, payerName: payer?.shortName ?? input.insurance.payerName ?? "Insurer" } : undefined,
        status: "OPD",
        registeredAt: new Date().toISOString(),
        flags: [],
      };
      d.patients.unshift(patient);
      d.meta.profileOf[id] = "healthy";
      d.activity.unshift({ id: nextId("ACT", d.activity), at: patient.registeredAt, actor: "Front office", actorRole: "Receptionist", verb: "registered", target: patient.fullName, module: "Patients", href: `/patients/${id}`, severity: "info" });
      return patient;
    });
  },

  /** Mock ABDM (ABHA) verification. Real integration: ABDM gateway via the backend. */
  verifyAbha(abha: string): Promise<{ verified: boolean; message: string }> {
    return mock(
      () => {
        const digits = abha.replace(/\D/g, "");
        if (digits.length !== 14) return { verified: false, message: "ABHA number must have 14 digits." };
        if (db().patients.some((p) => p.abhaNumber?.replace(/\D/g, "") === digits)) return { verified: false, message: "This ABHA number is already linked to another UHID." };
        return { verified: true, message: "Verified with ABDM. Demographics match the entered details." };
      },
      { min: 900, max: 1500 },
    );
  },

  getMedications(patientId: string): Promise<CurrentMedication[]> {
    return mock(() => currentMedications(patientId));
  },

  getVitals(patientId: string, limit = 60): Promise<Vitals[]> {
    return mock(() => vitalsSeries(patientId, limit));
  },

  getDocuments(patientId: string): Promise<PatientDocument[]> {
    return mock(() => db().documents.filter((x) => x.patientId === patientId).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)));
  },

  getTimeline(patientId: string): Promise<TimelineEvent[]> {
    return mock(() => {
      const d = db();
      const p = d.patients.find((x) => x.id === patientId) ?? notFound("Patient", patientId);
      const ev: TimelineEvent[] = [];
      let i = 0;
      const push = (e: Omit<TimelineEvent, "id" | "patientId">) => ev.push({ ...e, id: `TL-${i++}`, patientId });
      const doc = (id: string) => d.doctors.find((x) => x.id === id)?.name;

      push({ at: p.registeredAt, kind: "registration", title: "Registered at MediCore", detail: `UHID ${p.uhid}${p.abhaNumber ? `, ABHA linked` : ""}`, severity: "neutral" });
      for (const a of d.appointments.filter((x) => x.patientId === patientId && (x.status === "Completed" || x.status === "In consultation"))) {
        push({ at: a.consultation?.completedAt ?? a.calledAt ?? `${a.date}T${a.time}:00`, kind: "visit", title: `OPD consultation, ${d.departments.find((x) => x.id === a.departmentId)?.name}`, detail: `${doc(a.doctorId)}. ${a.consultation?.diagnoses.map((x) => x.name).join(", ") || a.reason}`, actor: doc(a.doctorId), href: `/opd/consult/${a.id}`, severity: "info" });
      }
      for (const a of d.admissions.filter((x) => x.patientId === patientId)) {
        const ward = d.wards.find((w) => w.id === a.wardId)?.name;
        push({ at: a.admittedAt, kind: "admission", title: `Admitted to ${ward}`, detail: `${a.ipNo}. ${a.reason}`, actor: doc(a.admittingDoctorId), href: `/ipd/admissions/${a.id}`, severity: a.acuity === "Critical" ? "critical" : a.acuity === "Serious" ? "warning" : "info" });
        for (const t of a.transfers) push({ at: t.at, kind: "transfer", title: "Bed transfer", detail: `${t.fromBedId.replace("BED-", "")} to ${t.toBedId.replace("BED-", "")}. ${t.reason}`, actor: t.by, severity: "neutral" });
        if (a.dischargedAt) push({ at: a.dischargedAt, kind: "discharge", title: a.status === "LAMA" ? "Left against medical advice" : "Discharged", detail: `After ${differenceInCalendarDays(new Date(a.dischargedAt), new Date(a.admittedAt))} days`, href: `/ipd/admissions/${a.id}`, severity: "stable" });
      }
      for (const e of d.erCases.filter((x) => x.patientId === patientId)) {
        push({ at: e.arrivedAt, kind: "er", title: `Emergency visit${e.triageLevel ? `, triage level ${e.triageLevel}` : ""}`, detail: e.chiefComplaint, href: `/emergency/${e.id}`, severity: (e.triageLevel ?? 5) <= 2 ? "critical" : "warning" });
      }
      for (const o of d.labOrders.filter((x) => x.patientId === patientId && (x.status === "Verified" || x.status === "Resulted"))) {
        const abn = o.results.filter((r) => r.flag !== "N").length;
        const crit = o.results.some((r) => r.flag === "HH" || r.flag === "LL");
        push({ at: o.verifiedAt ?? o.resultedAt!, kind: "lab", title: o.testCodes.map((c) => LAB_TEST_MAP[c]?.name ?? c).join(", "), detail: abn ? `${abn} abnormal value${abn > 1 ? "s" : ""}` : "All values within reference range", href: `/lab/orders/${o.id}`, severity: crit ? "critical" : abn ? "warning" : "stable" });
      }
      for (const r of d.radiologyOrders.filter((x) => x.patientId === patientId && x.report)) {
        push({ at: r.report!.reportedAt, kind: "radiology", title: r.study, detail: r.report!.impression, href: `/radiology/${r.id}`, severity: "info" });
      }
      for (const rx of d.prescriptions.filter((x) => x.patientId === patientId && x.source === "OPD")) {
        push({ at: rx.createdAt, kind: "prescription", title: `Prescription ${rx.rxNo}`, detail: `${rx.items.length} medicines`, actor: doc(rx.doctorId), severity: "neutral" });
      }
      for (const s of d.surgeries.filter((x) => x.patientId === patientId && x.status !== "Cancelled")) {
        push({ at: s.actualStart ?? s.scheduledStart, kind: "procedure", title: s.procedure, detail: `${s.status}, ${s.otId}`, actor: doc(s.surgeonId), href: `/ot/cases/${s.id}`, severity: s.status === "Completed" ? "stable" : "info" });
      }
      const now = new Date().toISOString();
      return ev.filter((e) => e.at <= now).sort((a, b) => b.at.localeCompare(a.at));
    });
  },

  recordVitals(input: Omit<Vitals, "id" | "recordedAt"> & { recordedAt?: string }): Promise<Vitals> {
    return mock(() => {
      const d = db();
      const v: Vitals = { ...input, id: nextId("VIT", d.vitals, 6), recordedAt: input.recordedAt ?? new Date().toISOString() };
      d.vitals.push(v);
      return v;
    });
  },
};
