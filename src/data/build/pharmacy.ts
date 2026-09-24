import { addDays, addMinutes, format, setHours, setMinutes, subMinutes } from "date-fns";
import type {
  Admission,
  Appointment,
  Drug,
  ErCase,
  Frequency,
  MarEntry,
  MarStatus,
  Prescription,
  Route,
  RxItem,
  Staff,
  StockBatch,
} from "@/types";
import { DRUGS } from "../reference/drugs";
import { NOW, TODAY, day, iso } from "../seed/clock";
import { Rng } from "../seed/random";
import type { PatientSeed } from "./people";
import { idOf } from "./types";

const drugByBrand = new Map(DRUGS.map((d) => [d.brand, d]));

export function buildStock(): StockBatch[] {
  const rng = new Rng("stock");
  const out: StockBatch[] = [];
  let n = 1;
  const suppliers = ["Karnataka Pharma Distributors", "Medline Healthcare India", "Sri Venkateshwara Surgicals", "Keimed Pvt. Ltd.", "Entero Healthcare"];
  for (const d of DRUGS) {
    const batches = rng.int(1, 3);
    const lowStock = rng.chance(0.12);
    for (let b = 0; b < batches; b++) {
      const r = rng.next();
      const expiryDays = r < 0.02 ? -rng.int(3, 40) : r < 0.1 ? rng.int(10, 88) : rng.int(120, 720);
      const baseQty = lowStock ? rng.int(0, Math.max(1, Math.round(d.reorderLevel / (batches * 1.6)))) : rng.int(Math.round(d.reorderLevel * 0.6), d.reorderLevel * 3);
      out.push({
        id: idOf("BAT", n, 5),
        drugId: d.id,
        batchNo: `${d.manufacturer.replace(/[^A-Z]/g, "").slice(0, 2) || "MC"}${format(addDays(TODAY, expiryDays - 700), "yyMM")}${rng.pick(["A", "B", "C", "D"])}${rng.int(10, 99)}`,
        expiry: day(addDays(TODAY, expiryDays)),
        qty: baseQty,
        purchaseRate: Math.round(d.mrp * rng.float(0.62, 0.78, 2) * 100) / 100,
        supplier: rng.pick(suppliers),
        receivedAt: day(addDays(TODAY, -rng.int(10, 240))),
        location: d.form === "Injection" || d.form === "Infusion" ? rng.pick(["IP Pharmacy, Rack C2", "IP Pharmacy, Cold chain", "ER satellite"]) : rng.pick(["Main Pharmacy, Rack A1", "Main Pharmacy, Rack A3", "Main Pharmacy, Rack B2", "IP Pharmacy, Rack C1"]),
      });
      n++;
    }
  }
  return out;
}

function routeFor(d: Drug): Route {
  switch (d.form) {
    case "Injection":
      return d.generic.toLowerCase().includes("insulin") || d.generic.toLowerCase().includes("enoxaparin") || d.generic.toLowerCase().includes("heparin") ? "SC" : d.drugClass.includes("Vaccine") ? "IM" : "IV";
    case "Infusion":
      return "IV";
    case "Inhaler":
      return "Inhalation";
    case "Drops":
      return d.drugClass.includes("Ophthalmic") ? "Ophthalmic" : "Inhalation";
    case "Ointment":
      return "Topical";
    default:
      return "Oral";
  }
}

function doseFor(d: Drug): string {
  switch (d.form) {
    case "Tablet": return "1 tab";
    case "Capsule": return "1 cap";
    case "Syrup":
    case "Suspension": return "5 ml";
    case "Injection": return d.strength;
    case "Infusion": return d.strength;
    case "Inhaler": return "2 puffs";
    case "Drops": return "1 respule";
    case "Sachet": return "1 sachet in 1 L water";
    case "Ointment": return "Thin layer";
  }
}

function frequencyFor(d: Drug, inpatient: boolean, rng: Rng): Frequency {
  const g = d.generic.toLowerCase();
  if (["noradrenaline", "norepinephrine", "dobutamine"].some((x) => g.includes(x))) return "STAT";
  if (g.includes("insulin regular")) return "1-1-1";
  if (g.includes("glargine")) return "0-0-1";
  if (d.form === "Infusion" || d.form === "Injection") {
    if (["meropenem", "piperacillin", "metronidazole", "paracetamol"].some((x) => g.includes(x))) return "Q8H";
    if (["ceftriaxone", "enoxaparin", "pantoprazole", "dexamethasone"].some((x) => g.includes(x))) return inpatient ? "1-0-0" : "1-0-0";
    if (g.includes("ondansetron") || g.includes("tramadol")) return "SOS";
    return rng.pick(["1-0-1", "1-0-0", "Q8H"] as Frequency[]);
  }
  if (d.form === "Inhaler") return rng.pick(["1-0-1", "SOS"] as Frequency[]);
  if (d.form === "Drops") return "Q6H";
  if (["atorvastatin", "rosuvastatin"].some((x) => g.includes(x))) return "0-0-1";
  if (["levothyroxine", "aspirin", "telmisartan", "amlodipine", "clopidogrel", "folic"].some((x) => g.includes(x))) return "1-0-0";
  if (g.includes("paracetamol")) return inpatient ? "Q6H" : "1-1-1";
  if (g.includes("cholecalciferol")) return "Weekly";
  return rng.pick(["1-0-1", "1-0-1", "1-1-1", "1-0-0"] as Frequency[]);
}

const PER_DAY: Record<Frequency, number> = { "1-0-0": 1, "0-1-0": 1, "0-0-1": 1, "1-0-1": 2, "1-1-1": 3, "1-1-1-1": 4, "0-0-0-1": 1, SOS: 1, STAT: 1, Q4H: 6, Q6H: 4, Q8H: 3, Weekly: 1 / 7 };

export const MAR_TIMES: Partial<Record<Frequency, number[]>> = {
  "1-0-0": [8], "0-1-0": [14], "0-0-1": [21], "1-0-1": [8, 20], "1-1-1": [8, 14, 20], "1-1-1-1": [6, 12, 18, 22], "0-0-0-1": [22],
  Q4H: [2, 6, 10, 14, 18, 22], Q6H: [0, 6, 12, 18], Q8H: [6, 14, 22],
};

function instructionsFor(d: Drug, freq: Frequency): string {
  const g = d.generic.toLowerCase();
  if (d.form === "Infusion") return "Infuse over 30-60 min";
  if (d.form === "Injection") return g.includes("insulin") ? "Per sliding scale, before meals" : "Slow IV / as directed";
  if (g.includes("pantoprazole") || g.includes("omeprazole") || g.includes("levothyroxine")) return "Before breakfast, empty stomach";
  if (freq === "0-0-1") return "At bedtime";
  if (freq === "SOS") return "Only if needed";
  if (d.form === "Inhaler") return "Rinse mouth after use";
  return "After food";
}

export function rxItemsFor(rng: Rng, brands: string[], inpatient: boolean, chronic: boolean, idBase: number): RxItem[] {
  return brands
    .map((b) => drugByBrand.get(b))
    .filter((d): d is Drug => Boolean(d))
    .map((d, i) => {
      const freq = frequencyFor(d, inpatient, rng);
      const duration = inpatient ? 3 : chronic ? 30 : rng.pick([3, 5, 5, 7]);
      const perDay = PER_DAY[freq];
      const qty = ["Tablet", "Capsule"].includes(d.form) ? Math.ceil(perDay * duration) : d.form === "Injection" || d.form === "Infusion" ? Math.ceil(perDay * duration) : 1;
      return {
        id: idOf("RXI", idBase * 10 + i, 7),
        drugId: d.id,
        dose: doseFor(d),
        frequency: freq,
        route: routeFor(d),
        durationDays: freq === "Weekly" ? 56 : duration,
        instructions: instructionsFor(d, freq),
        qty: freq === "Weekly" ? 8 : qty,
        dispensedQty: 0,
      };
    });
}

export function buildPrescriptions(seeds: PatientSeed[], admissions: Admission[], appointments: Appointment[], erCases: ErCase[], staff: Staff[]): Prescription[] {
  const rng = new Rng("rx");
  const out: Prescription[] = [];
  const pharmacists = staff.filter((s) => s.category === "Pharmacist");
  const seedOf = new Map(seeds.map((s) => [s.patient.id, s]));
  let n = 1;

  const push = (p: Omit<Prescription, "id" | "rxNo">, dispensed: boolean, partial = false) => {
    const rx: Prescription = { ...p, id: idOf("RX", n, 5), rxNo: `RX/${format(new Date(p.createdAt), "yyMMdd")}/${String(n).padStart(4, "0")}` };
    if (dispensed || partial) {
      rx.items = rx.items.map((it, i) => ({ ...it, dispensedQty: partial && i % 2 === 1 ? 0 : it.qty }));
      rx.status = partial ? "Partially dispensed" : "Dispensed";
      rx.dispensedAt = iso(addMinutes(new Date(p.createdAt), rng.int(8, 50)));
      rx.dispensedBy = pharmacists.length ? rng.pick(pharmacists).name : undefined;
    }
    out.push(rx);
    n++;
    return rx;
  };

  for (const appt of appointments) {
    if (appt.status !== "Completed" || !appt.consultation || !rng.chance(0.78)) continue;
    const seed = seedOf.get(appt.patientId)!;
    const chronic = seed.profile.conditions.some(([, , c]) => c);
    const brands = rng.sample(seed.profile.meds, rng.int(Math.min(2, seed.profile.meds.length), Math.min(4, seed.profile.meds.length)));
    const items = rxItemsFor(rng, brands, false, chronic, n);
    if (!items.length) continue;
    const created = new Date(appt.consultation.completedAt ?? appt.calledAt ?? NOW);
    const recent = NOW.getTime() - created.getTime() < 100 * 60000;
    const rx = push(
      {
        patientId: appt.patientId,
        doctorId: appt.doctorId,
        source: "OPD",
        encounterId: appt.id,
        createdAt: iso(created),
        diagnosis: appt.consultation.diagnoses.map((d) => d.name).join(", ") || appt.reason,
        items,
        status: "Pending",
      },
      !recent && rng.chance(0.93),
      recent ? false : rng.chance(0.03),
    );
    appt.consultation.prescriptionId = rx.id;
  }

  for (const a of admissions) {
    const seed = seedOf.get(a.patientId)!;
    const created = addMinutes(new Date(a.admittedAt), 45);
    push(
      {
        patientId: a.patientId,
        doctorId: a.admittingDoctorId,
        source: "IPD",
        encounterId: a.id,
        createdAt: iso(created),
        diagnosis: a.provisionalDiagnosis.map((d) => d.name).join(", "),
        items: rxItemsFor(rng, seed.profile.meds, true, false, n),
        status: "Pending",
        notes: "Inpatient medication order",
      },
      true,
    );
    if (!a.dischargedAt && rng.chance(0.32)) {
      const extra = rng.sample(["Pan IV", "Emeset Injection", "Paracetamol IV", "Normal Saline 0.9%", "KCl Injection", "Lasix Injection", "Dexona", "Tramazac", "Human Actrapid"], rng.int(1, 3));
      push(
        {
          patientId: a.patientId,
          doctorId: a.admittingDoctorId,
          source: "IPD",
          encounterId: a.id,
          createdAt: iso(subMinutes(NOW, rng.int(5, 140))),
          diagnosis: a.provisionalDiagnosis[0]?.name ?? a.reason,
          items: rxItemsFor(rng, extra, true, false, n),
          status: "Pending",
          notes: "Additional order on rounds",
        },
        false,
        rng.chance(0.2),
      );
    }
  }

  for (const er of erCases) {
    if (!["Under treatment", "Observation"].includes(er.status)) continue;
    const seed = seedOf.get(er.patientId)!;
    push(
      {
        patientId: er.patientId,
        doctorId: er.doctorId ?? "DOC-034",
        source: "ER",
        encounterId: er.id,
        createdAt: iso(addMinutes(new Date(er.arrivedAt), rng.int(10, 30))),
        diagnosis: er.chiefComplaint,
        items: rxItemsFor(rng, seed.profile.meds.slice(0, 3), true, false, n),
        status: "Pending",
        notes: "STAT - Emergency",
      },
      rng.chance(0.5),
    );
  }

  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function buildMar(admissions: Admission[], prescriptions: Prescription[], staff: Staff[]): MarEntry[] {
  const rng = new Rng("mar");
  const out: MarEntry[] = [];
  let n = 1;
  const drugById = new Map(DRUGS.map((d) => [d.id, d]));
  for (const a of admissions) {
    if (a.dischargedAt) continue;
    const nurses = staff.filter((s) => s.category === "Nurse" && s.wardId === a.wardId);
    const rxs = prescriptions.filter((p) => p.encounterId === a.id);
    for (const rx of rxs) {
      for (const item of rx.items) {
        const drug = drugById.get(item.drugId)!;
        const times = MAR_TIMES[item.frequency];
        if (!times) continue;
        for (const hour of times) {
          const at = setMinutes(setHours(TODAY, hour), 0);
          if (at < new Date(rx.createdAt)) continue;
          let status: MarStatus = "Due";
          let givenAt: string | undefined;
          if (at < subMinutes(NOW, 30)) {
            status = rng.weighted([["Given", 91], ["Held", 4], ["Missed", 2], ["Refused", 3]]);
            if (status === "Given") givenAt = iso(addMinutes(at, rng.int(-15, 35)));
          }
          out.push({
            id: idOf("MAR", n, 6),
            admissionId: a.id,
            patientId: a.patientId,
            drug: `${drug.brand} (${drug.generic})`,
            dose: item.dose,
            route: item.route,
            scheduledAt: iso(at),
            status,
            givenAt,
            givenBy: status === "Given" && nurses.length ? rng.pick(nurses).name : undefined,
            note: status === "Held" ? rng.pick(["SBP below 100, held as per order", "Patient NPO for procedure", "Pulse 54/min"]) : status === "Refused" ? "Patient refused, doctor informed" : undefined,
            highAlert: drug.highAlert,
          });
          n++;
        }
      }
    }
  }
  return out.sort((x, y) => x.scheduledAt.localeCompare(y.scheduledAt));
}

