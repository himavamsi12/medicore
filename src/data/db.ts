import { buildDoctors, buildVendors, DEPARTMENTS, HOSPITAL, OPERATION_THEATRES, PACKAGES, PAYERS } from "./org";
import { DRUGS } from "./reference/drugs";
import { buildPatients, buildStaff } from "./build/people";
import { buildInpatient, buildWardsAndBeds } from "./build/inpatient";
import { buildAppointments } from "./build/outpatient";
import { buildLabOrders, buildRadiology } from "./build/diagnostics";
import { buildMar, buildPrescriptions, buildStock } from "./build/pharmacy";
import { buildBlood, buildHandovers, buildInventory, buildRoster, buildSurgeries } from "./build/operations";
import { buildBills, buildClaims } from "./build/finance";
import { buildActivity, buildDocuments, buildNotifications } from "./build/feeds";
import type { Database } from "./build/types";

/**
 * Builds the complete mock hospital. Deterministic (seeded) apart from being
 * anchored to the current date, so every reload tells the same story.
 */
function buildDatabase(): Database {
  const doctors = buildDoctors();
  const { wards, beds } = buildWardsAndBeds();
  const staff = buildStaff(doctors, wards);
  const seeds = buildPatients(230, doctors);
  const patients = seeds.map((s) => s.patient);

  const { admissions, erCases, vitals, trajectoryOf } = buildInpatient(seeds, doctors, wards, beds, staff);
  const appointments = buildAppointments(seeds, doctors, vitals, vitals.length + 1);
  const labOrders = buildLabOrders(seeds, admissions, appointments, erCases, doctors, staff, trajectoryOf);
  const radiologyOrders = buildRadiology(seeds, admissions, appointments, erCases, doctors);
  const stock = buildStock();
  const prescriptions = buildPrescriptions(seeds, admissions, appointments, erCases, staff);
  const mar = buildMar(admissions, prescriptions, staff);
  const surgeries = buildSurgeries(seeds, admissions, doctors, staff);
  const handovers = buildHandovers(admissions, wards, staff, seeds, trajectoryOf);
  const { units: bloodUnits, requests: bloodRequests } = buildBlood(seeds, admissions);
  const vendors = buildVendors();
  const { items: inventory, pos: purchaseOrders } = buildInventory(vendors);
  const { roster, attendance } = buildRoster(staff);
  const bills = buildBills({ patients, doctors, wards, drugs: DRUGS, appointments, admissions, erCases, labOrders, radiologyOrders, prescriptions, surgeries, staff });
  const claims = buildClaims(admissions, bills, patients);

  const db: Database = {
    hospital: HOSPITAL,
    departments: DEPARTMENTS.map((d) => ({ ...d, headDoctorId: doctors.find((doc) => doc.departmentId === d.id && doc.designation === "HOD")?.id })),
    doctors,
    wards,
    beds,
    patients,
    vitals: vitals.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)),
    documents: [],
    appointments,
    admissions,
    erCases,
    labOrders,
    radiologyOrders,
    drugs: DRUGS,
    stock,
    prescriptions,
    mar,
    handovers,
    theatres: OPERATION_THEATRES,
    surgeries,
    bloodUnits,
    bloodRequests,
    payers: PAYERS,
    packages: PACKAGES,
    bills,
    claims,
    vendors,
    inventory,
    purchaseOrders,
    staff,
    roster,
    attendance,
    notifications: [],
    activity: [],
    meta: {
      profileOf: Object.fromEntries(seeds.map((s) => [s.patient.id, s.profile.key])),
      trajectoryOf,
      showcase: seeds.filter((s) => s.showcase).map((s) => s.patient.id),
    },
    seq: {},
  };
  db.documents = buildDocuments(db);
  db.notifications = buildNotifications(db);
  db.activity = buildActivity(db);
  return db;
}

let instance: Database | undefined;

/** Lazily built singleton so the (large) mock dataset is only generated when first used. */
export function getDb(): Database {
  if (!instance) instance = buildDatabase();
  return instance;
}

export type { Database } from "./build/types";
