import type { INR, ISODate, ISODateTime } from "./common";

export type DrugForm = "Tablet" | "Capsule" | "Syrup" | "Injection" | "Infusion" | "Inhaler" | "Ointment" | "Drops" | "Suspension" | "Sachet";
export type DrugSchedule = "OTC" | "H" | "H1" | "X" | "G";

export interface Drug {
  id: string;
  brand: string;
  generic: string;
  strength: string;
  form: DrugForm;
  drugClass: string;
  manufacturer: string;
  schedule: DrugSchedule;
  gstRate: 5 | 12 | 18;
  hsn: string;
  mrp: INR; // per unit (tab / vial / bottle)
  packSize: number;
  highAlert?: boolean;
  reorderLevel: number;
}

export interface StockBatch {
  id: string;
  drugId: string;
  batchNo: string;
  expiry: ISODate;
  qty: number;
  purchaseRate: INR;
  supplier: string;
  receivedAt: ISODate;
  location: string;
}

export type Frequency = "1-0-0" | "0-1-0" | "0-0-1" | "1-0-1" | "1-1-1" | "1-1-1-1" | "0-0-0-1" | "SOS" | "STAT" | "Q4H" | "Q6H" | "Q8H" | "Weekly";
export type Route = "Oral" | "IV" | "IM" | "SC" | "Inhalation" | "Topical" | "Sublingual" | "Nasal" | "Ophthalmic";

export interface RxItem {
  id: string;
  drugId: string;
  dose: string; // "1 tab", "500 mg"
  frequency: Frequency;
  route: Route;
  durationDays: number;
  instructions: string; // "After food"
  qty: number;
  dispensedQty: number;
}

export type RxStatus = "Pending" | "Partially dispensed" | "Dispensed" | "Cancelled";

export interface Prescription {
  id: string;
  rxNo: string;
  patientId: string;
  doctorId: string;
  source: "OPD" | "IPD" | "ER";
  encounterId?: string;
  createdAt: ISODateTime;
  diagnosis: string;
  items: RxItem[];
  status: RxStatus;
  dispensedAt?: ISODateTime;
  dispensedBy?: string;
  notes?: string;
}

export interface NewPrescriptionInput {
  patientId: string;
  doctorId: string;
  source: Prescription["source"];
  encounterId?: string;
  diagnosis: string;
  items: Omit<RxItem, "id" | "dispensedQty">[];
  notes?: string;
}

export interface DispenseLine {
  rxItemId: string;
  batchId: string;
  qty: number;
}
