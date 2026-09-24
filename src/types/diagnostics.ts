import type { INR, ISODateTime, Priority } from "./common";

export type LabCategory =
  | "Haematology"
  | "Biochemistry"
  | "Clinical Pathology"
  | "Microbiology"
  | "Serology"
  | "Immunoassay"
  | "Coagulation";

export interface LabParameter {
  code: string;
  name: string;
  unit: string;
  refLow?: number;
  refHigh?: number;
  refText?: string; // for qualitative results, e.g. "Negative"
  criticalLow?: number;
  criticalHigh?: number;
  decimals?: number;
  options?: string[]; // qualitative choices
}

export interface LabTest {
  code: string;
  name: string;
  category: LabCategory;
  sampleType: "Blood (EDTA)" | "Blood (Serum)" | "Blood (Citrate)" | "Blood (Fluoride)" | "Urine" | "Blood culture" | "Arterial blood" | "Swab";
  container: string;
  tatHours: number;
  price: INR;
  parameters: LabParameter[];
}

export type LabOrderStatus = "Ordered" | "Collected" | "Processing" | "Resulted" | "Verified" | "Rejected";
export type ResultFlag = "N" | "L" | "H" | "LL" | "HH" | "A";

export interface LabResult {
  testCode: string;
  paramCode: string;
  value: number | string;
  flag: ResultFlag;
}

export interface LabOrder {
  id: string;
  orderNo: string;
  sampleId: string; // barcode
  patientId: string;
  orderedById: string;
  orderedAt: ISODateTime;
  source: "OPD" | "IPD" | "ER";
  encounterId?: string;
  priority: Priority;
  testCodes: string[];
  status: LabOrderStatus;
  collectedAt?: ISODateTime;
  collectedBy?: string;
  processingAt?: ISODateTime;
  resultedAt?: ISODateTime;
  verifiedAt?: ISODateTime;
  verifiedBy?: string;
  results: LabResult[];
  remarks?: string;
  rejectionReason?: string;
}

export type Modality = "X-Ray" | "CT" | "MRI" | "USG" | "Mammography";
export type RadiologyStatus = "Ordered" | "Scheduled" | "Acquired" | "Reported" | "Verified";
export type StudyKind = "chest" | "brain" | "abdomen" | "knee" | "spine" | "pelvis";

export interface RadiologyReport {
  technique: string;
  findings: string;
  impression: string;
  reportedBy: string;
  reportedAt: ISODateTime;
  verified: boolean;
}

export interface RadiologyOrder {
  id: string;
  accessionNo: string;
  patientId: string;
  modality: Modality;
  study: string;
  studyKind: StudyKind;
  bodyPart: string;
  clinicalHistory: string;
  orderedById: string;
  orderedAt: ISODateTime;
  source: "OPD" | "IPD" | "ER";
  encounterId?: string;
  priority: Priority;
  status: RadiologyStatus;
  scheduledAt?: ISODateTime;
  acquiredAt?: ISODateTime;
  images: number;
  radiologistId?: string;
  report?: RadiologyReport;
}
