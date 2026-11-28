// Copies config/scoring_rules.json into prototype/rules.js so the prototype
// works from file:// and offline (no fetch). Run: node tools/build_rules.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const rules = JSON.parse(fs.readFileSync(path.join(root, 'config/scoring_rules.json'), 'utf8'));
const out = '/* GENERATED from config/scoring_rules.json by tools/build_rules.js - do not edit */\n' +
  'window.BDBV_RULES = ' + JSON.stringify(rules, null, 1) + ';\n';
fs.writeFileSync(path.join(root, 'prototype/rules.js'), out);
console.log('prototype/rules.js written (rule set ' + rules.version + ', ' + rules.items.length + ' items)');
