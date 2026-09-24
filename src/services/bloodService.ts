import type { BloodComponent, BloodGroup, BloodRequest, BloodRequestStatus, BloodRequestView, BloodUnit, ListParams, Paginated } from "@/types";
import { mock, notFound, ServiceError } from "./http";
import { db, doctorRef, nextId, patientRef } from "./mappers";
import { oneOf, runQuery } from "./query";

/** Red-cell compatibility: recipient group -> acceptable donor groups. */
export const RBC_COMPATIBLE: Record<BloodGroup, BloodGroup[]> = {
  "O-": ["O-"],
  "O+": ["O+", "O-"],
  "A-": ["A-", "O-"],
  "A+": ["A+", "A-", "O+", "O-"],
  "B-": ["B-", "O-"],
  "B+": ["B+", "B-", "O+", "O-"],
  "AB-": ["AB-", "A-", "B-", "O-"],
  "AB+": ["AB+", "AB-", "A+", "A-", "B+", "B-", "O+", "O-"],
};

function compatibleUnits(group: BloodGroup, component: BloodComponent): BloodUnit[] {
  const groups = component === "PRBC" || component === "Whole blood" ? RBC_COMPATIBLE[group] : [group];
  return db().bloodUnits.filter((u) => u.status === "Available" && u.component === component && groups.includes(u.group)).sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
}

function view(r: BloodRequest): BloodRequestView {
  return { ...r, patient: patientRef(r.patientId), requestedBy: doctorRef(r.requestedById), compatibleAvailable: compatibleUnits(r.group, r.component).length };
}

export interface BloodInventoryCell {
  group: BloodGroup;
  component: BloodComponent;
  available: number;
  reserved: number;
  expiringIn3Days: number;
}

export const bloodService = {
  getInventory(): Promise<BloodInventoryCell[]> {
    return mock(() => {
      const units = db().bloodUnits;
      const groups: BloodGroup[] = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];
      const comps: BloodComponent[] = ["PRBC", "Whole blood", "FFP", "Platelets (RDP)", "Platelets (SDP)", "Cryoprecipitate"];
      const soon = Date.now() + 3 * 86400000;
      return groups.flatMap((group) =>
        comps.map((component) => {
          const set = units.filter((u) => u.group === group && u.component === component);
          return {
            group,
            component,
            available: set.filter((u) => u.status === "Available").length,
            reserved: set.filter((u) => u.status === "Reserved").length,
            expiringIn3Days: set.filter((u) => u.status === "Available" && new Date(u.expiresAt).getTime() <= soon).length,
          };
        }),
      );
    });
  },

  getUnits(params: ListParams = {}): Promise<Paginated<BloodUnit>> {
    return mock(() =>
      runQuery(db().bloodUnits, params, {
        search: (r) => [r.unitNo, r.group, r.component],
        filters: { group: (r, v) => oneOf(r.group, v), component: (r, v) => oneOf(r.component, v), status: (r, v) => oneOf(r.status, v) },
        sort: { expiresAt: (r) => r.expiresAt, collectedAt: (r) => r.collectedAt, group: (r) => r.group, component: (r) => r.component },
        defaultSort: { id: "expiresAt", desc: false },
      }),
    );
  },

  getRequests(): Promise<BloodRequestView[]> {
    return mock(() => db().bloodRequests.map(view).sort((a, b) => ["STAT", "Urgent", "Routine"].indexOf(a.priority) - ["STAT", "Urgent", "Routine"].indexOf(b.priority) || b.requestedAt.localeCompare(a.requestedAt)));
  },

  createRequest(input: Omit<BloodRequest, "id" | "requestNo" | "requestedAt" | "status" | "unitIds">): Promise<BloodRequestView> {
    return mock(() => {
      const d = db();
      const now = new Date();
      const r: BloodRequest = { ...input, id: nextId("BRQ", d.bloodRequests, 4), requestNo: `BR/${now.toISOString().slice(2, 10).replace(/-/g, "")}/${String(d.bloodRequests.length + 1).padStart(3, "0")}`, requestedAt: now.toISOString(), status: "Pending", unitIds: [] };
      d.bloodRequests.unshift(r);
      return view(r);
    });
  },

  /** Move a request along: cross-match reserves compatible units, issue marks them issued. */
  advance(id: string, to: BloodRequestStatus): Promise<BloodRequestView> {
    return mock(() => {
      const d = db();
      const r = d.bloodRequests.find((x) => x.id === id) ?? notFound("Blood request", id);
      if (to === "Ready") {
        const units = compatibleUnits(r.group, r.component).slice(0, r.units);
        if (units.length < r.units) throw new ServiceError(`Only ${units.length} compatible ${r.component} units available`);
        for (const u of units) Object.assign(u, { status: "Reserved", reservedFor: r.id });
        r.unitIds = units.map((u) => u.id);
      }
      if (to === "Issued") for (const u of d.bloodUnits.filter((x) => r.unitIds.includes(x.id))) u.status = "Issued";
      if (to === "Cancelled") for (const u of d.bloodUnits.filter((x) => r.unitIds.includes(x.id))) Object.assign(u, { status: "Available", reservedFor: undefined });
      r.status = to;
      return view(r);
    });
  },
};
