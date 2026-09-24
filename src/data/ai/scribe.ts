/** Scripted consultation transcripts for the mock AI Scribe, keyed by profile. */
export type Line = { speaker: "Doctor" | "Patient" | "Attendant"; text: string };

export const SCRIBE_SCRIPTS: Record<string, Line[]> = {
  "t2dm-htn": [
    { speaker: "Doctor", text: "Good morning. How have your sugars been since the last visit?" },
    { speaker: "Patient", text: "Fasting is coming around 160 to 180 at home, doctor. After food it goes above 250 sometimes." },
    { speaker: "Doctor", text: "Are you taking the Glycomet GP twice a day regularly?" },
    { speaker: "Patient", text: "Morning I take. Night I sometimes forget, maybe three or four days a week." },
    { speaker: "Doctor", text: "Any burning or tingling in the feet?" },
    { speaker: "Patient", text: "Yes, at night both feet feel like pins and needles for the last two months." },
    { speaker: "Doctor", text: "Any chest pain, breathlessness, or swelling of legs?" },
    { speaker: "Patient", text: "No, nothing like that. Only feeling tired in the evening." },
    { speaker: "Doctor", text: "Your BP today is slightly high. Are you taking Telma daily?" },
    { speaker: "Patient", text: "Yes, that one I take every morning." },
    { speaker: "Doctor", text: "I will check your HbA1c and kidney function today and add one more tablet that also protects the heart and kidneys. Please do not miss the night dose." },
  ],
  hf: [
    { speaker: "Doctor", text: "How is the breathing? Can you lie flat at night?" },
    { speaker: "Patient", text: "I need two pillows now. Last week I woke up once feeling breathless." },
    { speaker: "Doctor", text: "Has your weight gone up? Any swelling in the legs?" },
    { speaker: "Attendant", text: "Her weight went from 58 to 61 kilos in ten days, and the ankles are swollen by evening." },
    { speaker: "Doctor", text: "Are you taking the warfarin at the same dose? Any new medicine from outside, for pain maybe?" },
    { speaker: "Attendant", text: "She took some pain tablets from the medical shop for knee pain last week." },
    { speaker: "Doctor", text: "Those pain killers can worsen the fluid and interfere with warfarin. Please avoid them. I will increase the Lasix for a few days and check the INR and kidney tests today." },
  ],
  pregnancy: [
    { speaker: "Doctor", text: "You are 34 weeks now. How are the baby movements?" },
    { speaker: "Patient", text: "Good, more than ten kicks in the evening. Sometimes very active at night." },
    { speaker: "Doctor", text: "Any headache, blurring of vision, or swelling of face and hands?" },
    { speaker: "Patient", text: "No headache. Feet swell a little by evening but go down in the morning." },
    { speaker: "Doctor", text: "Are you taking the iron and calcium tablets?" },
    { speaker: "Patient", text: "Iron tablet gives me some constipation, so I skip sometimes." },
    { speaker: "Doctor", text: "Take it with lemon water after lunch and increase fibre. We will repeat your haemoglobin today and plan a growth scan next week." },
  ],
};

export const GENERIC_SCRIPT = (complaint: string): Line[] => [
  { speaker: "Doctor", text: "Please tell me what brings you in today." },
  { speaker: "Patient", text: `${complaint}.` },
  { speaker: "Doctor", text: "Since when has this been happening, and is it getting better or worse?" },
  { speaker: "Patient", text: "About four or five days now. It was mild first, now a little more." },
  { speaker: "Doctor", text: "Any fever, vomiting, or other medicines you have taken for this?" },
  { speaker: "Patient", text: "Mild fever on and off. I took a paracetamol once yesterday." },
  { speaker: "Doctor", text: "Any known allergies to medicines?" },
  { speaker: "Patient", text: "Not that I know of." },
  { speaker: "Doctor", text: "Alright. I will examine you and send a few basic tests, then we will decide the treatment." },
];
