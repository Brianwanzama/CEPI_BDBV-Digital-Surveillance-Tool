'use strict';
/*
 * Demo accounts (one per role) and synthetic data.
 * Run: npm run seed   (or automatically at start when SEED_DEMO=true and the database is empty)
 *
 * Passwords: SEED_USER_PASSWORD if set (same for all demo accounts), otherwise a random
 * password per account, printed ONCE to the log when the account is created.
 */
const crypto = require('crypto');
const { hash } = require('./auth');
const P = require('./permissions');
const { generateSynthetic } = require('./shared');

const USERS = [
  ['reco.aru', 'reco', 'RECO Aru 1 (démo)', null, 'Z-aru'],
  ['nurse.aru', 'soignant', 'Infirmier·e CS Aru 1 (démo)', 'Z-aru-A1-F', 'Z-aru'],
  ['clinician.aru', 'clinician', 'Clinicien·ne CS Aru 1 (démo)', 'Z-aru-A1-F', 'Z-aru'],
  ['surveillance', 'surveillant', 'Officier·e de surveillance (démo)', null, null],
  ['lab', 'lab', 'Laboratoire provincial (démo)', null, null],
  ['head.aru', 'facility_head', 'Chef·fe de FOSA CS Aru 1 (démo)', 'Z-aru-A1-F', 'Z-aru'],
  ['zone.aru', 'zone_officer', 'Surveillant·e ZS Aru (démo)', null, 'Z-aru'],
  ['admin.ph', 'decideur', 'Administrateur·rice santé publique (démo)', null, null],
  ['sysadmin', 'sysadmin', 'Administrateur·rice système (démo)', null, null]
];

async function seedUsers(pool, log = console.log) {
  const created = [];
  for (const [username, role, name, facility, zone] of USERS) {
    const exists = await pool.query('SELECT 1 FROM users WHERE username = $1', [username]);
    if (exists.rows.length) continue;
    const pw = process.env.SEED_USER_PASSWORD || crypto.randomBytes(9).toString('base64url');
    await pool.query('INSERT INTO users (username, password_hash, role, display_name, facility, zone) VALUES ($1,$2,$3,$4,$5,$6)', [username, await hash(pw), role, name, facility, zone]);
    created.push([username, role, process.env.SEED_USER_PASSWORD ? '(SEED_USER_PASSWORD)' : pw]);
  }
  if (created.length) {
    log('Demo accounts created (synthetic-data pilot):');
    created.forEach((c) => log('  ' + c[0].padEnd(14) + c[1].padEnd(14) + c[2]));
  }
  return created;
}

async function seedData(pool, log = console.log) {
  const has = await pool.query('SELECT count(*)::int AS n FROM records');
  if (has.rows[0].n > 0) { log('Records already present: synthetic data not loaded.'); return 0; }
  const data = generateSynthetic();
  const cases = {};
  data.assessments.forEach((a) => { cases[a.id] = { zone: a.geo.zone, facility: a.geo.facility }; });
  const ownerOf = (col, d) => {
    if (col === 'reports') return d.reco_id === 'RECO-ARU1-001' ? 'reco.aru' : 'reco.demo';
    if (col === 'rumours') return 'public';
    if (col === 'queue') {
      if (d.source === 'reco') { const r = data.reports.find((x) => x.id === d.source_ref); return r && r.reco_id === 'RECO-ARU1-001' ? 'reco.aru' : 'reco.demo'; }
      return d.source === 'rumour' ? 'public' : 'nurse.demo';
    }
    return 'nurse.demo';
  };
  let n = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const col of P.COLLECTIONS) {
      for (const d of data[col]) {
        let sc = P.scopeOf(col, d);
        if (col === 'samples' || col === 'contacts') { const c = cases[col === 'samples' ? d.case_id : (d.index_cases || [])[0]]; if (c) sc = c; }
        const doc = Object.assign({}, d, { synthetic: true }); delete doc.synced;
        await client.query('INSERT INTO records (collection, id, data, zone, facility, owner, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING', [col, d.id, doc, sc.zone, sc.facility, ownerOf(col, d), 'seed']);
        n++;
      }
    }
    await client.query("INSERT INTO audit_log (username, role, action, entity, detail) VALUES ('seed', 'system', 'seed_synthetic', 'records', $1)", [n + ' synthetic record(s)']);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  log('Synthetic data loaded: ' + n + ' record(s).');
  return n;
}

module.exports = { seedUsers, seedData, USERS };

if (require.main === module) {
  const { createPool, migrate, waitForDb } = require('./db');
  (async () => {
    const pool = createPool(process.env.DATABASE_URL);
    await waitForDb(pool); await migrate(pool);
    await seedUsers(pool); await seedData(pool);
    await pool.end();
  })().catch((e) => { console.error(e); process.exit(1); });
}
