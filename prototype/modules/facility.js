/* Facility-head dashboard: what is happening in one facility, with timeliness,
 * bottlenecks and performance, without patient names.
 */
(function () {
  'use strict';
  var B = window.BDBV;
  var L = function (f, e) { return B.L(f, e); };
  var esc = function (x) { return B.esc(x); };
  var DAY = 86400000, H = 3600000;
  var ff = { facility: '', days: '30' };
  function db() { return B.db(); }
  function mean(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; }
  function fmtH(m) { return m == null ? '-' : (m < 120 ? Math.round(m) + ' min' : (Math.round(m / 6) / 10) + ' h'); }

  B.facilityStats = function (facId, days) {
    var d = db(), since = days === 'all' ? 0 : Date.now() - (+days) * DAY;
    var A = d.assessments.filter(function (a) { return a.geo.facility === facId && new Date(a.assessed_at) >= since; });
    var ids = A.map(function (a) { return a.id; });
    var Q = d.queue.filter(function (q) { return q.source === 'facility' && ids.indexOf(q.source_ref) >= 0; });
    var cnt = { RED: 0, AMBER: 0, GREEN: 0 }; A.forEach(function (a) { cnt[a.result.category]++; });
    var care = {}; A.forEach(function (a) { var s = a.care ? a.care.status : 'initial_assessment'; care[s] = (care[s] || 0) + 1; });
    var transferred = A.filter(function (a) { return a.care && a.care.history.some(function (h) { return h.transfer; }); }).length;
    var admitted = A.filter(function (a) { return a.care && ['in_holding', 'isolation_care'].indexOf(a.care.status) >= 0; }).length;
    var awaitRes = 0, pos = 0, neg = 0;
    A.forEach(function (a) { var cl = B.labApi.caseLab(a.id); if (cl.awaitingResult || cl.awaitingTest) awaitRes++; if (cl.result === 'positive') pos++; if (cl.result === 'negative') neg++; });
    var contacts = d.contacts.filter(function (c) { return c.index_cases.some(function (i) { return ids.indexOf(i) >= 0; }); });
    var followed = contacts.filter(function (c) { return c.followups.length; }).length;
    // time from screening to first clinical review (AMBER review or first care-status change)
    var review = A.map(function (a) {
      var t = null;
      if (a.review && a.review.at) t = new Date(a.review.at);
      var ch = a.care && a.care.history.filter(function (h) { return h.status !== 'initial_assessment'; })[0];
      if (ch && (!t || new Date(ch.at) < t)) t = new Date(ch.at);
      return t ? (t - new Date(a.assessed_at)) / 60000 : null;
    }).filter(function (x) { return x != null && x >= 0; });
    var verif = Q.filter(function (q) { return q.stages.completed; }).map(function (q) { return (new Date(q.stages.completed.at) - new Date(q.submitted_at)) / 60000; });
    var now = new Date();
    var bott = [];
    var lateAlerts = Q.filter(function (q) { var o = B.queue.overdue(q, now); return o && o.late; });
    if (lateAlerts.length) bott.push([lateAlerts.length, L('alerte(s) en retard dans la file de vérification', 'alert(s) overdue in the verification queue')]);
    var unrev = A.filter(function (a) { return a.review && a.review.status === 'pending' && now - new Date(a.assessed_at) > DAY; });
    if (unrev.length) bott.push([unrev.length, L('patient(s) ORANGE non revus depuis plus de 24 h', 'AMBER patient(s) not reviewed for more than 24 h')]);
    var unack = d.alerts.filter(function (al) { return al.facility === facId && !al.ack && now - new Date(al.created_at) > 30 * 60000; });
    if (unack.length) bott.push([unack.length, L('alerte(s) ROUGE non acquittée(s) après 30 min', 'RED alert(s) not acknowledged after 30 min')]);
    var slowLab = d.samples.filter(function (s) { return ids.indexOf(s.case_id) >= 0 && s.status !== 'result_released' && now - new Date(s.collected_at) > 2 * DAY; });
    if (slowLab.length) bott.push([slowLab.length, L('échantillon(s) sans résultat après 48 h', 'sample(s) without a result after 48 h')]);
    var noSample = A.filter(function (a) { return a.lab && a.lab.status === 'requested' && !B.labApi.samplesOf(a.id).length && now - new Date(a.assessed_at) > 6 * H; });
    if (noSample.length) bott.push([noSample.length, L('test(s) demandé(s) sans prélèvement après 6 h', 'test(s) requested with no sample after 6 h')]);
    var lateC = contacts.filter(function (c) { return B.contactsApi.state(c, now).overdue; });
    if (lateC.length) bott.push([lateC.length, L('contact(s) avec suivi en retard', 'contact(s) with overdue follow-up')]);
    var redRef = A.filter(function (a) { return a.result.category === 'RED'; });
    var redHandled = redRef.filter(function (a) { return a.care && a.care.status !== 'initial_assessment'; }).length;
    return { n: A.length, cnt: cnt, alerts: Q.length, awaitingReview: Q.filter(function (q) { return !q.stages.completed; }).length, verified: Q.filter(function (q) { return q.outcome === 'verified'; }).length,
      referredHolding: (care.referred_holding || 0) + (care.in_holding || 0), admitted: admitted, transferred: transferred, discharged: care.discharged || 0, deceased: care.deceased || 0,
      awaitRes: awaitRes, pos: pos, neg: neg, contacts: contacts.length, followed: followed, reviewMean: mean(review), verifMean: mean(verif),
      ackRate: Q.length ? Math.round(100 * Q.filter(function (q) { return q.stages.acknowledged; }).length / Q.length) : null,
      redHandledPct: redRef.length ? Math.round(100 * redHandled / redRef.length) : null, bottlenecks: bott };
  };

  B.VIEWS.facility = function (v) {
    var ctx = B.userCtx(), anyFac = B.can('facility_any');
    if (!ff.facility) ff.facility = ctx.facility || 'Z-aru-A1-F';
    var facs = B.G.facilities.filter(function (f) { return anyFac || f.id === ff.facility; });
    var s = B.facilityStats(ff.facility, ff.days);
    var showLab = true; // facility head: aggregate counts only (no identities)
    var k = function (l, n, sub, cls) { return '<div class="kpi ' + (cls || '') + '"><div class="kv">' + n + '</div><div class="kl">' + esc(l) + '</div>' + (sub ? '<div class="ks">' + sub + '</div>' : '') + '</div>'; };
    var pct = function (a) { return s.n ? Math.round(100 * a / s.n) + '%' : '-'; };
    v.innerHTML = '<section class="card"><h2>' + L('Tableau de bord de la formation sanitaire', 'Health facility dashboard') + '</h2>' +
      '<div class="vbar"><label class="inl">' + L('Formation sanitaire', 'Health facility') + ' <select id="ffac"' + (anyFac ? '' : ' disabled') + '>' + facs.map(function (f) { return '<option value="' + f.id + '"' + (f.id === ff.facility ? ' selected' : '') + '>' + esc(f.name) + '</option>'; }).join('') + '</select></label>' +
      '<label class="inl">' + B.t('period') + ' <select id="fdays2">' + ['7', '30', '90', 'all'].map(function (x) { return '<option value="' + x + '"' + (ff.days === x ? ' selected' : '') + '>' + (x === 'all' ? B.t('all') : x + ' ' + B.t('days')) + '</option>'; }).join('') + '</select></label></div>' +
      '<p class="muted small">' + L('Indicateurs agrégés : aucun nom de patient n\'est affiché.', 'Aggregated indicators: no patient names are shown.') + '</p></section>' +
      '<section class="card"><h3>' + L('Activité', 'Activity') + '</h3><div class="kpis">' +
      k(L('Personnes dépistées', 'Individuals screened'), s.n) + k(L('ROUGE', 'RED'), s.cnt.RED, pct(s.cnt.RED), 'k-RED') + k(L('ORANGE', 'AMBER'), s.cnt.AMBER, pct(s.cnt.AMBER), 'k-AMBER') + k(L('VERT', 'GREEN'), s.cnt.GREEN, pct(s.cnt.GREEN), 'k-GREEN') +
      k(L('Alertes soumises', 'Alerts submitted'), s.alerts) + k(L('Alertes en attente de revue', 'Alerts awaiting review'), s.awaitingReview, '', s.awaitingReview ? 'k-AMBER' : '') + k(L('Alertes vérifiées', 'Alerts verified'), s.verified) +
      k(L('Référés / en unité de transit', 'Referred to / in holding units'), s.referredHolding) + k(L('Admis (transit, isolement)', 'Admitted (holding, isolation)'), s.admitted) + k(L('Transférés', 'Transferred'), s.transferred) + k(L('Sortis', 'Discharged'), s.discharged) + k(L('Décédés', 'Deceased'), s.deceased) +
      (showLab ? k(L('En attente de résultats de labo', 'Awaiting lab results'), s.awaitRes, '', s.awaitRes ? 'k-AMBER' : '') + k(L('Résultats positifs', 'Positive results'), s.pos, '', s.pos ? 'k-RED' : '') + k(L('Résultats négatifs', 'Negative results'), s.neg) : '') +
      k(L('Contacts identifiés', 'Contacts identified'), s.contacts) + k(L('Contacts suivis (≥ 1 visite)', 'Contacts followed up (≥ 1 visit)'), s.followed, s.contacts ? Math.round(100 * s.followed / s.contacts) + '%' : '') + '</div></section>' +
      '<section class="card"><h3>' + L('Délais et performance', 'Timeliness and performance') + '</h3><div class="kpis">' +
      k(L('Dépistage → revue clinique (moyenne)', 'Screening → clinical review (mean)'), fmtH(s.reviewMean)) + k(L('Soumission → vérification de l\'alerte (moyenne)', 'Alert submission → verification (mean)'), fmtH(s.verifMean)) +
      k(L('Alertes avec accusé de réception', 'Alerts acknowledged'), s.ackRate == null ? '-' : s.ackRate + '%') + k(L('Cas ROUGE avec prise en charge enregistrée', 'RED cases with care action recorded'), s.redHandledPct == null ? '-' : s.redHandledPct + '%') + '</div></section>' +
      '<section class="card ' + (s.bottlenecks.length ? 'warn' : 'ok') + '"><h3>' + L('Goulots d\'étranglement et actions en retard', 'Bottlenecks and delayed actions') + '</h3>' +
      (s.bottlenecks.length ? '<ul>' + s.bottlenecks.map(function (b) { return '<li><b>' + b[0] + '</b> ' + esc(b[1]) + '</li>'; }).join('') + '</ul>' : '<p>' + L('Aucun retard détecté.', 'No delays detected.') + '</p>') +
      (B.can('reports') ? '<button class="sm" id="frep">' + L('Rapport de performance (PDF)', 'Performance report (PDF)') + '</button>' : '') + '</section>';
    B.$('#ffac', v).onchange = function () { ff.facility = this.value; B.VIEWS.facility(v); };
    B.$('#fdays2', v).onchange = function () { ff.days = this.value; B.VIEWS.facility(v); };
    var rp = B.$('#frep', v); if (rp && B.reportRows) rp.onclick = function () { var r = B.reportRows('facility', { facility: ff.facility, days: ff.days }); B.exportTable('pdf', 'performance_fosa', r.title, r.rows); B.audit('download', 'report', 'facility', ff.facility); };
  };
})();
