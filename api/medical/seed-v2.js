/* The owner's record, second round (this fork): the blood test and InBody scan of 2026-11-11, the
 * goals and tracked markers of the new plan, and the next tests to book. Applied once to a record
 * that already exists (migrate.js), so it reaches the record the first seed (seed.js) wrote.
 *
 * Marker keys are the first seed's wherever it had the marker, so the trends line up. Ranges are as
 * the lab printed them this time. */

const m = (key, name, panel, value, unit, ref, flag = 'normal', extra = {}) => ({ key, name, panel, value, unit, ref, flag, ...extra });
const r = (lo, hi, text) => ({ lo, hi, text });
const none = { lo: null, hi: null, text: '' };

export const V2_DATE = '2026-11-11';

// The markers followed closely from now on (vitamin D stays: it is fixed, the trend shows it).
export const V2_TRACKED = ['tg', 'hdl', 'vldl', 'ldl', 'nonhdl', 'chol_hdl', 'tchol', 'lymph', 'vitd'];

const LP = 'Lipid profile', VIT = 'Vitamins', GLU = 'Glucose', LIV = 'Liver', KID = 'Kidney', THY = 'Thyroid', CBC = 'Complete blood count', UR = 'Urine';

export const V2_LAB = {
  id: 'lab-2026-11-11',
  date: V2_DATE,
  lab: 'Orange Health Labs',
  note: 'Fasted about 11 hours.',
  markers: [
    m('tchol', 'Total cholesterol', LP, 213, 'mg/dL', r(null, 200, '<200'), 'high'),
    m('tg', 'Triglycerides', LP, 215, 'mg/dL', r(null, 150, '<150'), 'high'),
    m('hdl', 'HDL cholesterol', LP, 27, 'mg/dL', r(50, null, '>50'), 'low'),
    m('nonhdl', 'Non-HDL cholesterol', LP, 186, 'mg/dL', r(null, 130, '<130'), 'high'),
    m('ldl', 'LDL cholesterol', LP, 143, 'mg/dL', r(null, 100, '<100'), 'high'),
    m('vldl', 'VLDL cholesterol', LP, 43, 'mg/dL', r(null, 30, '<30'), 'high'),
    m('chol_hdl', 'Cholesterol / HDL ratio', LP, 7.9, 'ratio', r(3.3, 4.4, '3.3-4.4'), 'high'),
    m('ldl_hdl', 'LDL / HDL ratio', LP, 5.3, 'ratio', r(0.5, 3, '0.5-3.0'), 'high'),
    m('hdl_ldl', 'HDL / LDL ratio', LP, 0.2, 'ratio', r(0.4, null, '>0.4'), 'low'),

    m('b12', 'Vitamin B12', VIT, 403, 'pg/mL', r(187, 883, '187-883')),
    m('vitd', 'Vitamin D (25-OH)', VIT, 52.9, 'ng/mL', { lo: 30, hi: 100, text: '30-100', below: 20 }),

    m('glu_r', 'Glucose, random', GLU, 98, 'mg/dL', r(70, 140, '70-140')),
    m('hba1c', 'HbA1c', GLU, 5.3, '%', r(null, 5.7, '<5.7')),
    m('eag', 'Estimated average glucose', GLU, 105, 'mg/dL', r(null, 117, '<117')),

    m('bili', 'Bilirubin, total', LIV, 0.9, 'mg/dL', r(0.3, 1.2, '0.3-1.2')),
    m('bili_d', 'Bilirubin, direct', LIV, 0.2, 'mg/dL', r(0, 0.5, '0-0.5')),
    m('bili_i', 'Bilirubin, indirect', LIV, 0.7, 'mg/dL', r(0.2, 1.1, '0.2-1.1')),
    m('ast', 'AST (SGOT)', LIV, 17, 'U/L', r(11, 34, '11-34')),
    m('alt', 'ALT (SGPT)', LIV, 16, 'U/L', r(null, 45, '<45')),
    m('ast_alt', 'AST / ALT ratio', LIV, 1.1, 'ratio', r(0.7, 1.4, '0.7-1.4')),
    m('alp', 'Alkaline phosphatase', LIV, 113, 'U/L', r(50, 116, '50-116')),
    m('ggt', 'GGT', LIV, 20, 'U/L', r(null, 55, '<55')),
    m('tprot', 'Total protein', LIV, 7.5, 'g/dL', r(6.4, 8.3, '6.4-8.3')),
    m('alb', 'Albumin', LIV, 4.7, 'g/dL', r(3.5, 5.2, '3.5-5.2')),
    m('glob', 'Globulin', LIV, 2.8, 'g/dL', r(2.3, 3.5, '2.3-3.5')),
    m('ag_ratio', 'Albumin / globulin ratio', LIV, 1.7, 'ratio', r(0.8, 2, '0.8-2.0')),

    m('urea', 'Urea', KID, 19.26, 'mg/dL', r(12.8, 42.8, '12.8-42.8')),
    m('creat', 'Creatinine', KID, 0.94, 'mg/dL', r(0.6, 1.2, '0.6-1.2')),
    m('bun', 'BUN', KID, 9, 'mg/dL', r(6, 20, '6-20')),
    m('bun_creat', 'BUN / creatinine ratio', KID, 9.6, 'ratio', r(10, 20, '10-20'), 'low'),
    m('uric', 'Uric acid', KID, 6.6, 'mg/dL', r(3.7, 7.7, '3.7-7.7')),
    m('ca', 'Calcium', KID, 8.9, 'mg/dL', r(8.4, 10.2, '8.4-10.2')),
    m('phos', 'Phosphorus', KID, 3.6, 'mg/dL', r(2.5, 4.5, '2.5-4.5')),
    m('egfr', 'eGFR', KID, 116.09, 'mL/min/1.73m²', r(90, null, '>=90')),
    m('na', 'Sodium', KID, 138, 'mmol/L', r(136, 145, '136-145')),
    m('k', 'Potassium', KID, 4.3, 'mmol/L', r(3.5, 5.1, '3.5-5.1')),
    m('cl', 'Chloride', KID, 102, 'mmol/L', r(98, 107, '98-107')),

    m('t3', 'T3, total', THY, 0.89, 'ng/mL', r(0.35, 1.93, '0.35-1.93')),
    m('t4', 'T4, total', THY, 6.34, 'µg/dL', r(4.87, 11.72, '4.87-11.72')),
    m('tsh', 'TSH', THY, 2.15, 'µIU/mL', r(0.35, 4.94, '0.35-4.94')),

    m('rbc', 'RBC count', CBC, 5.64, 'mill/µL', r(4.5, 5.5, '4.5-5.5'), 'high'),
    m('hb', 'Haemoglobin', CBC, 16.4, 'g/dL', r(13, 17, '13.0-17.0')),
    m('hct', 'Haematocrit', CBC, 48.7, '%', r(40, 50, '40-50')),
    m('mcv', 'MCV', CBC, 86.4, 'fL', r(83, 101, '83-101')),
    m('mch', 'MCH', CBC, 29.2, 'pg', r(27, 32, '27-32')),
    m('mchc', 'MCHC', CBC, 33.7, 'g/dL', r(31.5, 34.5, '31.5-34.5')),
    m('rdw', 'RDW-CV', CBC, 12.5, '%', r(11.6, 14, '11.6-14.0')),
    m('mentzer', 'Mentzer index', CBC, 15.3, '', none, null),
    m('sehgal', 'Sehgal index', CBC, 1323.6, '', none, null),
    m('wbc', 'WBC count', CBC, 6370, '/µL', r(4000, 10000, '4000-10000')),
    m('neut', 'Neutrophils', CBC, 43.1, '%', r(40, 80, '40-80')),
    m('lymph', 'Lymphocytes', CBC, 49.6, '%', r(20, 40, '20-40'), 'high', { note: 'Kindly correlate clinically and suggest follow up.' }),
    m('mono', 'Monocytes', CBC, 4.7, '%', r(2, 10, '2-10')),
    m('eos', 'Eosinophils', CBC, 2.4, '%', r(1, 6, '1-6')),
    m('baso', 'Basophils', CBC, 0.2, '%', r(0, 2, '0-2')),
    m('anc', 'Absolute neutrophil count', CBC, 2745, '/µL', r(2000, 7000, '2000-7000')),
    m('alc', 'Absolute lymphocyte count', CBC, 3160, '/µL', r(1000, 3000, '1000-3000'), 'high'),
    m('amc', 'Absolute monocyte count', CBC, 299, '/µL', r(200, 1000, '200-1000')),
    m('aec', 'Absolute eosinophil count', CBC, 153, '/µL', r(20, 500, '20-500')),
    m('abc', 'Absolute basophil count', CBC, 13, '/µL', r(0, 100, '0-100')),
    m('nlr', 'Neutrophil / lymphocyte ratio', CBC, 0.9, 'ratio', r(1, 3, '1-3'), 'low'),
    m('plt', 'Platelets', CBC, 232, '×10³/µL', r(150, 450, '150-450')),
    m('pct', 'Plateletcrit', CBC, 0.21, '%', r(0.2, 0.5, '0.2-0.5')),
    m('mpv', 'MPV', CBC, 9.1, 'fL', r(7, 13, '7-13')),
    m('esr', 'ESR', CBC, 3, 'mm/hr', r(0, 10, '0-10')),

    m('urine', 'Urine routine and microscopy', UR, null, '', { lo: null, hi: null, text: 'Normal' }, 'normal', { text: 'All normal except mucus' }),
    m('urine_mucus', 'Urine mucus', UR, null, '', { lo: null, hi: null, text: 'Absent' }, null, { text: 'Present' }),
  ],
};

export const V2_INBODY = {
  id: 'inbody-2026-11-11',
  date: V2_DATE,
  time: '10:36',
  device: 'InBody 260S',
  weight: 72.1, skeletalMuscle: 28.2, bodyFatMass: 21.6, bodyFatPct: 30.0, tbw: 37.0, protein: 10.0, mineral: 3.51,
  leanMass: 50.5, bmr: 1460, bmi: 24.4, score: 63, whr: 1.01, visceralFat: 9, smi: 7.4, intake: 2237,
  segmental: {
    la: { kg: 2.91, flag: 'normal' },
    ra: { kg: 2.92, flag: 'normal', approx: true },
    trunk: { kg: 24.4, flag: 'normal' },
    ll: { kg: 7.99, flag: 'normal' },
    rl: { kg: 7.9, flag: 'under', approx: true },
  },
  segmentalFat: {
    la: { kg: 1.4, flag: 'over' },
    ra: { kg: 1.4, flag: 'over' },
    trunk: { kg: 11.8, flag: 'over' },
    ll: { kg: 2.9, flag: 'over' },
    rl: { kg: 2.9, flag: 'over' },
  },
  targets: { weight: 65.1, weightControl: -7.0, fatControl: -11.9, muscleControl: 4.9 },
  note: 'Right arm and right leg lean mass are approximate: the digits are faint on the sheet.',
};

// Goals of the new plan, by id. An existing goal of the same id is updated (its achieved mark kept),
// a missing one is added.
export const V2_GOALS = [
  { id: 'g-tg', key: 'lab:tg', label: 'Triglycerides', unit: 'mg/dL', start: 215, lo: null, hi: 150, by: '2026-12-31', from: V2_DATE,
    note: 'Expect 150-170 at the 6 to 8 week retest.' },
  { id: 'g-hdl', key: 'lab:hdl', label: 'HDL cholesterol', unit: 'mg/dL', start: 27, lo: 45, hi: null, by: '2027-04-01', from: V2_DATE },
  { id: 'g-vldl', key: 'lab:vldl', label: 'VLDL cholesterol', unit: 'mg/dL', start: 43, lo: null, hi: 30, by: '2027-04-01', from: V2_DATE },
  { id: 'g-ldl', key: 'lab:ldl', label: 'LDL cholesterol', unit: 'mg/dL', start: 149, lo: null, hi: 100, by: '2027-04-01', from: '2026-08-12' },
  { id: 'g-bf', key: 'inbody:bodyFatPct', label: 'Body fat', unit: '%', start: 30.5, lo: 18, hi: 20, by: '2027-04-01', from: '2026-10-02' },
  { id: 'g-smm', key: 'inbody:skeletalMuscle', label: 'Skeletal muscle', unit: 'kg', start: 28.4, lo: 33, hi: null, by: '2027-04-01', from: '2026-10-02' },
  { id: 'g-whr', key: 'inbody:whr', label: 'Waist-hip ratio', unit: '', start: 1.03, lo: null, hi: 0.9, by: '2027-04-01', from: '2026-10-02' },
  { id: 'g-weight', key: 'weight', label: 'Weight', unit: 'kg', start: 72.9, lo: 65, hi: 68, by: '2027-04-01', from: '2026-10-02',
    note: 'InBody target 65.1 kg.' },
];

// Vitamin D reached its target: the goal stays, marked achieved, as history.
export const V2_VITD_ACHIEVED = { date: V2_DATE, value: 52.9 };
export const V2_VITD_GOAL = { id: 'g-vitd', key: 'lab:vitd', label: 'Vitamin D', unit: 'ng/mL', start: 11.8, lo: 30, hi: null, by: '2026-12-25', from: '2026-08-12' };

// What to book next. from/to is the window it is due in (to null: from then on; both null: one-time,
// any time). `prominent`
// stays on top until it is ticked.
export const V2_TESTS = [
  { id: 't-physician', title: 'See a physician: take both reports, ask for ApoB and Lp(a)', from: null, to: null, prominent: true },
  { id: 't-cbc', title: 'Repeat CBC', from: '2026-12-09', to: '2026-12-23', reason: 'Lymphocytes 49.6 %, ALC 3160 flagged' },
  { id: 't-lipid', title: 'Lipid profile, fasted 12 hours', from: '2026-12-23', to: '2027-01-06',
    expect: 'TG 150-170, HDL 29-32, VLDL 30-34, LDL 125-135' },
  { id: 't-apob', title: 'Ask the doctor for ApoB and Lp(a)', from: null, to: null, reason: 'One-time' },
  { id: 't-b12', title: 'B12 retest, if on the pure veg track', from: '2027-02-11', to: null,
    reason: 'Add B12 1500 mcg weekly if below 250' },
];
