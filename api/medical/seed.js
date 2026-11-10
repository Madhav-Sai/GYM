/* The owner's starting medical record (this fork): one blood test, one InBody scan and seven goals.
 * Written into DATA_DIR/medical/u-<uid>.json the first time a profile opens Medical, never again:
 * once the file exists, what the person edited or deleted is what stays (store.js).
 *
 * Reference ranges the lab printed are kept as printed. The ones the report left out are common
 * adult male ranges, marked `std: true` so the app can say so. */

// ref: { lo, hi, text }. lo or hi null for a one-sided range. `below` is a second, lower cut-off
// the lab flags on its own (vitamin D: deficient under 20, insufficient 20 to 30).
const m = (key, name, panel, value, unit, ref, flag = 'normal', extra = {}) => ({ key, name, panel, value, unit, ref, flag, ...extra });
const std = (lo, hi, text) => ({ lo, hi, text, std: true });

export const SEED_PROFILE = { name: 'Madhav', age: 24, heightCm: 172, sex: 'male', tz: 'Asia/Kolkata' };

// The markers followed closely. Everything else on a report folds away under its panel.
export const SEED_TRACKED = ['vitd', 'hdl', 'ldl', 'tchol', 'nonhdl', 'chol_hdl', 'ldl_hdl'];

export const SEED_LAB = {
  id: 'lab-2026-08-12',
  date: '2026-08-12',
  lab: 'Orange Health Labs',
  markers: [
    // Lipid profile
    m('tchol', 'Total cholesterol', 'Lipid profile', 207, 'mg/dL', { lo: null, hi: 200, text: '<200' }, 'high'),
    m('tg', 'Triglycerides', 'Lipid profile', 125, 'mg/dL', { lo: null, hi: 150, text: '<150' }),
    m('hdl', 'HDL cholesterol', 'Lipid profile', 33, 'mg/dL', { lo: 50, hi: null, text: '>50' }, 'low'),
    m('ldl', 'LDL cholesterol', 'Lipid profile', 149, 'mg/dL', { lo: null, hi: 100, text: '<100' }, 'high'),
    m('vldl', 'VLDL cholesterol', 'Lipid profile', 25, 'mg/dL', { lo: null, hi: 30, text: '<30' }),
    m('nonhdl', 'Non-HDL cholesterol', 'Lipid profile', 174, 'mg/dL', { lo: null, hi: 130, text: '<130' }, 'high'),
    m('chol_hdl', 'Cholesterol / HDL ratio', 'Lipid profile', 6.0, 'ratio', { lo: 3.3, hi: 4.4, text: '3.3-4.4' }, 'high'),
    m('ldl_hdl', 'LDL / HDL ratio', 'Lipid profile', 4.5, 'ratio', { lo: 0.5, hi: 3, text: '0.5-3.0' }, 'high'),
    // Vitamins
    m('vitd', 'Vitamin D (25-OH)', 'Vitamins', 11.8, 'ng/mL', { lo: 30, hi: 100, text: '30-100', below: 20 }, 'deficient'),
    m('b12', 'Vitamin B12', 'Vitamins', 389, 'pg/mL', { lo: 187, hi: 883, text: '187-883' }),
    // Glucose
    m('hba1c', 'HbA1c', 'Glucose', 5.3, '%', { lo: null, hi: 5.7, text: '<5.7' }),
    m('glu_r', 'Glucose, random', 'Glucose', 89, 'mg/dL', { lo: 70, hi: 140, text: '70-140' }),
    m('eag', 'Estimated average glucose', 'Glucose', 105, 'mg/dL', std(null, 117, '<117')),
    // Liver
    m('ast', 'AST (SGOT)', 'Liver', 22, 'U/L', std(null, 40, '<40')),
    m('alt', 'ALT (SGPT)', 'Liver', 18, 'U/L', std(null, 41, '<41')),
    m('alp', 'Alkaline phosphatase', 'Liver', 97, 'U/L', std(40, 129, '40-129')),
    m('ggt', 'GGT', 'Liver', 21, 'U/L', std(8, 61, '8-61')),
    m('bili', 'Bilirubin, total', 'Liver', 0.73, 'mg/dL', std(0.3, 1.2, '0.3-1.2')),
    m('alb', 'Albumin', 'Liver', 4.8, 'g/dL', std(3.5, 5.2, '3.5-5.2')),
    // Kidney and electrolytes
    m('creat', 'Creatinine', 'Kidney', 0.69, 'mg/dL', std(0.66, 1.25, '0.66-1.25')),
    m('egfr', 'eGFR', 'Kidney', 132, 'mL/min/1.73m²', std(90, null, '>90')),
    m('urea', 'Urea', 'Kidney', 17, 'mg/dL', { lo: 19, hi: 43, text: '19-43' }, 'low'),
    m('uric', 'Uric acid', 'Kidney', 6.8, 'mg/dL', std(3.5, 7.2, '3.5-7.2')),
    m('na', 'Sodium', 'Kidney', 138, 'mmol/L', std(136, 145, '136-145')),
    m('k', 'Potassium', 'Kidney', 4.11, 'mmol/L', std(3.5, 5.1, '3.5-5.1')),
    m('cl', 'Chloride', 'Kidney', 106, 'mmol/L', std(98, 107, '98-107')),
    m('ca', 'Calcium', 'Kidney', 9.8, 'mg/dL', std(8.4, 10.2, '8.4-10.2')),
    m('phos', 'Phosphorus', 'Kidney', 3.9, 'mg/dL', std(2.5, 4.5, '2.5-4.5')),
    // Thyroid
    m('tsh', 'TSH', 'Thyroid', 1.1457, 'µIU/mL', std(0.55, 4.78, '0.55-4.78')),
    m('t3', 'T3, total', 'Thyroid', 0.93, 'ng/mL', std(0.6, 1.81, '0.60-1.81')),
    m('t4', 'T4, total', 'Thyroid', 7.56, 'µg/dL', std(5.01, 12.45, '5.01-12.45')),
    // Complete blood count
    m('hb', 'Haemoglobin', 'Complete blood count', 15.5, 'g/dL', std(13, 17, '13.0-17.0')),
    m('rbc', 'RBC count', 'Complete blood count', 5.35, 'mill/µL', std(4.5, 5.5, '4.5-5.5')),
    m('hct', 'Haematocrit', 'Complete blood count', 47.3, '%', std(40, 50, '40-50')),
    m('mcv', 'MCV', 'Complete blood count', 88.4, 'fL', std(83, 101, '83-101')),
    m('wbc', 'WBC count', 'Complete blood count', 7010, '/µL', std(4000, 10000, '4000-10000')),
    m('plt', 'Platelets', 'Complete blood count', 247, '×10³/µL', std(150, 410, '150-410')),
    m('esr', 'ESR', 'Complete blood count', 2, 'mm/hr', std(0, 15, '0-15')),
    // Urine
    m('urine', 'Urine routine and microscopy', 'Urine', null, '', { lo: null, hi: null, text: 'Normal' }, 'normal', { text: 'All normal' }),
  ],
};

export const SEED_INBODY = {
  id: 'inbody-2026-10-02',
  date: '2026-10-02',
  weight: 72.9, bodyFatPct: 30.5, bodyFatMass: 22.2, skeletalMuscle: 28.4, leanMass: 50.7,
  visceralFat: 10, whr: 1.03, bmr: 1465, bmi: 24.6, score: 63,
  tbw: 37.2, protein: 10.1, mineral: 3.41,
  segmental: {
    la: { kg: 3.03, flag: 'normal' },
    ra: { kg: 2.99, flag: 'normal' },
    trunk: { kg: 24.8, flag: 'normal' },
    ll: { kg: 7.93, flag: 'under' },
    rl: { kg: 7.92, flag: 'under' },
  },
  targets: { weight: 65.0, fatControl: -12.5, muscleControl: 4.6 },
};

// A goal is a start value and a target band: lo alone is "lo or more", hi alone "below hi", both a range.
export const SEED_GOALS = [
  { id: 'g-vitd', key: 'lab:vitd', label: 'Vitamin D', unit: 'ng/mL', start: 11.8, lo: 30, hi: null, by: '2026-12-25', from: '2026-08-12' },
  { id: 'g-hdl', key: 'lab:hdl', label: 'HDL cholesterol', unit: 'mg/dL', start: 33, lo: 45, hi: null, by: '2027-04-01', from: '2026-08-12' },
  { id: 'g-ldl', key: 'lab:ldl', label: 'LDL cholesterol', unit: 'mg/dL', start: 149, lo: null, hi: 100, by: '2027-04-01', from: '2026-08-12' },
  { id: 'g-bf', key: 'inbody:bodyFatPct', label: 'Body fat', unit: '%', start: 30.5, lo: 18, hi: 20, by: '2027-04-01', from: '2026-10-02' },
  { id: 'g-smm', key: 'inbody:skeletalMuscle', label: 'Skeletal muscle', unit: 'kg', start: 28.4, lo: 33, hi: null, by: '2027-04-01', from: '2026-10-02' },
  { id: 'g-whr', key: 'inbody:whr', label: 'Waist-hip ratio', unit: '', start: 1.03, lo: null, hi: 0.9, by: '2027-04-01', from: '2026-10-02' },
  { id: 'g-weight', key: 'weight', label: 'Weight', unit: 'kg', start: 72.9, lo: 66, hi: 68, by: '2027-04-01', from: '2026-10-02' },
];

export function seedDoc(now = Date.now()) {
  return structuredClone({
    v: 1, profile: SEED_PROFILE, tracked: SEED_TRACKED,
    labs: [SEED_LAB], inbody: [SEED_INBODY], goals: SEED_GOALS,
    updatedAt: now,
  });
}
