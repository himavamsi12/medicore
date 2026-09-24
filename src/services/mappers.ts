/**
 * Joins used by services to build view models. Only services import this file.
 */
import { todayLocal } from "@/lib/dates";
import { differenceInCalendarDays } from "date-fns";
import { getDb, type Database } from "@/data/db";
import { CLINIC_NOW, NOW } from "@/data/seed/clock";
import { LAB_TEST_MAP } from "@/data/reference/labTests";
import { ageLabel, ageYears, news2 } from "@/lib/clinical";
import { computeBillTotals } from "@/lib/billing-math";
import type {
  Admission,
  AdmissionView,
  Bill,
  BillView,
  Doctor,
  DoctorSummary,
  LabOrder,
  LabOrderView,
  Patient,
  PatientSummary,
  Prescription,
  PrescriptionView,
  Vitals,
} from "@/types";

export const db = (): Database => getDb();

/**
 * OPD clock: equals real time during clinic hours; outside them the mock OPD
 * runs from 11:20 today (see CLINIC_NOW in the data layer) and advances in real time.
 */
export function clinicNow(): Date {
  return new Date(CLINIC_NOW.getTime() + (Date.now() - NOW.getTime()));
}

export function indexBy<T extends { id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((r) => [r.id, r]));
}

export function patientSummary(p: Patient): PatientSummary {
  return {
    id: p.id,
    uhid: p.uhid,
    fullName: p.fullName,
    gender: p.gender,
    ageLabel: ageLabel(p.dob),
    ageYears: ageYears(p.dob),
    phone: p.phone,
    bloodGroup: p.bloodGroup,
    allergies: p.allergies,
    flags: p.flags,
    status: p.status,
    paymentCategory: p.paymentCategory,
  };
}

export function patientRef(id: string): PatientSummary {
  const p = db().patients.find((x) => x.id === id);
  if (!p) throw new Error(`Patient ${id} missing`);
  return patientSummary(p);
}

export function doctorSummary(d: Doctor): DoctorSummary {
  return {
    id: d.id,
    name: d.name,
    departmentId: d.departmentId,
    departmentName: db().departments.find((x) => x.id === d.departmentId)?.name ?? "",
    designation: d.designation,
  };
}

export function doctorRef(id: string): DoctorSummary {
  const d = db().doctors.find((x) => x.id === id);
  if (!d) return { id, name: "Unknown doctor", departmentId: "", departmentName: "", designation: "Consultant" };
  return doctorSummary(d);
}

export function latestVitals(patientId: string): Vitals | undefined {
  const all = db().vitals;
  for (let i = all.length - 1; i >= 0; i--) if (all[i].patientId === patientId) return all[i];
  return undefined;
}

export function vitalsSeries(patientId: string, limit = 60): Vitals[] {
  return db().vitals.filter((v) => v.patientId === patientId).slice(-limit);
}

export function admissionView(a: Admission): AdmissionView {
  const d = db();
  const bed = d.beds.find((b) => b.id === a.bedId)!;
  const ward = d.wards.find((w) => w.id === a.wardId)!;
  const lv = a.dischargedAt ? undefined : latestVitals(a.patientId);
  return {
    ...a,
    patient: patientRef(a.patientId),
    doctor: doctorRef(a.admittingDoctorId),
    bed,
    ward,
    lengthOfStayDays: Math.max(0, differenceInCalendarDays(a.dischargedAt ? new Date(a.dischargedAt) : new Date(), new Date(a.admittedAt))),
    latestVitals: lv,
    news2: lv ? news2(lv) : undefined,
  };
}

export function patientLocation(patientId: string): string | undefined {
  const d = db();
  const bed = d.beds.find((b) => b.patientId === patientId && b.status === "Occupied");
  if (bed) return bed.code;
  const er = d.erCases.find((e) => e.patientId === patientId && ["Waiting", "In triage", "Under treatment", "Observation"].includes(e.status));
  return er ? "ER" : undefined;
}

export function labOrderView(o: LabOrder): LabOrderView {
  const tests = o.testCodes.map((c) => LAB_TEST_MAP[c]).filter(Boolean);
  const end = o.verifiedAt ?? o.resultedAt;
  return {
    ...o,
    patient: patientRef(o.patientId),
    orderedBy: doctorRef(o.orderedById),
    tests,
    abnormalCount: o.results.filter((r) => r.flag !== "N").length,
    criticalCount: o.results.filter((r) => r.flag === "HH" || r.flag === "LL").length,
    tatMinutes: end ? Math.round((new Date(end).getTime() - new Date(o.orderedAt).getTime()) / 60000) : undefined,
    location: patientLocation(o.patientId),
  };
}

export function onHandForDrug(drugId: string): number {
  const today = todayLocal();
  return db().stock.filter((b) => b.drugId === drugId && b.expiry >= today).reduce((s, b) => s + b.qty, 0);
}

export function prescriptionView(rx: Prescription): PrescriptionView {
  const d = db();
  const items = rx.items.map((i) => {
    const drug = d.drugs.find((x) => x.id === i.drugId)!;
    return { ...i, drug, onHand: onHandForDrug(i.drugId) };
  });
  return {
    ...rx,
    patient: patientRef(rx.patientId),
    doctor: doctorRef(rx.doctorId),
    items,
    totalValue: Math.round(items.reduce((s, i) => s + i.qty * i.drug.mrp, 0)),
    location: patientLocation(rx.patientId),
  };
}

export function billView(b: Bill): BillView {
  const payer = b.payerId ? db().payers.find((p) => p.id === b.payerId) : undefined;
  return { ...b, totals: computeBillTotals(b), patient: patientRef(b.patientId), payerName: payer?.shortName };
}

/** Sequential id generator for records created at runtime. */
export function nextId(prefix: string, rows: { id: string }[], width = 5): string {
  const d = db();
  const current = d.seq[prefix] ?? rows.reduce((m, r) => Math.max(m, Number(r.id.split("-").pop()) || 0), 0);
  d.seq[prefix] = current + 1;
  return `${prefix}-${String(current + 1).padStart(width, "0")}`;
}

export interface CurrentMedication {
  drugId: string;
  brand: string;
  generic: string;
  strength: string;
  dose: string;
  frequency: string;
  source: "Inpatient order" | "Prescription" | "Home medication";
  since?: string;
  prescribedBy?: string;
}

/** Active medications: inpatient orders if admitted, else prescriptions from the last 60 days plus home medications. */
export function currentMedications(patientId: string): CurrentMedication[] {
  const d = db();
  const adm = d.admissions.find((a) => a.patientId === patientId && !a.dischargedAt);
  const cutoff = Date.now() - 60 * 86400000;
  const rxs = d.prescriptions
    .filter((r) => r.patientId === patientId && r.status !== "Cancelled" && (adm ? r.encounterId === adm.id : new Date(r.createdAt).getTime() >= cutoff))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const seen = new Set<string>();
  const out: CurrentMedication[] = [];
  for (const rx of rxs) {
    for (const it of rx.items) {
      if (seen.has(it.drugId)) continue;
      seen.add(it.drugId);
      const drug = d.drugs.find((x) => x.id === it.drugId)!;
      out.push({ drugId: drug.id, brand: drug.brand, generic: drug.generic, strength: drug.strength, dose: it.dose, frequency: it.frequency, source: adm ? "Inpatient order" : "Prescription", since: rx.createdAt, prescribedBy: d.doctors.find((x) => x.id === rx.doctorId)?.name });
    }
  }
  if (!adm) {
    const p = d.patients.find((x) => x.id === patientId);
    for (const id of p?.homeMedications ?? []) {
      if (seen.has(id)) continue;
      seen.add(id);
      const drug = d.drugs.find((x) => x.id === id)!;
      out.push({ drugId: drug.id, brand: drug.brand, generic: drug.generic, strength: drug.strength, dose: drug.form === "Inhaler" ? "2 puffs" : "1 tab", frequency: "As advised", source: "Home medication" });
    }
  }
  return out;
}
