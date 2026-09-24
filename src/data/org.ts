import type {
  CarePackage,
  Department,
  Doctor,
  DoctorStatus,
  HospitalProfile,
  OpdSession,
  OperationTheatre,
  Payer,
  Vendor,
  Ward,
  Weekday,
} from "@/types";
import { Rng } from "./seed/random";
import { gstin, indianMobile } from "./seed/india";

export const HOSPITAL: HospitalProfile = {
  name: "MediCore Hospitals",
  legalName: "MediCore Healthcare Pvt. Ltd.",
  tagline: "Multispeciality & Trauma Centre",
  address: "No. 154/11, Bannerghatta Main Road, Opp. IIM-B",
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560076",
  phone: "+91 80 4718 2200",
  emergencyPhone: "+91 80 4718 2211",
  email: "care@medicore.in",
  website: "medicore.in",
  gstin: "29AAJCM4821K1Z6",
  registrationNo: "KPME/BLR/2014/0847",
  nabhNo: "H-2016-0392",
  hfrId: "IN2910004827",
  licensedBeds: 152,
  established: 2014,
};

const dept = (
  id: string,
  code: string,
  name: string,
  kind: Department["kind"],
  floor: string,
  extension: string,
  description: string,
  services: string[],
): Department => ({ id, code, name, kind, floor, extension, description, services });

export const DEPARTMENTS: Department[] = [
  dept("DEP-GM", "GM", "General Medicine", "Clinical", "Ground floor, Block A", "2201", "Adult internal medicine for acute and chronic illness, fever clinic and preventive health checks.", ["Fever clinic", "Diabetes clinic", "Executive health check", "Infectious disease"]),
  dept("DEP-CAR", "CAR", "Cardiology", "Clinical", "2nd floor, Block B", "2240", "Interventional and clinical cardiology with a 24x7 cath lab and chest pain unit.", ["Cath lab", "Echocardiography", "TMT", "Heart failure clinic", "Pacemaker clinic"]),
  dept("DEP-NEU", "NEU", "Neurology", "Clinical", "3rd floor, Block B", "2260", "Stroke-ready unit with thrombolysis protocol, epilepsy and movement disorder clinics.", ["Stroke unit", "EEG", "NCV/EMG", "Epilepsy clinic"]),
  dept("DEP-ORT", "ORT", "Orthopaedics", "Clinical", "1st floor, Block C", "2280", "Joint replacement, arthroscopy, spine and trauma surgery.", ["Joint replacement", "Arthroscopy", "Spine surgery", "Trauma", "Sports medicine"]),
  dept("DEP-PED", "PED", "Paediatrics", "Clinical", "1st floor, Block A", "2210", "General paediatrics, immunisation and Level III NICU.", ["NICU", "Immunisation", "Child development clinic"]),
  dept("DEP-OBG", "OBG", "Obstetrics & Gynaecology", "Clinical", "2nd floor, Block A", "2220", "High-risk pregnancy care, labour suite, laparoscopic gynaecology and fertility.", ["Labour suite", "High-risk pregnancy", "Fertility clinic", "Laparoscopic surgery"]),
  dept("DEP-GS", "GS", "General & Laparoscopic Surgery", "Clinical", "1st floor, Block C", "2290", "Minimal access surgery, hernia, gallbladder, bariatric and breast surgery.", ["Laparoscopic surgery", "Hernia clinic", "Breast clinic", "Bariatric surgery"]),
  dept("DEP-NEP", "NEP", "Nephrology", "Clinical", "3rd floor, Block A", "2230", "Chronic kidney disease care with a 12-station dialysis unit and renal transplant programme.", ["Haemodialysis", "Peritoneal dialysis", "Renal transplant"]),
  dept("DEP-GAS", "GAS", "Gastroenterology", "Clinical", "3rd floor, Block C", "2300", "Endoscopy suite, ERCP and hepatology services.", ["Endoscopy", "Colonoscopy", "ERCP", "Liver clinic"]),
  dept("DEP-PUL", "PUL", "Pulmonology", "Clinical", "2nd floor, Block C", "2310", "Respiratory medicine, bronchoscopy, sleep studies and TB care under NTEP.", ["Bronchoscopy", "PFT", "Sleep lab", "TB clinic"]),
  dept("DEP-ONC", "ONC", "Oncology", "Clinical", "4th floor, Block B", "2320", "Medical and surgical oncology with a day-care chemotherapy unit.", ["Chemotherapy day care", "Tumour board", "Palliative care"]),
  dept("DEP-ENT", "ENT", "ENT", "Clinical", "Ground floor, Block C", "2330", "Otorhinolaryngology, head and neck surgery, audiology.", ["Audiology", "Endoscopic sinus surgery", "Vertigo clinic"]),
  dept("DEP-DER", "DER", "Dermatology", "Clinical", "Ground floor, Block C", "2340", "Clinical and procedural dermatology.", ["Psoriasis clinic", "Dermatosurgery", "Phototherapy"]),
  dept("DEP-URO", "URO", "Urology", "Clinical", "3rd floor, Block C", "2350", "Endourology, laser stone surgery and uro-oncology.", ["URSL / RIRS", "TURP", "Uro-oncology"]),
  dept("DEP-END", "END", "Endocrinology", "Clinical", "3rd floor, Block A", "2360", "Diabetes, thyroid, obesity and metabolic bone disease.", ["Diabetes clinic", "Thyroid clinic", "Insulin pump programme"]),
  dept("DEP-EM", "EM", "Emergency Medicine", "Clinical", "Ground floor, Block B", "2211", "24x7 emergency department with trauma bay and ambulance network.", ["Trauma bay", "Resuscitation", "Toxicology"]),
  dept("DEP-CCM", "CCM", "Critical Care", "Clinical", "4th floor, Block A", "2370", "Medical, surgical and cardiac ICUs with ECMO capability.", ["MICU", "SICU", "CCU", "ECMO"]),
  dept("DEP-ANA", "ANA", "Anaesthesiology", "Support", "1st floor, Block C", "2380", "Anaesthesia, pain management and pre-anaesthetic clinic.", ["Pre-anaesthetic clinic", "Pain clinic"]),
  dept("DEP-RAD", "RAD", "Radiology", "Diagnostic", "Lower ground, Block B", "2400", "X-ray, 128-slice CT, 3T MRI, ultrasound and interventional radiology.", ["CT", "MRI", "Ultrasound", "Interventional radiology"]),
  dept("DEP-LAB", "LAB", "Laboratory Medicine", "Diagnostic", "Lower ground, Block A", "2410", "NABL-accredited pathology, biochemistry and microbiology.", ["Pathology", "Biochemistry", "Microbiology", "Blood bank"]),
];

type DocRow = [
  name: string,
  gender: "Male" | "Female",
  deptId: string,
  designation: Doctor["designation"],
  quals: string,
  exp: number,
  fee: number,
  interests: string[],
];

const doctorRows: DocRow[] = [
  ["Dr. Ramesh Iyer", "Male", "DEP-GM", "HOD", "MBBS, MD (General Medicine), FRCP (Edin)", 26, 1000, ["Diabetes", "Tropical fevers"]],
  ["Dr. Kavitha Rao", "Female", "DEP-GM", "Senior Consultant", "MBBS, MD (General Medicine)", 18, 900, ["Infectious disease", "Geriatrics"]],
  ["Dr. Imran Qureshi", "Male", "DEP-GM", "Consultant", "MBBS, DNB (Internal Medicine)", 9, 800, ["Hypertension", "Preventive health"]],
  ["Dr. Anitha Menon", "Female", "DEP-GM", "Associate Consultant", "MBBS, MD (General Medicine)", 5, 700, ["Thyroid", "Anaemia"]],
  ["Dr. Suresh Reddy", "Male", "DEP-CAR", "HOD", "MBBS, MD, DM (Cardiology), FACC", 24, 1500, ["Complex PCI", "Structural heart"]],
  ["Dr. Meera Krishnan", "Female", "DEP-CAR", "Senior Consultant", "MBBS, MD, DM (Cardiology)", 16, 1300, ["Heart failure", "Echocardiography"]],
  ["Dr. Arjun Hegde", "Male", "DEP-CAR", "Consultant", "MBBS, DNB (Medicine), DNB (Cardiology)", 10, 1200, ["Electrophysiology", "Pacing"]],
  ["Dr. Vidya Subramanian", "Female", "DEP-NEU", "HOD", "MBBS, MD, DM (Neurology)", 21, 1400, ["Stroke", "Neuro-immunology"]],
  ["Dr. Karthik Nair", "Male", "DEP-NEU", "Consultant", "MBBS, MD, DM (Neurology)", 8, 1200, ["Epilepsy", "Headache"]],
  ["Dr. Basavaraj Gowda", "Male", "DEP-ORT", "HOD", "MBBS, MS (Ortho), FRCS (Glasgow)", 23, 1200, ["Knee and hip replacement"]],
  ["Dr. Rohan Kulkarni", "Male", "DEP-ORT", "Senior Consultant", "MBBS, MS (Ortho), Fellowship Arthroscopy", 14, 1100, ["Sports injuries", "ACL reconstruction"]],
  ["Dr. Nazia Shaikh", "Female", "DEP-ORT", "Consultant", "MBBS, DNB (Ortho), Fellowship Spine", 9, 1000, ["Spine surgery"]],
  ["Dr. Priya Varghese", "Female", "DEP-PED", "HOD", "MBBS, MD (Paediatrics), Fellowship Neonatology", 19, 900, ["Neonatology", "Developmental paediatrics"]],
  ["Dr. Harish Bhat", "Male", "DEP-PED", "Consultant", "MBBS, DCH, DNB (Paediatrics)", 11, 800, ["Paediatric asthma", "Immunisation"]],
  ["Dr. Deepika Shetty", "Female", "DEP-PED", "Associate Consultant", "MBBS, MD (Paediatrics)", 4, 700, ["Adolescent health"]],
  ["Dr. Lakshmi Srinivasan", "Female", "DEP-OBG", "HOD", "MBBS, MD (OBG), FRCOG", 25, 1200, ["High-risk pregnancy", "Fetal medicine"]],
  ["Dr. Shruti Deshpande", "Female", "DEP-OBG", "Senior Consultant", "MBBS, MS (OBG), Fellowship Reproductive Medicine", 15, 1100, ["Infertility", "IVF"]],
  ["Dr. Fathima Ansari", "Female", "DEP-OBG", "Consultant", "MBBS, DGO, DNB (OBG)", 8, 900, ["Laparoscopic gynaecology"]],
  ["Dr. Vikram Chauhan", "Male", "DEP-GS", "HOD", "MBBS, MS (General Surgery), FMAS, FALS", 22, 1100, ["Bariatric surgery", "Hernia"]],
  ["Dr. Sameer Joshi", "Male", "DEP-GS", "Consultant", "MBBS, MS, DNB (Surgical Gastroenterology)", 10, 1000, ["HPB surgery", "Laparoscopy"]],
  ["Dr. Aishwarya Pillai", "Female", "DEP-GS", "Consultant", "MBBS, MS (General Surgery), Fellowship Breast Surgery", 8, 1000, ["Breast surgery"]],
  ["Dr. Venkatesh Murthy", "Male", "DEP-NEP", "HOD", "MBBS, MD, DM (Nephrology)", 20, 1300, ["Renal transplant", "Glomerular disease"]],
  ["Dr. Sneha Kamath", "Female", "DEP-NEP", "Consultant", "MBBS, MD, DNB (Nephrology)", 7, 1100, ["Dialysis", "CKD"]],
  ["Dr. Anil Banerjee", "Male", "DEP-GAS", "HOD", "MBBS, MD, DM (Gastroenterology)", 22, 1400, ["ERCP", "Pancreatic disease"]],
  ["Dr. Rashmi Agarwal", "Female", "DEP-GAS", "Consultant", "MBBS, MD, DM (Hepatology)", 9, 1200, ["Liver disease", "Fatty liver"]],
  ["Dr. Srinivas Naidu", "Male", "DEP-PUL", "HOD", "MBBS, MD (Pulmonary Medicine), FCCP", 19, 1100, ["Interventional pulmonology", "ILD"]],
  ["Dr. Kavya Mathew", "Female", "DEP-PUL", "Consultant", "MBBS, DTCD, DNB (Respiratory Medicine)", 8, 900, ["Asthma", "Sleep medicine"]],
  ["Dr. Rajesh Malhotra", "Male", "DEP-ONC", "HOD", "MBBS, MD, DM (Medical Oncology)", 20, 1500, ["Breast cancer", "Lung cancer"]],
  ["Dr. Bhavana Sen", "Female", "DEP-ONC", "Consultant", "MBBS, MS, MCh (Surgical Oncology)", 11, 1300, ["Head and neck cancer", "GI oncology"]],
  ["Dr. Girish Prasad", "Male", "DEP-ENT", "Senior Consultant", "MBBS, MS (ENT), DNB", 17, 900, ["Endoscopic sinus surgery", "Cochlear implants"]],
  ["Dr. Tejaswini Rajan", "Female", "DEP-DER", "Consultant", "MBBS, MD (Dermatology, Venereology & Leprosy)", 9, 900, ["Psoriasis", "Vitiligo"]],
  ["Dr. Mohan Das", "Male", "DEP-URO", "Senior Consultant", "MBBS, MS, MCh (Urology)", 18, 1200, ["Laser stone surgery", "Prostate"]],
  ["Dr. Aparna Joshi", "Female", "DEP-END", "Consultant", "MBBS, MD, DM (Endocrinology)", 10, 1200, ["Type 1 diabetes", "Thyroid"]],
  ["Dr. Gurpreet Sandhu", "Male", "DEP-EM", "HOD", "MBBS, MD (Emergency Medicine), FACEM", 16, 1000, ["Trauma", "Toxicology"]],
  ["Dr. Swathi Reddy", "Female", "DEP-EM", "Consultant", "MBBS, DNB (Emergency Medicine)", 7, 900, ["Resuscitation", "Point-of-care ultrasound"]],
  ["Dr. Naveen Kumar", "Male", "DEP-EM", "Registrar", "MBBS, MEM", 3, 800, ["Emergency care"]],
  ["Dr. Sunitha Ghosh", "Female", "DEP-CCM", "HOD", "MBBS, MD (Anaesthesia), IDCCM, EDIC", 18, 1400, ["Sepsis", "ECMO"]],
  ["Dr. Arvind Saxena", "Male", "DEP-CCM", "Consultant", "MBBS, DNB (Critical Care)", 9, 1200, ["Neuro critical care"]],
  ["Dr. Padma Iyer", "Female", "DEP-ANA", "HOD", "MBBS, MD (Anaesthesiology)", 22, 900, ["Cardiac anaesthesia"]],
  ["Dr. Sanjay Mishra", "Male", "DEP-ANA", "Consultant", "MBBS, DA, DNB (Anaesthesiology)", 12, 900, ["Regional anaesthesia", "Pain"]],
  ["Dr. Hema Kurian", "Female", "DEP-RAD", "HOD", "MBBS, MD (Radiodiagnosis)", 20, 1000, ["Neuroradiology", "Body imaging"]],
  ["Dr. Vinay Mehta", "Male", "DEP-RAD", "Consultant", "MBBS, DNB (Radiodiagnosis)", 8, 900, ["Musculoskeletal imaging", "Chest imaging"]],
];

const DAYS: Weekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function buildSessions(rng: Rng, deptId: string): OpdSession[] {
  if (["DEP-EM", "DEP-CCM", "DEP-ANA", "DEP-RAD"].includes(deptId)) return [];
  const room = `${deptId.replace("DEP-", "")}-${rng.int(1, 6)}`;
  const morning = rng.chance(0.75);
  const days = rng.sample(DAYS, rng.int(4, 6)).sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b));
  return days.map((d) =>
    morning
      ? { day: d, start: "09:00", end: d === "Sat" ? "12:00" : "13:00", room }
      : { day: d, start: "14:00", end: d === "Sat" ? "16:00" : "18:00", room },
  );
}

export function buildDoctors(): Doctor[] {
  const rng = new Rng("doctors");
  const statuses: [DoctorStatus, number][] = [
    ["In OPD", 30], ["Available", 25], ["On rounds", 15], ["In surgery", 12], ["Off duty", 12], ["On leave", 6],
  ];
  return doctorRows.map(([name, gender, departmentId, designation, qualifications, experienceYears, fee, interests], i) => {
    const slug = name.replace("Dr. ", "").toLowerCase().replace(/[^a-z ]/g, "").split(" ");
    const sessions = buildSessions(rng, departmentId);
    return {
      id: `DOC-${String(i + 1).padStart(3, "0")}`,
      name,
      gender,
      departmentId,
      designation,
      qualifications,
      registrationNo: `KMC ${rng.int(28000, 98000)}`,
      experienceYears,
      languages: rng.sample(["English", "Kannada", "Hindi", "Tamil", "Telugu", "Malayalam"], rng.int(2, 4)),
      consultationFee: fee,
      followUpFee: Math.round(fee * 0.5),
      sessions,
      slotMinutes: departmentId === "DEP-GM" || departmentId === "DEP-PED" ? 10 : 15,
      status: sessions.length === 0 ? rng.pick(["Available", "On rounds", "In surgery"] as DoctorStatus[]) : rng.weighted(statuses),
      phone: indianMobile(rng),
      email: `${slug[0]}.${slug[slug.length - 1]}@medicore.in`,
      rating: rng.float(4.1, 4.9, 1),
      bio: `${designation} in ${DEPARTMENTS.find((d) => d.id === departmentId)?.name} with ${experienceYears} years of clinical experience. Special interest in ${interests.join(" and ").toLowerCase()}.`,
      specialInterests: interests,
      joinedAt: `${2026 - rng.int(1, 11)}-${String(rng.int(1, 12)).padStart(2, "0")}-01`,
    };
  });
}

/** Ward layout: bed counts sum to 152. */
export const WARD_LAYOUT: { ward: Omit<Ward, "nurseInChargeId">; beds: number; prefix: string }[] = [
  { ward: { id: "WRD-MICU", name: "Medical ICU", type: "ICU", floor: "4th floor", wing: "Block A", departmentId: "DEP-CCM", dailyRate: 18500 }, beds: 12, prefix: "MICU" },
  { ward: { id: "WRD-SICU", name: "Surgical ICU", type: "ICU", floor: "4th floor", wing: "Block C", departmentId: "DEP-CCM", dailyRate: 18500 }, beds: 8, prefix: "SICU" },
  { ward: { id: "WRD-CCU", name: "Cardiac Care Unit", type: "ICU", floor: "2nd floor", wing: "Block B", departmentId: "DEP-CAR", dailyRate: 19500 }, beds: 8, prefix: "CCU" },
  { ward: { id: "WRD-HDU", name: "High Dependency Unit", type: "HDU", floor: "4th floor", wing: "Block A", departmentId: "DEP-CCM", dailyRate: 11000 }, beds: 8, prefix: "HDU" },
  { ward: { id: "WRD-NICU", name: "Neonatal ICU", type: "NICU", floor: "1st floor", wing: "Block A", departmentId: "DEP-PED", dailyRate: 14000 }, beds: 10, prefix: "NICU" },
  { ward: { id: "WRD-GMM", name: "General Ward (Male)", type: "General", floor: "5th floor", wing: "Block A", departmentId: "DEP-GM", dailyRate: 2400 }, beds: 22, prefix: "GM" },
  { ward: { id: "WRD-GMF", name: "General Ward (Female)", type: "General", floor: "5th floor", wing: "Block B", departmentId: "DEP-GM", dailyRate: 2400 }, beds: 20, prefix: "GF" },
  { ward: { id: "WRD-SURG", name: "Surgical Ward", type: "Semi-private", floor: "5th floor", wing: "Block C", departmentId: "DEP-GS", dailyRate: 4200 }, beds: 16, prefix: "SW" },
  { ward: { id: "WRD-MAT", name: "Maternity Ward", type: "Semi-private", floor: "2nd floor", wing: "Block A", departmentId: "DEP-OBG", dailyRate: 4200 }, beds: 12, prefix: "MAT" },
  { ward: { id: "WRD-PED", name: "Paediatric Ward", type: "General", floor: "1st floor", wing: "Block A", departmentId: "DEP-PED", dailyRate: 2800 }, beds: 10, prefix: "PW" },
  { ward: { id: "WRD-PVT", name: "Private Rooms", type: "Private", floor: "6th floor", wing: "Block B", dailyRate: 6800 }, beds: 14, prefix: "PVT" },
  { ward: { id: "WRD-STE", name: "Executive Suites", type: "Suite", floor: "6th floor", wing: "Block C", dailyRate: 12500 }, beds: 4, prefix: "STE" },
  { ward: { id: "WRD-ER", name: "Emergency Department", type: "ER", floor: "Ground floor", wing: "Block B", departmentId: "DEP-EM", dailyRate: 3500 }, beds: 8, prefix: "ER" },
];

export const PAYERS: Payer[] = [
  { id: "PAY-STAR", name: "Star Health and Allied Insurance", kind: "Insurer", shortName: "Star Health", avgSettlementDays: 21 },
  { id: "PAY-HDFC", name: "HDFC ERGO General Insurance", kind: "Insurer", shortName: "HDFC ERGO", avgSettlementDays: 18 },
  { id: "PAY-ICICI", name: "ICICI Lombard General Insurance", kind: "Insurer", shortName: "ICICI Lombard", avgSettlementDays: 17 },
  { id: "PAY-NIVA", name: "Niva Bupa Health Insurance", kind: "Insurer", shortName: "Niva Bupa", avgSettlementDays: 19 },
  { id: "PAY-CARE", name: "Care Health Insurance", kind: "Insurer", shortName: "Care Health", avgSettlementDays: 22 },
  { id: "PAY-NIA", name: "The New India Assurance Co.", kind: "Insurer", shortName: "New India", avgSettlementDays: 34 },
  { id: "PAY-MEDI", name: "Medi Assist Insurance TPA", kind: "TPA", shortName: "Medi Assist", avgSettlementDays: 24 },
  { id: "PAY-PARA", name: "Paramount Health Services & Insurance TPA", kind: "TPA", shortName: "Paramount", avgSettlementDays: 27 },
  { id: "PAY-FHPL", name: "Family Health Plan Insurance TPA", kind: "TPA", shortName: "FHPL", avgSettlementDays: 25 },
  { id: "PAY-VIDAL", name: "Vidal Health Insurance TPA", kind: "TPA", shortName: "Vidal Health", avgSettlementDays: 26 },
  { id: "PAY-MDI", name: "MDIndia Health Insurance TPA", kind: "TPA", shortName: "MDIndia", avgSettlementDays: 29 },
  { id: "PAY-PMJAY", name: "Ayushman Bharat PM-JAY (SAST Karnataka)", kind: "Government", shortName: "PM-JAY", avgSettlementDays: 38 },
  { id: "PAY-CGHS", name: "Central Government Health Scheme", kind: "Government", shortName: "CGHS", avgSettlementDays: 45 },
  { id: "PAY-INFY", name: "Infosys Ltd. (Corporate tie-up)", kind: "Corporate", shortName: "Infosys", avgSettlementDays: 30 },
];

export const INSURERS = PAYERS.filter((p) => p.kind === "Insurer");
export const TPAS = PAYERS.filter((p) => p.kind === "TPA");

export function buildVendors(): Vendor[] {
  const rng = new Rng("vendors");
  const rows: [string, string, number][] = [
    ["Sri Venkateshwara Surgicals", "Bengaluru", 3],
    ["Medline Healthcare India", "Bengaluru", 5],
    ["Karnataka Pharma Distributors", "Bengaluru", 2],
    ["Hindustan Syringes & Medical Devices", "Faridabad", 7],
    ["Romsons Scientific & Surgical", "Agra", 8],
    ["Transasia Bio-Medicals", "Mumbai", 6],
    ["Poly Medicure Ltd.", "Faridabad", 7],
    ["Sutures India Pvt. Ltd.", "Bengaluru", 4],
    ["Meril Life Sciences", "Vapi", 9],
    ["Cleanworld Housekeeping Supplies", "Bengaluru", 2],
  ];
  return rows.map(([name, city, lead], i) => ({
    id: `VEN-${String(i + 1).padStart(3, "0")}`,
    name,
    gstin: gstin(rng, city === "Bengaluru" ? "29" : city === "Mumbai" ? "27" : city === "Vapi" ? "24" : "06"),
    city,
    contactName: rng.pick(["Manjunath S", "Ravi Kumar", "Deepa N", "Sanjay Gupta", "Anand Rao", "Ritu Sharma"]),
    phone: indianMobile(rng),
    leadTimeDays: lead,
    rating: rng.float(3.6, 4.8, 1),
  }));
}

export const PACKAGES: CarePackage[] = [
  { id: "PKG-001", code: "OBG-NVD", name: "Normal delivery", departmentId: "DEP-OBG", price: 42000, lengthOfStayDays: 2, wardType: "Semi-private", inclusions: ["Room rent (2 days)", "Labour room charges", "Obstetrician and paediatrician fees", "Routine medicines and consumables", "Newborn screening"], exclusions: ["NICU stay", "Blood products", "Epidural analgesia"], active: true },
  { id: "PKG-002", code: "OBG-LSCS", name: "Caesarean section (LSCS)", departmentId: "DEP-OBG", price: 78000, lengthOfStayDays: 4, wardType: "Semi-private", inclusions: ["Room rent (4 days)", "OT and anaesthesia charges", "Surgeon and anaesthetist fees", "Routine medicines and consumables"], exclusions: ["NICU stay", "Blood products", "Additional stay"], active: true },
  { id: "PKG-003", code: "GS-LAPCHOLE", name: "Laparoscopic cholecystectomy", departmentId: "DEP-GS", price: 85000, lengthOfStayDays: 2, wardType: "Semi-private", inclusions: ["Room rent (2 days)", "OT charges", "Surgeon and anaesthetist fees", "Histopathology", "Routine medicines"], exclusions: ["ERCP", "Conversion to open surgery", "ICU stay"], active: true },
  { id: "PKG-004", code: "GS-LAPHERNIA", name: "Laparoscopic inguinal hernia repair (unilateral)", departmentId: "DEP-GS", price: 78000, lengthOfStayDays: 2, wardType: "Semi-private", inclusions: ["Room rent (2 days)", "OT charges", "Standard mesh", "Surgeon and anaesthetist fees"], exclusions: ["Composite mesh upgrade", "ICU stay"], active: true },
  { id: "PKG-005", code: "ORT-TKR", name: "Total knee replacement (unilateral)", departmentId: "DEP-ORT", price: 245000, lengthOfStayDays: 5, wardType: "Private", inclusions: ["Room rent (5 days)", "Standard implant (NPPA capped)", "OT and anaesthesia", "Physiotherapy in-stay", "Routine medicines"], exclusions: ["Premium implant upgrade", "Blood products", "ICU stay"], active: true },
  { id: "PKG-006", code: "CAR-PTCA1", name: "PTCA with single drug-eluting stent", departmentId: "DEP-CAR", price: 185000, lengthOfStayDays: 3, wardType: "Semi-private", inclusions: ["Cath lab charges", "One DES (NPPA capped)", "CCU stay (1 day)", "Ward stay (2 days)", "Cardiologist fees"], exclusions: ["Additional stents", "IVUS / OCT", "IABP"], active: true },
  { id: "PKG-007", code: "CAR-CAG", name: "Coronary angiography", departmentId: "DEP-CAR", price: 16500, lengthOfStayDays: 1, wardType: "Day care", inclusions: ["Cath lab charges", "Contrast", "Cardiologist fees", "Day-care bed"], exclusions: ["Angioplasty", "Overnight stay"], active: true },
  { id: "PKG-008", code: "URO-URSL", name: "URSL with DJ stenting", departmentId: "DEP-URO", price: 72000, lengthOfStayDays: 1, wardType: "Semi-private", inclusions: ["Laser lithotripsy", "DJ stent", "OT and anaesthesia", "Surgeon fees"], exclusions: ["Stent removal procedure", "Additional stay"], active: true },
  { id: "PKG-009", code: "ENT-FESS", name: "Functional endoscopic sinus surgery", departmentId: "DEP-ENT", price: 68000, lengthOfStayDays: 1, wardType: "Semi-private", inclusions: ["OT and anaesthesia", "Surgeon fees", "Nasal packs", "Routine medicines"], exclusions: ["Navigation system", "Balloon sinuplasty"], active: true },
  { id: "PKG-010", code: "NEP-HD", name: "Haemodialysis session", departmentId: "DEP-NEP", price: 2800, lengthOfStayDays: 0, wardType: "Day care", inclusions: ["Dialysis session", "Dialyser and tubing", "Nursing"], exclusions: ["EPO injection", "IV iron"], active: true },
  { id: "PKG-011", code: "GM-EHC", name: "Executive health check", departmentId: "DEP-GM", price: 5999, lengthOfStayDays: 0, wardType: "Day care", inclusions: ["CBC, RFT, LFT, lipid profile, HbA1c, TFT", "ECG and 2D echo", "Chest X-ray, USG abdomen", "Physician, dietician and dental consult"], exclusions: ["TMT", "CT coronary calcium score"], active: true },
  { id: "PKG-012", code: "OPH-CAT", name: "Cataract surgery (phaco + foldable IOL)", departmentId: "DEP-GS", price: 38000, lengthOfStayDays: 0, wardType: "Day care", inclusions: ["Phacoemulsification", "Foldable monofocal IOL", "Day-care stay"], exclusions: ["Premium multifocal IOL"], active: false },
];

export const OPERATION_THEATRES: OperationTheatre[] = [
  { id: "OT-1", name: "OT 1", kind: "Major", floor: "1st floor, Block C" },
  { id: "OT-2", name: "OT 2", kind: "Major", floor: "1st floor, Block C" },
  { id: "OT-3", name: "OT 3", kind: "Ortho (laminar)", floor: "1st floor, Block C" },
  { id: "OT-4", name: "OT 4", kind: "Cardiac", floor: "2nd floor, Block B" },
  { id: "OT-5", name: "OT 5", kind: "Obstetric", floor: "2nd floor, Block A" },
  { id: "OT-6", name: "Minor OT", kind: "Minor", floor: "Ground floor, Block B" },
];
