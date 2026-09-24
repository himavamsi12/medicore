import type { RadiologyFinding } from "@/types";

/** Precomputed Radiology AI output keyed by "profile|studyKind". Boxes are fractions of the image. */
export const RADIOLOGY_AI: Record<string, { findings: Omit<RadiologyFinding, "id">[]; impression: string }> = {
  "pneumonia|chest": {
    findings: [
      { label: "Consolidation", description: "Airspace opacity in right lower zone with air bronchograms", confidence: 0.91, severity: "critical", box: { x: 0.56, y: 0.52, w: 0.24, h: 0.2 } },
      { label: "Blunted costophrenic angle", description: "Possible small right pleural effusion", confidence: 0.58, severity: "warning", box: { x: 0.64, y: 0.74, w: 0.14, h: 0.08 } },
    ],
    impression: "Right lower lobe consolidation, likely infective. Possible small right effusion; consider lateral decubitus view or ultrasound.",
  },
  "hf|chest": {
    findings: [
      { label: "Cardiomegaly", description: "Cardiothoracic ratio estimated at 0.61", confidence: 0.94, severity: "warning", box: { x: 0.36, y: 0.44, w: 0.34, h: 0.3 } },
      { label: "Pulmonary venous congestion", description: "Upper lobe diversion and perihilar haze", confidence: 0.83, severity: "warning", box: { x: 0.28, y: 0.28, w: 0.46, h: 0.22 } },
      { label: "Pleural effusion", description: "Bilateral small effusions", confidence: 0.72, severity: "warning", box: { x: 0.2, y: 0.72, w: 0.62, h: 0.1 } },
    ],
    impression: "Cardiomegaly with pulmonary venous congestion and small bilateral effusions, in keeping with cardiac failure.",
  },
  "copd|chest": {
    findings: [{ label: "Hyperinflation", description: "Flattened hemidiaphragms, increased lung volumes", confidence: 0.88, severity: "neutral", box: { x: 0.18, y: 0.2, w: 0.64, h: 0.58 } }],
    impression: "Hyperinflated lungs consistent with COPD. No focal consolidation or pneumothorax detected.",
  },
  "stroke|brain": {
    findings: [
      { label: "Acute infarct", description: "Hypodensity in left MCA territory with loss of insular ribbon", confidence: 0.87, severity: "critical", box: { x: 0.54, y: 0.34, w: 0.22, h: 0.26 } },
      { label: "Hyperdense vessel", description: "Hyperdense left MCA sign", confidence: 0.64, severity: "warning", box: { x: 0.52, y: 0.52, w: 0.1, h: 0.06 } },
    ],
    impression: "Acute left MCA territory infarct. No intracranial haemorrhage detected by the model; radiologist confirmation required before thrombolysis decisions.",
  },
  "trauma|brain": {
    findings: [{ label: "Scalp haematoma", description: "Right parietal soft tissue swelling", confidence: 0.77, severity: "neutral", box: { x: 0.14, y: 0.24, w: 0.16, h: 0.14 } }],
    impression: "No intracranial haemorrhage, midline shift or skull fracture detected. Right parietal scalp haematoma.",
  },
  "trauma|knee": {
    findings: [{ label: "Fracture", description: "Displaced transverse fracture, mid-shaft tibia", confidence: 0.95, severity: "critical", box: { x: 0.4, y: 0.44, w: 0.2, h: 0.14 } }],
    impression: "Displaced mid-shaft tibial fracture. Fibula appears intact.",
  },
  "oa-knee|knee": {
    findings: [
      { label: "Joint space narrowing", description: "Medial compartment narrowing, right more than left", confidence: 0.9, severity: "warning", box: { x: 0.3, y: 0.46, w: 0.16, h: 0.1 } },
      { label: "Osteophytes", description: "Marginal osteophytes at tibial plateau", confidence: 0.81, severity: "neutral", box: { x: 0.52, y: 0.44, w: 0.14, h: 0.12 } },
    ],
    impression: "Features of osteoarthritis, estimated Kellgren-Lawrence grade 3 on the right.",
  },
  "fracture|pelvis": {
    findings: [{ label: "Intertrochanteric fracture", description: "Right proximal femur fracture with comminution", confidence: 0.93, severity: "critical", box: { x: 0.2, y: 0.5, w: 0.2, h: 0.18 } }],
    impression: "Right intertrochanteric femoral fracture. Osteopenic bone texture.",
  },
  "cholelithiasis|abdomen": {
    findings: [{ label: "Gallstones", description: "Multiple echogenic foci with posterior acoustic shadowing", confidence: 0.89, severity: "warning", box: { x: 0.42, y: 0.38, w: 0.16, h: 0.14 } }],
    impression: "Cholelithiasis. No gallbladder wall thickening detected.",
  },
  "appendicitis|abdomen": {
    findings: [{ label: "Dilated appendix", description: "Non-compressible appendix with periappendiceal fat stranding", confidence: 0.84, severity: "critical", box: { x: 0.58, y: 0.6, w: 0.14, h: 0.14 } }],
    impression: "Findings suggestive of acute appendicitis.",
  },
  "renal-stone|abdomen": {
    findings: [
      { label: "Ureteric calculus", description: "Hyperdense focus in right lower ureter", confidence: 0.92, severity: "warning", box: { x: 0.56, y: 0.62, w: 0.08, h: 0.08 } },
      { label: "Hydronephrosis", description: "Mild right pelvicalyceal dilatation", confidence: 0.76, severity: "warning", box: { x: 0.6, y: 0.3, w: 0.16, h: 0.16 } },
    ],
    impression: "Right lower ureteric calculus with mild upstream obstruction.",
  },
  "sepsis|abdomen": {
    findings: [{ label: "Renal enlargement", description: "Bulky right kidney with perinephric stranding", confidence: 0.71, severity: "warning", box: { x: 0.58, y: 0.3, w: 0.18, h: 0.2 } }],
    impression: "Appearance suggests right pyelonephritis. No hydronephrosis or abscess detected.",
  },
  "back-pain|spine": {
    findings: [{ label: "Disc extrusion", description: "Left paracentral L4-L5 disc extrusion with nerve root contact", confidence: 0.86, severity: "warning", box: { x: 0.44, y: 0.58, w: 0.14, h: 0.08 } }],
    impression: "L4-L5 disc extrusion compressing the left traversing nerve root.",
  },
};

export const RADIOLOGY_AI_NORMAL = {
  findings: [] as Omit<RadiologyFinding, "id">[],
  impression: "No acute abnormality detected by the model. Visualised structures appear within normal limits.",
};
