'use strict';
/*
 * Server-side access control. The same permission matrix as the app
 * (docs/09 §9.4), enforced here so that it no longer depends on the browser.
 *  - scopeWhere(): which records a user may read (facility / zone / ownership)
 *  - canWrite(): who may create or update each collection
 *  - guard(): protected transitions (lab results, confirmation, verification stages)
 *  - redact(): fields removed before data leave the server
 */

const ROLES = ['reco', 'soignant', 'clinician', 'surveillant', 'lab', 'facility_head', 'zone_officer', 'decideur', 'sysadmin'];
const COLLECTIONS = ['assessments', 'reports', 'alerts', 'queue', 'contacts', 'samples', 'rumours', 'history'];
const HISTORY = ['surveillant', 'zone_officer', 'decideur'];
const VERIFY = ['surveillant', 'zone_officer'];
const SEE_NAMES = ['soignant', 'clinician'];
const CONTACT_NAMES = ['surveillant', 'zone_officer'];
const FACILITY_ROLES = ['soignant', 'clinician', 'facility_head'];

const READ = {
  assessments: ['soignant', 'clinician', 'surveillant', 'lab', 'facility_head', 'zone_officer', 'decideur'],
  reports: ['reco', 'soignant', 'clinician', 'surveillant', 'facility_head', 'zone_officer', 'decideur'],
  alerts: ['soignant', 'clinician', 'surveillant', 'facility_head', 'zone_officer', 'decideur'],
  queue: ['reco', 'soignant', 'clinician', 'surveillant', 'facility_head', 'zone_officer', 'decideur'],
  contacts: ['soignant', 'clinician', 'surveillant', 'facility_head', 'zone_officer', 'decideur'],
  samples: ['soignant', 'clinician', 'surveillant', 'lab', 'facility_head', 'zone_officer', 'decideur'],
  rumours: ['reco', 'surveillant', 'zone_officer', 'decideur'],
  history: HISTORY
};
const WRITE = {
  assessments: { create: ['soignant', 'clinician'], update: ['soignant', 'clinician', 'lab', 'surveillant', 'zone_officer'] },
  reports: { create: ['reco'], update: ['reco', 'surveillant', 'zone_officer'] },
  alerts: { create: ['soignant', 'clinician'], update: ['soignant', 'clinician', 'surveillant', 'zone_officer'] },
  queue: { create: ['reco', 'soignant', 'clinician', 'surveillant', 'zone_officer'], update: ['surveillant', 'zone_officer'] },
  contacts: { create: ['surveillant', 'zone_officer'], update: ['surveillant', 'zone_officer', 'soignant', 'clinician'] },
  samples: { create: ['soignant', 'clinician', 'lab'], update: ['soignant', 'clinician', 'lab'] },
  rumours: { create: ['reco', 'soignant', 'clinician', 'surveillant', 'zone_officer'], update: ['surveillant', 'zone_officer'] },
  history: { create: HISTORY, update: HISTORY }
};

function canRead(user, collection) { return (READ[collection] || []).includes(user.role); }
function canWrite(user, collection, isNew) { const w = WRITE[collection]; return !!w && w[isNew ? 'create' : 'update'].includes(user.role); }

// SQL condition (with parameters) restricting the records a user can read.
function scopeWhere(user, collection, params) {
  const p = (v) => { params.push(v); return '$' + params.length; };
  if (collection === 'history') return 'TRUE'; // aggregated counts only, no personal data
  if (user.role === 'reco') return '(owner = ' + p(user.username) + ')';
  if (FACILITY_ROLES.includes(user.role)) {
    // Own facility; community reports and alert statuses of the facility's zone (no personal data).
    if (['reports', 'queue'].includes(collection)) return '(facility = ' + p(user.facility) + ' OR zone = ' + p(user.zone) + ')';
    return '(facility = ' + p(user.facility) + ')';
  }
  if (user.role === 'zone_officer') return '(zone = ' + p(user.zone) + ')';
  return 'TRUE'; // surveillant, lab, decideur: all (fields redacted per role)
}

const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
const PROTECTED_CLASS = ['confirmed', 'lab_negative'];

// Imported historical data must be counts only: [week, province, zone, P-code, 6 non-negative integers].
const HISTORY_KEYS = ['id', 'kind', 'label', 'source', 'file', 'uploaded_at', 'uploaded_by', 'period', 'n_rows_in', 'n_rejected', 'n_excluded', 'totals', 'rows', 'deleted', 'deleted_at', 'deleted_by', 'geo', 'example', 'demo', 'synthetic'];
function checkHistory(d) {
  const extra = Object.keys(d).filter((k) => !HISTORY_KEYS.includes(k));
  if (extra.length) return 'history_unexpected_fields:' + extra.slice(0, 5).join(',');
  if (!Array.isArray(d.rows) || d.rows.length > 60000) return 'history_rows_invalid';
  const id = /^[A-Za-z0-9._-]{0,64}$/;
  for (const r of d.rows) {
    if (!Array.isArray(r) || r.length !== 10) return 'history_row_shape';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r[0]) || !id.test(r[1]) || !id.test(r[2]) || !id.test(r[3])) return 'history_row_place_or_date';
    for (let i = 4; i < 10; i++) if (!Number.isInteger(r[i]) || r[i] < 0 || r[i] > 1e6) return 'history_row_count';
  }
  for (const k of ['label', 'source', 'file', 'uploaded_by']) if (d[k] != null && (typeof d[k] !== 'string' || d[k].length > 200)) return 'history_text_too_long';
  return null;
}

// Returns an error string when the change is not allowed, else null.
function guard(user, collection, incoming, stored) {
  const old = stored || {};
  if (collection === 'history') {
    const e = checkHistory(incoming); if (e) return e;
    if (stored && !same(incoming.rows, old.rows)) return 'history_rows_are_locked'; // a batch is withdrawn, never edited
  }
  if (collection === 'assessments') {
    const cNew = incoming.classification && incoming.classification.status;
    const cOld = old.classification && old.classification.status;
    if (cNew !== cOld && (PROTECTED_CLASS.includes(cNew) || PROTECTED_CLASS.includes(cOld)) && user.role !== 'lab') return 'only_lab_can_set_lab_classification';
    if (user.role === 'lab') {
      const allowed = ['lab', 'classification', 'synced'];
      const changed = Object.keys(Object.assign({}, incoming, old)).filter((k) => !allowed.includes(k) && !same(incoming[k], old[k]));
      if (changed.length) return 'lab_may_only_change_lab_fields:' + changed.join(',');
    }
    if (VERIFY.includes(user.role)) {
      const allowed = ['classification', 'review', 'synced'];
      const changed = Object.keys(Object.assign({}, incoming, old)).filter((k) => !allowed.includes(k) && !same(incoming[k], old[k]));
      if (changed.length) return 'surveillance_may_only_change_classification_review:' + changed.join(',');
    }
  }
  if (collection === 'samples') {
    const resultFields = ['result', 'released_at', 'released_by'];
    if (user.role !== 'lab' && resultFields.some((f) => !same(incoming[f], old[f]))) return 'only_lab_can_release_results';
    if (incoming.status === 'result_released' && old.status !== 'result_released' && user.role !== 'lab') return 'only_lab_can_release_results';
  }
  if (collection === 'queue' && stored) {
    const fields = ['stages', 'outcome', 'findings', 'duplicate_of', 'urgent', 'linked'];
    if (!VERIFY.includes(user.role) && fields.some((f) => !same(incoming[f], old[f]))) return 'only_surveillance_can_verify';
  }
  if (collection === 'queue' && !stored && incoming.stages && Object.keys(incoming.stages).length && !VERIFY.includes(user.role)) return 'new_alert_must_start_unverified';
  if (collection === 'contacts' && stored && !VERIFY.includes(user.role)) {
    const allowed = ['referred_assessment', 'status', 'status_history', 'synced'];
    const changed = Object.keys(Object.assign({}, incoming, old)).filter((k) => !allowed.includes(k) && !same(incoming[k], old[k]));
    if (changed.length) return 'clinical_staff_may_only_record_referral:' + changed.join(',');
  }
  if (collection === 'reports' && stored && user.role === 'reco') {
    if (!same(incoming.counts, old.counts) && old.synced) return 'sent_report_counts_are_locked';
  }
  return null;
}

// Remove personal data the role must not see. Works on a copy.
function redact(user, collection, data) {
  const d = JSON.parse(JSON.stringify(data));
  if (collection === 'assessments' && !SEE_NAMES.includes(user.role)) {
    const p = d.person || {};
    d.person = { age: p.age, age_group: p.age_group, sex: p.sex, occ: p.occ, last: '', first: '', redacted: true };
    if (d.voice) d.voice.transcript = null;
  }
  if (collection === 'contacts' && !CONTACT_NAMES.includes(user.role)) Object.assign(d, { first: '', last: '', phone: '', address: '', redacted: true });
  if (collection === 'rumours' && !VERIFY.includes(user.role)) Object.assign(d, { name: '', phone: '' });
  if (collection === 'queue' && !VERIFY.includes(user.role) && d.reporter) d.reporter = { anonymous: !!d.reporter.anonymous, name: d.reporter.anonymous ? '' : (d.source === 'reco' ? d.reporter.name : '') };
  return d;
}

// Columns used for scoping, derived from the document.
function scopeOf(collection, data, lookup) {
  const g = data.geo || {};
  if (collection === 'reports') return { zone: data.zone || null, facility: null };
  if (collection === 'alerts') return { zone: data.zone || null, facility: data.facility || null };
  if (collection === 'samples' || collection === 'contacts') {
    const caseId = collection === 'samples' ? data.case_id : (data.index_cases || [])[0];
    const c = lookup && lookup(caseId);
    return { zone: (c && c.zone) || g.zone || null, facility: (c && c.facility) || null };
  }
  return { zone: g.zone || null, facility: g.facility || null };
}

module.exports = { ROLES, COLLECTIONS, VERIFY, SEE_NAMES, canRead, canWrite, scopeWhere, guard, redact, scopeOf };
