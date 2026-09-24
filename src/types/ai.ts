import type { ISODate, ISODateTime } from "./common";
import type { TriageLevel } from "./emergency";
import type { SoapNote, Diagnosis } from "./opd";

export interface AiSource {
  label: string;
  href?: string;
}

export interface AiMeta {
  /** 0..1 */
  confidence: number;
  model: string;
  generatedAt: ISODateTime;
  latencyMs: number;
  sources: AiSource[];
}

export interface AiStream {
  meta: AiMeta;
  stream: AsyncIterable<string>;
}

export type RiskKind = "readmission" | "sepsis" | "deterioration";
export type RiskLevel = "Low" | "Moderate" | "High" | "Critical";

export interface RiskFactor {
  label: string;
  value: string;
  /** contribution in points (positive raises risk) */
  points: number;
}

export interface RiskScore {
  kind: RiskKind;
  label: string;
  score: number; // native scale (e.g. NEWS2 0-20) or probability %
  scale: string; // "NEWS2", "qSOFA + SIRS", "LACE+"
  display: string; // "7", "24%"
  level: RiskLevel;
  factors: RiskFactor[];
  recommendation: string;
  meta: AiMeta;
}

export type DrugAlertSeverity = "Contraindicated" | "Major" | "Moderate" | "Minor";

export interface DrugAlert {
  id: string;
  kind: "interaction" | "allergy" | "duplicate" | "dose" | "condition";
  severity: DrugAlertSeverity;
  title: string;
  drugs: string[];
  detail: string;
  recommendation: string;
}

export interface PrescriptionCheck {
  alerts: DrugAlert[];
  meta: AiMeta;
}

export interface ScribeResult {
  transcript: { speaker: "Doctor" | "Patient" | "Attendant"; text: string }[];
  soap: SoapNote;
  suggestedDiagnoses: Diagnosis[];
  meta: AiMeta;
}

export interface TriageSuggestion {
  level: TriageLevel;
  rationale: string[];
  redFlags: string[];
  suggestedActions: string[];
  meta: AiMeta;
}

export interface RadiologyFinding {
  id: string;
  label: string;
  description: string;
  confidence: number;
  severity: "critical" | "warning" | "neutral";
  /** bounding box as fractions of the image (0..1) */
  box: { x: number; y: number; w: number; h: number };
}

export interface RadiologyAiResult {
  findings: RadiologyFinding[];
  draftImpression: string;
  meta: AiMeta;
}

export interface LabInterpretation {
  headline: string;
  abnormalities: { parameter: string; value: string; interpretation: string; severity: "critical" | "warning" | "neutral" }[];
  trends: string[];
  suggestedFollowUp: string[];
  meta: AiMeta;
}

export interface ForecastPoint {
  date: ISODate;
  actual?: number;
  forecast?: number;
  lower?: number;
  upper?: number;
}

export interface Forecast {
  id: "bed-occupancy" | "opd-footfall" | "pharmacy-demand";
  title: string;
  unit: string;
  points: ForecastPoint[];
  summary: string;
  drivers: string[];
  meta: AiMeta;
}

export interface StockDemandForecast {
  drugId: string;
  drug: string;
  onHand: number;
  forecast14d: number;
  daysOfCover: number;
  suggestedOrder: number;
  trend: "rising" | "steady" | "falling";
}

export interface ClaimAudit {
  claimId: string;
  denialRisk: number; // 0..1
  level: RiskLevel;
  reasons: { label: string; detail: string; points: number }[];
  missingCharges: { description: string; estimated: number; evidence: string }[];
  meta: AiMeta;
}

export type CommandResultKind = "patient" | "bed" | "doctor" | "lab" | "drug" | "admission" | "appointment" | "claim" | "nav";

export interface CommandResultItem {
  id: string;
  kind: CommandResultKind;
  title: string;
  subtitle?: string;
  href: string;
  badge?: string;
  badgeTone?: "critical" | "warning" | "stable" | "info" | "neutral";
}

export interface CommandAnswer {
  query: string;
  intent: string;
  interpretation: string;
  results: CommandResultItem[];
  viewAllHref?: string;
  meta: AiMeta;
}
