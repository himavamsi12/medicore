import type { INR, ISODateTime } from "./common";

export type ChargeCategory =
  | "Consultation"
  | "Room"
  | "Nursing"
  | "Procedure"
  | "OT"
  | "Laboratory"
  | "Radiology"
  | "Pharmacy"
  | "Consumables"
  | "Package"
  | "Blood bank"
  | "Other";

export interface BillItem {
  id: string;
  category: ChargeCategory;
  description: string;
  code: string; // tariff code
  hsnSac: string;
  qty: number;
  rate: INR;
  discount: INR;
  gstRate: 0 | 5 | 12 | 18;
  date: ISODateTime;
}

export type PaymentMode = "Cash" | "UPI" | "Card" | "NEFT" | "Cheque" | "Insurance" | "Advance";

export interface Payment {
  id: string;
  receiptNo: string;
  mode: PaymentMode;
  amount: INR;
  reference?: string;
  at: ISODateTime;
  collectedBy: string;
}

export type BillStatus = "Draft" | "Unpaid" | "Partially paid" | "Paid" | "Insurance pending" | "Cancelled";

export interface Bill {
  id: string;
  billNo: string;
  patientId: string;
  encounterType: "OPD" | "IPD" | "ER" | "Pharmacy" | "Diagnostics";
  encounterId?: string;
  createdAt: ISODateTime;
  status: BillStatus;
  payerType: "Self" | "Insurance" | "Corporate" | "Government";
  payerId?: string;
  packageId?: string;
  claimId?: string;
  items: BillItem[];
  payments: Payment[];
  notes?: string;
}

export interface BillTotals {
  gross: INR;
  discount: INR;
  taxable: INR;
  cgst: INR;
  sgst: INR;
  gst: INR;
  net: INR;
  paid: INR;
  due: INR;
}

export type BillWithTotals = Bill & { totals: BillTotals };

export interface CarePackage {
  id: string;
  code: string;
  name: string;
  departmentId: string;
  price: INR;
  lengthOfStayDays: number;
  wardType: string;
  inclusions: string[];
  exclusions: string[];
  active: boolean;
}

export interface Payer {
  id: string;
  name: string;
  kind: "TPA" | "Insurer" | "Government" | "Corporate";
  shortName: string;
  avgSettlementDays: number;
}

export type ClaimStatus =
  | "Pre-auth requested"
  | "Pre-auth approved"
  | "Query raised"
  | "Final bill submitted"
  | "Approved"
  | "Partially approved"
  | "Settled"
  | "Rejected";

export interface ClaimEvent {
  at: ISODateTime;
  status: ClaimStatus;
  note: string;
  by: string;
}

export interface Claim {
  id: string;
  claimNo: string;
  patientId: string;
  billId?: string;
  admissionId?: string;
  insurerId: string;
  tpaId?: string;
  policyNo: string;
  type: "Cashless" | "Reimbursement";
  status: ClaimStatus;
  claimedAmount: INR;
  preAuthAmount?: INR;
  approvedAmount?: INR;
  settledAmount?: INR;
  deductions: { reason: string; amount: INR }[];
  diagnosis: string;
  submittedAt: ISODateTime;
  updatedAt: ISODateTime;
  events: ClaimEvent[];
  documents: string[];
  missingDocuments: string[];
}

export interface AddPaymentInput {
  billId: string;
  mode: PaymentMode;
  amount: INR;
  reference?: string;
}
