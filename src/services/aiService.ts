/**
 * AI service (mocked). Every AI feature in the UI goes through this file.
 *
 * Today the "model" is a set of rules plus hand-written clinical text in
 * /src/data/ai, always filled with facts from the patient's actual record.
 * To connect a real LLM, keep these signatures and replace each body with a
 * call to your inference endpoint (stream tokens into `AiStream.stream`).
 *
 * Nothing here makes clinical decisions: outputs are suggestions that the UI
 * labels as requiring clinician review.
 */
import { addDays, differenceInCalendarDays, differenceInHours, format, getDay } from "date-fns";
import type {
  AiMeta,
  AiStream,
  ClaimAudit,
  CommandAnswer,
  CommandResultItem,
  DischargeSummary,
  DrugAlert,
  DrugAlertSeverity,
  Forecast,
  ForecastPoint,
  LabInterpretation,
  PrescriptionCheck,
  RadiologyAiResult,
  RiskFactor,
  RiskLevel,
  RiskScore,
  ScribeResult,
  StockDemandForecast,
  TriageLevel,
  TriageSuggestion,
  Vitals,
} from "@/types";
import { getAnalytics } from "@/data/analytics";
import { DEFAULT_NARRATIVE, NARRATIVES } from "@/data/ai/narratives";
import { LAB_RULES } from "@/data/ai/labRules";
import { RADIOLOGY_AI, RADIOLOGY_AI_NORMAL } from "@/data/ai/radiology";
import { GENERIC_SCRIPT, SCRIBE_SCRIPTS } from "@/data/ai/scribe";
import { ALLERGY_CLASSES, CONDITION_RULES, INTERACTIONS } from "@/data/reference/interactions";
import { LAB_TEST_MAP } from "@/data/reference/labTests";
import { PROFILES } from "@/data/reference/profiles";
import { ageLabel, ageYears, fToC, news2Components } from "@/lib/clinical";
import { computeBillTotals } from "@/lib/billing-math";
import { todayLocal } from "@/lib/dates";
import { navForRole, NAV } from "@/lib/nav";
import { mock, notFound, sleep } from "./http";
import { currentMedications, db, latestVitals, onHandForDrug, patientSummary } from "./mappers";

const MODEL = "medicore-clinical-assist (mock)";

function meta(confidence: number, sources: AiMeta["sources"], latencyMs = 0): AiMeta {
  return { confidence: Math.round(confidence * 100) / 100, model: MODEL, generatedAt: new Date().toISOString(), latencyMs, sources };
}

/** Emits text in small word groups to mimic token streaming. */
async function* streamText(text: string, signal?: AbortSignal): AsyncGenerator<string> {
  const parts = text.match(/\S+\s*|\n/g) ?? [];
  for (let i = 0; i < parts.length; i += 2) {
    if (signal?.aborted) return;
    yield parts.slice(i, i + 2).join("");
    await sleep(14 + Math.random() * 26);
  }
}

const profileOf = (patientId: string) => PROFILES.find((p) => p.key === db().meta.profileOf[patientId]);

const currentMeds = (patientId: string) => currentMedications(patientId);

/** Latest value per parameter plus the previous value, for trend statements. */
function labSnapshot(patientId: string) {
  const orders = db()
    .labOrders.filter((o) => o.patientId === patientId && o.results.length)
    .sort((a, b) => (a.resultedAt ?? a.orderedAt).localeCompare(b.resultedAt ?? b.orderedAt));
  const map = new Map<string, { testCode: string; value: number | string; flag: string; at: string; prev?: number | string; prevAt?: string }>();
  for (const o of orders) {
    for (const r of o.results) {
      const prev = map.get(r.paramCode);
      map.set(r.paramCode, { testCode: r.testCode, value: r.value, flag: r.flag, at: o.resultedAt ?? o.orderedAt, prev: prev?.value, prevAt: prev?.at });
    }
  }
  return map;
}

function paramMeta(testCode: string, paramCode: string) {
  return LAB_TEST_MAP[testCode]?.parameters.find((p) => p.code === paramCode);
}

function describeLab(paramCode: string, s: { testCode: string; value: number | string; flag: string; prev?: number | string }) {
  const p = paramMeta(s.testCode, paramCode);
  if (!p) return "";
  const dir = s.flag === "H" || s.flag === "HH" ? "high" : s.flag === "L" || s.flag === "LL" ? "low" : "abnormal";
  const crit = s.flag === "HH" || s.flag === "LL" ? ", critical" : "";
  let trend = "";
  if (typeof s.value === "number" && typeof s.prev === "number" && s.prev !== s.value) {
    trend = `, ${s.value > s.prev ? "up" : "down"} from ${s.prev}`;
  }
  return `${p.name} ${s.value}${p.unit ? ` ${p.unit}` : ""} (${dir}${crit}${trend})`;
}

/* ------------------------------------------------------------------ */
/* Risk scores                                                         */
/* ------------------------------------------------------------------ */

function levelFrom(score: number, cuts: [number, number, number]): RiskLevel {
  if (score >= cuts[2]) return "Critical";
  if (score >= cuts[1]) return "High";
  if (score >= cuts[0]) return "Moderate";
  return "Low";
}

function deteriorationScore(v: Vitals): RiskScore {
  const comps = news2Components(v);
  const score = comps.reduce((s, c) => s + c.points, 0);
  const single3 = comps.some((c) => c.points === 3);
  const level: RiskLevel = score >= 7 ? "Critical" : score >= 5 ? "High" : score >= 1 && single3 ? "Moderate" : score >= 1 ? "Low" : "Low";
  const recommendation =
    score >= 7 ? "Emergency response: immediate review by the critical care outreach team, continuous monitoring, consider ICU transfer." :
    score >= 5 ? "Urgent response: medical review within 30 minutes, minimum hourly observations." :
    single3 ? "Urgent ward-based review: a single parameter scores 3. Increase observations to hourly." :
    score >= 1 ? "Ward-based response: 4 to 6 hourly observations, inform the nurse in charge." : "Continue routine 12-hourly observations.";
  return {
    kind: "deterioration",
    label: "Deterioration (NEWS2)",
    score,
    scale: "NEWS2",
    display: String(score),
    level,
    factors: comps.filter((c) => c.points > 0).map((c) => ({ label: c.label, value: c.value, points: c.points })),
    recommendation,
    meta: meta(0.9, [{ label: `Vitals at ${format(new Date(v.recordedAt), "HH:mm")}` }, { label: "Royal College of Physicians NEWS2 chart" }]),
  };
}

function sepsisScore(patientId: string, v: Vitals): RiskScore {
  const labs = labSnapshot(patientId);
  const profile = profileOf(patientId);
  const factors: RiskFactor[] = [];
  const add = (label: string, value: string, points: number) => points > 0 && factors.push({ label, value, points });
  const tempC = fToC(v.tempF);
  add("Respiratory rate at or above 22", `${v.respRate} /min`, v.respRate >= 22 ? 2 : 0);
  add("Systolic BP at or below 100", `${v.bpSystolic} mmHg`, v.bpSystolic <= 100 ? 2 : 0);
  add("Altered mentation", v.consciousness ?? "Alert", v.consciousness && v.consciousness !== "Alert" ? 2 : 0);
  add("Temperature outside 36-38.3 °C", `${tempC} °C`, tempC > 38.3 || tempC < 36 ? 1 : 0);
  add("Heart rate above 90", `${v.pulse} /min`, v.pulse > 90 ? 1 : 0);
  const tlc = labs.get("TLC");
  if (tlc && typeof tlc.value === "number") add("WBC outside 4,000-12,000", `${tlc.value.toLocaleString("en-IN")} /µL`, tlc.value > 12000 || tlc.value < 4000 ? 1 : 0);
  const lact = labs.get("LACT");
  if (lact && typeof lact.value === "number") add("Lactate above 2 mmol/L", `${lact.value} mmol/L`, lact.value > 4 ? 3 : lact.value > 2 ? 2 : 0);
  const pct = labs.get("PCT");
  if (pct && typeof pct.value === "number") add("Procalcitonin above 2 ng/mL", `${pct.value} ng/mL`, pct.value > 2 ? 2 : 0);
  const infectionProfiles = ["sepsis", "pneumonia", "dengue", "uti", "typhoid", "appendicitis", "ca-breast", "copd"];
  if (profile && infectionProfiles.includes(profile.key)) add("Suspected or confirmed infection", profile.conditions[0]?.[1] ?? "Infection", 1);
  const score = factors.reduce((s, f) => s + f.points, 0);
  const probability = Math.min(92, Math.round(3 + score * 7.5));
  const level = levelFrom(score, [3, 6, 9]);
  return {
    kind: "sepsis",
    label: "Sepsis early warning",
    score: probability,
    scale: "qSOFA + SIRS + markers",
    display: `${probability}%`,
    level,
    factors: factors.sort((a, b) => b.points - a.points),
    recommendation:
      level === "Critical" || level === "High"
        ? "Consider the sepsis bundle within 1 hour: lactate, blood cultures before antibiotics, broad-spectrum antibiotics, 30 ml/kg crystalloid if hypotensive."
        : level === "Moderate"
          ? "Reassess for a source of infection and repeat observations within 1 hour."
          : "No current sepsis signal. Continue routine monitoring.",
    meta: meta(level === "Low" ? 0.78 : 0.84, [{ label: "Latest vitals" }, { label: "Most recent CBC, lactate, procalcitonin" }, { label: "Surviving Sepsis Campaign 2021" }]),
  };
}

function readmissionScore(patientId: string): RiskScore | undefined {
  const d = db();
  const p = d.patients.find((x) => x.id === patientId)!;
  const adm = d.admissions.filter((a) => a.patientId === patientId).sort((a, b) => b.admittedAt.localeCompare(a.admittedAt))[0];
  if (!adm) return undefined;
  const los = Math.max(1, differenceInCalendarDays(adm.dischargedAt ? new Date(adm.dischargedAt) : new Date(), new Date(adm.admittedAt)));
  const L = los >= 14 ? 7 : los >= 7 ? 5 : los >= 4 ? 4 : los;
  const A = adm.admissionType === "Emergency" ? 3 : 0;
  const weights: Record<string, number> = { E11: 1, E10: 1, N18: 2, I50: 2, J44: 1, C50: 2, K70: 3, K74: 3, I63: 1, I21: 1, I25: 1, I48: 1 };
  let charlson = 0;
  for (const c of p.conditions) {
    const key = Object.keys(weights).find((k) => c.code.startsWith(k));
    if (key) charlson += weights[key];
  }
  if (ageYears(p.dob) >= 70) charlson += 1;
  const C = charlson >= 4 ? 5 : charlson;
  const erVisits = d.erCases.filter((e) => e.patientId === patientId && differenceInCalendarDays(new Date(), new Date(e.arrivedAt)) <= 180).length;
  const priorAdm = d.admissions.filter((a) => a.patientId === patientId && a.id !== adm.id && differenceInCalendarDays(new Date(adm.admittedAt), new Date(a.admittedAt)) <= 365).length;
  const E = Math.min(4, erVisits + priorAdm);
  const score = L + A + C + E;
  const probability = Math.min(48, Math.round(4 + score * 2.3));
  const level = levelFrom(score, [5, 10, 14]);
  return {
    kind: "readmission",
    label: "30-day readmission",
    score: probability,
    scale: "LACE index",
    display: `${probability}%`,
    level,
    factors: [
      { label: "Length of stay", value: `${los} day${los > 1 ? "s" : ""}`, points: L },
      { label: "Acuity of admission", value: adm.admissionType, points: A },
      { label: "Comorbidity burden (Charlson)", value: p.conditions.filter((c) => c.chronic).map((c) => c.name).slice(0, 3).join(", ") || "None recorded", points: C },
      { label: "ED visits and admissions (6-12 months)", value: `${erVisits} ED, ${priorAdm} prior admission${priorAdm === 1 ? "" : "s"}`, points: E },
    ].filter((f) => f.points > 0),
    recommendation:
      level === "High" || level === "Critical"
        ? "Schedule a follow-up within 7 days of discharge, reconcile medications, arrange a nurse phone call at 48 hours and home-care referral."
        : level === "Moderate"
          ? "Book follow-up within 14 days and provide written discharge instructions."
          : "Standard discharge follow-up.",
    meta: meta(0.76, [{ label: `Admission ${adm.ipNo}` }, { label: "LACE index (van Walraven, 2010)" }]),
  };
}

/* ------------------------------------------------------------------ */
/* Prescription safety                                                 */
/* ------------------------------------------------------------------ */

const SEVERITY_ORDER: DrugAlertSeverity[] = ["Contraindicated", "Major", "Moderate", "Minor"];

function checkRx(patientId: string, drugIds: string[]): DrugAlert[] {
  const d = db();
  const p = d.patients.find((x) => x.id === patientId) ?? notFound("Patient", patientId);
  const proposed = drugIds.map((id) => d.drugs.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => Boolean(x));
  const current = currentMeds(patientId).filter((m) => !drugIds.includes(m.drugId)).map((m) => ({ ...d.drugs.find((x) => x.id === m.drugId)!, current: true }));
  const pool = [...proposed.map((x) => ({ ...x, current: false })), ...current];
  const alerts: DrugAlert[] = [];
  let n = 0;
  const label = (x: { brand: string; current: boolean }) => (x.current ? `${x.brand} (current)` : x.brand);
  const g = (x: { generic: string }) => x.generic.toLowerCase();

  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i];
      const b = pool[j];
      if (a.current && b.current) continue;
      for (const rule of INTERACTIONS) {
        const hit = (g(a).includes(rule.a) && g(b).includes(rule.b)) || (g(a).includes(rule.b) && g(b).includes(rule.a));
        if (hit) alerts.push({ id: `A${n++}`, kind: "interaction", severity: rule.severity, title: rule.title, drugs: [label(a), label(b)], detail: rule.detail, recommendation: rule.recommendation });
      }
      if (g(a) === g(b)) alerts.push({ id: `A${n++}`, kind: "duplicate", severity: "Major", title: "Duplicate drug", drugs: [label(a), label(b)], detail: `Both contain ${a.generic}.`, recommendation: "Remove one of the two entries." });
      else if (a.drugClass === b.drugClass && ["Proton pump inhibitor", "NSAID", "Statin", "Beta blocker", "ARB", "ACE inhibitor", "Anticoagulant"].includes(a.drugClass))
        alerts.push({ id: `A${n++}`, kind: "duplicate", severity: "Moderate", title: `Therapeutic duplication (${a.drugClass})`, drugs: [label(a), label(b)], detail: `Two agents from the same class are prescribed together.`, recommendation: "Confirm this is intended; usually one agent is sufficient." });
    }
  }

  for (const allergy of p.allergies.filter((x) => x.category === "Drug")) {
    const cls = ALLERGY_CLASSES[allergy.substance];
    if (!cls) continue;
    for (const drug of proposed) {
      if (cls.match.some((m) => g(drug).includes(m))) {
        alerts.push({
          id: `A${n++}`,
          kind: "allergy",
          severity: allergy.severity === "Severe" ? "Contraindicated" : "Major",
          title: `Documented ${allergy.substance} allergy`,
          drugs: [drug.brand],
          detail: `Patient reaction: ${allergy.reaction} (${allergy.severity.toLowerCase()}).${cls.crossNote ? ` ${cls.crossNote}` : ""}`,
          recommendation: "Choose an agent from a different class, or document the rationale and monitor if no alternative exists.",
        });
      }
    }
  }

  const codes = p.conditions.map((c) => c.code);
  if (p.flags.includes("Pregnant")) codes.push("Z34");
  for (const rule of CONDITION_RULES) {
    if (!codes.some((c) => c.startsWith(rule.icdPrefix))) continue;
    for (const drug of proposed) {
      if (rule.match.some((m) => g(drug).includes(m)) && !alerts.some((x) => x.kind === "condition" && x.drugs[0] === drug.brand && x.title === rule.title)) {
        alerts.push({ id: `A${n++}`, kind: "condition", severity: rule.severity, title: rule.title, drugs: [drug.brand], detail: `Patient has ${p.conditions.find((c) => c.code.startsWith(rule.icdPrefix))?.name ?? (rule.icdPrefix === "Z34" ? "an ongoing pregnancy" : rule.icdPrefix)}.`, recommendation: rule.recommendation });
      }
    }
  }

  const egfr = labSnapshot(patientId).get("EGFR");
  if (egfr && typeof egfr.value === "number" && egfr.value < 30) {
    for (const drug of proposed.filter((x) => ["metformin", "nitrofurantoin", "enoxaparin", "gentamicin"].some((m) => g(x).includes(m)))) {
      alerts.push({ id: `A${n++}`, kind: "dose", severity: "Major", title: "Renal dose adjustment needed", drugs: [drug.brand], detail: `Latest eGFR is ${egfr.value} mL/min/1.73m².`, recommendation: "Adjust dose or interval for renal function, or choose an alternative." });
    }
  }
  for (const drug of proposed.filter((x) => x.highAlert)) {
    alerts.push({ id: `A${n++}`, kind: "dose", severity: "Minor", title: "High-alert medication", drugs: [drug.brand], detail: "ISMP high-alert medicine. Errors carry a high risk of harm.", recommendation: "Independent double-check of dose and route before administration." });
  }

  return alerts.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
}

/* ------------------------------------------------------------------ */
/* Triage                                                              */
/* ------------------------------------------------------------------ */

function triageRules(input: { age: number; complaint: string; symptoms: string[]; vitals?: Partial<Vitals> }): TriageSuggestion {
  const text = `${input.complaint} ${input.symptoms.join(" ")}`.toLowerCase();
  const v = input.vitals ?? {};
  const has = (...words: string[]) => words.some((w) => text.includes(w));
  const rationale: string[] = [];
  const redFlags: string[] = [];
  let level: TriageLevel = 5;
  const bump = (to: TriageLevel, why: string, flag = false) => {
    if (to < level) level = to;
    rationale.push(why);
    if (flag) redFlags.push(why);
  };

  if (v.spo2 !== undefined && v.spo2 < 85) bump(1, `SpO₂ ${v.spo2}%: severe hypoxia`, true);
  if (v.bpSystolic !== undefined && v.bpSystolic < 80) bump(1, `Systolic BP ${v.bpSystolic} mmHg: shock`, true);
  if (v.gcs !== undefined && v.gcs <= 8) bump(1, `GCS ${v.gcs}: unable to protect airway`, true);
  if (v.pulse !== undefined && (v.pulse > 150 || v.pulse < 40)) bump(1, `Heart rate ${v.pulse}/min`, true);
  if (has("unresponsive", "cardiac arrest", "not breathing")) bump(1, "Unresponsive or arrest reported", true);

  if (has("chest pain", "crushing", "radiating") && input.age >= 30) bump(2, "Chest pain in an adult: possible acute coronary syndrome", true);
  if (has("weakness", "slurred", "facial droop", "hemiparesis")) bump(2, "Focal neurological deficit: possible stroke, time-critical", true);
  if (has("seizure", "convulsion")) bump(2, "Seizure", true);
  if (has("pesticide", "poison", "overdose", "consumed")) bump(2, "Poisoning or overdose", true);
  if (has("head injury") && has("deformity", "vomiting", "unconscious")) bump(2, "Head injury with high-risk features", true);
  if (has("grbs 5", "grbs 4", "hypoglyc", "sweating") && (v.grbs ?? 100) < 70) bump(2, `Hypoglycaemia (GRBS ${v.grbs ?? "low"})`, true);
  if (v.spo2 !== undefined && v.spo2 < 92) bump(2, `SpO₂ ${v.spo2}%`, true);
  if (v.bpSystolic !== undefined && v.bpSystolic < 90) bump(2, `Systolic BP ${v.bpSystolic} mmHg`, true);
  if (v.respRate !== undefined && v.respRate > 28) bump(2, `Respiratory rate ${v.respRate}/min`, true);
  if (v.pulse !== undefined && v.pulse > 130) bump(2, `Heart rate ${v.pulse}/min`, true);
  if (has("unable to speak", "full sentences")) bump(2, "Unable to complete sentences: severe respiratory distress", true);

  if (has("fever") && ((v.pulse ?? 0) > 100 || (v.tempF ?? 0) > 101)) bump(3, "Fever with tachycardia or high temperature");
  if (has("abdominal pain", "flank pain")) bump(3, "Abdominal pain needing labs and imaging");
  if (has("vomiting") && has("abdominal", "fever", "diarrhoea")) bump(3, "Vomiting with risk of dehydration");
  if (has("wheeze", "breathless")) bump(3, "Breathlessness or wheeze");
  if (has("deformity", "fracture")) bump(3, "Suspected fracture");
  if (has("syncope", "fainting")) bump(3, "Syncope needs ECG and monitoring");
  if ((v.painScore ?? 0) >= 7) bump(3, `Severe pain (${v.painScore}/10)`);

  if (level === 5 && has("bite", "laceration", "cut", "burning", "dysuria", "vertigo", "headache", "back pain", "rash")) bump(4, "Stable, likely one resource (e.g. dressing, urine test, single medication)");
  if (rationale.length === 0) rationale.push("Stable vital signs with no red-flag features identified");

  const actions: Record<TriageLevel, string[]> = {
    1: ["Move to resuscitation bay now", "Activate code team", "Continuous monitoring, IV access x2, airway assessment"],
    2: ["Place in monitored bed within 10 minutes", "ECG within 10 minutes if chest pain", "IV access, bloods (CBC, RFT, glucose), senior ER review"],
    3: ["Assess within 30 minutes", "Baseline labs and imaging as indicated", "Analgesia and antiemetic as per protocol"],
    4: ["Fast-track area", "Single investigation or procedure"],
    5: ["Fast-track or OPD referral", "Reassess if symptoms change"],
  };
  const confidence = Math.min(0.94, 0.62 + (input.vitals ? 0.18 : 0) + Math.min(0.14, rationale.length * 0.03));
  return { level, rationale, redFlags, suggestedActions: actions[level], meta: meta(confidence, [{ label: "Chief complaint and symptoms" }, { label: input.vitals ? "Triage vitals" : "No vitals yet" }, { label: "Emergency Severity Index v4" }]) };
}

/* ------------------------------------------------------------------ */
/* Billing intelligence                                                */
/* ------------------------------------------------------------------ */

const RAD_TARIFF: Record<string, number> = { "X-Ray": 450, USG: 1600, CT: 4200, MRI: 8500, Mammography: 2200 };

function missingCharges(billId: string): ClaimAudit["missingCharges"] {
  const d = db();
  const bill = d.bills.find((b) => b.id === billId);
  if (!bill?.encounterId) return [];
  const codes = new Set(bill.items.map((i) => i.code));
  const counts = new Map<string, number>();
  for (const i of bill.items) counts.set(i.code, (counts.get(i.code) ?? 0) + 1);
  const out: ClaimAudit["missingCharges"] = [];
  const labOrders = d.labOrders.filter((o) => o.encounterId === bill.encounterId && o.status !== "Rejected" && o.status !== "Ordered");
  const need = new Map<string, number>();
  for (const o of labOrders) for (const c of o.testCodes) need.set(`LAB-${c}`, (need.get(`LAB-${c}`) ?? 0) + 1);
  for (const [code, n] of need) {
    const have = counts.get(code) ?? 0;
    if (have < n && !bill.packageId) {
      const test = LAB_TEST_MAP[code.replace("LAB-", "")];
      out.push({ description: `${test?.name ?? code} x ${n - have}`, estimated: (test?.price ?? 0) * (n - have), evidence: `${n} sample${n > 1 ? "s" : ""} processed in the lab, ${have} billed` });
    }
  }
  for (const r of d.radiologyOrders.filter((o) => o.encounterId === bill.encounterId && ["Acquired", "Reported", "Verified"].includes(o.status))) {
    if (!bill.items.some((i) => i.category === "Radiology" && i.description === r.study)) out.push({ description: r.study, estimated: RAD_TARIFF[r.modality] ?? 0, evidence: `Accession ${r.accessionNo} acquired, not on bill` });
  }
  const adm = d.admissions.find((a) => a.id === bill.encounterId);
  if (adm) {
    const ward = d.wards.find((w) => w.id === adm.wardId);
    if (ward && ["ICU", "HDU", "NICU"].includes(ward.type) && !codes.has("MON") && !bill.packageId) out.push({ description: "Multipara monitoring charges", estimated: 1500 * Math.max(1, differenceInCalendarDays(new Date(), new Date(adm.admittedAt))), evidence: `${ward.name} stay without monitoring line item` });
    if (!codes.has("CNS") && !bill.packageId) out.push({ description: "Medical consumables", estimated: 1200 * Math.max(1, differenceInCalendarDays(new Date(), new Date(adm.admittedAt))), evidence: "No consumables billed for an inpatient stay" });
    const surgery = d.surgeries.find((s) => s.admissionId === adm.id && s.implants && ["Completed", "Recovery"].includes(s.status));
    if (surgery && !codes.has("IMP") && !bill.packageId) out.push({ description: `Implant: ${surgery.implants}`, estimated: 16800, evidence: `${surgery.caseNo} records implant use` });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export const aiService = {
  /** One-click summary of a patient's record. Streams markdown-lite text. */
  async streamPatientSummary(patientId: string, signal?: AbortSignal): Promise<AiStream> {
    const started = Date.now();
    await sleep(900 + Math.random() * 700);
    const d = db();
    const p = d.patients.find((x) => x.id === patientId) ?? notFound("Patient", patientId);
    const profile = profileOf(patientId);
    const narrative = (profile && NARRATIVES[profile.key]) || DEFAULT_NARRATIVE;
    const adm = d.admissions.find((a) => a.patientId === patientId && !a.dischargedAt);
    const pastAdm = d.admissions.filter((a) => a.patientId === patientId && a.dischargedAt);
    const v = latestVitals(patientId);
    const labs = labSnapshot(patientId);
    const abnormal = [...labs.entries()].filter(([, s]) => s.flag !== "N").sort((a, b) => (["HH", "LL"].includes(b[1].flag) ? 1 : 0) - (["HH", "LL"].includes(a[1].flag) ? 1 : 0)).slice(0, 6);
    const imaging = d.radiologyOrders.filter((r) => r.patientId === patientId && r.report).sort((a, b) => b.orderedAt.localeCompare(a.orderedAt))[0];
    const meds = currentMeds(patientId);
    const visits = d.appointments.filter((a) => a.patientId === patientId && a.status === "Completed").length;

    const lines: string[] = [];
    const who = `${ageLabel(p.dob).replace(" y", "-year-old")} ${p.gender.toLowerCase()}`;
    const chronic = p.conditions.filter((c) => c.chronic).map((c) => c.name.toLowerCase());
    lines.push("## Snapshot");
    lines.push(
      `${who}${chronic.length ? ` with ${chronic.join(", ")}` : ""}. ` +
        (adm
          ? `Currently admitted (${adm.ipNo}, day ${Math.max(1, differenceInCalendarDays(new Date(), new Date(adm.admittedAt)) + 1)}) under ${d.doctors.find((x) => x.id === adm.admittingDoctorId)?.name} for ${adm.reason.toLowerCase()}. Acuity: ${adm.acuity.toLowerCase()}.`
          : `${visits} completed OPD visit${visits === 1 ? "" : "s"} on record${pastAdm.length ? ` and ${pastAdm.length} previous admission${pastAdm.length === 1 ? "" : "s"}` : ""}.`),
    );
    lines.push("");
    lines.push("## Active problems");
    for (const c of p.conditions) lines.push(`- ${c.name} (${c.code})${c.chronic ? ", chronic" : ""}`);
    if (!p.conditions.length) lines.push("- No active problems recorded");
    lines.push("");
    lines.push("## Course");
    lines.push(narrative.course);
    lines.push("");
    lines.push("## Key findings");
    if (v) {
      const comps = news2Components(v);
      const score = comps.reduce((s, c) => s + c.points, 0);
      lines.push(`- Latest vitals (${format(new Date(v.recordedAt), "d MMM HH:mm")}): BP ${v.bpSystolic}/${v.bpDiastolic}, HR ${v.pulse}, RR ${v.respRate}, SpO₂ ${v.spo2}%${v.onOxygen ? " on O₂" : ""}, temp ${v.tempF} °F. NEWS2 ${score}.`);
    }
    for (const [code, s] of abnormal) lines.push(`- ${describeLab(code, s)}`);
    if (!abnormal.length && labs.size) lines.push("- Recent laboratory values within reference ranges");
    if (imaging?.report) lines.push(`- ${imaging.study}: ${imaging.report.impression}`);
    lines.push("");
    lines.push("## Current medications");
    if (meds.length) for (const m of meds.slice(0, 8)) lines.push(`- ${m.brand} (${m.generic}) ${m.dose}, ${m.frequency}`);
    else lines.push("- No active prescriptions");
    lines.push("");
    lines.push("## Allergies");
    if (p.allergies.length) for (const a of p.allergies) lines.push(`- ${a.substance}: ${a.reaction} (${a.severity.toLowerCase()})`);
    else lines.push("- No known allergies");
    lines.push("");
    lines.push("## Watch-outs");
    for (const w of narrative.watchOuts) lines.push(`- ${w}`);
    lines.push("");
    lines.push("## Possible care gaps");
    for (const g of narrative.careGaps) lines.push(`- ${g}`);

    const sources = [
      { label: `${p.conditions.length} problem list entries` },
      { label: `${labs.size} lab parameters`, href: `/patients/${p.id}?tab=labs` },
      { label: v ? "Latest vitals" : "No vitals on record", href: `/patients/${p.id}?tab=vitals` },
      ...(imaging ? [{ label: imaging.study, href: `/radiology/${imaging.id}` }] : []),
      ...(adm ? [{ label: `Admission ${adm.ipNo}`, href: `/ipd/admissions/${adm.id}` }] : []),
    ];
    const confidence = Math.min(0.94, 0.7 + (labs.size > 6 ? 0.1 : 0.04) + (v ? 0.06 : 0) + (p.conditions.length ? 0.05 : 0));
    return { meta: meta(confidence, sources, Date.now() - started), stream: streamText(lines.join("\n"), signal) };
  },

  interpretLabs(orderId: string): Promise<LabInterpretation> {
    return mock(
      () => {
        const d = db();
        const o = d.labOrders.find((x) => x.id === orderId) ?? notFound("Lab order", orderId);
        const abnormalities: LabInterpretation["abnormalities"] = [];
        const followUp = new Set<string>();
        const trends: string[] = [];
        for (const r of o.results) {
          if (r.flag === "N") continue;
          const p = paramMeta(r.testCode, r.paramCode);
          const rule = LAB_RULES[r.paramCode];
          const dir = r.flag === "H" || r.flag === "HH" ? "high" : r.flag === "L" || r.flag === "LL" ? "low" : "abnormal";
          const text = rule?.[dir] ?? rule?.abnormal ?? `${p?.name ?? r.paramCode} is outside the reference range.`;
          abnormalities.push({ parameter: p?.name ?? r.paramCode, value: `${r.value}${p?.unit ? ` ${p.unit}` : ""}`, interpretation: text, severity: r.flag === "HH" || r.flag === "LL" ? "critical" : "warning" });
          rule?.followUp?.forEach((f) => followUp.add(f));
        }
        // Trends against the previous result of the same parameter
        const prior = d.labOrders
          .filter((x) => x.patientId === o.patientId && x.id !== o.id && x.results.length && (x.resultedAt ?? "") < (o.resultedAt ?? o.orderedAt))
          .sort((a, b) => (b.resultedAt ?? "").localeCompare(a.resultedAt ?? ""));
        for (const r of o.results) {
          if (typeof r.value !== "number") continue;
          const prev = prior.flatMap((x) => x.results.filter((y) => y.paramCode === r.paramCode).map((y) => ({ v: y.value, at: x.resultedAt! })))[0];
          if (!prev || typeof prev.v !== "number") continue;
          const change = ((r.value - prev.v) / Math.max(0.0001, Math.abs(prev.v))) * 100;
          if (Math.abs(change) < 12) continue;
          const p = paramMeta(r.testCode, r.paramCode);
          const hours = Math.max(1, differenceInHours(new Date(o.resultedAt ?? o.orderedAt), new Date(prev.at)));
          trends.push(`${p?.name} ${change > 0 ? "rose" : "fell"} ${Math.abs(Math.round(change))}% (${prev.v} to ${r.value}${p?.unit ? ` ${p.unit}` : ""}) over ${hours < 48 ? `${hours} hours` : `${Math.round(hours / 24)} days`}.`);
        }
        const profile = profileOf(o.patientId);
        if (profile?.key === "dengue") followUp.add("Haematocrit with every CBC; watch for a rise above 20% from baseline");
        if (profile?.key === "sepsis") followUp.add("Blood culture sensitivity review for antibiotic de-escalation");
        if (profile?.key === "ckd") followUp.add("Pre-dialysis potassium and bicarbonate");
        const crit = abnormalities.filter((a) => a.severity === "critical").length;
        return {
          headline: crit
            ? `${crit} critical value${crit > 1 ? "s" : ""} need immediate clinician attention.`
            : abnormalities.length
              ? `${abnormalities.length} abnormal value${abnormalities.length > 1 ? "s" : ""}; no critical values.`
              : "All reported values are within reference ranges.",
          abnormalities,
          trends,
          suggestedFollowUp: [...followUp].slice(0, 6),
          meta: meta(abnormalities.length ? 0.86 : 0.93, [{ label: `Order ${o.orderNo}` }, { label: `${prior.length} previous result sets` }, { label: "Laboratory reference ranges (adult)" }]),
        };
      },
      { min: 1100, max: 1900 },
    );
  },

  getRiskScores(patientId: string): Promise<RiskScore[]> {
    return mock(
      () => {
        const v = latestVitals(patientId);
        const out: RiskScore[] = [];
        if (v) {
          out.push(deteriorationScore(v));
          out.push(sepsisScore(patientId, v));
        }
        const r = readmissionScore(patientId);
        if (r) out.push(r);
        return out;
      },
      { min: 500, max: 1000 },
    );
  },

  checkPrescription(patientId: string, drugIds: string[]): Promise<PrescriptionCheck> {
    return mock(
      () => {
        const alerts = checkRx(patientId, drugIds);
        return { alerts, meta: meta(alerts.length ? 0.9 : 0.95, [{ label: "Allergy list" }, { label: "Active medications" }, { label: "Problem list and latest eGFR" }, { label: "Interaction knowledge base" }]) };
      },
      { min: 350, max: 700 },
    );
  },

  scribeConsultation(appointmentId: string): Promise<ScribeResult> {
    return mock(
      () => {
        const d = db();
        const a = d.appointments.find((x) => x.id === appointmentId) ?? notFound("Appointment", appointmentId);
        const p = d.patients.find((x) => x.id === a.patientId)!;
        const profile = profileOf(a.patientId);
        const transcript = (profile && SCRIBE_SCRIPTS[profile.key]) || GENERIC_SCRIPT(a.reason);
        const v = a.vitals ?? latestVitals(a.patientId);
        const vit = v ? `BP ${v.bpSystolic}/${v.bpDiastolic} mmHg, pulse ${v.pulse}/min, RR ${v.respRate}/min, SpO₂ ${v.spo2}%, temp ${v.tempF} °F.` : "Vitals not recorded.";
        const soapBy: Record<string, ScribeResult["soap"]> = {
          "t2dm-htn": {
            subjective: "Known T2DM and hypertension. Home fasting glucose 160-180 mg/dL, post-prandial above 250 mg/dL. Misses evening Glycomet GP dose 3-4 days a week. Bilateral burning paraesthesia of feet at night for 2 months. Evening fatigue. No chest pain, dyspnoea or pedal oedema. Adherent to telmisartan.",
            objective: `${vit} Reduced monofilament sensation over both soles.`,
            assessment: "1. Type 2 diabetes mellitus, suboptimally controlled, with probable peripheral neuropathy. 2. Hypertension, above target. 3. Medication non-adherence (evening dose).",
            plan: "HbA1c, fasting glucose, RFT with eGFR, urine albumin-creatinine ratio, lipid profile. Consider adding SGLT2 inhibitor (empagliflozin 10 mg OD) if eGFR allows. Adherence counselling with pill organiser. Foot care education; refer for retinal examination. Review in 4 weeks with reports.",
          },
          hf: {
            subjective: "Known HFrEF with AF on warfarin. Two-pillow orthopnoea, one episode of PND last week. Weight gain 3 kg in 10 days with ankle oedema. Took OTC analgesics (likely NSAID) for knee pain last week.",
            objective: `${vit} Irregularly irregular pulse, raised JVP, bibasal crepitations, bilateral pitting oedema.`,
            assessment: "1. Acute on chronic heart failure (congestion), likely precipitated by NSAID use. 2. AF on warfarin: INR at risk of excursion. 3. Aspirin allergy (bronchospasm) documented.",
            plan: "Increase furosemide to 40 mg BD for 5 days, daily weights. INR, RFT, electrolytes today. Stop all OTC analgesics; paracetamol only. Consider SGLT2 inhibitor. Return precautions explained. Review in 1 week or earlier if breathlessness worsens.",
          },
          pregnancy: {
            subjective: "G2P1 at 34 weeks. Good fetal movements. No headache, visual disturbance or facial oedema. Mild dependent pedal oedema. Intermittent adherence to iron due to constipation.",
            objective: `${vit} Fundal height corresponds to 34 weeks, cephalic, FHR 142/min regular.`,
            assessment: "1. Intrauterine pregnancy, 34 weeks, progressing normally. 2. Anaemia of pregnancy on oral iron, adherence issue.",
            plan: "CBC, urine routine today. Growth scan next week. Continue ferrous ascorbate after lunch with dietary fibre; calcium at night. Fetal movement counting. Warning signs of pre-eclampsia explained. Review in 2 weeks.",
          },
        };
        const soap = (profile && soapBy[profile.key]) || {
          subjective: `${a.reason}. Symptoms for 4-5 days, gradually worsening. Intermittent low-grade fever. Took paracetamol once. No known drug allergies reported${p.allergies.length ? ` (chart lists: ${p.allergies.map((x) => x.substance).join(", ")})` : ""}.`,
          objective: vit,
          assessment: profile?.conditions.map(([, n]) => n).join("; ") || "Acute illness, likely viral. Rule out bacterial infection.",
          plan: `${profile?.labPanel.length ? `Investigations: ${profile.labPanel.slice(0, 3).join(", ")}. ` : ""}Symptomatic treatment, hydration, review with reports in 3 days or earlier if worse.`,
        };
        return {
          transcript,
          soap,
          suggestedDiagnoses: (profile?.conditions ?? []).slice(0, 3).map(([code, name]) => ({ code, name, type: "Provisional" as const })),
          meta: meta(profile && soapBy[profile.key] ? 0.88 : 0.74, [{ label: `Audio transcript, ${transcript.length} turns` }, { label: "Triage vitals" }, { label: "Problem list" }]),
        };
      },
      { min: 1600, max: 2400 },
    );
  },

  suggestTriage(input: { age: number; complaint: string; symptoms: string[]; vitals?: Partial<Vitals> }): Promise<TriageSuggestion> {
    return mock(() => triageRules(input), { min: 700, max: 1200 });
  },

  getRadiologyFindings(orderId: string): Promise<RadiologyAiResult> {
    return mock(
      () => {
        const o = db().radiologyOrders.find((x) => x.id === orderId) ?? notFound("Radiology order", orderId);
        const key = `${db().meta.profileOf[o.patientId]}|${o.studyKind}`;
        const tpl = RADIOLOGY_AI[key] ?? RADIOLOGY_AI_NORMAL;
        const findings = tpl.findings.map((f, i) => ({ ...f, id: `F${i + 1}` }));
        const conf = findings.length ? findings.reduce((s, f) => s + f.confidence, 0) / findings.length : 0.82;
        return { findings, draftImpression: tpl.impression, meta: meta(conf, [{ label: `${o.modality}: ${o.study}` }, { label: `${o.images} image${o.images > 1 ? "s" : ""}` }, { label: "Clinical history on requisition" }]) };
      },
      { min: 1300, max: 2100 },
    );
  },

  getForecasts(): Promise<Forecast[]> {
    return mock(
      () => {
        const daily = getAnalytics().daily;
        const d = db();
        const last28 = daily.slice(-28);
        const trendFactor = (key: (x: (typeof daily)[number]) => number) => {
          const a = daily.slice(-28, -14).reduce((s, x) => s + key(x), 0);
          const b = daily.slice(-14).reduce((s, x) => s + key(x), 0);
          return a ? Math.min(1.08, Math.max(0.94, b / a)) : 1;
        };
        const byDow = (key: (x: (typeof daily)[number]) => number) => {
          const m = new Map<number, number[]>();
          for (const x of last28) {
            const dow = getDay(new Date(`${x.date}T00:00:00`));
            m.set(dow, [...(m.get(dow) ?? []), key(x)]);
          }
          return (dow: number) => {
            const arr = m.get(dow) ?? [0];
            return arr.reduce((s, v) => s + v, 0) / arr.length;
          };
        };
        const series = (key: (x: (typeof daily)[number]) => number, days: number, band: number, cap?: number): ForecastPoint[] => {
          const avg = byDow(key);
          const tf = trendFactor(key);
          const hist: ForecastPoint[] = daily.slice(-30).map((x) => ({ date: x.date, actual: Math.round(key(x) * 10) / 10 }));
          const fut: ForecastPoint[] = Array.from({ length: days }, (_, i) => {
            const date = addDays(new Date(), i + 1);
            const f = avg(getDay(date)) * (1 + (tf - 1) * ((i + 1) / days));
            const val = cap ? Math.min(cap, f) : f;
            return { date: format(date, "yyyy-MM-dd"), forecast: Math.round(val * 10) / 10, lower: Math.round(val * (1 - band) * 10) / 10, upper: Math.round((cap ? Math.min(cap, val * (1 + band)) : val * (1 + band)) * 10) / 10 };
          });
          hist[hist.length - 1] = { ...hist[hist.length - 1], forecast: hist[hist.length - 1].actual };
          return [...hist, ...fut];
        };
        const electives = d.surgeries.filter((s) => s.status === "Scheduled" && differenceInCalendarDays(new Date(s.scheduledStart), new Date()) <= 7).length;
        const planned = d.admissions.filter((a) => a.status === "Discharge planned").length;
        const occ = series((x) => x.occupancyPct, 14, 0.06, 99);
        const peak = occ.filter((p) => p.forecast !== undefined && !p.actual).sort((a, b) => (b.forecast ?? 0) - (a.forecast ?? 0))[0];
        const opd = series((x) => x.opdFootfall, 14, 0.09);
        const nextMonday = opd.find((p) => !p.actual && getDay(new Date(`${p.date}T00:00:00`)) === 1);
        return [
          {
            id: "bed-occupancy",
            title: "Bed occupancy, next 14 days",
            unit: "%",
            points: occ,
            summary: `Occupancy is expected to peak near ${peak?.forecast ?? "-"}% on ${peak ? format(new Date(`${peak.date}T00:00:00`), "EEE d MMM") : "-"}. ${planned} planned discharges and ${electives} scheduled electives in the next 7 days are included.`,
            drivers: ["Weekday elective surgery pattern", `${electives} elective cases booked in the next 7 days`, `${planned} discharges already planned`, "Seasonal fever admissions (monsoon)"],
            meta: meta(0.79, [{ label: "180 days of census history" }, { label: "OT schedule" }, { label: "Discharge plans" }]),
          },
          {
            id: "opd-footfall",
            title: "OPD footfall, next 14 days",
            unit: "patients",
            points: opd,
            summary: `Mondays remain the busiest OPD day${nextMonday ? `, with about ${Math.round(nextMonday.forecast ?? 0)} patients expected on ${format(new Date(`${nextMonday.date}T00:00:00`), "d MMM")}` : ""}. Consider opening an additional General Medicine session.`,
            drivers: ["Day-of-week seasonality", "Recent 2-week trend", "Fever season uplift in General Medicine and Paediatrics"],
            meta: meta(0.83, [{ label: "OPD registrations, last 28 days" }]),
          },
        ];
      },
      { min: 900, max: 1500 },
    );
  },

  getStockForecast(): Promise<StockDemandForecast[]> {
    return mock(
      () => {
        const d = db();
        const since = Date.now() - 14 * 86400000;
        const used = new Map<string, number>();
        for (const rx of d.prescriptions) {
          if (!rx.dispensedAt || new Date(rx.dispensedAt).getTime() < since) continue;
          for (const it of rx.items) used.set(it.drugId, (used.get(it.drugId) ?? 0) + it.dispensedQty);
        }
        const monsoonDrugs = ["Paracetamol", "Oral rehydration salts", "Sodium chloride", "Ondansetron", "Ceftriaxone", "Doxycycline"];
        return d.drugs
          .map((drug) => {
            const dailyUse = (used.get(drug.id) ?? 0) / 14 + drug.reorderLevel / 60;
            const seasonal = monsoonDrugs.some((m) => drug.generic.includes(m)) ? 1.25 : 1;
            const forecast14d = Math.round(dailyUse * 14 * seasonal);
            const onHand = onHandForDrug(drug.id);
            const daysOfCover = dailyUse > 0 ? Math.round((onHand / (dailyUse * seasonal)) * 10) / 10 : 999;
            return {
              drugId: drug.id,
              drug: `${drug.brand} ${drug.strength}`,
              onHand,
              forecast14d,
              daysOfCover,
              suggestedOrder: Math.max(0, Math.round(forecast14d * 1.5 - onHand)),
              trend: (seasonal > 1 ? "rising" : dailyUse > drug.reorderLevel / 30 ? "steady" : "falling") as StockDemandForecast["trend"],
            };
          })
          .filter((r) => r.suggestedOrder > 0 || r.daysOfCover < 10)
          .sort((a, b) => a.daysOfCover - b.daysOfCover)
          .slice(0, 12);
      },
      { min: 800, max: 1300 },
    );
  },

  auditClaim(claimId: string): Promise<ClaimAudit> {
    return mock(
      () => {
        const d = db();
        const c = d.claims.find((x) => x.id === claimId) ?? notFound("Claim", claimId);
        const p = d.patients.find((x) => x.id === c.patientId)!;
        const adm = c.admissionId ? d.admissions.find((a) => a.id === c.admissionId) : undefined;
        const bill = c.billId ? d.bills.find((b) => b.id === c.billId) : undefined;
        const reasons: ClaimAudit["reasons"] = [];
        for (const m of c.missingDocuments) reasons.push({ label: "Document outstanding", detail: m, points: 16 });
        if (adm && p.insurance) {
          const ward = d.wards.find((w) => w.id === adm.wardId)!;
          const cap = p.insurance.sumInsured * (["ICU", "HDU", "NICU"].includes(ward.type) ? 0.02 : 0.01);
          if (ward.dailyRate > cap) reasons.push({ label: "Room rent above policy limit", detail: `${ward.name} at ₹${ward.dailyRate.toLocaleString("en-IN")}/day exceeds the ₹${Math.round(cap).toLocaleString("en-IN")}/day cap (${["ICU", "HDU", "NICU"].includes(ward.type) ? "2" : "1"}% of sum insured). Proportionate deduction likely.`, points: 14 });
          const recentChronic = p.conditions.filter((x) => x.chronic && x.since && differenceInCalendarDays(new Date(), new Date(x.since)) < 730);
          if (recentChronic.length) reasons.push({ label: "Possible pre-existing disease", detail: `${recentChronic.map((x) => x.name).join(", ")} diagnosed within 2 years; insurer may apply the PED waiting period.`, points: 18 });
          const pkg = bill?.packageId ? d.packages.find((x) => x.id === bill.packageId) : undefined;
          const los = differenceInCalendarDays(adm.dischargedAt ? new Date(adm.dischargedAt) : new Date(), new Date(adm.admittedAt));
          if (pkg && los > pkg.lengthOfStayDays + 1) reasons.push({ label: "Stay exceeds package length", detail: `${los} days against a ${pkg.lengthOfStayDays}-day package; justification notes needed.`, points: 10 });
        }
        if (c.preAuthAmount && c.claimedAmount > c.preAuthAmount * 1.15) reasons.push({ label: "Enhancement not requested", detail: `Final bill ₹${c.claimedAmount.toLocaleString("en-IN")} is ${Math.round((c.claimedAmount / c.preAuthAmount - 1) * 100)}% above pre-auth; raise an enhancement before submission.`, points: 12 });
        if (c.status === "Query raised") reasons.push({ label: "Open TPA query", detail: "Unanswered queries beyond 7 days commonly lead to closure.", points: 8 });
        const payer = d.payers.find((x) => x.id === c.insurerId);
        if (payer && payer.avgSettlementDays > 30) reasons.push({ label: "Payer history", detail: `${payer.shortName} averages ${payer.avgSettlementDays} days to settle with frequent deductions.`, points: 5 });
        const points = reasons.reduce((s, r) => s + r.points, 0);
        const risk = Math.min(0.94, 0.06 + points / 100);
        return {
          claimId,
          denialRisk: Math.round(risk * 100) / 100,
          level: levelFrom(risk * 100, [25, 45, 70]),
          reasons: reasons.sort((a, b) => b.points - a.points),
          missingCharges: bill ? missingCharges(bill.id) : [],
          meta: meta(0.81, [{ label: `Claim ${c.claimNo}` }, { label: bill ? `Bill ${bill.billNo}` : "No bill linked" }, { label: "Policy terms and payer history" }]),
        };
      },
      { min: 900, max: 1500 },
    );
  },

  /** Drafts a discharge summary from the admission record. Always edited by the clinician before finalising. */
  draftDischargeSummary(admissionId: string): Promise<{ draft: Omit<DischargeSummary, "preparedAt" | "preparedBy" | "status">; meta: AiMeta }> {
    return mock(
      () => {
        const d = db();
        const adm = d.admissions.find((a) => a.id === admissionId) ?? notFound("Admission", admissionId);
        const p = d.patients.find((x) => x.id === adm.patientId)!;
        const profile = profileOf(adm.patientId);
        const narrative = (profile && NARRATIVES[profile.key]) || DEFAULT_NARRATIVE;
        const days = Math.max(1, differenceInCalendarDays(new Date(), new Date(adm.admittedAt)));
        const surgeries = d.surgeries.filter((s) => s.admissionId === adm.id && s.status !== "Cancelled");
        const labs = labSnapshot(adm.patientId);
        const keyLabs = [...labs.entries()].filter(([, s]) => s.flag !== "N").slice(0, 4).map(([code, s]) => describeLab(code, s));
        const imaging = d.radiologyOrders.filter((r) => r.patientId === adm.patientId && r.report && new Date(r.orderedAt) >= new Date(adm.admittedAt));
        const oral = currentMedications(adm.patientId).map((m) => d.drugs.find((x) => x.id === m.drugId)!).filter((x) => ["Tablet", "Capsule", "Inhaler", "Syrup"].includes(x.form));
        const course = [
          `${ageLabel(p.dob).replace(" y", "-year-old")} ${p.gender.toLowerCase()} admitted on ${format(new Date(adm.admittedAt), "d MMM yyyy")} with ${adm.reason.toLowerCase()}.`,
          narrative.course,
          surgeries.length ? `Underwent ${surgeries.map((s) => s.procedure.toLowerCase()).join(" and ")} on ${format(new Date(surgeries[0].actualStart ?? surgeries[0].scheduledStart), "d MMM")}, uneventful.` : "",
          keyLabs.length ? `Significant investigations: ${keyLabs.join("; ")}.` : "",
          imaging.length ? `Imaging: ${imaging.map((r) => `${r.study} showed ${r.report!.impression.charAt(0).toLowerCase()}${r.report!.impression.slice(1)}`).join(" ")}` : "",
          `Clinically improved over ${days} day${days > 1 ? "s" : ""} and is being discharged in stable condition.`,
        ]
          .filter(Boolean)
          .join(" ");
        return {
          draft: {
            finalDiagnoses: adm.provisionalDiagnosis.map((x) => ({ ...x, type: "Final" as const })),
            hospitalCourse: course,
            proceduresDone: surgeries.map((s) => s.procedure),
            conditionAtDischarge: "Improved",
            dischargeMedications: oral.slice(0, 6).map((m) => ({ drug: `${m.brand} ${m.strength}`, dose: m.form === "Inhaler" ? "2 puffs" : "1 tab", frequency: "1-0-1", duration: "14 days" })),
            followUp: `Review in ${d.departments.find((x) => x.id === adm.departmentId)?.name} OPD with ${d.doctors.find((x) => x.id === adm.admittingDoctorId)?.name} after 7 days with reports.`,
            instructions: [...narrative.watchOuts.slice(0, 2).map((w) => `Return immediately if: ${w.charAt(0).toLowerCase()}${w.slice(1)}`), "Continue medicines as prescribed; do not stop without advice", "Diet and activity as explained by the dietician and physiotherapist"],
          },
          meta: meta(0.83, [{ label: `Admission ${adm.ipNo}` }, { label: `${adm.notes.length} progress notes` }, { label: `${labs.size} lab parameters` }, { label: "Inpatient medication orders" }]),
        };
      },
      { min: 1400, max: 2200 },
    );
  },

  /** Charges performed but not billed, for any bill. */
  findMissingCharges(billId: string): Promise<{ items: ClaimAudit["missingCharges"]; total: number; meta: AiMeta }> {
    return mock(
      () => {
        const items = missingCharges(billId);
        const bill = db().bills.find((b) => b.id === billId);
        return { items, total: items.reduce((s, i) => s + i.estimated, 0), meta: meta(0.84, [{ label: "Lab and radiology orders for this encounter" }, { label: bill ? `Bill ${bill.billNo} (${computeBillTotals(bill).net.toLocaleString("en-IN")})` : "Bill" }, { label: "OT records" }]) };
      },
      { min: 700, max: 1200 },
    );
  },

  /** Natural-language command bar. Parses intents and returns navigable results. */
  commandQuery(query: string, role: Parameters<typeof navForRole>[0]): Promise<CommandAnswer> {
    return mock(
      () => {
        const d = db();
        const q = query.trim().toLowerCase();
        const results: CommandResultItem[] = [];
        let intent = "search";
        let interpretation = "";
        let viewAllHref: string | undefined;
        const withinDays = /this week|last 7|past week/.test(q) ? 7 : /today/.test(q) ? 0 : /this month|last 30/.test(q) ? 30 : undefined;
        const conditionWords: Record<string, string[]> = {
          diabet: ["E10", "E11", "O24"], hypertens: ["I10", "I11", "I12", "I16"], dengue: ["A90", "A91"], sepsis: ["A41", "R65"], pneumonia: ["J18", "J15"],
          kidney: ["N17", "N18"], ckd: ["N18"], cardiac: ["I2", "I50", "I48"], heart: ["I2", "I50", "I48"], stroke: ["I63", "I61"], copd: ["J44"], asthma: ["J45"],
          pregnan: ["Z34", "O"], cancer: ["C"], fracture: ["S72", "S82", "S52"], thyroid: ["E03", "E05"],
        };
        const condKey = Object.keys(conditionWords).find((k) => q.includes(k));
        const wardMatch = /(icu|hdu|nicu|ccu|private|suite|general|maternity|paediatric|pediatric|surgical|emergency|er)\b/.exec(q);

        if (/(free|available|vacant|empty).*(bed)|(bed).*(free|available|vacant)/.test(q) || (/beds?/.test(q) && wardMatch)) {
          intent = "find_beds";
          const key = wardMatch?.[1];
          const wardTypes: Record<string, string[]> = { icu: ["ICU"], ccu: ["ICU"], hdu: ["HDU"], nicu: ["NICU"], private: ["Private"], suite: ["Suite"], general: ["General"], maternity: ["Semi-private"], surgical: ["Semi-private"], paediatric: ["General"], pediatric: ["General"], emergency: ["ER"], er: ["ER"] };
          const beds = d.beds.filter((b) => b.status === "Available" && (!key || wardTypes[key]?.includes(d.wards.find((w) => w.id === b.wardId)!.type)) && (key !== "ccu" || b.wardId === "WRD-CCU") && (key !== "maternity" || b.wardId === "WRD-MAT") && (key !== "surgical" || b.wardId === "WRD-SURG"));
          interpretation = `Available ${key ? key.toUpperCase() + " " : ""}beds right now`;
          for (const b of beds.slice(0, 12)) {
            const w = d.wards.find((x) => x.id === b.wardId)!;
            results.push({ id: b.id, kind: "bed", title: `${b.code}`, subtitle: `${w.name}, ${w.floor} · ₹${w.dailyRate.toLocaleString("en-IN")}/day`, href: `/ipd/beds?ward=${w.id}&bed=${b.id}`, badge: "Available", badgeTone: "stable" });
          }
          viewAllHref = "/ipd/beds";
        } else if (condKey || /admitted|inpatient/.test(q)) {
          intent = "find_patients";
          const prefixes = condKey ? conditionWords[condKey] : undefined;
          const admittedOnly = /admitted|inpatient|in ward/.test(q);
          const cutoff = withinDays !== undefined ? Date.now() - Math.max(1, withinDays) * 86400000 : undefined;
          const pts = d.patients.filter((p) => {
            if (prefixes && !p.conditions.some((c) => prefixes.some((pre) => c.code.startsWith(pre)))) return false;
            if (admittedOnly) {
              const adm = d.admissions.find((a) => a.patientId === p.id && !a.dischargedAt);
              if (!adm) return false;
              if (cutoff && new Date(adm.admittedAt).getTime() < cutoff) return false;
            }
            return true;
          });
          interpretation = `${condKey ? `Patients with ${condKey === "diabet" ? "diabetes" : condKey === "pregnan" ? "pregnancy" : condKey}` : "Patients"}${admittedOnly ? " currently admitted" : ""}${withinDays !== undefined && admittedOnly ? (withinDays === 0 ? " today" : ` in the last ${withinDays} days`) : ""}`;
          for (const p of pts.slice(0, 12)) {
            const adm = d.admissions.find((a) => a.patientId === p.id && !a.dischargedAt);
            const bed = adm ? d.beds.find((b) => b.id === adm.bedId) : undefined;
            results.push({ id: p.id, kind: "patient", title: p.fullName, subtitle: `${p.uhid} · ${ageLabel(p.dob)} ${p.gender[0]} · ${p.conditions.map((c) => c.name).slice(0, 2).join(", ")}`, href: `/patients/${p.id}`, badge: bed ? bed.code : p.status, badgeTone: adm?.acuity === "Critical" ? "critical" : adm ? "info" : "neutral" });
          }
          viewAllHref = condKey ? `/patients?condition=${encodeURIComponent(condKey)}` : "/ipd/admissions";
        } else if (/critical (result|value|lab)|panic/.test(q)) {
          intent = "critical_results";
          interpretation = "Critical laboratory values in the last 24 hours";
          for (const o of d.labOrders.filter((x) => x.results.some((r) => r.flag === "HH" || r.flag === "LL") && x.resultedAt && Date.now() - new Date(x.resultedAt).getTime() < 86400000).slice(-12).reverse()) {
            const r = o.results.find((x) => x.flag === "HH" || x.flag === "LL")!;
            const pm = paramMeta(r.testCode, r.paramCode);
            results.push({ id: o.id, kind: "lab", title: `${pm?.name} ${r.value} ${pm?.unit ?? ""}`.trim(), subtitle: `${d.patients.find((p) => p.id === o.patientId)?.fullName} · ${o.orderNo}`, href: `/lab/orders/${o.id}`, badge: "Critical", badgeTone: "critical" });
          }
          viewAllHref = "/lab/orders?abnormal=critical";
        } else if (/pending (lab|report|sample)|lab.*pending|stat/.test(q)) {
          intent = "pending_labs";
          interpretation = "Lab orders not yet verified";
          for (const o of d.labOrders.filter((x) => !["Verified", "Rejected"].includes(x.status)).slice(-12).reverse()) {
            results.push({ id: o.id, kind: "lab", title: `${o.orderNo} · ${o.testCodes.join(", ")}`, subtitle: `${d.patients.find((p) => p.id === o.patientId)?.fullName} · ${o.status}`, href: `/lab/orders/${o.id}`, badge: o.priority, badgeTone: o.priority === "STAT" ? "critical" : o.priority === "Urgent" ? "warning" : "neutral" });
          }
          viewAllHref = "/lab/samples";
        } else if (/low stock|out of stock|reorder|expir/.test(q)) {
          intent = "stock";
          const expiring = /expir/.test(q);
          interpretation = expiring ? "Batches expiring within 90 days" : "Formulary items below reorder level";
          const t = todayLocal();
          for (const drug of d.drugs) {
            const batches = d.stock.filter((b) => b.drugId === drug.id);
            const onHand = batches.filter((b) => b.expiry >= t).reduce((s, b) => s + b.qty, 0);
            const soon = batches.filter((b) => b.qty > 0 && b.expiry >= t && differenceInCalendarDays(new Date(b.expiry), new Date()) <= 90);
            if (expiring ? soon.length : onHand < drug.reorderLevel)
              results.push({ id: drug.id, kind: "drug", title: `${drug.brand} ${drug.strength}`, subtitle: expiring ? `Batch ${soon[0].batchNo} expires ${format(new Date(soon[0].expiry), "d MMM yyyy")}` : `${onHand} on hand, reorder at ${drug.reorderLevel}`, href: `/pharmacy/stock?search=${encodeURIComponent(drug.brand)}`, badge: expiring ? "Expiring" : onHand === 0 ? "Out" : "Low", badgeTone: onHand === 0 ? "critical" : "warning" });
          }
          results.splice(12);
          viewAllHref = expiring ? "/pharmacy/stock?filter=expiring" : "/pharmacy/stock?filter=low";
        } else if (/doctor|dr\.?\s|consultant|available/.test(q)) {
          intent = "find_doctors";
          const dept = d.departments.find((x) => q.includes(x.name.toLowerCase().split(" ")[0].slice(0, 6)) || q.includes(x.code.toLowerCase()));
          const specialtyWords: Record<string, string> = { cardiolog: "DEP-CAR", neurolog: "DEP-NEU", ortho: "DEP-ORT", paediatric: "DEP-PED", pediatric: "DEP-PED", gynae: "DEP-OBG", obstetric: "DEP-OBG", nephro: "DEP-NEP", gastro: "DEP-GAS", pulmo: "DEP-PUL", onco: "DEP-ONC", derma: "DEP-DER", uro: "DEP-URO", endocrin: "DEP-END", ent: "DEP-ENT", surgeon: "DEP-GS" };
          const sw = Object.keys(specialtyWords).find((k) => q.includes(k));
          const deptId = sw ? specialtyWords[sw] : dept?.id;
          const docs = d.doctors.filter((x) => (!deptId || x.departmentId === deptId) && (/available|free|today/.test(q) ? ["Available", "In OPD"].includes(x.status) : true));
          interpretation = `${deptId ? d.departments.find((x) => x.id === deptId)?.name + " doctors" : "Doctors"}${/available|free|today/.test(q) ? " available now" : ""}`;
          for (const doc of docs.slice(0, 12)) results.push({ id: doc.id, kind: "doctor", title: doc.name, subtitle: `${d.departments.find((x) => x.id === doc.departmentId)?.name} · ${doc.designation}`, href: `/doctors/${doc.id}`, badge: doc.status, badgeTone: doc.status === "Available" ? "stable" : doc.status === "On leave" ? "neutral" : "info" });
          viewAllHref = deptId ? `/doctors?departmentId=${deptId}` : "/doctors";
        } else if (/discharg/.test(q)) {
          intent = "discharges";
          interpretation = "Discharges planned for today";
          for (const a of d.admissions.filter((x) => x.status === "Discharge planned")) {
            const p = d.patients.find((x) => x.id === a.patientId)!;
            results.push({ id: a.id, kind: "admission", title: p.fullName, subtitle: `${a.ipNo} · ${d.beds.find((b) => b.id === a.bedId)?.code} · ${a.reason}`, href: `/ipd/admissions/${a.id}`, badge: "Planned", badgeTone: "info" });
          }
          viewAllHref = "/ipd/admissions?status=Discharge%20planned";
        } else if (/claim|tpa|insurance/.test(q)) {
          intent = "claims";
          const status = /reject/.test(q) ? "Rejected" : /quer/.test(q) ? "Query raised" : undefined;
          interpretation = status ? `Claims with status: ${status}` : "Open insurance claims";
          for (const c of d.claims.filter((x) => (status ? x.status === status : !["Settled", "Rejected"].includes(x.status))).slice(0, 12)) {
            results.push({ id: c.id, kind: "claim", title: c.claimNo, subtitle: `${d.patients.find((p) => p.id === c.patientId)?.fullName} · ₹${c.claimedAmount.toLocaleString("en-IN")}`, href: `/billing/claims/${c.id}`, badge: c.status, badgeTone: c.status === "Query raised" ? "warning" : c.status === "Rejected" ? "critical" : "info" });
          }
          viewAllHref = "/billing/claims";
        } else if (/appointment|opd|queue|token/.test(q)) {
          intent = "appointments";
          const t = todayLocal();
          interpretation = "Patients waiting in OPD now";
          for (const a of d.appointments.filter((x) => x.date === t && x.status === "Checked in").slice(0, 12)) {
            results.push({ id: a.id, kind: "appointment", title: `Token ${a.token} · ${d.patients.find((p) => p.id === a.patientId)?.fullName}`, subtitle: `${d.doctors.find((x) => x.id === a.doctorId)?.name} · ${a.time}`, href: "/opd/queue", badge: "Waiting", badgeTone: "info" });
          }
          viewAllHref = "/opd/queue";
        } else {
          intent = "search";
          interpretation = `Patients matching "${query.trim()}"`;
          const digits = q.replace(/\D/g, "");
          for (const p of d.patients.filter((x) => x.fullName.toLowerCase().includes(q) || x.uhid.toLowerCase().includes(q) || (digits.length >= 4 && x.phone.replace(/\D/g, "").includes(digits))).slice(0, 8)) {
            const s = patientSummary(p);
            results.push({ id: p.id, kind: "patient", title: p.fullName, subtitle: `${p.uhid} · ${s.ageLabel} ${p.gender[0]} · ${p.phone}`, href: `/patients/${p.id}`, badge: p.status, badgeTone: p.status === "Admitted" ? "info" : p.status === "In ER" ? "warning" : "neutral" });
          }
        }

        // Navigation matches are always appended
        const allowed = new Set(navForRole(role).flatMap((g) => g.items.flatMap((i) => [i.href, ...(i.children?.map((c) => c.href) ?? [])])));
        for (const g of NAV) {
          for (const item of g.items) {
            const hay = [item.label, ...(item.keywords ?? [])].join(" ").toLowerCase();
            if (q.length >= 2 && hay.includes(q.split(" ")[0]) && allowed.has(item.href) && results.length < 16) results.push({ id: item.href, kind: "nav", title: item.label, subtitle: g.label, href: item.href });
          }
        }
        return { query, intent, interpretation, results, viewAllHref, meta: meta(intent === "search" ? 0.72 : 0.88, [{ label: `Intent: ${intent.replace("_", " ")}` }]) };
      },
      { min: 450, max: 900 },
    );
  },
};
