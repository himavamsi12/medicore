import type { Role, SessionUser } from "@/types";
import { ROLE_PERSONA } from "@/lib/rbac";
import { mock } from "./http";
import { db } from "./mappers";

/**
 * Mock "who am I" endpoint. There is no authentication in this build: the role
 * switcher picks a persona and this resolves it to a staff record.
 */
function resolve(role: Role): SessionUser {
  const persona = ROLE_PERSONA[role];
  const d = db();
  if (persona.doctorId) {
    const doc = d.doctors.find((x) => x.id === persona.doctorId)!;
    const staff = d.staff.find((s) => s.doctorId === doc.id);
    return { id: staff?.id ?? doc.id, name: doc.name, role, title: persona.title, staffId: staff?.id, doctorId: doc.id };
  }
  const staff = d.staff.find((s) => s.id === persona.staffId);
  return { id: persona.staffId ?? role, name: staff?.name ?? role, role, title: persona.title, staffId: persona.staffId, wardId: persona.wardId };
}

export const sessionService = {
  getUser(role: Role): Promise<SessionUser> {
    return mock(() => resolve(role), { min: 40, max: 100 });
  },
};
