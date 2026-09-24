import type { AttendanceRecord, ListParams, Paginated, RosterEntry, RosterShift, StaffRow } from "@/types";
import { todayLocal } from "@/lib/dates";
import { mock, notFound } from "./http";
import { db } from "./mappers";
import { oneOf, runQuery } from "./query";

const SHIFT_LABEL: Record<RosterShift, string> = { M: "Morning 07-14", E: "Evening 14-21", N: "Night 21-07", G: "General 09-17", Off: "Week off", Leave: "Leave" };

function row(id: string): StaffRow {
  const d = db();
  const s = d.staff.find((x) => x.id === id) ?? notFound("Staff", id);
  const today = todayLocal();
  const shift = d.roster.find((r) => r.staffId === id && r.date === today)?.shift;
  return {
    ...s,
    departmentName: d.departments.find((x) => x.id === s.departmentId)?.name ?? "",
    wardName: s.wardId ? d.wards.find((w) => w.id === s.wardId)?.name : undefined,
    todayShift: shift ? SHIFT_LABEL[shift] : undefined,
    todayAttendance: d.attendance.find((a) => a.staffId === id && a.date === today)?.status,
  };
}

export const staffService = {
  shiftLabel: SHIFT_LABEL,

  getAll(params: ListParams = {}): Promise<Paginated<StaffRow>> {
    return mock(() =>
      runQuery(
        db().staff.map((s) => row(s.id)),
        params,
        {
          search: (r) => [r.name, r.employeeId, r.designation, r.departmentName, r.wardName, r.phone, r.email],
          filters: {
            category: (r, v) => oneOf(r.category, v),
            departmentId: (r, v) => oneOf(r.departmentId, v),
            status: (r, v) => oneOf(r.status, v),
            wardId: (r, v) => oneOf(r.wardId, v),
          },
          sort: { name: (r) => r.name, category: (r) => r.category, departmentName: (r) => r.departmentName, joinedAt: (r) => r.joinedAt, employeeId: (r) => r.employeeId },
          defaultSort: { id: "name", desc: false },
        },
      ),
    );
  },

  getById(id: string): Promise<StaffRow> {
    return mock(() => row(id));
  },

  getRoster(from: string, to: string, filter: { category?: string; wardId?: string } = {}): Promise<{ staff: StaffRow[]; entries: RosterEntry[] }> {
    return mock(() => {
      const d = db();
      const staff = d.staff
        .filter((s) => s.category !== "Doctor" && (!filter.category || s.category === filter.category) && (!filter.wardId || s.wardId === filter.wardId))
        .map((s) => row(s.id));
      const ids = new Set(staff.map((s) => s.id));
      return { staff, entries: d.roster.filter((r) => ids.has(r.staffId) && r.date >= from && r.date <= to) };
    });
  },

  setShift(staffId: string, date: string, shift: RosterShift): Promise<RosterEntry> {
    return mock(() => {
      const d = db();
      let entry = d.roster.find((r) => r.staffId === staffId && r.date === date);
      if (!entry) {
        entry = { staffId, date, shift };
        d.roster.push(entry);
      }
      entry.shift = shift;
      return entry;
    });
  },

  getAttendance(date: string): Promise<(AttendanceRecord & { staff: StaffRow })[]> {
    return mock(() => db().attendance.filter((a) => a.date === date).map((a) => ({ ...a, staff: row(a.staffId) })));
  },

  getAttendanceSummary(from: string, to: string): Promise<{ date: string; present: number; late: number; absent: number; leave: number }[]> {
    return mock(() => {
      const byDate = new Map<string, { present: number; late: number; absent: number; leave: number }>();
      for (const a of db().attendance) {
        if (a.date < from || a.date > to) continue;
        const e = byDate.get(a.date) ?? { present: 0, late: 0, absent: 0, leave: 0 };
        if (a.status === "Present" || a.status === "Half day") e.present++;
        else if (a.status === "Late") e.late++;
        else if (a.status === "Absent") e.absent++;
        else if (a.status === "On leave") e.leave++;
        byDate.set(a.date, e);
      }
      return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v }));
    });
  },
};
