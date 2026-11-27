'use strict';
/*
 * BDBV API (v1). Synthetic-data pilot.
 *
 *   GET  /api/v1/health                     liveness + data mode (no auth)
 *   POST /api/v1/auth/login                 {username, password} -> {token, user}
 *   GET  /api/v1/auth/me
 *   POST /api/v1/auth/signup                account request (no auth): pending until a system administrator approves it
 *   POST /api/v1/auth/forgot                password reset request (no auth): handled by a system administrator
 *   POST /api/v1/auth/change-password       {current, password}
 *   GET  /api/v1/admin/users · POST /api/v1/admin/users/:u/(approve|reject|active|reset-password)   system administrator
 *   POST /api/v1/sync                       offline-first sync: push changes, pull updates
 *   GET  /api/v1/records/:collection        list (scoped + redacted), ?since=ISO
 *   GET  /api/v1/records/:collection/:id
 *   POST /api/v1/identifiers                reveal names for authorised roles (reason logged)
 *   POST /api/v1/public/rumours             public rumour report (no auth, rate-limited)
 *   GET  /api/v1/config  · PUT /api/v1/config (system administrator)
 *   GET  /api/v1/audit                      HZ surveillance officer, system administrator
 *   GET  /api/v1/history/:collection/:id    previous versions (surveillance, sysadmin)
 * The offline app (prototype/) is served at / when SERVE_APP is not "false".
 */
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const P = require('./permissions');
const { sign, requireAuth, verifyPassword, hash, passwordProblem } = require('./auth');
const { rescore } = require('./shared');

const DATA_MODE = 'synthetic';

function rateLimiter(limit, windowMs) {
  const hits = new Map();
  return (req, res, next) => {
    const k = req.ip, now = Date.now();
    const h = (hits.get(k) || []).filter((t) => now - t < windowMs);
    if (h.length >= limit) return res.status(429).json({ error: 'rate_limited' });
    h.push(now); hits.set(k, h);
    if (hits.size > 10000) hits.clear();
    next();
  };
}

function createApp(pool, opts = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
  const origins = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

  // Security headers and CORS (only for configured origins, e.g. the GitHub Pages site).
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'X-BDBV-Data-Mode': DATA_MODE,
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" });
    if (req.secure || req.get('x-forwarded-proto') === 'https') res.set('Strict-Transport-Security', 'max-age=31536000');
    const o = req.get('origin');
    if (o && origins.includes(o)) {
      res.set({ 'Access-Control-Allow-Origin': o, 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS', 'Access-Control-Max-Age': '600' });
    }
    if (req.method === 'OPTIONS') return res.sendStatus(o && origins.includes(o) ? 204 : 403);
    next();
  });
  app.use(express.json({ limit: '5mb' }));

  const audit = (req, action, entity, id, detail, source) => pool.query(
    'INSERT INTO audit_log (username, role, action, entity, entity_id, detail, ip, source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [req.user ? req.user.username : 'public', req.user ? req.user.role : 'public', action, entity || null, id || null, detail ? String(detail).slice(0, 2000) : null, req.ip, source || 'server']);
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const auth = requireAuth(pool);
  const api = express.Router();

  api.get('/health', wrap(async (req, res) => {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', data_mode: DATA_MODE, version: require('../package.json').version, time: new Date().toISOString() });
  }));

  api.post('/auth/login', rateLimiter(+(process.env.LOGIN_RATE_LIMIT || 20), 60000), wrap(async (req, res) => {
    const u = await verifyPassword(pool, req.body.username, req.body.password);
    if (!u) { await audit({ ip: req.ip }, 'login_failed', 'user', String(req.body.username || '').slice(0, 64)); return res.status(401).json({ error: 'invalid_credentials' }); }
    // Correct password but the account is not usable: say why (the person already proved who they are).
    if (!u.active) { await audit({ ip: req.ip }, 'login_refused', 'user', u.username, u.status); return res.status(403).json({ error: u.status === 'pending' ? 'account_pending' : (u.status === 'rejected' ? 'account_rejected' : 'account_disabled') }); }
    req.user = u; await audit(req, 'login', 'user', u.username);
    res.json({ token: sign(u), user: { username: u.username, role: u.role, name: u.display_name, facility: u.facility, zone: u.zone, must_change_password: !!u.must_change_password }, data_mode: DATA_MODE });
  }));

  // ---- Account requests and passwords (no e-mail or SMS service yet: an administrator handles them) ----
  const REQUESTABLE = P.ROLES.filter((r) => r !== 'sysadmin');
  const txt = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
  const publicLimit = rateLimiter(+(process.env.ACCOUNT_RATE_LIMIT || 10), 3600000);
  api.post('/auth/signup', publicLimit, wrap(async (req, res) => {
    const b = req.body || {};
    const username = txt(b.username, 32).toLowerCase(), name = txt(b.name, 80), contact = txt(b.contact, 120), note = txt(b.workplace, 300), role = txt(b.role, 32);
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) return res.status(400).json({ error: 'invalid_username' });
    if (name.length < 2) return res.status(400).json({ error: 'name_required' });
    if (contact.length < 5) return res.status(400).json({ error: 'contact_required' });
    if (!REQUESTABLE.includes(role)) return res.status(400).json({ error: 'invalid_role' });
    const pp = passwordProblem(b.password, username); if (pp) return res.status(400).json({ error: pp });
    const r = await pool.query("INSERT INTO users (username, password_hash, role, display_name, active, status, contact, request_note) VALUES ($1,$2,$3,$4,false,'pending',$5,$6) ON CONFLICT (username) DO NOTHING RETURNING id",
      [username, await hash(String(b.password)), role, name, contact, note]);
    if (!r.rows.length) return res.status(409).json({ error: 'username_taken' });
    await audit({ ip: req.ip }, 'account_request', 'user', username, role + (note ? ' · ' + note : ''));
    res.status(201).json({ status: 'pending' });
  }));
  api.post('/auth/forgot', publicLimit, wrap(async (req, res) => {
    const username = txt(req.body && req.body.username, 32).toLowerCase(), contact = txt(req.body && req.body.contact, 120);
    const u = username ? (await pool.query('SELECT username FROM users WHERE username = $1', [username])).rows[0] : null;
    if (u) await pool.query('INSERT INTO password_reset_requests (username, contact, ip) VALUES ($1,$2,$3)', [u.username, contact, req.ip]);
    await audit({ ip: req.ip }, 'password_reset_request', 'user', username || '-', u ? 'recorded' : 'unknown username');
    res.status(202).json({ status: 'received' }); // same answer whether or not the account exists
  }));
  api.post('/auth/change-password', auth, wrap(async (req, res) => {
    const cur = await verifyPassword(pool, req.user.username, req.body && req.body.current);
    if (!cur) return res.status(401).json({ error: 'invalid_credentials' });
    const pw = String((req.body && req.body.password) || '');
    const pp = passwordProblem(pw, req.user.username); if (pp) return res.status(400).json({ error: pp });
    if (pw === String(req.body.current)) return res.status(400).json({ error: 'password_unchanged' });
    await pool.query('UPDATE users SET password_hash = $2, must_change_password = false, password_changed_at = now() WHERE username = $1', [req.user.username, await hash(pw)]);
    await audit(req, 'password_change', 'user', req.user.username);
    res.json({ status: 'changed' });
  }));

  // ---- User administration (system administrator) ----
  const adminOnly = (req, res, next) => (req.user.role === 'sysadmin' ? next() : res.status(403).json({ error: 'forbidden' }));
  api.get('/admin/users', auth, adminOnly, wrap(async (req, res) => {
    const users = (await pool.query('SELECT username, role, display_name, facility, zone, active, status, contact, request_note, must_change_password, created_at FROM users ORDER BY (status = \'pending\') DESC, created_at DESC')).rows;
    const resets = (await pool.query('SELECT id, username, contact, requested_at FROM password_reset_requests WHERE handled_at IS NULL ORDER BY requested_at DESC LIMIT 200')).rows;
    res.json({ users, resets, roles: P.ROLES });
  }));
  const target = async (req, res) => {
    const u = (await pool.query('SELECT * FROM users WHERE username = $1', [txt(req.params.u, 32)])).rows[0];
    if (!u) { res.status(404).json({ error: 'not_found' }); return null; }
    return u;
  };
  api.post('/admin/users/:u/approve', auth, adminOnly, wrap(async (req, res) => {
    const u = await target(req, res); if (!u) return;
    const b = req.body || {}, role = txt(b.role || u.role, 32);
    if (!P.ROLES.includes(role)) return res.status(400).json({ error: 'invalid_role' });
    const facility = txt(b.facility, 64) || null, zone = txt(b.zone, 64) || null;
    if (['soignant', 'clinician', 'facility_head'].includes(role) && !facility) return res.status(400).json({ error: 'facility_required' });
    if (['zone_officer', 'reco'].includes(role) && !zone) return res.status(400).json({ error: 'zone_required' });
    await pool.query("UPDATE users SET role = $2, facility = $3, zone = $4, active = true, status = 'active' WHERE username = $1", [u.username, role, facility, zone]);
    await audit(req, 'account_approve', 'user', u.username, role + ' ' + (facility || zone || ''));
    res.json({ status: 'active' });
  }));
  api.post('/admin/users/:u/reject', auth, adminOnly, wrap(async (req, res) => {
    const u = await target(req, res); if (!u) return;
    if (u.status !== 'pending') return res.status(400).json({ error: 'not_pending' });
    await pool.query("UPDATE users SET active = false, status = 'rejected' WHERE username = $1", [u.username]);
    await audit(req, 'account_reject', 'user', u.username);
    res.json({ status: 'rejected' });
  }));
  api.post('/admin/users/:u/active', auth, adminOnly, wrap(async (req, res) => {
    const u = await target(req, res); if (!u) return;
    const on = !!(req.body && req.body.active);
    if (u.username === req.user.username && !on) return res.status(400).json({ error: 'cannot_disable_self' });
    if (u.status === 'pending' || u.status === 'rejected') return res.status(400).json({ error: 'use_approve' });
    await pool.query('UPDATE users SET active = $2, status = $3 WHERE username = $1', [u.username, on, on ? 'active' : 'disabled']);
    await audit(req, on ? 'account_enable' : 'account_disable', 'user', u.username);
    res.json({ status: on ? 'active' : 'disabled' });
  }));
  api.post('/admin/users/:u/reset-password', auth, adminOnly, wrap(async (req, res) => {
    const u = await target(req, res); if (!u) return;
    const temp = crypto.randomBytes(6).toString('base64url') + '-' + crypto.randomInt(10, 99);
    await pool.query('UPDATE users SET password_hash = $2, must_change_password = true WHERE username = $1', [u.username, await hash(temp)]);
    await pool.query('UPDATE password_reset_requests SET handled_at = now(), handled_by = $2 WHERE username = $1 AND handled_at IS NULL', [u.username, req.user.username]);
    await audit(req, 'password_reset', 'user', u.username, 'temporary password issued');
    res.json({ temporary_password: temp }); // shown once to the administrator, never stored in clear
  }));
  api.get('/auth/me', auth, (req, res) => res.json({ username: req.user.username, role: req.user.role, name: req.user.display_name, facility: req.user.facility, zone: req.user.zone }));

  async function loadConfig() {
    const r = await pool.query("SELECT value FROM config WHERE key = 'app'");
    return r.rows[0] ? r.rows[0].value : {};
  }

  // Read records visible to the user (scoped in SQL, redacted in code).
  async function readRecords(user, collection, since) {
    if (!P.canRead(user, collection)) return [];
    const params = [collection];
    let sql = 'SELECT data, version, updated_at FROM records WHERE collection = $1 AND ' + P.scopeWhere(user, collection, params);
    if (since) { params.push(since); sql += ' AND updated_at > $' + params.length; }
    sql += ' ORDER BY updated_at';
    const r = await pool.query(sql, params);
    return r.rows.map((row) => Object.assign(P.redact(user, collection, row.data), { _v: row.version, synced: true }));
  }

  // Apply one incoming record inside a transaction. Returns {ok} or {error}.
  async function applyRecord(client, user, collection, rec, cfg) {
    if (!P.COLLECTIONS.includes(collection)) return { error: 'unknown_collection' };
    if (!rec || typeof rec.id !== 'string' || !/^[A-Za-z0-9._:-]{3,120}$/.test(rec.id)) return { error: 'invalid_id' };
    const cur = await client.query('SELECT data, version, owner FROM records WHERE collection = $1 AND id = $2 FOR UPDATE', [collection, rec.id]);
    const stored = cur.rows[0];
    if (!P.canWrite(user, collection, !stored)) return { error: 'forbidden' };
    if (stored && collection === 'reports' && user.role === 'reco' && stored.owner !== user.username) return { error: 'forbidden' };
    if (stored && rec._v != null && +rec._v !== stored.version) return { error: 'conflict', current: stored.version };
    if (stored && rec._v == null) return { error: 'conflict', current: stored.version };
    const data = Object.assign({}, rec); delete data._v; delete data.synced;
    // Redacted copies must never overwrite real personal data.
    if (stored && data.person && data.person.redacted) data.person = stored.data.person;
    if (stored && data.redacted && collection === 'contacts') ['first', 'last', 'phone', 'address'].forEach((k) => { data[k] = stored.data[k]; });
    delete data.redacted;
    const err = P.guard(user, collection, data, stored && stored.data);
    if (err) return { error: err };
    if (collection === 'assessments') {
      const rs = rescore(data, cfg.rules_override);
      if (rs.changed) data.result_note = 'score recomputed by server';
      data.result = rs.result;
    }
    let scope = P.scopeOf(collection, data);
    if ((collection === 'samples' || collection === 'contacts') && !scope.facility) {
      const caseId = collection === 'samples' ? data.case_id : (data.index_cases || [])[0];
      const c = caseId ? (await client.query("SELECT zone, facility FROM records WHERE collection = 'assessments' AND id = $1", [caseId])).rows[0] : null;
      if (c) scope = { zone: c.zone || scope.zone, facility: c.facility };
    }
    data.synthetic = true;
    if (stored) {
      await client.query('INSERT INTO record_history (collection, id, version, data, changed_by) VALUES ($1,$2,$3,$4,$5)', [collection, rec.id, stored.version, stored.data, user.username]);
      await client.query('UPDATE records SET data = $3, zone = $4, facility = $5, version = version + 1, updated_at = clock_timestamp(), updated_by = $6 WHERE collection = $1 AND id = $2', [collection, rec.id, data, scope.zone, scope.facility, user.username]);
    } else {
      await client.query('INSERT INTO records (collection, id, data, zone, facility, owner, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$6)', [collection, rec.id, data, scope.zone, scope.facility, user.username]);
    }
    return { ok: true, rescored: collection === 'assessments' && data.result_note ? true : undefined };
  }

  api.post('/sync', auth, wrap(async (req, res) => {
    const changes = req.body.changes || {}, since = req.body.since || null;
    if (since && isNaN(new Date(since))) return res.status(400).json({ error: 'invalid_since' });
    const cfg = await loadConfig();
    const accepted = {}, rejected = [];
    const order = ['assessments', 'reports', 'rumours', 'alerts', 'queue', 'contacts', 'samples', 'history'];
    const client = await pool.connect();
    try {
      for (const col of order) {
        for (const rec of (changes[col] || []).slice(0, 2000)) {
          await client.query('BEGIN');
          try {
            const r = await applyRecord(client, req.user, col, rec, cfg);
            if (r.ok) { await client.query('COMMIT'); (accepted[col] = accepted[col] || []).push(rec.id); }
            else { await client.query('ROLLBACK'); rejected.push({ collection: col, id: rec && rec.id, reason: r.error }); }
          } catch (e) { await client.query('ROLLBACK'); rejected.push({ collection: col, id: rec && rec.id, reason: 'server_error' }); console.error(e); }
        }
      }
    } finally { client.release(); }
    // Audit entries recorded on the device (who viewed/changed what offline).
    const clientAudit = Array.isArray(changes.audit) ? changes.audit.slice(0, 2000) : [];
    for (const a of clientAudit) await audit(req, String(a.action || '').slice(0, 64), a.entity, a.id, (a.at ? 'device_time=' + a.at + ' ' : '') + (a.detail || ''), 'client');
    const nAcc = Object.values(accepted).reduce((s, l) => s + l.length, 0);
    if (nAcc || rejected.length) await audit(req, 'sync_push', 'records', null, nAcc + ' accepted, ' + rejected.length + ' rejected' + (rejected.length ? ': ' + rejected.slice(0, 20).map((x) => x.collection + '/' + x.id + '=' + x.reason).join('; ') : ''));
    const serverTime = (await pool.query('SELECT clock_timestamp() AS t')).rows[0].t;
    const records = {};
    for (const col of P.COLLECTIONS) records[col] = await readRecords(req.user, col, since);
    const nPull = Object.values(records).reduce((s, l) => s + l.length, 0);
    if (P.SEE_NAMES.includes(req.user.role) && records.assessments.length) await audit(req, 'read_identifiable', 'assessments', null, records.assessments.length + ' record(s) pulled');
    await audit(req, 'sync_pull', 'records', null, nPull + ' record(s)' + (since ? ' since ' + new Date(since).toISOString() : ' (full)'));
    res.json({ accepted, rejected, records, config: cfg, server_time: serverTime, data_mode: DATA_MODE });
  }));

  api.get('/records/:collection', auth, wrap(async (req, res) => {
    const col = req.params.collection;
    if (!P.COLLECTIONS.includes(col)) return res.status(404).json({ error: 'unknown_collection' });
    if (!P.canRead(req.user, col)) return res.status(403).json({ error: 'forbidden' });
    const list = await readRecords(req.user, col, req.query.since || null);
    await audit(req, 'list', col, null, list.length + ' record(s)');
    res.json(list);
  }));
  api.get('/records/:collection/:id', auth, wrap(async (req, res) => {
    const col = req.params.collection;
    if (!P.COLLECTIONS.includes(col) || !P.canRead(req.user, col)) return res.status(403).json({ error: 'forbidden' });
    const params = [col, req.params.id];
    const r = await pool.query('SELECT data, version FROM records WHERE collection = $1 AND id = $2 AND ' + P.scopeWhere(req.user, col, params), params);
    if (!r.rows[0]) return res.status(404).json({ error: 'not_found' });
    await audit(req, 'view', col, req.params.id);
    res.json(Object.assign(P.redact(req.user, col, r.rows[0].data), { _v: r.rows[0].version }));
  }));

  // Surveillance roles may reveal identities for an investigation, with a logged reason.
  api.post('/identifiers', auth, wrap(async (req, res) => {
    if (!P.VERIFY.includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
    const reason = String(req.body.reason || '').trim(), col = req.body.collection, ids = (req.body.ids || []).slice(0, 5000);
    if (reason.length < 5) return res.status(400).json({ error: 'reason_required' });
    if (!['assessments', 'contacts'].includes(col)) return res.status(400).json({ error: 'unsupported_collection' });
    const params = [col, ids];
    const r = await pool.query('SELECT id, data FROM records WHERE collection = $1 AND id = ANY($2) AND ' + P.scopeWhere(req.user, col, params), params);
    const out = {};
    r.rows.forEach((row) => { const d = row.data; out[row.id] = col === 'assessments' ? { last: d.person.last, first: d.person.first, phone: d.person.phone } : { last: d.last, first: d.first, phone: d.phone, address: d.address }; });
    await audit(req, 'reveal_identifiers', col, null, Object.keys(out).length + ' record(s); reason: ' + reason);
    res.json(out);
  }));

  // Public rumour reporting: no account needed; becomes a rumour + an unverified alert.
  api.post('/public/rumours', rateLimiter(+(process.env.PUBLIC_RATE_LIMIT || 30), 3600000), wrap(async (req, res) => {
    const b = req.body || {}, s = (v, n) => String(v == null ? '' : v).slice(0, n);
    const desc = s(b.description, 2000).trim();
    if (!desc) return res.status(400).json({ error: 'description_required' });
    const geo = { province: s(b.geo && b.geo.province, 64), zone: s(b.geo && b.geo.zone, 64), area: s(b.geo && b.geo.area, 64), village: s(b.geo && b.geo.village, 64) };
    const id = 'RUM-' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    const anonymous = !!b.anonymous;
    const rumour = { id, type: s(b.type, 40) || 'other', geo, place_text: s(b.place_text, 200), date_occurred: s(b.date_occurred, 10), submitted_at: new Date().toISOString(), description: desc,
      n_people: Math.max(0, parseInt(b.n_people, 10) || 0), n_deaths: Math.max(0, parseInt(b.n_deaths, 10) || 0), anonymous, name: anonymous ? '' : s(b.name, 120), phone: anonymous ? '' : s(b.phone, 40),
      relationship: s(b.relationship, 40), attachment: b.attachment ? { name: s(b.attachment.name, 200), type: s(b.attachment.type, 80), size: +b.attachment.size || 0 } : null, synthetic: true };
    const alert = { id: 'ALT-' + id.slice(4), source: 'rumour', source_ref: id, type: rumour.type, category: null, submitted_at: rumour.submitted_at, reporter: { name: rumour.name, phone: rumour.phone, anonymous },
      geo, description: desc, info_source: 'public:' + rumour.relationship, supporting: rumour.attachment ? 'key:attachment ' + rumour.attachment.name : '', stages: {}, outcome: 'pending', findings: '', duplicate_of: '', linked: [],
      urgent: rumour.n_deaths > 1 || rumour.type === 'cluster', history: [{ at: rumour.submitted_at, by: 'public', action: 'submitted', note: '' }], place_text: rumour.place_text, synthetic: true };
    await pool.query('INSERT INTO records (collection, id, data, zone, owner, updated_by) VALUES ($1,$2,$3,$4,$5,$5), ($6,$7,$8,$4,$5,$5)', ['rumours', id, rumour, geo.zone || null, 'public', 'queue', alert.id, alert]);
    await audit({ ip: req.ip }, 'create', 'rumour', id, anonymous ? 'anonymous' : '');
    res.status(201).json({ id });
  }));

  api.get('/config', auth, wrap(async (req, res) => res.json(await loadConfig())));
  api.put('/config', auth, wrap(async (req, res) => {
    if (req.user.role !== 'sysadmin') return res.status(403).json({ error: 'forbidden' });
    const v = req.body || {}, allowed = ['tat', 'followup_days', 'home_care_permitted', 'home_care_ref', 'geo', 'rules_override'];
    const clean = {}; allowed.forEach((k) => { if (v[k] !== undefined) clean[k] = v[k]; });
    if (clean.home_care_permitted && String(clean.home_care_ref || '').trim().length < 3) return res.status(400).json({ error: 'protocol_reference_required' });
    await pool.query("INSERT INTO config (key, value, updated_by) VALUES ('app', $1, $2) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = now(), updated_by = $2", [clean, req.user.username]);
    await audit(req, 'config_update', 'config', 'app', JSON.stringify(clean).slice(0, 1500));
    res.json(clean);
  }));

  api.get('/audit', auth, wrap(async (req, res) => {
    if (!['zone_officer', 'sysadmin'].includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
    const limit = Math.min(+req.query.limit || 500, 5000);
    const r = await pool.query('SELECT seq, at, username, role, action, entity, entity_id, detail, source FROM audit_log ORDER BY seq DESC LIMIT $1', [limit]);
    res.json(r.rows);
  }));
  api.get('/history/:collection/:id', auth, wrap(async (req, res) => {
    if (!['surveillant', 'zone_officer', 'sysadmin'].includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
    const r = await pool.query('SELECT version, changed_at, changed_by FROM record_history WHERE collection = $1 AND id = $2 ORDER BY version', [req.params.collection, req.params.id]);
    await audit(req, 'view_history', req.params.collection, req.params.id);
    res.json(r.rows);
  }));

  app.use('/api/v1', api);
  // config.js for the app served by this API: marks it as a deployment, so the app never falls back
  // to demonstration accounts (it waits for the server instead).
  app.get('/config.js', (req, res) => {
    res.set('Content-Type', 'application/javascript; charset=utf-8').set('Cache-Control', 'no-cache');
    res.send('window.BDBV_CONFIG = ' + JSON.stringify({ apiUrl: '', server: true }) + ';\n');
  });
  if (opts.serveApp !== false && process.env.SERVE_APP !== 'false') {
    // The service worker and the page must never be cached by the browser, so updates reach users at once.
    app.use(express.static(path.join(__dirname, '..', '..', 'prototype'), { index: 'index.html', maxAge: '5m',
      setHeaders: (res, file) => { if (/(sw\.js|index\.html)$/.test(file)) res.setHeader('Cache-Control', 'no-cache'); } }));
  }
  app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'payload_too_large' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json' });
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  });
  return app;
}

module.exports = { createApp, DATA_MODE };
