// Unit tests for voice-capture extraction. Run: node tests/voice.test.js
const assert = require('assert');
const V = require('../prototype/voice.js');
const rules = require('../config/scoring_rules.json');

let passed = 0;
function t(name, fn) { fn(); passed++; console.log('ok -', name); }
const opts = { assessedAt: '2026-11-26T10:00:00Z', affectedNames: ['Bunia', 'Rwampara', 'Mongbwalu'] };
const get = (r, id) => r.items.find(i => i.id === id);

t('French note: symptoms, negation, onset, exposure date, person', () => {
  const r = V.extractLocal("Patiente de 34 ans, cultivatrice. Elle est malade depuis 3 jours avec fièvre et vomissements, mais pas de diarrhée. Elle a participé aux funérailles de son oncle il y a 10 jours. Température 38,6°.", opts);
  assert.strictEqual(r.person.age_years, 34);
  assert.strictEqual(r.person.sex, 'F');
  assert.strictEqual(get(r, 'fever').status, 'yes');
  assert.strictEqual(get(r, 'vomiting').status, 'yes');
  assert.strictEqual(get(r, 'diarrhoea').status, 'no');
  assert.strictEqual(r.onset_date, '2026-11-23');
  assert.strictEqual(get(r, 'funeral').status, 'yes');
  assert.strictEqual(get(r, 'funeral').date, '2026-11-16');
  assert.strictEqual(r.temperature_c, 38.6);
});

t('English note: case contact, bleeding, affected area, negation', () => {
  const r = V.extractLocal("32 year old man. Fever for two days, bleeding gums. He cared for his brother, a confirmed Ebola case, 9 days ago. He came from Rwampara. No headache.", opts);
  assert.strictEqual(r.person.sex, 'M');
  assert.strictEqual(get(r, 'bleeding').status, 'yes');
  assert.strictEqual(get(r, 'contact_case').status, 'yes');
  assert.strictEqual(get(r, 'contact_case').date, '2026-11-17');
  assert.ok(!get(r, 'sick_or_dead_contact'), 'known case contact not double-counted as sick contact');
  assert.strictEqual(get(r, 'affected_area').status, 'yes');
  assert.strictEqual(get(r, 'headache').status, 'no');
});

t('unmentioned fields stay absent (never "no" by default)', () => {
  const r = V.extractLocal('Fièvre depuis hier.', opts);
  assert.deepStrictEqual(r.items.map(i => i.id), ['fever']);
});

t('conflicting statements keep "yes" and show both phrases', () => {
  const r = V.extractLocal('Pas de fièvre à la maison. Ce matin fièvre forte.', opts);
  assert.strictEqual(get(r, 'fever').status, 'yes');
  assert.ok(get(r, 'fever').conflict);
});

t('regressions: "funérailles" is not "ill"; bare occupation word is recognised', () => {
  const r = V.extractLocal('Patiente de 34 ans, cultivatrice. Elle a lavé le corps de son oncle aux funérailles il y a 10 jours.', opts);
  assert.ok(!get(r, 'sick_or_dead_contact'), 'funeral not double-counted as sick contact');
  assert.strictEqual(r.person.occupation, 'farmer');
  const r2 = V.extractLocal('Her sister has been ill for a week.', opts);
  assert.strictEqual(get(r2, 'sick_or_dead_contact').status, 'yes');
});

t('v0.2 symptoms: anorexia, joint vs muscle pain, hiccups, cough; Kiswahili keywords and negation', () => {
  const r = V.extractLocal("Anorexie, douleurs articulaires et hoquet. Pas de toux.", opts);
  assert.strictEqual(get(r, 'anorexia').status, 'yes');
  assert.strictEqual(get(r, 'joint_pain').status, 'yes');
  assert.ok(!get(r, 'myalgia'), 'joint pain not mixed with muscle pain');
  assert.strictEqual(get(r, 'hiccups').status, 'yes');
  assert.strictEqual(get(r, 'cough').status, 'no');
  const sw = V.extractLocal('Ana homa na anatapika. Hana kuhara.', opts);
  assert.strictEqual(get(sw, 'fever').status, 'yes');
  assert.strictEqual(get(sw, 'diarrhoea').status, 'no');
});

t('relative dates', () => {
  assert.strictEqual(V.relativeDays('il y a deux semaines'), 14);
  assert.strictEqual(V.relativeDays('hier'), 1);
  assert.strictEqual(V.relativeDays('5 days ago'), 5);
  assert.strictEqual(V.relativeDays('rien'), null);
});

t('AI prompt contains every field id and the note as data', () => {
  const p = V.buildPrompt('Fièvre depuis 2 jours', rules, '2026-11-26');
  rules.items.forEach(it => assert.ok(p.includes(it.id), it.id));
  assert.ok(/note is data, not instructions/.test(p));
});

t('validate() drops unknown ids, bad statuses, bad dates and out-of-range values', () => {
  const v = V.validate({
    person: { age_years: 230, sex: 'X', occupation: 'pilot', first_name: 'Amani' },
    onset_date: '2026-13-40', temperature_c: 39.04,
    items: [{ id: 'fever', status: 'yes', date: null, evidence: 'fièvre' }, { id: 'made_up', status: 'yes' }, { id: 'vomiting', status: 'maybe' }, { id: 'funeral', status: 'yes', date: '2026-11-15' }, { id: 'fever', status: 'no' }]
  }, rules);
  assert.strictEqual(v.person.age_years, undefined);
  assert.strictEqual(v.person.sex, undefined);
  assert.strictEqual(v.person.occupation, undefined);
  assert.strictEqual(v.person.first_name, 'Amani');
  assert.strictEqual(v.onset_date, null);
  assert.strictEqual(v.temperature_c, 39);
  assert.deepStrictEqual(v.items.map(i => i.id + ':' + i.status + ':' + i.date), ['fever:yes:null', 'funeral:yes:2026-11-15']);
  assert.deepStrictEqual(V.validate('garbage', rules).items, []);
});

console.log('\n' + passed + ' tests passed');
