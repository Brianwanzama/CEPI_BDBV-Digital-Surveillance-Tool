'use strict';
/* AI support on the server (Claude API): community reports and rumours for surveillance staff,
 * situation briefs from counts, and a check of laboratory results before approval.
 * Instructions, answer formats and what is sent are shared with the app (prototype/ai-prompts.js).
 *
 * Suggestions only: they never change a record, confirm or rule out a case, or close an alert.
 * Available when the server has a provider (ANTHROPIC_API_KEY, or AI_PROVIDER=mock for tests).
 * For the testing phase it is on as soon as a key is present; the system administrator can switch
 * it off in Configuration (ai_enabled = false). Reporter names and phone numbers are never sent.
 */
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const SH = require(path.join(__dirname, '..', '..', 'prototype', 'ai-prompts.js'));

const MODEL = process.env.AI_MODEL || 'claude-opus-5-5';
const SOURCES = ['rumour', 'reco']; // facility triage alerts are already scored by the triage rules

function provider() {
  if (process.env.AI_PROVIDER === 'mock') return 'mock';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return null;
}
function enabled(cfg) { return !!(provider() && !(cfg && cfg.ai_enabled === false)); }

let client = null;
async function callClaude(task, payload, lang) {
  if (!client) client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SH.TASKS[task].schema } },
    system: SH.TASKS[task].system,
    messages: [{ role: 'user', content: SH.userMessage(task, payload, lang) }]
  });
  if (response.stop_reason === 'refusal') throw Object.assign(new Error('refused'), { code: 'refused' });
  if (response.stop_reason === 'max_tokens') throw Object.assign(new Error('truncated'), { code: 'truncated' });
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { result: JSON.parse(text), model: response.model };
}
function errorCode(e) {
  if (e instanceof Anthropic.RateLimitError) return 'rate_limited';
  if (e instanceof Anthropic.AuthenticationError) return 'not_authorised';
  if (e instanceof Anthropic.APIError) return 'api_error_' + (e.status || '');
  if (e instanceof SyntaxError) return 'bad_output';
  return e.code || 'error';
}
// One task, one answer: { status: 'ok', model, ...result } or { status: 'error', error }.
async function run(task, payload, lang, ctx) {
  try {
    const out = provider() === 'mock' ? { result: SH.mock(task, payload), model: 'mock' } : await callClaude(task, payload, lang);
    return Object.assign({ status: 'ok', model: out.model, at: new Date().toISOString() }, SH.clean(task, out.result, ctx));
  } catch (e) {
    return { status: 'error', model: provider() === 'mock' ? 'mock' : MODEL, error: errorCode(e), at: new Date().toISOString() };
  }
}

async function loadSource(pool, alert) {
  const col = alert.source === 'rumour' ? 'rumours' : (alert.source === 'reco' ? 'reports' : null);
  if (!col || !alert.source_ref) return null;
  const r = await pool.query('SELECT data FROM records WHERE collection = $1 AND id = $2', [col, alert.source_ref]);
  return r.rows[0] ? r.rows[0].data : null;
}

// Analyse one community report or rumour and store the suggestion.
async function analyse(pool, alertId, lang) {
  const r = await pool.query("SELECT data FROM records WHERE collection = 'queue' AND id = $1", [alertId]);
  const alert = r.rows[0] && r.rows[0].data;
  if (!alert) throw Object.assign(new Error('not_found'), { status: 404 });
  if (!SOURCES.includes(alert.source)) throw Object.assign(new Error('not_applicable'), { status: 400 });
  const item = SH.describeAlert(alert, await loadSource(pool, alert));
  const zone = alert.geo && alert.geo.zone;
  const rec = zone ? (await pool.query(
    "SELECT data FROM records WHERE collection = 'queue' AND id <> $1 AND zone = $2 AND data->>'source' = ANY($3) AND (data->>'submitted_at')::timestamptz > now() - interval '14 days' ORDER BY data->>'submitted_at' DESC LIMIT 30",
    [alertId, zone, SOURCES])).rows : [];
  const recent = [];
  for (const row of rec) recent.push(SH.describeAlert(row.data, await loadSource(pool, row.data)));
  const ids = {}; recent.forEach((x) => { ids[x.id] = true; });
  const s = await run('rumour', { item, recent }, lang, { recentIds: ids });
  const row = await pool.query(
    `INSERT INTO ai_suggestions (queue_id, zone, status, model, result, error, created_at) VALUES ($1,$2,$3,$4,$5,$6, now())
     ON CONFLICT (queue_id) DO UPDATE SET status = $3, model = $4, result = $5, error = $6, created_at = now(), feedback = NULL, feedback_by = NULL, feedback_at = NULL
     RETURNING queue_id, status, model, result, error, created_at, feedback`,
    [alertId, zone || null, s.status, s.model, s.status === 'ok' ? s : null, s.error || null]);
  return toClient(row.rows[0]);
}

function toClient(row) {
  return Object.assign({ queue_id: row.queue_id, status: row.status, model: row.model, at: row.created_at, error: row.error || null, feedback: row.feedback || null }, row.result || {});
}

// Background: new community reports and rumours are analysed one at a time after they arrive.
const pending = []; let busy = false;
function schedule(pool, cfg, alerts) {
  if (!enabled(cfg)) return;
  alerts.filter((a) => a && SOURCES.includes(a.source)).forEach((a) => { if (!pending.includes(a.id)) pending.push(a.id); });
  if (busy) return;
  busy = true;
  (async () => {
    while (pending.length) {
      const id = pending.shift();
      try {
        const done = await pool.query("SELECT 1 FROM ai_suggestions WHERE queue_id = $1 AND status = 'ok'", [id]);
        if (!done.rowCount) await analyse(pool, id, cfg.ai_language || 'en');
      } catch (e) { console.error('AI analysis failed for ' + id + ': ' + e.message); }
    }
    busy = false;
  })();
}

// Briefs and laboratory checks: the app sends counts or a pseudonymised record; phone numbers inside
// any text are removed again here before anything leaves the server.
function sanitise(v, depth) {
  if (depth > 6) return null;
  if (typeof v === 'string') return SH.scrub(v, 2000);
  if (Array.isArray(v)) return v.slice(0, 200).map((x) => sanitise(x, depth + 1));
  if (v && typeof v === 'object') { const o = {}; Object.keys(v).slice(0, 200).forEach((k) => { if (!/name|phone|contact|email/i.test(k)) o[k] = sanitise(v[k], depth + 1); }); return o; }
  return typeof v === 'number' || typeof v === 'boolean' || v === null ? v : null;
}
async function assist(task, payload, lang) { return run(task, sanitise(payload, 0), lang); }

module.exports = { provider, enabled, analyse, schedule, toClient, assist, sanitise, MODEL, SOURCES, describe: SH.describeAlert, scrub: SH.scrub };
