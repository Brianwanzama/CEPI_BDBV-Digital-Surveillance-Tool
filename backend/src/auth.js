'use strict';
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
// Valid hash of a random value, used when the username does not exist (similar timing).
const DUMMY_HASH = bcrypt.hashSync(require('crypto').randomBytes(16).toString('hex'), 10);

function secret() {
  const s = process.env.JWT_SECRET || '';
  if (s.length < 32) throw new Error('JWT_SECRET must be set (at least 32 characters)');
  return s;
}

function sign(user) {
  return jwt.sign({ sub: user.username, role: user.role, facility: user.facility || null, zone: user.zone || null, name: user.display_name },
    secret(), { expiresIn: process.env.TOKEN_TTL || '12h', issuer: 'bdbv-api' });
}

// Express middleware: requires a valid bearer token; sets req.user.
function requireAuth(pool) {
  return async (req, res, next) => {
    const h = req.get('authorization') || '';
    const m = /^Bearer (.+)$/.exec(h);
    if (!m) return res.status(401).json({ error: 'auth_required' });
    let claims;
    try { claims = jwt.verify(m[1], secret(), { issuer: 'bdbv-api' }); } catch (e) { return res.status(401).json({ error: 'invalid_token' }); }
    // Re-check the account on every request so a deactivated user loses access at once.
    const r = await pool.query('SELECT username, role, display_name, facility, zone, active FROM users WHERE username = $1', [claims.sub]);
    const u = r.rows[0];
    if (!u || !u.active) return res.status(401).json({ error: 'account_inactive' });
    req.user = u;
    next();
  };
}

async function verifyPassword(pool, username, password) {
  const r = await pool.query('SELECT * FROM users WHERE username = $1', [String(username || '')]);
  const u = r.rows[0];
  // Compare against a dummy hash when the user does not exist, to keep timing similar.
  const ok = await bcrypt.compare(String(password || ''), u ? u.password_hash : DUMMY_HASH);
  return ok && u && u.active ? u : null;
}

const hash = (pw) => bcrypt.hash(pw, 10);

module.exports = { sign, requireAuth, verifyPassword, hash, secret };
