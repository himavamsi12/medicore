import { addHours, addMinutes, differenceInHours, format, subHours, subMinutes } from "date-fns";
import type {
  Admission,
  Appointment,
  Doctor,
  ErCase,
  LabOrder,
  LabOrderStatus,
  LabResult,
  Modality,
  Priority,
  RadiologyOrder,
  RadiologyStatus,
  Staff,
  StudyKind,
} from "@/types";
import { flagResult, roundTo } from "@/lib/clinical";
import { LAB_TEST_MAP } from "../reference/labTests";
import type { ClinicalProfile } from "../reference/profiles";
import { NOW, iso } from "../seed/clock";
import { Rng } from "../seed/random";
import type { PatientSeed } from "./people";
import { idOf, type Trajectory } from "./types";

/* ---------------- Lab ---------------- */

function sampleValue(rng: Rng, testCode: string, paramCode: string, profile: ClinicalProfile, severity: number): number | string {
  const test = LAB_TEST_MAP[testCode];
  const p = test.parameters.find((x) => x.code === paramCode)!;
  const override = profile.labs[paramCode];
  if (p.options) {
    if (typeof override === "string") return severity > 0.35 ? override : p.refText ?? p.options[0];
    return p.refText && p.options.includes(p.refText) ? p.refText : p.options[0];
  }
  const lo = p.refLow ?? 0;
  const hi = p.refHigh ?? lo * 2 + 1;
  const mid = (lo + hi) / 2;
  const normal = rng.normal(mid, (hi - lo) / 7);
  let v: number;
  if (Array.isArray(override)) {
    const abn = rng.float(override[0], override[1], 4);
    v = mid + (abn - mid) * severity + (normal - mid) * 0.2;
  } else {
    v = normal;
  }
  if (v < 0) v = Math.abs(v) * 0.2;
  if (paramCode === "PLT") v = Math.max(0.09, v);
  if (paramCode === "PH") v = roundTo(v, 2);
  return roundTo(v, p.decimals ?? 1);
}

function results(rng: Rng, testCodes: string[], profile: ClinicalProfile, severity: number): LabResult[] {
  const out: LabResult[] = [];
  for (const code of testCodes) {
    const test = LAB_TEST_MAP[code];
    for (const p of test.parameters) {
      let value = sampleValue(rng, code, p.code, profile, severity);
      if (p.code === "ABO") value = "O+";
      out.push({ testCode: code, paramCode: p.code, value, flag: flagResult(p, value) });
    }
  }
  return out;
}

function statusAt(orderedAt: Date, tatHours: number, rng: Rng) {
  const collected = addMinutes(orderedAt, rng.int(8, 45));
  const processing = addMinutes(collected, rng.int(20, 60));
  const resulted = addMinutes(orderedAt, Math.round(tatHours * 60 * rng.float(0.6, 1.1, 2)));
  const verified = addMinutes(resulted, rng.int(10, 40));
  let status: LabOrderStatus = "Ordered";
  if (NOW >= collected) status = "Collected";
  if (NOW >= processing) status = "Processing";
  if (NOW >= resulted) status = "Resulted";
  if (NOW >= verified) status = "Verified";
  return { status, collected, processing, resulted, verified };
}

export function buildLabOrders(
  seeds: PatientSeed[],
  admissions: Admission[],
  appointments: Appointment[],
  erCases: ErCase[],
  doctors: Doctor[],
  staff: Staff[],
  trajectoryOf: Record<string, Trajectory>,
): LabOrder[] {
  const rng = new Rng("labs");
  const orders: LabOrder[] = [];
  const techs = staff.filter((s) => s.category === "Technician" && s.departmentId === "DEP-LAB");
  const verifiers = ["Dr. Meenakshi Rao (Pathology)", "Dr. Farooq Ahmed (Biochemistry)", "Dr. Sheela Thomas (Microbiology)"];
  const seedOf = new Map(seeds.map((s) => [s.patient.id, s]));
  let n = 1;

  const make = (opts: { patientId: string; orderedAt: Date; doctorId: string; source: LabOrder["source"]; encounterId?: string; priority: Priority; tests: string[]; severity: number; forceStatus?: LabOrderStatus }) => {
    const seed = seedOf.get(opts.patientId)!;
    const tests = opts.tests.filter((t) => LAB_TEST_MAP[t]);
    if (!tests.length) return undefined;
    const tat = Math.max(...tests.map((t) => LAB_TEST_MAP[t].tatHours)) * (opts.priority === "STAT" ? 0.35 : opts.priority === "Urgent" ? 0.6 : 1);
    const st = statusAt(opts.orderedAt, tat, rng);
    const status = opts.forceStatus ?? st.status;
    const reached = (s: LabOrderStatus) => ["Ordered", "Collected", "Processing", "Resulted", "Verified"].indexOf(status) >= ["Ordered", "Collected", "Processing", "Resulted", "Verified"].indexOf(s);
    const order: LabOrder = {
      id: idOf("LAB", n, 5),
      orderNo: `LO/${format(opts.orderedAt, "yyMMdd")}/${String(n).padStart(4, "0")}`,
      sampleId: `S${format(opts.orderedAt, "yyMMdd")}${String(1000 + n).slice(-4)}`,
      patientId: opts.patientId,
      orderedById: opts.doctorId,
      orderedAt: iso(opts.orderedAt),
      source: opts.source,
      encounterId: opts.encounterId,
      priority: opts.priority,
      testCodes: tests,
      status,
      collectedAt: reached("Collected") ? iso(st.collected) : undefined,
      collectedBy: reached("Collected") && techs.length ? rng.pick(techs).name : undefined,
      processingAt: reached("Processing") ? iso(st.processing) : undefined,
      resultedAt: reached("Resulted") ? iso(st.resulted) : undefined,
      verifiedAt: reached("Verified") ? iso(st.verified) : undefined,
      verifiedBy: reached("Verified") ? rng.pick(verifiers) : undefined,
      results: reached("Resulted") ? results(rng, tests, seed.profile, opts.severity) : [],
    };
    if (rng.chance(0.012) && status === "Collected") {
      order.status = "Rejected";
      order.rejectionReason = rng.pick(["Haemolysed sample", "Insufficient volume", "Clotted EDTA sample", "Label mismatch"]);
    }
    orders.push(order);
    n++;
    return order;
  };

  // Inpatients: admission panel + daily repeats
  for (const a of admissions) {
    const seed = seedOf.get(a.patientId)!;
    const admittedAt = new Date(a.admittedAt);
    const current = !a.dischargedAt;
    const end = current ? NOW : new Date(a.dischargedAt!);
    const traj = trajectoryOf[a.id] ?? "improving";
    const panel = seed.profile.labPanel.length ? seed.profile.labPanel : ["CBC", "RFT"];
    const totalH = Math.max(1, differenceInHours(end, admittedAt));
    const priority: Priority = a.acuity === "Critical" ? "STAT" : a.acuity === "Serious" ? "Urgent" : "Routine";
    make({ patientId: a.patientId, orderedAt: addMinutes(admittedAt, 40), doctorId: a.admittingDoctorId, source: "IPD", encounterId: a.id, priority, tests: panel, severity: traj === "deteriorating" ? 0.6 : 1 });
    // daily repeats of the most informative tests
    const repeat = panel.filter((t) => ["CBC", "RFT", "LFT", "PCT", "LACT", "TROPI", "COAG", "ABG", "CRP"].includes(t)).slice(0, 2);
    for (let h = 22; h < totalH; h += 24) {
      const at = addHours(admittedAt, h + rng.int(-2, 2));
      if (at > NOW) break;
      const progress = h / totalH;
      const severity = traj === "improving" ? Math.max(0.1, 1 - 0.85 * progress) : traj === "deteriorating" ? 0.6 + 0.8 * progress : 0.8;
      make({ patientId: a.patientId, orderedAt: at, doctorId: a.admittingDoctorId, source: "IPD", encounterId: a.id, priority: "Routine", tests: repeat.length ? repeat : ["CBC"], severity });
    }
    // A fresh morning sample for current inpatients, some still in the pipeline
    if (current && totalH > 10) {
      make({ patientId: a.patientId, orderedAt: subMinutes(NOW, rng.int(20, 300)), doctorId: a.admittingDoctorId, source: "IPD", encounterId: a.id, priority: a.acuity === "Critical" ? "STAT" : "Routine", tests: repeat.length ? repeat : ["CBC"], severity: traj === "improving" ? 0.2 : traj === "deteriorating" ? 1.35 : 0.8 });
    }
  }

  // Outpatients
  for (const appt of appointments) {
    if (!appt.consultation) continue;
    const seed = seedOf.get(appt.patientId)!;
    const inConsult = appt.status === "In consultation";
    if (!inConsult && !rng.chance(0.45)) continue;
    if (!seed.profile.labPanel.length) continue;
    const at = new Date(appt.consultation.completedAt ?? appt.calledAt ?? subMinutes(NOW, 30));
    const o = make({ patientId: appt.patientId, orderedAt: addMinutes(at, 2), doctorId: appt.doctorId, source: "OPD", encounterId: appt.id, priority: "Routine", tests: rng.sample(seed.profile.labPanel, rng.int(1, Math.min(3, seed.profile.labPanel.length))), severity: 0.9 });
    if (o) appt.consultation.labOrderIds.push(o.id);
  }

  // Emergency
  for (const er of erCases) {
    if (er.status === "Waiting") continue;
    const seed = seedOf.get(er.patientId)!;
    const tests = seed.profile.key === "trauma" ? ["CBC", "BGRP", "COAG", "VIRAL"] : seed.profile.key === "copd" ? ["ABG", "CBC", "RFT"] : seed.profile.labPanel.slice(0, 3);
    if (!tests.length) continue;
    const arrived = new Date(er.arrivedAt);
    make({ patientId: er.patientId, orderedAt: addMinutes(arrived, rng.int(8, 25)), doctorId: er.doctorId ?? "DOC-034", source: "ER", encounterId: er.id, priority: (er.triageLevel ?? 3) <= 2 ? "STAT" : "Urgent", tests, severity: 1 });
  }

  return orders.sort((a, b) => a.orderedAt.localeCompare(b.orderedAt));
}

/* ---------------- Radiology ---------------- */

const STUDIES: Record<string, [Modality, string, StudyKind, string][]> = {
  pneumonia: [["X-Ray", "X-Ray Chest PA view", "chest", "Chest"], ["CT", "HRCT Thorax", "chest", "Chest"]],
  copd: [["X-Ray", "X-Ray Chest PA view", "chest", "Chest"]],
  hf: [["X-Ray", "X-Ray Chest PA view", "chest", "Chest"]],
  sepsis: [["X-Ray", "X-Ray Chest AP (portable)", "chest", "Chest"], ["USG", "USG Abdomen and Pelvis", "abdomen", "Abdomen"]],
  cad: [["X-Ray", "X-Ray Chest PA view", "chest", "Chest"]],
  stemi: [["X-Ray", "X-Ray Chest AP (portable)", "chest", "Chest"]],
  healthy: [["X-Ray", "X-Ray Chest PA view", "chest", "Chest"], ["USG", "USG Abdomen and Pelvis", "abdomen", "Abdomen"]],
  stroke: [["CT", "CT Brain Plain", "brain", "Head"], ["MRI", "MRI Brain with DWI and MRA", "brain", "Head"]],
  epilepsy: [["MRI", "MRI Brain (epilepsy protocol)", "brain", "Head"]],
  migraine: [["MRI", "MRI Brain Plain", "brain", "Head"]],
  trauma: [["CT", "CT Brain Plain", "brain", "Head"], ["X-Ray", "X-Ray Right Leg AP and Lateral", "knee", "Right leg"]],
  cholelithiasis: [["USG", "USG Abdomen and Pelvis", "abdomen", "Abdomen"]],
  appendicitis: [["USG", "USG Abdomen (appendix protocol)", "abdomen", "Abdomen"], ["CT", "CECT Abdomen", "abdomen", "Abdomen"]],
  "renal-stone": [["CT", "CT KUB (plain)", "abdomen", "Abdomen"]],
  cirrhosis: [["USG", "USG Abdomen with Doppler", "abdomen", "Abdomen"]],
  ckd: [["USG", "USG KUB", "abdomen", "Abdomen"]],
  pregnancy: [["USG", "USG Obstetric (growth scan)", "abdomen", "Abdomen"]],
  "oa-knee": [["X-Ray", "X-Ray Both Knees Standing AP", "knee", "Knees"]],
  fracture: [["X-Ray", "X-Ray Pelvis with Both Hips AP", "pelvis", "Pelvis"]],
  "back-pain": [["MRI", "MRI Lumbosacral Spine", "spine", "Lumbar spine"]],
  "ca-breast": [["CT", "CECT Chest and Abdomen", "chest", "Chest"], ["Mammography", "Bilateral Mammography", "chest", "Breast"]],
};

const REPORTS: Record<string, { findings: string; impression: string }> = {
  "pneumonia|chest": { findings: "Homogeneous opacity in the right lower zone with air bronchograms, obscuring the right cardiophrenic angle. Left lung clear. Cardiac size normal. Costophrenic angles clear.", impression: "Right lower lobe consolidation, consistent with pneumonia in the given clinical context." },
  "copd|chest": { findings: "Hyperinflated lung fields with flattened hemidiaphragms. Increased retrosternal lucency. Prominent bronchovascular markings. No focal consolidation.", impression: "Features of chronic obstructive airway disease. No acute consolidation." },
  "hf|chest": { findings: "Cardiomegaly (CTR 0.62). Upper lobe venous diversion, bilateral perihilar haziness and Kerley B lines. Small bilateral pleural effusions.", impression: "Cardiomegaly with pulmonary venous congestion and interstitial oedema." },
  "sepsis|chest": { findings: "Portable AP film. Lines and tubes in position. Mild bibasal atelectasis. No consolidation or effusion.", impression: "No acute cardiopulmonary abnormality." },
  "sepsis|abdomen": { findings: "Right kidney bulky (12.4 cm) with altered corticomedullary differentiation and perinephric fat stranding. No hydronephrosis. Bladder wall normal.", impression: "Features suggestive of right acute pyelonephritis. No obstructive uropathy." },
  "stroke|brain": { findings: "Hypodensity in the left fronto-parietal region involving the insular cortex and lentiform nucleus with loss of grey-white differentiation. Hyperdense left MCA sign. No haemorrhage. No midline shift.", impression: "Acute infarct in left MCA territory. No haemorrhagic transformation." },
  "trauma|brain": { findings: "No intracranial haemorrhage. Small right parietal scalp haematoma. Calvarium intact. Ventricles and basal cisterns normal.", impression: "No acute intracranial injury. Right parietal scalp haematoma." },
  "trauma|knee": { findings: "Transverse fracture of the mid-shaft of the right tibia with 6 mm lateral displacement. Fibula intact. Knee and ankle joints preserved.", impression: "Displaced mid-shaft fracture right tibia." },
  "cholelithiasis|abdomen": { findings: "Gallbladder distended with multiple mobile calculi, largest 14 mm. Wall thickness 2.8 mm. CBD 5 mm. Liver normal in size and echotexture.", impression: "Cholelithiasis without sonographic evidence of cholecystitis." },
  "appendicitis|abdomen": { findings: "Blind-ending non-compressible tubular structure in right iliac fossa measuring 9 mm with periappendiceal fat stranding and a 6 mm appendicolith.", impression: "Acute appendicitis with appendicolith. No perforation." },
  "renal-stone|abdomen": { findings: "8 x 6 mm calculus in the right lower ureter with mild right hydroureteronephrosis. Left kidney normal.", impression: "Right lower ureteric calculus with mild obstruction." },
  "oa-knee|knee": { findings: "Reduced medial joint space bilaterally, right more than left. Marginal osteophytes and subchondral sclerosis. Varus alignment right knee.", impression: "Bilateral osteoarthritis knees (Kellgren-Lawrence grade 3 right, grade 2 left)." },
  "fracture|pelvis": { findings: "Intertrochanteric fracture of the right femur with comminution of the lesser trochanter. Osteopenic bones. Left hip normal.", impression: "Unstable intertrochanteric fracture right femur." },
  "back-pain|spine": { findings: "Disc desiccation at L4-L5 and L5-S1. Left paracentral disc extrusion at L4-L5 compressing the traversing left L5 nerve root. Mild canal stenosis.", impression: "L4-L5 left paracentral disc extrusion with left L5 root compression." },
};

export function buildRadiology(seeds: PatientSeed[], admissions: Admission[], appointments: Appointment[], erCases: ErCase[], doctors: Doctor[]): RadiologyOrder[] {
  const rng = new Rng("radiology");
  const out: RadiologyOrder[] = [];
  const radiologists = doctors.filter((d) => d.departmentId === "DEP-RAD");
  const seedOf = new Map(seeds.map((s) => [s.patient.id, s]));
  let n = 1;

  const make = (patientId: string, orderedAt: Date, doctorId: string, source: RadiologyOrder["source"], encounterId: string, priority: Priority, pick: 0 | 1 = 0, forceStatus?: RadiologyStatus) => {
    const seed = seedOf.get(patientId)!;
    const opts = STUDIES[seed.profile.key];
    if (!opts) return undefined;
    const [modality, study, studyKind, bodyPart] = opts[Math.min(pick, opts.length - 1)];
    const hoursSince = differenceInHours(NOW, orderedAt);
    let status: RadiologyStatus = hoursSince > 20 ? "Verified" : hoursSince > 6 ? rng.pick(["Reported", "Verified"] as const) : hoursSince > 2 ? rng.pick(["Acquired", "Reported"] as const) : rng.pick(["Ordered", "Scheduled", "Acquired"] as const);
    if (forceStatus) status = forceStatus;
    const acquired = addMinutes(orderedAt, rng.int(25, 110));
    const reportKey = `${seed.profile.key}|${studyKind}`;
    const tpl = REPORTS[reportKey] ?? { findings: "No significant abnormality detected. Visualised structures appear normal for age.", impression: "Normal study." };
    const rad = rng.pick(radiologists);
    const reported = ["Reported", "Verified"].includes(status);
    const order: RadiologyOrder = {
      id: idOf("RAD", n, 5),
      accessionNo: `ACC${format(orderedAt, "yyMMdd")}${String(n).padStart(4, "0")}`,
      patientId,
      modality,
      study,
      studyKind,
      bodyPart,
      clinicalHistory: `${seed.profile.complaint[0]}. ${seed.profile.conditions.map(([, name]) => name).slice(0, 2).join(", ")}.`,
      orderedById: doctorId,
      orderedAt: iso(orderedAt),
      source,
      encounterId,
      priority,
      status,
      scheduledAt: status !== "Ordered" ? iso(addMinutes(orderedAt, rng.int(10, 60))) : undefined,
      acquiredAt: ["Acquired", "Reported", "Verified"].includes(status) ? iso(acquired) : undefined,
      images: modality === "CT" ? rng.int(120, 480) : modality === "MRI" ? rng.int(180, 620) : modality === "USG" ? rng.int(12, 36) : rng.int(1, 3),
      radiologistId: reported ? rad.id : undefined,
      report: reported
        ? {
            technique: modality === "CT" ? "Axial sections acquired on 128-slice MDCT with multiplanar reconstructions." : modality === "MRI" ? "Multiplanar multisequence MRI on 3T scanner." : modality === "USG" ? "Real-time grey-scale and colour Doppler sonography." : "Digital radiograph.",
            findings: tpl.findings,
            impression: tpl.impression,
            reportedBy: rad.name,
            reportedAt: iso(addMinutes(acquired, rng.int(20, 180))),
            verified: status === "Verified",
          }
        : undefined,
    };
    out.push(order);
    n++;
    return order;
  };

  for (const a of admissions) {
    if (!rng.chance(a.dischargedAt ? 0.5 : 0.8)) continue;
    const seed = seedOf.get(a.patientId)!;
    if (!STUDIES[seed.profile.key]) continue;
    const at = addHours(new Date(a.admittedAt), rng.int(1, 5));
    make(a.patientId, at > NOW ? subMinutes(NOW, 20) : at, a.admittingDoctorId, "IPD", a.id, a.acuity === "Critical" ? "STAT" : "Urgent");
    if (!a.dischargedAt && rng.chance(0.35) && (STUDIES[seed.profile.key]?.length ?? 0) > 1) make(a.patientId, subHours(NOW, rng.float(0.3, 5, 1)), a.admittingDoctorId, "IPD", a.id, "Urgent", 1);
  }
  for (const appt of appointments) {
    if (!appt.consultation || !rng.chance(0.14)) continue;
    const at = new Date(appt.consultation.completedAt ?? appt.calledAt ?? NOW);
    const o = make(appt.patientId, addMinutes(at, 3), appt.doctorId, "OPD", appt.id, "Routine");
    if (o) appt.consultation.radiologyOrderIds.push(o.id);
  }
  for (const er of erCases) {
    if (er.status === "Waiting" || er.status === "In triage") continue;
    const seed = seedOf.get(er.patientId)!;
    if (!STUDIES[seed.profile.key]) continue;
    const at = addMinutes(new Date(er.arrivedAt), rng.int(10, 30));
    const active = ["Under treatment", "Observation"].includes(er.status);
    make(er.patientId, at, er.doctorId ?? "DOC-034", "ER", er.id, "STAT", 0, active ? "Acquired" : undefined);
    if (seed.profile.key === "trauma" && active) make(er.patientId, addMinutes(at, 5), er.doctorId ?? "DOC-034", "ER", er.id, "STAT", 1, "Acquired");
  }
  return out.sort((a, b) => a.orderedAt.localeCompare(b.orderedAt));
}
