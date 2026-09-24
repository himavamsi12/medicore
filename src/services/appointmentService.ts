import { differenceInMinutes, format } from "date-fns";
import type {
  Appointment,
  AppointmentStatus,
  AppointmentView,
  BookAppointmentInput,
  Consultation,
  ListParams,
  Paginated,
  Vitals,
} from "@/types";
import { mock, notFound, ServiceError } from "./http";
import { clinicNow, db, doctorRef, nextId, patientRef } from "./mappers";
import { oneOf, runQuery } from "./query";

function view(a: Appointment): AppointmentView {
  const now = clinicNow();
  const waitFrom = a.checkedInAt ? new Date(a.checkedInAt) : undefined;
  return {
    ...a,
    patient: patientRef(a.patientId),
    doctor: doctorRef(a.doctorId),
    waitMinutes: a.status === "Checked in" && waitFrom ? Math.max(0, differenceInMinutes(now, waitFrom)) : undefined,
  };
}

const STATUS_ORDER: AppointmentStatus[] = ["In consultation", "Checked in", "Scheduled", "Completed", "No show", "Cancelled"];

export const appointmentService = {
  getAll(params: ListParams = {}): Promise<Paginated<AppointmentView>> {
    return mock(() =>
      runQuery(db().appointments.map(view), params, {
        search: (r) => [r.patient.fullName, r.patient.uhid, r.patient.phone, r.doctor.name, r.reason, r.token ? `T${r.token}` : undefined],
        filters: {
          status: (r, v) => oneOf(r.status, v),
          doctorId: (r, v) => oneOf(r.doctorId, v),
          departmentId: (r, v) => oneOf(r.departmentId, v),
          type: (r, v) => oneOf(r.type, v),
          channel: (r, v) => oneOf(r.channel, v),
          date: (r, v) => r.date === v,
        },
        sort: {
          date: (r) => `${r.date} ${r.time}`,
          patient: (r) => r.patient.fullName,
          doctor: (r) => r.doctor.name,
          status: (r) => STATUS_ORDER.indexOf(r.status),
          token: (r) => r.token ?? 999,
        },
        date: (r) => r.date,
        defaultSort: { id: "date", desc: false },
      }),
    );
  },

  getById(id: string): Promise<AppointmentView> {
    return mock(() => view(db().appointments.find((a) => a.id === id) ?? notFound("Appointment", id)));
  },

  getByPatient(patientId: string): Promise<AppointmentView[]> {
    return mock(() => db().appointments.filter((a) => a.patientId === patientId).map(view).sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`)));
  },

  /** Today's queue, optionally for one doctor. Ordered by token / time. */
  getQueue(date: string, doctorId?: string): Promise<AppointmentView[]> {
    return mock(
      () =>
        db()
          .appointments.filter((a) => a.date === date && (!doctorId || a.doctorId === doctorId) && a.status !== "Cancelled")
          .map(view)
          .sort((a, b) => (a.token ?? 999) - (b.token ?? 999) || a.time.localeCompare(b.time)),
      { min: 150, max: 350 },
    );
  },

  book(input: BookAppointmentInput): Promise<AppointmentView> {
    return mock(() => {
      const d = db();
      const doc = d.doctors.find((x) => x.id === input.doctorId) ?? notFound("Doctor", input.doctorId);
      const clash = d.appointments.find((a) => a.doctorId === input.doctorId && a.date === input.date && a.time === input.time && a.status !== "Cancelled");
      if (clash) throw new ServiceError("That slot was just booked. Pick another time.", 409);
      const seen = d.appointments.some((a) => a.patientId === input.patientId && a.status === "Completed");
      const appt: Appointment = {
        id: nextId("APT", d.appointments, 5),
        patientId: input.patientId,
        doctorId: doc.id,
        departmentId: doc.departmentId,
        date: input.date,
        time: input.time,
        durationMin: doc.slotMinutes,
        type: seen && input.type === "New" ? "Follow-up" : input.type,
        channel: input.channel,
        status: "Scheduled",
        reason: input.reason,
        createdAt: new Date().toISOString(),
      };
      d.appointments.push(appt);
      d.activity.unshift({ id: nextId("ACT", d.activity), at: appt.createdAt, actor: "Front office", actorRole: "Receptionist", verb: "booked", target: `${patientRef(appt.patientId).fullName} with ${doc.name}`, module: "OPD", href: `/opd/appointments`, severity: "info" });
      return view(appt);
    });
  },

  checkIn(id: string, vitals?: Omit<Vitals, "id" | "patientId" | "recordedAt" | "source">): Promise<AppointmentView> {
    return mock(() => {
      const d = db();
      const a = d.appointments.find((x) => x.id === id) ?? notFound("Appointment", id);
      if (a.status !== "Scheduled") throw new ServiceError(`Cannot check in an appointment that is ${a.status.toLowerCase()}`);
      const tokens = d.appointments.filter((x) => x.doctorId === a.doctorId && x.date === a.date && x.token !== undefined).map((x) => x.token!);
      a.status = "Checked in";
      a.token = (tokens.length ? Math.max(...tokens) : 0) + 1;
      a.checkedInAt = clinicNow().toISOString();
      if (vitals) {
        const v: Vitals = { ...vitals, id: nextId("VIT", d.vitals, 6), patientId: a.patientId, recordedAt: a.checkedInAt, source: "OPD" };
        d.vitals.push(v);
        a.vitals = v;
      }
      return view(a);
    });
  },

  updateStatus(id: string, status: AppointmentStatus): Promise<AppointmentView> {
    return mock(() => {
      const d = db();
      const a = d.appointments.find((x) => x.id === id) ?? notFound("Appointment", id);
      a.status = status;
      if (status === "In consultation") {
        a.calledAt = clinicNow().toISOString();
        a.consultation ??= { chiefComplaint: a.reason, soap: { subjective: a.reason, objective: "", assessment: "", plan: "" }, diagnoses: [], labOrderIds: [], radiologyOrderIds: [] };
      }
      return view(a);
    });
  },

  reschedule(id: string, date: string, time: string): Promise<AppointmentView> {
    return mock(() => {
      const d = db();
      const a = d.appointments.find((x) => x.id === id) ?? notFound("Appointment", id);
      if (d.appointments.some((x) => x.id !== id && x.doctorId === a.doctorId && x.date === date && x.time === time && x.status !== "Cancelled")) throw new ServiceError("Slot not available", 409);
      a.date = date;
      a.time = time;
      a.status = "Scheduled";
      a.token = undefined;
      return view(a);
    });
  },

  saveConsultation(id: string, consultation: Consultation, complete: boolean): Promise<AppointmentView> {
    return mock(() => {
      const d = db();
      const a = d.appointments.find((x) => x.id === id) ?? notFound("Appointment", id);
      a.consultation = { ...consultation, completedAt: complete ? new Date().toISOString() : undefined };
      if (complete) {
        a.status = "Completed";
        const p = d.patients.find((x) => x.id === a.patientId);
        if (p) {
          p.lastVisitAt = a.consultation.completedAt;
          for (const dx of consultation.diagnoses) if (!p.conditions.some((c) => c.code === dx.code)) p.conditions.push({ code: dx.code, name: dx.name, chronic: false, since: format(new Date(), "yyyy-MM-dd") });
        }
        d.activity.unshift({ id: nextId("ACT", d.activity), at: new Date().toISOString(), actor: doctorRef(a.doctorId).name, actorRole: "Doctor", verb: "completed consultation for", target: patientRef(a.patientId).fullName, module: "OPD", href: `/opd/consult/${a.id}`, severity: "neutral" });
      }
      return view(a);
    });
  },
};
