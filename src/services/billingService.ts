import { format } from "date-fns";
import type {
  AddPaymentInput,
  BillItem,
  BillView,
  CarePackage,
  Claim,
  ClaimStatus,
  ClaimView,
  ListParams,
  Paginated,
  Payer,
} from "@/types";
import { computeBillTotals } from "@/lib/billing-math";
import { localDate, todayLocal } from "@/lib/dates";
import { mock, notFound, ServiceError } from "./http";
import { billView, db, nextId, patientRef } from "./mappers";
import { oneOf, runQuery } from "./query";

function claimView(c: Claim): ClaimView {
  const d = db();
  const insurer = d.payers.find((p) => p.id === c.insurerId);
  return {
    ...c,
    patient: patientRef(c.patientId),
    insurerName: insurer?.shortName ?? c.insurerId,
    tpaName: c.tpaId?.replace("TPA-", ""),
    billNo: c.billId ? d.bills.find((b) => b.id === c.billId)?.billNo : undefined,
    ipNo: c.admissionId ? d.admissions.find((a) => a.id === c.admissionId)?.ipNo : undefined,
  };
}

const CLAIM_FLOW: ClaimStatus[] = ["Pre-auth requested", "Pre-auth approved", "Query raised", "Final bill submitted", "Approved", "Partially approved", "Settled", "Rejected"];

export const billingService = {
  getBills(params: ListParams = {}): Promise<Paginated<BillView>> {
    return mock(() =>
      runQuery(db().bills.map(billView), params, {
        search: (r) => [r.billNo, r.patient.fullName, r.patient.uhid, r.payerName],
        filters: {
          status: (r, v) => oneOf(r.status, v),
          encounterType: (r, v) => oneOf(r.encounterType, v),
          payerType: (r, v) => oneOf(r.payerType, v),
          due: (r, v) => (v === "true" ? r.totals.due > 0 : true),
        },
        sort: { createdAt: (r) => r.createdAt, patient: (r) => r.patient.fullName, net: (r) => r.totals.net, due: (r) => r.totals.due, status: (r) => r.status },
        date: (r) => r.createdAt,
        defaultSort: { id: "createdAt", desc: true },
      }),
    );
  },

  getBill(id: string): Promise<BillView> {
    return mock(() => billView(db().bills.find((b) => b.id === id) ?? notFound("Bill", id)));
  },

  getBillsByPatient(patientId: string): Promise<BillView[]> {
    return mock(() => db().bills.filter((b) => b.patientId === patientId).map(billView));
  },

  getBillForEncounter(encounterId: string): Promise<BillView | null> {
    return mock(() => {
      const b = db().bills.find((x) => x.encounterId === encounterId);
      return b ? billView(b) : null;
    });
  },

  addPayment(input: AddPaymentInput, collectedBy: string): Promise<BillView> {
    return mock(() => {
      const d = db();
      const bill = d.bills.find((b) => b.id === input.billId) ?? notFound("Bill", input.billId);
      if (bill.status === "Cancelled") throw new ServiceError("Bill is cancelled");
      const due = computeBillTotals(bill).due;
      if (input.amount <= 0) throw new ServiceError("Enter an amount greater than zero");
      if (input.amount > due + 0.5) throw new ServiceError(`Amount exceeds balance due of ₹${due.toLocaleString("en-IN")}`);
      const now = new Date();
      bill.payments.push({ id: nextId("PMT", d.bills.flatMap((b) => b.payments), 5), receiptNo: `RCPT/${format(now, "yyMMdd")}/${String(Math.floor(Math.random() * 9000) + 1000)}`, mode: input.mode, amount: Math.round(input.amount * 100) / 100, reference: input.reference, at: now.toISOString(), collectedBy });
      const t = computeBillTotals(bill);
      bill.status = t.due <= 0.5 ? "Paid" : bill.payerType === "Self" ? "Partially paid" : bill.status;
      d.activity.unshift({ id: nextId("ACT", d.activity), at: now.toISOString(), actor: collectedBy, actorRole: "Billing", verb: `collected ₹${input.amount.toLocaleString("en-IN")} via ${input.mode}`, target: bill.billNo, module: "Billing", href: `/billing/bills/${bill.id}`, severity: "neutral" });
      return billView(bill);
    });
  },

  addItem(billId: string, item: Omit<BillItem, "id" | "date">): Promise<BillView> {
    return mock(() => {
      const d = db();
      const bill = d.bills.find((b) => b.id === billId) ?? notFound("Bill", billId);
      if (bill.status === "Paid" || bill.status === "Cancelled") throw new ServiceError(`Cannot edit a ${bill.status.toLowerCase()} bill`);
      bill.items.push({ ...item, id: nextId("BI", d.bills.flatMap((b) => b.items), 6), date: new Date().toISOString() });
      return billView(bill);
    });
  },

  removeItem(billId: string, itemId: string): Promise<BillView> {
    return mock(() => {
      const bill = db().bills.find((b) => b.id === billId) ?? notFound("Bill", billId);
      if (bill.status === "Paid" || bill.status === "Cancelled") throw new ServiceError(`Cannot edit a ${bill.status.toLowerCase()} bill`);
      bill.items = bill.items.filter((i) => i.id !== itemId);
      return billView(bill);
    });
  },

  applyDiscount(billId: string, itemId: string, discount: number): Promise<BillView> {
    return mock(() => {
      const bill = db().bills.find((b) => b.id === billId) ?? notFound("Bill", billId);
      const item = bill.items.find((i) => i.id === itemId) ?? notFound("Bill item", itemId);
      if (discount < 0 || discount > item.qty * item.rate) throw new ServiceError("Discount must be between zero and the line amount");
      item.discount = discount;
      return billView(bill);
    });
  },

  getPayers(): Promise<Payer[]> {
    return mock(() => db().payers, { min: 50, max: 120 });
  },

  getPackages(): Promise<CarePackage[]> {
    return mock(() => db().packages);
  },

  updatePackage(id: string, patch: Partial<Omit<CarePackage, "id">>): Promise<CarePackage> {
    return mock(() => {
      const p = db().packages.find((x) => x.id === id) ?? notFound("Package", id);
      Object.assign(p, patch);
      return p;
    });
  },

  getClaims(params: ListParams = {}): Promise<Paginated<ClaimView>> {
    return mock(() =>
      runQuery(db().claims.map(claimView), params, {
        search: (r) => [r.claimNo, r.patient.fullName, r.patient.uhid, r.insurerName, r.tpaName, r.policyNo, r.diagnosis, r.ipNo],
        filters: {
          status: (r, v) => oneOf(r.status, v),
          insurerId: (r, v) => oneOf(r.insurerId, v),
          type: (r, v) => oneOf(r.type, v),
          open: (r, v) => (v === "true" ? !["Settled", "Rejected"].includes(r.status) : true),
        },
        sort: { updatedAt: (r) => r.updatedAt, claimedAmount: (r) => r.claimedAmount, patient: (r) => r.patient.fullName, status: (r) => CLAIM_FLOW.indexOf(r.status) },
        date: (r) => r.submittedAt,
        defaultSort: { id: "updatedAt", desc: true },
      }),
    );
  },

  getClaim(id: string): Promise<ClaimView> {
    return mock(() => claimView(db().claims.find((c) => c.id === id) ?? notFound("Claim", id)));
  },

  updateClaim(id: string, update: { status: ClaimStatus; note: string; approvedAmount?: number; uploadedDocuments?: string[] }, by: string): Promise<ClaimView> {
    return mock(() => {
      const c = db().claims.find((x) => x.id === id) ?? notFound("Claim", id);
      const now = new Date().toISOString();
      if (update.uploadedDocuments?.length) {
        c.documents.push(...update.uploadedDocuments);
        c.missingDocuments = c.missingDocuments.filter((m) => !update.uploadedDocuments!.includes(m));
      }
      c.status = update.status;
      if (update.approvedAmount !== undefined) c.approvedAmount = update.approvedAmount;
      if (update.status === "Settled") c.settledAmount = c.approvedAmount ?? c.claimedAmount;
      c.events.push({ at: now, status: update.status, note: update.note, by });
      c.updatedAt = now;
      return claimView(c);
    });
  },

  stats(): Promise<{ collectedToday: number; billedToday: number; outstanding: number; openClaims: number; openClaimValue: number; queries: number; byMode: Record<string, number> }> {
    return mock(() => {
      const d = db();
      const t = todayLocal();
      const byMode: Record<string, number> = {};
      let collected = 0;
      for (const b of d.bills) for (const p of b.payments) if (localDate(p.at) === t) {
        collected += p.amount;
        byMode[p.mode] = (byMode[p.mode] ?? 0) + p.amount;
      }
      const open = d.claims.filter((c) => !["Settled", "Rejected"].includes(c.status));
      return {
        collectedToday: Math.round(collected),
        billedToday: Math.round(d.bills.filter((b) => localDate(b.createdAt) === t).reduce((s, b) => s + computeBillTotals(b).net, 0)),
        outstanding: Math.round(d.bills.filter((b) => b.payerType === "Self").reduce((s, b) => s + computeBillTotals(b).due, 0)),
        openClaims: open.length,
        openClaimValue: open.reduce((s, c) => s + c.claimedAmount, 0),
        queries: d.claims.filter((c) => c.status === "Query raised").length,
        byMode,
      };
    });
  },
};
