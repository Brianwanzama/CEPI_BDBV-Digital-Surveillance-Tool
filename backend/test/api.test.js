'use strict';
// Backend API tests against a real PostgreSQL database.
// DATABASE_URL must point to a database whose name ends with "_test" (it is wiped).
//   DATABASE_URL=postgres://postgres:pw@localhost:5432/bdbv_test JWT_SECRET=... npm test
const test = require('node:test');
const assert = require('node:assert');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-0123456789-0123456789-0123';
process.env.SEED_USER_PASSWORD = 'Test-Password-1';
process.env.LOGIN_RATE_LIMIT = '1000';
process.env.PUBLIC_RATE_LIMIT = '3';
const { createPool, migrate } = require('../src/db');
const { createApp } = require('../src/app');
const { seedUsers, seedData, resetDemoPasswords } = require('../src/seed');

const url = process.env.DATABASE_URL || '';
if (!/_test(\?|$)/.test(url)) { console.error('Refusing to run: DATABASE_URL must point to a *_test database.'); process.exit(1); }

let pool, server, base;
const call = async (method, path, body, token) => {
  const r = await fetch(base + path, { method, headers: Object.assign({ 'content-type': 'application/json' }, token ? { authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined });
  let b = null; try { b = await r.json(); } catch (e) { /* empty */ }
  return { status: r.status, body: b, headers: r.headers };
};
const login = async (u) => (await call('POST', '/auth/login', { username: u, password: 'Test-Password-1' })).body.token;
const pull = async (token, since) => (await call('POST', '/sync', { since }, token)).body;
const push = async (token, changes) => (await call('POST', '/sync', { changes }, token)).body;
const T = {};

test.before(async () => {
  pool = createPool(url);
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await migrate(pool);
  await seedUsers(pool, () => {});
  await seedData(pool, () => {});
  server = createApp(pool, { serveApp: false }).listen(0);
  base = 'http://127.0.0.1:' + server.address().port + '/api/v1';
  for (const u of ['reco.aru', 'nurse.aru', 'clinician.aru', 'surveillance', 'lab', 'head.aru', 'zone.aru', 'admin.ph', 'sysadmin']) T[u] = await login(u);
});
test.after(async () => { server.close(); await pool.end(); });

test('health reports synthetic data mode', async () => {
  const r = await call('GET', '/health');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.data_mode, 'synthetic');
  assert.strictEqual(r.headers.get('x-bdbv-data-mode'), 'synthetic');
  assert.ok(r.headers.get('content-security-policy'));
});

test('authentication: wrong password, missing token, inactive account', async () => {
  assert.strictEqual((await call('POST', '/auth/login', { username: 'lab', password: 'nope' })).status, 401);
  assert.strictEqual((await call('POST', '/auth/login', { username: 'ghost', password: 'nope' })).status, 401);
  assert.strictEqual((await call('GET', '/records/assessments')).status, 401);
  assert.strictEqual((await call('GET', '/auth/me', null, 'garbage')).status, 401);
  const me = await call('GET', '/auth/me', null, T['nurse.aru']);
  assert.strictEqual(me.body.role, 'soignant');
  await pool.query("UPDATE users SET active = false WHERE username = 'head.aru'");
  assert.strictEqual((await call('GET', '/auth/me', null, T['head.aru'])).status, 401);
  await pool.query("UPDATE users SET active = true WHERE username = 'head.aru'");
});

test('scoping: facility, zone and ownership', async () => {
  const n = await pull(T['nurse.aru']);
  assert.ok(n.records.assessments.length > 0);
  assert.ok(n.records.assessments.every((a) => a.geo.facility === 'Z-aru-A1-F'));
  assert.strictEqual(n.records.rumours.length, 0);
  const z = await pull(T['zone.aru']);
  assert.ok(z.records.assessments.every((a) => a.geo.zone === 'Z-aru'));
  const r = await pull(T['reco.aru']);
  assert.strictEqual(r.records.assessments.length, 0);
  assert.ok(r.records.reports.length > 0 && r.records.reports.every((x) => x.reco_id === 'RECO-ARU1-001'));
  assert.strictEqual((await call('GET', '/records/assessments', null, T['reco.aru'])).status, 403);
  const s = await pull(T.surveillance);
  assert.ok(s.records.assessments.length > n.records.assessments.length);
});

test('redaction: names only for clinical staff of the facility', async () => {
  const n = await pull(T['nurse.aru']);
  assert.ok(n.records.assessments.some((a) => a.person.first && a.person.first.startsWith('Patient')));
  for (const u of ['surveillance', 'lab', 'admin.ph', 'zone.aru', 'head.aru']) {
    const p = await pull(T[u]);
    assert.ok(p.records.assessments.every((a) => !a.person.first && !a.person.last), u + ' must not see names');
  }
  const c = await pull(T['nurse.aru']);
  assert.ok(c.records.contacts.every((x) => !x.first && !x.phone), 'nurse does not see contact identities');
  const sv = await pull(T.surveillance);
  assert.ok(sv.records.contacts.some((x) => x.last && x.last.startsWith('DÉMO')), 'surveillance sees contact identities');
  assert.ok((await pull(T['admin.ph'])).records.rumours.every((x) => !x.phone));
});

test('server recomputes the triage score (client value is not trusted)', async () => {
  const sym = (s) => ({ s, date: null });
  const a = { id: 'BDB-TEST-0001', assessed_at: new Date().toISOString(), geo: { province: 'P-ituri', zone: 'Z-aru', area: 'Z-aru-A1', village: 'Z-aru-A1-V1', facility: 'Z-aru-A1-F' },
    person: { last: 'TEST', first: 'Score', age: '30', sex: 'F' }, clinical: { onset_date: new Date().toISOString().slice(0, 10), symptoms: { fever: sym('yes') } },
    exposures: { contact_case: { s: 'yes', date: new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10) } }, clinician: {},
    result: { score: 0, category: 'GREEN' }, classification: { status: 'suspected' }, care: { status: 'initial_assessment', history: [] }, lab: { status: 'none' } };
  const r = await push(T['nurse.aru'], { assessments: [a] });
  assert.deepStrictEqual(r.accepted.assessments, ['BDB-TEST-0001']);
  const row = (await pool.query("SELECT data, zone, facility FROM records WHERE id = 'BDB-TEST-0001'")).rows[0];
  assert.strictEqual(row.data.result.category, 'RED');
  assert.ok(row.data.result.floors_applied.includes('F1_CASE_DEFINITION'));
  assert.strictEqual(row.data.result_note, 'score recomputed by server');
  assert.strictEqual(row.facility, 'Z-aru-A1-F');
});

test('permissions on writes: wrong role, wrong owner, protected fields', async () => {
  const r1 = await push(T['reco.aru'], { assessments: [{ id: 'BDB-TEST-0002', geo: {} }] });
  assert.strictEqual(r1.rejected[0].reason, 'forbidden');
  const r2 = await push(T['admin.ph'], { queue: [{ id: 'ALT-TEST-0001', source: 'rumour', stages: {} }] });
  assert.strictEqual(r2.rejected[0].reason, 'forbidden');
  // nurse may not set a lab-only classification
  const cur = (await pull(T['nurse.aru'])).records.assessments.find((x) => x.id === 'BDB-TEST-0001');
  const r3 = await push(T['nurse.aru'], { assessments: [Object.assign({}, cur, { classification: { status: 'confirmed' } })] });
  assert.strictEqual(r3.rejected[0].reason, 'only_lab_can_set_lab_classification');
});

test('laboratory: only lab staff release results; confirmation follows release', async () => {
  const s = { id: 'SMP-TEST-0001', case_id: 'BDB-TEST-0001', type: 'whole_blood', collected_at: new Date().toISOString(), collection_place: 'CS Aru 1', collector: 'nurse', testing_site: { kind: 'external', name: 'Lab' }, status: 'collected', result: null, released_at: null, released_by: null, custody: [] };
  assert.deepStrictEqual((await push(T['nurse.aru'], { samples: [s] })).accepted.samples, ['SMP-TEST-0001']);
  const pulled = (await pull(T['nurse.aru'])).records.samples.find((x) => x.id === 'SMP-TEST-0001');
  const bad = await push(T['nurse.aru'], { samples: [Object.assign({}, pulled, { status: 'result_released', result: 'positive', released_at: new Date().toISOString(), released_by: 'nurse' })] });
  assert.strictEqual(bad.rejected[0].reason, 'only_lab_can_release_results');
  const forLab = (await pull(T.lab)).records;
  const ls = forLab.samples.find((x) => x.id === 'SMP-TEST-0001'), la = forLab.assessments.find((x) => x.id === 'BDB-TEST-0001');
  assert.ok(la.person.redacted, 'lab sees no names');
  const ok = await push(T.lab, { samples: [Object.assign({}, ls, { status: 'result_released', result: 'positive', released_at: new Date().toISOString(), released_by: 'lab' })], assessments: [Object.assign({}, la, { classification: { status: 'confirmed', by: 'lab' }, lab: { status: 'pos' } })] });
  assert.deepStrictEqual(ok.rejected, []);
  const row = (await pool.query("SELECT data FROM records WHERE id = 'BDB-TEST-0001'")).rows[0].data;
  assert.strictEqual(row.classification.status, 'confirmed');
  assert.strictEqual(row.person.first, 'Score', 'redacted copy from lab did not erase the name');
  const lab2 = (await pull(T.lab)).records.assessments.find((x) => x.id === 'BDB-TEST-0001');
  const sneaky = await push(T.lab, { assessments: [Object.assign({}, lab2, { care: { status: 'discharged' } })] });
  assert.match(sneaky.rejected[0].reason, /^lab_may_only_change_lab_fields/);
});

test('verification workflow: only surveillance roles move alert stages', async () => {
  const q = (await pull(T['reco.aru'])).records.queue[0];
  const r1 = await push(T['reco.aru'], { queue: [Object.assign({}, q, { stages: { acknowledged: { at: new Date().toISOString(), by: 'reco' } } })] });
  assert.strictEqual(r1.rejected[0].reason, 'forbidden', 'RECO has no update right on alerts');
  const sq = (await pull(T.surveillance)).records.queue.find((x) => x.id === q.id);
  const r2 = await push(T.surveillance, { queue: [Object.assign({}, sq, { stages: Object.assign({}, sq.stages, { acknowledged: { at: new Date().toISOString(), by: 'surveillance' } }) })] });
  assert.deepStrictEqual(r2.rejected, []);
});

test('optimistic concurrency: stale versions are rejected, history kept', async () => {
  const a = (await pull(T.surveillance)).records.queue.find((x) => x.source === 'rumour');
  const first = await push(T.surveillance, { queue: [Object.assign({}, a, { findings: 'edit 1' })] });
  assert.deepStrictEqual(first.rejected, []);
  const stale = await push(T['zone.aru'], { queue: [Object.assign({}, a, { findings: 'edit 2 (stale)' })] });
  assert.ok(stale.rejected[0] && ['conflict', 'forbidden'].includes(stale.rejected[0].reason));
  const again = await push(T.surveillance, { queue: [Object.assign({}, a, { findings: 'edit 3 (stale)' })] });
  assert.strictEqual(again.rejected[0].reason, 'conflict');
  const h = await call('GET', '/history/queue/' + a.id, null, T.surveillance);
  assert.ok(h.body.length >= 1);
});

test('incremental sync returns only changes since the last pull', async () => {
  const p1 = await pull(T.surveillance);
  const p2 = await pull(T.surveillance, p1.server_time);
  assert.strictEqual(Object.values(p2.records).reduce((s, l) => s + l.length, 0), 0);
});

test('public rumour: no account, becomes unverified alert, rate-limited', async () => {
  const r = await call('POST', '/public/rumours', { type: 'death_unexplained', description: 'Décès soudain', geo: { zone: 'Z-aru' }, n_deaths: 2, anonymous: true, phone: '+243 000' });
  assert.strictEqual(r.status, 201);
  const row = (await pool.query("SELECT data FROM records WHERE collection = 'queue' AND data->>'source_ref' = $1", [r.body.id])).rows[0].data;
  assert.deepStrictEqual(row.stages, {}); assert.strictEqual(row.outcome, 'pending'); assert.strictEqual(row.urgent, true);
  assert.strictEqual(row.reporter.phone, '', 'anonymous report keeps no phone');
  assert.strictEqual((await call('POST', '/public/rumours', { description: '' })).status, 400);
  await call('POST', '/public/rumours', { description: 'x' });
  assert.strictEqual((await call('POST', '/public/rumours', { description: 'y' })).status, 429);
});

test('identifiers: surveillance may reveal names only with a reason (audited)', async () => {
  assert.strictEqual((await call('POST', '/identifiers', { collection: 'assessments', ids: ['BDB-TEST-0001'], reason: 'x' }, T.surveillance)).status, 400);
  assert.strictEqual((await call('POST', '/identifiers', { collection: 'assessments', ids: ['BDB-TEST-0001'], reason: 'Investigation du cas' }, T['admin.ph'])).status, 403);
  const r = await call('POST', '/identifiers', { collection: 'assessments', ids: ['BDB-TEST-0001'], reason: 'Investigation du cas' }, T.surveillance);
  assert.strictEqual(r.body['BDB-TEST-0001'].first, 'Score');
  const a = await pool.query("SELECT 1 FROM audit_log WHERE action = 'reveal_identifiers' AND detail LIKE '%Investigation du cas%'");
  assert.strictEqual(a.rows.length, 1);
});

test('configuration: system administrator only; home care needs a protocol reference', async () => {
  assert.strictEqual((await call('PUT', '/config', { followup_days: 21 }, T.surveillance)).status, 403);
  assert.strictEqual((await call('PUT', '/config', { home_care_permitted: true }, T.sysadmin)).status, 400);
  const ok = await call('PUT', '/config', { home_care_permitted: true, home_care_ref: 'PNLFHV test', tat: { ack: 30, start: 240, complete: 1440, approve: 720 } }, T.sysadmin);
  assert.strictEqual(ok.status, 200);
  assert.strictEqual((await pull(T['nurse.aru'])).config.tat.ack, 30);
});

test('audit log: written for logins, reads and writes; append-only in the database', async () => {
  const r = await call('GET', '/audit?limit=2000', null, T.sysadmin);
  const actions = new Set(r.body.map((x) => x.action));
  ['login', 'login_failed', 'sync_pull', 'sync_push', 'read_identifiable', 'config_update'].forEach((a) => assert.ok(actions.has(a), 'audit has ' + a));
  assert.strictEqual((await call('GET', '/audit', null, T['nurse.aru'])).status, 403);
  await assert.rejects(pool.query('UPDATE audit_log SET detail = $1', ['tampered']), /append-only/);
  await assert.rejects(pool.query('DELETE FROM audit_log'), /append-only/);
  await assert.rejects(pool.query('TRUNCATE audit_log'), /append-only/);
});

test('input validation: bad ids, unknown collections, oversized and malformed bodies', async () => {
  const r = await push(T['nurse.aru'], { assessments: [{ id: 'bad id with spaces' }], users: [{ id: 'x' }] });
  assert.strictEqual(r.rejected[0].reason, 'invalid_id');
  assert.strictEqual((await call('GET', '/records/users', null, T.surveillance)).status, 404);
  const big = await fetch(base + '/sync', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + T.surveillance }, body: '{"x":"' + 'a'.repeat(6 * 1024 * 1024) + '"}' });
  assert.strictEqual(big.status, 413);
  const bad = await fetch(base + '/sync', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + T.surveillance }, body: '{oops' });
  assert.strictEqual(bad.status, 400);
});

test('historical data: counts only, surveillance and administrators import, batches cannot be edited', async () => {
  const batch = { id: 'HIS-TEST-0001', kind: 'weekly', label: 'Sitreps 2025 (synthetic)', source: 'test', file: 'x.csv', uploaded_at: new Date().toISOString(), uploaded_by: 'surveillance', period: ['2025-03-03', '2025-03-10'], totals: [5, 0, 1, 1, 0, 0], rows: [['2025-03-03', 'P-ituri', 'Z-aru', 'CD540904', 4, 0, 1, 1, 0, 0], ['2025-03-10', 'P-ituri', '', '', 1, 0, 0, 0, 0, 0]], deleted: false, geo: {} };
  assert.strictEqual((await push(T['reco.aru'], { history: [batch] })).rejected[0].reason, 'forbidden');
  assert.strictEqual((await push(T['nurse.aru'], { history: [batch] })).rejected[0].reason, 'forbidden');
  const withNames = Object.assign({}, batch, { id: 'HIS-TEST-0002', names: ['KAHINDO Jean'] });
  assert.match((await push(T['surveillance'], { history: [withNames] })).rejected[0].reason, /^history_unexpected_fields/);
  const badRow = Object.assign({}, batch, { id: 'HIS-TEST-0003', rows: [['2025-03-03', 'P-ituri', 'Z-aru', '', 'KAHINDO', 0, 0, 0, 0, 0]] });
  assert.strictEqual((await push(T['surveillance'], { history: [badRow] })).rejected[0].reason, 'history_row_count');
  const ok = await push(T['surveillance'], { history: [batch] });
  assert.strictEqual(ok.rejected.length, 0, JSON.stringify(ok.rejected));
  // zone officer and administrator see it (aggregated, all zones); clinical staff do not
  assert.ok((await pull(T['zone.aru'])).records.history.some((b) => b.id === 'HIS-TEST-0001'));
  assert.ok((await pull(T['admin.ph'])).records.history.some((b) => b.id === 'HIS-TEST-0001'));
  assert.ok(!((await pull(T['nurse.aru'])).records.history || []).length);
  // a batch is withdrawn, never edited
  const cur = (await pull(T['surveillance'])).records.history.find((b) => b.id === 'HIS-TEST-0001');
  const edited = Object.assign({}, cur, { rows: [['2025-03-03', 'P-ituri', 'Z-aru', '', 99, 0, 0, 0, 0, 0]] });
  assert.strictEqual((await push(T['admin.ph'], { history: [edited] })).rejected[0].reason, 'history_rows_are_locked');
  const withdrawn = Object.assign({}, cur, { deleted: true, deleted_at: new Date().toISOString(), deleted_by: 'admin.ph' });
  assert.strictEqual((await push(T['admin.ph'], { history: [withdrawn] })).rejected.length, 0);
});

test('demo passwords can be reset from the environment (lost first-start passwords)', async () => {
  await assert.rejects(resetDemoPasswords(pool, 'short', () => {}));
  assert.strictEqual(await resetDemoPasswords(pool, 'New-Demo-Pass-9', () => {}), 9);
  assert.strictEqual((await call('POST', '/auth/login', { username: 'lab', password: 'Test-Password-1' })).status, 401);
  assert.strictEqual((await call('POST', '/auth/login', { username: 'lab', password: 'New-Demo-Pass-9' })).status, 200);
  assert.ok((await pool.query("SELECT 1 FROM audit_log WHERE action = 'reset_demo_passwords'")).rows.length);
  await resetDemoPasswords(pool, 'Test-Password-1', () => {});
});

test('accounts: request, approval, rejection, forgotten password, temporary password must be changed', async () => {
  // request an account (no sign-in)
  assert.strictEqual((await call('POST', '/auth/signup', { username: 'Bad Name', password: 'abcdefgh12', name: 'X', contact: '+243 000', role: 'lab' })).body.error, 'invalid_username');
  assert.strictEqual((await call('POST', '/auth/signup', { username: 'new.nurse', password: 'short1', name: 'New Nurse', contact: '+243 81 000 0000', role: 'soignant' })).body.error, 'password_too_short');
  assert.strictEqual((await call('POST', '/auth/signup', { username: 'new.nurse', password: 'Good-pass-123', name: 'New Nurse', contact: '+243 81 000 0000', role: 'sysadmin' })).body.error, 'invalid_role');
  const s = await call('POST', '/auth/signup', { username: 'new.nurse', password: 'Good-pass-123', name: 'New Nurse', contact: '+243 81 000 0000', role: 'soignant', workplace: 'CS Aru 1' });
  assert.strictEqual(s.status, 201);
  assert.strictEqual((await call('POST', '/auth/signup', { username: 'new.nurse', password: 'Good-pass-123', name: 'Other', contact: '+243 81 000 0001', role: 'lab' })).status, 409);
  // pending: correct password, refused with a clear reason; wrong password stays generic
  assert.strictEqual((await call('POST', '/auth/login', { username: 'new.nurse', password: 'Good-pass-123' })).body.error, 'account_pending');
  assert.strictEqual((await call('POST', '/auth/login', { username: 'new.nurse', password: 'wrong-pass-1' })).body.error, 'invalid_credentials');
  // only the system administrator manages accounts
  assert.strictEqual((await call('GET', '/admin/users', null, T['surveillance'])).status, 403);
  const list = await call('GET', '/admin/users', null, T['sysadmin']);
  assert.ok(list.body.users.find((u) => u.username === 'new.nurse' && u.status === 'pending' && !('password_hash' in u)));
  assert.strictEqual((await call('POST', '/admin/users/new.nurse/approve', { role: 'soignant' }, T['sysadmin'])).body.error, 'facility_required');
  assert.strictEqual((await call('POST', '/admin/users/new.nurse/approve', { role: 'soignant', facility: 'Z-aru-A1-F', zone: 'Z-aru' }, T['sysadmin'])).status, 200);
  const login = await call('POST', '/auth/login', { username: 'new.nurse', password: 'Good-pass-123' });
  assert.strictEqual(login.status, 200); assert.strictEqual(login.body.user.role, 'soignant');
  // rejection
  await call('POST', '/auth/signup', { username: 'spam.user', password: 'Good-pass-456', name: 'Spam', contact: 'x@example.org', role: 'decideur' });
  assert.strictEqual((await call('POST', '/admin/users/spam.user/reject', {}, T['sysadmin'])).status, 200);
  assert.strictEqual((await call('POST', '/auth/login', { username: 'spam.user', password: 'Good-pass-456' })).body.error, 'account_rejected');
  // forgotten password: same answer for unknown users; administrator issues a temporary password
  assert.strictEqual((await call('POST', '/auth/forgot', { username: 'nobody.here', contact: '1' })).status, 202);
  assert.strictEqual((await call('POST', '/auth/forgot', { username: 'new.nurse', contact: '+243 81 000 0000' })).status, 202);
  assert.ok((await call('GET', '/admin/users', null, T['sysadmin'])).body.resets.some((r) => r.username === 'new.nurse'));
  const temp = (await call('POST', '/admin/users/new.nurse/reset-password', {}, T['sysadmin'])).body.temporary_password;
  assert.ok(temp && temp.length >= 8);
  assert.ok(!(await call('GET', '/admin/users', null, T['sysadmin'])).body.resets.some((r) => r.username === 'new.nurse'), 'request marked handled');
  const tl = await call('POST', '/auth/login', { username: 'new.nurse', password: temp });
  assert.strictEqual(tl.body.user.must_change_password, true);
  assert.strictEqual((await call('POST', '/sync', {}, tl.body.token)).body.error, 'password_change_required', 'nothing else until the password is changed');
  assert.strictEqual((await call('POST', '/auth/change-password', { current: temp, password: 'short' }, tl.body.token)).body.error, 'password_too_short');
  assert.strictEqual((await call('POST', '/auth/change-password', { current: temp, password: 'Brand-new-pass-77' }, tl.body.token)).status, 200);
  assert.strictEqual((await call('POST', '/sync', {}, tl.body.token)).status, 200);
  // disable / enable; the administrator cannot disable their own account
  assert.strictEqual((await call('POST', '/admin/users/sysadmin/active', { active: false }, T['sysadmin'])).body.error, 'cannot_disable_self');
  await call('POST', '/admin/users/new.nurse/active', { active: false }, T['sysadmin']);
  assert.strictEqual((await call('POST', '/auth/login', { username: 'new.nurse', password: 'Brand-new-pass-77' })).body.error, 'account_disabled');
  assert.ok((await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE action IN ('account_request','account_approve','account_reject','password_reset','password_change','account_disable')")).rows[0].n >= 6);
});
