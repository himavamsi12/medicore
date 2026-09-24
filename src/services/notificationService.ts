import type { ActivityEvent, Notification, Role } from "@/types";
import { mock } from "./http";
import { db } from "./mappers";

export const notificationService = {
  getForRole(role: Role): Promise<Notification[]> {
    return mock(() => db().notifications.filter((n) => n.roles.includes(role)).slice(0, 40), { min: 80, max: 200 });
  },

  markRead(ids: string[]): Promise<void> {
    return mock(() => {
      for (const n of db().notifications) if (ids.includes(n.id)) n.read = true;
    });
  },

  getActivity(limit = 30, modules?: string[]): Promise<ActivityEvent[]> {
    return mock(() => db().activity.filter((a) => !modules?.length || modules.includes(a.module)).slice(0, limit), { min: 100, max: 250 });
  },

  /**
   * Live feed polling. In production this would be a websocket / SSE stream.
   * The mock occasionally records a plausible new event drawn from real records.
   */
  pollActivity(limit = 30): Promise<ActivityEvent[]> {
    return mock(
      () => {
        const d = db();
        if (Math.random() < 0.7) {
          const templates: (() => ActivityEvent | undefined)[] = [
            () => {
              const a = d.admissions.filter((x) => !x.dischargedAt)[Math.floor(Math.random() * 60)];
              if (!a) return undefined;
              const p = d.patients.find((x) => x.id === a.patientId)!;
              const bed = d.beds.find((b) => b.id === a.bedId)!;
              const nurse = d.staff.find((s) => s.wardId === a.wardId && s.category === "Nurse");
              return { id: "", at: "", actor: nurse?.name ?? "Staff Nurse", actorRole: "Nurse", verb: "recorded vitals for", target: `${p.fullName} (${bed.code})`, module: "Nursing", href: `/patients/${p.id}?tab=vitals`, severity: "neutral" };
            },
            () => {
              const o = d.labOrders.filter((x) => x.status === "Verified").slice(-40)[Math.floor(Math.random() * 40)];
              if (!o) return undefined;
              const p = d.patients.find((x) => x.id === o.patientId)!;
              return { id: "", at: "", actor: o.verifiedBy ?? "Pathologist", actorRole: "Lab Technician", verb: "verified", target: `${o.testCodes.join(", ")} for ${p.fullName}`, module: "Laboratory", href: `/lab/orders/${o.id}`, severity: "neutral" };
            },
            () => {
              const a = d.appointments.filter((x) => x.status === "Scheduled")[Math.floor(Math.random() * 30)];
              if (!a) return undefined;
              const p = d.patients.find((x) => x.id === a.patientId)!;
              const doc = d.doctors.find((x) => x.id === a.doctorId)!;
              return { id: "", at: "", actor: "Front office", actorRole: "Receptionist", verb: "confirmed appointment for", target: `${p.fullName} with ${doc.name}`, module: "OPD", href: "/opd/appointments", severity: "info" };
            },
          ];
          const ev = templates[Math.floor(Math.random() * templates.length)]();
          if (ev) d.activity.unshift({ ...ev, id: `ACT-L${Date.now()}`, at: new Date().toISOString() });
        }
        return d.activity.slice(0, limit);
      },
      { min: 80, max: 160 },
    );
  },
};
