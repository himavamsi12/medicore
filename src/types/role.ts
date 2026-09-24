export const ROLES = [
  "Admin",
  "Doctor",
  "Nurse",
  "Receptionist",
  "Lab Technician",
  "Pharmacist",
  "Billing",
] as const;

export type Role = (typeof ROLES)[number];

export type Permission =
  | "patient.register"
  | "patient.viewClinical"
  | "appointment.book"
  | "consult.write"
  | "prescription.write"
  | "admission.manage"
  | "bed.transfer"
  | "discharge.write"
  | "vitals.record"
  | "mar.administer"
  | "triage.assign"
  | "lab.collect"
  | "lab.result"
  | "lab.verify"
  | "radiology.report"
  | "pharmacy.dispense"
  | "stock.manage"
  | "ot.manage"
  | "blood.issue"
  | "bill.edit"
  | "payment.collect"
  | "claim.manage"
  | "inventory.manage"
  | "po.approve"
  | "staff.manage"
  | "reports.view"
  | "settings.manage";

/** The signed-in (mock) user shown in the top bar for a given role. */
export interface SessionUser {
  id: string;
  name: string;
  role: Role;
  title: string;
  staffId?: string;
  doctorId?: string;
  wardId?: string;
}
