// Phase 1 checks on a running server, on an emulated phone (Pixel 7):
// refresh keeps the session and the screen; typed text is kept as a draft and survives a reload and
// the 30-second update; temperature starts from 37.0; real accounts are offered for assignment;
// the 30-minute lock and an expired session keep the work; unsent records are kept for their author
// when someone signs out; errors reach the administrator; AI suggestions (mock provider) appear as
// suggestions only.
//   BASE_URL=http://localhost:8080 DEMO_PASSWORD=... (server started with AI_PROVIDER=mock) node tests/e2e_phase1.test.js
const { chromium, devices } = require('playwright');
const assert = require('assert');

const BASE = (process.env.BASE_URL || 'http://localhost:8080').replace(/\/$/, ''), API = BASE + '/api/v1';
const PW = process.env.DEMO_PASSWORD; if (!PW) { console.error('Set DEMO_PASSWORD.'); process.exit(1); }
const call = async (m, p, b, t) => { const r = await fetch(API + p, { method: m, headers: Object.assign({ 'content-type': 'application/json' }, t ? { authorization: 'Bearer ' + t } : {}), body: b ? JSON.stringify(b) : undefined }); return { s: r.status, b: await r.json().catch(() => ({})) }; };
let n = 0; const ok = (m) => { n++; console.log('ok -', m); };
const TAG = Date.now().toString(36).toUpperCase();

(async () => {
  const admin = (await call('POST', '/auth/login', { username: 'sysadmin', password: PW })).b.token;
  const cfg = (await call('GET', '/config', null, admin)).b;
  assert.strictEqual((await call('PUT', '/config', Object.assign({}, cfg, { ai_enabled: true }), admin)).s, 200);

  const browser = await chromium.launch();
  const errors = [];
  const phone = async (who) => {
    const c = await browser.newContext(devices['Pixel 7']); const p = await c.newPage();
    p.on('pageerror', (e) => { if (!/phase1-test-error/.test(e.message)) errors.push(who + ': ' + e.message); });
    await p.goto(BASE + '/'); await p.waitForSelector('#loginform');
    await p.fill('#login-user', who); await p.fill('#login-pass', PW); await p.click('#loginform button[type=submit]');
    await p.waitForFunction(() => !!BDBV.server.lastSync(), null, { timeout: 30000 });
    return { c, p };
  };

  // 1. Nurse: a refresh keeps the session, the screen and what was typed; temperature starts at 37.0
  const { c: nc, p: nurse } = await phone('nurse.aru');
  await nurse.click('[data-tab="triage"]');
  await nurse.fill('[name=last]', 'DRAFT' + TAG); await nurse.fill('[name=age]', '30');
  await nurse.focus('[name=temp]'); await nurse.keyboard.press('ArrowUp');
  assert.strictEqual(+(await nurse.inputValue('[name=temp]')), 37, 'temperature starts from 37.0, not 0.1');
  await nurse.waitForTimeout(800);
  await nurse.reload(); await nurse.waitForSelector('[name=last]', { timeout: 15000 });
  const after = await nurse.evaluate(() => ({ login: !!document.querySelector('#loginform'), tab: BDBV.st.tab, auth: BDBV.st.auth && BDBV.st.auth.mode, last: document.querySelector('[name=last]').value, temp: document.querySelector('[name=temp]').value }));
  assert.deepStrictEqual([after.login, after.tab, after.auth, after.last, +after.temp], [false, 'triage', 'server', 'DRAFT' + TAG, 37]);
  await nurse.waitForFunction(() => BDBV.server.available === true, null, { timeout: 15000 });
  const t0 = await nurse.evaluate(() => BDBV.server.lastSync());
  await nurse.waitForFunction((t) => BDBV.server.lastSync() !== t, t0, { timeout: 45000 });
  ok('nurse refreshes on a phone: still signed in, same screen, typed text restored, updates keep coming; temperature starts at 37.0');

  // 2. Surveillance: text typed in an open alert survives the 30-second update and a reload
  const rum = (await call('POST', '/public/rumours', { type: 'death_unexplained', description: 'Deux personnes sont mortes apres une fievre et des saignements ' + TAG, geo: { zone: 'Z-aru', area: 'Z-aru-A1', village: 'Z-aru-A1-V1' }, n_people: 3, n_deaths: 2, anonymous: true })).b.id;
  assert.ok(rum, 'public report accepted');
  const { c: sc, p: surv } = await phone('surveillance');
  await surv.click('[data-tab="verify"]');
  const alertId = await surv.evaluate((r) => { const a = BDBVApp.db().queue.find((q) => q.source_ref === r); return a && a.id; }, rum);
  assert.ok(alertId, 'the report is in the queue');
  await surv.selectOption('#qf-src', 'rumour'); await surv.selectOption('#qf-b', 'to_ack');
  await surv.click('[data-qopen="' + alertId + '"]');
  await surv.fill('#qlink', 'KEEP-' + TAG); await surv.evaluate(() => document.activeElement.blur());
  await call('POST', '/public/rumours', { type: 'sick_compatible', description: 'Un malade avec fievre ' + TAG, geo: { zone: 'Z-aru' }, anonymous: true });
  await surv.waitForFunction(() => BDBV.st.pendingRedraw === true, null, { timeout: 60000 });
  assert.strictEqual(await surv.inputValue('#qlink'), 'KEEP-' + TAG, 'not wiped by the update');
  assert.match(await surv.textContent('#liveind'), /new information/);
  await surv.waitForTimeout(600);
  await surv.reload(); await surv.waitForSelector('#qf-src', { timeout: 15000 });
  assert.strictEqual(await surv.evaluate(() => BDBV.st.tab), 'verify');
  await surv.selectOption('#qf-src', 'rumour'); await surv.selectOption('#qf-b', 'to_ack');
  await surv.click('[data-qopen="' + alertId + '"]');
  await surv.waitForFunction((v) => document.querySelector('#qlink') && document.querySelector('#qlink').value === v, 'KEEP-' + TAG, { timeout: 5000 });
  ok('surveillance: text typed in an open alert is kept through the 30-second update ("new information: show") and a reload');

  // 3. Rule priority and AI suggestion (mock provider), shown apart from the report and the findings
  await surv.waitForFunction((id) => BDBVApp.db().ai && BDBVApp.db().ai[id], alertId, { timeout: 60000 });
  const closePanel = async () => { if (await surv.isVisible('#qsheet')) await surv.click('#qsheetclose'); }; // on a phone the details panel fills the screen
  await closePanel();
  await surv.click('[data-qopen="' + alertId + '"]');
  await surv.waitForSelector('#qdetail .aibox');
  const box = await surv.textContent('#qdetail');
  assert.match(box, /Priority by the rules/); assert.match(box, /AI suggestion/); assert.match(box, /does not confirm a case/);
  assert.ok(await surv.$('#qdetail .prio.p-high'), 'rules: high (deaths reported)');
  await surv.click('[data-aifb="useful"]');
  await surv.waitForFunction((id) => BDBVApp.db().ai[id].feedback === 'useful', alertId);
  ok('rule-based priority with reasons and the AI suggestion (summary, duplicates, questions) shown as a suggestion only; feedback recorded');

  // 4. Assignment offers real accounts, with instructions
  await surv.click('#qdetail [data-step="acknowledged"]');
  await closePanel(); await surv.selectOption('#qf-b', 'all');
  await surv.click('[data-qopen="' + alertId + '"]');
  const opts = await surv.$$eval('#qto option', (o) => o.map((x) => x.value));
  assert.ok(opts.includes('zone.aru') && opts.includes('surveillance'), 'accounts offered: ' + opts.join(','));
  await surv.selectOption('#qto', 'zone.aru'); await surv.fill('#qtonote', 'Call the chief of Aru 1 first');
  await surv.click('#qdetail [data-step="assigned"]');
  const st = await surv.evaluate((id) => BDBVApp.db().queue.find((q) => q.id === id).stages.assigned, alertId);
  assert.deepStrictEqual([st.to_user, st.to_role, st.instructions], ['zone.aru', 'zone_officer', 'Call the chief of Aru 1 first']);
  ok('assignment lists the surveillance accounts covering the zone and records the account, role and instructions');

  // 5. Lock after inactivity (simulated) and an expired session keep the work
  await surv.evaluate(() => BDBV.lockNow());
  await surv.waitForSelector('#lock');
  assert.ok(await surv.evaluate(() => getComputedStyle(document.getElementById('view')).visibility === 'hidden'), 'screen content hidden');
  await surv.fill('#lockpw', 'wrong-password'); await surv.click('#lockform button[type=submit]');
  await surv.waitForSelector('#lockmsg:not([hidden])');
  await surv.fill('#lockpw', PW); await surv.click('#lockform button[type=submit]');
  await surv.waitForSelector('#lock', { state: 'detached' });
  await surv.evaluate(() => { const s = JSON.parse(localStorage.getItem('bdbv_server_session')); s.token = 'expired.token.value'; localStorage.setItem('bdbv_server_session', JSON.stringify(s)); });
  await surv.reload();
  await surv.waitForSelector('#lock', { timeout: 20000 });
  assert.match(await surv.textContent('#lockwhy'), /session has ended/);
  await surv.fill('#lockpw', PW); await surv.click('#lockform button[type=submit]');
  await surv.waitForSelector('#lock', { state: 'detached' });
  const s2 = await surv.evaluate(() => BDBV.server.lastSync());
  await surv.waitForFunction((t) => !BDBV.server.expired() && BDBV.server.lastSync() !== t, s2, { timeout: 45000 });
  ok('lock after inactivity: content hidden, wrong password refused, unlocked with the account password; an expired session asks for the password and resumes without losing data');

  // 6. Unsent records stay on the device for their author after sign-out, and are sent at the next sign-in
  await nc.setOffline(true);
  await nurse.evaluate(() => { BDBV.st.online = false; });
  await nurse.fill('[name=last]', 'PARK' + TAG); await nurse.fill('[name=first]', 'Kept'); await nurse.fill('[name=age]', '41'); await nurse.selectOption('[name=sex]', 'M');
  await nurse.selectOption('[name=g_village]', 'Z-aru-A1-V1'); await nurse.check('[name=onset_unk]');
  await nurse.click('[data-item=fever] .o-yes span');
  await nurse.click('#tf button[type=submit]'); await nurse.waitForSelector('.result');
  const parkedId = await nurse.evaluate(() => BDBVApp.state.lastId);
  await nurse.click('#authbtn'); await nurse.click('#askyes');
  await nurse.waitForSelector('#loginform');
  assert.ok(await nurse.evaluate(() => !!localStorage.getItem('bdbv_parked:nurse.aru')), 'kept on the device');
  await nc.setOffline(false);
  await nurse.fill('#login-user', 'nurse.aru'); await nurse.fill('#login-pass', PW); await nurse.click('#loginform button[type=submit]');
  await nurse.waitForFunction((id) => { const a = BDBVApp.db().assessments.find((x) => x.id === id); return a && a.synced === true; }, parkedId, { timeout: 30000 });
  ok('records saved offline stay on the device after sign-out and are sent when the same person signs in again');

  // 7. Errors on phones reach the administrator
  await surv.evaluate(() => setTimeout(() => { throw new Error('phase1-test-error ' + Date.now()); }, 0));
  await surv.waitForTimeout(6000);
  const audit = (await call('GET', '/audit?limit=200', null, admin)).b;
  assert.ok(audit.some((r) => r.action === 'client_error' && /phase1-test-error/.test(r.detail)), 'client error in the audit log');
  ok('a JavaScript error on a phone is recorded in the audit log for the administrator');

  await call('PUT', '/config', cfg, admin); // AI back to its previous setting
  assert.deepStrictEqual(errors, [], errors.join(' | '));
  ok('no unexpected JavaScript errors');
  await browser.close();
  console.log('\ne2e phase 1: ' + n + ' checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
