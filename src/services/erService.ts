import { differenceInMinutes, format } from "date-fns";
import { localDate } from "@/lib/dates";
import type { ErCase, ErCaseView, ErStatus, NewErCaseInput, TriageLevel, Vitals } from "@/types";
import { mock, notFound, ServiceError } from "./http";
import { db, doctorRef, nextId, patientRef } from "./mappers";

const ACTIVE: ErStatus[] = ["Waiting", "In triage", "Under treatment", "Observation"];

function view(e: ErCase): ErCaseView {
  const d = db();
  const end = ACTIVE.includes(e.status) ? new Date() : new Date(e.triagedAt ?? e.arrivedAt);
  return {
    ...e,
    patient: patientRef(e.patientId),
    doctor: e.doctorId ? doctorRef(e.doctorId) : undefined,
    bedCode: e.bedId ? d.beds.find((b) => b.id === e.bedId)?.code : undefined,
    waitingMinutes: Math.max(0, differenceInMinutes(end, new Date(e.arrivedAt))),
  };
}

export const erService = {
  getActive(): Promise<ErCaseView[]> {
    return mock(() =>
      db()
        .erCases.filter((e) => ACTIVE.includes(e.status))
        .map(view)
        .sort((a, b) => (a.triageLevel ?? 9) - (b.triageLevel ?? 9) || a.arrivedAt.localeCompare(b.arrivedAt)),
    );
  },

  getRecent(hours = 24): Promise<ErCaseView[]> {
    return mock(() => {
      const since = Date.now() - hours * 3600000;
      return db().erCases.filter((e) => new Date(e.arrivedAt).getTime() >= since).map(view).sort((a, b) => b.arrivedAt.localeCompare(a.arrivedAt));
    });
  },

  getById(id: string): Promise<ErCaseView> {
    return mock(() => view(db().erCases.find((e) => e.id === id) ?? notFound("ER case", id)));
  },

  register(input: NewErCaseInput): Promise<ErCaseView> {
    return mock(() => {
      const d = db();
      if (d.erCases.some((e) => e.patientId === input.patientId && ACTIVE.includes(e.status))) throw new ServiceError("Patient already has an open ER case");
      const now = new Date();
      const e: ErCase = {
        id: nextId("ER", d.erCases, 4),
        caseNo: `ER/26/${String(9400 + d.erCases.length).padStart(5, "0")}`,
        patientId: input.patientId,
        arrivedAt: now.toISOString(),
        arrivalMode: input.arrivalMode,
        chiefComplaint: input.chiefComplaint,
        symptoms: input.symptoms,
        status: "Waiting",
        mlc: input.mlc,
        notes: "",
      };
      d.erCases.push(e);
      const p = d.patients.find((x) => x.id === input.patientId);
      if (p) {
        p.status = "In ER";
        if (input.mlc && !p.flags.includes("MLC")) p.flags.push("MLC");
      }
      d.activity.unshift({ id: nextId("ACT", d.activity), at: e.arrivedAt, actor: "ER triage", actorRole: "Nurse", verb: "registered arrival of", target: patientRef(e.patientId).fullName, module: "Emergency", href: `/emergency/${e.id}`, severity: "info" });
      return view(e);
    });
  },

  triage(id: string, level: TriageLevel, vitals: Omit<Vitals, "id" | "patientId" | "recordedAt" | "source">, by: string): Promise<ErCaseView> {
    return mock(() => {
      const d = db();
      const e = d.erCases.find((x) => x.id === id) ?? notFound("ER case", id);
      const now = new Date().toISOString();
      const v: Vitals = { ...vitals, id: nextId("VIT", d.vitals, 6), patientId: e.patientId, recordedAt: now, source: "ER" };
      d.vitals.push(v);
      Object.assign(e, { triageLevel: level, triagedAt: now, triagedBy: by, vitals: v, status: e.status === "Waiting" || e.status === "In triage" ? "In triage" : e.status });
      return view(e);
    });
  },

  assign(id: string, patch: { bedId?: string; doctorId?: string; status?: ErStatus; notes?: string; disposition?: string }): Promise<ErCaseView> {
    return mock(() => {
      const d = db();
      const e = d.erCases.find((x) => x.id === id) ?? notFound("ER case", id);
      if (patch.bedId && patch.bedId !== e.bedId) {
        const bed = d.beds.find((b) => b.id === patch.bedId) ?? notFound("Bed", patch.bedId);
        if (bed.status === "Occupied") throw new ServiceError(`${bed.code} is occupied`);
        const prev = e.bedId ? d.beds.find((b) => b.id === e.bedId) : undefined;
        if (prev) Object.assign(prev, { status: "Cleaning", patientId: undefined, statusSince: new Date().toISOString() });
        Object.assign(bed, { status: "Occupied", patientId: e.patientId, statusSince: new Date().toISOString() });
      }
      Object.assign(e, patch);
      if (patch.status && !ACTIVE.includes(patch.status)) {
        const bed = e.bedId ? d.beds.find((b) => b.id === e.bedId) : undefined;
        if (bed) Object.assign(bed, { status: "Cleaning", patientId: undefined, statusSince: new Date().toISOString() });
        const p = d.patients.find((x) => x.id === e.patientId);
        if (p && patch.status !== "Admitted") p.status = "OPD";
      }
      return view(e);
    });
  },

  stats(): Promise<{ active: number; waiting: number; avgDoorToTriage: number; avgLos: number; byLevel: Record<string, number>; arrivalsToday: number; mlcToday: number }> {
    return mock(() => {
      const d = db();
      const active = d.erCases.filter((e) => ACTIVE.includes(e.status));
      const triaged = d.erCases.filter((e) => e.triagedAt);
      const today = format(new Date(), "yyyy-MM-dd");
      const byLevel: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, untriaged: 0 };
      for (const e of active) byLevel[e.triageLevel ? String(e.triageLevel) : "untriaged"]++;
      return {
        active: active.length,
        waiting: active.filter((e) => e.status === "Waiting").length,
        avgDoorToTriage: Math.round(triaged.reduce((s, e) => s + differenceInMinutes(new Date(e.triagedAt!), new Date(e.arrivedAt)), 0) / Math.max(1, triaged.length)),
        avgLos: Math.round(active.reduce((s, e) => s + differenceInMinutes(new Date(), new Date(e.arrivedAt)), 0) / Math.max(1, active.length)),
        byLevel,
        arrivalsToday: d.erCases.filter((e) => localDate(e.arrivedAt) === today).length,
        mlcToday: d.erCases.filter((e) => e.mlc && localDate(e.arrivedAt) === today).length,
      };
    });
  },
};
