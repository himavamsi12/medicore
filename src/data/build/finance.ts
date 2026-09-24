import { addDays, addHours, addMinutes, differenceInCalendarDays, format, subMinutes } from "date-fns";
import type {
  Admission,
  Appointment,
  Bill,
  BillItem,
  CarePackage,
  Claim,
  ClaimEvent,
  ClaimStatus,
  Doctor,
  Drug,
  ErCase,
  LabOrder,
  Patient,
  Payment,
  PaymentMode,
  Prescription,
  RadiologyOrder,
  Staff,
  Surgery,
  Ward,
} from "@/types";
import { computeBillTotals } from "@/lib/billing-math";
import { PACKAGES } from "../org";
import { LAB_TEST_MAP } from "../reference/labTests";
import { NOW, iso } from "../seed/clock";
import { Rng } from "../seed/random";
import { idOf } from "./types";

export const RADIOLOGY_TARIFF: Record<string, number> = { "X-Ray": 450, USG: 1600, CT: 4200, MRI: 8500, Mammography: 2200 };
const PACKAGE_BY_PROCEDURE: Record<string, string> = {
  "Right total knee replacement": "PKG-005",
  "Laparoscopic cholecystectomy": "PKG-003",
  "Lower segment caesarean section": "PKG-002",
  "Emergency LSCS": "PKG-002",
  "Coronary angiography with PTCA": "PKG-006",
  "Laparoscopic TEP hernia repair (right)": "PKG-004",
  "URSL with DJ stenting (right)": "PKG-008",
  "Functional endoscopic sinus surgery": "PKG-009",
};

interface Ctx {
  patients: Patient[];
  doctors: Doctor[];
  wards: Ward[];
  drugs: Drug[];
  appointments: Appointment[];
  admissions: Admission[];
  erCases: ErCase[];
  labOrders: LabOrder[];
  radiologyOrders: RadiologyOrder[];
  prescriptions: Prescription[];
  surgeries: Surgery[];
  staff: Staff[];
}

export function buildBills(ctx: Ctx): Bill[] {
  const rng = new Rng("bills");
  const bills: Bill[] = [];
  const cashiers = ctx.staff.filter((s) => s.category === "Billing" || s.category === "Front office").map((s) => s.name);
  const patientOf = new Map(ctx.patients.map((p) => [p.id, p]));
  const drugOf = new Map(ctx.drugs.map((d) => [d.id, d]));
  const doctorOf = new Map(ctx.doctors.map((d) => [d.id, d]));
  let n = 1;
  let itemN = 1;
  let rcpt = 1;

  const item = (p: Omit<BillItem, "id">): BillItem => ({ ...p, id: idOf("BI", itemN++, 6) });
  const pay = (mode: PaymentMode, amount: number, at: Date, reference?: string): Payment => ({
    id: idOf("PMT", rcpt, 5),
    receiptNo: `RCPT/${format(at, "yyMMdd")}/${String(rcpt++).padStart(4, "0")}`,
    mode,
    amount: Math.round(amount),
    reference,
    at: iso(at),
    collectedBy: rng.pick(cashiers),
  });
  const upiRef = () => `${rng.digits(12)}`;
  const selfMode = () => rng.weighted<PaymentMode>([["UPI", 48], ["Card", 22], ["Cash", 24], ["NEFT", 6]]);

  const labItems = (orders: LabOrder[], coverage = 1) =>
    orders.flatMap((o) =>
      rng.chance(coverage)
        ? o.testCodes.map((code) =>
            item({ category: "Laboratory", description: LAB_TEST_MAP[code].name, code: `LAB-${code}`, hsnSac: "999316", qty: 1, rate: LAB_TEST_MAP[code].price, discount: 0, gstRate: 0, date: o.orderedAt }),
          )
        : [],
    );
  const radItems = (orders: RadiologyOrder[], coverage = 1) =>
    orders.filter(() => rng.chance(coverage)).map((o) => item({ category: "Radiology", description: o.study, code: `RAD-${o.modality.replace(/\W/g, "")}`, hsnSac: "999316", qty: 1, rate: RADIOLOGY_TARIFF[o.modality], discount: 0, gstRate: 0, date: o.orderedAt }));
  const rxItems = (rxs: Prescription[]) =>
    rxs.flatMap((rx) =>
      rx.items
        .filter((i) => i.dispensedQty > 0)
        .map((i) => {
          const d = drugOf.get(i.drugId)!;
          return item({ category: "Pharmacy", description: `${d.brand} ${d.strength}`, code: d.id, hsnSac: d.hsn, qty: i.dispensedQty, rate: d.mrp, discount: 0, gstRate: d.gstRate, date: rx.dispensedAt ?? rx.createdAt });
        }),
    );

  /* OPD bills */
  for (const a of ctx.appointments) {
    if (a.status !== "Completed" && a.status !== "In consultation") continue;
    const doc = doctorOf.get(a.doctorId)!;
    const at = new Date(a.consultation?.completedAt ?? a.calledAt ?? NOW);
    const labs = ctx.labOrders.filter((o) => o.encounterId === a.id);
    const rads = ctx.radiologyOrders.filter((o) => o.encounterId === a.id);
    const items: BillItem[] = [
      item({ category: "Consultation", description: `${a.type === "New" ? "New" : "Follow-up"} consultation - ${doc.name}`, code: "CON-OPD", hsnSac: "999312", qty: 1, rate: a.type === "New" ? doc.consultationFee : doc.followUpFee, discount: 0, gstRate: 0, date: iso(at) }),
      ...labItems(labs),
      ...radItems(rads),
    ];
    const patient = patientOf.get(a.patientId)!;
    const bill: Bill = {
      id: idOf("BIL", n, 5),
      billNo: `MC/OP/26-27/${String(8000 + n).padStart(6, "0")}`,
      patientId: a.patientId,
      encounterType: "OPD",
      encounterId: a.id,
      createdAt: iso(at),
      status: "Unpaid",
      payerType: patient.paymentCategory === "Corporate" ? "Corporate" : "Self",
      items,
      payments: [],
    };
    if (rng.chance(0.08) && patient.flags.includes("VIP") === false && a.type !== "New") items[0].discount = Math.round(items[0].rate * 0.1);
    const totals = computeBillTotals(bill);
    const recent = NOW.getTime() - at.getTime() < 40 * 60000 || a.status === "In consultation";
    if (!recent) {
      const mode = selfMode();
      bill.payments.push(pay(mode, totals.net, addMinutes(at, rng.int(2, 25)), mode === "UPI" ? upiRef() : undefined));
      bill.status = "Paid";
    }
    bills.push(bill);
    n++;
  }

  /* IPD bills */
  for (const adm of ctx.admissions) {
    const patient = patientOf.get(adm.patientId)!;
    const ward = ctx.wards.find((w) => w.id === adm.wardId)!;
    const admitted = new Date(adm.admittedAt);
    const end = adm.dischargedAt ? new Date(adm.dischargedAt) : NOW;
    const days = Math.max(1, differenceInCalendarDays(end, admitted) + (adm.dischargedAt ? 0 : 1));
    const surgery = ctx.surgeries.find((s) => s.admissionId === adm.id && s.status !== "Cancelled");
    const pkgId = surgery ? PACKAGE_BY_PROCEDURE[surgery.procedure] : undefined;
    const pkg: CarePackage | undefined = pkgId ? PACKAGES.find((p) => p.id === pkgId) : undefined;
    const icu = ["ICU", "HDU", "NICU"].includes(ward.type);
    const doc = doctorOf.get(adm.admittingDoctorId)!;
    const roomGst: 0 | 5 = !icu && ward.dailyRate > 5000 ? 5 : 0;
    const coveredDays = pkg ? Math.min(days, pkg.lengthOfStayDays) : 0;
    const extraDays = days - coveredDays;
    const items: BillItem[] = [];
    // Deliberate gaps for Billing Intelligence: some bills miss lab / radiology / consumable charges.
    const leaky = rng.chance(0.22);
    if (pkg) items.push(item({ category: "Package", description: `${pkg.name} package (${pkg.code})`, code: pkg.code, hsnSac: "999311", qty: 1, rate: pkg.price, discount: 0, gstRate: 0, date: surgery!.scheduledStart }));
    if (extraDays > 0) {
      items.push(item({ category: "Room", description: `${ward.name} bed charges`, code: `RM-${ward.type.toUpperCase()}`, hsnSac: "999311", qty: extraDays, rate: ward.dailyRate, discount: 0, gstRate: roomGst, date: adm.admittedAt }));
      items.push(item({ category: "Nursing", description: icu ? "Critical care nursing" : "Nursing charges", code: "NUR", hsnSac: "999311", qty: extraDays, rate: icu ? 2500 : 800, discount: 0, gstRate: 0, date: adm.admittedAt }));
      items.push(item({ category: "Consultation", description: `Inpatient visits - ${doc.name}`, code: "CON-IPD", hsnSac: "999312", qty: extraDays, rate: 1200, discount: 0, gstRate: 0, date: adm.admittedAt }));
      if (icu && !leaky) items.push(item({ category: "Procedure", description: "Multipara monitoring", code: "MON", hsnSac: "999311", qty: extraDays, rate: 1500, discount: 0, gstRate: 0, date: adm.admittedAt }));
    }
    if (surgery && !pkg) {
      items.push(item({ category: "OT", description: `OT charges - ${surgery.procedure}`, code: "OT-MAJ", hsnSac: "999311", qty: 1, rate: rng.pick([28000, 35000, 42000]), discount: 0, gstRate: 0, date: surgery.scheduledStart }));
      items.push(item({ category: "Procedure", description: `Surgeon fee - ${surgery.procedure}`, code: "SUR-FEE", hsnSac: "999312", qty: 1, rate: rng.pick([35000, 45000, 60000]), discount: 0, gstRate: 0, date: surgery.scheduledStart }));
      items.push(item({ category: "Procedure", description: "Anaesthetist fee", code: "ANA-FEE", hsnSac: "999312", qty: 1, rate: rng.pick([12000, 15000]), discount: 0, gstRate: 0, date: surgery.scheduledStart }));
      if (surgery.implants) items.push(item({ category: "Consumables", description: `Implant: ${surgery.implants}`, code: "IMP", hsnSac: "90213900", qty: 1, rate: rng.pick([16800, 27500, 4200, 1650]), discount: 0, gstRate: 5, date: surgery.scheduledStart }));
    }
    const labs = ctx.labOrders.filter((o) => o.encounterId === adm.id && o.status !== "Rejected");
    items.push(...labItems(labs, leaky ? 0.75 : 1));
    items.push(...radItems(ctx.radiologyOrders.filter((o) => o.encounterId === adm.id), leaky ? 0.5 : 1));
    items.push(...rxItems(ctx.prescriptions.filter((r) => r.encounterId === adm.id)));
    if (!leaky || !surgery) items.push(item({ category: "Consumables", description: "Medical consumables (syringes, IV sets, dressings)", code: "CNS", hsnSac: "90189099", qty: 1, rate: Math.round(days * rng.int(650, 1800)), discount: 0, gstRate: 12, date: adm.admittedAt }));

    const insured = patient.insurance && patient.paymentCategory !== "Self-pay";
    const payerType: Bill["payerType"] = !insured ? "Self" : patient.paymentCategory === "Corporate" ? "Corporate" : patient.paymentCategory === "Insurance" ? "Insurance" : "Government";
    const bill: Bill = {
      id: idOf("BIL", n, 5),
      billNo: `MC/IP/26-27/${String(3000 + n).padStart(6, "0")}`,
      patientId: adm.patientId,
      encounterType: "IPD",
      encounterId: adm.id,
      createdAt: adm.admittedAt,
      status: "Unpaid",
      payerType,
      payerId: patient.insurance?.payerId,
      packageId: pkg?.id,
      items,
      payments: [],
    };
    if (payerType === "Self") {
      bill.payments.push(pay(rng.pick(["Cash", "Card", "UPI"] as PaymentMode[]), rng.pick([10000, 20000, 25000, 50000]), addMinutes(admitted, 30)));
      if (adm.dischargedAt) {
        const t = computeBillTotals(bill);
        if (t.due > 0) bill.payments.push(pay(selfMode(), t.due, new Date(adm.dischargedAt), undefined));
        bill.status = "Paid";
      } else {
        bill.status = computeBillTotals(bill).due > 0 ? "Partially paid" : "Paid";
      }
    } else {
      if (rng.chance(0.4)) bill.payments.push(pay("Advance", 5000, addMinutes(admitted, 40)));
      bill.status = adm.dischargedAt ? (rng.chance(0.55) ? "Paid" : "Insurance pending") : "Insurance pending";
      if (bill.status === "Paid") bill.payments.push(pay("Insurance", computeBillTotals(bill).due, addDays(new Date(adm.dischargedAt!), rng.int(8, 26)), `UTR${rng.digits(10)}`));
    }
    bills.push(bill);
    n++;
  }

  /* ER bills */
  for (const er of ctx.erCases) {
    if (er.status !== "Discharged" && er.status !== "Referred out") continue;
    const at = new Date(er.arrivedAt);
    const items: BillItem[] = [
      item({ category: "Consultation", description: "Emergency consultation", code: "CON-ER", hsnSac: "999312", qty: 1, rate: 1000, discount: 0, gstRate: 0, date: er.arrivedAt }),
      item({ category: "Room", description: "Emergency bed charges (up to 6 h)", code: "RM-ER", hsnSac: "999311", qty: 1, rate: 1500, discount: 0, gstRate: 0, date: er.arrivedAt }),
      ...labItems(ctx.labOrders.filter((o) => o.encounterId === er.id)),
      ...radItems(ctx.radiologyOrders.filter((o) => o.encounterId === er.id)),
    ];
    if (er.chiefComplaint.includes("bite")) items.push(item({ category: "Procedure", description: "Wound care and anti-rabies vaccine", code: "PRC-ARV", hsnSac: "999312", qty: 1, rate: 850, discount: 0, gstRate: 0, date: er.arrivedAt }));
    const bill: Bill = {
      id: idOf("BIL", n, 5),
      billNo: `MC/ER/26-27/${String(600 + n).padStart(6, "0")}`,
      patientId: er.patientId,
      encounterType: "ER",
      encounterId: er.id,
      createdAt: er.arrivedAt,
      status: "Paid",
      payerType: "Self",
      items,
      payments: [],
    };
    bill.payments.push(pay(selfMode(), computeBillTotals(bill).net, addHours(at, rng.int(2, 5))));
    bills.push(bill);
    n++;
  }

  return bills.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/* ---------------- Insurance claims ---------------- */

const DOCS = ["Pre-authorisation form", "Policy copy / e-card", "Aadhaar card", "Doctor's admission notes", "Investigation reports"];
const FINAL_DOCS = ["Discharge summary", "Final itemised bill", "Pharmacy bills", "Implant invoice and sticker"];

export function buildClaims(admissions: Admission[], bills: Bill[], patients: Patient[]): Claim[] {
  const rng = new Rng("claims");
  const claims: Claim[] = [];
  let n = 1;
  const patientOf = new Map(patients.map((p) => [p.id, p]));
  for (const adm of admissions) {
    const p = patientOf.get(adm.patientId)!;
    if (!p.insurance || p.paymentCategory === "Self-pay") continue;
    const bill = bills.find((b) => b.encounterId === adm.id);
    if (!bill) continue;
    const totals = computeBillTotals(bill);
    const admitted = new Date(adm.admittedAt);
    const current = !adm.dischargedAt;
    let status: ClaimStatus;
    if (current) {
      const hours = (NOW.getTime() - admitted.getTime()) / 3600000;
      status = hours < 6 ? "Pre-auth requested" : rng.chance(0.22) ? "Query raised" : "Pre-auth approved";
    } else {
      status = bill.status === "Paid" ? rng.weighted<ClaimStatus>([["Settled", 70], ["Partially approved", 30]]) : rng.weighted<ClaimStatus>([["Final bill submitted", 35], ["Approved", 25], ["Query raised", 22], ["Rejected", 8], ["Partially approved", 10]]);
    }
    const tpa = p.insurance.tpaName ? { id: `TPA-${p.insurance.tpaName}`, name: p.insurance.tpaName } : undefined;
    const events: ClaimEvent[] = [];
    const by = tpa ? `${tpa.name} desk` : `${p.insurance.payerName} desk`;
    events.push({ at: iso(addMinutes(admitted, rng.int(60, 180))), status: "Pre-auth requested", note: `Pre-authorisation submitted for ${adm.reason.toLowerCase()}.`, by: "Insurance Desk, MediCore" });
    const preAuthAmount = Math.round((totals.net * rng.float(0.7, 1.05, 2)) / 1000) * 1000;
    if (status !== "Pre-auth requested") events.push({ at: iso(addHours(admitted, rng.int(4, 10))), status: "Pre-auth approved", note: `Initial approval of ₹${preAuthAmount.toLocaleString("en-IN")}.`, by });
    const missing: string[] = [];
    if (status === "Query raised") {
      const q = rng.pick([
        ["Past consultation records for pre-existing diabetes (policy in year 2)", "Treating doctor's certificate on duration of illness"],
        ["Indoor case papers with daily progress notes", "Detailed breakup of consumables"],
        ["Justification for ICU stay beyond 48 hours"],
        ["Implant invoice with barcode sticker"],
      ]);
      missing.push(...q);
      events.push({ at: iso(current ? subMinutes(NOW, rng.int(40, 600)) : addDays(new Date(adm.dischargedAt!), 3)), status: "Query raised", note: `Query: ${q.join("; ")}.`, by });
    }
    if (!current) {
      events.push({ at: iso(addHours(new Date(adm.dischargedAt!), 6)), status: "Final bill submitted", note: "Final bill and discharge summary submitted.", by: "Insurance Desk, MediCore" });
    }
    const deductions: Claim["deductions"] = [];
    if (["Approved", "Partially approved", "Settled"].includes(status)) {
      deductions.push({ reason: "Non-payable consumables (IRDAI list)", amount: rng.int(1800, 6500) });
      if (status === "Partially approved" || rng.chance(0.3)) deductions.push({ reason: "Room rent over eligibility (proportionate deduction)", amount: Math.round(totals.net * rng.float(0.04, 0.12, 2)) });
    }
    const dedTotal = deductions.reduce((s, d) => s + d.amount, 0);
    const approvedAmount = ["Approved", "Partially approved", "Settled"].includes(status) ? Math.max(0, totals.net - dedTotal) : undefined;
    if (status === "Approved" || status === "Partially approved" || status === "Settled") events.push({ at: iso(addDays(new Date(adm.dischargedAt!), rng.int(4, 12))), status: status === "Settled" ? "Approved" : status, note: `Approved ₹${approvedAmount!.toLocaleString("en-IN")} after deductions of ₹${dedTotal.toLocaleString("en-IN")}.`, by });
    if (status === "Settled") events.push({ at: iso(addDays(new Date(adm.dischargedAt!), rng.int(14, 26))), status: "Settled", note: `Payment received via NEFT, UTR ${rng.digits(12)}.`, by });
    if (status === "Rejected") events.push({ at: iso(addDays(new Date(adm.dischargedAt!), rng.int(6, 14))), status: "Rejected", note: rng.pick(["Pre-existing disease within 2-year waiting period.", "Hospitalisation primarily for investigation, not payable under policy.", "Non-disclosure of alcohol use at proposal."]), by });

    const claim: Claim = {
      id: idOf("CLM", n, 4),
      claimNo: `${(p.insurance.tpaName ?? p.insurance.payerName).replace(/[^A-Z]/g, "").slice(0, 3) || "CLM"}/${format(admitted, "yyMM")}/${rng.digits(7)}`,
      patientId: p.id,
      billId: bill.id,
      admissionId: adm.id,
      insurerId: p.insurance.payerId,
      tpaId: tpa?.id,
      policyNo: p.insurance.policyNo,
      type: rng.chance(0.9) ? "Cashless" : "Reimbursement",
      status,
      claimedAmount: totals.net,
      preAuthAmount: status !== "Pre-auth requested" ? preAuthAmount : undefined,
      approvedAmount,
      settledAmount: status === "Settled" ? approvedAmount : undefined,
      deductions,
      diagnosis: adm.provisionalDiagnosis.map((d) => `${d.name} (${d.code})`).join(", "),
      submittedAt: events[0].at,
      updatedAt: events[events.length - 1].at,
      events: events.sort((a, b) => a.at.localeCompare(b.at)),
      documents: current ? DOCS.slice(0, rng.int(3, 5)) : [...DOCS, ...FINAL_DOCS.slice(0, rng.int(2, 4))],
      missingDocuments: missing,
    };
    bill.claimId = claim.id;
    adm.claimId = claim.id;
    claims.push(claim);
    n++;
  }
  return claims.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
