import { differenceInCalendarDays, differenceInMinutes } from "date-fns";
import type { Kpi, Role } from "@/types";
import { getAnalytics } from "@/data/analytics";
import { computeBillTotals } from "@/lib/billing-math";
import { news2 } from "@/lib/clinical";
import { localDate, todayLocal } from "@/lib/dates";
import { ROLE_PERSONA } from "@/lib/rbac";
import { mock } from "./http";
import { clinicNow, db, latestVitals } from "./mappers";

const ACTIVE_ER = ["Waiting", "In triage", "Under treatment", "Observation"];

function history(pick: (d: ReturnType<typeof getAnalytics>["daily"][number]) => number, days = 14): number[] {
  return getAnalytics().daily.slice(-days).map(pick);
}

function deltaVsLastWeek(series: number[], today: number): number {
  const lastWeek = series[series.length - 8] ?? series[0];
  return lastWeek ? Math.round(((today - lastWeek) / lastWeek) * 1000) / 10 : 0;
}

export const dashboardService = {
  getKpis(role: Role): Promise<Kpi[]> {
    return mock(() => {
      const d = db();
      const today = todayLocal();
      const apptsToday = d.appointments.filter((a) => a.date === today && a.status !== "Cancelled");
      const activeAdm = d.admissions.filter((a) => !a.dischargedAt);
      const inpatientBeds = d.beds.filter((b) => b.wardId !== "WRD-ER");
      const occupancy = (inpatientBeds.filter((b) => b.status === "Occupied").length / inpatientBeds.length) * 100;
      const er = d.erCases.filter((e) => ACTIVE_ER.includes(e.status));
      const pendingLab = d.labOrders.filter((o) => !["Verified", "Rejected"].includes(o.status));
      let collected = 0;
      for (const b of d.bills) for (const p of b.payments) if (localDate(p.at) === today) collected += p.amount;

      const opdSeries = history((x) => x.opdFootfall);
      const occSeries = history((x) => x.occupancyPct);
      const revSeries = history((x) => x.revenue.opd + x.revenue.ipd + x.revenue.pharmacy + x.revenue.diagnostics + x.revenue.er);
      const admSeries = history((x) => x.admissions);
      const erSeries = history((x) => x.erArrivals);

      if (role === "Admin") {
        return [
          { id: "opd", label: "OPD today", value: apptsToday.length, format: "number", delta: deltaVsLastWeek(opdSeries, apptsToday.length), deltaLabel: "vs same day last week", goodDirection: "up", spark: opdSeries, href: "/opd/appointments" },
          { id: "admissions", label: "Inpatients", value: activeAdm.length, format: "number", delta: d.admissions.filter((a) => localDate(a.admittedAt) === today).length, deltaLabel: "admitted today", spark: admSeries, href: "/ipd/admissions" },
          { id: "occupancy", label: "Bed occupancy", value: Math.round(occupancy * 10) / 10, format: "percent", delta: Math.round((occupancy - occSeries[occSeries.length - 8]) * 10) / 10, deltaLabel: "pts vs last week", spark: occSeries, severity: occupancy > 90 ? "critical" : occupancy > 82 ? "warning" : undefined, href: "/ipd/beds" },
          { id: "revenue", label: "Collections today", value: Math.round(collected), format: "inr", deltaLabel: "cash, UPI, card and TPA", spark: revSeries, goodDirection: "up", href: "/billing/bills" },
          { id: "er", label: "ER load", value: er.length, format: "number", delta: er.filter((e) => (e.triageLevel ?? 5) <= 2).length, deltaLabel: "level 1-2 patients", spark: erSeries, severity: er.length > 10 ? "warning" : undefined, href: "/emergency" },
          { id: "lab", label: "Pending lab reports", value: pendingLab.length, format: "number", delta: pendingLab.filter((o) => o.priority === "STAT").length, deltaLabel: "STAT", href: "/lab/orders" },
        ];
      }

      if (role === "Doctor") {
        const docId = ROLE_PERSONA.Doctor.doctorId!;
        const mine = apptsToday.filter((a) => a.doctorId === docId);
        const myAdm = activeAdm.filter((a) => a.admittingDoctorId === docId);
        const myPatients = new Set([...mine.map((a) => a.patientId), ...myAdm.map((a) => a.patientId)]);
        const critical = d.labOrders.filter((o) => myPatients.has(o.patientId) && o.results.some((r) => r.flag === "HH" || r.flag === "LL") && o.resultedAt && differenceInCalendarDays(new Date(), new Date(o.resultedAt)) <= 1);
        const pendingMine = d.labOrders.filter((o) => o.orderedById === docId && !["Verified", "Rejected"].includes(o.status));
        return [
          { id: "queue", label: "Waiting for you", value: mine.filter((a) => a.status === "Checked in").length, format: "number", delta: mine.filter((a) => a.status === "Completed").length, deltaLabel: "seen today", href: "/opd/queue" },
          { id: "opd", label: "My OPD today", value: mine.length, format: "number", deltaLabel: "booked appointments", href: "/opd/appointments" },
          { id: "inpatients", label: "My inpatients", value: myAdm.length, format: "number", delta: myAdm.filter((a) => a.status === "Discharge planned").length, deltaLabel: "discharges planned", href: "/ipd/admissions" },
          { id: "critical", label: "Critical results", value: critical.length, format: "number", deltaLabel: "last 24 hours", severity: critical.length ? "critical" : undefined, href: "/lab/orders" },
          { id: "pending", label: "Reports awaited", value: pendingMine.length, format: "number", deltaLabel: "lab orders in progress", href: "/lab/orders" },
        ];
      }

      if (role === "Nurse") {
        const wardId = ROLE_PERSONA.Nurse.wardId!;
        const wardAdm = activeAdm.filter((a) => a.wardId === wardId);
        const scores = wardAdm.map((a) => {
          const v = latestVitals(a.patientId);
          return v ? news2(v) : 0;
        });
        const ids = new Set(wardAdm.map((a) => a.id));
        const mar = d.mar.filter((m) => ids.has(m.admissionId) && m.status === "Due");
        const now = Date.now();
        return [
          { id: "patients", label: "Patients in ward", value: wardAdm.length, format: "number", deltaLabel: d.wards.find((w) => w.id === wardId)?.name, href: "/nursing" },
          { id: "news", label: "NEWS2 5 or above", value: scores.filter((s) => s >= 5).length, format: "number", deltaLabel: "need urgent review", severity: scores.some((s) => s >= 7) ? "critical" : scores.some((s) => s >= 5) ? "warning" : undefined, href: "/nursing" },
          { id: "due", label: "Meds due in 1 hour", value: mar.filter((m) => new Date(m.scheduledAt).getTime() - now < 3600000 && new Date(m.scheduledAt).getTime() >= now - 1800000).length, format: "number", href: "/nursing?tab=mar" },
          { id: "overdue", label: "Overdue meds", value: mar.filter((m) => new Date(m.scheduledAt).getTime() < now - 1800000).length, format: "number", severity: "warning", href: "/nursing?tab=mar" },
          { id: "handover", label: "Unacknowledged handovers", value: d.handovers.filter((h) => h.wardId === wardId && !h.acknowledged).length, format: "number", href: "/nursing?tab=handover" },
        ];
      }

      if (role === "Receptionist") {
        const waiting = apptsToday.filter((a) => a.status === "Checked in");
        const avgWait = waiting.length ? Math.round(waiting.reduce((s, a) => s + Math.max(0, differenceInMinutes(clinicNow(), new Date(a.checkedInAt!))), 0) / waiting.length) : 0;
        return [
          { id: "appts", label: "Appointments today", value: apptsToday.length, format: "number", delta: apptsToday.filter((a) => a.status === "Scheduled").length, deltaLabel: "yet to arrive", spark: opdSeries, href: "/opd/appointments" },
          { id: "waiting", label: "In waiting area", value: waiting.length, format: "number", deltaLabel: "checked in", href: "/opd/queue" },
          { id: "wait", label: "Average wait", value: avgWait, format: "minutes", severity: avgWait > 40 ? "warning" : undefined, href: "/opd/queue" },
          { id: "reg", label: "New registrations", value: d.patients.filter((p) => localDate(p.registeredAt) === today).length + history((x) => x.newRegistrations, 1)[0], format: "number", href: "/patients" },
          { id: "beds", label: "Beds available", value: inpatientBeds.filter((b) => b.status === "Available").length, format: "number", deltaLabel: `${inpatientBeds.filter((b) => b.status === "Cleaning").length} being cleaned`, href: "/ipd/beds" },
        ];
      }

      if (role === "Lab Technician") {
        const verifiedToday = d.labOrders.filter((o) => o.verifiedAt && localDate(o.verifiedAt) === today);
        const tat = verifiedToday.length ? Math.round(verifiedToday.reduce((s, o) => s + differenceInMinutes(new Date(o.verifiedAt!), new Date(o.orderedAt)), 0) / verifiedToday.length) : 0;
        return [
          { id: "collect", label: "Awaiting collection", value: pendingLab.filter((o) => o.status === "Ordered").length, format: "number", href: "/lab/samples" },
          { id: "process", label: "In processing", value: pendingLab.filter((o) => o.status === "Collected" || o.status === "Processing").length, format: "number", delta: pendingLab.filter((o) => o.priority === "STAT").length, deltaLabel: "STAT", href: "/lab/samples" },
          { id: "verify", label: "Awaiting verification", value: pendingLab.filter((o) => o.status === "Resulted").length, format: "number", href: "/lab/orders" },
          { id: "critical", label: "Critical values today", value: d.labOrders.filter((o) => o.resultedAt && localDate(o.resultedAt) === today && o.results.some((r) => r.flag === "HH" || r.flag === "LL")).length, format: "number", severity: "critical", href: "/lab/orders" },
          { id: "tat", label: "Average TAT today", value: tat, format: "minutes", spark: history((x) => x.labTatMedianMin), goodDirection: "down", href: "/reports" },
        ];
      }

      if (role === "Pharmacist") {
        const t = today;
        const onHand = new Map<string, number>();
        for (const b of d.stock) if (b.expiry >= t) onHand.set(b.drugId, (onHand.get(b.drugId) ?? 0) + b.qty);
        return [
          { id: "rx", label: "Prescriptions pending", value: d.prescriptions.filter((r) => r.status === "Pending" || r.status === "Partially dispensed").length, format: "number", href: "/pharmacy/queue" },
          { id: "dispensed", label: "Dispensed today", value: d.prescriptions.filter((r) => r.dispensedAt && localDate(r.dispensedAt) === t).length, format: "number", href: "/pharmacy/queue" },
          { id: "low", label: "Below reorder level", value: d.drugs.filter((x) => (onHand.get(x.id) ?? 0) < x.reorderLevel).length, format: "number", severity: "warning", href: "/pharmacy/stock?filter=low" },
          { id: "expiring", label: "Batches expiring in 30 days", value: d.stock.filter((b) => b.qty > 0 && b.expiry >= t && differenceInCalendarDays(new Date(b.expiry), new Date()) <= 30).length, format: "number", href: "/pharmacy/stock?filter=expiring" },
          { id: "expired", label: "Expired on shelf", value: d.stock.filter((b) => b.qty > 0 && b.expiry < t).length, format: "number", severity: "critical", href: "/pharmacy/stock?filter=expired" },
        ];
      }

      // Billing
      const open = d.claims.filter((c) => !["Settled", "Rejected"].includes(c.status));
      return [
        { id: "collected", label: "Collections today", value: Math.round(collected), format: "inr", spark: revSeries, href: "/billing/bills" },
        { id: "billed", label: "Billed today", value: Math.round(d.bills.filter((b) => localDate(b.createdAt) === today).reduce((s, b) => s + computeBillTotals(b).net, 0)), format: "inr", href: "/billing/bills" },
        { id: "outstanding", label: "Self-pay outstanding", value: Math.round(d.bills.filter((b) => b.payerType === "Self").reduce((s, b) => s + computeBillTotals(b).due, 0)), format: "inr", severity: "warning", href: "/billing/bills?due=true" },
        { id: "claims", label: "Open claims", value: open.length, format: "number", delta: open.reduce((s, c) => s + c.claimedAmount, 0), deltaLabel: "claimed value", href: "/billing/claims" },
        { id: "queries", label: "TPA queries", value: d.claims.filter((c) => c.status === "Query raised").length, format: "number", severity: "warning", href: "/billing/claims?status=Query%20raised" },
      ];
    });
  },
};
