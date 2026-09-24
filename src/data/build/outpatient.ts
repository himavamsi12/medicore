import { addDays, addMinutes, parse, subMinutes } from "date-fns";
import type { Appointment, AppointmentStatus, Doctor, Vitals, Weekday } from "@/types";
import type { ClinicalProfile } from "../reference/profiles";
import { CLINIC_NOW, TODAY, day, iso } from "../seed/clock";
import { Rng } from "../seed/random";
import { makeVitals } from "./inpatient";
import type { PatientSeed } from "./people";
import { idOf } from "./types";

const WEEKDAYS: Weekday[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const EXAM: Record<string, string> = {
  "t2dm-htn": "Monofilament sensation reduced over both soles. Peripheral pulses felt.",
  ckd: "Bilateral pitting pedal oedema. Pallor present. Chest clear.",
  cad: "S1 S2 heard, no murmur. Chest clear.",
  hf: "Irregularly irregular pulse. JVP raised. Bibasal crepitations. Pedal oedema grade 2.",
  asthma: "Scattered bilateral wheeze. No accessory muscle use.",
  copd: "Barrel chest, prolonged expiration, bilateral rhonchi.",
  pneumonia: "Bronchial breath sounds right infra-axillary region.",
  dengue: "Flushed facies, petechiae on forearms, tourniquet test positive.",
  "oa-knee": "Bilateral knee crepitus, varus deformity right knee, ROM 10-100 degrees.",
  "back-pain": "SLR positive at 40 degrees on left. No motor deficit.",
  migraine: "Neurological examination normal. Fundus normal.",
  pregnancy: "Fundal height corresponds to 34 weeks. FHR 142/min, regular.",
  pcos: "Acanthosis nigricans over neck. BMI 29.",
  hypothyroid: "Dry skin, delayed relaxation of ankle jerks.",
  gerd: "Mild epigastric tenderness. No organomegaly.",
  sinusitis: "Deviated nasal septum to left, mucopurulent discharge in middle meatus.",
  "renal-stone": "Right renal angle tenderness.",
  psoriasis: "Well-demarcated erythematous plaques with silvery scales over elbows and knees.",
  "paeds-fever": "Congested pharynx. Chest clear. Well hydrated.",
  healthy: "General and systemic examination within normal limits.",
};

const PLAN_TAIL = ["Review with reports.", "Diet and lifestyle counselling done.", "Warning signs explained to patient and attendant.", "Continue home glucose monitoring."];

export function soapFor(rng: Rng, profile: ClinicalProfile, complaint: string, v?: Vitals) {
  const vit = v ? `BP ${v.bpSystolic}/${v.bpDiastolic} mmHg, pulse ${v.pulse}/min, SpO₂ ${v.spo2}% on room air, temp ${v.tempF} °F.` : "";
  return {
    subjective: `${complaint}. ${rng.pick(["Symptoms for 3 days.", "Ongoing for 2 weeks.", "Since last visit, partial improvement.", "Compliant with medication."])}`,
    objective: `${vit} ${EXAM[profile.key] ?? EXAM.healthy}`.trim(),
    assessment: profile.conditions.map(([, n]) => n).join("; ") || "No significant illness",
    plan: `${profile.meds.slice(0, 3).join(", ")}. ${profile.labPanel.length ? `Investigations: ${profile.labPanel.slice(0, 3).join(", ")}.` : ""} ${rng.pick(PLAN_TAIL)}`.trim(),
  };
}

function toMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function fmt(mins: number) {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

/** Guarantee a doctor has an OPD session covering the clinic clock today (for showcase bookings). */
function ensureTodaySession(doc: Doctor) {
  const wd = WEEKDAYS[TODAY.getDay()];
  const clinicMin = CLINIC_NOW.getHours() * 60 + CLINIC_NOW.getMinutes();
  const s = doc.sessions.find((x) => x.day === wd);
  const covering = (x: { start: string; end: string }) => toMinutes(x.start) <= clinicMin - 30 && toMinutes(x.end) >= clinicMin + 60;
  if (s && covering(s)) return;
  const start = Math.max(9 * 60, Math.floor((clinicMin - 90) / 60) * 60);
  const session = { day: wd, start: fmt(start), end: fmt(Math.min(20 * 60, start + 4 * 60)), room: doc.sessions[0]?.room ?? "OPD-1" };
  if (s) Object.assign(s, session);
  else doc.sessions.push(session);
}

export function buildAppointments(seeds: PatientSeed[], doctors: Doctor[], vitalsSink: Vitals[], vitalsStart: number): Appointment[] {
  const rng = new Rng("appointments");
  const appts: Appointment[] = [];
  let n = 1;
  let vitN = vitalsStart;
  const seen = new Set<string>();
  const clinicMin = CLINIC_NOW.getHours() * 60 + CLINIC_NOW.getMinutes();
  const today = day(TODAY);

  const byDept = new Map<string, PatientSeed[]>();
  for (const s of seeds) {
    const list = byDept.get(s.profile.departmentId) ?? [];
    list.push(s);
    byDept.set(s.profile.departmentId, list);
  }
  const outpatients = (list: PatientSeed[]) => list.filter((s) => s.patient.status === "OPD" || s.patient.status === "Discharged");

  const showcaseBookings: { seedIdx: number; doctorId: string; offsetMin: number; status: AppointmentStatus }[] = [];
  seeds.forEach((s, i) => {
    if (s.showcase?.placement !== "opd-today" && s.showcase?.placement !== "surgery-tomorrow") return;
    const doctorId = s.profile.key === "t2dm-htn" ? "DOC-001" : s.profile.key === "hf" ? "DOC-006" : s.profile.key === "pregnancy" ? "DOC-016" : "DOC-019";
    const status: AppointmentStatus = s.profile.key === "pregnancy" ? "Scheduled" : s.profile.key === "cholelithiasis" ? "Completed" : "Checked in";
    const offsetMin = s.profile.key === "t2dm-htn" ? 5 : s.profile.key === "hf" ? 10 : s.profile.key === "pregnancy" ? 75 : -80;
    showcaseBookings.push({ seedIdx: i, doctorId, offsetMin, status });
  });
  for (const b of showcaseBookings) ensureTodaySession(doctors.find((d) => d.id === b.doctorId)!);

  const makeAppt = (seed: PatientSeed, doc: Doctor, date: string, time: string, status: AppointmentStatus, token?: number): Appointment => {
    const key = `${seed.patient.id}`;
    const type = seen.has(key) ? (rng.chance(0.15) ? "Review" : "Follow-up") : "New";
    seen.add(key);
    const complaint = rng.pick(seed.profile.complaint);
    const slotDate = parse(`${date} ${time}`, "yyyy-MM-dd HH:mm", new Date());
    const hasVitals = status === "Completed" || status === "In consultation" || status === "Checked in";
    const vit = hasVitals ? makeVitals(rng, seed.patient, seed.profile, 0.4, subMinutes(slotDate, rng.int(5, 20)), "OPD Nurse", "OPD", vitN++) : undefined;
    if (vit) vitalsSink.push(vit);
    const a: Appointment = {
      id: idOf("APT", n++, 5),
      patientId: seed.patient.id,
      doctorId: doc.id,
      departmentId: doc.departmentId,
      date,
      time,
      durationMin: doc.slotMinutes,
      type: rng.chance(0.04) && status === "Scheduled" ? "Teleconsult" : type,
      channel: rng.weighted([["Front desk", 30], ["Phone", 25], ["Patient app", 22], ["Walk-in", 18], ["Referral", 5]]),
      status,
      token,
      reason: complaint,
      checkedInAt: hasVitals ? iso(subMinutes(slotDate, rng.int(10, 35))) : undefined,
      calledAt: status === "In consultation" || status === "Completed" ? iso(addMinutes(slotDate, rng.int(0, 12))) : undefined,
      vitals: vit,
      createdAt: iso(subMinutes(slotDate, rng.int(60 * 3, 60 * 24 * 9))),
    };
    if (status === "Completed" || status === "In consultation") {
      a.consultation = {
        chiefComplaint: complaint,
        soap: soapFor(rng, seed.profile, complaint, vit),
        diagnoses: seed.profile.conditions.map(([code, name]) => ({ code, name, type: "Final" as const })),
        labOrderIds: [],
        radiologyOrderIds: [],
        followUpOn: status === "Completed" ? day(addDays(slotDate, rng.pick([7, 14, 30, 90]))) : undefined,
        advice: status === "Completed" ? rng.pick(["Low salt, low sugar diet. Walk 30 minutes daily.", "Plenty of oral fluids. Paracetamol for fever only.", "Avoid lifting heavy weights.", "Take medicines after food."]) : undefined,
        completedAt: status === "Completed" ? iso(addMinutes(slotDate, doc.slotMinutes)) : undefined,
      };
      if (status === "In consultation") a.consultation.soap = { subjective: complaint, objective: "", assessment: "", plan: "" };
    }
    if (seed.patient.lastVisitAt === undefined || seed.patient.lastVisitAt < a.createdAt) {
      if (status === "Completed") seed.patient.lastVisitAt = a.consultation?.completedAt;
    }
    return a;
  };

  for (let offset = -14; offset <= 10; offset++) {
    const d = addDays(TODAY, offset);
    const date = day(d);
    const wd = WEEKDAYS[d.getDay()];
    for (const doc of doctors) {
      const session = doc.sessions.find((s) => s.day === wd);
      if (!session) continue;
      const start = toMinutes(session.start);
      const end = toMinutes(session.end);
      const slots: number[] = [];
      for (let m = start; m + doc.slotMinutes <= end; m += doc.slotMinutes) slots.push(m);
      const pool = outpatients(byDept.get(doc.departmentId) ?? []);
      const fallback = outpatients(seeds);
      const want = offset < 0 ? rng.int(1, 4) : offset === 0 ? rng.int(6, Math.min(12, slots.length)) : rng.int(1, 5);
      const chosenSlots = rng.sample(slots, want).sort((a, b) => a - b);
      let token = 0;
      for (const m of chosenSlots) {
        const seed = pool.length && rng.chance(0.85) ? rng.pick(pool) : rng.pick(fallback);
        if (offset >= 0 && seed.patient.status !== "OPD") continue;
        if (seed.showcase) continue;
        let status: AppointmentStatus;
        if (offset < 0) status = rng.weighted([["Completed", 85], ["No show", 8], ["Cancelled", 7]]);
        else if (offset > 0) status = rng.chance(0.05) ? "Cancelled" : "Scheduled";
        else if (m + doc.slotMinutes < clinicMin - 5) status = rng.weighted([["Completed", 88], ["No show", 7], ["Cancelled", 5]]);
        else if (m <= clinicMin + 5) status = "Checked in";
        else if (m <= clinicMin + 60) status = rng.chance(0.55) ? "Checked in" : "Scheduled";
        else status = rng.chance(0.04) ? "Cancelled" : "Scheduled";
        const hasToken = offset === 0 && status !== "Cancelled" && status !== "Scheduled";
        appts.push(makeAppt(seed, doc, date, fmt(m), status, hasToken ? ++token : undefined));
      }
      // First checked-in patient today becomes "In consultation"
      if (offset === 0) {
        const first = appts.find((a) => a.doctorId === doc.id && a.date === date && a.status === "Checked in" && toMinutes(a.time) <= clinicMin);
        if (first && !appts.some((a) => a.doctorId === doc.id && a.date === date && a.status === "In consultation") && doc.status !== "In surgery") {
          first.status = "In consultation";
          first.calledAt = iso(subMinutes(CLINIC_NOW, rng.int(2, 9)));
          first.consultation = { chiefComplaint: first.reason, soap: { subjective: first.reason, objective: "", assessment: "", plan: "" }, diagnoses: [], labOrderIds: [], radiologyOrderIds: [] };
        }
      }
    }
  }

  // Showcase bookings for today
  for (const b of showcaseBookings) {
    const seed = seeds[b.seedIdx];
    const doc = doctors.find((d) => d.id === b.doctorId)!;
    const date = seed.profile.key === "cholelithiasis" ? day(addDays(TODAY, -6)) : today;
    let slot = Math.round((clinicMin + b.offsetMin) / doc.slotMinutes) * doc.slotMinutes;
    while (appts.some((a) => a.doctorId === doc.id && a.date === date && a.time === fmt(slot) && a.status !== "Cancelled")) slot += doc.slotMinutes;
    const existingTokens = appts.filter((a) => a.doctorId === doc.id && a.date === today && a.token).length;
    appts.push(makeAppt(seed, doc, date, fmt(slot), b.status, b.status === "Checked in" ? existingTokens + 1 : undefined));
  }

  // Re-number tokens by check-in order per doctor for today
  for (const doc of doctors) {
    const todays = appts
      .filter((a) => a.doctorId === doc.id && a.date === today && a.token !== undefined)
      .sort((a, b) => a.time.localeCompare(b.time));
    todays.forEach((a, i) => (a.token = i + 1));
  }

  return appts.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}
