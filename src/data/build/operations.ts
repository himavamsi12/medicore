import { addDays, addHours, addMinutes, format, setHours, setMinutes, subDays, subHours, subMinutes } from "date-fns";
import type {
  Admission,
  AttendanceRecord,
  BloodComponent,
  BloodGroup,
  BloodRequest,
  BloodUnit,
  ChecklistItem,
  ChecklistPhase,
  Doctor,
  HandoverNote,
  InventoryCategory,
  InventoryItem,
  PurchaseOrder,
  RosterEntry,
  RosterShift,
  Shift,
  Staff,
  Surgery,
  SurgeryStatus,
  Vendor,
  Ward,
} from "@/types";
import { NOW, TODAY, day, iso } from "../seed/clock";
import { Rng } from "../seed/random";
import type { PatientSeed } from "./people";
import { idOf, type Trajectory } from "./types";

/* ---------------- Operation theatre ---------------- */

const CHECKLIST: [ChecklistPhase, string][] = [
  ["Sign in", "Patient identity, site, procedure and consent confirmed"],
  ["Sign in", "Surgical site marked"],
  ["Sign in", "Anaesthesia machine and medication check complete"],
  ["Sign in", "Pulse oximeter on patient and functioning"],
  ["Sign in", "Known allergies reviewed"],
  ["Sign in", "Difficult airway / aspiration risk assessed"],
  ["Sign in", "Risk of >500 ml blood loss assessed, blood arranged"],
  ["Time out", "All team members introduced by name and role"],
  ["Time out", "Patient, site and procedure confirmed aloud"],
  ["Time out", "Antibiotic prophylaxis given within last 60 minutes"],
  ["Time out", "Essential imaging displayed"],
  ["Time out", "Anticipated critical events reviewed"],
  ["Sign out", "Procedure name recorded"],
  ["Sign out", "Instrument, sponge and needle counts correct"],
  ["Sign out", "Specimen labelled"],
  ["Sign out", "Equipment problems addressed"],
  ["Sign out", "Recovery and post-op concerns handed over"],
];

function checklistFor(status: SurgeryStatus, start: Date, rng: Rng, by: string): ChecklistItem[] {
  const donePhases: ChecklistPhase[] =
    status === "Completed" || status === "Recovery" ? ["Sign in", "Time out", "Sign out"] :
    status === "In progress" ? ["Sign in", "Time out"] :
    status === "Pre-op" ? ["Sign in"] : [];
  return CHECKLIST.map(([phase, label], i) => {
    const partialPreop = status === "Pre-op" && phase === "Sign in" && i >= 5 && rng.chance(0.6);
    const done = donePhases.includes(phase) && !partialPreop;
    return {
      id: `CHK-${i + 1}`,
      phase,
      label,
      done,
      doneBy: done ? by : undefined,
      doneAt: done ? iso(addMinutes(start, phase === "Sign in" ? -20 : phase === "Time out" ? -2 : 60)) : undefined,
    };
  });
}

const PROC_BY_PROFILE: Record<string, { procedure: string; ot: string; minutes: number; anaesthesia: Surgery["anaesthesia"]; dept: string; blood: number; implants?: string }> = {
  "oa-knee": { procedure: "Right total knee replacement", ot: "OT-3", minutes: 150, anaesthesia: "Spinal", dept: "DEP-ORT", blood: 2, implants: "Cemented posterior-stabilised knee system (NPPA capped)" },
  fracture: { procedure: "Proximal femoral nail fixation (right)", ot: "OT-3", minutes: 110, anaesthesia: "Spinal", dept: "DEP-ORT", blood: 2, implants: "PFN 240 mm, 10 mm" },
  trauma: { procedure: "Intramedullary nailing right tibia", ot: "OT-3", minutes: 120, anaesthesia: "Spinal", dept: "DEP-ORT", blood: 1, implants: "Tibial interlocking nail 9 x 330 mm" },
  cholelithiasis: { procedure: "Laparoscopic cholecystectomy", ot: "OT-1", minutes: 75, anaesthesia: "GA", dept: "DEP-GS", blood: 0 },
  appendicitis: { procedure: "Laparoscopic appendicectomy", ot: "OT-2", minutes: 60, anaesthesia: "GA", dept: "DEP-GS", blood: 0 },
  hernia: { procedure: "Laparoscopic TEP hernia repair (right)", ot: "OT-1", minutes: 80, anaesthesia: "GA", dept: "DEP-GS", blood: 0, implants: "Polypropylene mesh 15 x 15 cm" },
  "renal-stone": { procedure: "URSL with DJ stenting (right)", ot: "OT-2", minutes: 55, anaesthesia: "Spinal", dept: "DEP-URO", blood: 0, implants: "DJ stent 5 Fr x 26 cm" },
  sinusitis: { procedure: "Functional endoscopic sinus surgery", ot: "OT-6", minutes: 90, anaesthesia: "GA", dept: "DEP-ENT", blood: 0 },
  pregnancy: { procedure: "Lower segment caesarean section", ot: "OT-5", minutes: 60, anaesthesia: "Spinal", dept: "DEP-OBG", blood: 1 },
  preeclampsia: { procedure: "Emergency LSCS", ot: "OT-5", minutes: 60, anaesthesia: "Spinal", dept: "DEP-OBG", blood: 2 },
  cad: { procedure: "Coronary angiography with PTCA", ot: "OT-4", minutes: 70, anaesthesia: "Local", dept: "DEP-CAR", blood: 0, implants: "Drug-eluting stent 3.0 x 28 mm" },
  stemi: { procedure: "Primary PCI to LAD", ot: "OT-4", minutes: 65, anaesthesia: "Local", dept: "DEP-CAR", blood: 0, implants: "Drug-eluting stent 3.5 x 32 mm" },
  "ca-breast": { procedure: "Chemoport insertion", ot: "OT-6", minutes: 40, anaesthesia: "Local", dept: "DEP-ONC", blood: 0, implants: "Chemoport 8 Fr" },
  ckd: { procedure: "Left radiocephalic AV fistula creation", ot: "OT-6", minutes: 70, anaesthesia: "Regional block", dept: "DEP-NEP", blood: 0 },
};

export function buildSurgeries(seeds: PatientSeed[], admissions: Admission[], doctors: Doctor[], staff: Staff[]): Surgery[] {
  const rng = new Rng("ot");
  const out: Surgery[] = [];
  let n = 1;
  const anaes = doctors.filter((d) => d.departmentId === "DEP-ANA");
  const otNurses = staff.filter((s) => s.category === "Nurse" && s.departmentId === "DEP-ANA");
  const seedOf = new Map(seeds.map((s) => [s.patient.id, s]));
  const otBusyUntil = new Map<string, Date>();

  const statusFor = (start: Date, minutes: number): SurgeryStatus => {
    const end = addMinutes(start, minutes);
    if (NOW >= addMinutes(end, 90)) return "Completed";
    if (NOW >= end) return "Recovery";
    if (NOW >= start) return "In progress";
    if (NOW >= subMinutes(start, 60)) return "Pre-op";
    return "Scheduled";
  };

  const make = (patientId: string, key: string, start: Date, admissionId?: string, forced?: SurgeryStatus, priority: Surgery["priority"] = "Elective") => {
    const spec = PROC_BY_PROFILE[key];
    if (!spec) return;
    const surgeons = doctors.filter((d) => d.departmentId === spec.dept);
    const surgeon = surgeons[0] && rng.chance(0.6) ? surgeons[0] : rng.pick(surgeons);
    const assistants = surgeons.filter((d) => d.id !== surgeon.id).slice(0, 1).map((d) => d.id);
    const status = forced ?? statusFor(start, spec.minutes);
    const scrub = otNurses.length ? rng.pick(otNurses) : staff[0];
    const s: Surgery = {
      id: idOf("SUR", n, 4),
      caseNo: `OT/${format(start, "yyMMdd")}/${String(n).padStart(3, "0")}`,
      patientId,
      admissionId,
      procedure: spec.procedure,
      departmentId: spec.dept,
      otId: spec.ot,
      surgeonId: surgeon.id,
      assistantIds: assistants,
      anaesthetistId: rng.pick(anaes).id,
      scrubNurseId: scrub.id,
      anaesthesia: spec.anaesthesia,
      scheduledStart: iso(start),
      durationMin: spec.minutes,
      actualStart: ["In progress", "Recovery", "Completed"].includes(status) ? iso(addMinutes(start, rng.int(-5, 20))) : undefined,
      actualEnd: ["Recovery", "Completed"].includes(status) ? iso(addMinutes(start, spec.minutes + rng.int(-10, 30))) : undefined,
      priority,
      status,
      checklist: checklistFor(status, start, rng, scrub.name),
      consentSigned: status !== "Scheduled" || rng.chance(0.7),
      bloodUnitsReserved: spec.blood,
      implants: spec.implants,
      notes: status === "Completed" ? "Procedure uneventful. Shifted to recovery in stable condition." : undefined,
    };
    out.push(s);
    n++;
    return s;
  };

  // Procedures for admitted patients
  for (const a of admissions) {
    const seed = seedOf.get(a.patientId)!;
    const key = seed.profile.key;
    if (!PROC_BY_PROFILE[key] || !seed.profile.admission?.procedure) continue;
    const admitted = new Date(a.admittedAt);
    if (key === "stemi" || key === "preeclampsia") {
      make(a.patientId, key, addMinutes(admitted, key === "stemi" ? 55 : 180), a.id, undefined, "Emergency");
      continue;
    }
    if (a.dischargedAt) {
      make(a.patientId, key, addHours(admitted, rng.int(16, 26)), a.id, "Completed");
      continue;
    }
    if (seed.showcase?.placement === "surgery-today") {
      const start = setMinutes(setHours(NOW, NOW.getHours()), 0);
      make(a.patientId, key, addMinutes(start, 60), a.id, "Pre-op");
      continue;
    }
    const emergency = ["appendicitis", "trauma", "fracture"].includes(key);
    let start = addHours(admitted, emergency ? rng.int(3, 10) : rng.int(16, 28));
    start = setMinutes(start, Math.round(start.getMinutes() / 15) * 15);
    const otKey = `${PROC_BY_PROFILE[key].ot}|${day(start)}`;
    const busy = otBusyUntil.get(otKey);
    if (busy && start < busy) start = addMinutes(busy, 30);
    otBusyUntil.set(otKey, addMinutes(start, PROC_BY_PROFILE[key].minutes + 20));
    make(a.patientId, key, start, a.id, undefined, emergency ? "Emergency" : "Elective");
  }

  // Showcase: lap chole tomorrow 09:00 in OT-1
  const nandini = seeds.find((s) => s.showcase?.placement === "surgery-tomorrow");
  if (nandini) make(nandini.patient.id, nandini.profile.key, setMinutes(setHours(addDays(TODAY, 1), 9), 0), undefined, "Scheduled");

  // Elective list for the coming week and a full list for today
  const electiveKeys = ["oa-knee", "cholelithiasis", "hernia", "sinusitis", "renal-stone", "pregnancy", "cad"];
  const candidates = seeds.filter((s) => electiveKeys.includes(s.profile.key) && s.patient.status === "OPD" && !s.showcase);
  const picks = rng.sample(candidates, 26);
  picks.forEach((seed, i) => {
    const offset = i < 9 ? 0 : i < 13 ? -rng.int(1, 6) : rng.int(1, 6);
    const ot = PROC_BY_PROFILE[seed.profile.key].ot;
    const base = setMinutes(setHours(addDays(TODAY, offset), 8), 0);
    const key = `${ot}|${day(base)}`;
    const busy = otBusyUntil.get(key);
    const start = busy && busy > base ? addMinutes(busy, rng.pick([0, 15, 30])) : addMinutes(base, rng.pick([0, 15, 30]));
    otBusyUntil.set(key, addMinutes(start, PROC_BY_PROFILE[seed.profile.key].minutes + 20));
    const forced: SurgeryStatus | undefined = offset < 0 ? "Completed" : offset > 0 ? (rng.chance(0.06) ? "Postponed" : "Scheduled") : undefined;
    make(seed.patient.id, seed.profile.key, start, undefined, forced === undefined && rng.chance(0.04) ? "Cancelled" : forced);
  });

  return out.sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
}

/* ---------------- Nursing handover ---------------- */

export function currentShift(d: Date = NOW): Shift {
  const h = d.getHours();
  if (h >= 7 && h < 14) return "Morning";
  if (h >= 14 && h < 21) return "Evening";
  return "Night";
}

export function buildHandovers(admissions: Admission[], wards: Ward[], staff: Staff[], seeds: PatientSeed[], trajectoryOf: Record<string, Trajectory>): HandoverNote[] {
  const rng = new Rng("handover");
  const out: HandoverNote[] = [];
  let n = 1;
  const seedOf = new Map(seeds.map((s) => [s.patient.id, s]));
  const shifts: Shift[] = ["Morning", "Evening", "Night"];
  const cur = currentShift();
  const prevShift = shifts[(shifts.indexOf(cur) + 2) % 3];
  const prevDate = cur === "Morning" ? subDays(TODAY, 1) : TODAY;

  for (const w of wards) {
    if (w.type === "ER") continue;
    const nurses = staff.filter((s) => s.category === "Nurse" && s.wardId === w.id);
    if (!nurses.length) continue;
    const active = admissions.filter((a) => !a.dischargedAt && a.wardId === w.id);
    const focus = active
      .filter((a) => a.acuity !== "Stable" || trajectoryOf[a.id] === "deteriorating")
      .concat(rng.sample(active.filter((a) => a.acuity === "Stable"), 1))
      .slice(0, 4);
    for (const a of focus) {
      const seed = seedOf.get(a.patientId)!;
      const det = trajectoryOf[a.id] === "deteriorating";
      out.push({
        id: idOf("HND", n, 4),
        wardId: w.id,
        date: day(prevDate),
        shift: prevShift,
        fromStaffId: rng.pick(nurses).id,
        toStaffId: undefined,
        patientId: a.patientId,
        situation: det ? `${seed.patient.firstName} is showing a rising early warning score over the last 8 hours.` : `${seed.patient.firstName}, day ${Math.max(1, Math.ceil((NOW.getTime() - new Date(a.admittedAt).getTime()) / 86400000))} of admission for ${a.reason.toLowerCase()}.`,
        background: `${seed.profile.conditions.map(([, name]) => name).join(", ")}. ${seed.patient.allergies.length ? `Allergic to ${seed.patient.allergies.map((x) => x.substance).join(", ")}.` : "No known allergies."}`,
        assessment: det
          ? rng.pick(["RR up to 24, SpO₂ 92% on 2 L O₂, febrile. Urine output borderline.", "Tachycardic 110-118/min, BP trending down, cold peripheries.", "Increasing oxygen requirement, crackles on auscultation."])
          : rng.pick(["Vitals stable through the shift. Pain controlled.", "Afebrile, tolerating oral diet. IV line patent.", "Mobilised to chair with assistance. Sleeping well."]),
        recommendation: det
          ? "Hourly vitals. Doctor informed, repeat labs sent. Escalate to RRT if NEWS2 reaches 7."
          : rng.pick(["Continue 4-hourly vitals and current plan.", "Plan for discharge tomorrow, counsel family.", "Review drain output at 06:00, dressing due."]),
        createdAt: iso(subMinutes(NOW, rng.int(20, 240))),
        acknowledged: rng.chance(0.55),
      });
      n++;
    }
  }
  return out;
}

/* ---------------- Blood bank ---------------- */

const GROUP_WEIGHTS: [BloodGroup, number][] = [["O+", 34], ["B+", 31], ["A+", 22], ["AB+", 7], ["A-", 2], ["B-", 2], ["O-", 1.2], ["AB-", 0.8]];
const COMPONENT_WEIGHTS: [BloodComponent, number][] = [["PRBC", 55], ["FFP", 20], ["Platelets (RDP)", 12], ["Platelets (SDP)", 3], ["Cryoprecipitate", 5], ["Whole blood", 5]];
const SHELF_DAYS: Record<BloodComponent, number> = { PRBC: 42, FFP: 365, "Platelets (RDP)": 5, "Platelets (SDP)": 5, Cryoprecipitate: 365, "Whole blood": 35 };
const VOLUME: Record<BloodComponent, number> = { PRBC: 280, FFP: 200, "Platelets (RDP)": 60, "Platelets (SDP)": 250, Cryoprecipitate: 20, "Whole blood": 350 };

export function buildBlood(seeds: PatientSeed[], admissions: Admission[]): { units: BloodUnit[]; requests: BloodRequest[] } {
  const rng = new Rng("blood");
  const units: BloodUnit[] = [];
  let n = 1;
  for (let i = 0; i < 232; i++) {
    let group = rng.weighted(GROUP_WEIGHTS);
    const component = rng.weighted(COMPONENT_WEIGHTS);
    if (component === "PRBC" && (group === "O-" || group === "AB-") && units.filter((u) => u.group === group && u.component === "PRBC").length >= (group === "O-" ? 2 : 0)) group = "O+";
    const shelf = SHELF_DAYS[component];
    const age = rng.int(0, Math.max(1, shelf - 1));
    const collected = subDays(TODAY, age);
    const expires = addDays(collected, shelf);
    const r = rng.next();
    const status: BloodUnit["status"] = age === 0 && r < 0.6 ? "Quarantine" : expires < TODAY ? "Expired" : r < 0.08 ? "Issued" : r < 0.13 ? "Reserved" : "Available";
    units.push({
      id: idOf("BU", n, 4),
      unitNo: `MC${format(collected, "yy")}${String(14000 + n * 3).padStart(6, "0")}`,
      group,
      component,
      volumeMl: VOLUME[component] + rng.int(-15, 20),
      collectedAt: day(collected),
      expiresAt: day(expires),
      status,
      source: rng.weighted([["Voluntary donor", 60], ["Replacement donor", 25], ["Camp", 15]]),
    });
    n++;
  }

  const seedOf = new Map(seeds.map((s) => [s.patient.id, s]));
  const need: Record<string, [BloodComponent, number, string]> = {
    dengue: ["Platelets (SDP)", 1, "Platelet count below 20,000/µL with mucosal bleed"],
    trauma: ["PRBC", 2, "Haemorrhage following polytrauma"],
    fracture: ["PRBC", 2, "Pre-operative, Hb 9.6 g/dL for PFN"],
    cirrhosis: ["FFP", 4, "Coagulopathy with active upper GI bleed, INR 2.1"],
    ckd: ["PRBC", 1, "Symptomatic anaemia, Hb 7.9 g/dL"],
    "oa-knee": ["PRBC", 2, "Cross-match and reserve for TKR"],
    preeclampsia: ["PRBC", 2, "Reserve for LSCS"],
    sepsis: ["Platelets (RDP)", 4, "Thrombocytopenia in septic shock"],
    "ca-breast": ["PRBC", 1, "Chemotherapy-induced anaemia"],
  };
  const requests: BloodRequest[] = [];
  let r = 1;
  for (const a of admissions) {
    if (a.dischargedAt) continue;
    const seed = seedOf.get(a.patientId)!;
    const cfg = need[seed.profile.key];
    if (!cfg || !rng.chance(seed.showcase ? 1 : 0.65)) continue;
    const [component, count, indication] = cfg;
    const requestedAt = subMinutes(NOW, rng.int(15, 60 * 18));
    const status: BloodRequest["status"] = rng.weighted([["Pending", 25], ["Cross-matching", 25], ["Ready", 20], ["Issued", 30]]);
    const matching = units.filter((u) => u.group === seed.patient.bloodGroup && u.component === component && u.status === "Available").slice(0, count);
    if (status === "Ready" || status === "Issued") for (const u of matching) { u.status = status === "Ready" ? "Reserved" : "Issued"; u.reservedFor = idOf("BRQ", r, 4); }
    requests.push({
      id: idOf("BRQ", r, 4),
      requestNo: `BR/${format(requestedAt, "yyMMdd")}/${String(r).padStart(3, "0")}`,
      patientId: a.patientId,
      group: seed.patient.bloodGroup,
      component,
      units: count,
      priority: seed.profile.key === "trauma" || seed.profile.key === "cirrhosis" ? "STAT" : seed.profile.key === "oa-knee" || seed.profile.key === "preeclampsia" ? "Routine" : "Urgent",
      indication,
      requestedById: a.admittingDoctorId,
      requestedAt: iso(requestedAt),
      requiredBy: iso(addHours(requestedAt, seed.profile.key === "trauma" ? 1 : 6)),
      status,
      unitIds: status === "Ready" || status === "Issued" ? matching.map((u) => u.id) : [],
      location: a.wardId.replace("WRD-", ""),
    });
    r++;
  }
  return { units, requests };
}

/* ---------------- Inventory & procurement ---------------- */

type ItemRow = [name: string, category: InventoryCategory, unit: string, cost: number, gst: 5 | 12 | 18, daily: number, vendorIdx: number];

const ITEMS: ItemRow[] = [
  ["Disposable syringe 5 ml", "Consumables", "piece", 4.2, 12, 620, 3],
  ["Disposable syringe 10 ml", "Consumables", "piece", 5.8, 12, 380, 3],
  ["Insulin syringe 1 ml", "Consumables", "piece", 6.5, 12, 140, 3],
  ["IV cannula 20G", "Consumables", "piece", 22, 12, 160, 6],
  ["IV cannula 22G", "Consumables", "piece", 22, 12, 120, 6],
  ["IV cannula 18G", "Consumables", "piece", 24, 12, 60, 6],
  ["IV infusion set", "Consumables", "piece", 18, 12, 240, 4],
  ["Three-way stopcock", "Consumables", "piece", 14, 12, 110, 6],
  ["Examination gloves (nitrile, M)", "Consumables", "box of 100", 420, 12, 22, 1],
  ["Surgical gloves 7.0 (sterile)", "Surgical", "pair", 38, 12, 90, 1],
  ["Surgical gloves 7.5 (sterile)", "Surgical", "pair", 38, 12, 80, 1],
  ["Face mask 3-ply", "Consumables", "piece", 2.4, 12, 900, 1],
  ["N95 respirator", "Consumables", "piece", 48, 12, 60, 1],
  ["Surgical gown (sterile, disposable)", "Surgical", "piece", 185, 12, 40, 1],
  ["Foley catheter 16 Fr", "Consumables", "piece", 68, 12, 24, 4],
  ["Urine bag 2 L", "Consumables", "piece", 32, 12, 30, 4],
  ["Ryle's tube 16 Fr", "Consumables", "piece", 26, 12, 12, 4],
  ["Suction catheter 14 Fr", "Consumables", "piece", 16, 12, 70, 4],
  ["Endotracheal tube 7.5", "Surgical", "piece", 145, 12, 6, 4],
  ["Oxygen mask with reservoir", "Consumables", "piece", 110, 12, 14, 6],
  ["Nasal prongs (adult)", "Consumables", "piece", 42, 12, 26, 6],
  ["Gauze swab 10 x 10 cm", "Consumables", "pack of 100", 160, 12, 30, 0],
  ["Absorbent cotton roll 500 g", "Consumables", "roll", 210, 12, 8, 0],
  ["Crepe bandage 10 cm", "Consumables", "piece", 58, 12, 20, 0],
  ["Micropore tape 1 inch", "Consumables", "roll", 44, 12, 60, 1],
  ["Transparent IV dressing", "Consumables", "piece", 28, 12, 110, 1],
  ["Povidone iodine 10% 500 ml", "Consumables", "bottle", 185, 12, 10, 0],
  ["Chlorhexidine 2% skin prep 500 ml", "Consumables", "bottle", 240, 18, 8, 0],
  ["Alcohol hand rub 500 ml", "Housekeeping", "bottle", 165, 18, 36, 9],
  ["Vicryl 2-0 suture", "Surgical", "foil", 320, 12, 12, 7],
  ["Prolene 3-0 suture", "Surgical", "foil", 290, 12, 8, 7],
  ["Ethilon 3-0 suture", "Surgical", "foil", 180, 12, 10, 7],
  ["Skin stapler 35W", "Surgical", "piece", 1450, 12, 1.2, 7],
  ["Laparoscopic trocar 10 mm (disposable)", "Surgical", "piece", 2800, 12, 1.5, 8],
  ["Hernia mesh 15 x 15 cm", "Implants", "piece", 4200, 5, 0.4, 8],
  ["DJ stent 5 Fr x 26 cm", "Implants", "piece", 1650, 5, 0.3, 8],
  ["Drug-eluting coronary stent", "Implants", "piece", 27500, 5, 0.5, 8],
  ["Total knee implant system", "Implants", "set", 58000, 5, 0.25, 8],
  ["PFN nail 240 mm", "Implants", "set", 16800, 5, 0.2, 8],
  ["Central venous catheter triple lumen", "Consumables", "kit", 1650, 12, 1.2, 6],
  ["Arterial line kit", "Consumables", "kit", 1320, 12, 0.8, 6],
  ["Haemodialysis dialyser F8", "Consumables", "piece", 980, 12, 6, 5],
  ["Blood tubing set (HD)", "Consumables", "piece", 420, 12, 6, 5],
  ["ECG electrodes (adult)", "Consumables", "pack of 50", 280, 12, 9, 5],
  ["ECG paper roll 80 mm", "Stationery", "roll", 95, 12, 4, 5],
  ["EDTA vacutainer (lavender)", "Reagents", "piece", 7.5, 12, 260, 5],
  ["Serum vacutainer (red)", "Reagents", "piece", 7.8, 12, 300, 5],
  ["Citrate vacutainer (blue)", "Reagents", "piece", 9.2, 12, 60, 5],
  ["Fluoride vacutainer (grey)", "Reagents", "piece", 7.2, 12, 90, 5],
  ["Blood culture bottle (aerobic)", "Reagents", "piece", 360, 12, 14, 5],
  ["CBC reagent pack (5-part)", "Reagents", "kit", 18500, 12, 0.12, 5],
  ["Biochemistry reagent (creatinine)", "Reagents", "kit", 3400, 12, 0.3, 5],
  ["Troponin I cartridge", "Reagents", "box of 25", 21000, 12, 0.3, 5],
  ["Dengue NS1 rapid kit", "Reagents", "box of 25", 4600, 12, 0.5, 5],
  ["Urine container (sterile)", "Consumables", "piece", 6, 12, 130, 0],
  ["Bed sheet (white)", "Linen", "piece", 260, 5, 10, 2],
  ["Patient gown", "Linen", "piece", 310, 5, 8, 2],
  ["Pillow cover", "Linen", "piece", 85, 5, 6, 2],
  ["Blanket (cotton)", "Linen", "piece", 540, 5, 2, 2],
  ["Surface disinfectant 5 L", "Housekeeping", "can", 1450, 18, 1.4, 9],
  ["Biomedical waste bag (yellow)", "Housekeeping", "pack of 50", 380, 18, 3, 9],
  ["Biomedical waste bag (red)", "Housekeeping", "pack of 50", 380, 18, 2.4, 9],
  ["Sharps container 5 L", "Housekeeping", "piece", 210, 18, 5, 9],
  ["Tissue roll", "Housekeeping", "roll", 32, 18, 40, 9],
  ["Pulse oximeter probe (reusable)", "Equipment spares", "piece", 3200, 18, 0.2, 5],
  ["NIBP cuff (adult)", "Equipment spares", "piece", 1850, 18, 0.2, 5],
  ["Ventilator breathing circuit", "Equipment spares", "piece", 780, 12, 1.6, 6],
  ["HME filter", "Consumables", "piece", 145, 12, 12, 6],
  ["Infusion pump line", "Consumables", "piece", 310, 12, 18, 6],
  ["Case sheet folder", "Stationery", "piece", 18, 18, 30, 0],
  ["Thermal printer roll (billing)", "Stationery", "roll", 42, 18, 10, 0],
  ["Wristband (patient ID)", "Stationery", "piece", 9, 18, 45, 0],
];

export function buildInventory(vendors: Vendor[]): { items: InventoryItem[]; pos: PurchaseOrder[] } {
  const rng = new Rng("inventory");
  const stores = ["Central Store", "OT Store", "ICU Sub-store", "Lab Store", "Linen Room"];
  const items: InventoryItem[] = ITEMS.map(([name, category, unit, cost, gst, daily, vendorIdx], i) => {
    const reorderLevel = Math.max(2, Math.round(daily * (vendors[vendorIdx].leadTimeDays + 4)));
    const maxLevel = reorderLevel * 3;
    const r = rng.next();
    const stock = r < 0.05 ? 0 : r < 0.2 ? rng.int(Math.round(reorderLevel * 0.2), reorderLevel - 1) : rng.int(reorderLevel, maxLevel);
    return {
      id: idOf("ITM", i + 1, 4),
      sku: `${category.slice(0, 3).toUpperCase()}-${String(1000 + i * 7)}`,
      name,
      category,
      unit,
      stock,
      reorderLevel,
      maxLevel,
      store: category === "Surgical" || category === "Implants" ? "OT Store" : category === "Reagents" ? "Lab Store" : category === "Linen" ? "Linen Room" : rng.pick(stores.slice(0, 3)),
      vendorId: vendors[vendorIdx].id,
      unitCost: cost,
      gstRate: gst,
      avgDailyUsage: daily,
      lastReceivedAt: day(subDays(TODAY, rng.int(2, 45))),
    };
  });

  const pos: PurchaseOrder[] = [];
  const statuses: PurchaseOrder["status"][] = ["Received", "Received", "Received", "Partially received", "Sent", "Sent", "Approved", "Pending approval", "Pending approval", "Draft", "Cancelled"];
  for (let i = 0; i < 30; i++) {
    const vendor = rng.pick(vendors);
    const vendorItems = items.filter((it) => it.vendorId === vendor.id);
    if (!vendorItems.length) continue;
    const created = subHours(NOW, rng.int(4, 24 * 40));
    const status = i < 4 ? "Pending approval" : rng.pick(statuses);
    const lines = rng.sample(vendorItems, rng.int(1, Math.min(6, vendorItems.length))).map((it) => {
      const qty = Math.max(1, Math.round((it.maxLevel - it.reorderLevel) * rng.float(0.5, 1, 2)));
      return { itemId: it.id, qty, rate: it.unitCost, gstRate: it.gstRate, receivedQty: status === "Received" ? qty : status === "Partially received" ? Math.round(qty * rng.float(0.3, 0.7, 2)) : 0 };
    });
    pos.push({
      id: idOf("PO", i + 1, 4),
      poNo: `PO/26-27/${String(310 + i * 3).padStart(4, "0")}`,
      vendorId: vendor.id,
      createdAt: iso(created),
      expectedAt: day(addDays(created, vendor.leadTimeDays)),
      status,
      lines,
      createdBy: rng.pick(["Suresh Nair (Purchase)", "Deepa N (Stores)", "Anand Rao (Purchase)"]),
      approvedBy: ["Approved", "Sent", "Partially received", "Received"].includes(status) ? "Priya Menon (Operations Manager)" : undefined,
      approvedAt: ["Approved", "Sent", "Partially received", "Received"].includes(status) ? iso(addHours(created, rng.int(2, 20))) : undefined,
      notes: status === "Cancelled" ? "Vendor unable to supply within lead time" : undefined,
    });
  }
  return { items, pos: pos.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
}

/* ---------------- Roster & attendance ---------------- */

const NURSE_CYCLE: RosterShift[] = ["M", "M", "E", "E", "N", "N", "Off"];
const SHIFT_START: Record<string, number> = { M: 7, E: 14, N: 21, G: 9 };

export function buildRoster(staff: Staff[]): { roster: RosterEntry[]; attendance: AttendanceRecord[] } {
  const rng = new Rng("roster");
  const roster: RosterEntry[] = [];
  const attendance: AttendanceRecord[] = [];
  let a = 1;
  staff.forEach((s, idx) => {
    for (let d = -13; d <= 13; d++) {
      const date = addDays(TODAY, d);
      let shift: RosterShift;
      if (s.category === "Doctor") shift = date.getDay() === 0 ? "Off" : "G";
      else if (["Nurse", "Technician", "Security", "Housekeeping"].includes(s.category)) shift = NURSE_CYCLE[(idx + d + 70) % 7];
      else shift = date.getDay() === 0 ? "Off" : "G";
      if (s.status === "On leave" && d >= -2 && d <= 4) shift = "Leave";
      if (s.category !== "Doctor" || d > -14) roster.push({ staffId: s.id, date: day(date), shift });

      if (d > 0) continue;
      if (shift === "Off") {
        attendance.push({ id: idOf("ATT", a++, 6), staffId: s.id, date: day(date), status: "Week off" });
        continue;
      }
      if (shift === "Leave") {
        attendance.push({ id: idOf("ATT", a++, 6), staffId: s.id, date: day(date), status: "On leave" });
        continue;
      }
      const startH = SHIFT_START[shift] ?? 9;
      const start = setMinutes(setHours(date, startH), 0);
      if (d === 0 && start > NOW) continue;
      const status = rng.weighted([["Present", 88], ["Late", 6], ["Absent", 2.5], ["Half day", 1.5], ["On leave", 2]] as const);
      const inMin = status === "Late" ? rng.int(12, 48) : rng.int(-15, 6);
      const hours = shift === "N" ? 10 : shift === "G" ? 8 : 7;
      const out = addMinutes(start, hours * 60 + rng.int(-5, 40));
      attendance.push({
        id: idOf("ATT", a++, 6),
        staffId: s.id,
        date: day(date),
        status,
        checkIn: ["Present", "Late", "Half day"].includes(status) ? format(addMinutes(start, inMin), "HH:mm") : undefined,
        checkOut: ["Present", "Late", "Half day"].includes(status) && out < NOW ? format(status === "Half day" ? addMinutes(start, 240) : out, "HH:mm") : undefined,
      });
    }
  });
  return { roster, attendance };
}
