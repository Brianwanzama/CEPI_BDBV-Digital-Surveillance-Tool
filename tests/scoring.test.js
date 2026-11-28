// Unit tests for the provisional scoring engine. Run: node tests/scoring.test.js
const assert = require('assert');
const path = require('path');
const S = require('../prototype/scoring.js');
const rules = require('../config/scoring_rules.json');

function input(present, opts) {
  opts = opts || {};
  const items = {};
  rules.items.forEach(it => { items[it.id] = { s: opts.defaultStatus || 'no' }; });
  Object.keys(present).forEach(k => { items[k] = typeof present[k] === 'string' ? { s: present[k] } : present[k]; });
  return { onset_date: opts.onset || '2026-11-20', assessed_at: '2026-11-22T10:00:00Z', items, deceased: !!opts.deceased, clinician: opts.clinician };
}

let passed = 0;
function t(name, fn) { fn(); passed++; console.log('ok -', name); }

t('nothing present -> GREEN, score 0, complete', () => {
  const r = S.evaluate(input({}), rules);
  assert.strictEqual(r.score, 0); assert.strictEqual(r.category, 'GREEN'); assert.strictEqual(r.completeness, 100);
});

t('fever + known case contact -> RED via F1 floor even if score < 70', () => {
  const r = S.evaluate(input({ fever: 'yes', contact_case: { s: 'yes', date: '2026-11-10' } }), rules);
  assert.strictEqual(r.score, 45);
  assert.strictEqual(r.algorithm_category, 'RED');
  assert.ok(r.floors_applied.includes('F1_CASE_DEFINITION'));
});

t('exposure older than 21 days before onset is not counted', () => {
  const r = S.evaluate(input({ fever: 'yes', contact_case: { s: 'yes', date: '2026-10-01' } }), rules);
  assert.strictEqual(r.score, 10);
  assert.ok(r.notes.some(n => n === 'OUT_OF_WINDOW:contact_case'));
  assert.ok(!r.floors_applied.includes('F1_CASE_DEFINITION'));
});

t('fever + bleeding without exposure -> at least AMBER (F2)', () => {
  const r = S.evaluate(input({ fever: 'yes', bleeding: 'yes' }), rules);
  assert.strictEqual(r.score, 25);
  assert.strictEqual(r.category, 'AMBER');
});

t('domain caps are applied (clinical max 45)', () => {
  const all = {}; rules.items.filter(i => i.domain === 'clinical').forEach(i => { all[i.id] = 'yes'; });
  const r = S.evaluate(input(all), rules);
  assert.strictEqual(r.domain_scores.clinical.observed, 45);
});

t('score never exceeds 100', () => {
  const all = {}; rules.items.forEach(i => { all[i.id] = 'yes'; });
  const r = S.evaluate(input(all), rules);
  assert.ok(r.score <= 100); assert.strictEqual(r.category, 'RED');
});

t('unknown is NOT treated as absent: completeness and potential category reported', () => {
  const r = S.evaluate(input({ fever: 'yes' }, { defaultStatus: 'unk' }), rules);
  assert.strictEqual(r.score, 10);
  assert.ok(r.completeness < 10);
  assert.strictEqual(r.potential_category, 'RED');
  assert.strictEqual(r.incomplete_could_escalate, true);
});

t('clinician can override upward; recorded with direction', () => {
  const r = S.evaluate(input({ headache: 'yes' }, { clinician: { category: 'RED', reason: 'Clinical concern' } }), rules);
  assert.strictEqual(r.algorithm_category, 'GREEN');
  assert.strictEqual(r.category, 'RED');
  assert.strictEqual(r.override.direction, 'up');
});

t('threshold change in config changes category without code change', () => {
  const r2 = JSON.parse(JSON.stringify(rules)); r2.thresholds = { red: 40, amber: 20 };
  const r = S.evaluate(input({ fever: 'yes', bleeding: 'yes', vomiting: 'yes' }), r2);
  assert.strictEqual(r.score, 29); assert.strictEqual(r.category, 'AMBER');
});

t('v0.2: correlated symptoms are group-capped (GI max 8, aches max 3)', () => {
  const r = S.evaluate(input({ vomiting: 'yes', diarrhoea: 'yes', anorexia: 'yes', abdominal_pain: 'yes', headache: 'yes', joint_pain: 'yes', myalgia: 'yes' }), rules);
  assert.strictEqual(r.group_scores.gi.raw, 14); assert.strictEqual(r.group_scores.gi.observed, 8);
  assert.strictEqual(r.group_scores.pain.observed, 3);
  assert.strictEqual(r.score, 11);
});

t('v0.2: DT, DRO, ICT, cough and rash are collected but not scored', () => {
  const r = S.evaluate(input({ dt: 'yes', dro: 'yes', ict: 'yes', cough: 'yes', rash: 'yes', respiratory: 'yes' }), rules);
  assert.strictEqual(r.score, 0);
});

t('v0.2: coma flags a severity sign without adding points', () => {
  const r = S.evaluate(input({ coma: 'yes' }), rules);
  assert.strictEqual(r.score, 0); assert.deepStrictEqual(r.severity_signs, ['coma']);
});

t('v0.2: all 23 supplied symptoms are present with labels exactly as supplied', () => {
  const supplied = ['Fever', 'Fatigue', 'Vomiting', 'Diarrhea', 'Headaches', 'Anorexia', 'Abdominal pain', 'Joint pain', 'Muscle pain', 'Cough', 'Other non-hemorrhagic clinical signs', 'DT *', 'Respiratory breathing', 'Hemorrhagic syndrome', 'Difficulty swallowing', 'Sore throat', 'Coma', 'Hiccups', 'Skin rash', 'Conjunctivitis', 'Confusion', 'DRO *', 'ICT *'];
  assert.deepStrictEqual(rules.items.filter(i => i.kind === 'symptom').map(i => i.label_en), supplied);
  rules.items.forEach(i => assert.ok(i.label_fr && i.label_sw, 'FR and SW label for ' + i.id));
});

t('deceased + affected area -> RED (F3)', () => {
  const r = S.evaluate(input({ affected_area: 'yes' }, { deceased: true }), rules);
  assert.strictEqual(r.category, 'RED');
});

t('community context is separate and does not change the score', () => {
  const now = new Date('2026-11-22T12:00:00Z');
  const reports = [{ village: 'V1', area: 'A1', zone: 'Z1', reported_at: '2026-11-20T08:00:00Z', counts: { deaths_unexplained: 2, clusters: 1 }, events: [{ verification: 'reported' }] }];
  const ctx = S.communityContext(reports, rules, { village: 'V1', area: 'A1', zone: 'Z1' }, now);
  assert.strictEqual(ctx.village.points, 7); assert.strictEqual(ctx.village.level, 2); assert.strictEqual(ctx.advisory, true);
  assert.strictEqual(ctx.village.unverified_events, 1);
  const old = S.communityContext([Object.assign({}, reports[0], { reported_at: '2026-10-01T00:00:00Z' })], rules, { village: 'V1', area: 'A1', zone: 'Z1' }, now);
  assert.strictEqual(old.village.level, 0);
});

t('early warning flags only above mean + 2SD', () => {
  const ew = rules.early_warning;
  assert.strictEqual(S.earlyWarning([9, 2, 3, 2, 3], ew).signal, true);
  assert.strictEqual(S.earlyWarning([4, 2, 3, 2, 3], ew).signal, false);
  assert.strictEqual(S.earlyWarning([4, 2], ew).signal, false);
});

console.log('\n' + passed + ' tests passed');
