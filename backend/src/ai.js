'use strict';
/* AI support for the verification queue: for community reports and rumours, a short summary, the
 * places, dates and events mentioned, possible duplicates among recent reports from the same health
 * zone, information still missing, and a recommended review priority with its reasons.
 *
 * These are suggestions for the surveillance officer. They never change a record, never confirm or
 * rule out a case, and never close or reject an alert.
 *
 * Off by default. It runs only when the server has a provider (ANTHROPIC_API_KEY, or AI_PROVIDER=mock
 * for tests) AND the system administrator has switched it on (configuration "ai_enabled"), which
 * should wait for the Ministry of Health's approval. Names and phone numbers of reporters are never
 * sent; phone numbers written inside a description are removed first.
 */
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.AI_MODEL || 'claude-opus-5-5';
const SOURCES = ['rumour', 'reco']; // facility triage alerts are already scored by the triage rules
const PRIORITIES = ['high', 'medium', 'low'];

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'priority', 'priority_reasons', 'places', 'dates', 'events', 'compatible_signs', 'possible_duplicates', 'missing_information'],
  properties: {
    summary: { type: 'string', description: 'One or two plain sentences for the officer.' },
    priority: { type: 'string', enum: PRIORITIES },
    priority_reasons: { type: 'array', items: { type: 'string' } },
    places: { type: 'array', items: { type: 'string' } },
    dates: { type: 'array', items: { type: 'string' } },
    events: { type: 'array', items: { type: 'string' } },
    compatible_signs: { type: 'array', items: { type: 'string' } },
    possible_duplicates: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['id', 'reason'], properties: { id: { type: 'string' }, reason: { type: 'string' } } }
    },
    missing_information: { type: 'array', items: { type: 'string' } }
  }
};

const SYSTEM = [
  'You help surveillance officers in the Democratic Republic of the Congo sort community reports and rumours during a Bundibugyo ebolavirus (BDBV) outbreak response.',
  'You organise information for a human officer who will verify it in the field. You never confirm or rule out Ebola, and you never decide whether a report is true.',
  'Reports may be written in French, Lingala, Kiswahili or English, often briefly and with spelling mistakes.',
  'Recommend a review priority:',
  '- high: any unexplained death or death after illness; two or more ill or dead people linked by place or household; an ill health worker; contact with a known or suspected case; bleeding; an unsafe burial;',
  '- medium: one ill person with signs compatible with Ebola (fever with vomiting, diarrhoea, weakness, or unexplained bleeding) and no death;',
  '- low: vague, unrelated to illness, or clearly not compatible.',
  'When unsure between two levels, choose the higher one: a missed urgent report costs more than an extra check.',
  'Possible duplicates: only list IDs from the recent reports provided, and only when the place, date and event plausibly describe the same thing. Give the reason in a few words.',
  'Missing information: the specific questions the officer should ask the reporter (for example exact village, date of death, number ill, symptoms, burial arrangements).',
  'Keep lists short (at most five items each). Do not invent facts that the report does not contain. Write all text in the language requested.'
].join('\n');

function provider() {
  if (process.env.AI_PROVIDER === 'mock') return 'mock';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return null;
}
function enabled(cfg) { return !!(provider() && cfg && cfg.ai_enabled === true); }

const scrub = (s, n) => String(s == null ? '' : s).replace(/\+?\d[\d\s.\-]{6,}\d/g, '[number removed]').slice(0, n || 1500);

// What is sent about one alert: its own facts and those of its source record, without reporter names or numbers.
function describe(alert, source) {
  const out = { id: alert.id, source: alert.source, type: alert.type, submitted_at: alert.submitted_at, health_zone: alert.geo && alert.geo.zone, health_area: alert.geo && alert.geo.area, village_code: alert.geo && alert.geo.village, summary_line: scrub(alert.description, 300) };
  if (source && alert.source === 'rumour') Object.assign(out, { event_type: source.type, place_described: scrub(source.place_text, 200), date_occurred: source.date_occurred, people_ill: source.n_people, deaths: source.n_deaths, reporter_relationship: source.relationship, description: scrub(source.description) });
  if (source && alert.source === 'reco') Object.assign(out, { counts: source.counts || {}, events: (source.events || []).slice(0, 10).map((e) => ({ type: e.type, date_occurred: e.date_occurred, n: e.n, location: scrub(e.location, 120), description: scrub(e.description, 400) })) });
  return out;
}

function mockAnalyse(item, recent) {
  const text = JSON.stringify(item).toLowerCase();
  const high = (item.deaths > 0) || (item.people_ill >= 2) || /d[ée]c[èe]s|mort|death|died|kufa|saign|bleed|cluster|infirmi|nurse|soignant/.test(text);
  const medium = /fi[èe]vre|fever|homa|vomi|diarrh/.test(text);
  const priority = high ? 'high' : (medium ? 'medium' : 'low');
  const dups = recent.filter((r) => r.event_type && r.event_type === item.event_type && r.village_code === item.village_code).slice(0, 3).map((r) => ({ id: r.id, reason: 'same village and event type' }));
  return {
    summary: (item.description || item.summary_line || '').slice(0, 160), priority,
    priority_reasons: high ? ['death, cluster, bleeding or health worker mentioned'] : (medium ? ['compatible signs mentioned'] : ['no compatible signs mentioned']),
    places: [item.place_described].filter(Boolean), dates: [item.date_occurred].filter(Boolean), events: [item.event_type].filter(Boolean),
    compatible_signs: [], possible_duplicates: dups, missing_information: ['exact village', 'date of onset or death']
  };
}

let client = null;
async function callClaude(item, recent, lang) {
  if (!client) client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const user = 'Write in ' + (lang === 'fr' ? 'French' : (lang === 'sw' ? 'Kiswahili' : 'English')) + '.\n\n' +
    'Report to review (JSON):\n' + JSON.stringify(item) + '\n\n' +
    'Recent reports from the same health zone, for possible duplicates (JSON):\n' + JSON.stringify(recent);
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: user }]
  });
  if (response.stop_reason === 'refusal') throw Object.assign(new Error('refused'), { code: 'refused' });
  if (response.stop_reason === 'max_tokens') throw Object.assign(new Error('truncated'), { code: 'truncated' });
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { result: JSON.parse(text), model: response.model };
}

// Keep only what the schema allows, and duplicates that really are among the recent reports.
function clean(r, recentIds) {
  const list = (v, n) => (Array.isArray(v) ? v : []).filter((x) => typeof x === 'string' && x.trim()).slice(0, n || 5).map((x) => x.slice(0, 300));
  return {
    summary: String(r.summary || '').slice(0, 600),
    priority: PRIORITIES.includes(r.priority) ? r.priority : 'medium',
    priority_reasons: list(r.priority_reasons), places: list(r.places), dates: list(r.dates), events: list(r.events),
    compatible_signs: list(r.compatible_signs), missing_information: list(r.missing_information),
    possible_duplicates: (Array.isArray(r.possible_duplicates) ? r.possible_duplicates : []).filter((d) => d && recentIds.has(d.id)).slice(0, 5).map((d) => ({ id: d.id, reason: String(d.reason || '').slice(0, 200) }))
  };
}

async function loadSource(pool, alert) {
  const col = alert.source === 'rumour' ? 'rumours' : (alert.source === 'reco' ? 'reports' : null);
  if (!col || !alert.source_ref) return null;
  const r = await pool.query('SELECT data FROM records WHERE collection = $1 AND id = $2', [col, alert.source_ref]);
  return r.rows[0] ? r.rows[0].data : null;
}

// Analyse one alert and store the suggestion. Returns the stored row.
async function analyse(pool, alertId, lang) {
  const r = await pool.query("SELECT data FROM records WHERE collection = 'queue' AND id = $1", [alertId]);
  const alert = r.rows[0] && r.rows[0].data;
  if (!alert) throw Object.assign(new Error('not_found'), { status: 404 });
  if (!SOURCES.includes(alert.source)) throw Object.assign(new Error('not_applicable'), { status: 400 });
  const item = describe(alert, await loadSource(pool, alert));
  const zone = alert.geo && alert.geo.zone;
  const rec = zone ? (await pool.query(
    "SELECT data FROM records WHERE collection = 'queue' AND id <> $1 AND zone = $2 AND data->>'source' = ANY($3) AND (data->>'submitted_at')::timestamptz > now() - interval '14 days' ORDER BY data->>'submitted_at' DESC LIMIT 30",
    [alertId, zone, SOURCES])).rows : [];
  const recent = [];
  for (const row of rec) recent.push(describe(row.data, await loadSource(pool, row.data)));
  const kind = provider();
  let stored;
  try {
    const out = kind === 'mock' ? { result: mockAnalyse(item, recent), model: 'mock' } : await callClaude(item, recent, lang);
    const s = clean(out.result, new Set(recent.map((x) => x.id)));
    stored = { status: 'ok', model: out.model, ...s };
  } catch (e) {
    // a failed call is recorded, never shown as a suggestion
    let code = e.code || 'error';
    if (e instanceof Anthropic.RateLimitError) code = 'rate_limited';
    else if (e instanceof Anthropic.AuthenticationError) code = 'not_authorised';
    else if (e instanceof Anthropic.APIError) code = 'api_error_' + (e.status || '');
    else if (e instanceof SyntaxError) code = 'bad_output';
    stored = { status: 'error', model: kind === 'mock' ? 'mock' : MODEL, error: code };
  }
  const row = await pool.query(
    `INSERT INTO ai_suggestions (queue_id, zone, status, model, result, error, created_at) VALUES ($1,$2,$3,$4,$5,$6, now())
     ON CONFLICT (queue_id) DO UPDATE SET status = $3, model = $4, result = $5, error = $6, created_at = now(), feedback = NULL, feedback_by = NULL, feedback_at = NULL
     RETURNING queue_id, status, model, result, error, created_at, feedback`,
    [alertId, zone || null, stored.status, stored.model, stored.status === 'ok' ? stored : null, stored.error || null]);
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

module.exports = { provider, enabled, analyse, schedule, toClient, MODEL, SOURCES, describe, scrub };
