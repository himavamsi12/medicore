import type { ISODateTime } from "./common";
import type { Vitals } from "./patient";

/** 5-level ESI-style triage, colour-coded as used in Indian emergency departments. */
export type TriageLevel = 1 | 2 | 3 | 4 | 5;

export type ErStatus = "Waiting" | "In triage" | "Under treatment" | "Observation" | "Admitted" | "Discharged" | "Referred out";

export interface ErCase {
  id: string;
  caseNo: string;
  patientId: string;
  arrivedAt: ISODateTime;
  arrivalMode: "Ambulance (108)" | "Private ambulance" | "Walk-in" | "Referral" | "Police";
  chiefComplaint: string;
  symptoms: string[];
  triageLevel?: TriageLevel;
  triagedAt?: ISODateTime;
  triagedBy?: string;
  status: ErStatus;
  bedId?: string;
  doctorId?: string;
  vitals?: Vitals;
  mlc: boolean; // medico-legal case
  notes: string;
  disposition?: string;
}

export interface NewErCaseInput {
  patientId: string;
  arrivalMode: ErCase["arrivalMode"];
  chiefComplaint: string;
  symptoms: string[];
  mlc: boolean;
}
