// Multi-person data flow on a running server, with accounts created the way real users create
// them (Request an account -> approval by the system administrator). Nobody presses Sync and no
// page is reloaded: each person keeps their screen open and the information must arrive.
//   BASE_URL=http://localhost:8080 DEMO_PASSWORD=<sysadmin password> node tests/e2e_flow.test.js
const { chromium } = require('playwright');
const assert = require('assert');

const BASE = (process.env.BASE_URL || 'http://localhost:8080').replace(/\/$/, ''), API = BASE + '/api/v1';
const ADMIN_PW = process.env.DEMO_PASSWORD; if (!ADMIN_PW) { console.error('Set DEMO_PASSWORD (sysadmin password).'); process.exit(1); }
const TAG = Date.now().toString(36), PW = 'Flow-test-' + TAG + '9';
const call = async (m, p, b, t) => { const r = await fetch(API + p, { method: m, headers: Object.assign({ 'content-type': 'application/json' }, t ? { authorization: 'Bearer ' + t } : {}), body: b ? JSON.stringify(b) : undefined }); return { s: r.status, b: await r.json().catch(() => ({})) }; };
let n = 0; const ok = (m) => { n++; console.log('ok -', m); };
const WAIT = 75000; // live refresh is every 30 s

(async () => {
  const admin = (await call('POST', '/auth/login', { username: 'sysadmin', password: ADMIN_PW })).b.token;
  assert.ok(admin, 'sysadmin signs in');
  const people = { nurse: ['soignant', { facility: 'Z-aru-A1-F', zone: 'Z-aru' }], clin: ['clinician', { facility: 'Z-aru-A1-F', zone: 'Z-aru' }], surv: ['surveillant', {}], zone: ['zone_officer', { zone: 'Z-aru' }], lab: ['lab', {}], mgr: ['lab_manager', {}], reco: ['reco', { zone: 'Z-aru' }] };
  const U = {};
  for (const k of Object.keys(people)) {
    U[k] = 'flow.' + k + '.' + TAG;
    assert.strictEqual((await call('POST', '/auth/signup', { username: U[k], password: PW, name: 'Flow ' + k, contact: '+256 700 000 000', role: people[k][0], workplace: 'flow test' })).s, 201);
    assert.strictEqual((await call('POST', '/admin/users/' + U[k] + '/approve', Object.assign({ role: people[k][0] }, people[k][1]), admin)).s, 200);
  }
  ok('seven accounts requested and approved (nurse, clinician, surveillance, zone officer, lab, lab manager, RECO)');

  const browser = await chromium.launch();
  const errors = [];
  const open = async (k, tab) => {
    const c = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const p = await c.newPage();
    p.on('pageerror', (e) => errors.push(k + ': ' + e.message));
    await p.goto(BASE + '/'); await p.waitForSelector('#loginform');
    await p.fill('#login-user', U[k]); await p.fill('#login-pass', PW); await p.click('#loginform button[type=submit]');
    await p.waitForFunction(() => !!BDBV.server.lastSync(), null, { timeout: 30000 });
    if (tab) await p.click('[data-tab="' + tab + '"]');
    return p;
  };
  const clin = await open('clin', 'alerts');
  const surv = await open('surv', 'verify');
  const zone = await open('zone', 'verify');
  const nurse = await open('nurse', 'triage');

  // 1. Nurse: high-risk patient
  await nurse.fill('[name=last]', 'FLOW' + TAG.toUpperCase()); await nurse.fill('[name=first]', 'Patient'); await nurse.fill('[name=age]', '33'); await nurse.selectOption('[name=sex]', 'F');
  await nurse.selectOption('[name=g_village]', 'Z-aru-A1-V1'); await nurse.check('[name=onset_unk]');
  await nurse.click('[data-item=fever] .o-yes span'); await nurse.click('[data-item=contact_case] .o-yes span');
  await nurse.click('#tf button[type=submit]'); await nurse.waitForSelector('.result');
  const caseId = await nurse.evaluate(() => BDBVApp.state.lastId);
  await nurse.waitForFunction((id) => BDBVApp.db().assessments.find((a) => a.id === id).synced === true, caseId, { timeout: 15000 });
  ok('nurse saves a high-risk patient; it is sent to the server without pressing Sync');
  await clin.waitForFunction((id) => document.querySelector('#view').textContent.includes(id), caseId, { timeout: WAIT });
  ok('clinician\'s open Alerts screen shows the new high-risk alert');
  await surv.waitForFunction((id) => BDBVApp.db().queue.some((q) => q.source_ref === id), caseId, { timeout: WAIT });
  await zone.waitForFunction((id) => BDBVApp.db().queue.some((q) => q.source_ref === id), caseId, { timeout: WAIT });
  ok('surveillance officer and zone officer receive it in the verification queue');

  // 2. Clinician requests a test; lab records the sample and enters the result; manager approves
  await clin.click('[data-tab="lab"]'); await clin.fill('[name=rcase]', caseId); await clin.click('#lreq button[type=submit]');
  const lab = await open('lab', 'lab');
  await lab.waitForFunction((id) => BDBVApp.db().samples.some((s) => s.case_id === id && s.status === 'requested'), caseId, { timeout: WAIT });
  ok('laboratory receives the clinician\'s test request, linked to the case');
  const sid = await lab.evaluate((id) => BDBVApp.db().samples.find((s) => s.case_id === id).id, caseId);
  await lab.waitForSelector('tr[data-sopen="' + sid + '"]', { timeout: WAIT }); await lab.click('tr[data-sopen="' + sid + '"]');
  await lab.fill('[name=lid]', 'FLOW-' + TAG); await lab.selectOption('[name=ltype]', 'whole_blood');
  await lab.check('[name=lkind][value=external]'); await lab.selectOption('[name=lref]', { index: 1 });
  await lab.click('#lcoll button[type=submit]'); await lab.click('#lrecv');
  await lab.selectOption('[name=rres]', 'positive'); await lab.click('#lres button[type=submit]'); await lab.click('#askyes');
  const mgr = await open('mgr', 'lab');
  await mgr.waitForFunction((id) => BDBVApp.db().samples.some((s) => s.id === id && s.status === 'result_entered'), sid, { timeout: WAIT });
  ok('laboratory manager receives the entered result for approval (tester = lab account)');
  await mgr.waitForSelector('tr[data-sopen="' + sid + '"]', { timeout: WAIT }); await mgr.click('tr[data-sopen="' + sid + '"]');
  await mgr.click('#lappr'); await mgr.click('#askyes');
  await clin.waitForFunction((id) => BDBVApp.db().samples.some((s) => s.id === id && s.status === 'result_released') && BDBVApp.db().assessments.some((a) => a.classification && a.classification.status === 'confirmed' && BDBVApp.db().samples.some((s) => s.id === id && s.case_id === a.id)), sid, { timeout: WAIT });
  ok('clinician receives the approved result and the case is confirmed');

  // 3. RECO report reaches surveillance
  const reco = await open('reco', 'reco');
  await reco.click('[data-inc="deaths_total"]'); await reco.click('#rf button[type=submit]'); await reco.waitForSelector('.card.ok');
  const rid = await reco.evaluate(() => BDBVApp.db().reports[0].id);
  await surv.waitForFunction((id) => BDBVApp.db().queue.some((q) => q.source_ref === id), rid, { timeout: WAIT });
  ok('RECO report reaches the surveillance queue without anyone pressing Sync');

  // 4. Surveillance acknowledges; the zone officer sees the step
  await surv.click('[data-tab="verify"]');
  const qid = await surv.evaluate((id) => BDBVApp.db().queue.find((q) => q.source_ref === id).id, caseId);
  await surv.click('[data-qopen="' + qid + '"]'); await surv.click('[data-step="acknowledged"]');
  await zone.waitForFunction((q) => { const x = BDBVApp.db().queue.find((y) => y.id === q); return x && x.stages && x.stages.acknowledged; }, qid, { timeout: WAIT });
  ok('acknowledgement by one surveillance officer is seen by the zone officer');

  assert.deepStrictEqual(errors, [], errors.join(' | '));
  ok('no JavaScript errors');
  await browser.close();
  console.log('\ne2e flow: ' + n + ' checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
