import type { Permission, Role } from "@/types";

/**
 * Mock RBAC. In production these come from the auth token / policy service;
 * the UI only ever asks `can(role, permission)` and `canAccess(role, path)`.
 */
export const PERMISSIONS: Record<Role, Permission[]> = {
  Admin: [
    "patient.register", "patient.viewClinical", "appointment.book", "admission.manage", "bed.transfer", "triage.assign",
    "stock.manage", "ot.manage", "blood.issue", "bill.edit", "payment.collect", "claim.manage", "inventory.manage",
    "po.approve", "staff.manage", "reports.view", "settings.manage",
  ],
  Doctor: [
    "patient.viewClinical", "consult.write", "prescription.write", "admission.manage", "bed.transfer", "discharge.write",
    "vitals.record", "triage.assign", "radiology.report", "ot.manage", "blood.issue", "reports.view",
  ],
  Nurse: ["patient.viewClinical", "vitals.record", "mar.administer", "triage.assign", "bed.transfer", "lab.collect", "blood.issue"],
  Receptionist: ["patient.register", "appointment.book", "admission.manage", "payment.collect"],
  "Lab Technician": ["patient.viewClinical", "lab.collect", "lab.result", "lab.verify", "blood.issue"],
  Pharmacist: ["patient.viewClinical", "pharmacy.dispense", "stock.manage", "inventory.manage"],
  Billing: ["bill.edit", "payment.collect", "claim.manage", "reports.view"],
};

export function can(role: Role, permission: Permission): boolean {
  return PERMISSIONS[role].includes(permission);
}

/** Route prefixes each role may open. Order matters only for readability. */
export const ROUTE_ACCESS: Record<Role, string[]> = {
  Admin: ["*"],
  Doctor: ["/dashboard", "/patients", "/opd", "/ipd", "/emergency", "/departments", "/doctors", "/lab", "/radiology", "/pharmacy", "/ot", "/nursing", "/blood-bank", "/reports", "/settings", "/print"],
  Nurse: ["/dashboard", "/patients", "/opd/queue", "/ipd", "/emergency", "/nursing", "/lab", "/ot", "/blood-bank", "/doctors", "/departments", "/settings", "/print"],
  Receptionist: ["/dashboard", "/patients", "/opd", "/ipd/beds", "/ipd/admissions", "/doctors", "/departments", "/billing/bills", "/emergency", "/settings", "/print"],
  "Lab Technician": ["/dashboard", "/patients", "/lab", "/radiology", "/blood-bank", "/inventory", "/settings", "/print"],
  Pharmacist: ["/dashboard", "/patients", "/pharmacy", "/inventory", "/settings", "/print"],
  Billing: ["/dashboard", "/patients", "/billing", "/reports", "/settings", "/print"],
};

export function canAccess(role: Role, pathname: string): boolean {
  const allowed = ROUTE_ACCESS[role];
  if (allowed.includes("*")) return true;
  return allowed.some((p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(`${p}?`));
}

/** Which staff record plays each role in the demo (resolved by sessionService). */
export const ROLE_PERSONA: Record<Role, { staffId?: string; doctorId?: string; wardId?: string; title: string }> = {
  Admin: { staffId: "STF-0161", title: "Hospital Administrator" },
  Doctor: { doctorId: "DOC-001", title: "HOD, General Medicine" },
  Nurse: { staffId: "STF-0046", wardId: "WRD-HDU", title: "Nurse in-charge, HDU" },
  Receptionist: { staffId: "STF-0141", title: "Front Office Executive" },
  "Lab Technician": { staffId: "STF-0115", title: "Senior Lab Technician" },
  Pharmacist: { staffId: "STF-0133", title: "Pharmacy In-charge" },
  Billing: { staffId: "STF-0153", title: "Insurance Desk Executive" },
};
