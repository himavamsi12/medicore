import type {
  ActivityEvent,
  Admission,
  Appointment,
  AttendanceRecord,
  Bed,
  Bill,
  BloodRequest,
  BloodUnit,
  CarePackage,
  Claim,
  Department,
  Doctor,
  Drug,
  ErCase,
  HandoverNote,
  HospitalProfile,
  InventoryItem,
  LabOrder,
  MarEntry,
  Notification,
  OperationTheatre,
  Patient,
  PatientDocument,
  Payer,
  Prescription,
  PurchaseOrder,
  RadiologyOrder,
  RosterEntry,
  Staff,
  StockBatch,
  Surgery,
  Vendor,
  Vitals,
  Ward,
} from "@/types";

export type Trajectory = "improving" | "steady" | "deteriorating";

/** The whole in-memory mock database. Only /src/services may read or mutate it. */
export interface Database {
  hospital: HospitalProfile;
  departments: Department[];
  doctors: Doctor[];
  wards: Ward[];
  beds: Bed[];
  patients: Patient[];
  vitals: Vitals[];
  documents: PatientDocument[];
  appointments: Appointment[];
  admissions: Admission[];
  erCases: ErCase[];
  labOrders: LabOrder[];
  radiologyOrders: RadiologyOrder[];
  drugs: Drug[];
  stock: StockBatch[];
  prescriptions: Prescription[];
  mar: MarEntry[];
  handovers: HandoverNote[];
  theatres: OperationTheatre[];
  surgeries: Surgery[];
  bloodUnits: BloodUnit[];
  bloodRequests: BloodRequest[];
  payers: Payer[];
  packages: CarePackage[];
  bills: Bill[];
  claims: Claim[];
  vendors: Vendor[];
  inventory: InventoryItem[];
  purchaseOrders: PurchaseOrder[];
  staff: Staff[];
  roster: RosterEntry[];
  attendance: AttendanceRecord[];
  notifications: Notification[];
  activity: ActivityEvent[];
  /** Internal generator metadata, used by the mock AI to stay consistent with the chart. */
  meta: {
    profileOf: Record<string, string>; // patientId -> profile key
    trajectoryOf: Record<string, Trajectory>; // admissionId -> trajectory
    showcase: string[]; // patient ids with hand-written AI content
  };
  seq: Record<string, number>;
}

export const idOf = (prefix: string, n: number, width = 4) => `${prefix}-${String(n).padStart(width, "0")}`;
