import type { INR, ISODate, ISODateTime } from "./common";

export type DepartmentKind = "Clinical" | "Diagnostic" | "Support";

export interface Department {
  id: string;
  code: string;
  name: string;
  kind: DepartmentKind;
  floor: string;
  extension: string;
  headDoctorId?: string;
  description: string;
  services: string[];
}

export type Weekday = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export interface OpdSession {
  day: Weekday;
  start: string; // "09:00"
  end: string; // "13:00"
  room: string;
}

export type DoctorStatus = "Available" | "In OPD" | "In surgery" | "On rounds" | "On leave" | "Off duty";

export interface Doctor {
  id: string;
  name: string; // includes "Dr." prefix
  gender: "Male" | "Female";
  departmentId: string;
  designation: "Senior Consultant" | "Consultant" | "Associate Consultant" | "HOD" | "Registrar" | "Resident";
  qualifications: string;
  registrationNo: string;
  experienceYears: number;
  languages: string[];
  consultationFee: INR;
  followUpFee: INR;
  sessions: OpdSession[];
  slotMinutes: number;
  status: DoctorStatus;
  phone: string;
  email: string;
  rating: number;
  bio: string;
  specialInterests: string[];
  joinedAt: ISODate;
}

export interface HospitalProfile {
  name: string;
  legalName: string;
  tagline: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  emergencyPhone: string;
  email: string;
  website: string;
  gstin: string;
  registrationNo: string;
  nabhNo: string;
  hfrId: string; // ABDM Health Facility Registry
  licensedBeds: number;
  established: number;
}

export interface Notification {
  id: string;
  at: ISODateTime;
  title: string;
  body: string;
  severity: "critical" | "warning" | "info" | "stable";
  module: string;
  href?: string;
  read: boolean;
  roles: string[];
}

export interface ActivityEvent {
  id: string;
  at: ISODateTime;
  actor: string;
  actorRole: string;
  verb: string;
  target: string;
  module: string;
  href?: string;
  severity?: "critical" | "warning" | "stable" | "info" | "neutral";
}
