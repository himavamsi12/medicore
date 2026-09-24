import { format } from "date-fns";
import type { HandoverNote, MarEntry, MarStatus, MarView, NursingPatient, Shift } from "@/types";
import { news2 } from "@/lib/clinical";
import { mock, notFound } from "./http";
import { admissionView, db, nextId, patientRef } from "./mappers";

export function shiftOf(d: Date = new Date()): Shift {
  const h = d.getHours();
  if (h >= 7 && h < 14) return "Morning";
  if (h >= 14 && h < 21) return "Evening";
  return "Night";
}

export const nursingService = {
  /** Patients currently admitted to a ward with their early-warning status and medication workload. */
  getWardPatients(wardId: string): Promise<NursingPatient[]> {
    return mock(() => {
      const d = db();
      const now = Date.now();
      return d.admissions
        .filter((a) => !a.dischargedAt && a.wardId === wardId)
        .map((a) => {
          const series = d.vitals.filter((v) => v.patientId === a.patientId && v.source === "IPD").slice(-8);
          const latest = series[series.length - 1];
          const mar = d.mar.filter((m) => m.admissionId === a.id);
          return {
            admission: admissionView(a),
            latestVitals: latest,
            news2: latest ? news2(latest) : undefined,
            news2Trend: series.map(news2),
            dueMeds: mar.filter((m) => m.status === "Due" && new Date(m.scheduledAt).getTime() - now < 60 * 60000).length,
            overdueMeds: mar.filter((m) => m.status === "Due" && new Date(m.scheduledAt).getTime() < now - 30 * 60000).length,
          };
        })
        .sort((x, y) => (y.news2 ?? 0) - (x.news2 ?? 0) || x.admission.bed.code.localeCompare(y.admission.bed.code));
    });
  },

  getMar(filter: { wardId?: string; admissionId?: string }): Promise<MarView[]> {
    return mock(() => {
      const d = db();
      const admissions = d.admissions.filter((a) => !a.dischargedAt && (!filter.wardId || a.wardId === filter.wardId) && (!filter.admissionId || a.id === filter.admissionId));
      const ids = new Set(admissions.map((a) => a.id));
      return d.mar
        .filter((m) => ids.has(m.admissionId))
        .map((m) => {
          const adm = admissions.find((a) => a.id === m.admissionId)!;
          return { ...m, patient: patientRef(m.patientId), bedCode: d.beds.find((b) => b.id === adm.bedId)?.code ?? "" };
        })
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    });
  },

  administer(marId: string, status: Exclude<MarStatus, "Due">, by: string, note?: string): Promise<MarEntry> {
    return mock(() => {
      const m = db().mar.find((x) => x.id === marId) ?? notFound("MAR entry", marId);
      m.status = status;
      m.givenBy = status === "Given" ? by : undefined;
      m.givenAt = status === "Given" ? new Date().toISOString() : undefined;
      m.note = note;
      return m;
    });
  },

  getHandovers(wardId: string): Promise<(HandoverNote & { fromName: string; patientName?: string; bedCode?: string })[]> {
    return mock(() => {
      const d = db();
      return d.handovers
        .filter((h) => h.wardId === wardId)
        .map((h) => {
          const adm = h.patientId ? d.admissions.find((a) => a.patientId === h.patientId && !a.dischargedAt) : undefined;
          return {
            ...h,
            fromName: d.staff.find((s) => s.id === h.fromStaffId)?.name ?? "Nurse",
            patientName: h.patientId ? patientRef(h.patientId).fullName : undefined,
            bedCode: adm ? d.beds.find((b) => b.id === adm.bedId)?.code : undefined,
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
  },

  addHandover(input: Omit<HandoverNote, "id" | "createdAt" | "acknowledged" | "date" | "shift">): Promise<HandoverNote> {
    return mock(() => {
      const d = db();
      const now = new Date();
      const note: HandoverNote = { ...input, id: nextId("HND", d.handovers, 4), date: format(now, "yyyy-MM-dd"), shift: shiftOf(now), createdAt: now.toISOString(), acknowledged: false };
      d.handovers.unshift(note);
      return note;
    });
  },

  acknowledgeHandover(id: string, staffId: string): Promise<HandoverNote> {
    return mock(() => {
      const h = db().handovers.find((x) => x.id === id) ?? notFound("Handover", id);
      h.acknowledged = true;
      h.toStaffId = staffId;
      return h;
    });
  },
};
