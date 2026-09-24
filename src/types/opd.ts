import type { ISODate, ISODateTime } from "./common";
import type { Vitals } from "./patient";

export type AppointmentStatus =
  | "Scheduled"
  | "Checked in"
  | "In consultation"
  | "Completed"
  | "Cancelled"
  | "No show";

export type AppointmentType = "New" | "Follow-up" | "Review" | "Teleconsult";
export type BookingChannel = "Walk-in" | "Phone" | "Patient app" | "Referral" | "Front desk";

export interface Diagnosis {
  code: string;
  name: string;
  type: "Provisional" | "Final";
}

export interface SoapNote {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

export interface Consultation {
  chiefComplaint: string;
  soap: SoapNote;
  diagnoses: Diagnosis[];
  prescriptionId?: string;
  labOrderIds: string[];
  radiologyOrderIds: string[];
  followUpOn?: ISODate;
  advice?: string;
  completedAt?: ISODateTime;
}

export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  departmentId: string;
  date: ISODate;
  time: string; // "10:30"
  durationMin: number;
  type: AppointmentType;
  channel: BookingChannel;
  status: AppointmentStatus;
  token?: number;
  reason: string;
  checkedInAt?: ISODateTime;
  calledAt?: ISODateTime;
  vitals?: Vitals;
  consultation?: Consultation;
  createdAt: ISODateTime;
}

export interface BookAppointmentInput {
  patientId: string;
  doctorId: string;
  date: ISODate;
  time: string;
  type: AppointmentType;
  channel: BookingChannel;
  reason: string;
}

export interface Slot {
  time: string;
  available: boolean;
  appointmentId?: string;
}
