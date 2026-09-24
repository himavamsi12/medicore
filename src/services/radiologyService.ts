import type { ListParams, Paginated, RadiologyOrder, RadiologyOrderView, RadiologyReport, RadiologyStatus } from "@/types";
import { mock, notFound } from "./http";
import { db, doctorRef, patientRef } from "./mappers";
import { oneOf, runQuery } from "./query";

function view(o: RadiologyOrder): RadiologyOrderView {
  return { ...o, patient: patientRef(o.patientId), orderedBy: doctorRef(o.orderedById), radiologist: o.radiologistId ? doctorRef(o.radiologistId) : undefined };
}

const FLOW: RadiologyStatus[] = ["Ordered", "Scheduled", "Acquired", "Reported", "Verified"];

export const radiologyService = {
  getOrders(params: ListParams = {}): Promise<Paginated<RadiologyOrderView>> {
    return mock(() =>
      runQuery(db().radiologyOrders.map(view), params, {
        search: (r) => [r.accessionNo, r.patient.fullName, r.patient.uhid, r.study, r.bodyPart, r.orderedBy.name],
        filters: {
          status: (r, v) => oneOf(r.status, v),
          modality: (r, v) => oneOf(r.modality, v),
          priority: (r, v) => oneOf(r.priority, v),
          source: (r, v) => oneOf(r.source, v),
          worklist: (r, v) => (v === "true" ? r.status === "Acquired" || r.status === "Reported" : true),
        },
        sort: {
          orderedAt: (r) => r.orderedAt,
          patient: (r) => r.patient.fullName,
          modality: (r) => r.modality,
          status: (r) => FLOW.indexOf(r.status),
          priority: (r) => ["STAT", "Urgent", "Routine"].indexOf(r.priority),
        },
        date: (r) => r.orderedAt,
        defaultSort: { id: "orderedAt", desc: true },
      }),
    );
  },

  getOrder(id: string): Promise<RadiologyOrderView> {
    return mock(() => view(db().radiologyOrders.find((o) => o.id === id) ?? notFound("Radiology order", id)));
  },

  getByPatient(patientId: string): Promise<RadiologyOrderView[]> {
    return mock(() => db().radiologyOrders.filter((o) => o.patientId === patientId).map(view).sort((a, b) => b.orderedAt.localeCompare(a.orderedAt)));
  },

  saveReport(id: string, report: Pick<RadiologyReport, "technique" | "findings" | "impression">, radiologistId: string, verify: boolean): Promise<RadiologyOrderView> {
    return mock(() => {
      const o = db().radiologyOrders.find((x) => x.id === id) ?? notFound("Radiology order", id);
      const rad = doctorRef(radiologistId);
      o.report = { ...report, reportedBy: rad.name, reportedAt: new Date().toISOString(), verified: verify };
      o.radiologistId = radiologistId;
      o.status = verify ? "Verified" : "Reported";
      o.acquiredAt ??= new Date().toISOString();
      return view(o);
    });
  },

  setStatus(id: string, status: RadiologyStatus): Promise<RadiologyOrderView> {
    return mock(() => {
      const o = db().radiologyOrders.find((x) => x.id === id) ?? notFound("Radiology order", id);
      o.status = status;
      if (status === "Scheduled") o.scheduledAt = new Date().toISOString();
      if (status === "Acquired") o.acquiredAt = new Date().toISOString();
      return view(o);
    });
  },
};
