/* AI in the app: where it helps surveillance officers, zone officers and the laboratory.
 *  - community reports and rumours: summary, duplicates, questions, priority (verification screen);
 *  - situation brief from counts (Home and dashboard) for surveillance, zone, decision-makers,
 *    facility heads and the laboratory;
 *  - check of a laboratory result before approval (laboratory screen).
 * On the deployed system the server calls the AI service (key held by the server). In the
 * demonstration page on claude.ai, the page's own Claude access is used. Everything shown is a
 * suggestion, marked as such, and nothing is changed by it. Instructions and formats: ai-prompts.js.
 */
(function () {
  'use strict';
  var B = window.BDBV, SH = window.BDBV_AI;
  var L = function (f, e) { return B.L(f, e); };
  var esc = function (x) { return B.esc(x); };
  var DAY = 864e5;
  function db() { return B.db(); }
  var pageSample = null, status = null, statusFor = null;
  if (window.claude && typeof window.claude.use === 'function') window.claude.use('sample').then(function (s) { pageSample = s || null; }).catch(function () {});

  function serverMode() { return !!(B.st.auth && B.st.auth.mode === 'server'); }
  function mode() { if (serverMode()) return status && status.enabled ? 'server' : null; return pageSample ? 'page' : null; }
  function loadStatus(cb) {
    if (!serverMode() || !B.apiCall) { if (cb) cb(); return; }
    var who = B.st.auth.username;
    if (status && statusFor === who) { if (cb) cb(); return; }
    statusFor = who; status = { enabled: false, tasks: [] };
    B.apiCall('/ai/status').then(function (s) { status = s; if (cb) cb(); }).catch(function () { if (cb) cb(); });
  }
  function can(task) { var m = mode(); if (!m) return false; return m === 'page' ? true : (status.tasks || []).indexOf(task) >= 0; }
  function errText(e) {
    var c = (e && (e.code || e.message || e.error)) || '';
    if (c === 'not_granted') return L('accès à Claude refusé sur cette page', 'access to Claude was declined on this page');
    if (c === 'rate_limited') return L('trop de demandes, réessayez plus tard', 'too many requests, try again later');
    if (c === 'ai_disabled') return L('IA désactivée par l\'administrateur', 'AI switched off by the administrator');
    return String(c || L('erreur', 'error'));
  }
  function viaPage(task, payload, ctx) {
    return pageSample.json(SH.pagePrompt(task, payload, B.st.lang), { modelTier: 'default' })
      .then(function (r) { return Object.assign({ status: 'ok', model: 'Claude (claude.ai)', at: new Date().toISOString() }, SH.clean(task, r, ctx)); });
  }
  function run(task, payload) {
    if (mode() === 'server') return B.apiCall('/ai/assist', { method: 'POST', body: { task: task, payload: payload, lang: B.st.lang } });
    if (mode() === 'page') return viaPage(task, payload);
    return Promise.reject(new Error('ai_unavailable'));
  }

  /* ---------- Community reports and rumours ---------- */
  function sourceOf(a) { var d = db(); return a.source === 'rumour' ? B.byId(d.rumours, a.source_ref) : (a.source === 'reco' ? B.byId(d.reports, a.source_ref) : null); }
  function analyseAlert(a) {
    var store = function (s) { if (s && s.status === 'ok') { var d = db(); d.ai = d.ai || {}; s.queue_id = a.id; d.ai[a.id] = s; B.save(); } return s; };
    if (mode() === 'server') return B.apiCall('/ai/analyse', { method: 'POST', body: { queue_id: a.id, lang: B.st.lang } }).then(store);
    if (mode() !== 'page') return Promise.reject(new Error('ai_unavailable'));
    var t0 = new Date(a.submitted_at).getTime(), ids = {};
    var recent = (db().queue || []).filter(function (x) { return x.id !== a.id && (x.source === 'rumour' || x.source === 'reco') && x.geo && a.geo && x.geo.zone === a.geo.zone && Math.abs(new Date(x.submitted_at).getTime() - t0) < 14 * DAY; })
      .slice(0, 30).map(function (x) { ids[x.id] = true; return SH.describeAlert(x, sourceOf(x)); });
    return viaPage('rumour', { item: SH.describeAlert(a, sourceOf(a)), recent: recent }, { recentIds: ids }).then(store);
  }

  /* ---------- Situation brief (counts only) ---------- */
  var BRIEF_ROLES = ['surveillant', 'zone_officer', 'decideur', 'facility_head', 'lab', 'lab_manager'];
  function briefPayload() {
    var d = db(), role = B.st.role, ctx = B.userCtx(), now = Date.now();
    var zoneOf = function (g) { return (g && g.zone) || ''; };
    var inScope = function (g) { if (role === 'zone_officer' && ctx.zone) return zoneOf(g) === ctx.zone; if (role === 'facility_head' && ctx.facility) return g && g.facility === ctx.facility; return true; };
    var wk = function (iso) { var t = new Date(iso).getTime(); return now - t < 7 * DAY ? 'this_week' : (now - t < 14 * DAY ? 'last_week' : null); };
    var zn = function (z) { return z ? B.nm(B.G.zones, z) : '-'; };
    var area = role === 'zone_officer' ? zn(ctx.zone) : (role === 'facility_head' ? B.nm(B.G.facilities, ctx.facility) : (['lab', 'lab_manager'].indexOf(role) >= 0 ? L('laboratoire', 'laboratory') : L('toutes les zones', 'all zones')));
    if (['lab', 'lab_manager'].indexOf(role) >= 0) {
      var S = d.samples || [], by = {}, ages = [], tat = [], appr = [], pos = { this_week: 0, last_week: 0 }, rel = { this_week: 0, last_week: 0 };
      S.forEach(function (s) {
        by[s.status] = (by[s.status] || 0) + 1;
        if (['result_released', 'repeat_required'].indexOf(s.status) < 0 && s.request && s.request.at) ages.push({ id: s.lab_id || s.id, status: s.status, hours_waiting: Math.round((now - new Date(s.request.at).getTime()) / 36e5) });
        if (s.collected_at && s.tested_at) tat.push((new Date(s.tested_at) - new Date(s.collected_at)) / 36e5);
        if (s.tested_at && s.approved_at) appr.push((new Date(s.approved_at) - new Date(s.tested_at)) / 36e5);
        var w = s.released_at && wk(s.released_at); if (w) { rel[w]++; if (s.result === 'positive') pos[w]++; }
      });
      var med = function (l) { l.sort(function (x, y) { return x - y; }); return l.length ? Math.round(l[Math.floor(l.length / 2)] * 10) / 10 : null; };
      ages.sort(function (x, y) { return y.hours_waiting - x.hours_waiting; });
      return { area: area, counts: { samples_by_status: by, oldest_waiting: ages.slice(0, 6), median_hours_collection_to_test: med(tat), median_hours_test_to_approval: med(appr), released: rel, positive_released: pos } };
    }
    var z = {}, tot = { this_week: {}, last_week: {} };
    var bump = function (w, zone, k, n) { if (!w) return; n = n == null ? 1 : n; tot[w][k] = (tot[w][k] || 0) + n; var r = z[zone] = z[zone] || { zone: zn(zone), this_week: {}, last_week: {} }; r[w][k] = (r[w][k] || 0) + n; };
    (d.assessments || []).forEach(function (a) { if (!inScope(a.geo)) return; var w = wk(a.assessed_at); bump(w, zoneOf(a.geo), 'assessed'); bump(w, zoneOf(a.geo), a.result && a.result.category === 'RED' ? 'high_risk' : (a.result && a.result.category === 'AMBER' ? 'medium_risk' : 'low_risk')); if (a.classification && a.classification.status === 'confirmed') bump(w, zoneOf(a.geo), 'lab_confirmed'); });
    (d.reports || []).forEach(function (r) { var g = { zone: r.zone, facility: '' }; if (!inScope(g)) return; var w = wk(r.reported_at), c = r.counts || {}; bump(w, r.zone, 'reco_reports'); ['deaths_total', 'deaths_unexplained', 'clusters', 'alerts'].forEach(function (k) { if (c[k]) bump(w, r.zone, 'community_' + k, c[k]); }); });
    (d.rumours || []).forEach(function (r) { if (!inScope(r.geo)) return; bump(wk(r.submitted_at), zoneOf(r.geo), 'rumours'); });
    var open = { to_acknowledge: 0, assigned_not_started: 0, under_verification: 0, awaiting_decision: 0, overdue: 0 };
    (d.queue || []).forEach(function (a) {
      if (!inScope(a.geo) || a.stages.approved) return; var s = a.stages;
      if (!s.acknowledged) open.to_acknowledge++; else if (s.assigned && !s.started) open.assigned_not_started++; else if (s.started && !s.completed) open.under_verification++; else if (s.completed) open.awaiting_decision++;
      var o = B.queue && B.queue.overdue(a, new Date()); if (o && o.late) open.overdue++;
    });
    var cont = { under_follow_up: 0, referred: 0 }; (d.contacts || []).forEach(function (c) { if (c.status === 'referred') cont.referred++; else if (c.status && c.status !== 'completed' && c.status !== 'lost') cont.under_follow_up++; });
    var zones = Object.keys(z).map(function (k) { return z[k]; }).sort(function (x, y) { return ((y.this_week.high_risk || 0) - (x.this_week.high_risk || 0)) || ((y.this_week.assessed || 0) - (x.this_week.assessed || 0)); }).slice(0, 10);
    return { area: area, counts: { this_week: tot.this_week, last_week: tot.last_week, by_zone: zones, open_alerts: open, contacts: cont } };
  }
  function briefKey() { return B.st.role + '|' + (B.userCtx().zone || '') + '|' + (B.userCtx().facility || '') + '|' + B.st.lang; }
  function briefHTML(b, busy, err) {
    var kindLbl = { watch: L('À surveiller', 'Watch'), action: L('À faire', 'Action'), info: L('Info', 'Info') };
    return '<section class="card aibrief"><div class="aihead"><h3>' + L('Note de situation (IA)', 'Situation brief (AI)') + '</h3>' + (b ? ' <span class="small muted">' + esc(b.model || '') + ' · ' + B.fmtDT(b.at) + '</span>' : '') + '</div>' +
      '<p class="small muted">' + L('Rédigée par l\'IA à partir des seuls chiffres de votre zone de responsabilité (aucune donnée individuelle). À vérifier : elle ne décide rien.', 'Written by AI from the counts of your area only (no individual data). Check it: it decides nothing.') + '</p>' +
      (b ? '<p class="aiheadline"><b>' + esc(b.headline) + '</b></p><ul class="aipoints">' + (b.points || []).map(function (p) { return '<li class="k-' + esc(p.kind) + '"><span class="pill">' + esc(kindLbl[p.kind] || p.kind) + '</span> ' + esc(p.text) + (p.where ? ' <span class="muted small">· ' + esc(p.where) + '</span>' : '') + '</li>'; }).join('') + '</ul>' +
        ((b.actions || []).length ? '<p><b>' + L('Prochaines 24 heures', 'Next 24 hours') + '</b></p><ol class="small">' + b.actions.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' : '') +
        ((b.caveats || []).length ? '<p class="small muted">' + esc(b.caveats.join(' · ')) + '</p>' : '') : '') +
      (err ? '<p class="flag small">' + esc(err) + '</p>' : '') +
      '<button type="button" class="sm" id="aibriefgo"' + (busy ? ' disabled' : '') + '>' + (busy ? L('Rédaction…', 'Writing…') : (b ? L('Actualiser', 'Refresh') : L('Rédiger la note', 'Write the brief'))) + '</button></section>';
  }
  B.aiBrief = function (el, where) {
    if (!el || BRIEF_ROLES.indexOf(B.st.role) < 0) return;
    loadStatus(function () {
      if (!document.body.contains(el)) return;
      if (!can('brief')) { el.innerHTML = ''; return; }
      var d = db(), key = briefKey(), cached = (d.aibrief || {})[key];
      var go = function () {
        el.innerHTML = briefHTML(cached, true);
        run('brief', briefPayload()).then(function (b) {
          if (b.status !== 'ok') throw { code: b.error };
          d.aibrief = d.aibrief || {}; d.aibrief[key] = b; cached = b; B.save();
          if (document.body.contains(el)) { el.innerHTML = briefHTML(b); bind(); }
        }).catch(function (e) { if (document.body.contains(el)) { el.innerHTML = briefHTML(cached, false, L('Note impossible : ', 'Brief not available: ') + errText(e)); bind(); } });
      };
      var bind = function () { var b = el.querySelector('#aibriefgo'); if (b) b.onclick = go; };
      el.innerHTML = briefHTML(cached); bind();
      // On the deployed system a fresh brief is written once every 6 hours; on claude.ai, on request.
      if (mode() === 'server' && (!cached || Date.now() - new Date(cached.at).getTime() > 6 * 36e5) && B.st.online) go();
    });
  };

  /* ---------- Laboratory: check before approval ---------- */
  function labPayload(s) {
    var a = B.byId(db().assessments, s.case_id) || {}, p = a.person || {}, c = a.clinical || {};
    var signs = Object.keys(c.symptoms || {}).filter(function (k) { return c.symptoms[k] && c.symptoms[k].s === 'yes'; }).map(function (k) { var it = B.itemById(k); return it ? B.lbl(it) : k; });
    var onset = c.onset_date && !c.onset_unknown ? c.onset_date : null;
    return {
      sample: { id: s.id, lab_id: s.lab_id, type: s.type, status: s.status, collected_at: s.collected_at, received_at: s.received_at, testing_site: s.testing_site, method: s.method, ct: s.ct, result: s.result, tested_at: s.tested_at, result_note: s.result_note, repeat_of: s.repeat_of || null, custody: (s.custody || []).map(function (x) { return { step: x.step, at: x.at }; }) },
      case: { age: p.age, sex: p.sex, risk_level: a.result && a.result.category, onset_date: onset, deceased: !!c.deceased, signs: signs, days_onset_to_collection: onset && s.collected_at ? Math.round((new Date(s.collected_at) - new Date(onset)) / DAY * 10) / 10 : null }
    };
  }
  B.aiLabHTML = function (s) {
    if (!s || !s.result || ['lab', 'lab_manager'].indexOf(B.st.role) < 0 || !can('lab_review')) return '';
    var r = (db().ailab || {})[s.id], rec = { approve: L('rien de préoccupant', 'nothing of concern'), check: L('à vérifier avant approbation', 'check before approval'), repeat: L('nouveau prélèvement conseillé', 'a new sample is advisable') };
    return '<div class="aibox" id="ailab"><div class="aihead"><b>' + L('Vérification par l\'IA avant approbation', 'AI check before approval') + '</b>' + (r ? ' <span class="small muted">' + esc(r.model || '') + ' · ' + B.fmtDT(r.at) + '</span>' : '') + '</div>' +
      '<p class="small">' + L('Suggestion seulement : le responsable de laboratoire décide. Envoyé : l\'échantillon et l\'âge, le sexe, le risque, le début et les signes du cas, jamais le nom.', 'A suggestion only: the laboratory manager decides. Sent: the sample and the case\'s age, sex, risk, onset and signs, never the name.') + '</p>' +
      (r ? '<p>' + esc(r.summary) + '</p><p><b>' + L('Recommandation', 'Recommendation') + ' :</b> <span class="prio ai p-' + (r.recommendation === 'approve' ? 'low' : (r.recommendation === 'repeat' ? 'high' : 'medium')) + '">' + esc(rec[r.recommendation] || r.recommendation) + '</span></p>' +
        ((r.issues || []).length ? '<ul class="small">' + r.issues.map(function (i) { return '<li><span class="prio p-' + esc(i.severity) + '">' + esc(i.severity) + '</span> ' + esc(i.text) + '</li>'; }).join('') + '</ul>' : '') +
        (r.suggested_comment ? '<p class="small"><b>' + L('Commentaire proposé', 'Suggested comment') + ' :</b> ' + esc(r.suggested_comment) + (B.$('#lretnote') !== undefined ? ' <button type="button" class="ghost sm" id="ailabuse">' + L('Utiliser', 'Use') + '</button>' : '') + '</p>' : '') : '') +
      '<button type="button" class="sm" id="ailabgo">' + (r ? L('Vérifier à nouveau', 'Check again') : L('Vérifier avec l\'IA', 'Check with AI')) + '</button></div>';
  };
  B.bindAiLab = function (box, s, redraw) {
    var go = box.querySelector('#ailabgo'); if (!go) return;
    go.onclick = function () {
      go.disabled = true; go.textContent = L('Vérification…', 'Checking…');
      run('lab_review', labPayload(s)).then(function (r) {
        if (r.status !== 'ok') throw { code: r.error };
        var d = db(); d.ailab = d.ailab || {}; d.ailab[s.id] = r; B.save(); B.audit('ai_lab_review', 'sample', s.id, r.recommendation); redraw();
      }).catch(function (e) { go.disabled = false; go.textContent = L('Réessayer', 'Try again'); B.notify(L('Vérification impossible : ', 'Check not available: ') + errText(e), 'err'); });
    };
    var use = box.querySelector('#ailabuse'); if (use) use.onclick = function () { var r = db().ailab[s.id], t = box.querySelector('#lretnote') || box.querySelector('[name=rnote]'); if (t && r) { t.value = r.suggested_comment; t.dispatchEvent(new Event('input', { bubbles: true })); t.focus(); } };
  };

  B.ai = { mode: mode, can: can, loadStatus: loadStatus, analyseAlert: analyseAlert, run: run, errText: errText, briefPayload: briefPayload, labPayload: labPayload };
})();
