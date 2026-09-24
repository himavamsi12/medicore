import {
  Activity,
  BedDouble,
  Building2,
  CalendarClock,
  ClipboardList,
  Droplet,
  FlaskConical,
  HeartPulse,
  LayoutDashboard,
  LineChart,
  Package,
  Pill,
  Receipt,
  ScanLine,
  Scissors,
  Settings,
  Siren,
  Stethoscope,
  Users,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/types";
import { canAccess } from "./rbac";

export interface NavLeaf {
  label: string;
  href: string;
}

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  children?: NavLeaf[];
  /** Short keyword aliases used by the command bar. */
  keywords?: string[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, keywords: ["home", "kpi"] },
      { label: "Reports & analytics", href: "/reports", icon: LineChart, keywords: ["analytics", "revenue", "occupancy", "forecast"] },
    ],
  },
  {
    label: "Patient care",
    items: [
      { label: "Patients", href: "/patients", icon: UserRound, keywords: ["emr", "registration", "uhid"], children: [{ label: "All patients", href: "/patients" }, { label: "Register patient", href: "/patients/new" }] },
      {
        label: "Outpatients (OPD)",
        href: "/opd/queue",
        icon: CalendarClock,
        keywords: ["opd", "appointments", "token", "queue"],
        children: [
          { label: "Queue board", href: "/opd/queue" },
          { label: "Appointments", href: "/opd/appointments" },
          { label: "Doctor calendar", href: "/opd/calendar" },
        ],
      },
      {
        label: "Inpatients (IPD)",
        href: "/ipd/beds",
        icon: BedDouble,
        keywords: ["ipd", "admission", "bed", "ward", "discharge"],
        children: [
          { label: "Bed map", href: "/ipd/beds" },
          { label: "Admissions", href: "/ipd/admissions" },
        ],
      },
      { label: "Emergency", href: "/emergency", icon: Siren, keywords: ["er", "triage", "casualty"] },
      { label: "Nursing station", href: "/nursing", icon: HeartPulse, keywords: ["vitals", "mar", "handover", "ward"] },
      { label: "Operation theatre", href: "/ot/schedule", icon: Scissors, keywords: ["ot", "surgery", "checklist"] },
    ],
  },
  {
    label: "Diagnostics",
    items: [
      {
        label: "Laboratory",
        href: "/lab/orders",
        icon: FlaskConical,
        keywords: ["lis", "lab", "sample", "results"],
        children: [
          { label: "Orders", href: "/lab/orders" },
          { label: "Sample tracking", href: "/lab/samples" },
        ],
      },
      { label: "Radiology", href: "/radiology", icon: ScanLine, keywords: ["x-ray", "ct", "mri", "usg", "imaging"] },
      { label: "Blood bank", href: "/blood-bank", icon: Droplet, keywords: ["blood", "units", "cross-match"] },
    ],
  },
  {
    label: "Pharmacy & supplies",
    items: [
      {
        label: "Pharmacy",
        href: "/pharmacy/queue",
        icon: Pill,
        keywords: ["rx", "dispense", "drug", "medicine"],
        children: [
          { label: "Prescription queue", href: "/pharmacy/queue" },
          { label: "Stock & expiry", href: "/pharmacy/stock" },
        ],
      },
      {
        label: "Inventory",
        href: "/inventory/items",
        icon: Package,
        keywords: ["store", "procurement", "po", "purchase"],
        children: [
          { label: "Items", href: "/inventory/items" },
          { label: "Purchase orders", href: "/inventory/purchase-orders" },
        ],
      },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        label: "Billing & insurance",
        href: "/billing/bills",
        icon: Receipt,
        keywords: ["bill", "invoice", "tpa", "claim", "gst", "payment"],
        children: [
          { label: "Bills", href: "/billing/bills" },
          { label: "Insurance claims", href: "/billing/claims" },
          { label: "Packages", href: "/billing/packages" },
        ],
      },
    ],
  },
  {
    label: "Organisation",
    items: [
      { label: "Departments", href: "/departments", icon: Building2, keywords: ["specialty", "specialities"] },
      { label: "Doctors", href: "/doctors", icon: Stethoscope, keywords: ["consultant", "schedule", "availability"] },
      {
        label: "Staff & HR",
        href: "/staff",
        icon: Users,
        keywords: ["roster", "attendance", "employee", "duty"],
        children: [
          { label: "Directory", href: "/staff" },
          { label: "Duty roster", href: "/staff/roster" },
          { label: "Attendance", href: "/staff/attendance" },
        ],
      },
      { label: "Settings", href: "/settings", icon: Settings, keywords: ["profile", "theme", "roles"] },
    ],
  },
];

/**
 * Routes implemented so far. Navigation hides anything not listed so users never
 * land on an unfinished page. Extended at the end of every build phase.
 */
export const BUILT_ROUTES: string[] = ["/dashboard", "/patients", "/departments", "/doctors", "/opd", "/ipd", "/nursing", "/emergency", "/lab", "/radiology", "/blood-bank"];

const isBuilt = (href: string) => BUILT_ROUTES.some((r) => href === r || href.startsWith(`${r}/`));

/** Navigation filtered for a role (and for what has been built). */
export function navForRole(role: Role): NavGroup[] {
  return NAV.map((g) => ({
    ...g,
    items: g.items
      .map((item) => ({ ...item, children: item.children?.filter((c) => canAccess(role, c.href) && isBuilt(c.href)) }))
      .filter((item) => (item.children ? item.children.length > 0 : canAccess(role, item.href) && isBuilt(item.href)))
      .map((item) => (item.children && !isBuilt(item.href) ? { ...item, href: item.children[0].href } : item)),
  })).filter((g) => g.items.length > 0);
}

export const MODULE_ICON: Record<string, LucideIcon> = {
  Laboratory: FlaskConical,
  Nursing: HeartPulse,
  Emergency: Siren,
  Pharmacy: Pill,
  Billing: Receipt,
  Inventory: Package,
  "Blood Bank": Droplet,
  OT: Scissors,
  OPD: CalendarClock,
  IPD: BedDouble,
  Patients: UserRound,
  Radiology: ScanLine,
  Reports: LineChart,
  Default: Activity,
  Tasks: ClipboardList,
};
