import { format, subDays } from "date-fns";
import { getAnalytics, type DailyMetrics } from "@/data/analytics";
import { LAB_TEST_MAP } from "@/data/reference/labTests";
import { computeBillTotals } from "@/lib/billing-math";
import { mock } from "./http";
import { db } from "./mappers";

export type ReportRange = 7 | 30 | 90 | 180;

const totalRevenue = (d: DailyMetrics) => d.revenue.opd + d.revenue.ipd + d.revenue.pharmacy + d.revenue.diagnostics + d.revenue.er;

function slice(range: ReportRange) {
  return getAnalytics().daily.slice(-range);
}

function previous(range: ReportRange) {
  const all = getAnalytics().daily;
  return all.slice(Math.max(0, all.length - range * 2), all.length - range);
}

export interface RevenueSummary {
  total: number;
  previousTotal: number;
  byStream: { stream: string; value: number }[];
  arpob: number; // average revenue per occupied bed per day
}

export const reportService = {
  getDaily(range: ReportRange): Promise<DailyMetrics[]> {
    return mock(() => slice(range));
  },

  getRevenueSummary(range: ReportRange): Promise<RevenueSummary> {
    return mock(() => {
      const cur = slice(range);
      const prev = previous(range);
      const sum = (k: keyof DailyMetrics["revenue"]) => cur.reduce((s, d) => s + d.revenue[k], 0);
      const total = cur.reduce((s, d) => s + totalRevenue(d), 0);
      const occupiedBedDays = cur.reduce((s, d) => s + (d.occupancyPct / 100) * 144, 0);
      return {
        total,
        previousTotal: prev.reduce((s, d) => s + totalRevenue(d), 0),
        byStream: [
          { stream: "Inpatient", value: sum("ipd") },
          { stream: "Pharmacy", value: sum("pharmacy") },
          { stream: "Diagnostics", value: sum("diagnostics") },
          { stream: "Outpatient", value: sum("opd") },
          { stream: "Emergency", value: sum("er") },
        ],
        arpob: Math.round(sum("ipd") / Math.max(1, occupiedBedDays)),
      };
    });
  },

  getDepartmentRevenue(range: ReportRange): Promise<{ departmentId: string; department: string; revenue: number; opd: number; admissions: number; growth: number }[]> {
    return mock(() => {
      const { departments } = getAnalytics();
      const d = db();
      const since = format(subDays(new Date(), range), "yyyy-MM");
      const prevSince = format(subDays(new Date(), range * 2), "yyyy-MM");
      const cur = departments.filter((x) => x.month >= since);
      const prev = departments.filter((x) => x.month >= prevSince && x.month < since);
      const ids = [...new Set(cur.map((x) => x.departmentId))];
      return ids
        .map((id) => {
          const c = cur.filter((x) => x.departmentId === id);
          const p = prev.filter((x) => x.departmentId === id);
          const revenue = c.reduce((s, x) => s + x.revenue, 0);
          const prevRev = p.reduce((s, x) => s + x.revenue, 0) || revenue;
          return {
            departmentId: id,
            department: d.departments.find((x) => x.id === id)?.name ?? id,
            revenue,
            opd: c.reduce((s, x) => s + x.opd, 0),
            admissions: c.reduce((s, x) => s + x.admissions, 0),
            growth: Math.round(((revenue / c.length - prevRev / Math.max(1, p.length)) / Math.max(1, prevRev / Math.max(1, p.length))) * 1000) / 10,
          };
        })
        .sort((a, b) => b.revenue - a.revenue);
    });
  },

  /** Doctor performance computed from live transactional data (last 14 days). */
  getDoctorPerformance(): Promise<{ doctorId: string; name: string; department: string; consults: number; newPatients: number; admissions: number; revenue: number; noShowRate: number; rating: number; avgWaitMin: number }[]> {
    return mock(() => {
      const d = db();
      return d.doctors
        .map((doc) => {
          const appts = d.appointments.filter((a) => a.doctorId === doc.id && a.date <= format(new Date(), "yyyy-MM-dd"));
          const done = appts.filter((a) => a.status === "Completed");
          const noShow = appts.filter((a) => a.status === "No show").length;
          const bills = d.bills.filter((b) => (b.encounterType === "OPD" && done.some((a) => a.id === b.encounterId)) || (b.encounterType === "IPD" && d.admissions.some((x) => x.id === b.encounterId && x.admittingDoctorId === doc.id)));
          const waits = done.filter((a) => a.checkedInAt && a.calledAt).map((a) => (new Date(a.calledAt!).getTime() - new Date(a.checkedInAt!).getTime()) / 60000);
          return {
            doctorId: doc.id,
            name: doc.name,
            department: d.departments.find((x) => x.id === doc.departmentId)?.name ?? "",
            consults: done.length,
            newPatients: done.filter((a) => a.type === "New").length,
            admissions: d.admissions.filter((a) => a.admittingDoctorId === doc.id).length,
            revenue: Math.round(bills.reduce((s, b) => s + computeBillTotals(b).net, 0)),
            noShowRate: appts.length ? Math.round((noShow / appts.length) * 1000) / 10 : 0,
            rating: doc.rating,
            avgWaitMin: waits.length ? Math.round(waits.reduce((s, w) => s + w, 0) / waits.length) : 0,
          };
        })
        .filter((r) => r.consults > 0 || r.admissions > 0)
        .sort((a, b) => b.revenue - a.revenue);
    });
  },

  /** Lab turnaround by test category from verified orders, against target TAT. */
  getLabTat(): Promise<{ category: string; orders: number; medianMin: number; p90Min: number; withinTargetPct: number; targetMin: number }[]> {
    return mock(() => {
      const byCat = new Map<string, { tat: number; target: number }[]>();
      for (const o of db().labOrders) {
        if (!o.verifiedAt) continue;
        const tat = (new Date(o.verifiedAt).getTime() - new Date(o.orderedAt).getTime()) / 60000;
        const tests = o.testCodes.map((c) => LAB_TEST_MAP[c]).filter(Boolean);
        const target = Math.max(...tests.map((t) => t.tatHours)) * 60 * (o.priority === "STAT" ? 0.35 : o.priority === "Urgent" ? 0.6 : 1);
        const cat = tests[0]?.category ?? "Other";
        byCat.set(cat, [...(byCat.get(cat) ?? []), { tat, target }]);
      }
      return [...byCat.entries()]
        .map(([category, rows]) => {
          const sorted = rows.map((r) => r.tat).sort((a, b) => a - b);
          return {
            category,
            orders: rows.length,
            medianMin: Math.round(sorted[Math.floor(sorted.length / 2)]),
            p90Min: Math.round(sorted[Math.floor(sorted.length * 0.9)]),
            withinTargetPct: Math.round((rows.filter((r) => r.tat <= r.target).length / rows.length) * 1000) / 10,
            targetMin: Math.round(rows.reduce((s, r) => s + r.target, 0) / rows.length),
          };
        })
        .sort((a, b) => b.orders - a.orders);
    });
  },

  getPayerMix(): Promise<{ payer: string; bills: number; value: number }[]> {
    return mock(() => {
      const d = db();
      const map = new Map<string, { bills: number; value: number }>();
      for (const b of d.bills) {
        const key = b.payerType === "Self" ? "Self-pay" : b.payerType === "Government" ? "Govt. schemes" : b.payerType;
        const e = map.get(key) ?? { bills: 0, value: 0 };
        e.bills++;
        e.value += computeBillTotals(b).net;
        map.set(key, e);
      }
      return [...map.entries()].map(([payer, v]) => ({ payer, bills: v.bills, value: Math.round(v.value) })).sort((a, b) => b.value - a.value);
    });
  },
};
