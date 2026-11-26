// End-to-end test of the app against a running server (docker compose or node).
//   BASE_URL=http://localhost:8080 DEMO_PASSWORD=... node tests/e2e_server.test.js
const { chromium } = require('playwright');
const fs = require('fs');
const assert = require('assert');

const BASE = (process.env.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
const PW = process.env.DEMO_PASSWORD;
if (!PW) { console.error('Set DEMO_PASSWORD (the SEED_USER_PASSWORD of the server).'); process.exit(1); }

const apiLogin = async (u) => (await (await fetch(BASE + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u, password: PW }) })).json()).token;
const apiPull = async (token) => (await (await fetch(BASE + '/api/v1/sync', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: '{}' })).json()).records;

const TAG = 'SRV' + Date.now().toString(36).toUpperCase(); // unique per run (the server keeps data)

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Refused to/.test(m.text())) errors.push('CSP: ' + m.text()); });
  let n = 0; const ok = (m) => { n++; console.log('ok -', m); };
  const signIn = async (u) => {
    if (!(await page.$('#loginform'))) { await page.click('#authbtn'); }
    await page.waitForSelector('#loginform');
    await page.fill('#login-user', u); await page.fill('#login-pass', PW); await page.click('#loginform button[type=submit]');
    await page.waitForFunction(() => /Déconnexion|Se déconnecter|Sign out/.test(document.querySelector('#authbtn').textContent));
    await page.waitForFunction(() => !!BDBV.server.lastSync()); // first full sync finished
  };
  const signOut = async () => { await page.click('#authbtn'); const yes = await page.$('#askyes'); if (yes) await yes.click(); await page.waitForSelector('#loginform'); };

  await page.goto(BASE + '/');
  await page.waitForSelector('#loginform');
  assert.strictEqual(await page.$$eval('[data-demo]', (b) => b.length), 0, 'no demo accounts when a server is connected');
  ok('app served by the API; server detected; password sign-in shown');

  // Public report goes straight to the server (no account)
  await page.click('#go-public');
  await page.click('input[name=ptype][value=cluster]', { force: true });
  await page.selectOption('[name=p_zone]', 'Z-aru');
  await page.fill('[name=pdesc]', 'Test serveur : trois malades dans la même maison');
  await page.check('[name=panon]');
  await page.click('#pf button[type=submit]');
  await page.waitForSelector('.card.ok');
  const rumId = (await page.textContent('.card.ok code')).trim();
  const sv = await apiLogin('surveillance');
  assert.ok((await apiPull(sv)).rumours.some((r) => r.id === rumId), 'rumour stored on server');
  ok('public rumour stored on the server: ' + rumId);

  // Nurse: role from the account, own facility, names visible; new triage synced and rescored
  await signIn('nurse.aru');
  assert.strictEqual(await page.evaluate(() => BDBVApp.state.role), 'soignant', 'role taken from the account'); assert.ok(/Agent de santé/.test(await page.textContent('#who')));
  assert.ok(/Serveur pilote/i.test(await page.textContent('#banner')));
  const facs = await page.evaluate(() => [...new Set(BDBVApp.db().assessments.map((a) => a.geo.facility))]);
  assert.deepStrictEqual(facs, ['Z-aru-A1-F']);
  await page.click('[data-tab="triage"]');
  await page.fill('[name=last]', TAG); await page.fill('[name=first]', 'Test');
  await page.fill('[name=age]', '41'); await page.selectOption('[name=sex]', 'M');
  await page.selectOption('[name=g_village]', 'Z-aru-A1-V2');
  await page.check('[name=onset_unk]');
  await page.click('[data-item=fever] .o-yes span');
  await page.click('[data-item=contact_case] .o-yes span');
  await page.click('#tf button[type=submit]');
  await page.waitForSelector('.result');
  const newId = await page.evaluate(() => BDBVApp.state.lastId);
  await page.click('#syncbtn');
  await page.waitForFunction((id) => BDBVApp.db().assessments.find((a) => a.id === id).synced === true, newId);
  const onServer = (await apiPull(sv)).assessments.find((a) => a.id === newId);
  assert.ok(onServer, 'assessment on server'); assert.strictEqual(onServer.result.category, 'RED');
  assert.ok(!onServer.person.first, 'surveillance gets it without the name');
  ok('nurse signed in (role from account, own facility only), triage synced, server category RED');
  await signOut();

  // Surveillance: no names; verifies the public rumour; reveals identifiers with a reason
  await signIn('surveillance');
  await page.click('[data-tab="patients"]');
  assert.ok(!new RegExp(TAG).test(await page.textContent('#view')), 'no names for surveillance');
  await page.click('[data-tab="verify"]');
  await page.selectOption('#qf-src', 'rumour'); await page.selectOption('#qf-b', 'to_ack');
  const alertId = await page.evaluate((rid) => BDBV.queue.byRef(rid).id, rumId);
  await page.click('[data-qopen]:has-text("' + alertId + '")');
  await page.click('[data-step="acknowledged"]');
  await page.click('#syncbtn');
  await page.waitForFunction((rid) => BDBV.queue.byRef(rid).synced === true, rumId);
  const q = (await apiPull(sv)).queue.find((x) => x.id === alertId);
  assert.ok(q.stages.acknowledged, 'acknowledgement stored on server');
  ok('surveillance sees no names; rumour acknowledged and synced to the server');
  await page.click('[data-tab="reports"]');
  await page.selectOption('#rtype', 'cases');
  await page.fill('#rfrom', new Date(Date.now() - 864e5).toISOString().slice(0, 10)); await page.dispatchEvent('#rfrom', 'change');
  await page.check('#rid'); await page.fill('#rreason', 'Investigation du cas (test serveur)'); await page.dispatchEvent('#rreason', 'change'); await page.check('#rid');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-fmt="csv"]')]);
  assert.ok(new RegExp(TAG + ' Test').test(fs.readFileSync(await dl.path(), 'utf8')), 'names fetched from server for the export');
  assert.ok(!(await page.evaluate(() => BDBVApp.db().assessments.some((a) => a.person.last && a.person.last.indexOf('SRV') === 0))), 'names not stored on the device');
  const sys = await apiLogin('sysadmin');
  const audit = await (await fetch(BASE + '/api/v1/audit?limit=500', { headers: { authorization: 'Bearer ' + sys } })).json();
  assert.ok(audit.some((a) => a.action === 'reveal_identifiers' && /test serveur/.test(a.detail)));
  ok('identifier export: names fetched from server only, reason in server audit log');
  await page.uncheck('#rid'); await page.selectOption('#rtype', 'daily');
  for (const fmt of ['xlsx', 'pdf']) {
    const [d] = await Promise.all([page.waitForEvent('download'), page.click('[data-fmt="' + fmt + '"]')]);
    assert.ok(fs.statSync(await d.path()).size > 1000, fmt + ' produced');
  }
  ok('Excel and PDF export work under the server content-security policy');
  await signOut();

  assert.deepStrictEqual(errors, [], errors.join(' | '));
  ok('no JavaScript or Content-Security-Policy errors');
  await browser.close();
  console.log('\ne2e server: ' + n + ' checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
