import { format } from "date-fns";
import { localDate } from "@/lib/dates";
import type {
  Admission,
  AdmissionView,
  AdmitInput,
  BedStatus,
  BedView,
  DischargeSummary,
  ListParams,
  Paginated,
  TransferInput,
  Ward,
  WardOccupancy,
} from "@/types";
import { news2 } from "@/lib/clinical";
import { mock, notFound, ServiceError } from "./http";
import { admissionView, db, doctorRef, latestVitals, nextId, patientRef } from "./mappers";
import { oneOf, runQuery } from "./query";

function bedView(bedId: string): BedView {
  const d = db();
  const bed = d.beds.find((b) => b.id === bedId)!;
  const ward = d.wards.find((w) => w.id === bed.wardId)!;
  const adm = bed.admissionId ? d.admissions.find((a) => a.id === bed.admissionId) : undefined;
  const lv = bed.patientId && bed.status === "Occupied" ? latestVitals(bed.patientId) : undefined;
  return {
    ...bed,
    ward,
    patient: bed.patientId && bed.status === "Occupied" ? patientRef(bed.patientId) : undefined,
    admission: adm ? { id: adm.id, ipNo: adm.ipNo, admittedAt: adm.admittedAt, acuity: adm.acuity, expectedDischarge: adm.expectedDischarge, status: adm.status, reason: adm.reason } : undefined,
    doctorName: adm ? doctorRef(adm.admittingDoctorId).name : undefined,
    news2: lv ? news2(lv) : undefined,
  };
}

export const ipdService = {
  getAdmissions(params: ListParams = {}): Promise<Paginated<AdmissionView>> {
    return mock(() =>
      runQuery(db().admissions.map(admissionView), params, {
        search: (r) => [r.patient.fullName, r.patient.uhid, r.ipNo, r.bed.code, r.doctor.name, r.reason, ...r.provisionalDiagnosis.map((x) => x.name)],
        filters: {
          status: (r, v) => oneOf(r.status, v),
          active: (r, v) => (v === "true" ? !r.dischargedAt : v === "false" ? Boolean(r.dischargedAt) : true),
          wardId: (r, v) => oneOf(r.wardId, v),
          wardType: (r, v) => oneOf(r.ward.type, v),
          departmentId: (r, v) => oneOf(r.departmentId, v),
          acuity: (r, v) => oneOf(r.acuity, v),
          admissionType: (r, v) => oneOf(r.admissionType, v),
          doctorId: (r, v) => oneOf(r.admittingDoctorId, v),
        },
        sort: {
          admittedAt: (r) => r.admittedAt,
          patient: (r) => r.patient.fullName,
          bed: (r) => r.bed.code,
          los: (r) => r.lengthOfStayDays,
          acuity: (r) => ["Critical", "Serious", "Stable"].indexOf(r.acuity),
          news2: (r) => r.news2 ?? -1,
          expectedDischarge: (r) => r.expectedDischarge,
        },
        date: (r) => r.admittedAt,
        defaultSort: { id: "admittedAt", desc: true },
      }),
    );
  },

  getAdmission(id: string): Promise<AdmissionView> {
    return mock(() => admissionView(db().admissions.find((a) => a.id === id) ?? notFound("Admission", id)));
  },

  getAdmissionsByPatient(patientId: string): Promise<AdmissionView[]> {
    return mock(() => db().admissions.filter((a) => a.patientId === patientId).map(admissionView).sort((a, b) => b.admittedAt.localeCompare(a.admittedAt)));
  },

  getWards(): Promise<Ward[]> {
    return mock(() => db().wards, { min: 60, max: 150 });
  },

  getOccupancy(): Promise<WardOccupancy[]> {
    return mock(() => {
      const d = db();
      return d.wards.map((ward) => {
        const beds = d.beds.filter((b) => b.wardId === ward.id);
        const count = (s: BedStatus) => beds.filter((b) => b.status === s).length;
        return {
          ward,
          total: beds.length,
          occupied: count("Occupied"),
          available: count("Available"),
          cleaning: count("Cleaning"),
          reserved: count("Reserved"),
          maintenance: count("Maintenance"),
          nurseInCharge: d.staff.find((s) => s.id === ward.nurseInChargeId)?.name,
        };
      });
    });
  },

  getBeds(filters: { wardId?: string; status?: BedStatus[] } = {}): Promise<BedView[]> {
    return mock(() =>
      db()
        .beds.filter((b) => (!filters.wardId || b.wardId === filters.wardId) && (!filters.status?.length || filters.status.includes(b.status)))
        .map((b) => bedView(b.id)),
    );
  },

  setBedStatus(bedId: string, status: Exclude<BedStatus, "Occupied">): Promise<BedView> {
    return mock(() => {
      const bed = db().beds.find((b) => b.id === bedId) ?? notFound("Bed", bedId);
      if (bed.status === "Occupied") throw new ServiceError("Bed is occupied. Transfer or discharge the patient first.");
      bed.status = status;
      bed.statusSince = new Date().toISOString();
      return bedView(bedId);
    });
  },

  admit(input: AdmitInput): Promise<AdmissionView> {
    return mock(() => {
      const d = db();
      const bed = d.beds.find((b) => b.id === input.bedId) ?? notFound("Bed", input.bedId);
      if (bed.status !== "Available" && bed.status !== "Reserved") throw new ServiceError(`Bed ${bed.code} is ${bed.status.toLowerCase()}`);
      if (d.admissions.some((a) => a.patientId === input.patientId && !a.dischargedAt)) throw new ServiceError("Patient already has an active admission");
      const doc = d.doctors.find((x) => x.id === input.admittingDoctorId) ?? notFound("Doctor", input.admittingDoctorId);
      const now = new Date().toISOString();
      const adm: Admission = {
        id: nextId("ADM", d.admissions, 4),
        ipNo: `IP/26/${String(4800 + d.admissions.length).padStart(5, "0")}`,
        patientId: input.patientId,
        bedId: bed.id,
        wardId: bed.wardId,
        admittingDoctorId: doc.id,
        departmentId: doc.departmentId,
        admittedAt: now,
        expectedDischarge: input.expectedDischarge,
        status: "Admitted",
        admissionType: input.admissionType,
        acuity: "Stable",
        provisionalDiagnosis: input.provisionalDiagnosis,
        reason: input.reason,
        dietOrder: "Normal diet",
        codeStatus: "Full code",
        transfers: [],
        notes: [],
      };
      d.admissions.push(adm);
      Object.assign(bed, { status: "Occupied", admissionId: adm.id, patientId: adm.patientId, statusSince: now });
      const p = d.patients.find((x) => x.id === input.patientId);
      if (p) p.status = "Admitted";
      // Close any open ER case for this patient and release the ER bed
      const er = d.erCases.find((e) => e.patientId === input.patientId && ["Waiting", "In triage", "Under treatment", "Observation"].includes(e.status));
      if (er) {
        er.status = "Admitted";
        er.disposition = `Admitted to ${bed.code} under ${doc.name}`;
        const erBed = er.bedId ? d.beds.find((b) => b.id === er.bedId) : undefined;
        if (erBed) Object.assign(erBed, { status: "Cleaning", patientId: undefined, statusSince: now });
        adm.admissionType = "Emergency";
      }
      d.activity.unshift({ id: nextId("ACT", d.activity), at: now, actor: doc.name, actorRole: "Doctor", verb: "admitted", target: `${patientRef(adm.patientId).fullName} to ${bed.code}`, module: "IPD", href: `/ipd/admissions/${adm.id}`, severity: "info" });
      return admissionView(adm);
    });
  },

  transfer(input: TransferInput): Promise<AdmissionView> {
    return mock(() => {
      const d = db();
      const adm = d.admissions.find((a) => a.id === input.admissionId) ?? notFound("Admission", input.admissionId);
      const from = d.beds.find((b) => b.id === adm.bedId)!;
      const to = d.beds.find((b) => b.id === input.toBedId) ?? notFound("Bed", input.toBedId);
      if (to.status !== "Available" && to.status !== "Reserved") throw new ServiceError(`Bed ${to.code} is not available`);
      const now = new Date().toISOString();
      adm.transfers.push({ id: `TRF-${Date.now()}`, at: now, fromBedId: from.id, toBedId: to.id, reason: input.reason, by: "Current user" });
      Object.assign(from, { status: "Cleaning", admissionId: undefined, patientId: undefined, statusSince: now });
      Object.assign(to, { status: "Occupied", admissionId: adm.id, patientId: adm.patientId, statusSince: now });
      adm.bedId = to.id;
      adm.wardId = to.wardId;
      return admissionView(adm);
    });
  },

  saveDischargeSummary(admissionId: string, summary: Omit<DischargeSummary, "preparedAt">, finalise: boolean): Promise<AdmissionView> {
    return mock(() => {
      const d = db();
      const adm = d.admissions.find((a) => a.id === admissionId) ?? notFound("Admission", admissionId);
      const now = new Date().toISOString();
      adm.dischargeSummary = { ...summary, preparedAt: now, status: finalise ? "Final" : "Draft" };
      if (!finalise) {
        adm.status = "Discharge planned";
        return admissionView(adm);
      }
      adm.status = "Discharged";
      adm.dischargedAt = now;
      const bed = d.beds.find((b) => b.id === adm.bedId);
      if (bed) Object.assign(bed, { status: "Cleaning", admissionId: undefined, patientId: undefined, statusSince: now });
      const p = d.patients.find((x) => x.id === adm.patientId);
      if (p) p.status = "Discharged";
      d.activity.unshift({ id: nextId("ACT", d.activity), at: now, actor: summary.preparedBy, actorRole: "Doctor", verb: "discharged", target: patientRef(adm.patientId).fullName, module: "IPD", href: `/ipd/admissions/${adm.id}`, severity: "stable" });
      return admissionView(adm);
    });
  },

  addProgressNote(admissionId: string, text: string, author: { id: string; name: string; kind: "Doctor" | "Nursing" }): Promise<AdmissionView> {
    return mock(() => {
      const adm = db().admissions.find((a) => a.id === admissionId) ?? notFound("Admission", admissionId);
      adm.notes.push({ id: `NOTE-${Date.now()}`, at: new Date().toISOString(), authorId: author.id, authorName: author.name, kind: author.kind, text });
      return admissionView(adm);
    });
  },

  censusToday(): Promise<{ admittedToday: number; dischargedToday: number; plannedDischarges: number; averageLos: number }> {
    return mock(() => {
      const d = db();
      const today = format(new Date(), "yyyy-MM-dd");
      const active = d.admissions.filter((a) => !a.dischargedAt);
      const done = d.admissions.filter((a) => a.dischargedAt);
      const avg = done.reduce((s, a) => s + (new Date(a.dischargedAt!).getTime() - new Date(a.admittedAt).getTime()) / 86400000, 0) / Math.max(1, done.length);
      return {
        admittedToday: d.admissions.filter((a) => localDate(a.admittedAt) === today).length,
        dischargedToday: done.filter((a) => localDate(a.dischargedAt!) === today).length,
        plannedDischarges: active.filter((a) => a.status === "Discharge planned").length,
        averageLos: Math.round(avg * 10) / 10,
      };
    });
  },
};
