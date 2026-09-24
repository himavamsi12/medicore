/**
 * View models returned by services: domain records joined with the related
 * entities a screen needs. These are the backend contract for list/detail APIs.
 */
import type { Gender, BloodGroup, Severity } from "./common";
import type { Allergy, Patient, PatientFlag, Vitals } from "./patient";
import type { Appointment } from "./opd";
import type { Admission, Bed, Ward } from "./ipd";
import type { ErCase } from "./emergency";
import type { LabOrder, LabTest, RadiologyOrder } from "./diagnostics";
import type { Drug, Prescription, StockBatch } from "./pharmacy";
import type { BloodRequest, InventoryItem, MarEntry, PurchaseOrder, Staff, Surgery, Vendor } from "./operations";
import type { BillWithTotals, Claim, Payer } from "./billing";
import type { Department, Doctor } from "./org";

export interface PatientSummary {
  id: string;
  uhid: string;
  fullName: string;
  gender: Gender;
  ageLabel: string;
  ageYears: number;
  phone: string;
  bloodGroup: BloodGroup;
  allergies: Allergy[];
  flags: PatientFlag[];
  status: Patient["status"];
  paymentCategory: Patient["paymentCategory"];
}

export interface DoctorSummary {
  id: string;
  name: string;
  departmentId: string;
  departmentName: string;
  designation: Doctor["designation"];
}

export type PatientListItem = PatientSummary & {
  abhaNumber?: string;
  city: string;
  registeredAt: string;
  lastVisitAt?: string;
  conditions: string[];
  primaryDoctor?: string;
  location?: string; // bed code or "ER"
};

export type PatientDetail = Patient & {
  ageLabel: string;
  ageYears: number;
  primaryDoctor?: DoctorSummary;
  activeAdmission?: AdmissionView;
  activeErCase?: ErCase;
  latestVitals?: Vitals;
};

export type AppointmentView = Appointment & {
  patient: PatientSummary;
  doctor: DoctorSummary;
  waitMinutes?: number;
};

export type AdmissionView = Admission & {
  patient: PatientSummary;
  doctor: DoctorSummary;
  bed: Bed;
  ward: Ward;
  lengthOfStayDays: number;
  latestVitals?: Vitals;
  news2?: number;
};

export type BedView = Bed & {
  ward: Ward;
  patient?: PatientSummary;
  admission?: Pick<Admission, "id" | "ipNo" | "admittedAt" | "acuity" | "expectedDischarge" | "status" | "reason">;
  doctorName?: string;
  news2?: number;
};

export interface WardOccupancy {
  ward: Ward;
  total: number;
  occupied: number;
  available: number;
  cleaning: number;
  reserved: number;
  maintenance: number;
  nurseInCharge?: string;
}

export type ErCaseView = ErCase & {
  patient: PatientSummary;
  doctor?: DoctorSummary;
  bedCode?: string;
  waitingMinutes: number;
};

export type LabOrderView = LabOrder & {
  patient: PatientSummary;
  orderedBy: DoctorSummary;
  tests: LabTest[];
  abnormalCount: number;
  criticalCount: number;
  tatMinutes?: number;
  location?: string;
};

export type RadiologyOrderView = RadiologyOrder & {
  patient: PatientSummary;
  orderedBy: DoctorSummary;
  radiologist?: DoctorSummary;
};

export type RxItemView = Prescription["items"][number] & { drug: Drug; onHand: number };

export type PrescriptionView = Omit<Prescription, "items"> & {
  patient: PatientSummary;
  doctor: DoctorSummary;
  items: RxItemView[];
  totalValue: number;
  location?: string;
};

export interface StockRow {
  drug: Drug;
  onHand: number;
  batches: StockBatch[];
  nearestExpiry?: string;
  expiringQty: number;
  expiredQty: number;
  belowReorder: boolean;
  stockValue: number;
}

export type MarView = MarEntry & { patient: PatientSummary; bedCode: string };

export interface NursingPatient {
  admission: AdmissionView;
  latestVitals?: Vitals;
  news2?: number;
  news2Trend: number[];
  dueMeds: number;
  overdueMeds: number;
}

export type SurgeryView = Surgery & {
  patient: PatientSummary;
  surgeon: DoctorSummary;
  anaesthetist: DoctorSummary;
  assistants: DoctorSummary[];
  scrubNurse?: Pick<Staff, "id" | "name">;
  otName: string;
  departmentName: string;
};

export type BloodRequestView = BloodRequest & { patient: PatientSummary; requestedBy: DoctorSummary; compatibleAvailable: number };

export type BillView = BillWithTotals & { patient: PatientSummary; payerName?: string };

export type ClaimView = Claim & { patient: PatientSummary; insurerName: string; tpaName?: string; billNo?: string; ipNo?: string };

export type InventoryRow = InventoryItem & { vendor: Vendor; value: number; daysOfCover: number; status: "In stock" | "Low" | "Out of stock"; openPoQty: number };

export type PurchaseOrderView = PurchaseOrder & { vendor: Vendor; total: number; itemCount: number; lineItems: (PurchaseOrder["lines"][number] & { item: InventoryItem })[] };

export type StaffRow = Staff & { departmentName: string; wardName?: string; todayShift?: string; todayAttendance?: string };

export type DepartmentView = Department & {
  head?: DoctorSummary;
  doctorCount: number;
  opdToday: number;
  inpatients: number;
};

export type DoctorView = Doctor & {
  departmentName: string;
  opdToday: number;
  inpatients: number;
  nextAvailable?: string;
};

export interface Kpi {
  id: string;
  label: string;
  value: number;
  format: "number" | "percent" | "inr" | "minutes";
  delta?: number; // change vs previous period, same unit
  deltaLabel?: string;
  goodDirection?: "up" | "down";
  severity?: Severity;
  spark?: number[];
  href?: string;
}

export type { Payer };
