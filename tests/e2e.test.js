// End-to-end check of the prototype in headless Chromium.
// Run: node tests/e2e.test.js [screenshotDir]
const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');

(async () => {
  const shots = process.argv[2];
  const url = 'file://' + path.join(__dirname, '..', 'prototype', 'index.html');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  await page.goto(url);
  // Default interface language is English; switch to French for the FR checks below.
  assert.strictEqual(await page.inputValue('#lang'), 'en', 'English by default');
  assert.ok(/Health worker/.test(await page.textContent('#role')), 'role menu in English');
  await page.click('[data-tab="triage"]');
  assert.ok(/Traditional healer/.test(await page.textContent('[name=occ]')), 'occupation list in English');
  assert.ok(/North Kivu/.test(await page.textContent('[name=g_province]')), 'province names in English');
  await page.selectOption('#lang', 'fr');
  assert.ok(/Tradipraticien/.test(await page.textContent('[name=occ]')), 'occupation list in French');
  await page.reload();
  assert.strictEqual(await page.inputValue('#lang'), 'fr', 'language choice remembered');
  const snap = async n => { if (shots) await page.screenshot({ path: path.join(shots, n + '.png'), fullPage: true }); };

  // Demo data auto-seeded
  const counts = await page.evaluate(() => { const d = BDBVApp.db(); return [d.assessments.length, d.reports.length, d.alerts.length]; });
  assert.ok(counts[0] >= 100 && counts[1] > 0, 'demo seeded ' + counts);
  await snap('01-home');

  // Health worker: triage with fever + contact -> RED (F1 floor)
  await page.click('[data-tab="triage"]');
  await page.fill('[name=last]', 'Testeur'); await page.fill('[name=first]', 'Jean');
  await page.fill('[name=age]', '34'); await page.selectOption('[name=sex]', 'M');
  await page.selectOption('[name=g_village]', 'Z-RWA-A1-V1');
  await page.selectOption('[name=g_facility]', 'Z-RWA-A1-F');
  const today = new Date(); const onset = new Date(today - 2 * 86400000).toISOString().slice(0, 10);
  const expo = new Date(today - 9 * 86400000).toISOString().slice(0, 10);
  await page.fill('[name=onset]', onset);
  await page.click('[data-item=fever] .o-yes span');
  await page.click('[data-item=contact_case] .o-yes span');
  await page.fill('[name=d_contact_case]', expo);
  const liveTxt = await page.textContent('#live');
  assert.ok(/ROUGE/.test(liveTxt), 'live shows RED');
  assert.ok(/Contexte communautaire/.test(liveTxt), 'community context shown separately');
  await snap('02-triage-form');
  await page.click('#tf button[type=submit]');
  await page.waitForSelector('.sms');
  const res = await page.textContent('#view');
  assert.ok(/ROUGE/.test(res) && /Isoler immédiatement/.test(res), 'result RED with actions');
  await snap('03-result-red');

  // Alert acknowledgement
  await page.click('[data-tab="alerts"]');
  const ackBtn = await page.$('[data-ack]');
  const ackId = await ackBtn.getAttribute('data-ack');
  await page.check('input[data-act="' + ackId + '"][value=isolation]');
  await ackBtn.click();
  const acked = await page.evaluate(id => BDBVApp.db().alerts.find(a => a.id === id).ack, ackId);
  assert.ok(acked && acked.by, 'alert acknowledged');

  // GREEN patient
  await page.click('[data-tab="triage"]');
  await page.fill('[name=last]', 'Vert'); await page.fill('[name=first]', 'Marie');
  await page.fill('[name=age]', '22'); await page.selectOption('[name=sex]', 'F');
  await page.selectOption('[name=g_province]', 'P-NKV');
  await page.selectOption('[name=g_zone]', 'Z-BEN');
  await page.selectOption('[name=g_area]', 'Z-BEN-A1');
  await page.selectOption('[name=g_village]', 'Z-BEN-A1-V1');
  await page.selectOption('[name=g_facility]', 'Z-BEN-A1-F');
  await page.check('[name=onset_unk]');
  await page.click('[data-item=fever] .o-no span');
  await page.click('[data-item=headache] .o-yes span');
  await page.click('#tf button[type=submit]');
  await page.waitForSelector('.result');
  assert.ok(/VERT/.test(await page.textContent('.result')), 'GREEN result');

  // RECO role: offline report
  await page.selectOption('#role', 'reco');
  const tabs = await page.$$eval('#nav .tab', b => b.map(x => x.getAttribute('data-tab')));
  assert.deepStrictEqual(tabs, ['home', 'reco', 'myreports'], 'RECO has no clinical tabs');
  await page.uncheck('#net');
  await page.click('[data-tab="reco"]');
  await page.click('[data-inc="deaths_total"]'); await page.click('[data-inc="deaths_total"]');
  await page.click('[data-inc="deaths_unexplained"]');
  await page.click('#addev');
  await snap('04-reco-form');
  await page.click('#rf button[type=submit]');
  await page.waitForSelector('.card.ok');
  assert.ok(/hors ligne/.test(await page.textContent('.card.ok')), 'offline message');
  const pend = await page.textContent('#syncbtn');
  assert.ok(/[1-9]\d* en attente/.test(pend), 'pending count ' + pend);
  await page.check('#net');
  await page.click('#syncbtn');
  assert.ok(/\(0 en attente\)/.test(await page.textContent('#syncbtn')), 'synced');

  // Surveillance: verify the event, dashboard, rules
  await page.selectOption('#role', 'surveillant');
  await page.click('[data-tab="verify"]');
  await page.selectOption('[data-ver]', 'in_progress');
  await page.click('[data-tab="patients"]');
  assert.ok(!/Testeur/.test(await page.textContent('#view')), 'names hidden from surveillance');
  await page.click('[data-tab="dashboard"]');
  await page.waitForSelector('svg.map');
  const dash = await page.textContent('#view');
  assert.ok(/Personnes évaluées/.test(dash) && /Signal statistique/.test(dash), 'dashboard KPIs + early-warning signal');
  await snap('05-dashboard');
  await page.selectOption('[name=f_zone]', 'Z-RWA');
  assert.ok(/Rwampara/.test(await page.textContent('#view')), 'zone filter applied');
  await page.click('[data-tab="rules"]');
  await page.fill('#thr', '60'); await page.fill('#tha', '40'); await page.click('#thsave');
  assert.ok(/local\.1/.test(await page.textContent('#view')), 'threshold versioned');
  await page.click('[data-tab="audit"]');
  assert.ok(/rules_change/.test(await page.textContent('#view')), 'audit records rule change');

  // Policymaker: dashboard only; English
  await page.selectOption('#role', 'decideur');
  await page.selectOption('#lang', 'en');
  const tabs2 = await page.$$eval('#nav .tab', b => b.map(x => x.getAttribute('data-tab')));
  assert.deepStrictEqual(tabs2, ['home', 'dashboard']);
  await page.click('[data-tab="dashboard"]');
  assert.ok(/People assessed/.test(await page.textContent('#view')), 'English UI');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert.ok(!overflow, 'no horizontal scroll at phone width');
  assert.deepStrictEqual(errors, [], 'no JS errors: ' + errors.join(' | '));
  await browser.close();
  console.log('e2e: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
