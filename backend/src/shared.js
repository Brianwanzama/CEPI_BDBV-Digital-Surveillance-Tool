'use strict';
/*
 * Code shared with the offline app (single source of truth):
 *  - the scoring engine (prototype/scoring.js) and rule set (config/scoring_rules.json),
 *    so the server recomputes every score with exactly the same rules;
 *  - the synthetic-data generator, by running the app's own seed code headless.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const S = require(path.join(ROOT, 'prototype', 'scoring.js'));
const BASE_RULES = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'scoring_rules.json'), 'utf8'));

function rulesWith(override) {
  if (!override || !override.thresholds) return BASE_RULES;
  const r = JSON.parse(JSON.stringify(BASE_RULES));
  r.thresholds = override.thresholds;
  r.version = BASE_RULES.version + '+server.' + (override.rev || 1);
  return r;
}

// Rebuild the scoring input from a stored assessment document.
function inputOf(a) {
  const items = {};
  const c = a.clinical || {}, ex = a.exposures || {};
  BASE_RULES.items.forEach((it) => {
    const v = it.kind === 'symptom' ? (c.symptoms || {})[it.id] : ex[it.id];
    items[it.id] = { s: (v && v.s) || 'unk', date: (v && v.date) || null };
  });
  return { onset_date: c.onset_date || null, assessed_at: a.assessed_at, items, deceased: !!c.deceased, clinician: a.clinician || {} };
}

// Server-authoritative score: replaces whatever the client sent.
function rescore(a, override) {
  const res = S.evaluate(inputOf(a), rulesWith(override));
  const changed = !a.result || a.result.category !== res.category || a.result.score !== res.score;
  return { result: res, changed };
}

// Run the app's own synthetic-data generator in a sandbox and return its collections.
function generateSynthetic() {
  const html = fs.readFileSync(path.join(ROOT, 'prototype', 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]).filter((s) => !s.startsWith('vendor/'));
  const noop = () => {};
  const docStub = { addEventListener: noop, querySelector: () => null, querySelectorAll: () => [], documentElement: {}, createElement: () => ({ style: {} }), body: { appendChild: noop } };
  const sandbox = { console, Date, Math, JSON, setTimeout, clearTimeout, URL, Blob: function () {}, crypto: crypto.webcrypto, navigator: {}, document: docStub, location: { protocol: 'file:' } };
  sandbox.localStorage = { getItem() { throw new Error('no storage'); }, setItem() { throw new Error('no storage'); } };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  scripts.forEach((src) => vm.runInContext(fs.readFileSync(path.join(ROOT, 'prototype', src), 'utf8'), sandbox, { filename: src }));
  const B = sandbox.BDBV;
  ['provinces', 'areas', 'facilities', 'villages'].forEach((k) => B.G[k].forEach((o) => { o.name = o.name_fr; }));
  sandbox.BDBVApp.seedDemo();
  const db = sandbox.BDBVApp.db();
  const out = {};
  ['assessments', 'reports', 'alerts', 'queue', 'contacts', 'samples', 'rumours'].forEach((k) => { out[k] = JSON.parse(JSON.stringify(db[k])); });
  return out;
}

module.exports = { S, BASE_RULES, rulesWith, rescore, inputOf, generateSynthetic };
