/* Surveillance alert queue: verification workflow, outcomes, approval gate and
 * turnaround-time (TAT) monitoring for every alert source (facility triage,
 * RECO reports, public rumours). Nothing reaches the main dashboard as a
 * verified event until it has been verified AND approved here.
 */
(function () {
  'use strict';
  var B = window.BDBV;
  var L = function (f, e) { return B.L(f, e); };
  var esc = function (x) { return B.esc(x); };

  var STAGES = ['acknowledged', 'assigned', 'started', 'completed', 'approved'];
  var STAGE_LABEL = {
    submitted: ['Soumise', 'Submitted'], acknowledged: ['Reçue (accusé de réception)', 'Received (acknowledged)'], assigned: ['Assignée pour vérification', 'Assigned for verification'],
    started: ['Vérification en cours', 'Verification in progress'], completed: ['Vérification terminée', 'Verification completed'], approved: ['Décision finale enregistrée', 'Final decision recorded']
  };
  var OUTCOMES = {
    pending: ['En attente de vérification', 'Pending verification'], verified: ['Vérifiée', 'Verified'], not_verified: ['Non vérifiée', 'Not verified'],
    duplicate: ['Doublon', 'Duplicate report'], insufficient: ['Informations insuffisantes', 'Insufficient information'], referred: ['Référée pour investigation', 'Referred for further investigation']
  };
  var SOURCES = { facility: ['FOSA (triage)', 'Facility (triage)'], reco: ['RECO', 'RECO'], rumour: ['Rumeur / public', 'Rumour / public'] };
  var OFFICERS = ['J. Mapendo [DEMO]', 'R. Kambale [DEMO]', 'A. Baraka [DEMO]', 'E. Uvon [DEMO]'];
  var DEFAULT_TAT = { ack: 60, start: 240, complete: 1440, approve: 720 }; // minutes; configurable by sysadmin
  var INTERVALS = [['ack', null, 'acknowledged'], ['start', 'acknowledged', 'started'], ['complete', 'started', 'completed'], ['approve', 'completed', 'approved']];
  var INT_LABEL = { ack: ['Soumission → réception', 'Submission → acknowledgement'], start: ['Réception → début vérification', 'Acknowledgement → verification start'], complete: ['Début → fin de vérification', 'Verification start → completion'], approve: ['Fin de vérification → approbation', 'Verification completion → dashboard approval'] };

  function db() { return B.db(); }
  function targets() { return Object.assign({}, DEFAULT_TAT, (db().config || {}).tat || {}); }
  function q() { return db().queue; }
  function byRef(ref) { return q().filter(function (a) { return a.source_ref === ref; })[0]; }
  function lbl2(pair) { return pair ? L(pair[0], pair[1]) : ''; }
  function mins(a, b) { return Math.round((new Date(b) - new Date(a)) / 60000); }
  function fmtMin(m) { if (m == null || isNaN(m)) return '-'; if (m < 60) return m + ' min'; if (m < 1440) return (Math.round(m / 6) / 10) + ' h'; return (Math.round(m / 144) / 10) + ' j'; }
  function startOf(a, prev) { return prev ? (a.stages[prev] && a.stages[prev].at) : a.submitted_at; }

  function currentStage(a) { var c = 'submitted'; STAGES.forEach(function (s) { if (a.stages[s]) c = s; }); return c; }
  function nextStage(a) { for (var i = 0; i < STAGES.length; i++) if (!a.stages[STAGES[i]]) return STAGES[i]; return null; }
  // Interval in progress and whether it is over target.
  function overdue(a, now) {
    now = now || new Date();
    var tg = targets();
    for (var i = 0; i < INTERVALS.length; i++) {
      var iv = INTERVALS[i];
      if (a.stages[iv[2]]) continue;
      var from = startOf(a, iv[1]);
      if (iv[2] === 'assigned') continue;
      if (!from) return null;
      var el = mins(from, now);
      return { interval: iv[0], elapsed: el, target: tg[iv[0]], late: el > tg[iv[0]] };
    }
    return null;
  }
  function durations(a) {
    var out = {};
    INTERVALS.forEach(function (iv) { var f = startOf(a, iv[1]), t = a.stages[iv[2]] && a.stages[iv[2]].at; if (f && t) out[iv[0]] = mins(f, t); });
    return out;
  }

  function submit(o) {
    var a = {
      id: B.newId('ALT', (o.geo && o.geo.zone ? o.geo.zone.replace('Z-', '').slice(0, 3).toUpperCase() : 'GEN')),
      source: o.source, source_ref: o.source_ref, type: o.type, category: o.category || null,
      submitted_at: o.submitted_at || B.iso(new Date()), reporter: o.reporter || {}, geo: o.geo || {},
      description: o.description || '', info_source: o.info_source || '', supporting: o.supporting || '',
      stages: {}, outcome: 'pending', findings: '', duplicate_of: '', linked: [], urgent: !!o.urgent,
      history: [{ at: o.submitted_at || B.iso(new Date()), by: o.reporter && o.reporter.name || '-', action: 'submitted', note: '' }],
      synced: false, demo: !!o.demo
    };
    q().unshift(a);
    return a;
  }
  function act(a, stage, extra, by, at) {
    at = at || B.iso(new Date()); by = by || B.user();
    a.stages[stage] = Object.assign({ at: at, by: by }, extra || {});
    a.history.push({ at: at, by: by, action: stage, note: (extra && (extra.note || extra.to || extra.decision)) || '' });
    a.synced = false;
    if (stage === 'started') syncEvents(a, 'in_progress');
  }
  function complete(a, outcome, findings, dupOf, by, at) {
    a.outcome = outcome; a.findings = findings || ''; a.duplicate_of = dupOf || '';
    act(a, 'completed', { note: outcome }, by, at);
    syncEvents(a, { verified: 'verified', referred: 'in_progress' }[outcome] || 'discarded');
  }
  function approve(a, include, by, at) { act(a, 'approved', { include: !!include, decision: include ? 'include' : 'exclude' }, by, at); }
  // Keep RECO event verification flags (used by the triage community panel) in step.
  function syncEvents(a, status) {
    if (a.source !== 'reco') return;
    var r = B.byId(db().reports, a.source_ref); if (!r) return;
    (r.events || []).forEach(function (e) { e.verification = status; });
  }

  // Public hooks used by app.js and other modules.
  B.queue = { describe: null, submit: submit, act: act, complete: complete, approve: approve, byRef: byRef, overdue: overdue, durations: durations, targets: targets, currentStage: currentStage, OUTCOMES: OUTCOMES, DEFAULT_TAT: DEFAULT_TAT, INT_LABEL: INT_LABEL, OFFICERS: OFFICERS };
  B.isApproved = function (ref) { var a = byRef(ref); return !!(a && a.stages.approved && a.stages.approved.include); };
  B.outcomeOf = function (ref) { var a = byRef(ref); return a ? a.outcome : null; };
  B.queueStatus = function (ref) { var a = byRef(ref); if (!a) return ''; return lbl2(STAGE_LABEL[currentStage(a)]) + (a.outcome !== 'pending' ? ' - ' + lbl2(OUTCOMES[a.outcome]) : ''); };
  B.onAssessmentCreated = function (rec) {
    submit({ source: 'facility', source_ref: rec.id, type: 'triage_' + rec.result.category, category: rec.result.category, geo: rec.geo,
      reporter: { name: B.user() }, description: L('Triage ', 'Triage ') + rec.result.category + ' (score ' + rec.result.score + ')', info_source: 'health_facility', urgent: rec.result.category === 'RED' });
  };
  B.onReportCreated = function (rep, reporter) {
    var c = rep.counts, sig = c.deaths_unexplained + c.deaths_suspected_ebola + c.alerts + c.clusters;
    submit({ source: 'reco', source_ref: rep.id, type: sig ? 'reco_signal' : 'reco_routine', geo: { province: rep.province, zone: rep.zone, area: rep.area, village: rep.village },
      reporter: reporter, description: L('Rapport RECO : ', 'RECO report: ') + c.deaths_total + L(' décès, ', ' deaths, ') + rep.events.length + L(' évènement(s)', ' event(s)'), info_source: 'reco', urgent: c.deaths_suspected_ebola > 0 || c.clusters > 0 });
  };

  /* ---------- TAT indicators ---------- */
  function tatStats(list) {
    var tg = targets(), out = {};
    INTERVALS.forEach(function (iv) {
      var d = list.map(function (a) { return durations(a)[iv[0]]; }).filter(function (x) { return x != null; }).sort(function (x, y) { return x - y; });
      out[iv[0]] = { n: d.length, median: d.length ? d[Math.floor(d.length / 2)] : null, within: d.length ? Math.round(100 * d.filter(function (x) { return x <= tg[iv[0]]; }).length / d.length) : null, target: tg[iv[0]] };
    });
    var now = new Date();
    out.overdue = list.filter(function (a) { var o = overdue(a, now); return o && o.late; }).length;
    out.open = list.filter(function (a) { return !a.stages.approved; }).length;
    return out;
  }
  B.tatPanel = function (filterFn) {
    var list = q().filter(filterFn || function () { return true; });
    var t = tatStats(list);
    return '<div class="kpis">' + INTERVALS.map(function (iv) {
      var x = t[iv[0]];
      return '<div class="kpi ' + (x.within != null && x.within < 80 ? 'k-AMBER' : '') + '"><div class="kv">' + fmtMin(x.median) + '</div><div class="kl">' + esc(lbl2(INT_LABEL[iv[0]])) + ' (' + L('médiane', 'median') + ')</div><div class="ks">' + (x.within == null ? '-' : x.within + '% ') + L('dans le délai cible', 'within target') + ' (' + fmtMin(x.target) + ') · n=' + x.n + '</div></div>';
    }).join('') + '<div class="kpi ' + (t.overdue ? 'k-RED' : '') + '"><div class="kv">' + t.overdue + '</div><div class="kl">' + L('Alertes en retard', 'Overdue alerts') + '</div><div class="ks">' + t.open + L(' non clôturées', ' not closed') + '</div></div></div>';
  };

  /* ---------- Verification view ---------- */
  var vf = { source: '', bucket: 'open', overdue: false, urgent: false, open: null };
  function bucketOf(a) {
    var s = currentStage(a);
    if (s === 'approved') return 'closed';
    if (s === 'completed') return 'to_approve';
    if (s === 'started' || s === 'assigned') return 'verifying';
    if (s === 'acknowledged') return 'to_assign';
    return 'to_ack';
  }
  var BUCKETS = { open: ['Toutes ouvertes', 'All open'], to_ack: ['À accuser réception', 'To acknowledge'], to_assign: ['À assigner', 'To assign'], verifying: ['En vérification', 'In verification'], to_approve: ['À approuver', 'To approve'], closed: ['Clôturées', 'Closed'], all: ['Toutes', 'All'] };
  // Description shown in the reader's language (built from the record, not stored text).
  function describe(a) {
    var d = db();
    if (a.source === 'facility') { var r = B.byId(d.assessments, a.source_ref); return L('Triage ', 'Triage ') + (a.category || (r && r.result.category) || '') + (r ? ' (score ' + r.result.score + ')' : ''); }
    if (a.source === 'reco') { var p = B.byId(d.reports, a.source_ref); if (p) return L('Rapport RECO : ', 'RECO report: ') + p.counts.deaths_total + L(' décès, ', ' deaths, ') + p.events.length + L(' évènement(s)', ' event(s)'); }
    return B.sysText(a.description);
  }
  B.queue.describe = describe;
  function placeOf(a) {
    var g = a.geo || {};
    return esc([g.village && B.nm(B.G.villages, g.village), g.zone && B.nm(B.G.zones, g.zone)].filter(function (x) { return x && x !== '-'; }).join(', ') || a.place_text || '-');
  }

  B.VIEWS.verify = function (v) {
    var zoneScope = (B.userCtx().zone && B.st.role === 'zone_officer') ? B.userCtx().zone : '';
    var all = q().filter(function (a) { return !zoneScope || !vf.myZoneOnly || a.geo.zone === zoneScope; });
    var now = new Date();
    var rows = all.filter(function (a) {
      if (vf.source && a.source !== vf.source) return false;
      var b = bucketOf(a);
      if (vf.bucket === 'open' && b === 'closed') return false;
      if (vf.bucket !== 'open' && vf.bucket !== 'all' && b !== vf.bucket) return false;
      if (vf.overdue) { var o = overdue(a, now); if (!o || !o.late) return false; }
      if (vf.urgent && !a.urgent) return false;
      return true;
    }).sort(function (x, y) { return (y.urgent - x.urgent) || (new Date(x.submitted_at) - new Date(y.submitted_at)); });
    var shown = rows.slice(0, 150);
    var cnt = {}; all.forEach(function (a) { var b = bucketOf(a); cnt[b] = (cnt[b] || 0) + 1; });
    v.innerHTML = '<section class="card"><h2>' + L('File de vérification des alertes', 'Alert verification queue') + '</h2>' +
      '<p class="muted small">' + L('Toutes les alertes (FOSA, y compris VERT ; RECO ; rumeurs) passent par : réception → assignation → vérification → résultat → approbation. Seules les alertes vérifiées et approuvées apparaissent comme évènements vérifiés sur le tableau de bord.', 'Every alert (facility, including GREEN; RECO; rumours) goes through: receipt → assignment → verification → outcome → approval. Only verified and approved alerts appear as verified events on the dashboard.') + '</p>' +
      B.tatPanel() + '</section>' +
      '<section class="card"><div class="vbar">' +
      '<label class="inl">' + L('Source', 'Source') + ' <select id="qf-src"><option value="">' + B.t('all') + '</option>' + Object.keys(SOURCES).map(function (k) { return '<option value="' + k + '"' + (vf.source === k ? ' selected' : '') + '>' + esc(lbl2(SOURCES[k])) + '</option>'; }).join('') + '</select></label>' +
      '<label class="inl">' + L('Étape', 'Stage') + ' <select id="qf-b">' + Object.keys(BUCKETS).map(function (k) { return '<option value="' + k + '"' + (vf.bucket === k ? ' selected' : '') + '>' + esc(lbl2(BUCKETS[k])) + (cnt[k] != null ? ' (' + cnt[k] + ')' : '') + '</option>'; }).join('') + '</select></label>' +
      '<label class="check"><input type="checkbox" id="qf-late"' + (vf.overdue ? ' checked' : '') + '> ' + L('En retard', 'Overdue') + '</label>' +
      '<label class="check"><input type="checkbox" id="qf-urg"' + (vf.urgent ? ' checked' : '') + '> ' + L('Urgentes', 'Urgent') + '</label>' +
      (zoneScope ? '<label class="check"><input type="checkbox" id="qf-zone"' + (vf.myZoneOnly ? ' checked' : '') + '> ' + L('Ma zone seulement', 'My zone only') + '</label>' : '') + '</div>' +
      '<p class="small">' + rows.length + L(' alerte(s)', ' alert(s)') + (rows.length > shown.length ? L(' (150 premières affichées)', ' (first 150 shown)') : '') + '</p>' +
      '<div class="vbar"><label class="check"><input type="checkbox" id="qsel-all"> ' + L('Tout sélectionner', 'Select all') + '</label>' +
      '<button class="sm" data-bulk="acknowledged">' + L('Accuser réception', 'Acknowledge') + '</button><button class="sm" data-bulk="assigned">' + L('M\'assigner', 'Assign to me') + '</button><button class="sm" data-bulk="started">' + L('Démarrer la vérification', 'Start verification') + '</button><button class="sm" data-bulk="verified">' + L('Conclure : vérifiée', 'Complete: verified') + '</button><button class="sm primary" data-bulk="approved">' + L('Approuver pour le tableau de bord', 'Approve for dashboard') + '</button></div>' +
      '<div class="scroll"><table class="tbl"><tr><th></th><th>ID</th><th>' + L('Source / type', 'Source / type') + '</th><th>' + L('Lieu', 'Location') + '</th><th>' + L('Soumise', 'Submitted') + '</th><th>' + L('Étape', 'Stage') + '</th><th>' + L('Résultat', 'Outcome') + '</th><th>' + L('Délai', 'Timeliness') + '</th></tr>' +
      shown.map(function (a) {
        var o = overdue(a, now);
        return '<tr class="qrow' + (vf.open === a.id ? ' on' : '') + '"><td><input type="checkbox" data-qsel="' + a.id + '"></td><td><a href="#" data-qopen="' + a.id + '"><code>' + esc(a.id) + '</code></a>' + (a.urgent ? ' <span class="sig">' + L('URGENT', 'URGENT') + '</span>' : '') + '</td>' +
          '<td>' + esc(lbl2(SOURCES[a.source])) + '<br><small>' + esc(a.type) + '</small></td><td>' + placeOf(a) + '</td><td>' + B.fmtDT(a.submitted_at) + '</td>' +
          '<td>' + esc(lbl2(STAGE_LABEL[currentStage(a)])) + '</td><td>' + esc(lbl2(OUTCOMES[a.outcome])) + (a.stages.approved ? (a.stages.approved.include ? ' ✓' : ' ✕') : '') + '</td>' +
          '<td>' + (o ? '<span class="' + (o.late ? 'flag' : 'muted') + ' small">' + fmtMin(o.elapsed) + ' / ' + fmtMin(o.target) + (o.late ? L(' en retard', ' late') : '') + '</span>' : '<span class="muted small">' + L('clôturée', 'closed') + '</span>') + '</td></tr>';
      }).join('') + '</table></div></section><section class="card" id="qdetail"></section>';
    var b = function (id) { return B.$(id, v); };
    b('#qf-src').onchange = function () { vf.source = this.value; B.VIEWS.verify(v); };
    b('#qf-b').onchange = function () { vf.bucket = this.value; B.VIEWS.verify(v); };
    b('#qf-late').onchange = function () { vf.overdue = this.checked; B.VIEWS.verify(v); };
    b('#qf-urg').onchange = function () { vf.urgent = this.checked; B.VIEWS.verify(v); };
    if (b('#qf-zone')) b('#qf-zone').onchange = function () { vf.myZoneOnly = this.checked; B.VIEWS.verify(v); };
    b('#qsel-all').onchange = function () { var c = this.checked; B.$$('[data-qsel]', v).forEach(function (x) { x.checked = c; }); };
    B.$$('[data-qopen]', v).forEach(function (el) { el.onclick = function (e) { e.preventDefault(); vf.open = el.getAttribute('data-qopen'); detail(v); }; });
    B.$$('[data-bulk]', v).forEach(function (btn) {
      btn.onclick = function () {
        var ids = B.$$('[data-qsel]:checked', v).map(function (x) { return x.getAttribute('data-qsel'); });
        if (!ids.length) { B.notify(L('Sélectionnez au moins une alerte.', 'Select at least one alert.'), 'err'); return; }
        var kind = btn.getAttribute('data-bulk'), n = 0, skipped = 0;
        ids.forEach(function (id) {
          var a = B.byId(q(), id);
          if (kind === 'verified') { if (a.stages.started && !a.stages.completed) { complete(a, 'verified', 'key:bulk_verify'); n++; } else skipped++; return; }
          if (kind === 'approved') { if (a.stages.completed && !a.stages.approved) { approve(a, a.outcome === 'verified' || a.outcome === 'referred'); n++; } else skipped++; return; }
          if (nextStage(a) !== kind) { skipped++; return; }
          act(a, kind, kind === 'assigned' ? { to: B.user() } : null); n++;
        });
        B.audit('queue_bulk_' + kind, 'alert', n + ' alert(s)', skipped ? skipped + ' skipped' : '');
        B.save(); B.notify(n + L(' alerte(s) mise(s) à jour', ' alert(s) updated') + (skipped ? ' · ' + skipped + L(' ignorée(s) (mauvaise étape)', ' skipped (wrong stage)') : ''));
        B.VIEWS.verify(v);
      };
    });
    if (vf.open) detail(v);
  };

  function sourceLink(a) {
    if (a.source === 'facility') return '<a href="#" data-gocase="' + esc(a.source_ref) + '">' + esc(a.source_ref) + '</a>';
    return '<code>' + esc(a.source_ref) + '</code>';
  }
  function detail(v) {
    var a = B.byId(q(), vf.open), box = B.$('#qdetail', v);
    if (!a || !box) return;
    var ns = nextStage(a), canAct = B.can('verify');
    var phone = a.reporter && a.reporter.phone;
    var body = '<h3>' + esc(a.id) + ' · ' + esc(lbl2(SOURCES[a.source])) + (a.urgent ? ' <span class="sig">URGENT</span>' : '') + '</h3>' +
      '<div class="grid small"><div><b>' + L('Type', 'Type') + '</b><br>' + esc(a.type) + '</div><div><b>' + L('Lieu', 'Location') + '</b><br>' + placeOf(a) + '</div><div><b>' + L('Soumise', 'Submitted') + '</b><br>' + B.fmtDT(a.submitted_at) + '</div>' +
      '<div><b>' + L('Source de l\'information', 'Information source') + '</b><br>' + esc(a.info_source || '-') + '</div><div><b>' + L('Signalée par', 'Reported by') + '</b><br>' + esc(a.reporter && a.reporter.anonymous ? L('Anonyme', 'Anonymous') : (a.reporter && a.reporter.name) || '-') + '</div>' +
      '<div><b>' + L('Téléphone du déclarant', 'Reporter phone') + '</b><br>' + (phone ? (canAct ? esc(phone) + ' <button class="sm ghost" id="qcall">' + L('Noter : déclarant contacté', 'Log: reporter contacted') + '</button>' : L('masqué', 'hidden')) : '-') + '</div>' +
      '<div><b>' + L('Enregistrement source', 'Source record') + '</b><br>' + sourceLink(a) + '</div></div>' +
      '<p><b>' + L('Description', 'Description') + ' :</b> ' + esc(describe(a)) + (a.supporting ? '<br><b>' + L('Informations complémentaires', 'Supporting information') + ' :</b> ' + esc(B.sysText(a.supporting)) : '') + '</p>' +
      '<p><b>' + L('Résultat', 'Outcome') + ' :</b> ' + esc(lbl2(OUTCOMES[a.outcome])) + (a.findings ? ' - ' + esc(B.sysText(a.findings)) : '') + (a.duplicate_of ? ' · ' + L('doublon de ', 'duplicate of ') + esc(a.duplicate_of) : '') + (a.linked.length ? ' · ' + L('lié à ', 'linked to ') + esc(a.linked.join(', ')) : '') + '</p>';
    if (canAct) {
      body += '<div class="vbar">';
      if (ns === 'acknowledged') body += '<button class="primary" data-step="acknowledged">' + L('Accuser réception', 'Acknowledge receipt') + '</button>';
      if (ns === 'assigned') body += '<label class="inl">' + L('Assigner à', 'Assign to') + ' <select id="qto">' + OFFICERS.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select></label><button class="primary" data-step="assigned">' + L('Assigner', 'Assign') + '</button>';
      if (ns === 'started') body += '<button class="primary" data-step="started">' + L('Démarrer la vérification', 'Start verification') + '</button>';
      body += '</div>';
      if (ns === 'completed') {
        body += '<div class="grid"><label>' + L('Résultat de la vérification', 'Verification outcome') + '<select id="qout">' + Object.keys(OUTCOMES).filter(function (k) { return k !== 'pending'; }).map(function (k) { return '<option value="' + k + '">' + esc(lbl2(OUTCOMES[k])) + '</option>'; }).join('') + '</select></label>' +
          '<label>' + L('Doublon de (ID d\'alerte)', 'Duplicate of (alert ID)') + '<input id="qdup" placeholder="ALT-…"></label>' +
          '<label class="wide">' + L('Constatations', 'Findings') + '<input id="qfind"></label></div><button class="primary" data-step="completed">' + L('Enregistrer le résultat', 'Record outcome') + '</button>';
      }
      if (ns === 'approved') {
        var inc = a.outcome === 'verified' || a.outcome === 'referred';
        body += '<p class="small">' + (inc ? L('Résultat positif : l\'approbation ajoute cet évènement au tableau de bord comme vérifié.', 'Positive outcome: approval adds this event to the dashboard as verified.') : L('Résultat négatif : la décision finale clôt l\'alerte sans l\'ajouter au tableau de bord.', 'Negative outcome: the final decision closes the alert without adding it to the dashboard.')) + '</p>' +
          '<button class="primary" data-step="approved">' + (inc ? L('Approuver pour le tableau de bord', 'Approve for dashboard') : L('Clôturer (exclure du tableau de bord)', 'Close (exclude from dashboard)')) + '</button>';
      }
      body += '<div class="vbar"><button class="ghost sm" id="qurg">' + (a.urgent ? L('Retirer l\'urgence', 'Remove urgent flag') : L('Escalader (urgent)', 'Escalate (urgent)')) + '</button>' +
        '<input id="qlink" placeholder="' + L('Lier à un cas / évènement (ID)', 'Link to case / event (ID)') + '" style="max-width:260px"><button class="ghost sm" id="qlinkb">' + L('Lier', 'Link') + '</button></div>';
    }
    body += '<h4>' + L('Historique', 'History') + '</h4><div class="scroll"><table class="tbl small"><tr><th>' + L('Quand', 'When') + '</th><th>' + L('Action', 'Action') + '</th><th>' + L('Par', 'By') + '</th><th>' + L('Note', 'Note') + '</th></tr>' +
      a.history.map(function (h) { return '<tr><td>' + B.fmtDT(h.at) + '</td><td>' + esc(lbl2(STAGE_LABEL[h.action]) || h.action) + '</td><td>' + esc(h.by) + '</td><td>' + esc(B.sysText(h.note)) + '</td></tr>'; }).join('') + '</table></div>' +
      '<p class="small">' + L('Durées : ', 'Durations: ') + INTERVALS.map(function (iv) { return esc(lbl2(INT_LABEL[iv[0]])) + ' ' + fmtMin(durations(a)[iv[0]]); }).join(' · ') + '</p>';
    box.innerHTML = body;
    var after = function (what) { B.audit('queue_' + what, 'alert', a.id, a.outcome); B.save(); B.VIEWS.verify(v); };
    B.$$('[data-step]', box).forEach(function (btn) {
      btn.onclick = function () {
        var s = btn.getAttribute('data-step');
        if (s === 'assigned') act(a, 'assigned', { to: B.$('#qto', box).value });
        else if (s === 'completed') {
          var out = B.$('#qout', box).value, dup = B.$('#qdup', box).value.trim();
          if (out === 'duplicate' && !B.byId(q(), dup)) { B.notify(L('Indiquez l\'ID de l\'alerte d\'origine (doublon).', 'Enter the ID of the original alert (duplicate).'), 'err'); return; }
          complete(a, out, B.$('#qfind', box).value, dup);
        } else if (s === 'approved') approve(a, a.outcome === 'verified' || a.outcome === 'referred');
        else act(a, s);
        after(s);
      };
    });
    var urg = B.$('#qurg', box); if (urg) urg.onclick = function () { a.urgent = !a.urgent; a.history.push({ at: B.iso(new Date()), by: B.user(), action: a.urgent ? 'escalated' : 'de-escalated', note: '' }); after('escalate'); };
    var call = B.$('#qcall', box); if (call) call.onclick = function () { a.history.push({ at: B.iso(new Date()), by: B.user(), action: 'reporter_contacted', note: '' }); after('contact_reporter'); };
    var lk = B.$('#qlinkb', box); if (lk) lk.onclick = function () {
      var id = B.$('#qlink', box).value.trim(), d = db();
      var exists = B.byId(d.assessments, id) || B.byId(d.reports, id) || B.byId(d.rumours, id) || B.byId(q(), id) || B.byId(d.contacts, id);
      if (!exists) { B.notify(L('ID introuvable.', 'ID not found.'), 'err'); return; }
      a.linked.push(id); a.history.push({ at: B.iso(new Date()), by: B.user(), action: 'linked', note: id }); after('link');
    };
    B.$$('[data-gocase]', box).forEach(function (el) { el.onclick = function (e) { e.preventDefault(); B.st.lastId = el.getAttribute('data-gocase'); B.go('result'); }; });
  }

  /* ---------- Rumour dashboard ---------- */
  B.VIEWS.rumours = function (v) {
    var d = db(), list = d.rumours.slice().sort(function (a, b) { return new Date(b.submitted_at) - new Date(a.submitted_at); });
    var aOf = function (r) { return byRef(r.id); };
    var c = { submitted: list.length, pending: 0, verified: 0, unverified: 0, closed: 0 };
    list.forEach(function (r) {
      var a = aOf(r); if (!a) return;
      if (!a.stages.completed) c.pending++;
      if (a.outcome === 'verified' || a.outcome === 'referred') c.verified++;
      if (a.outcome === 'not_verified' || a.outcome === 'insufficient' || a.outcome === 'duplicate') c.unverified++;
      if (a.stages.approved) c.closed++;
    });
    var agg = B.can('aggregate_only');
    var byType = {}; list.forEach(function (r) { byType[r.type] = (byType[r.type] || 0) + 1; });
    var k = function (l, n, cls) { return '<div class="kpi ' + (cls || '') + '"><div class="kv">' + n + '</div><div class="kl">' + esc(l) + '</div></div>'; };
    v.innerHTML = '<section class="card"><h2>' + L('Tableau de bord des rumeurs', 'Rumour dashboard') + '</h2><p class="muted small">' + L('Une rumeur n\'est jamais classée automatiquement comme cas suspect ou confirmé : elle passe par la file de vérification.', 'A rumour is never automatically classified as a suspected or confirmed case: it goes through the verification queue.') + '</p>' +
      '<div class="kpis">' + k(L('Soumises', 'Submitted'), c.submitted) + k(L('En attente de vérification', 'Pending verification'), c.pending, c.pending ? 'k-AMBER' : '') + k(L('Vérifiées', 'Verified'), c.verified, 'k-RED') + k(L('Non vérifiées / doublons / insuffisantes', 'Not verified / duplicate / insufficient'), c.unverified) + k(L('Clôturées', 'Closed'), c.closed, 'k-GREEN') + '</div>' +
      '<h4>' + L('Par type', 'By type') + '</h4>' + B.bars(Object.keys(byType).map(function (t) { return { label: B.evLabel(t), value: byType[t] }; }).sort(function (x, y) { return y.value - x.value; }), '#9a3412') +
      (B.tatPanel ? '<h4>' + L('Délais de traitement (rumeurs)', 'Turnaround (rumours)') + '</h4>' + B.tatPanel(function (a) { return a.source === 'rumour'; }) : '') + '</section>' +
      '<section class="card"><h3>' + L('Rumeurs récentes', 'Recent rumours') + '</h3><div class="scroll"><table class="tbl"><tr><th>ID</th><th>' + L('Type', 'Type') + '</th><th>' + L('Lieu', 'Location') + '</th><th>' + L('Survenu', 'Occurred') + '</th><th>' + L('Décès', 'Deaths') + '</th><th>' + L('Déclarant', 'Reporter') + '</th><th>' + L('Statut', 'Status') + '</th></tr>' +
      list.slice(0, 100).map(function (r) {
        var a = aOf(r);
        return '<tr><td><code>' + esc(r.id) + '</code></td><td>' + esc(B.evLabel(r.type)) + '</td><td>' + esc([B.nm(B.G.zones, r.geo.zone), r.place_text].filter(function (x) { return x && x !== '-'; }).join(' · ')) + '</td><td>' + B.fmtD(r.date_occurred) + '</td><td>' + (r.n_deaths || 0) + '</td>' +
          '<td>' + (r.anonymous ? L('Anonyme', 'Anonymous') : esc(r.relationship || '-')) + (agg ? '' : (r.phone ? ' · ' + (B.can('verify') ? esc(r.phone) : L('tél. masqué', 'phone hidden')) : '')) + '</td><td>' + esc(a ? B.queueStatus(r.id) : '-') + (a && B.can('verify') ? ' <button class="sm" data-openq="' + a.id + '">' + L('Ouvrir', 'Open') + '</button>' : '') + '</td></tr>';
      }).join('') + '</table></div></section>';
    B.$$('[data-openq]', v).forEach(function (b) { b.onclick = function () { vf.open = b.getAttribute('data-openq'); vf.bucket = 'all'; vf.source = 'rumour'; B.go('verify'); }; });
  };
})();
