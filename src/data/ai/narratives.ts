/**
 * Hand-written clinical reasoning used by the mock AI, keyed by clinical
 * profile. Numbers are never hard-coded here: the AI service fills facts from
 * the patient's actual record so the output always matches the chart.
 */
export interface ProfileNarrative {
  course: string;
  watchOuts: string[];
  careGaps: string[];
}

export const NARRATIVES: Record<string, ProfileNarrative> = {
  sepsis: {
    course: "Presented with urosepsis progressing to septic shock. Source identified as right pyelonephritis on imaging with an ESBL-producing E. coli in blood culture, so empirical therapy was escalated to a carbapenem. Vasopressor requirement has been weaning.",
    watchOuts: ["Lactate clearance and urine output as markers of perfusion", "Carbapenem course of 7-10 days; plan de-escalation once sensitivities are reviewed", "Glycaemic control on insulin infusion; hypoglycaemia risk as oral intake resumes"],
    careGaps: ["No documented repeat blood culture after 48 hours of therapy", "Diabetic foot and urinary tract screening advisable before discharge"],
  },
  stemi: {
    course: "Anterior wall STEMI treated with primary PCI to the LAD with TIMI III flow. Post-procedure course uncomplicated; echocardiography shows reduced ejection fraction with anterior hypokinesia.",
    watchOuts: ["Arrhythmia surveillance for 48-72 hours after reperfusion", "Dual antiplatelet adherence for 12 months", "Heart failure symptoms given reduced ejection fraction"],
    careGaps: ["Cardiac rehabilitation referral not yet documented", "Smoking and lipid targets (LDL below 55 mg/dL) to be addressed at discharge"],
  },
  dengue: {
    course: "Dengue fever (NS1 positive) in the critical phase with falling platelet count and rising haematocrit, consistent with plasma leakage. No bleeding manifestations documented so far.",
    watchOuts: ["Warning signs: abdominal pain, persistent vomiting, mucosal bleed, lethargy", "Haematocrit rise above 20% from baseline suggests significant leak", "Avoid NSAIDs and intramuscular injections"],
    careGaps: ["12-hourly CBC with haematocrit recommended while platelets are below 50,000/µL", "Strict intake-output charting should be confirmed on the nursing chart"],
  },
  "t2dm-htn": {
    course: "Long-standing type 2 diabetes with hypertension and dyslipidaemia, managed in the outpatient setting on oral agents.",
    watchOuts: ["Glycaemic control is above target", "Peripheral neuropathy symptoms reported, so foot care education matters"],
    careGaps: ["Annual retinal examination not found in the record", "Urine albumin-creatinine ratio not measured in the last 12 months", "Consider SGLT2 inhibitor for cardio-renal protection if eGFR allows"],
  },
  hf: {
    course: "Chronic systolic heart failure with atrial fibrillation on anticoagulation and guideline-directed therapy, with recurrent congestion episodes.",
    watchOuts: ["Daily weights and fluid restriction adherence", "INR stability on warfarin; drug interactions are a frequent cause of excursions", "Potassium and creatinine with ARNI plus spironolactone"],
    careGaps: ["No SGLT2 inhibitor on the current regimen", "Last echocardiogram older than 12 months"],
  },
  stroke: {
    course: "Acute left MCA territory ischaemic stroke with right hemiparesis and expressive aphasia. Paroxysmal atrial fibrillation identified as the likely embolic source.",
    watchOuts: ["Aspiration risk: nil by mouth until swallow assessment is passed", "Haemorrhagic transformation risk when starting anticoagulation", "DVT prophylaxis and pressure area care"],
    careGaps: ["Speech and swallow therapy review pending", "Anticoagulation start date should be documented in the plan"],
  },
  pregnancy: {
    course: "Singleton pregnancy in the third trimester under routine antenatal care. Mild anaemia is being treated with oral iron.",
    watchOuts: ["Blood pressure and proteinuria at each visit to screen for pre-eclampsia", "Fetal movement counting advice"],
    careGaps: ["Glucose challenge test result not found for this pregnancy", "Tdap booster status not documented"],
  },
  ckd: {
    course: "Stage 4 chronic kidney disease from diabetic and hypertensive nephropathy, admitted with fluid overload and hyperkalaemia requiring urgent haemodialysis via a temporary catheter.",
    watchOuts: ["Potassium above 6.0 mmol/L with ECG changes needs immediate treatment", "Avoid nephrotoxins and renally cleared drugs", "Catheter-related infection risk"],
    careGaps: ["Permanent vascular access (AV fistula) not yet created", "Hepatitis B vaccination status unknown before starting dialysis"],
  },
  pneumonia: {
    course: "Community-acquired pneumonia involving the right lower lobe with hypoxia, on IV ceftriaxone and azithromycin. Oxygen requirement has increased over the last day.",
    watchOuts: ["Rising respiratory rate and oxygen need suggest treatment failure or complications (effusion, empyema)", "CURB-65 should be recalculated", "Aspiration risk in the elderly"],
    careGaps: ["Sputum culture result not yet available", "Pneumococcal and influenza vaccination at discharge"],
  },
  "oa-knee": {
    course: "Bilateral knee osteoarthritis, right worse than left, with failed conservative management. Scheduled for right total knee replacement.",
    watchOuts: ["VTE prophylaxis after arthroplasty", "Post-operative pain and early mobilisation", "Vitamin D deficiency affects rehabilitation"],
    careGaps: ["Dental clearance before implant surgery not documented"],
  },
  cholelithiasis: {
    course: "Symptomatic cholelithiasis without cholecystitis on ultrasound. Planned for elective laparoscopic cholecystectomy.",
    watchOuts: ["Features of choledocholithiasis (jaundice, raised ALP) warrant MRCP before surgery"],
    careGaps: ["Pre-anaesthetic check-up to be completed"],
  },
  trauma: {
    course: "Young adult involved in a road traffic accident with mild head injury and a displaced right tibial shaft fracture. Medico-legal case registered.",
    watchOuts: ["Neurological observations for 24 hours after head injury", "Compartment syndrome of the leg: pain out of proportion, pain on passive stretch", "Tetanus prophylaxis status"],
    careGaps: ["MLC intimation to the police station should be documented"],
  },
  copd: {
    course: "COPD with an acute exacerbation and hypercapnic respiratory failure on arterial blood gas, a long-term smoker.",
    watchOuts: ["Target SpO₂ 88-92% to avoid worsening hypercapnia", "Non-invasive ventilation if pH falls below 7.35 with rising pCO₂"],
    careGaps: ["Spirometry and inhaler technique review", "Smoking cessation counselling"],
  },
  asthma: {
    course: "Bronchial asthma with allergic rhinitis, presenting with an acute exacerbation not relieved by reliever inhaler.",
    watchOuts: ["Silent chest, exhaustion or rising pCO₂ indicate life-threatening asthma"],
    careGaps: ["Written asthma action plan not documented"],
  },
  "ca-breast": {
    course: "Carcinoma of the left breast on adjuvant chemotherapy, now with fever and neutropenia after the latest cycle.",
    watchOuts: ["Febrile neutropenia needs antibiotics within 60 minutes", "G-CSF support and infection control"],
    careGaps: ["Echocardiogram before further anthracycline doses"],
  },
  cirrhosis: {
    course: "Alcohol-related cirrhosis with decompensation (ascites, variceal bleed risk).",
    watchOuts: ["Hepatic encephalopathy, spontaneous bacterial peritonitis, hepatorenal syndrome"],
    careGaps: ["Variceal screening endoscopy", "Alcohol de-addiction support"],
  },
  neonate: {
    course: "Preterm neonate with hyperbilirubinaemia on phototherapy.",
    watchOuts: ["Serum bilirubin against gestation-specific exchange thresholds", "Feeding tolerance and weight"],
    careGaps: ["Hearing screen and ROP screening schedule"],
  },
};

export const DEFAULT_NARRATIVE: ProfileNarrative = {
  course: "Managed in the outpatient setting with no recent hospital admissions.",
  watchOuts: ["Review medication adherence and side effects at each visit"],
  careGaps: ["Age-appropriate preventive screening should be confirmed"],
};
