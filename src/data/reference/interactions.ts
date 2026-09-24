import type { DrugAlertSeverity } from "@/types";

/**
 * Rule tables behind the (mock) AI prescription checker. Matching is done on
 * lower-cased generic-name substrings so combination products are caught too.
 */
export interface InteractionRule {
  a: string;
  b: string;
  severity: DrugAlertSeverity;
  title: string;
  detail: string;
  recommendation: string;
}

export const INTERACTIONS: InteractionRule[] = [
  { a: "warfarin", b: "aspirin", severity: "Major", title: "Additive bleeding risk", detail: "Aspirin inhibits platelet function and can raise INR-independent bleeding risk with warfarin.", recommendation: "Avoid unless there is a clear indication (e.g. recent stent). If co-prescribed, add PPI and monitor INR weekly." },
  { a: "warfarin", b: "clopidogrel", severity: "Major", title: "Additive bleeding risk", detail: "Dual antithrombotic therapy substantially raises major bleeding events.", recommendation: "Confirm indication and planned duration; consider PPI cover and closer INR monitoring." },
  { a: "warfarin", b: "metronidazole", severity: "Major", title: "INR elevation", detail: "Metronidazole inhibits CYP2C9 and can double warfarin effect within days.", recommendation: "Consider an alternative anti-anaerobic agent or reduce warfarin dose by 25-35% and check INR in 3 days." },
  { a: "warfarin", b: "ciprofloxacin", severity: "Moderate", title: "INR elevation", detail: "Fluoroquinolones can potentiate warfarin anticoagulation.", recommendation: "Check INR within 3-5 days of starting." },
  { a: "warfarin", b: "levofloxacin", severity: "Moderate", title: "INR elevation", detail: "Fluoroquinolones can potentiate warfarin anticoagulation.", recommendation: "Check INR within 3-5 days of starting." },
  { a: "warfarin", b: "diclofenac", severity: "Major", title: "GI bleeding risk", detail: "NSAIDs add GI mucosal injury and platelet inhibition to anticoagulation.", recommendation: "Prefer paracetamol for analgesia." },
  { a: "warfarin", b: "ibuprofen", severity: "Major", title: "GI bleeding risk", detail: "NSAIDs add GI mucosal injury and platelet inhibition to anticoagulation.", recommendation: "Prefer paracetamol for analgesia." },
  { a: "rivaroxaban", b: "aspirin", severity: "Moderate", title: "Additive bleeding risk", detail: "Combined anticoagulant and antiplatelet therapy increases bleeding.", recommendation: "Review need for dual therapy; add PPI." },
  { a: "apixaban", b: "clopidogrel", severity: "Moderate", title: "Additive bleeding risk", detail: "Combined anticoagulant and antiplatelet therapy increases bleeding.", recommendation: "Define duration of combination therapy." },
  { a: "enoxaparin", b: "ketorolac", severity: "Major", title: "Bleeding risk", detail: "LMWH with NSAIDs raises risk of haematoma and GI bleeding.", recommendation: "Avoid combination." },
  { a: "clopidogrel", b: "omeprazole", severity: "Moderate", title: "Reduced antiplatelet effect", detail: "Omeprazole inhibits CYP2C19 activation of clopidogrel.", recommendation: "Switch to pantoprazole if a PPI is needed." },
  { a: "telmisartan", b: "spironolactone", severity: "Moderate", title: "Hyperkalaemia", detail: "ARB with potassium-sparing diuretic raises serum potassium, especially with reduced eGFR.", recommendation: "Check potassium and creatinine within 1 week." },
  { a: "losartan", b: "spironolactone", severity: "Moderate", title: "Hyperkalaemia", detail: "ARB with potassium-sparing diuretic raises serum potassium.", recommendation: "Check potassium and creatinine within 1 week." },
  { a: "ramipril", b: "spironolactone", severity: "Moderate", title: "Hyperkalaemia", detail: "ACE inhibitor with potassium-sparing diuretic raises serum potassium.", recommendation: "Monitor potassium." },
  { a: "enalapril", b: "potassium chloride", severity: "Major", title: "Hyperkalaemia", detail: "ACE inhibitors reduce potassium excretion; supplementation can cause dangerous hyperkalaemia.", recommendation: "Avoid routine potassium supplements unless hypokalaemia is documented." },
  { a: "telmisartan", b: "ramipril", severity: "Major", title: "Dual RAAS blockade", detail: "ARB with ACE inhibitor increases AKI, hyperkalaemia and hypotension without outcome benefit.", recommendation: "Use one RAAS agent only." },
  { a: "sacubitril", b: "ramipril", severity: "Contraindicated", title: "Angioedema risk", detail: "Neprilysin inhibitor with ACE inhibitor markedly increases angioedema risk.", recommendation: "Stop ACE inhibitor 36 hours before starting sacubitril/valsartan." },
  { a: "sacubitril", b: "enalapril", severity: "Contraindicated", title: "Angioedema risk", detail: "Neprilysin inhibitor with ACE inhibitor markedly increases angioedema risk.", recommendation: "Stop ACE inhibitor 36 hours before starting sacubitril/valsartan." },
  { a: "amiodarone", b: "digoxin", severity: "Major", title: "Digoxin toxicity", detail: "Amiodarone raises digoxin levels by up to 70%.", recommendation: "Halve digoxin dose and check levels." },
  { a: "amiodarone", b: "warfarin", severity: "Major", title: "INR elevation", detail: "Amiodarone inhibits warfarin metabolism for months.", recommendation: "Reduce warfarin dose by 30-50% and monitor INR weekly." },
  { a: "metoprolol", b: "carvedilol", severity: "Major", title: "Duplicate beta blockade", detail: "Two beta blockers prescribed together.", recommendation: "Choose one beta blocker." },
  { a: "sildenafil", b: "isosorbide", severity: "Contraindicated", title: "Severe hypotension", detail: "PDE-5 inhibitors with nitrates can cause profound hypotension.", recommendation: "Do not co-prescribe. Separate by at least 24 hours." },
  { a: "atorvastatin", b: "clarithromycin", severity: "Major", title: "Myopathy risk", detail: "CYP3A4 inhibition raises statin levels.", recommendation: "Hold statin during the course." },
  { a: "ciprofloxacin", b: "theophylline", severity: "Major", title: "Theophylline toxicity", detail: "Ciprofloxacin inhibits theophylline clearance; seizures and arrhythmias reported.", recommendation: "Prefer an alternative antibiotic or reduce theophylline dose and monitor." },
  { a: "levofloxacin", b: "amiodarone", severity: "Major", title: "QT prolongation", detail: "Both agents prolong QT interval.", recommendation: "Obtain baseline ECG; consider alternative antibiotic." },
  { a: "azithromycin", b: "amiodarone", severity: "Major", title: "QT prolongation", detail: "Both agents prolong QT interval.", recommendation: "Obtain baseline ECG; consider alternative antibiotic." },
  { a: "ondansetron", b: "amiodarone", severity: "Moderate", title: "QT prolongation", detail: "Additive QT prolongation.", recommendation: "Monitor ECG if both are required." },
  { a: "escitalopram", b: "tramadol", severity: "Major", title: "Serotonin syndrome and seizures", detail: "Tramadol with SSRIs increases serotonergic toxicity and lowers seizure threshold.", recommendation: "Prefer a non-serotonergic analgesic." },
  { a: "linezolid", b: "escitalopram", severity: "Major", title: "Serotonin syndrome", detail: "Linezolid is a weak MAO inhibitor.", recommendation: "Avoid combination or monitor closely for serotonergic symptoms." },
  { a: "metformin", b: "contrast", severity: "Moderate", title: "Lactic acidosis with contrast", detail: "Iodinated contrast can precipitate AKI in patients on metformin.", recommendation: "Hold metformin 48 hours after contrast if eGFR < 45." },
  { a: "glimepiride", b: "ciprofloxacin", severity: "Moderate", title: "Dysglycaemia", detail: "Fluoroquinolones can cause hypo- or hyperglycaemia with sulfonylureas.", recommendation: "Advise glucose monitoring." },
  { a: "insulin", b: "metoprolol", severity: "Minor", title: "Masked hypoglycaemia", detail: "Beta blockers may blunt adrenergic warning signs of hypoglycaemia.", recommendation: "Counsel patient on neuroglycopenic symptoms." },
  { a: "methotrexate", b: "ibuprofen", severity: "Major", title: "Methotrexate toxicity", detail: "NSAIDs reduce renal clearance of methotrexate.", recommendation: "Avoid NSAIDs around methotrexate dosing." },
  { a: "methotrexate", b: "diclofenac", severity: "Major", title: "Methotrexate toxicity", detail: "NSAIDs reduce renal clearance of methotrexate.", recommendation: "Avoid NSAIDs around methotrexate dosing." },
  { a: "allopurinol", b: "azathioprine", severity: "Contraindicated", title: "Bone marrow suppression", detail: "Allopurinol blocks azathioprine metabolism.", recommendation: "Avoid, or reduce azathioprine to 25% with haematology input." },
  { a: "phenytoin", b: "valproate", severity: "Moderate", title: "Altered antiepileptic levels", detail: "Valproate displaces phenytoin from protein binding.", recommendation: "Monitor free phenytoin levels." },
  { a: "levothyroxine", b: "calcium carbonate", severity: "Minor", title: "Reduced absorption", detail: "Calcium reduces levothyroxine absorption.", recommendation: "Separate doses by 4 hours." },
  { a: "levothyroxine", b: "ferrous", severity: "Minor", title: "Reduced absorption", detail: "Iron reduces levothyroxine absorption.", recommendation: "Separate doses by 4 hours." },
  { a: "midazolam", b: "morphine", severity: "Major", title: "Respiratory depression", detail: "Benzodiazepines with opioids cause additive CNS and respiratory depression.", recommendation: "Use lowest effective doses with continuous SpO2 monitoring." },
  { a: "lorazepam", b: "tramadol", severity: "Major", title: "Respiratory depression", detail: "Benzodiazepines with opioids cause additive CNS depression.", recommendation: "Avoid if possible; monitor sedation scores." },
  { a: "heparin", b: "enoxaparin", severity: "Major", title: "Duplicate anticoagulation", detail: "Two parenteral anticoagulants prescribed together.", recommendation: "Choose one agent." },
];

/** Allergy substance to the generic-name fragments it should flag (cross-reactivity included). */
export const ALLERGY_CLASSES: Record<string, { match: string[]; crossNote?: string }> = {
  Penicillin: { match: ["amoxicillin", "piperacillin", "ampicillin", "cloxacillin"], crossNote: "Cephalosporin cross-reactivity is about 1-2%; carbapenems under 1%." },
  Cephalosporins: { match: ["cefixime", "ceftriaxone", "cefoperazone", "cefuroxime"] },
  Sulfonamides: { match: ["sulfamethoxazole", "hydrochlorothiazide", "furosemide"], crossNote: "Non-antibiotic sulfonamide cross-reactivity is uncommon but reported." },
  NSAIDs: { match: ["ibuprofen", "diclofenac", "aceclofenac", "aspirin", "ketorolac"] },
  Aspirin: { match: ["aspirin", "ibuprofen", "diclofenac", "aceclofenac"], crossNote: "Aspirin-exacerbated respiratory disease often cross-reacts with other COX-1 NSAIDs." },
  Fluoroquinolones: { match: ["ciprofloxacin", "levofloxacin", "moxifloxacin"] },
  Macrolides: { match: ["azithromycin", "clarithromycin", "erythromycin"] },
  "Iodinated contrast": { match: ["contrast"] },
  Morphine: { match: ["morphine", "tramadol", "fentanyl"], crossNote: "Opioid pseudo-allergy (histamine release) is common; true cross-reactivity is lower with synthetic opioids." },
  Metronidazole: { match: ["metronidazole"] },
  Phenytoin: { match: ["phenytoin"] },
  Vancomycin: { match: ["vancomycin"] },
  Chlorhexidine: { match: ["chlorhexidine"] },
};

/** Drug-condition contraindications keyed on ICD-10 prefix. */
export const CONDITION_RULES: { icdPrefix: string; match: string[]; severity: DrugAlertSeverity; title: string; recommendation: string }[] = [
  { icdPrefix: "N18.4", match: ["metformin"], severity: "Contraindicated", title: "Metformin with eGFR < 30", recommendation: "Stop metformin; consider DPP-4 inhibitor with renal dosing." },
  { icdPrefix: "N18.6", match: ["metformin", "nitrofurantoin"], severity: "Contraindicated", title: "Renally cleared drug in end-stage renal disease", recommendation: "Choose an alternative agent." },
  { icdPrefix: "N18", match: ["ibuprofen", "diclofenac", "aceclofenac"], severity: "Major", title: "NSAID in chronic kidney disease", recommendation: "Avoid NSAIDs; use paracetamol." },
  { icdPrefix: "J45", match: ["metoprolol", "carvedilol", "propranolol"], severity: "Major", title: "Beta blocker in asthma", recommendation: "Use a cardioselective agent at low dose only if essential (e.g. bisoprolol)." },
  { icdPrefix: "I50", match: ["ibuprofen", "diclofenac"], severity: "Major", title: "NSAID in heart failure", recommendation: "NSAIDs cause fluid retention; avoid." },
  { icdPrefix: "K25", match: ["ibuprofen", "diclofenac", "aspirin"], severity: "Major", title: "NSAID with peptic ulcer", recommendation: "Avoid or co-prescribe PPI." },
  { icdPrefix: "K74", match: ["paracetamol"], severity: "Moderate", title: "Paracetamol in cirrhosis", recommendation: "Limit to 2 g per day." },
  { icdPrefix: "Z34", match: ["warfarin", "atorvastatin", "rosuvastatin", "methotrexate", "telmisartan", "losartan", "enalapril", "ramipril"], severity: "Contraindicated", title: "Teratogenic drug in pregnancy", recommendation: "Choose a pregnancy-safe alternative." },
  { icdPrefix: "O", match: ["warfarin", "telmisartan", "losartan", "enalapril", "ramipril"], severity: "Contraindicated", title: "Teratogenic drug in pregnancy", recommendation: "Choose a pregnancy-safe alternative (e.g. labetalol, nifedipine, LMWH)." },
  { icdPrefix: "G40", match: ["tramadol"], severity: "Major", title: "Tramadol lowers seizure threshold", recommendation: "Prefer a non-tramadol analgesic in epilepsy." },
];
