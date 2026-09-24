import { addDays, format, getDay, getMonth } from "date-fns";
import { TODAY } from "./seed/clock";
import { Rng } from "./seed/random";

/**
 * Pre-aggregated daily metrics (a stand-in for a data warehouse). Transactional
 * mock data only spans a few weeks; reports and forecasts need history, so the
 * last 180 days are generated here with weekday, monsoon and festival effects.
 */
export interface DailyMetrics {
  date: string;
  opdFootfall: number;
  newRegistrations: number;
  admissions: number;
  discharges: number;
  erArrivals: number;
  occupancyPct: number;
  icuOccupancyPct: number;
  surgeries: number;
  labTests: number;
  labTatMedianMin: number;
  revenue: { opd: number; ipd: number; pharmacy: number; diagnostics: number; er: number };
  feverCases: number;
}

export interface DepartmentMonth {
  month: string; // yyyy-MM
  departmentId: string;
  revenue: number;
  opd: number;
  admissions: number;
}

function seasonal(date: Date) {
  const m = getMonth(date); // 0 = Jan
  const monsoon = m >= 6 && m <= 9 ? 1 : 0; // Jul-Oct: dengue, typhoid, malaria
  const festival = m === 9 || m === 10 ? 1 : 0; // Oct-Nov: Dasara / Deepavali dip in electives
  return { monsoon, festival };
}

export function buildDailyMetrics(days = 180): DailyMetrics[] {
  const rng = new Rng("analytics");
  const out: DailyMetrics[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(TODAY, -i);
    const dow = getDay(d); // 0 Sunday
    const { monsoon, festival } = seasonal(d);
    const trend = 1 + (days - i) / days * 0.09; // ~9% growth across the window
    const weekday = dow === 0 ? 0.42 : dow === 6 ? 0.78 : dow === 1 ? 1.12 : 1;
    const opd = Math.round((128 + monsoon * 22 - festival * 12) * weekday * trend + rng.normal(0, 7));
    const adm = Math.max(4, Math.round((15 + monsoon * 4 - festival * 2) * (dow === 0 ? 0.7 : 1) * trend + rng.normal(0, 2.2)));
    const occ = Math.min(96, Math.max(44, 52 + monsoon * 8 - festival * 5 + (dow === 0 ? -3 : 0) + rng.normal(0, 3) + (days - i) / days * 3));
    const surg = dow === 0 ? rng.int(1, 3) : Math.max(3, Math.round((9 - festival * 3) * trend + rng.normal(0, 1.8)));
    const er = Math.round((34 + monsoon * 8 + (dow === 0 || dow === 6 ? 6 : 0)) * trend + rng.normal(0, 4));
    const lab = Math.round(opd * 1.9 + adm * 11 + rng.normal(0, 18));
    const ipdRev = Math.round((adm * 64000 + surg * 38000) * (0.9 + rng.next() * 0.2));
    out.push({
      date: format(d, "yyyy-MM-dd"),
      opdFootfall: opd,
      newRegistrations: Math.round(opd * (0.26 + rng.next() * 0.06)),
      admissions: adm,
      discharges: Math.max(3, adm + Math.round(rng.normal(0, 2))),
      erArrivals: er,
      occupancyPct: Math.round(occ * 10) / 10,
      icuOccupancyPct: Math.round(Math.min(100, occ + 12 + rng.normal(0, 4)) * 10) / 10,
      surgeries: surg,
      labTests: lab,
      labTatMedianMin: Math.round(142 - (days - i) / days * 18 + (monsoon ? 14 : 0) + rng.normal(0, 9)),
      revenue: {
        opd: Math.round(opd * 1040 * (0.95 + rng.next() * 0.1)),
        ipd: ipdRev,
        pharmacy: Math.round((opd * 420 + adm * 9800) * (0.9 + rng.next() * 0.2)),
        diagnostics: Math.round(lab * 310 * (0.92 + rng.next() * 0.16)),
        er: Math.round(er * 2600 * (0.9 + rng.next() * 0.2)),
      },
      feverCases: Math.round(opd * (0.08 + monsoon * 0.14) + rng.normal(0, 3)),
    });
  }
  return out;
}

const DEPT_SHARE: Record<string, number> = {
  "DEP-CAR": 0.15, "DEP-ORT": 0.12, "DEP-GS": 0.1, "DEP-OBG": 0.09, "DEP-GM": 0.09, "DEP-NEP": 0.07, "DEP-NEU": 0.07,
  "DEP-CCM": 0.08, "DEP-GAS": 0.05, "DEP-PUL": 0.04, "DEP-ONC": 0.05, "DEP-PED": 0.04, "DEP-URO": 0.03, "DEP-EM": 0.03,
  "DEP-ENT": 0.015, "DEP-DER": 0.01, "DEP-END": 0.015,
};

export function buildDepartmentMonths(daily: DailyMetrics[]): DepartmentMonth[] {
  const rng = new Rng("dept-months");
  const byMonth = new Map<string, DailyMetrics[]>();
  for (const d of daily) {
    const m = d.date.slice(0, 7);
    byMonth.set(m, [...(byMonth.get(m) ?? []), d]);
  }
  const out: DepartmentMonth[] = [];
  for (const [month, rows] of byMonth) {
    const total = rows.reduce((s, r) => s + r.revenue.opd + r.revenue.ipd + r.revenue.pharmacy + r.revenue.diagnostics + r.revenue.er, 0);
    const opd = rows.reduce((s, r) => s + r.opdFootfall, 0);
    const adm = rows.reduce((s, r) => s + r.admissions, 0);
    for (const [departmentId, share] of Object.entries(DEPT_SHARE)) {
      const jitter = 0.9 + rng.next() * 0.2;
      out.push({ month, departmentId, revenue: Math.round(total * share * jitter), opd: Math.round(opd * share * jitter), admissions: Math.round(adm * share * jitter) });
    }
  }
  return out;
}

let cache: { daily: DailyMetrics[]; departments: DepartmentMonth[] } | undefined;

export function getAnalytics() {
  if (!cache) {
    const daily = buildDailyMetrics();
    cache = { daily, departments: buildDepartmentMonths(daily) };
  }
  return cache;
}
