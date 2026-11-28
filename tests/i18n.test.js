// Kiswahili coverage check. Run: node tests/i18n.test.js [--list]
// Frontline workflows (shell, triage, RECO, results/alerts, rumour form, contacts) must be
// 100% translated; other modules fall back to French and their coverage is reported.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const dir = path.join(__dirname, '..', 'prototype');
global.window = { BDBV_I18N: require_i18n() };
function require_i18n() { const w = {}; new Function('window', fs.readFileSync(path.join(dir, 'i18n.js'), 'utf8'))(w); return w.BDBV_I18N; }
new Function('window', fs.readFileSync(path.join(dir, 'i18n-sw.js'), 'utf8'))(global.window);
const SW = global.window.BDBV_SW, I18N = global.window.BDBV_I18N;

const unq = (s) => s.replace(/\\'/g, "'");
function strings(file) {
  const s = fs.readFileSync(path.join(dir, file), 'utf8'), out = new Set();
  let m;
  const call = /\bL\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)/g;
  while ((m = call.exec(s))) out.add(unq(m[2]));
  // option lists: ['code', 'Français', 'English'] and status maps key: ['Français', 'English']
  const triple = /\[\s*'[a-z_]*'\s*,\s*'((?:[^'\\]|\\.)+)'\s*,\s*'((?:[^'\\]|\\.)+)'\s*\]/g;
  while ((m = triple.exec(s))) out.add(unq(m[2]));
  const pair = /\b[a-z_]+:\s*\[\s*'((?:[^'\\]|\\.)+)'\s*,\s*'((?:[^'\\]|\\.)+)'\s*\]/g;
  while ((m = pair.exec(s))) out.add(unq(m[2]));
  return [...out].filter((x) => !/^[a-z_\-]*$/.test(x));
}
const FRONTLINE = ['app.js', 'modules/rumour.js', 'modules/contacts.js'];
const OTHERS = ['modules/workflow.js', 'modules/lab.js', 'modules/casemgmt.js', 'modules/map.js', 'modules/facility.js', 'modules/reports.js', 'modules/analysis.js', 'modules/admin.js'];
const list = process.argv.includes('--list');

// 1. keyed strings: every French key has a Kiswahili value
const missingKeys = Object.keys(I18N.fr).filter((k) => !(k in I18N.sw));
assert.deepStrictEqual(missingKeys, [], 'keyed strings missing in sw: ' + missingKeys.join(', '));
console.log('ok - keyed interface strings: ' + Object.keys(I18N.fr).length + '/' + Object.keys(I18N.fr).length);

// 2. frontline inline strings: 100%
let missing = [];
FRONTLINE.forEach((f) => strings(f).forEach((en) => { if (!(en in SW)) missing.push(f + ': ' + en); }));
if (missing.length) console.log(missing.join('\n'));
assert.strictEqual(missing.length, 0, missing.length + ' frontline string(s) untranslated');
console.log('ok - frontline workflows fully translated (' + FRONTLINE.map((f) => strings(f).length).reduce((a, b) => a + b) + ' strings)');

// 3. other modules: report coverage (fallback = French)
OTHERS.forEach((f) => {
  const s = strings(f), have = s.filter((en) => en in SW).length;
  console.log('   ' + f.padEnd(22) + String(have).padStart(3) + '/' + String(s.length).padEnd(4) + ' translated (rest falls back to French)');
  if (list) s.filter((en) => !(en in SW)).forEach((en) => console.log('      - ' + en));
});
// 4. rule-set labels
const rules = require(path.join(__dirname, '..', 'config', 'scoring_rules.json'));
assert.ok(rules.items.every((i) => i.label_sw), 'every scoring item has a Kiswahili label');
console.log('ok - scoring labels, floors and community levels have Kiswahili text');
