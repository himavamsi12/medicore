import { format } from "date-fns";
import { localDate } from "@/lib/dates";
import type { LabOrder, LabOrderStatus, LabOrderView, LabResult, LabTest, ListParams, Paginated, Priority } from "@/types";
import { LAB_TEST_MAP, LAB_TESTS } from "@/data/reference/labTests";
import { flagResult } from "@/lib/clinical";
import { mock, notFound, ServiceError } from "./http";
import { db, labOrderView, nextId, patientRef } from "./mappers";
import { oneOf, runQuery } from "./query";

const FLOW: LabOrderStatus[] = ["Ordered", "Collected", "Processing", "Resulted", "Verified"];

export const labService = {
  getTests(): Promise<LabTest[]> {
    return mock(() => LAB_TESTS, { min: 50, max: 120 });
  },

  getOrders(params: ListParams = {}): Promise<Paginated<LabOrderView>> {
    return mock(() =>
      runQuery(db().labOrders.map(labOrderView), params, {
        search: (r) => [r.orderNo, r.sampleId, r.patient.fullName, r.patient.uhid, r.orderedBy.name, ...r.tests.map((t) => t.name), ...r.testCodes],
        filters: {
          status: (r, v) => oneOf(r.status, v),
          priority: (r, v) => oneOf(r.priority, v),
          source: (r, v) => oneOf(r.source, v),
          category: (r, v) => r.tests.some((t) => oneOf(t.category, v)),
          abnormal: (r, v) => (v === "critical" ? r.criticalCount > 0 : v === "abnormal" ? r.abnormalCount > 0 : true),
          pending: (r, v) => (v === "true" ? !["Verified", "Rejected"].includes(r.status) : true),
        },
        sort: {
          orderedAt: (r) => r.orderedAt,
          patient: (r) => r.patient.fullName,
          priority: (r) => ["STAT", "Urgent", "Routine"].indexOf(r.priority),
          status: (r) => FLOW.indexOf(r.status as LabOrderStatus),
          tat: (r) => r.tatMinutes,
        },
        date: (r) => r.orderedAt,
        defaultSort: { id: "orderedAt", desc: true },
      }),
    );
  },

  getOrder(id: string): Promise<LabOrderView> {
    return mock(() => labOrderView(db().labOrders.find((o) => o.id === id) ?? notFound("Lab order", id)));
  },

  getOrdersByPatient(patientId: string): Promise<LabOrderView[]> {
    return mock(() => db().labOrders.filter((o) => o.patientId === patientId).map(labOrderView).sort((a, b) => b.orderedAt.localeCompare(a.orderedAt)));
  },

  /** Board data for sample tracking: open orders grouped by status. */
  getPipeline(): Promise<LabOrderView[]> {
    return mock(() => {
      const since = Date.now() - 36 * 3600000;
      return db()
        .labOrders.filter((o) => o.status !== "Verified" || (o.verifiedAt && new Date(o.verifiedAt).getTime() > Date.now() - 6 * 3600000))
        .filter((o) => new Date(o.orderedAt).getTime() > since)
        .map(labOrderView)
        .sort((a, b) => ["STAT", "Urgent", "Routine"].indexOf(a.priority) - ["STAT", "Urgent", "Routine"].indexOf(b.priority) || a.orderedAt.localeCompare(b.orderedAt));
    });
  },

  createOrder(input: { patientId: string; orderedById: string; source: LabOrder["source"]; encounterId?: string; priority: Priority; testCodes: string[] }): Promise<LabOrderView> {
    return mock(() => {
      const d = db();
      if (!input.testCodes.length) throw new ServiceError("Select at least one test");
      const now = new Date();
      const n = d.labOrders.length + 1;
      const order: LabOrder = {
        id: nextId("LAB", d.labOrders, 5),
        orderNo: `LO/${format(now, "yyMMdd")}/${String(n).padStart(4, "0")}`,
        sampleId: `S${format(now, "yyMMdd")}${String(1000 + n).slice(-4)}`,
        ...input,
        orderedAt: now.toISOString(),
        status: "Ordered",
        results: [],
      };
      d.labOrders.push(order);
      return labOrderView(order);
    });
  },

  /** Advance a sample along collected, processing (the tracking board). */
  advance(id: string, to: LabOrderStatus, by = "Lab Technician", reason?: string): Promise<LabOrderView> {
    return mock(() => {
      const o = db().labOrders.find((x) => x.id === id) ?? notFound("Lab order", id);
      if (to === "Verified" || to === "Resulted") throw new ServiceError("Use result entry to result or verify an order");
      const now = new Date().toISOString();
      if (to === "Collected") Object.assign(o, { status: to, collectedAt: now, collectedBy: by, rejectionReason: undefined });
      if (to === "Processing") Object.assign(o, { status: to, processingAt: now, collectedAt: o.collectedAt ?? now });
      if (to === "Rejected") Object.assign(o, { status: to, rejectionReason: reason ?? "Sample rejected at accessioning" });
      if (to === "Ordered") Object.assign(o, { status: to });
      return labOrderView(o);
    });
  },

  saveResults(id: string, values: { testCode: string; paramCode: string; value: number | string }[], remarks: string | undefined, verify: boolean, by: string): Promise<LabOrderView> {
    return mock(() => {
      const d = db();
      const o = d.labOrders.find((x) => x.id === id) ?? notFound("Lab order", id);
      const results: LabResult[] = values.map((v) => {
        const param = LAB_TEST_MAP[v.testCode]?.parameters.find((p) => p.code === v.paramCode);
        if (!param) throw new ServiceError(`Unknown parameter ${v.paramCode}`);
        return { ...v, flag: flagResult(param, v.value) };
      });
      const now = new Date().toISOString();
      o.results = results;
      o.remarks = remarks;
      o.resultedAt ??= now;
      o.collectedAt ??= now;
      o.processingAt ??= now;
      o.status = verify ? "Verified" : "Resulted";
      if (verify) {
        o.verifiedAt = now;
        o.verifiedBy = by;
        const crit = results.filter((r) => r.flag === "HH" || r.flag === "LL");
        if (crit.length) {
          const p = LAB_TEST_MAP[crit[0].testCode].parameters.find((x) => x.code === crit[0].paramCode)!;
          d.notifications.unshift({ id: nextId("NTF", d.notifications, 4), at: now, title: `Critical value: ${p.name} ${crit[0].value} ${p.unit}`.trim(), body: `${patientRef(o.patientId).fullName} (${o.orderNo}). Inform treating doctor.`, severity: "critical", module: "Laboratory", href: `/lab/orders/${o.id}`, read: false, roles: ["Admin", "Doctor", "Nurse", "Lab Technician"] });
        }
      }
      return labOrderView(o);
    });
  },

  /** Historical values of one parameter for a patient (trend charts). */
  getParameterTrend(patientId: string, paramCode: string): Promise<{ at: string; value: number; flag: LabResult["flag"] }[]> {
    return mock(() =>
      db()
        .labOrders.filter((o) => o.patientId === patientId && o.results.length)
        .flatMap((o) => o.results.filter((r) => r.paramCode === paramCode && typeof r.value === "number").map((r) => ({ at: o.resultedAt ?? o.orderedAt, value: r.value as number, flag: r.flag })))
        .sort((a, b) => a.at.localeCompare(b.at)),
    );
  },

  stats(): Promise<{ pending: number; stat: number; criticalToday: number; avgTatMinutes: number; verifiedToday: number; rejectedToday: number }> {
    return mock(() => {
      const d = db();
      const today = format(new Date(), "yyyy-MM-dd");
      const done = d.labOrders.filter((o) => o.verifiedAt && localDate(o.verifiedAt) === today);
      return {
        pending: d.labOrders.filter((o) => !["Verified", "Rejected"].includes(o.status)).length,
        stat: d.labOrders.filter((o) => o.priority === "STAT" && !["Verified", "Rejected"].includes(o.status)).length,
        criticalToday: d.labOrders.filter((o) => o.resultedAt !== undefined && localDate(o.resultedAt) === today && o.results.some((r) => r.flag === "HH" || r.flag === "LL")).length,
        avgTatMinutes: Math.round(done.reduce((s, o) => s + (new Date(o.verifiedAt!).getTime() - new Date(o.orderedAt).getTime()) / 60000, 0) / Math.max(1, done.length)),
        verifiedToday: done.length,
        rejectedToday: d.labOrders.filter((o) => o.status === "Rejected").length,
      };
    });
  },
};
