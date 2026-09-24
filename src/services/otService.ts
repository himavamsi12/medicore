import type { OperationTheatre, Surgery, SurgeryStatus, SurgeryView } from "@/types";
import { localDate } from "@/lib/dates";
import { mock, notFound, ServiceError } from "./http";
import { db, doctorRef, nextId, patientRef } from "./mappers";

function view(s: Surgery): SurgeryView {
  const d = db();
  const nurse = d.staff.find((x) => x.id === s.scrubNurseId);
  return {
    ...s,
    patient: patientRef(s.patientId),
    surgeon: doctorRef(s.surgeonId),
    anaesthetist: doctorRef(s.anaesthetistId),
    assistants: s.assistantIds.map(doctorRef),
    scrubNurse: nurse ? { id: nurse.id, name: nurse.name } : undefined,
    otName: d.theatres.find((t) => t.id === s.otId)?.name ?? s.otId,
    departmentName: d.departments.find((x) => x.id === s.departmentId)?.name ?? "",
  };
}

export const otService = {
  getTheatres(): Promise<OperationTheatre[]> {
    return mock(() => db().theatres, { min: 50, max: 120 });
  },

  /** Cases whose scheduled start falls within [from, to] (ISO dates, inclusive). */
  getSchedule(from: string, to: string): Promise<SurgeryView[]> {
    return mock(() =>
      db()
        .surgeries.filter((s) => localDate(s.scheduledStart) >= from && localDate(s.scheduledStart) <= to)
        .map(view)
        .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart)),
    );
  },

  getCase(id: string): Promise<SurgeryView> {
    return mock(() => view(db().surgeries.find((s) => s.id === id) ?? notFound("Surgery", id)));
  },

  getByPatient(patientId: string): Promise<SurgeryView[]> {
    return mock(() => db().surgeries.filter((s) => s.patientId === patientId).map(view));
  },

  toggleChecklist(id: string, itemId: string, by: string): Promise<SurgeryView> {
    return mock(() => {
      const s = db().surgeries.find((x) => x.id === id) ?? notFound("Surgery", id);
      const item = s.checklist.find((c) => c.id === itemId) ?? notFound("Checklist item", itemId);
      item.done = !item.done;
      item.doneBy = item.done ? by : undefined;
      item.doneAt = item.done ? new Date().toISOString() : undefined;
      return view(s);
    });
  },

  setStatus(id: string, status: SurgeryStatus): Promise<SurgeryView> {
    return mock(() => {
      const s = db().surgeries.find((x) => x.id === id) ?? notFound("Surgery", id);
      const phaseDone = (phase: string) => s.checklist.filter((c) => c.phase === phase).every((c) => c.done);
      if (status === "In progress" && (!phaseDone("Sign in") || !phaseDone("Time out"))) throw new ServiceError("Complete the Sign in and Time out checklist before starting");
      if ((status === "Recovery" || status === "Completed") && !phaseDone("Sign out")) throw new ServiceError("Complete the Sign out checklist first");
      if (status === "In progress") s.actualStart = new Date().toISOString();
      if (status === "Recovery") s.actualEnd = new Date().toISOString();
      s.status = status;
      return view(s);
    });
  },

  schedule(input: Omit<Surgery, "id" | "caseNo" | "status" | "checklist" | "actualStart" | "actualEnd">): Promise<SurgeryView> {
    return mock(() => {
      const d = db();
      const start = new Date(input.scheduledStart).getTime();
      const end = start + input.durationMin * 60000;
      const clash = d.surgeries.find((s) => s.otId === input.otId && !["Cancelled", "Postponed"].includes(s.status) && new Date(s.scheduledStart).getTime() < end && new Date(s.scheduledStart).getTime() + s.durationMin * 60000 > start);
      if (clash) throw new ServiceError(`${input.otId} is booked for ${clash.procedure} at that time`, 409);
      const template = d.surgeries[0]?.checklist ?? [];
      const s: Surgery = {
        ...input,
        id: nextId("SUR", d.surgeries, 4),
        caseNo: `OT/${input.scheduledStart.slice(2, 10).replace(/-/g, "")}/${String(d.surgeries.length + 1).padStart(3, "0")}`,
        status: "Scheduled",
        checklist: template.map((c) => ({ id: c.id, phase: c.phase, label: c.label, done: false })),
      };
      d.surgeries.push(s);
      return view(s);
    });
  },
};
