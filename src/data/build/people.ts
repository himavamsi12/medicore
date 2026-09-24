import { subDays, subYears, format } from "date-fns";
import type { Allergy, BloodGroup, Doctor, Gender, Patient, Staff, StaffCategory, Ward } from "@/types";
import { PROFILES, type ClinicalProfile } from "../reference/profiles";
import { DRUGS } from "../reference/drugs";
import { INSURERS, PAYERS, TPAS } from "../org";
import { NOW, TODAY, iso, day } from "../seed/clock";
import { abhaAddress, abhaNumber, address, indianMobile, language, occupation, personName, FEMALE_FIRST, MALE_FIRST, SURNAMES } from "../seed/india";
import { Rng } from "../seed/random";
import { idOf } from "./types";

export interface ShowcaseSpec {
  profile: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  age: number;
  placement: "admit" | "opd-today" | "er" | "surgery-today" | "surgery-tomorrow";
  trajectory?: "improving" | "steady" | "deteriorating";
  allergies?: Allergy[];
  insurance?: boolean;
}

/** Hand-picked patients referenced by the hand-written AI content in /src/data/ai. */
export const SHOWCASE: ShowcaseSpec[] = [
  { profile: "sepsis", firstName: "Venkatesh", lastName: "Rao", gender: "Male", age: 67, placement: "admit", trajectory: "improving", insurance: true, allergies: [{ substance: "Penicillin", category: "Drug", reaction: "Generalised urticaria and lip swelling", severity: "Severe" }] },
  { profile: "stemi", firstName: "Suresh", lastName: "Patil", gender: "Male", age: 58, placement: "admit", trajectory: "improving", insurance: true },
  { profile: "dengue", firstName: "Ananya", lastName: "Sharma", gender: "Female", age: 24, placement: "admit", trajectory: "deteriorating" },
  { profile: "t2dm-htn", firstName: "Mohammed", lastName: "Qureshi", gender: "Male", age: 54, placement: "opd-today", allergies: [{ substance: "Sulfonamides", category: "Drug", reaction: "Maculopapular rash", severity: "Moderate" }] },
  { profile: "hf", firstName: "Saraswati", lastName: "Iyer", gender: "Female", age: 71, placement: "opd-today", allergies: [{ substance: "Aspirin", category: "Drug", reaction: "Bronchospasm", severity: "Severe" }] },
  { profile: "stroke", firstName: "Gopal", lastName: "Krishnan", gender: "Male", age: 72, placement: "admit", trajectory: "steady", insurance: true },
  { profile: "pregnancy", firstName: "Kavya", lastName: "Hegde", gender: "Female", age: 29, placement: "opd-today" },
  { profile: "ckd", firstName: "Basavaraj", lastName: "Gowda", gender: "Male", age: 63, placement: "admit", trajectory: "deteriorating", insurance: true },
  { profile: "pneumonia", firstName: "Joseph", lastName: "Fernandes", gender: "Male", age: 76, placement: "admit", trajectory: "deteriorating", insurance: true },
  { profile: "oa-knee", firstName: "Shobha", lastName: "Kulkarni", gender: "Female", age: 66, placement: "surgery-today", insurance: true },
  { profile: "cholelithiasis", firstName: "Nandini", lastName: "Reddy", gender: "Female", age: 44, placement: "surgery-tomorrow", insurance: true },
  { profile: "trauma", firstName: "Harpreet", lastName: "Singh", gender: "Male", age: 27, placement: "er" },
  { profile: "copd", firstName: "Chandrashekar", lastName: "Murthy", gender: "Male", age: 69, placement: "er", allergies: [{ substance: "Fluoroquinolones", category: "Drug", reaction: "Tendon pain", severity: "Mild" }] },
  { profile: "asthma", firstName: "Riya", lastName: "Menon", gender: "Female", age: 17, placement: "er" },
  { profile: "ca-breast", firstName: "Geetha", lastName: "Subramanian", gender: "Female", age: 52, placement: "admit", trajectory: "steady", insurance: true },
];

const BLOOD: [BloodGroup, number][] = [["O+", 37], ["B+", 32], ["A+", 22], ["AB+", 7], ["O-", 1], ["B-", 0.8], ["A-", 0.7], ["AB-", 0.3]];

const ALLERGY_POOL: Allergy[] = [
  { substance: "Penicillin", category: "Drug", reaction: "Urticaria", severity: "Moderate" },
  { substance: "Sulfonamides", category: "Drug", reaction: "Rash", severity: "Mild" },
  { substance: "NSAIDs", category: "Drug", reaction: "Angioedema", severity: "Severe" },
  { substance: "Aspirin", category: "Drug", reaction: "Wheeze", severity: "Moderate" },
  { substance: "Iodinated contrast", category: "Drug", reaction: "Hives and flushing", severity: "Moderate" },
  { substance: "Morphine", category: "Drug", reaction: "Itching and nausea", severity: "Mild" },
  { substance: "Metronidazole", category: "Drug", reaction: "Metallic taste and vomiting", severity: "Mild" },
  { substance: "Cephalosporins", category: "Drug", reaction: "Rash", severity: "Moderate" },
  { substance: "Peanuts", category: "Food", reaction: "Throat tightness", severity: "Severe" },
  { substance: "Shellfish", category: "Food", reaction: "Hives", severity: "Moderate" },
  { substance: "Dust mite", category: "Environmental", reaction: "Rhinitis and wheeze", severity: "Mild" },
  { substance: "Latex", category: "Environmental", reaction: "Contact dermatitis", severity: "Mild" },
];

const RELATIONS_FOR = (gender: Gender, age: number) =>
  age < 18 ? ["Father", "Mother"] : age > 60 ? ["Son", "Daughter", gender === "Male" ? "Wife" : "Husband"] : [gender === "Male" ? "Wife" : "Husband", "Brother", "Sister", "Father", "Mother"];

function profileByKey(key: string): ClinicalProfile {
  const p = PROFILES.find((x) => x.key === key);
  if (!p) throw new Error(`Unknown profile ${key}`);
  return p;
}

function samplePatientProfile(rng: Rng): ClinicalProfile {
  return rng.weighted(PROFILES.filter((p) => p.weight > 0).map((p) => [p, p.weight] as const));
}

export interface PatientSeed {
  patient: Patient;
  profile: ClinicalProfile;
  showcase?: ShowcaseSpec;
}

export function buildPatients(total: number, doctors: Doctor[]): PatientSeed[] {
  const rng = new Rng("patients");
  const seeds: PatientSeed[] = [];

  const makeOne = (n: number, profile: ClinicalProfile, spec?: ShowcaseSpec, neonateMother?: string): PatientSeed => {
    const gender: Gender = spec?.gender ?? profile.gender ?? (rng.chance(0.5) ? "Male" : "Female");
    const age = spec?.age ?? rng.int(profile.ageRange[0], profile.ageRange[1]);
    const nm = spec
      ? { firstName: spec.firstName, lastName: spec.lastName, fullName: `${spec.firstName} ${spec.lastName}` }
      : personName(rng, gender);
    const firstName = neonateMother ? `Baby of ${neonateMother}` : nm.firstName;
    const fullName = neonateMother ? `${firstName} ${nm.lastName}` : nm.fullName;
    const dob = neonateMother
      ? day(subDays(TODAY, rng.int(2, 9)))
      : format(subDays(subYears(TODAY, age), rng.int(0, 364)), "yyyy-MM-dd");

    const allergies = spec?.allergies ?? (rng.chance(0.2) ? rng.sample(ALLERGY_POOL, rng.chance(0.2) ? 2 : 1) : []);
    const since = (chronic: boolean) => (chronic ? day(subDays(TODAY, rng.int(200, 4200))) : day(subDays(TODAY, rng.int(0, 10))));

    const insured = spec?.insurance ?? rng.chance(age < 1 ? 0.4 : 0.46);
    let paymentCategory: Patient["paymentCategory"] = "Self-pay";
    let insurance: Patient["insurance"];
    if (insured) {
      const kind = rng.weighted([["Insurance", 72], ["PMJAY", 12], ["CGHS", 8], ["Corporate", 8]] as const);
      paymentCategory = kind;
      const payer =
        kind === "PMJAY" ? PAYERS.find((p) => p.id === "PAY-PMJAY")! :
        kind === "CGHS" ? PAYERS.find((p) => p.id === "PAY-CGHS")! :
        kind === "Corporate" ? PAYERS.find((p) => p.id === "PAY-INFY")! :
        rng.pick(INSURERS);
      const tpa = kind === "Insurance" && rng.chance(0.6) ? rng.pick(TPAS) : undefined;
      insurance = {
        payerId: payer.id,
        payerName: payer.shortName,
        tpaName: tpa?.shortName,
        policyNo: kind === "PMJAY" ? `PMJAY-KA-${rng.digits(9)}` : kind === "CGHS" ? `CGHS/BLR/${rng.digits(7)}` : `${payer.shortName.slice(0, 3).toUpperCase()}/${rng.digits(4)}/${rng.digits(8)}`,
        validTill: day(subDays(TODAY, -rng.int(40, 360))),
        sumInsured: kind === "PMJAY" ? 500000 : rng.pick([300000, 500000, 500000, 1000000, 1500000, 2500000]),
      };
    }

    const deptDoctors = doctors.filter((d) => d.departmentId === profile.departmentId);
    const hasAbha = rng.chance(0.68) && !neonateMother;
    const registeredAt = iso(subDays(NOW, neonateMother ? rng.int(1, 8) : rng.int(0, 1400)));

    const patient: Patient = {
      id: idOf("PAT", n),
      uhid: `MC${String(260000 + n * 37 + rng.int(0, 30)).padStart(7, "0")}`,
      abhaNumber: hasAbha ? abhaNumber(rng) : undefined,
      abhaAddress: hasAbha ? abhaAddress(nm.firstName, nm.lastName, rng) : undefined,
      firstName,
      lastName: nm.lastName,
      fullName,
      gender,
      dob,
      bloodGroup: rng.weighted(BLOOD),
      phone: indianMobile(rng),
      email: age >= 18 && rng.chance(0.55) ? `${nm.firstName.toLowerCase()}.${nm.lastName.toLowerCase().replace(/[^a-z]/g, "")}@${rng.pick(["gmail.com", "gmail.com", "yahoo.co.in", "outlook.com", "rediffmail.com"])}` : undefined,
      address: address(rng),
      maritalStatus: age < 21 ? "Single" : age > 70 && rng.chance(0.3) ? "Widowed" : rng.chance(0.85) ? "Married" : "Single",
      occupation: age < 18 ? (age < 5 ? undefined : "Student") : age > 62 ? "Retired" : occupation(rng),
      preferredLanguage: language(rng),
      emergencyContact: {
        name: `${rng.pick(gender === "Male" ? FEMALE_FIRST : MALE_FIRST)} ${nm.lastName}`,
        relation: rng.pick(RELATIONS_FOR(gender, age)),
        phone: indianMobile(rng),
      },
      allergies,
      conditions: profile.conditions.map(([code, name, chronic]) => ({ code, name, chronic, since: since(chronic) })),
      homeMedications: profile.conditions.some(([, , chronic]) => chronic)
        ? profile.meds.map((b) => DRUGS.find((d) => d.brand === b)).filter((d) => d && ["Tablet", "Capsule", "Inhaler", "Syrup"].includes(d.form)).map((d) => d!.id)
        : [],
      paymentCategory,
      insurance,
      status: "OPD",
      primaryDoctorId: deptDoctors.length ? rng.pick(deptDoctors).id : undefined,
      registeredAt,
      flags: [],
    };
    if (profile.key === "pregnancy" || profile.key === "preeclampsia") patient.flags.push("Pregnant");
    if (age >= 75 || profile.key === "fracture" || profile.key === "stroke") patient.flags.push("Fall risk");
    if (profile.key === "trauma" || profile.key === "op-poisoning") patient.flags.push("MLC");
    if (rng.chance(0.015)) patient.flags.push("VIP");
    return { patient, profile, showcase: spec };
  };

  let n = 1;
  for (const spec of SHOWCASE) seeds.push(makeOne(n++, profileByKey(spec.profile), spec));
  // four NICU neonates
  for (let i = 0; i < 4; i++) {
    const mother = rng.pick(FEMALE_FIRST);
    seeds.push(makeOne(n++, profileByKey("neonate"), undefined, mother));
  }
  while (seeds.length < total) seeds.push(makeOne(n++, samplePatientProfile(rng)));
  return seeds;
}

/* ---------------- Staff ---------------- */

export function buildStaff(doctors: Doctor[], wards: Ward[]): Staff[] {
  const rng = new Rng("staff");
  const staff: Staff[] = [];
  let n = 1;
  const push = (s: Omit<Staff, "id" | "employeeId" | "email" | "phone" | "status" | "employment"> & Partial<Staff>) => {
    const slug = s.name.replace(/^(Dr\.|Sr\.|Br\.)\s*/, "").toLowerCase().replace(/[^a-z ]/g, "").split(" ");
    staff.push({
      id: idOf("STF", n),
      employeeId: `EMP-${String(1000 + n * 7).padStart(5, "0")}`,
      email: `${slug[0]}.${slug[slug.length - 1]}${n}@medicore.in`,
      phone: indianMobile(rng),
      status: rng.chance(0.05) ? "On leave" : rng.chance(0.02) ? "Notice period" : "Active",
      employment: rng.chance(0.82) ? "Permanent" : "Contract",
      ...s,
    });
    n++;
  };

  for (const d of doctors) {
    push({
      name: d.name,
      gender: d.gender,
      category: "Doctor",
      designation: d.designation,
      departmentId: d.departmentId,
      doctorId: d.id,
      joinedAt: d.joinedAt,
      employment: d.designation === "Registrar" || d.designation === "Resident" ? "Contract" : "Permanent",
    });
  }

  const person = (gender: "Male" | "Female") => {
    const first = gender === "Female" ? rng.pick(FEMALE_FIRST) : rng.pick(MALE_FIRST);
    return `${first} ${rng.pick(SURNAMES)}`;
  };
  const joined = () => day(subDays(TODAY, rng.int(60, 3900)));

  // 72 nurses: spread over clinical wards plus OT and OPD
  const nurseWards = wards.filter((w) => w.type !== "ER");
  for (let i = 0; i < 72; i++) {
    const gender = rng.chance(0.86) ? "Female" : "Male";
    const ward = i < nurseWards.length ? nurseWards[i] : i < 64 ? rng.pick(nurseWards) : undefined;
    const isEr = i >= 64 && i < 68;
    const isOt = i >= 68;
    push({
      name: person(gender),
      gender,
      category: "Nurse",
      designation: i < nurseWards.length ? "Nurse in-charge" : rng.pick(["Staff Nurse", "Staff Nurse", "Senior Staff Nurse", "Staff Nurse (GNM)"]),
      departmentId: isEr ? "DEP-EM" : isOt ? "DEP-ANA" : ward?.departmentId ?? "DEP-GM",
      wardId: isEr ? "WRD-ER" : isOt ? undefined : ward?.id,
      joinedAt: joined(),
    });
  }

  const add = (count: number, category: StaffCategory, dept: string, designations: string[], femaleShare = 0.5) => {
    for (let i = 0; i < count; i++) {
      const gender = rng.chance(femaleShare) ? "Female" : "Male";
      push({ name: person(gender), gender, category, designation: rng.pick(designations), departmentId: dept, joinedAt: joined() });
    }
  };
  add(12, "Technician", "DEP-LAB", ["Lab Technician", "Senior Lab Technician", "Phlebotomist"], 0.55);
  add(6, "Technician", "DEP-RAD", ["Radiographer", "CT Technologist", "MRI Technologist"], 0.35);
  add(8, "Pharmacist", "DEP-GM", ["Pharmacist", "Senior Pharmacist", "Pharmacy In-charge"], 0.45);
  add(12, "Front office", "DEP-GM", ["Front Office Executive", "Patient Relations Executive", "OPD Coordinator"], 0.65);
  add(8, "Billing", "DEP-GM", ["Billing Executive", "Insurance Desk Executive", "Accounts Officer"], 0.5);
  add(8, "Administration", "DEP-GM", ["Medical Records Officer", "HR Executive", "Quality Manager", "Operations Manager", "Purchase Officer"], 0.5);
  add(8, "Housekeeping", "DEP-GM", ["Housekeeping Attendant", "Housekeeping Supervisor"], 0.5);
  add(4, "Security", "DEP-GM", ["Security Guard", "Security Supervisor"], 0.1);

  // Assign ward nurse-in-charge back onto wards
  for (const w of wards) {
    const nic = staff.find((s) => s.wardId === w.id && s.designation === "Nurse in-charge");
    if (nic) w.nurseInChargeId = nic.id;
  }
  return staff;
}
