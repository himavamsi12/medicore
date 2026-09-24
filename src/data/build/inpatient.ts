import { addDays, addHours, addMinutes, differenceInHours, subDays, subHours, subMinutes } from "date-fns";
import type {
  Acuity,
  Admission,
  Bed,
  BedStatus,
  Doctor,
  ErCase,
  Patient,
  ProgressNote,
  Staff,
  Vitals,
  Ward,
  WardType,
} from "@/types";
import { ageYears, roundTo } from "@/lib/clinical";
import { WARD_LAYOUT } from "../org";
import type { ClinicalProfile } from "../reference/profiles";
import { NOW, TODAY, day, iso } from "../seed/clock";
import { Rng } from "../seed/random";
import type { PatientSeed } from "./people";
import { idOf, type Trajectory } from "./types";

const SURGICAL_DEPTS = ["DEP-GS", "DEP-ORT", "DEP-URO", "DEP-ENT", "DEP-EM"];

export function buildWardsAndBeds(): { wards: Ward[]; beds: Bed[] } {
  const rng = new Rng("beds");
  const wards: Ward[] = WARD_LAYOUT.map((w) => ({ ...w.ward }));
  const beds: Bed[] = [];
  for (const { ward, beds: count, prefix } of WARD_LAYOUT) {
    for (let i = 1; i <= count; i++) {
      const features: string[] = [];
      if (["ICU", "HDU", "NICU"].includes(ward.type)) features.push("Ventilator-ready", "Multipara monitor");
      if (ward.type === "NICU") features.push("Radiant warmer", "Phototherapy");
      if (ward.type === "Private" || ward.type === "Suite") features.push("Attendant bed", "TV");
      if (ward.type === "ER") features.push("Monitor", i <= 2 ? "Resuscitation bay" : "Trolley");
      if (rng.chance(0.25) && ward.type !== "ER") features.push("Oxygen port");
      if (i === 1 && ["ICU", "HDU", "General"].includes(ward.type)) features.push("Isolation");
      beds.push({
        id: `BED-${prefix}-${String(i).padStart(2, "0")}`,
        code: `${prefix}-${String(i).padStart(2, "0")}`,
        wardId: ward.id,
        status: "Available",
        features,
        statusSince: iso(subHours(NOW, rng.int(1, 40))),
      });
    }
  }
  return { wards, beds };
}

/** Pick the most appropriate ward for a patient given the ward type the profile asks for. */
function wardFor(type: WardType, profile: ClinicalProfile, p: Patient): string {
  const age = ageYears(p.dob);
  switch (type) {
    case "ICU":
      if (profile.departmentId === "DEP-CAR") return "WRD-CCU";
      if (SURGICAL_DEPTS.includes(profile.departmentId)) return "WRD-SICU";
      return "WRD-MICU";
    case "HDU":
      return "WRD-HDU";
    case "NICU":
      return "WRD-NICU";
    case "Private":
      return "WRD-PVT";
    case "Suite":
      return "WRD-STE";
    case "Semi-private":
      if (profile.departmentId === "DEP-OBG") return "WRD-MAT";
      if (SURGICAL_DEPTS.includes(profile.departmentId)) return "WRD-SURG";
      if (age < 13) return "WRD-PED";
      return p.gender === "Female" ? "WRD-GMF" : "WRD-GMM";
    default:
      if (age < 13) return "WRD-PED";
      if (profile.departmentId === "DEP-OBG") return "WRD-MAT";
      return p.gender === "Female" ? "WRD-GMF" : "WRD-GMM";
  }
}

/* ---------------- Vitals ---------------- */

export function makeVitals(
  rng: Rng,
  p: Patient,
  profile: ClinicalProfile,
  factor: number,
  at: Date,
  recordedBy: string,
  source: Vitals["source"],
  n: number,
  inCriticalCare = false,
): Vitals {
  const age = ageYears(p.dob);
  const b = profile.vitalsBias ?? {};
  const child = age < 12;
  const baseSys = child ? 100 : age > 60 ? 132 : 120;
  const sys = Math.round(rng.normal(baseSys, 6) + (b.bpSys ?? 0) * factor);
  const pulse = Math.round(rng.normal(child ? 104 : 80, 5) + (b.pulse ?? 0) * factor);
  const rr = Math.round(rng.normal(child ? 24 : 16, 1.2) + (b.rr ?? 0) * factor);
  const temp = roundTo(rng.normal(98.4, 0.3) + (b.temp ?? 0) * factor, 1);
  const spo2 = Math.min(100, Math.round(rng.normal(98, 0.8) + (b.spo2 ?? 0) * factor));
  const onOxygen = inCriticalCare && (b.spo2 ?? 0) * factor <= -4;
  const confused = profile.key === "sepsis" && factor > 0.8 ? "New confusion" : profile.key === "stroke" && factor > 0.7 ? "Voice" : "Alert";
  return {
    id: idOf("VIT", n, 6),
    patientId: p.id,
    recordedAt: iso(at),
    recordedBy,
    source,
    bpSystolic: sys,
    bpDiastolic: Math.round(sys * rng.float(0.58, 0.68, 2)),
    pulse,
    respRate: rr,
    tempF: temp,
    spo2,
    painScore: rng.int(0, profile.key === "fracture" || profile.key === "appendicitis" || profile.key === "trauma" ? 7 : 3),
    weightKg: age < 1 ? roundTo(rng.float(1.9, 2.8, 2), 2) : child ? rng.int(10, 38) : rng.int(46, 92),
    heightCm: age < 1 ? rng.int(44, 49) : child ? rng.int(80, 150) : rng.int(148, 182),
    grbs: profile.key.includes("dm") || profile.labs.RBS ? rng.int(140, 260) : undefined,
    gcs: confused === "Alert" ? 15 : confused === "Voice" ? 13 : 14,
    consciousness: confused,
    onOxygen,
  };
}

export function trajectoryFactor(t: Trajectory, progress: number): number {
  if (t === "improving") return Math.max(0.15, 1 - 0.75 * progress);
  if (t === "deteriorating") return 0.45 + 0.75 * progress;
  return 0.7;
}

/* ---------------- Admissions ---------------- */

const DIET = ["Normal diet", "Diabetic diet (1800 kcal)", "Soft diet", "Low salt diet", "Renal diet (restricted K+)", "Nil by mouth", "Liquid diet", "Cardiac diet", "Breastfeeds / EBM"];

function dietFor(profile: ClinicalProfile): string {
  if (profile.key === "neonate") return DIET[8];
  if (["appendicitis", "cholelithiasis", "hernia", "fracture", "oa-knee"].includes(profile.key)) return DIET[5];
  if (profile.key === "ckd") return DIET[4];
  if (["stemi", "cad", "hf"].includes(profile.key)) return DIET[7];
  if (profile.key.includes("dm") || profile.key === "sepsis") return DIET[1];
  if (profile.key === "stroke") return "Ryle's tube feeds";
  return DIET[0];
}

function notesFor(rng: Rng, profile: ClinicalProfile, adm: { admittedAt: Date }, doctor: Doctor, nurse: Staff | undefined, n: number): ProgressNote[] {
  const reason = profile.admission?.reason ?? "Observation";
  const doctorLines: Record<string, string[]> = {
    sepsis: ["Febrile overnight, MAP maintained on low-dose noradrenaline. Urine output 0.6 ml/kg/hr. Continue meropenem pending culture sensitivity.", "Afebrile for 18 hours, vasopressor tapered off. Lactate clearing. Plan to step down to HDU if stable."],
    stemi: ["Post primary PCI to LAD, TIMI III flow. Chest pain free. Echo EF 40% with anterior hypokinesia.", "Haemodynamically stable. Start cardiac rehab. Continue DAPT, high-intensity statin, beta blocker."],
    dengue: ["Day 5 of fever. Platelets falling, haematocrit rising. Watch for plasma leak. Strict input-output charting.", "No bleeding manifestations. Continue oral and IV fluids per WHO protocol. Repeat CBC 12-hourly."],
    pneumonia: ["Crepitations right infra-axillary area. On IV ceftriaxone and azithromycin. Requiring 2 L O₂ via nasal prongs.", "Increasing oxygen requirement since morning. Repeat chest X-ray ordered. Escalate antibiotics if no improvement in 24 h."],
    ckd: ["Bilateral pedal oedema, basal crepitations. K⁺ 5.9. Haemodialysis session done via right IJV catheter.", "Post dialysis weight down by 2.1 kg. Plan AV fistula creation before discharge."],
    stroke: ["NIHSS 11 at admission, now 8. Right hemiparesis, expressive aphasia. Swallow assessment failed, RT feeds started.", "Physiotherapy initiated. Holter shows paroxysmal AF; start apixaban after day 5 of infarct."],
  };
  const lines = doctorLines[profile.key] ?? [`Admitted with ${reason.toLowerCase()}. Clinically stable, vitals within acceptable limits. Continue current management.`, "Reviewed on rounds. Tolerating diet. Plan discussed with patient and family."];
  const notes: ProgressNote[] = [];
  const hoursIn = Math.max(2, differenceInHours(NOW, adm.admittedAt));
  lines.forEach((text, i) => {
    notes.push({
      id: idOf("NOTE", n * 10 + i, 6),
      at: iso(addHours(adm.admittedAt, Math.min(hoursIn - 1, 2 + i * Math.max(6, hoursIn / 2)))),
      authorId: doctor.id,
      authorName: doctor.name,
      kind: "Doctor",
      text,
    });
  });
  if (nurse) {
    notes.push({
      id: idOf("NOTE", n * 10 + 5, 6),
      at: iso(subMinutes(NOW, rng.int(30, 240))),
      authorId: nurse.id,
      authorName: nurse.name,
      kind: "Nursing",
      text: rng.pick([
        "Vitals recorded 4-hourly. IV line patent, site clean. Patient ambulated with support.",
        "Medications given as charted. Pain score 3/10. Encouraged oral fluids. Family counselled.",
        "Slept intermittently. Input 1850 ml / output 1400 ml over 12 h. Pressure areas checked, no redness.",
      ]),
    });
  }
  return notes.sort((a, b) => a.at.localeCompare(b.at));
}

export interface InpatientResult {
  admissions: Admission[];
  erCases: ErCase[];
  vitals: Vitals[];
  trajectoryOf: Record<string, Trajectory>;
}

export function buildInpatient(seeds: PatientSeed[], doctors: Doctor[], wards: Ward[], beds: Bed[], staff: Staff[]): InpatientResult {
  const rng = new Rng("inpatient");
  const admissions: Admission[] = [];
  const erCases: ErCase[] = [];
  const vitals: Vitals[] = [];
  const trajectoryOf: Record<string, Trajectory> = {};
  let admN = 1;
  let vitN = 1;
  let erN = 1;

  const doctorFor = (deptId: string) => {
    const pool = doctors.filter((d) => d.departmentId === deptId);
    return pool.length ? rng.pick(pool) : rng.pick(doctors.filter((d) => d.departmentId === "DEP-GM"));
  };
  const nursesOf = (wardId: string) => staff.filter((s) => s.category === "Nurse" && s.wardId === wardId);

  const takeBed = (wardId: string): Bed | undefined => beds.find((b) => b.wardId === wardId && b.status === "Available");

  const placeAdmission = (seed: PatientSeed, opts: { current: boolean; admittedAt: Date; los: number; trajectory: Trajectory; forcedWard?: string }) => {
    const { patient: p, profile } = seed;
    const adm = profile.admission!;
    let bed: Bed | undefined;
    let wardId = opts.forcedWard ?? wardFor(adm.wardTypes[0], profile, p);
    if (opts.current) {
      bed = takeBed(wardId);
      for (const wt of adm.wardTypes.slice(1)) {
        if (bed) break;
        wardId = wardFor(wt, profile, p);
        bed = takeBed(wardId);
      }
      if (!bed) {
        wardId = p.gender === "Female" ? "WRD-GMF" : "WRD-GMM";
        bed = takeBed(wardId) ?? takeBed("WRD-PVT");
      }
      if (!bed) return undefined;
      wardId = bed.wardId;
    } else {
      const wardBeds = beds.filter((b) => b.wardId === wardId);
      bed = rng.pick(wardBeds);
    }

    const doctor = profile.key === "sepsis" ? doctors.find((d) => d.departmentId === "DEP-CCM")! : doctorFor(profile.departmentId === "DEP-EM" ? (profile.key === "trauma" ? "DEP-ORT" : "DEP-CCM") : profile.departmentId);
    const id = idOf("ADM", admN);
    const expected = addDays(opts.admittedAt, opts.los);
    const dischargedAt = opts.current ? undefined : addHours(expected, rng.int(-6, 10));
    const emergencyProfiles = ["sepsis", "stemi", "stroke", "trauma", "op-poisoning", "dengue", "pneumonia", "copd", "appendicitis", "fracture", "hf", "ckd", "cirrhosis", "preeclampsia", "bronchiolitis", "neonate"];
    const acuity: Acuity = opts.current && opts.trajectory === "improving" && adm.acuity === "Critical" && differenceInHours(NOW, opts.admittedAt) > 60 ? "Serious" : adm.acuity;
    const admission: Admission = {
      id,
      ipNo: `IP/26/${String(4100 + admN * 3).padStart(5, "0")}`,
      patientId: p.id,
      bedId: bed.id,
      wardId,
      admittingDoctorId: doctor.id,
      departmentId: doctor.departmentId,
      admittedAt: iso(opts.admittedAt),
      expectedDischarge: day(expected),
      dischargedAt: dischargedAt ? iso(dischargedAt) : undefined,
      status: opts.current ? (day(expected) <= day(TODAY) ? "Discharge planned" : "Admitted") : rng.chance(0.03) ? "LAMA" : "Discharged",
      admissionType: emergencyProfiles.includes(profile.key) ? "Emergency" : profile.admission?.procedure && ["hernia", "renal-stone", "sinusitis"].includes(profile.key) && opts.los <= 1 ? "Day care" : "Elective",
      acuity,
      provisionalDiagnosis: profile.conditions.filter(([, , chronic]) => !chronic).concat(profile.conditions.filter(([, , c]) => c).slice(0, 1)).map(([code, name]) => ({ code, name, type: "Provisional" as const })),
      reason: adm.reason,
      dietOrder: dietFor(profile),
      codeStatus: ageYears(p.dob) > 82 && rng.chance(0.3) ? "DNR" : "Full code",
      isolation: profile.key === "copd" && rng.chance(0.2) ? "Droplet" : profile.key === "sepsis" && rng.chance(0.4) ? "Contact" : undefined,
      transfers: [],
      notes: [],
    };
    const nurses = nursesOf(wardId);
    admission.notes = notesFor(rng, profile, { admittedAt: opts.admittedAt }, doctor, nurses[0], admN);
    if (admission.codeStatus === "DNR") p.flags.push("DNR");
    if (admission.isolation) p.flags.push("Isolation");

    if (opts.current) {
      bed.status = "Occupied";
      bed.admissionId = id;
      bed.patientId = p.id;
      bed.statusSince = admission.admittedAt;
      p.status = "Admitted";
      trajectoryOf[id] = opts.trajectory;

      // Step-down transfer from ICU for improving critical patients
      if (opts.trajectory === "improving" && !["ICU", "NICU"].includes(wards.find((w) => w.id === wardId)!.type) && adm.wardTypes.includes("ICU")) {
        const icuBed = beds.find((b) => b.wardId === (profile.departmentId === "DEP-CAR" ? "WRD-CCU" : "WRD-MICU"))!;
        admission.transfers.push({ id: idOf("TRF", admN), at: iso(addHours(opts.admittedAt, 30)), fromBedId: icuBed.id, toBedId: bed.id, reason: "Step-down after haemodynamic stability", by: doctor.name });
      } else if (rng.chance(0.12) && admission.admissionType === "Emergency") {
        const erBed = beds.find((b) => b.wardId === "WRD-ER")!;
        admission.transfers.push({ id: idOf("TRF", admN), at: iso(addHours(opts.admittedAt, 2)), fromBedId: erBed.id, toBedId: bed.id, reason: "Admitted from Emergency", by: doctor.name });
      }

      // Vitals every 4 hours for the last 72 hours of stay
      const start = new Date(Math.max(opts.admittedAt.getTime(), subHours(NOW, 72).getTime()));
      const ward = wards.find((w) => w.id === wardId)!;
      const critical = ["ICU", "HDU", "NICU"].includes(ward.type);
      const step = critical ? 2 : 4;
      const totalH = Math.max(1, differenceInHours(NOW, opts.admittedAt));
      for (let t = start; t <= NOW; t = addHours(t, step)) {
        const progress = Math.min(1, differenceInHours(t, opts.admittedAt) / totalH);
        const factor = trajectoryFactor(opts.trajectory, progress);
        vitals.push(makeVitals(rng, p, profile, factor, addMinutes(t, rng.int(-10, 10)), nurses.length ? rng.pick(nurses).name : "Staff Nurse", "IPD", vitN++, critical));
      }
    }
    admissions.push(admission);
    admN++;
    return admission;
  };

  /* Pass 1: showcase + neonates (reserved first so they always get beds) */
  const erQueue: PatientSeed[] = [];
  const opd: PatientSeed[] = [];
  for (const seed of seeds) {
    const spec = seed.showcase;
    const { profile } = seed;
    if (spec?.placement === "admit") {
      const hoursIn = spec.profile === "stemi" ? 58 : spec.profile === "sepsis" ? 70 : spec.profile === "dengue" ? 30 : spec.profile === "pneumonia" ? 40 : spec.profile === "ckd" ? 20 : rng.int(20, 90);
      placeAdmission(seed, { current: true, admittedAt: subHours(NOW, hoursIn), los: rng.int(profile.admission!.los[0], profile.admission!.los[1]) + 1, trajectory: spec.trajectory ?? "steady" });
    } else if (spec?.placement === "surgery-today") {
      placeAdmission(seed, { current: true, admittedAt: subHours(NOW, rng.int(14, 18)), los: 5, trajectory: "steady", forcedWard: "WRD-PVT" });
    } else if (spec?.placement === "er") {
      erQueue.push(seed);
    } else if (profile.key === "neonate") {
      placeAdmission(seed, { current: true, admittedAt: subHours(NOW, rng.int(30, 180)), los: rng.int(6, 12), trajectory: rng.chance(0.7) ? "improving" : "steady" });
    } else if (!spec) {
      opd.push(seed);
    }
  }

  /* Pass 2: remaining patients roll for admissions (current and past) */
  for (const seed of opd) {
    const { profile, patient: p } = seed;
    const adm = profile.admission;
    if (adm && rng.chance(Math.min(1, adm.probability * 2.3))) {
      const current = rng.chance(0.84);
      const los = rng.int(adm.los[0], adm.los[1]);
      if (current) {
        const trajectory: Trajectory = adm.acuity === "Critical" ? rng.weighted([["improving", 5], ["steady", 3], ["deteriorating", 1]]) : rng.weighted([["improving", 6], ["steady", 3], ["deteriorating", 1]]);
        const admittedAt = subHours(NOW, rng.float(3, Math.max(8, los * 24 - 6), 0));
        const placed = placeAdmission(seed, { current: true, admittedAt, los, trajectory });
        if (!placed) placeAdmission(seed, { current: false, admittedAt: subDays(NOW, rng.int(los + 2, 40)), los, trajectory: "improving" });
      } else {
        placeAdmission(seed, { current: false, admittedAt: subDays(NOW, rng.int(los + 2, 40)), los, trajectory: "improving" });
        p.status = "Discharged";
      }
    }
    // Earlier admissions for chronic disease (drives readmission risk)
    if (["ckd", "hf", "copd", "cirrhosis", "t2dm-htn", "cad"].includes(profile.key) && adm && rng.chance(0.3)) {
      placeAdmission(seed, { current: false, admittedAt: subDays(NOW, rng.int(55, 320)), los: rng.int(adm.los[0], adm.los[1]), trajectory: "improving" });
    }
  }

  /* Remaining bed states */
  for (const b of beds) {
    if (b.status !== "Available" || b.wardId === "WRD-ER") continue;
    const r = rng.next();
    b.status = (r < 0.07 ? "Cleaning" : r < 0.11 ? "Reserved" : r < 0.125 ? "Maintenance" : "Available") as BedStatus;
    b.statusSince = iso(subMinutes(NOW, rng.int(15, b.status === "Maintenance" ? 2600 : 300)));
  }

  /* Emergency department */
  const erNurses = staff.filter((s) => s.wardId === "WRD-ER");
  const erDocs = doctors.filter((d) => d.departmentId === "DEP-EM");
  const erBeds = beds.filter((b) => b.wardId === "WRD-ER");
  const ER_COMPLAINT: Record<string, { complaint: string; symptoms: string[]; level: 1 | 2 | 3 | 4 | 5 }> = {
    trauma: { complaint: "Two-wheeler RTA, head injury with right leg deformity", symptoms: ["Head injury", "Leg deformity", "Vomiting once"], level: 2 },
    copd: { complaint: "Worsening breathlessness since last night, unable to speak full sentences", symptoms: ["Breathlessness", "Wheeze", "Cough with sputum"], level: 2 },
    asthma: { complaint: "Acute wheeze not relieved by inhaler", symptoms: ["Wheeze", "Chest tightness", "Breathlessness"], level: 3 },
    dengue: { complaint: "Fever for 5 days with abdominal pain and vomiting", symptoms: ["Fever", "Abdominal pain", "Vomiting", "Myalgia"], level: 3 },
    "renal-stone": { complaint: "Severe colicky right flank pain", symptoms: ["Flank pain", "Vomiting", "Haematuria"], level: 3 },
    appendicitis: { complaint: "Right lower abdominal pain with fever", symptoms: ["Abdominal pain", "Fever", "Anorexia"], level: 3 },
    "paeds-fever": { complaint: "High fever with one episode of febrile convulsion", symptoms: ["Fever", "Seizure"], level: 2 },
    migraine: { complaint: "Severe headache with vomiting", symptoms: ["Headache", "Photophobia", "Vomiting"], level: 4 },
    "t2dm-htn": { complaint: "Giddiness and sweating, GRBS 54 at home", symptoms: ["Sweating", "Giddiness", "Palpitations"], level: 2 },
    "back-pain": { complaint: "Acute low back pain after lifting", symptoms: ["Back pain"], level: 4 },
    uti: { complaint: "Fever with burning micturition", symptoms: ["Fever", "Dysuria"], level: 4 },
    vertigo: { complaint: "Sudden room-spinning giddiness with vomiting", symptoms: ["Vertigo", "Vomiting"], level: 4 },
    healthy: { complaint: "Dog bite on right calf", symptoms: ["Animal bite", "Wound"], level: 4 },
    anaemia: { complaint: "Fainting episode at work", symptoms: ["Syncope", "Fatigue"], level: 3 },
    gerd: { complaint: "Burning chest pain after dinner", symptoms: ["Chest pain", "Acidity"], level: 3 },
    "paeds-fever-2": { complaint: "Cut injury on forehead after fall", symptoms: ["Laceration"], level: 5 },
  };
  const erCandidates = opd.filter((s) => s.patient.status === "OPD" && ER_COMPLAINT[s.profile.key]);
  const activeEr = [...erQueue, ...rng.sample(erCandidates, 9)];
  const statuses: ErCase["status"][] = ["Under treatment", "Under treatment", "Under treatment", "Waiting", "In triage", "Observation", "Under treatment", "Waiting", "Observation", "Under treatment", "Waiting", "In triage"];
  let erBedIdx = 0;
  activeEr.forEach((seed, i) => {
    const cfg = ER_COMPLAINT[seed.profile.key] ?? ER_COMPLAINT.healthy;
    const status = seed.showcase?.profile === "trauma" ? "Under treatment" : seed.showcase?.profile === "copd" ? "Under treatment" : seed.showcase?.profile === "asthma" ? "Waiting" : statuses[i % statuses.length];
    const needsBed = status === "Under treatment" || status === "Observation";
    const bed = needsBed && erBedIdx < erBeds.length ? erBeds[erBedIdx++] : undefined;
    const arrived = subMinutes(NOW, status === "Waiting" ? rng.int(4, 28) : status === "In triage" ? rng.int(3, 12) : rng.int(35, 320));
    const triaged = status !== "Waiting";
    const erCase: ErCase = {
      id: idOf("ER", erN),
      caseNo: `ER/26/${String(8800 + erN * 2).padStart(5, "0")}`,
      patientId: seed.patient.id,
      arrivedAt: iso(arrived),
      arrivalMode: seed.profile.key === "trauma" ? "Ambulance (108)" : cfg.level <= 2 ? rng.pick(["Ambulance (108)", "Private ambulance", "Walk-in"] as const) : rng.pick(["Walk-in", "Walk-in", "Referral"] as const),
      chiefComplaint: cfg.complaint,
      symptoms: cfg.symptoms,
      triageLevel: triaged ? cfg.level : undefined,
      triagedAt: triaged ? iso(addMinutes(arrived, rng.int(2, 8))) : undefined,
      triagedBy: triaged && erNurses.length ? rng.pick(erNurses).name : undefined,
      status,
      bedId: bed?.id,
      doctorId: needsBed ? rng.pick(erDocs).id : undefined,
      vitals: makeVitals(rng, seed.patient, seed.profile, 1, addMinutes(arrived, 4), erNurses.length ? rng.pick(erNurses).name : "ER Nurse", "ER", vitN++, false),
      mlc: seed.profile.key === "trauma" || (seed.profile.key === "healthy" && cfg.complaint.includes("bite")),
      notes: needsBed ? "Initial assessment done. Investigations sent." : "",
    };
    if (seed.profile.key === "t2dm-htn") erCase.vitals!.grbs = 54;
    vitals.push(erCase.vitals!);
    if (bed) {
      bed.status = "Occupied";
      bed.patientId = seed.patient.id;
      bed.statusSince = erCase.arrivedAt;
    }
    seed.patient.status = "In ER";
    if (erCase.mlc && !seed.patient.flags.includes("MLC")) seed.patient.flags.push("MLC");
    erCases.push(erCase);
    erN++;
  });
  for (const b of erBeds) if (b.status === "Available" && rng.chance(0.3)) b.status = "Cleaning";

  /* Closed ER cases: emergency admissions of the last 10 days came through the ER */
  for (const a of admissions) {
    const at = new Date(a.admittedAt);
    if (a.admissionType !== "Emergency" || NOW.getTime() - at.getTime() > 10 * 86400000) continue;
    const seed = seeds.find((s) => s.patient.id === a.patientId)!;
    const arrived = subMinutes(at, rng.int(60, 200));
    erCases.push({
      id: idOf("ER", erN),
      caseNo: `ER/26/${String(8800 + erN * 2).padStart(5, "0")}`,
      patientId: a.patientId,
      arrivedAt: iso(arrived),
      arrivalMode: a.acuity === "Critical" ? "Ambulance (108)" : "Walk-in",
      chiefComplaint: seed.profile.complaint[0],
      symptoms: [],
      triageLevel: a.acuity === "Critical" ? 1 : a.acuity === "Serious" ? 2 : 3,
      triagedAt: iso(addMinutes(arrived, 4)),
      triagedBy: erNurses.length ? rng.pick(erNurses).name : undefined,
      status: "Admitted",
      doctorId: rng.pick(erDocs).id,
      mlc: seed.profile.key === "trauma" || seed.profile.key === "op-poisoning",
      notes: `Stabilised and shifted to ${wards.find((w) => w.id === a.wardId)?.name}.`,
      disposition: `Admitted under ${doctors.find((d) => d.id === a.admittingDoctorId)?.name}`,
    });
    erN++;
  }
  // Discharged-from-ER cases over the last week
  const walkins = rng.sample(opd.filter((s) => s.patient.status === "OPD"), 22);
  for (const seed of walkins) {
    const cfg = ER_COMPLAINT[seed.profile.key] ?? ER_COMPLAINT.healthy;
    const arrived = subHours(NOW, rng.int(8, 7 * 24));
    erCases.push({
      id: idOf("ER", erN),
      caseNo: `ER/26/${String(8800 + erN * 2).padStart(5, "0")}`,
      patientId: seed.patient.id,
      arrivedAt: iso(arrived),
      arrivalMode: "Walk-in",
      chiefComplaint: cfg.complaint,
      symptoms: cfg.symptoms,
      triageLevel: Math.max(3, cfg.level) as ErCase["triageLevel"],
      triagedAt: iso(addMinutes(arrived, 6)),
      status: rng.chance(0.9) ? "Discharged" : "Referred out",
      doctorId: rng.pick(erDocs).id,
      mlc: cfg.complaint.includes("bite"),
      notes: "Symptomatic treatment given. Review in OPD.",
      disposition: "Discharged with advice",
    });
    erN++;
  }

  return { admissions, erCases, vitals, trajectoryOf };
}
