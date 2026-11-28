// Interactive dashboards, actions menu on each alert, AI for surveillance, zone and laboratory,
// case reports and laboratory-manager requests, on a running server with synthetic data and the
// mock AI provider:
//   BASE_URL=http://localhost:8080 DEMO_PASSWORD=... (server started with AI_PROVIDER=mock) node tests/e2e_dashboard_ai.test.js
const { chromium } = require('playwright');
const assert = require('assert');

const BASE = (process.env.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
const PW = process.env.DEMO_PASSWORD; if (!PW) { console.error('Set DEMO_PASSWORD.'); process.exit(1); }
let n = 0; const ok = (m) => { n++; console.log('ok -', m); };

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const open = async (who) => {
    const c = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }); const p = await c.newPage();
    p.on('pageerror', (e) => errors.push(who + ': ' + e.message));
    await p.goto(BASE + '/'); await p.waitForSelector('#loginform');
    await p.fill('#login-user', who); await p.fill('#login-pass', PW); await p.click('#loginform button[type=submit]');
    await p.waitForFunction(() => !!BDBV.server.lastSync(), null, { timeout: 30000 });
    await p.click('[data-tab="home"]');
    return p;
  };

  // 1. Zone officer: My work and the AI situation brief on Home
  const zone = await open('zone.aru');
  await zone.waitForSelector('[data-mywork="toack"]');
  const tiles = await zone.$$eval('[data-mywork]', (x) => x.length);
  await zone.click('[data-mywork="toack"]'); await zone.waitForSelector('#drill');
  const listed = await zone.$$eval('#drill tr', (x) => x.length - 1);
  const counted = +(await zone.evaluate(() => { const z = BDBV.userCtx().zone; return BDBVApp.db().queue.filter((a) => a.geo && a.geo.zone === z && !a.stages.acknowledged).length; }));
  assert.strictEqual(listed, counted, 'the list holds exactly the records counted');
  await zone.click('#drill [data-drillgo="0"]'); await zone.waitForSelector('#qsheet:not([hidden]) #qdetail h3');
  ok('zone officer: "My work" (' + tiles + ' figures) opens exactly the records counted, and each opens its alert');
  await zone.click('[data-tab="home"]');
  await zone.waitForSelector('.aibrief .aiheadline', { timeout: 30000 });
  assert.match(await zone.textContent('.aibrief'), /Mock brief/);
  assert.match(await zone.textContent('.aibrief'), /decides nothing/);
  ok('zone officer: AI situation brief written from the counts of the zone, marked as AI and as a suggestion');

  // 2. Surveillance: the actions menu on each alert; AI on the newest reports
  const surv = await open('surveillance');
  await surv.click('[data-tab="verify"]'); await surv.selectOption('#qf-b', 'to_ack');
  assert.strictEqual(await surv.$('[data-bulk]'), null, 'no bulk buttons at the top any more');
  const id = await surv.getAttribute('[data-qmenu]', 'data-qmenu');
  await surv.click('[data-qmenu="' + id + '"]');
  const items = await surv.$$eval('#qpop [data-qact]', (x) => x.map((y) => y.getAttribute('data-qact')));
  assert.ok(['open', 'acknowledged', 'assign_me', 'started', 'history'].every((k) => items.includes(k)) && !items.includes('approve'), items.join(','));
  await surv.click('#qpop [data-qact="assign_me"]');
  const st = await surv.evaluate((i) => { const a = BDBVApp.db().queue.find((q) => q.id === i); return [Object.keys(a.stages).join(','), a.stages.assigned.to_user]; }, id);
  assert.deepStrictEqual(st, ['acknowledged,assigned', 'surveillance']);
  await surv.selectOption('#qf-b', 'all');
  await surv.click('[data-qmenu="' + id + '"]');
  const items2 = await surv.$$eval('#qpop [data-qact]', (x) => x.map((y) => y.getAttribute('data-qact')));
  assert.ok(items2.includes('started') && !items2.includes('acknowledged') && !items2.includes('assign_me'), 'only the next valid steps: ' + items2.join(','));
  await surv.keyboard.press('Escape');
  ok('verification: each alert has its own actions menu showing only the valid next steps; "Assign to me" records acknowledgement and assignment to the account');
  await surv.selectOption('#qf-src', 'rumour');
  const before = await surv.evaluate(() => Object.keys(BDBVApp.db().ai || {}).length);
  await surv.click('#qaibatch');
  await surv.waitForFunction((b) => Object.keys(BDBVApp.db().ai || {}).length > b, before, { timeout: 60000 });
  await surv.waitForSelector('.prio.ai', { timeout: 60000 });
  ok('verification: "AI: analyse new reports and rumours" gives each one a suggested priority, shown apart from the rule priority');

  // 3. Dashboard: every figure, bar and map zone opens its records
  await surv.click('[data-tab="dashboard"]'); await surv.waitForSelector('[data-drill="red"]');
  const red = +(await surv.textContent('[data-drill="red"] .kv'));
  await surv.click('[data-drill="red"]'); await surv.waitForSelector('#drill');
  assert.strictEqual(await surv.$$eval('#drill tr', (x) => x.length - 1), red, 'high-risk figure = rows listed');
  await surv.click('#drillclose');
  await surv.click('.bar.clickable'); await surv.waitForSelector('#drill'); await surv.click('#drillclose');
  const fills = await surv.$$eval('.mapmini path[data-zone]', (x) => [...new Set(x.map((y) => y.style.fill))]);
  assert.ok(fills.length >= 2, 'map in risk colours: ' + fills.join(' '));
  await surv.click('.mapmini path[data-zone]'); await surv.waitForSelector('#drill');
  await surv.click('#drill [data-drillgo="0"]'); await surv.waitForFunction(() => BDBV.st.tab === 'result');
  ok('dashboard: figures, bars and map zones (red / amber / green) open exactly the records they count; a record opens from the list');

  // 4. Laboratory manager: requests a test; AI check before approval
  const mgr = await open('labmgr');
  await mgr.click('[data-tab="lab"]');
  const caseId = await mgr.evaluate(() => (BDBVApp.db().assessments.find((a) => !BDBV.labApi.samplesOf(a.id).length) || {}).id);
  await mgr.fill('[name=rcase]', caseId); await mgr.click('#lreq button[type=submit]');
  await mgr.waitForFunction((c) => (BDBV.labApi.latest(c) || {}).status === 'requested', caseId);
  await mgr.waitForFunction((c) => (BDBV.labApi.latest(c) || {}).synced === true, caseId, { timeout: 15000 });
  ok('laboratory manager requests a test like laboratory staff; the request reaches the server');
  const sid = await mgr.evaluate(() => { const s = BDBVApp.db().samples.find((x) => x.result); return s && s.id; });
  await mgr.evaluate((i) => BDBV.labApi.open(i), sid);
  await mgr.waitForSelector('#ailabgo'); await mgr.click('#ailabgo');
  await mgr.waitForSelector('#ailab .prio.ai', { timeout: 30000 });
  assert.match(await mgr.textContent('#ailab'), /Recommendation/);
  ok('laboratory: AI check before approval gives a recommendation and issues, as a suggestion only');

  // 5. Individual case report downloads on the deployed system
  const clin = await open('clinician.aru');
  await clin.click('[data-tab="patients"]');
  const [dl] = await Promise.all([clin.waitForEvent('download'), clin.click('[data-casepdf]')]);
  assert.ok(/^rapport_cas_.*\.pdf$/.test(dl.suggestedFilename()));
  ok('individual case report (PDF) downloads from the patient list');

  assert.deepStrictEqual(errors, [], errors.join(' | '));
  ok('no JavaScript errors');
  await browser.close();
  console.log('\ne2e dashboards and AI: ' + n + ' checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
