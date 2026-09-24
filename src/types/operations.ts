import type { BloodGroup, INR, ISODate, ISODateTime, Priority } from "./common";

/* ---------- Operation theatre ---------- */

export interface OperationTheatre {
  id: string;
  name: string;
  kind: "Major" | "Minor" | "Cardiac" | "Ortho (laminar)" | "Obstetric";
  floor: string;
}

export type SurgeryStatus = "Scheduled" | "Pre-op" | "In progress" | "Recovery" | "Completed" | "Cancelled" | "Postponed";
export type ChecklistPhase = "Sign in" | "Time out" | "Sign out";

export interface ChecklistItem {
  id: string;
  phase: ChecklistPhase;
  label: string;
  done: boolean;
  doneBy?: string;
  doneAt?: ISODateTime;
}

export interface Surgery {
  id: string;
  caseNo: string;
  patientId: string;
  admissionId?: string;
  procedure: string;
  departmentId: string;
  otId: string;
  surgeonId: string;
  assistantIds: string[];
  anaesthetistId: string;
  scrubNurseId: string;
  anaesthesia: "GA" | "Spinal" | "Epidural" | "Regional block" | "Local" | "Sedation";
  scheduledStart: ISODateTime;
  durationMin: number;
  actualStart?: ISODateTime;
  actualEnd?: ISODateTime;
  priority: "Elective" | "Emergency";
  status: SurgeryStatus;
  checklist: ChecklistItem[];
  consentSigned: boolean;
  bloodUnitsReserved: number;
  implants?: string;
  notes?: string;
}

/* ---------- Nursing ---------- */

export type MarStatus = "Due" | "Given" | "Held" | "Missed" | "Refused";

export interface MarEntry {
  id: string;
  admissionId: string;
  patientId: string;
  drug: string;
  dose: string;
  route: string;
  scheduledAt: ISODateTime;
  status: MarStatus;
  givenAt?: ISODateTime;
  givenBy?: string;
  note?: string;
  highAlert?: boolean;
}

export type Shift = "Morning" | "Evening" | "Night";

export interface HandoverNote {
  id: string;
  wardId: string;
  date: ISODate;
  shift: Shift;
  fromStaffId: string;
  toStaffId?: string;
  patientId?: string;
  situation: string;
  background: string;
  assessment: string;
  recommendation: string;
  createdAt: ISODateTime;
  acknowledged: boolean;
}

/* ---------- Blood bank ---------- */

export type BloodComponent = "Whole blood" | "PRBC" | "FFP" | "Platelets (RDP)" | "Platelets (SDP)" | "Cryoprecipitate";
export type BloodUnitStatus = "Available" | "Reserved" | "Issued" | "Quarantine" | "Expired" | "Discarded";

export interface BloodUnit {
  id: string;
  unitNo: string;
  group: BloodGroup;
  component: BloodComponent;
  volumeMl: number;
  collectedAt: ISODate;
  expiresAt: ISODate;
  status: BloodUnitStatus;
  reservedFor?: string; // request id
  source: "Voluntary donor" | "Replacement donor" | "Camp";
}

export type BloodRequestStatus = "Pending" | "Cross-matching" | "Ready" | "Issued" | "Cancelled";

export interface BloodRequest {
  id: string;
  requestNo: string;
  patientId: string;
  group: BloodGroup;
  component: BloodComponent;
  units: number;
  priority: Priority;
  indication: string;
  requestedById: string;
  requestedAt: ISODateTime;
  requiredBy: ISODateTime;
  status: BloodRequestStatus;
  unitIds: string[];
  location: string;
}

/* ---------- Inventory & procurement ---------- */

export type InventoryCategory = "Consumables" | "Surgical" | "Implants" | "Reagents" | "Linen" | "Housekeeping" | "Equipment spares" | "Stationery";

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  category: InventoryCategory;
  unit: string;
  stock: number;
  reorderLevel: number;
  maxLevel: number;
  store: string;
  vendorId: string;
  unitCost: INR;
  gstRate: 5 | 12 | 18;
  avgDailyUsage: number;
  lastReceivedAt: ISODate;
}

export interface Vendor {
  id: string;
  name: string;
  gstin: string;
  city: string;
  contactName: string;
  phone: string;
  leadTimeDays: number;
  rating: number;
}

export type PoStatus = "Draft" | "Pending approval" | "Approved" | "Sent" | "Partially received" | "Received" | "Cancelled";

export interface PoLine {
  itemId: string;
  qty: number;
  rate: INR;
  gstRate: number;
  receivedQty: number;
}

export interface PurchaseOrder {
  id: string;
  poNo: string;
  vendorId: string;
  createdAt: ISODateTime;
  expectedAt: ISODate;
  status: PoStatus;
  lines: PoLine[];
  createdBy: string;
  approvedBy?: string;
  approvedAt?: ISODateTime;
  notes?: string;
}

export interface NewPoInput {
  vendorId: string;
  expectedAt: ISODate;
  lines: { itemId: string; qty: number; rate: INR; gstRate: number }[];
  notes?: string;
}

/* ---------- Staff & HR ---------- */

export type StaffCategory = "Doctor" | "Nurse" | "Technician" | "Pharmacist" | "Front office" | "Billing" | "Administration" | "Housekeeping" | "Security";
export type RosterShift = "M" | "E" | "N" | "G" | "Off" | "Leave";

export interface Staff {
  id: string;
  employeeId: string;
  name: string;
  gender: "Male" | "Female";
  category: StaffCategory;
  designation: string;
  departmentId: string;
  wardId?: string;
  doctorId?: string;
  phone: string;
  email: string;
  joinedAt: ISODate;
  status: "Active" | "On leave" | "Notice period";
  employment: "Permanent" | "Contract" | "Visiting";
}

export interface RosterEntry {
  staffId: string;
  date: ISODate;
  shift: RosterShift;
}

export type AttendanceStatus = "Present" | "Late" | "Absent" | "On leave" | "Half day" | "Week off";

export interface AttendanceRecord {
  id: string;
  staffId: string;
  date: ISODate;
  status: AttendanceStatus;
  checkIn?: string;
  checkOut?: string;
}
