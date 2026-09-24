import { differenceInCalendarDays, format } from "date-fns";
import { localDate } from "@/lib/dates";
import type { DispenseLine, Drug, ListParams, NewPrescriptionInput, Paginated, Prescription, PrescriptionView, StockBatch, StockRow } from "@/types";
import { mock, notFound, ServiceError } from "./http";
import { db, nextId, patientRef, prescriptionView } from "./mappers";
import { oneOf, runQuery } from "./query";

const today = () => format(new Date(), "yyyy-MM-dd");

function stockRow(drug: Drug): StockRow {
  const t = today();
  const batches = db().stock.filter((b) => b.drugId === drug.id).sort((a, b) => a.expiry.localeCompare(b.expiry));
  const valid = batches.filter((b) => b.expiry >= t);
  const onHand = valid.reduce((s, b) => s + b.qty, 0);
  const expiring = valid.filter((b) => differenceInCalendarDays(new Date(b.expiry), new Date()) <= 90);
  return {
    drug,
    onHand,
    batches,
    nearestExpiry: valid.find((b) => b.qty > 0)?.expiry,
    expiringQty: expiring.reduce((s, b) => s + b.qty, 0),
    expiredQty: batches.filter((b) => b.expiry < t).reduce((s, b) => s + b.qty, 0),
    belowReorder: onHand < drug.reorderLevel,
    stockValue: Math.round(valid.reduce((s, b) => s + b.qty * b.purchaseRate, 0)),
  };
}

export const pharmacyService = {
  searchDrugs(query: string, limit = 12): Promise<(Drug & { onHand: number })[]> {
    return mock(
      () => {
        const q = query.trim().toLowerCase();
        return db()
          .drugs.filter((d) => !q || [d.brand, d.generic, d.drugClass].join(" ").toLowerCase().includes(q))
          .slice(0, limit)
          .map((d) => ({ ...d, onHand: stockRow(d).onHand }));
      },
      { min: 60, max: 160 },
    );
  },

  getQueue(params: ListParams = {}): Promise<Paginated<PrescriptionView>> {
    return mock(() =>
      runQuery(db().prescriptions.map(prescriptionView), params, {
        search: (r) => [r.rxNo, r.patient.fullName, r.patient.uhid, r.doctor.name, r.diagnosis, ...r.items.map((i) => i.drug.brand), ...r.items.map((i) => i.drug.generic)],
        filters: {
          status: (r, v) => oneOf(r.status, v),
          source: (r, v) => oneOf(r.source, v),
          outOfStock: (r, v) => (v === "true" ? r.items.some((i) => i.onHand < i.qty - i.dispensedQty) : true),
        },
        sort: { createdAt: (r) => r.createdAt, patient: (r) => r.patient.fullName, value: (r) => r.totalValue, status: (r) => ["Pending", "Partially dispensed", "Dispensed", "Cancelled"].indexOf(r.status) },
        date: (r) => r.createdAt,
        defaultSort: { id: "createdAt", desc: true },
      }),
    );
  },

  getPrescription(id: string): Promise<PrescriptionView> {
    return mock(() => prescriptionView(db().prescriptions.find((r) => r.id === id) ?? notFound("Prescription", id)));
  },

  getByPatient(patientId: string): Promise<PrescriptionView[]> {
    return mock(() => db().prescriptions.filter((r) => r.patientId === patientId).map(prescriptionView).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  },

  /** Batches for a drug in FEFO order (first expiry, first out), excluding expired. */
  getBatches(drugId: string): Promise<StockBatch[]> {
    return mock(() => db().stock.filter((b) => b.drugId === drugId && b.expiry >= today() && b.qty > 0).sort((a, b) => a.expiry.localeCompare(b.expiry)), { min: 60, max: 140 });
  },

  createPrescription(input: NewPrescriptionInput): Promise<PrescriptionView> {
    return mock(() => {
      const d = db();
      if (!input.items.length) throw new ServiceError("Add at least one medicine");
      const now = new Date();
      const id = nextId("RX", d.prescriptions, 5);
      const rx: Prescription = {
        id,
        rxNo: `RX/${format(now, "yyMMdd")}/${id.slice(-4)}`,
        ...input,
        createdAt: now.toISOString(),
        items: input.items.map((it, i) => ({ ...it, id: `${id}-I${i + 1}`, dispensedQty: 0 })),
        status: "Pending",
      };
      d.prescriptions.push(rx);
      return prescriptionView(rx);
    });
  },

  dispense(rxId: string, lines: DispenseLine[], pharmacist: string): Promise<PrescriptionView> {
    return mock(() => {
      const d = db();
      const rx = d.prescriptions.find((r) => r.id === rxId) ?? notFound("Prescription", rxId);
      for (const line of lines) {
        const item = rx.items.find((i) => i.id === line.rxItemId) ?? notFound("Prescription item", line.rxItemId);
        const batch = d.stock.find((b) => b.id === line.batchId) ?? notFound("Batch", line.batchId);
        if (batch.expiry < today()) throw new ServiceError(`Batch ${batch.batchNo} is expired`);
        if (line.qty > batch.qty) throw new ServiceError(`Only ${batch.qty} units left in batch ${batch.batchNo}`);
        const remaining = item.qty - item.dispensedQty;
        const qty = Math.min(line.qty, remaining);
        batch.qty -= qty;
        item.dispensedQty += qty;
      }
      const complete = rx.items.every((i) => i.dispensedQty >= i.qty);
      const any = rx.items.some((i) => i.dispensedQty > 0);
      rx.status = complete ? "Dispensed" : any ? "Partially dispensed" : "Pending";
      rx.dispensedAt = new Date().toISOString();
      rx.dispensedBy = pharmacist;
      d.activity.unshift({ id: nextId("ACT", d.activity), at: rx.dispensedAt, actor: pharmacist, actorRole: "Pharmacist", verb: "dispensed", target: `${rx.rxNo} for ${patientRef(rx.patientId).fullName}`, module: "Pharmacy", href: `/pharmacy/dispense/${rx.id}`, severity: "neutral" });
      return prescriptionView(rx);
    });
  },

  cancel(rxId: string): Promise<PrescriptionView> {
    return mock(() => {
      const rx = db().prescriptions.find((r) => r.id === rxId) ?? notFound("Prescription", rxId);
      rx.status = "Cancelled";
      return prescriptionView(rx);
    });
  },

  getStock(params: ListParams = {}): Promise<Paginated<StockRow>> {
    return mock(() =>
      runQuery(db().drugs.map(stockRow), params, {
        search: (r) => [r.drug.brand, r.drug.generic, r.drug.drugClass, r.drug.manufacturer, ...r.batches.map((b) => b.batchNo)],
        filters: {
          form: (r, v) => oneOf(r.drug.form, v),
          schedule: (r, v) => oneOf(r.drug.schedule, v),
          filter: (r, v) => (v === "low" ? r.belowReorder : v === "expiring" ? r.expiringQty > 0 : v === "expired" ? r.expiredQty > 0 : v === "highAlert" ? Boolean(r.drug.highAlert) : true),
        },
        sort: { brand: (r) => r.drug.brand, onHand: (r) => r.onHand, nearestExpiry: (r) => r.nearestExpiry ?? "9999", value: (r) => r.stockValue, reorder: (r) => r.onHand / Math.max(1, r.drug.reorderLevel) },
        defaultSort: { id: "reorder", desc: false },
      }),
    );
  },

  stats(): Promise<{ pendingRx: number; dispensedToday: number; lowStock: number; expiring30: number; expired: number; stockValue: number }> {
    return mock(() => {
      const d = db();
      const rows = d.drugs.map(stockRow);
      const t = today();
      return {
        pendingRx: d.prescriptions.filter((r) => r.status === "Pending" || r.status === "Partially dispensed").length,
        dispensedToday: d.prescriptions.filter((r) => r.dispensedAt !== undefined && localDate(r.dispensedAt) === t).length,
        lowStock: rows.filter((r) => r.belowReorder).length,
        expiring30: d.stock.filter((b) => b.qty > 0 && b.expiry >= t && differenceInCalendarDays(new Date(b.expiry), new Date()) <= 30).length,
        expired: d.stock.filter((b) => b.qty > 0 && b.expiry < t).length,
        stockValue: rows.reduce((s, r) => s + r.stockValue, 0),
      };
    });
  },

  /** Quarantine an expired / recalled batch (sets quantity to zero). */
  removeBatch(batchId: string): Promise<StockBatch> {
    return mock(() => {
      const b = db().stock.find((x) => x.id === batchId) ?? notFound("Batch", batchId);
      b.qty = 0;
      return b;
    });
  },
};
