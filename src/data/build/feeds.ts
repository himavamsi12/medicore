import { subMinutes } from "date-fns";
import type { ActivityEvent, Notification, PatientDocument } from "@/types";
import { NOW, day, iso } from "../seed/clock";
import { Rng } from "../seed/random";
import { LAB_TEST_MAP } from "../reference/labTests";
import type { Database } from "./types";
import { idOf } from "./types";

const within = (at: string, minutes: number) => NOW.getTime() - new Date(at).getTime() <= minutes * 60000 && new Date(at) <= NOW;

export function buildDocuments(db: Pick<Database, "patients" | "labOrders" | "admissions" | "radiologyOrders" | "surgeries">): PatientDocument[] {
  const rng = new Rng("documents");
  const docs: PatientDocument[] = [];
  let n = 1;
  const push = (d: Omit<PatientDocument, "id">) => docs.push({ ...d, id: idOf("DOC", n++, 5) });
  for (const p of db.patients) {
    push({ patientId: p.id, title: p.abhaNumber ? "ABHA card" : "Aadhaar card (masked)", kind: "ID proof", uploadedAt: p.registeredAt, uploadedBy: "Front office", sizeKb: rng.int(180, 420) });
    if (p.insurance) push({ patientId: p.id, title: `${p.insurance.payerName} e-card`, kind: "Insurance", uploadedAt: p.registeredAt, uploadedBy: "Insurance desk", sizeKb: rng.int(90, 260) });
    if (rng.chance(0.15)) push({ patientId: p.id, title: "Referral letter", kind: "Referral", uploadedAt: p.registeredAt, uploadedBy: "Front office", sizeKb: rng.int(120, 600) });
  }
  for (const o of db.labOrders) {
    if (o.status !== "Verified" || !rng.chance(0.3)) continue;
    push({ patientId: o.patientId, title: `${o.testCodes.map((c) => LAB_TEST_MAP[c]?.name ?? c).join(", ")} report`, kind: "Lab report", uploadedAt: o.verifiedAt!, uploadedBy: "Laboratory", sizeKb: rng.int(80, 240) });
  }
  for (const r of db.radiologyOrders) {
    if (r.status !== "Verified") continue;
    push({ patientId: r.patientId, title: `${r.study} report`, kind: "Imaging", uploadedAt: r.report!.reportedAt, uploadedBy: "Radiology", sizeKb: rng.int(200, 1600) });
  }
  for (const a of db.admissions) {
    if (a.dischargedAt) push({ patientId: a.patientId, title: `Discharge summary (${a.ipNo})`, kind: "Discharge summary", uploadedAt: a.dischargedAt, uploadedBy: "Medical records", sizeKb: rng.int(140, 380) });
  }
  for (const s of db.surgeries) {
    if (s.consentSigned) push({ patientId: s.patientId, title: `Informed consent: ${s.procedure}`, kind: "Consent", uploadedAt: iso(subMinutes(new Date(s.scheduledStart), 600)), uploadedBy: "OT coordinator", sizeKb: rng.int(220, 560) });
  }
  return docs;
}

export function buildNotifications(db: Database): Notification[] {
  const rng = new Rng("notifications");
  const out: Notification[] = [];
  let n = 1;
  const nameOf = (id: string) => db.patients.find((p) => p.id === id)?.fullName ?? "Patient";
  const push = (x: Omit<Notification, "id" | "read">, read = false) => out.push({ ...x, id: idOf("NTF", n++, 4), read });

  for (const o of db.labOrders) {
    if (!o.resultedAt || !within(o.resultedAt, 16 * 60)) continue;
    const crit = o.results.filter((r) => r.flag === "HH" || r.flag === "LL");
    if (!crit.length) continue;
    const r = crit[0];
    const param = LAB_TEST_MAP[r.testCode].parameters.find((p) => p.code === r.paramCode)!;
    push({ at: o.resultedAt, title: `Critical value: ${param.name} ${r.value} ${param.unit}`.trim(), body: `${nameOf(o.patientId)} (${o.orderNo}). Inform treating doctor and document read-back.`, severity: "critical", module: "Laboratory", href: `/lab/orders/${o.id}`, roles: ["Admin", "Doctor", "Nurse", "Lab Technician"] }, rng.chance(0.3));
  }
  for (const a of db.admissions) {
    if (a.dischargedAt || db.meta.trajectoryOf[a.id] !== "deteriorating") continue;
    const bed = db.beds.find((b) => b.id === a.bedId);
    push({ at: iso(subMinutes(NOW, rng.int(5, 70))), title: `Early warning score rising: ${nameOf(a.patientId)}`, body: `Bed ${bed?.code}. Review vitals trend and consider escalation.`, severity: "critical", module: "Nursing", href: `/nursing?ward=${a.wardId}&patient=${a.patientId}`, roles: ["Admin", "Doctor", "Nurse"] });
  }
  for (const er of db.erCases) {
    if (!["Waiting", "In triage", "Under treatment"].includes(er.status) || (er.triageLevel ?? 5) > 2) continue;
    push({ at: er.triagedAt ?? er.arrivedAt, title: `ER: Level ${er.triageLevel} arrival`, body: `${nameOf(er.patientId)}. ${er.chiefComplaint}.`, severity: "critical", module: "Emergency", href: `/emergency/${er.id}`, roles: ["Admin", "Doctor", "Nurse"] });
  }
  const stockByDrug = new Map<string, number>();
  for (const b of db.stock) if (b.expiry >= day(NOW)) stockByDrug.set(b.drugId, (stockByDrug.get(b.drugId) ?? 0) + b.qty);
  const low = db.drugs.filter((d) => (stockByDrug.get(d.id) ?? 0) < d.reorderLevel);
  if (low.length) push({ at: iso(subMinutes(NOW, 42)), title: `${low.length} formulary items below reorder level`, body: `Including ${low.slice(0, 3).map((d) => d.brand).join(", ")}.`, severity: "warning", module: "Pharmacy", href: "/pharmacy/stock?filter=low", roles: ["Admin", "Pharmacist"] });
  const expiring = db.stock.filter((b) => b.qty > 0 && (new Date(b.expiry).getTime() - NOW.getTime()) / 86400000 < 30);
  if (expiring.length) push({ at: iso(subMinutes(NOW, 180)), title: `${expiring.length} batches expire within 30 days`, body: "Move to returns or prioritise dispensing (FEFO).", severity: "warning", module: "Pharmacy", href: "/pharmacy/stock?filter=expiring", roles: ["Admin", "Pharmacist"] }, true);
  for (const c of db.claims.filter((c) => c.status === "Query raised").slice(0, 4)) {
    push({ at: c.updatedAt, title: `Claim query: ${c.claimNo}`, body: c.missingDocuments.join("; "), severity: "warning", module: "Billing", href: `/billing/claims/${c.id}`, roles: ["Admin", "Billing"] }, rng.chance(0.4));
  }
  const pendingPo = db.purchaseOrders.filter((p) => p.status === "Pending approval");
  if (pendingPo.length) push({ at: pendingPo[0].createdAt, title: `${pendingPo.length} purchase orders awaiting approval`, body: `Oldest: ${pendingPo[pendingPo.length - 1].poNo}.`, severity: "info", module: "Inventory", href: "/inventory/purchase-orders?status=Pending%20approval", roles: ["Admin"] });
  const oNeg = db.bloodUnits.filter((u) => u.group === "O-" && u.component === "PRBC" && u.status === "Available").length;
  push({ at: iso(subMinutes(NOW, 95)), title: `Low stock: O negative PRBC (${oNeg} units)`, body: "Below safety stock of 4 units. Donor call-out recommended.", severity: "warning", module: "Blood Bank", href: "/blood-bank", roles: ["Admin", "Lab Technician", "Doctor"] });
  for (const s of db.surgeries.filter((s) => s.status === "Pre-op")) {
    push({ at: iso(subMinutes(new Date(s.scheduledStart), 55)), title: `Pre-op: ${s.procedure}`, body: `${nameOf(s.patientId)} in ${s.otId}. Sign-in checklist ${s.checklist.filter((c) => c.phase === "Sign in" && c.done).length}/7 complete.`, severity: "info", module: "OT", href: `/ot/cases/${s.id}`, roles: ["Admin", "Doctor", "Nurse"] });
  }
  const checkedIn = db.appointments.filter((a) => a.status === "Checked in").slice(-3);
  for (const a of checkedIn) push({ at: a.checkedInAt ?? iso(NOW), title: `Patient checked in: token ${a.token ?? "-"}`, body: `${nameOf(a.patientId)} is waiting.`, severity: "info", module: "OPD", href: `/opd/queue`, roles: ["Doctor", "Receptionist"] }, true);

  return out.sort((a, b) => b.at.localeCompare(a.at));
}

export function buildActivity(db: Database): ActivityEvent[] {
  const out: ActivityEvent[] = [];
  let n = 1;
  const nameOf = (id: string) => db.patients.find((p) => p.id === id)?.fullName ?? "Patient";
  const docName = (id: string) => db.doctors.find((d) => d.id === id)?.name ?? "Doctor";
  const push = (e: Omit<ActivityEvent, "id">) => out.push({ ...e, id: idOf("ACT", n++, 5) });
  const window = 18 * 60;

  for (const a of db.admissions) {
    if (within(a.admittedAt, window)) push({ at: a.admittedAt, actor: docName(a.admittingDoctorId), actorRole: "Doctor", verb: "admitted", target: `${nameOf(a.patientId)} to ${db.wards.find((w) => w.id === a.wardId)?.name}`, module: "IPD", href: `/ipd/admissions/${a.id}`, severity: a.acuity === "Critical" ? "critical" : "info" });
    if (a.dischargedAt && within(a.dischargedAt, window)) push({ at: a.dischargedAt, actor: docName(a.admittingDoctorId), actorRole: "Doctor", verb: "discharged", target: nameOf(a.patientId), module: "IPD", href: `/ipd/admissions/${a.id}`, severity: "stable" });
  }
  for (const o of db.labOrders) {
    if (o.verifiedAt && within(o.verifiedAt, 6 * 60)) push({ at: o.verifiedAt, actor: o.verifiedBy ?? "Pathologist", actorRole: "Lab Technician", verb: "verified", target: `${o.testCodes.join(", ")} for ${nameOf(o.patientId)}`, module: "Laboratory", href: `/lab/orders/${o.id}`, severity: o.results.some((r) => r.flag === "HH" || r.flag === "LL") ? "critical" : "neutral" });
  }
  for (const rx of db.prescriptions) {
    if (rx.dispensedAt && within(rx.dispensedAt, 5 * 60)) push({ at: rx.dispensedAt, actor: rx.dispensedBy ?? "Pharmacist", actorRole: "Pharmacist", verb: "dispensed", target: `${rx.rxNo} for ${nameOf(rx.patientId)}`, module: "Pharmacy", href: `/pharmacy/dispense/${rx.id}`, severity: "neutral" });
  }
  for (const b of db.bills) {
    for (const p of b.payments) if (within(p.at, 5 * 60)) push({ at: p.at, actor: p.collectedBy, actorRole: "Billing", verb: `collected ₹${p.amount.toLocaleString("en-IN")} via ${p.mode}`, target: b.billNo, module: "Billing", href: `/billing/bills/${b.id}`, severity: "neutral" });
  }
  for (const s of db.surgeries) {
    if (s.actualEnd && within(s.actualEnd, window)) push({ at: s.actualEnd, actor: docName(s.surgeonId), actorRole: "Doctor", verb: "completed", target: `${s.procedure} (${nameOf(s.patientId)})`, module: "OT", href: `/ot/cases/${s.id}`, severity: "stable" });
  }
  for (const er of db.erCases) {
    if (within(er.arrivedAt, window)) push({ at: er.arrivedAt, actor: "ER triage", actorRole: "Nurse", verb: "registered arrival of", target: `${nameOf(er.patientId)} (${er.arrivalMode})`, module: "Emergency", href: `/emergency/${er.id}`, severity: (er.triageLevel ?? 5) <= 2 ? "critical" : "info" });
  }
  for (const a of db.appointments) {
    if (a.checkedInAt && within(a.checkedInAt, 3 * 60)) push({ at: a.checkedInAt, actor: "Front office", actorRole: "Receptionist", verb: "checked in", target: `${nameOf(a.patientId)} for ${docName(a.doctorId)}`, module: "OPD", href: `/opd/queue`, severity: "neutral" });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 120);
}
