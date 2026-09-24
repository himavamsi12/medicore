import type { INR, ISODate, ISODateTime } from "./common";
import type { Diagnosis } from "./opd";

export type WardType = "General" | "Semi-private" | "Private" | "Suite" | "ICU" | "HDU" | "NICU" | "ER";
export type BedStatus = "Occupied" | "Available" | "Cleaning" | "Reserved" | "Maintenance";

export interface Ward {
  id: string;
  name: string;
  type: WardType;
  floor: string;
  wing: string;
  departmentId?: string;
  nurseInChargeId?: string;
  dailyRate: INR;
}

export interface Bed {
  id: string;
  code: string; // "ICU-04"
  wardId: string;
  status: BedStatus;
  admissionId?: string;
  patientId?: string;
  features: string[];
  statusSince: ISODateTime;
}

export type AdmissionStatus = "Admitted" | "Discharge planned" | "Discharged" | "LAMA" | "Expired";
export type Acuity = "Critical" | "Serious" | "Stable";

export interface Transfer {
  id: string;
  at: ISODateTime;
  fromBedId: string;
  toBedId: string;
  reason: string;
  by: string;
}

export interface ProgressNote {
  id: string;
  at: ISODateTime;
  authorId: string;
  authorName: string;
  kind: "Doctor" | "Nursing";
  text: string;
}

export interface DischargeSummary {
  finalDiagnoses: Diagnosis[];
  hospitalCourse: string;
  proceduresDone: string[];
  conditionAtDischarge: "Improved" | "Stable" | "Unchanged" | "Referred";
  dischargeMedications: { drug: string; dose: string; frequency: string; duration: string }[];
  followUp: string;
  instructions: string[];
  preparedBy: string;
  preparedAt: ISODateTime;
  status: "Draft" | "Final";
}

export interface Admission {
  id: string;
  ipNo: string;
  patientId: string;
  bedId: string;
  wardId: string;
  admittingDoctorId: string;
  departmentId: string;
  admittedAt: ISODateTime;
  expectedDischarge: ISODate;
  dischargedAt?: ISODateTime;
  status: AdmissionStatus;
  admissionType: "Elective" | "Emergency" | "Day care";
  acuity: Acuity;
  provisionalDiagnosis: Diagnosis[];
  reason: string;
  dietOrder: string;
  codeStatus: "Full code" | "DNR";
  isolation?: "Contact" | "Droplet" | "Airborne";
  transfers: Transfer[];
  notes: ProgressNote[];
  dischargeSummary?: DischargeSummary;
  packageId?: string;
  claimId?: string;
}

export interface TransferInput {
  admissionId: string;
  toBedId: string;
  reason: string;
}

export interface AdmitInput {
  patientId: string;
  bedId: string;
  admittingDoctorId: string;
  admissionType: Admission["admissionType"];
  reason: string;
  provisionalDiagnosis: Diagnosis[];
  expectedDischarge: ISODate;
}
