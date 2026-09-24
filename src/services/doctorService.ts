import { addDays, format } from "date-fns";
import type { Department, DepartmentView, DoctorView, ListParams, Paginated, Slot, Weekday } from "@/types";
import { mock, notFound } from "./http";
import { db, doctorRef } from "./mappers";
import { oneOf, runQuery } from "./query";

const WEEKDAYS: Weekday[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const todayStr = () => format(new Date(), "yyyy-MM-dd");

function toMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function doctorView(id: string): DoctorView {
  const d = db();
  const doc = d.doctors.find((x) => x.id === id) ?? notFound("Doctor", id);
  const today = todayStr();
  let nextAvailable: string | undefined;
  for (let i = 0; i < 14 && !nextAvailable; i++) {
    const day = addDays(new Date(), i);
    const s = doc.sessions.find((x) => x.day === WEEKDAYS[day.getDay()]);
    if (s) nextAvailable = `${format(day, "yyyy-MM-dd")}T${s.start}`;
  }
  return {
    ...doc,
    departmentName: d.departments.find((x) => x.id === doc.departmentId)?.name ?? "",
    opdToday: d.appointments.filter((a) => a.doctorId === id && a.date === today && a.status !== "Cancelled").length,
    inpatients: d.admissions.filter((a) => a.admittingDoctorId === id && !a.dischargedAt).length,
    nextAvailable,
  };
}

export const doctorService = {
  getAll(params: ListParams = {}): Promise<Paginated<DoctorView>> {
    return mock(() =>
      runQuery(
        db().doctors.map((d) => doctorView(d.id)),
        params,
        {
          search: (r) => [r.name, r.departmentName, r.qualifications, ...r.specialInterests, r.registrationNo],
          filters: {
            departmentId: (r, v) => oneOf(r.departmentId, v),
            status: (r, v) => oneOf(r.status, v),
            designation: (r, v) => oneOf(r.designation, v),
            day: (r, v) => r.sessions.some((s) => s.day === v),
          },
          sort: { name: (r) => r.name.replace("Dr. ", ""), departmentName: (r) => r.departmentName, experienceYears: (r) => r.experienceYears, consultationFee: (r) => r.consultationFee, opdToday: (r) => r.opdToday, inpatients: (r) => r.inpatients, rating: (r) => r.rating },
          defaultSort: { id: "departmentName", desc: false },
        },
      ),
    );
  },

  /** Unpaginated list for selects and filters. */
  listAll(): Promise<DoctorView[]> {
    return mock(() => db().doctors.map((d) => doctorView(d.id)), { min: 60, max: 150 });
  },

  getById(id: string): Promise<DoctorView> {
    return mock(() => doctorView(id));
  },

  /** OPD slots for a doctor on a date, with booked slots marked unavailable. */
  getSlots(doctorId: string, date: string): Promise<Slot[]> {
    return mock(
      () => {
        const d = db();
        const doc = d.doctors.find((x) => x.id === doctorId) ?? notFound("Doctor", doctorId);
        const wd = WEEKDAYS[new Date(`${date}T00:00:00`).getDay()];
        const session = doc.sessions.find((s) => s.day === wd);
        if (!session) return [];
        const booked = new Map(d.appointments.filter((a) => a.doctorId === doctorId && a.date === date && a.status !== "Cancelled").map((a) => [a.time, a.id]));
        const now = new Date();
        const isToday = date === todayStr();
        const slots: Slot[] = [];
        for (let m = toMinutes(session.start); m + doc.slotMinutes <= toMinutes(session.end); m += doc.slotMinutes) {
          const t = fmt(m);
          const past = isToday && m < now.getHours() * 60 + now.getMinutes();
          slots.push({ time: t, available: !booked.has(t) && !past, appointmentId: booked.get(t) });
        }
        return slots;
      },
      { min: 120, max: 300 },
    );
  },

  getDepartments(): Promise<DepartmentView[]> {
    return mock(() => {
      const d = db();
      const today = todayStr();
      return d.departments.map((dep) => ({
        ...dep,
        head: dep.headDoctorId ? doctorRef(dep.headDoctorId) : undefined,
        doctorCount: d.doctors.filter((x) => x.departmentId === dep.id).length,
        opdToday: d.appointments.filter((a) => a.departmentId === dep.id && a.date === today && a.status !== "Cancelled").length,
        inpatients: d.admissions.filter((a) => a.departmentId === dep.id && !a.dischargedAt).length,
      }));
    });
  },

  getDepartment(id: string): Promise<DepartmentView & { doctors: DoctorView[] }> {
    return mock(() => {
      const d = db();
      const dep = d.departments.find((x) => x.id === id) ?? notFound("Department", id);
      const today = todayStr();
      return {
        ...dep,
        head: dep.headDoctorId ? doctorRef(dep.headDoctorId) : undefined,
        doctorCount: d.doctors.filter((x) => x.departmentId === id).length,
        opdToday: d.appointments.filter((a) => a.departmentId === id && a.date === today && a.status !== "Cancelled").length,
        inpatients: d.admissions.filter((a) => a.departmentId === id && !a.dischargedAt).length,
        doctors: d.doctors.filter((x) => x.departmentId === id).map((x) => doctorView(x.id)),
      };
    });
  },

  updateDepartment(id: string, patch: Partial<Pick<Department, "floor" | "extension" | "description">>): Promise<Department> {
    return mock(() => {
      const dep = db().departments.find((x) => x.id === id) ?? notFound("Department", id);
      Object.assign(dep, patch);
      return dep;
    });
  },
};
