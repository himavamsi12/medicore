import type { Address, BloodGroup, Gender, INR, ISODate, ISODateTime } from "./common";

export type PaymentCategory = "Self-pay" | "Insurance" | "Corporate" | "PMJAY" | "CGHS";
export type PatientStatus = "OPD" | "Admitted" | "In ER" | "Discharged" | "Inactive";

export interface Allergy {
  substance: string;
  category: "Drug" | "Food" | "Environmental";
  reaction: string;
  severity: "Mild" | "Moderate" | "Severe";
}

export interface Condition {
  code: string; // ICD-10
  name: string;
  since?: ISODate;
  chronic: boolean;
}

export interface InsuranceCover {
  payerId: string;
  payerName: string;
  tpaName?: string;
  policyNo: string;
  validTill: ISODate;
  sumInsured: INR;
}

export interface EmergencyContact {
  name: string;
  relation: string;
  phone: string;
}

export interface Patient {
  id: string;
  uhid: string;
  abhaNumber?: string; // 14-digit, formatted 91-XXXX-XXXX-XXXX
  abhaAddress?: string;
  firstName: string;
  lastName: string;
  fullName: string;
  gender: Gender;
  dob: ISODate;
  bloodGroup: BloodGroup;
  phone: string;
  email?: string;
  address: Address;
  maritalStatus: "Single" | "Married" | "Widowed" | "Divorced";
  occupation?: string;
  preferredLanguage: string;
  emergencyContact: EmergencyContact;
  allergies: Allergy[];
  conditions: Condition[];
  /** Long-term home medications (formulary drug ids) from medication reconciliation. */
  homeMedications: string[];
  paymentCategory: PaymentCategory;
  insurance?: InsuranceCover;
  status: PatientStatus;
  primaryDoctorId?: string;
  registeredAt: ISODateTime;
  lastVisitAt?: ISODateTime;
  flags: PatientFlag[];
}

export type PatientFlag = "VIP" | "MLC" | "Fall risk" | "Isolation" | "DNR" | "Pregnant" | "High risk";

export interface Vitals {
  id: string;
  patientId: string;
  recordedAt: ISODateTime;
  recordedBy: string;
  source: "OPD" | "IPD" | "ER";
  bpSystolic: number;
  bpDiastolic: number;
  pulse: number;
  respRate: number;
  tempF: number;
  spo2: number;
  painScore?: number;
  weightKg?: number;
  heightCm?: number;
  grbs?: number; // capillary blood glucose mg/dL
  gcs?: number;
  consciousness?: "Alert" | "Voice" | "Pain" | "Unresponsive" | "New confusion";
  onOxygen?: boolean;
}

export interface PatientDocument {
  id: string;
  patientId: string;
  title: string;
  kind: "Discharge summary" | "Lab report" | "Imaging" | "Consent" | "ID proof" | "Insurance" | "Referral" | "Prescription";
  uploadedAt: ISODateTime;
  uploadedBy: string;
  sizeKb: number;
}

export type TimelineEventKind =
  | "registration"
  | "visit"
  | "admission"
  | "discharge"
  | "transfer"
  | "lab"
  | "radiology"
  | "prescription"
  | "procedure"
  | "er"
  | "vitals"
  | "bill";

export interface TimelineEvent {
  id: string;
  patientId: string;
  at: ISODateTime;
  kind: TimelineEventKind;
  title: string;
  detail?: string;
  actor?: string;
  href?: string;
  severity?: "critical" | "warning" | "stable" | "info" | "neutral";
}

export interface NewPatientInput {
  firstName: string;
  lastName: string;
  gender: Gender;
  dob: ISODate;
  bloodGroup: BloodGroup;
  phone: string;
  email?: string;
  abhaNumber?: string;
  address: Address;
  maritalStatus: Patient["maritalStatus"];
  occupation?: string;
  preferredLanguage: string;
  emergencyContact: EmergencyContact;
  allergies: Allergy[];
  paymentCategory: PaymentCategory;
  insurance?: Omit<InsuranceCover, "payerName"> & { payerName?: string };
}
