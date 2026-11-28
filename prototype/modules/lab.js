/* Laboratory: test requests from clinical staff, sample details, testing on site or at a referral
 * laboratory, result entry by the tester and approval by the laboratory manager.
 *
 *  1. A health worker or clinician requests a test for a patient (the case ID and patient details
 *     are linked automatically).
 *  2. Laboratory staff record the sample: laboratory ID, sample type, collection date and time,
 *     and whether it is tested on site or sent to a referral laboratory (chosen from a list).
 *  3. The tester (the signed-in laboratory account) enters the result.
 *  4. The laboratory manager approves it; only then is it released to the clinicians and does it
 *     change the case classification. A case is laboratory-confirmed ONLY by a released positive.
 * Every step is in the sample's chain of custody and the audit log; each sample has its own report.
 */
(function () {
  'use strict';
  var B = window.BDBV;
  var L = function (f, e) { return B.L(f, e); };
  var esc = function (x) { return B.esc(x); };

  var STATUS = {
    requested: ['Test demandé', 'Test requested'], collected: ['Prélevé', 'Collected'], in_transit: ['Envoyé au laboratoire de référence', 'Sent to referral laboratory'],
    received: ['Reçu au laboratoire', 'Received by laboratory'], under_analysis: ['En cours d\'analyse', 'Undergoing analysis'],
    result_entered: ['Résultat saisi, en attente d\'approbation', 'Result entered, awaiting approval'], result_released: ['Résultat approuvé et publié', 'Result approved and released'],
    repeat_required: ['Nouveau prélèvement requis', 'Repeat sample required'],
    // earlier records
    awaiting_collection: ['En attente de prélèvement', 'Awaiting collection'], awaiting_dispatch: ['En attente d\'expédition', 'Awaiting dispatch'],
    analysed_onsite: ['Analysé sur place', 'Analysed on-site'], referred_external: ['Référé à un laboratoire externe', 'Referred to external laboratory'], result_pending: ['Résultat en attente', 'Result pending']
  };
  var GROUPS = [
    ['req', ['Demandes', 'Requests'], ['requested', 'awaiting_collection']],
    ['work', ['En cours', 'In progress'], ['collected', 'in_transit', 'received', 'under_analysis', 'awaiting_dispatch', 'analysed_onsite', 'referred_external', 'result_pending']],
    ['appr', ['À approuver', 'Awaiting approval'], ['result_entered']],
    ['done', ['Publiés', 'Released'], ['result_released']],
    ['rep', ['À refaire', 'Repeat'], ['repeat_required']]
  ];
  var TYPES = [['whole_blood', 'Sang total (EDTA)', 'Whole blood (EDTA)'], ['serum', 'Sérum', 'Serum'], ['plasma', 'Plasma', 'Plasma'], ['oral_swab', 'Écouvillon buccal (post-mortem)', 'Oral swab (post-mortem)'], ['other', 'Autre', 'Other']];
  var RESULTS = { positive: ['POSITIF', 'POSITIVE'], negative: ['Négatif', 'Negative'], inconclusive: ['Non concluant / invalide', 'Inconclusive / invalid'] };
  var METHODS = ['RT-PCR (GeneXpert)', 'RT-PCR (autre plateforme / other platform)', 'Autre / other'];
  // Default list; the system administrator can change it (Configuration). Names to be confirmed with the MoH.
  var DEFAULT_LABS = ['INRB Kinshasa (laboratoire national de référence)', 'INRB Goma', 'Laboratoire provincial de santé publique (à préciser)'];
  var lbl2 = function (p) { return p ? L(p[0], p[1]) : ''; };
  var typeName = function (k) { var t = TYPES.filter(function (x) { return x[0] === k; })[0]; return t ? L(t[1], t[2]) : (k || '-'); };
  function db() { return B.db(); }
  function labs() { var c = db().config || {}; return (c.referral_labs && c.referral_labs.length ? c.referral_labs : DEFAULT_LABS); }
  var isLab = function () { return B.can('lab_results'); };
  var isManager = function () { return B.can('lab_approve'); };

  function samplesOf(caseId) { return db().samples.filter(function (s) { return s.case_id === caseId; }).sort(function (a, b) { return new Date(a.created_at) - new Date(b.created_at); }); }
  function latest(caseId) { var l = samplesOf(caseId); return l[l.length - 1]; }
  // Older records: a test marked as requested on the patient but no request record yet.
  function requestedNoSample() { return db().assessments.filter(function (a) { return a.lab && a.lab.status === 'requested' && !samplesOf(a.id).length; }); }

  B.labSummary = function (caseId) {
    var s = latest(caseId);
    if (!s) { var a = B.byId(db().assessments, caseId); return a && a.lab && a.lab.status === 'requested' ? esc(lbl2(STATUS.requested)) : '-'; }
    return esc(lbl2(STATUS[s.status])) + (s.result && s.status === 'result_released' ? ' · <b>' + esc(lbl2(RESULTS[s.result])) + '</b>' : '');
  };
  B.labApi = {
    STATUS: STATUS, RESULTS: RESULTS, TYPES: TYPES, samplesOf: samplesOf, latest: latest, requestedNoSample: requestedNoSample, labs: labs,
    caseLab: function (caseId) {
      var l = samplesOf(caseId), rel = l.filter(function (s) { return s.status === 'result_released'; });
      var last = rel[rel.length - 1], a = B.byId(db().assessments, caseId) || {};
      var open = l.filter(function (s) { return s.status === 'requested'; });
      return { samples: l.filter(function (s) { return s.status !== 'requested'; }).length, awaitingTest: (!l.length && a.lab && a.lab.status === 'requested') || (open.length > 0 && l.length === open.length), awaitingResult: l.some(function (s) { return ['requested', 'result_released'].indexOf(s.status) < 0; }) && !rel.length, result: last ? last.result : null };
    }
  };

  function custody(s, action, from, to, by, at) { s.custody = s.custody || []; s.custody.push({ at: at || B.iso(new Date()), action: action, from: from || '', to: to || '', by: by || B.user() }); }
  function touch(s) { s.synced = false; s.updated_at = B.iso(new Date()); }
  function syncCase(s) {
    var a = B.byId(db().assessments, s.case_id); if (!a) return;
    a.lab = a.lab || { status: 'none' };
    if (s.status === 'result_released') {
      a.lab = { status: s.result === 'positive' ? 'pos' : (s.result === 'negative' ? 'neg' : 'collected'), at: s.released_at };
      if (s.result === 'positive') a.classification = { status: 'confirmed', at: s.released_at, by: s.released_by + ' (labo ' + (s.lab_id || s.id) + ')' };
      else if (s.result === 'negative' && a.classification && a.classification.status !== 'confirmed') a.classification = { status: 'lab_negative', at: s.released_at, by: s.released_by + ' (labo ' + (s.lab_id || s.id) + ')' };
    } else if (s.status === 'requested') { if (a.lab.status === 'none') a.lab = { status: 'requested', at: s.created_at }; }
    else if (a.lab.status === 'none' || a.lab.status === 'requested') a.lab = { status: 'collected', at: s.collected_at };
    a.synced = false;
  }
  function patientOf(a) {
    if (!a) return '-';
    var p = a.person || {}, name = B.can('see_names') && (p.last || p.first) ? (p.last || '') + ' ' + (p.first || '') + ' · ' : '';
    return name + (p.age != null ? p.age + ' ' + L('ans', 'y') : '') + (p.sex ? ' · ' + p.sex : '');
  }

  /* ---------- actions ---------- */
  // 1. Test request by clinical staff (patient details linked through the case ID).
  B.labApi.request = function (caseId, note, priority, by) {
    var a = B.byId(db().assessments, caseId); if (!a) return null;
    var open = samplesOf(caseId).filter(function (s) { return s.status === 'requested'; })[0]; if (open) return open;
    var now = B.iso(new Date());
    var s = { id: B.newId('SMP', 'LAB'), lab_id: '', case_id: a.id, status: 'requested', request: { by: by || B.user(), at: now, note: note || '', priority: priority || 'routine', facility: a.geo.facility },
      type: '', collected_at: null, collection_place: B.nm(B.G.facilities, a.geo.facility), collector: '', testing_site: { kind: '', name: '' }, received_at: null, method: '', ct: '', result: null, result_note: '',
      tested_by: null, tested_at: null, approved_by: null, approved_at: null, released_at: null, released_by: null, custody: [], created_at: now, synced: false };
    custody(s, 'requested', B.nm(B.G.facilities, a.geo.facility), '', s.request.by, now);
    db().samples.unshift(s); syncCase(s);
    return s;
  };
  // 2. Sample details recorded by the laboratory.
  B.labApi.collect = function (s, o) {
    s.lab_id = o.lab_id; s.type = o.type; s.collected_at = o.collected_at; s.collector = o.collector || B.user();
    s.testing_site = o.kind === 'external' ? { kind: 'external', name: o.lab_name } : { kind: 'onsite', name: o.lab_name || L('Sur place', 'On site') };
    custody(s, 'collected', s.collector, s.collection_place, B.user(), s.collected_at);
    if (o.kind === 'external') { s.status = 'in_transit'; custody(s, 'in_transit', s.collection_place, o.lab_name, B.user()); }
    else { s.status = 'under_analysis'; custody(s, 'under_analysis', '', s.testing_site.name, B.user()); }
    touch(s); syncCase(s);
  };
  // 3. Result entered by the tester (the signed-in laboratory account).
  B.labApi.enter = function (s, result, method, ct, note, by, at) {
    s.result = result; s.method = method; s.ct = ct || ''; s.result_note = note || ''; s.tested_by = by || B.user(); s.tested_at = at || B.iso(new Date());
    s.status = 'result_entered'; s.return_note = '';
    custody(s, 'result_entered', '', '', s.tested_by, s.tested_at); touch(s);
  };
  // 4. Approval by the laboratory manager: releases the result (or returns it for correction).
  B.labApi.approve = function (s, by, at) {
    s.approved_by = by || B.user(); s.approved_at = at || B.iso(new Date());
    s.released_by = s.approved_by; s.released_at = s.approved_at;
    s.status = s.result === 'inconclusive' ? 'repeat_required' : 'result_released'; s.repeat = s.result === 'inconclusive';
    custody(s, 'result_released', '', '', s.approved_by, s.approved_at); touch(s); syncCase(s);
  };
  B.labApi.returnForCorrection = function (s, note) {
    s.status = 'under_analysis'; s.return_note = note; custody(s, 'returned', '', '', B.user() + ' : ' + note); touch(s);
  };
  B.labApi.setStatus = function (s, st, from, to, by, at) {
    s.status = st; if (st === 'received') s.received_at = at || B.iso(new Date());
    custody(s, st, from, to, by, at); touch(s); syncCase(s);
  };
  // Synthetic data and earlier code: a sample registered with its details in one step.
  B.labApi.register = function (o) {
    var s = { id: B.newId('SMP', 'LAB'), lab_id: o.lab_id || (o.demo ? 'DEMO-' + (1000 + db().samples.length) : ''), case_id: o.case_id, type: o.type, collected_at: o.collected_at, collection_place: o.collection_place, collector: o.collector,
      testing_site: o.testing_site, received_at: null, method: '', ct: '', status: o.status || 'collected', result: null, result_note: '', tested_by: null, tested_at: null, approved_by: null, approved_at: null,
      released_at: null, released_by: null, repeat: false, comments: o.comments || '', request: o.request || null, custody: [], created_at: o.created_at || B.iso(new Date()), synced: false, demo: !!o.demo };
    custody(s, 'collected', o.collector, o.collection_place, o.by || B.user(), o.collected_at);
    db().samples.unshift(s); syncCase(s);
    return s;
  };
  // Synthetic data: result entered and approved in one step.
  B.labApi.release = function (s, result, method, comments, by, at, manager) {
    B.labApi.enter(s, result, method, '', comments, by, at);
    B.labApi.approve(s, manager || by, at);
  };

  /* ---------- screens ---------- */
  var lf = { group: '', open: null, q: '' };
  function inGroup(s) { if (!lf.group) return true; var g = GROUPS.filter(function (x) { return x[0] === lf.group; })[0]; return g && g[2].indexOf(s.status) >= 0; }

  B.VIEWS.lab = function (v) {
    var d = db(), clinical = B.can('sample_register') && !isLab();
    var all = d.samples.slice().sort(function (a, b) { return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at); });
    var legacy = requestedNoSample();
    var cnt = {}; GROUPS.forEach(function (g) { cnt[g[0]] = all.filter(function (s) { return g[2].indexOf(s.status) >= 0; }).length; }); cnt.req += legacy.length;
    var q = lf.q.trim().toLowerCase();
    var rows = all.filter(inGroup).filter(function (s) { return !q || [s.id, s.lab_id, s.case_id].join(' ').toLowerCase().indexOf(q) >= 0; });
    v.innerHTML = '<section class="card"><p class="eyebrow">' + L('Laboratoire', 'Laboratory') + '</p><h2>' + (clinical ? L('Demandes de tests et résultats', 'Test requests and results') : L('Échantillons et résultats', 'Samples and results')) + '</h2>' +
      '<p class="disclaimer small">' + L('Un cas n\'est confirmé par le laboratoire QUE lorsqu\'un résultat positif est approuvé par le responsable du laboratoire. Le prélèvement ou l\'envoi d\'un échantillon ne confirme rien.', 'A case is laboratory-confirmed ONLY when a positive result is approved by the laboratory manager. Collecting or sending a sample confirms nothing.') + '</p>' +
      '<div class="kpis">' + GROUPS.map(function (g) { return '<button class="kpi kbtn' + (lf.group === g[0] ? ' on' : '') + '" data-lgrp="' + g[0] + '"><div class="kv">' + cnt[g[0]] + '</div><div class="kl">' + esc(lbl2(g[1])) + '</div></button>'; }).join('') +
      '<button class="kpi kbtn' + (!lf.group ? ' on' : '') + '" data-lgrp=""><div class="kv">' + all.length + '</div><div class="kl">' + L('Tous', 'All') + '</div></button></div></section>' +
      (B.can('sample_register') ? requestCard() : '') +
      (legacy.length && isLab() ? '<section class="card warn"><h3>' + L('Tests demandés sans demande enregistrée', 'Tests marked as requested with no request record') + ' (' + legacy.length + ')</h3><p class="small">' + legacy.slice(0, 30).map(function (a) { return '<button class="sm" data-legacy="' + esc(a.id) + '">' + esc(a.id) + '</button>'; }).join(' ') + '</p></section>' : '') +
      '<section class="card"><div class="mhead"><h3>' + (lf.group ? esc(lbl2(GROUPS.filter(function (x) { return x[0] === lf.group; })[0][1])) : L('Tous les échantillons', 'All samples')) + ' (' + rows.length + ')</h3>' +
      '<label class="msearch">' + L('Rechercher', 'Search') + ' <input id="lq" value="' + esc(lf.q) + '" placeholder="' + L('ID labo, échantillon ou cas', 'lab ID, sample or case ID') + '"></label></div>' +
      (rows.length ? '<div class="scroll"><table class="tbl small lrows"><tr><th>' + L('ID labo', 'Lab ID') + '</th><th>' + L('Cas / patient', 'Case / patient') + '</th><th>' + L('Demandé', 'Requested') + '</th><th>' + L('Échantillon', 'Sample') + '</th><th>' + L('Analyse', 'Testing') + '</th><th>' + L('Statut', 'Status') + '</th><th>' + L('Résultat', 'Result') + '</th></tr>' +
        rows.slice(0, 300).map(function (s) {
          var a = B.byId(d.assessments, s.case_id);
          return '<tr class="lrow' + (lf.open === s.id ? ' on' : '') + '" data-sopen="' + esc(s.id) + '" tabindex="0"><td><b>' + esc(s.lab_id || '-') + '</b><br><code>' + esc(s.id) + '</code>' + (s.demo ? ' <span class="tag">' + L('démo', 'demo') + '</span>' : '') + (s.request && s.request.priority === 'urgent' && s.status === 'requested' ? ' <span class="flag small">' + L('urgent', 'urgent') + '</span>' : '') + '</td>' +
            '<td><code>' + esc(s.case_id) + '</code><br><span class="muted">' + esc(patientOf(a)) + '</span></td><td>' + (s.request ? B.fmtDT(s.request.at) + '<br><span class="muted">' + esc(s.request.by) + '</span>' : '-') + '</td>' +
            '<td>' + esc(s.type ? typeName(s.type) : '-') + (s.collected_at ? '<br><span class="muted">' + B.fmtDT(s.collected_at) + '</span>' : '') + '</td>' +
            '<td>' + (s.testing_site && s.testing_site.kind ? esc(s.testing_site.kind === 'onsite' ? L('Sur place', 'On site') : s.testing_site.name) : '-') + '</td>' +
            '<td>' + esc(lbl2(STATUS[s.status])) + '</td><td>' + (s.status === 'result_released' ? '<b>' + esc(lbl2(RESULTS[s.result])) + '</b>' : (s.status === 'result_entered' && (isLab() || isManager()) ? '<span class="muted">' + esc(lbl2(RESULTS[s.result])) + ' (' + L('non approuvé', 'not approved') + ')</span>' : '-')) + '</td></tr>';
        }).join('') + '</table></div>' : '<p class="muted">' + L('Aucun échantillon dans cette liste.', 'No samples in this list.') + '</p>') +
      '</section><section class="card" id="ldetail"' + (lf.open ? '' : ' hidden') + '></section>' + whereView();

    B.$$('[data-lgrp]', v).forEach(function (b) { b.onclick = function () { lf.group = b.getAttribute('data-lgrp'); B.VIEWS.lab(v); }; });
    B.$('#lq', v).onchange = function () { lf.q = this.value; B.VIEWS.lab(v); };
    B.$$('[data-sopen]', v).forEach(function (r) {
      var open = function () { lf.open = r.getAttribute('data-sopen'); B.$$('.lrow', v).forEach(function (x) { x.classList.toggle('on', x === r); }); detail(v); };
      r.onclick = open; r.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
    });
    B.$$('[data-legacy]', v).forEach(function (b) { b.onclick = function () { var s = B.labApi.request(b.getAttribute('data-legacy'), '', 'routine', B.user()); B.save(); lf.open = s.id; B.VIEWS.lab(v); }; });
    var rf = B.$('#lreq', v);
    if (rf) rf.onsubmit = function (e) {
      e.preventDefault();
      var E = rf.elements, a = B.byId(db().assessments, E.rcase.value.trim());
      if (!a) { B.notify(L('ID de cas introuvable.', 'Case ID not found.'), 'err'); return; }
      var s = B.labApi.request(a.id, E.rnote.value, E.rprio.value);
      B.audit('lab_request', 'sample', s.id, a.id); B.save();
      B.notify(L('Demande envoyée au laboratoire : ', 'Request sent to the laboratory: ') + a.id, 'ok');
      lf.open = s.id; lf.group = ''; B.VIEWS.lab(v);
    };
    if (lf.open) detail(v);
  };

  function requestCard() {
    var d = db(), cases = d.assessments.filter(function (a) { return !samplesOf(a.id).some(function (s) { return s.status !== 'result_released'; }); }).slice(0, 400);
    return '<section class="card"><details id="lnew"' + (isLab() ? '' : ' open') + '><summary>' + L('Demander un test de laboratoire', 'Request a laboratory test') + '</summary>' +
      '<form id="lreq" class="grid" novalidate><label>' + L('Cas (ID)', 'Case (ID)') + ' *<input name="rcase" list="lcases" placeholder="BDB-…" autocomplete="off"><datalist id="lcases">' +
      cases.map(function (a) { return '<option value="' + esc(a.id) + '">' + esc(patientOf(a) + ' · ' + B.t(a.result.category)) + '</option>'; }).join('') + '</datalist></label>' +
      '<label>' + L('Priorité', 'Priority') + '<select name="rprio"><option value="urgent">' + L('Urgente', 'Urgent') + '</option><option value="routine">' + L('Routine', 'Routine') + '</option></select></label>' +
      '<label class="wide">' + L('Note pour le laboratoire', 'Note for the laboratory') + '<input name="rnote" maxlength="300"></label>' +
      '<div class="wide"><button class="primary" type="submit">' + L('Envoyer la demande', 'Send request') + '</button></div></form></details></section>';
  }

  function field(label, value) { return '<div><b>' + esc(label) + '</b><br>' + (value == null || value === '' ? '-' : value) + '</div>'; }

  function detail(v) {
    var s = B.byId(db().samples, lf.open), box = B.$('#ldetail', v); if (!s || !box) return;
    box.setAttribute('data-draft', 'l:' + s.id);
    box.hidden = false;
    var a = B.byId(db().assessments, s.case_id), now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    var html = '<div class="mhead"><div><p class="eyebrow">' + L('Échantillon', 'Sample') + '</p><h3>' + esc(s.lab_id || L('ID labo à attribuer', 'Lab ID to assign')) + ' <span class="muted small">' + esc(s.id) + '</span></h3></div>' +
      '<div class="vbar"><button class="sm" id="lpdf" type="button">' + L('Rapport individuel (PDF)', 'Individual report (PDF)') + '</button><button class="sm ghost" id="lclose" type="button">' + L('Fermer', 'Close') + '</button></div></div>' +
      '<p><span class="pill">' + esc(lbl2(STATUS[s.status])) + '</span></p>' +
      '<h4>' + L('Patient et demande', 'Patient and request') + '</h4><div class="grid small">' +
      field(L('Cas', 'Case'), '<code>' + esc(s.case_id) + '</code>') + field(L('Patient', 'Patient'), esc(patientOf(a))) +
      field(L('Catégorie au triage', 'Triage category'), a ? B.chip(a.result.category).replace('class="chip ', 'class="chip sm ') : '-') + field(L('Classification', 'Classification'), esc(a ? B.classLabel(a.classification) : '-')) +
      field(L('FOSA', 'Facility'), esc(s.collection_place)) + field(L('Demandé par', 'Requested by'), s.request ? esc(s.request.by) + ' · ' + B.fmtDT(s.request.at) : '-') +
      field(L('Priorité', 'Priority'), s.request ? esc(s.request.priority === 'urgent' ? L('Urgente', 'Urgent') : L('Routine', 'Routine')) : '-') + field(L('Note', 'Note'), s.request ? esc(s.request.note) : '') + '</div>' +
      '<h4>' + L('Échantillon', 'Sample') + '</h4><div class="grid small">' +
      field(L('ID labo', 'Lab ID'), esc(s.lab_id)) + field(L('Type d\'échantillon', 'Sample type'), esc(s.type ? typeName(s.type) : '')) +
      field(L('Prélevé le', 'Collected on'), s.collected_at ? B.fmtDT(s.collected_at) : '') + field(L('Préleveur', 'Collected by'), esc(s.collector)) +
      field(L('Analyse', 'Testing'), s.testing_site && s.testing_site.kind ? esc(s.testing_site.kind === 'onsite' ? L('Sur place', 'On site') : L('Envoyé au laboratoire de référence', 'Sent to referral laboratory')) : '') +
      field(L('Laboratoire de référence', 'Referral laboratory'), s.testing_site && s.testing_site.kind === 'external' ? esc(s.testing_site.name) : '') + field(L('Reçu le', 'Received on'), s.received_at ? B.fmtDT(s.received_at) : '') + '</div>' +
      '<h4>' + L('Résultat', 'Result') + '</h4><div class="grid small">' +
      field(L('Résultat', 'Result'), s.result && (s.status === 'result_released' || isLab() || isManager()) ? '<b>' + esc(lbl2(RESULTS[s.result])) + '</b>' + (s.status === 'result_entered' ? ' <span class="muted">(' + L('non approuvé', 'not approved') + ')</span>' : '') : '') +
      field(L('Méthode', 'Method'), esc(s.method)) + field(L('Ct', 'Ct value'), esc(s.ct)) + field(L('Testé par', 'Tester'), s.tested_by ? esc(s.tested_by) + ' · ' + B.fmtDT(s.tested_at) : '') +
      field(L('Approuvé par (responsable)', 'Approved by (manager)'), s.approved_by ? esc(s.approved_by) + ' · ' + B.fmtDT(s.approved_at) : '') + field(L('Commentaire', 'Comment'), esc(s.result_note || s.comments || '')) + '</div>' +
      (s.return_note ? '<p class="flag small">' + L('Renvoyé pour correction : ', 'Returned for correction: ') + esc(s.return_note) + '</p>' : '');

    // Actions, by step and role
    if (s.status === 'requested' && isLab()) {
      html += '<form id="lcoll" class="card inner" novalidate><h4>' + L('Enregistrer l\'échantillon', 'Record the sample') + '</h4><div class="grid">' +
        '<label>' + L('ID labo', 'Lab ID') + ' *<input name="lid" maxlength="40" placeholder="' + L('ex. BUN-2026-0153', 'e.g. BUN-2026-0153') + '"></label>' +
        '<label>' + L('Type d\'échantillon', 'Sample type') + ' *<select name="ltype"><option value="">-</option>' + TYPES.map(function (t) { return '<option value="' + t[0] + '">' + esc(L(t[1], t[2])) + '</option>'; }).join('') + '</select></label>' +
        '<label>' + L('Date et heure du prélèvement', 'Collection date and time') + ' *<input type="datetime-local" name="lcoll" value="' + now + '" max="' + now + '"></label>' +
        '<label>' + L('Préleveur', 'Collected by') + '<input name="lcollector" value="' + esc(B.user()) + '"></label>' +
        '<fieldset class="wide"><legend>' + L('Analyse', 'Testing') + ' *</legend><label class="check"><input type="radio" name="lkind" value="onsite"> ' + L('Testé sur place', 'Tested on site') + '</label> <label class="check"><input type="radio" name="lkind" value="external"> ' + L('Envoyé au laboratoire de référence', 'Sent to referral laboratory') + '</label></fieldset>' +
        '<label class="wide" id="lrefwrap" hidden>' + L('Laboratoire de référence', 'Referral laboratory') + ' *<select name="lref"><option value="">-</option>' + labs().map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('') + '<option value="__other">' + L('Autre (préciser)', 'Other (specify)') + '</option></select><input name="lrefother" placeholder="' + L('Nom du laboratoire', 'Laboratory name') + '" hidden></label>' +
        '</div><button class="primary" type="submit">' + L('Enregistrer', 'Save') + '</button></form>';
    }
    if (s.status === 'in_transit' && isLab()) html += '<div class="vbar"><button class="primary" id="lrecv" type="button">' + L('Reçu par le laboratoire de référence', 'Received by the referral laboratory') + '</button></div>';
    if (['collected', 'received', 'under_analysis', 'analysed_onsite', 'result_pending', 'awaiting_dispatch', 'referred_external'].indexOf(s.status) >= 0 && isLab()) {
      html += '<form id="lres" class="card inner" novalidate><h4>' + L('Saisie du résultat', 'Result entry') + '</h4><p class="small muted">' + L('Testeur : ', 'Tester: ') + '<b>' + esc(B.user()) + '</b> (' + L('compte connecté', 'signed-in account') + ')</p><div class="grid">' +
        '<label>' + L('Résultat', 'Result') + ' *<select name="rres"><option value="">-</option>' + Object.keys(RESULTS).map(function (k) { return '<option value="' + k + '">' + esc(lbl2(RESULTS[k])) + '</option>'; }).join('') + '</select></label>' +
        '<label>' + L('Méthode', 'Method') + ' *<select name="rmeth">' + METHODS.map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('') + '</select></label>' +
        '<label>' + L('Valeur Ct (facultatif)', 'Ct value (optional)') + '<input name="rct" inputmode="decimal" maxlength="10"></label>' +
        '<label class="wide">' + L('Commentaire', 'Comment') + '<input name="rnote" maxlength="300"></label></div>' +
        '<button class="primary" type="submit">' + L('Envoyer pour approbation', 'Send for approval') + '</button></form>';
    }
    if (s.status === 'result_entered') {
      html += isManager() ? '<div class="card inner"><h4>' + L('Approbation (responsable du laboratoire)', 'Approval (laboratory manager)') + '</h4><p class="small">' + L('Vérifiez le résultat saisi par ', 'Check the result entered by ') + '<b>' + esc(s.tested_by) + '</b>. ' + L('Une fois approuvé, il est publié aux cliniciens et met à jour la classification du cas.', 'Once approved it is released to the clinicians and updates the case classification.') + '</p>' +
        '<div class="vbar"><button class="primary" id="lappr" type="button">' + L('Approuver et publier', 'Approve and release') + '</button><input id="lretnote" placeholder="' + L('Motif du renvoi', 'Reason for return') + '" maxlength="200"><button class="ghost" id="lret" type="button">' + L('Renvoyer pour correction', 'Return for correction') + '</button></div></div>'
        : '<p class="note small">' + L('En attente de l\'approbation du responsable du laboratoire.', 'Waiting for the laboratory manager\'s approval.') + '</p>';
    }
    if (s.status === 'repeat_required' && B.can('sample_register')) html += '<div class="vbar"><button class="sm" id="lrep" type="button">' + L('Demander un nouveau prélèvement', 'Request a repeat sample') + '</button></div>';
    if (!isLab() && !isManager() && s.status !== 'result_released') html += '<p class="muted small">' + L('Le laboratoire enregistre l\'échantillon et le résultat ; le responsable du laboratoire l\'approuve avant publication.', 'The laboratory records the sample and the result; the laboratory manager approves it before release.') + '</p>';
    html += '<h4>' + L('Chaîne de traçabilité', 'Chain of custody') + '</h4><div class="scroll"><table class="tbl small"><tr><th>' + L('Quand', 'When') + '</th><th>' + L('Étape', 'Step') + '</th><th>' + L('De', 'From') + '</th><th>' + L('À', 'To') + '</th><th>' + L('Par', 'By') + '</th></tr>' +
      (s.custody || []).map(function (c) { return '<tr><td>' + B.fmtDT(c.at) + '</td><td>' + esc(lbl2(STATUS[c.action]) || (c.action === 'returned' ? L('Renvoyé pour correction', 'Returned for correction') : c.action)) + '</td><td>' + esc(c.from) + '</td><td>' + esc(c.to) + '</td><td>' + esc(c.by) + '</td></tr>'; }).join('') + '</table></div>';
    box.innerHTML = html;
    box.scrollIntoView({ block: 'nearest' });

    var done = function (what, msg) { B.audit(what, 'sample', s.id, s.status); B.save(); if (msg) B.notify(msg, 'ok'); B.VIEWS.lab(v); };
    B.$('#lclose', box).onclick = function () { lf.open = null; B.VIEWS.lab(v); };
    B.$('#lpdf', box).onclick = function () { report(s, a); };
    var cf = B.$('#lcoll', box);
    if (cf) {
      var E = cf.elements, refWrap = B.$('#lrefwrap', cf);
      B.$$('[name=lkind]', cf).forEach(function (r) { r.onchange = function () { refWrap.hidden = E.lkind.value !== 'external'; }; });
      E.lref.onchange = function () { E.lrefother.hidden = E.lref.value !== '__other'; };
      cf.onsubmit = function (e) {
        e.preventDefault();
        var lid = E.lid.value.trim(), kind = E.lkind.value, ref = E.lref.value === '__other' ? E.lrefother.value.trim() : E.lref.value;
        var miss = [];
        if (!lid) miss.push(L('ID labo', 'Lab ID')); if (!E.ltype.value) miss.push(L('type d\'échantillon', 'sample type')); if (!E.lcoll.value) miss.push(L('date et heure du prélèvement', 'collection date and time'));
        if (!kind) miss.push(L('analyse sur place ou envoi', 'tested on site or sent')); if (kind === 'external' && !ref) miss.push(L('laboratoire de référence', 'referral laboratory'));
        if (miss.length) { B.notify(B.t('required') + ' : ' + miss.join(', '), 'err'); return; }
        if (db().samples.some(function (x) { return x !== s && x.lab_id && x.lab_id.toLowerCase() === lid.toLowerCase(); })) { B.notify(L('Cet ID labo est déjà utilisé.', 'This lab ID is already used.'), 'err'); return; }
        B.labApi.collect(s, { lab_id: lid, type: E.ltype.value, collected_at: new Date(E.lcoll.value).toISOString(), collector: E.lcollector.value.trim(), kind: kind, lab_name: kind === 'external' ? ref : '' });
        done('sample_collected', L('Échantillon enregistré.', 'Sample recorded.'));
      };
    }
    var rv = B.$('#lrecv', box); if (rv) rv.onclick = function () { B.labApi.setStatus(s, 'received', '', s.testing_site.name); B.labApi.setStatus(s, 'under_analysis', '', s.testing_site.name); done('sample_received', L('Réception enregistrée.', 'Receipt recorded.')); };
    var rs = B.$('#lres', box);
    if (rs) rs.onsubmit = function (e) {
      e.preventDefault();
      var E2 = rs.elements;
      if (!E2.rres.value) { B.notify(B.t('required') + ' : ' + L('résultat', 'result'), 'err'); return; }
      B.ask(L('Envoyer le résultat ', 'Send the result ') + lbl2(RESULTS[E2.rres.value]) + L(' pour approbation ?', ' for approval?'), L('Envoyer', 'Send'), B.t('cancel'), function () {
        B.labApi.enter(s, E2.rres.value, E2.rmeth.value, E2.rct.value.trim(), E2.rnote.value.trim());
        done('result_entered', L('Résultat envoyé au responsable pour approbation.', 'Result sent to the manager for approval.'));
      });
    };
    var ap = B.$('#lappr', box); if (ap) ap.onclick = function () {
      B.ask(L('Approuver et publier le résultat ', 'Approve and release the result ') + lbl2(RESULTS[s.result]) + L(' pour ', ' for ') + s.case_id + ' ?', L('Approuver', 'Approve'), B.t('cancel'), function () {
        B.labApi.approve(s); done('result_release', L('Résultat approuvé et publié.', 'Result approved and released.'));
      });
    };
    var rt = B.$('#lret', box); if (rt) rt.onclick = function () {
      var note = B.$('#lretnote', box).value.trim(); if (!note) { B.notify(L('Indiquez le motif du renvoi.', 'Give the reason for the return.'), 'err'); return; }
      B.labApi.returnForCorrection(s, note); done('result_returned', L('Résultat renvoyé pour correction.', 'Result returned for correction.'));
    };
    var rp = B.$('#lrep', box); if (rp) rp.onclick = function () { var n = B.labApi.request(s.case_id, L('Nouveau prélèvement après résultat non concluant', 'Repeat after an inconclusive result'), 'urgent'); B.audit('lab_request', 'sample', n.id, s.case_id); B.save(); lf.open = n.id; B.VIEWS.lab(v); };
  }

  // Individual report for one sample (PDF).
  function report(s, a) {
    var rows = [
      [L('ID labo', 'Lab ID'), s.lab_id || '-'], [L('Échantillon (système)', 'Sample (system ID)'), s.id], [L('Cas', 'Case'), s.case_id], [L('Patient', 'Patient'), patientOf(a)],
      [L('FOSA', 'Facility'), s.collection_place || '-'], [L('Demandé par', 'Requested by'), s.request ? s.request.by + ' · ' + B.fmtDT(s.request.at) : '-'],
      [L('Type d\'échantillon', 'Sample type'), s.type ? typeName(s.type) : '-'], [L('Prélevé le', 'Collected on'), s.collected_at ? B.fmtDT(s.collected_at) : '-'], [L('Préleveur', 'Collected by'), s.collector || '-'],
      [L('Analyse', 'Testing'), s.testing_site && s.testing_site.kind ? (s.testing_site.kind === 'onsite' ? L('Sur place', 'On site') : L('Laboratoire de référence : ', 'Referral laboratory: ') + s.testing_site.name) : '-'],
      [L('Statut', 'Status'), lbl2(STATUS[s.status])], [L('Résultat', 'Result'), s.result && (s.status === 'result_released' || isLab() || isManager()) ? lbl2(RESULTS[s.result]) + (s.status === 'result_released' ? '' : ' (' + L('non approuvé', 'not approved') + ')') : '-'],
      [L('Méthode', 'Method'), s.method || '-'], [L('Valeur Ct', 'Ct value'), s.ct || '-'], [L('Testé par', 'Tester'), s.tested_by ? s.tested_by + ' · ' + B.fmtDT(s.tested_at) : '-'],
      [L('Approuvé par', 'Approved by'), s.approved_by ? s.approved_by + ' · ' + B.fmtDT(s.approved_at) : '-'], [L('Commentaire', 'Comment'), s.result_note || s.comments || '-']
    ];
    var J = window.jspdf && window.jspdf.jsPDF;
    if (!J) { B.notify(L('Bibliothèque PDF non chargée.', 'PDF library not loaded.'), 'err'); return; }
    var doc = new J({ unit: 'pt', format: 'a4' });
    doc.setFontSize(15); doc.text(L('Rapport de laboratoire - BDBV', 'Laboratory report - BDBV'), 40, 50);
    doc.setFontSize(9); doc.text(L('Pilote : données synthétiques. Généré le ', 'Pilot: synthetic data. Generated ') + B.fmtDT(new Date().toISOString()) + L(' par ', ' by ') + B.user(), 40, 66);
    if (doc.autoTable) doc.autoTable({ startY: 80, head: [[L('Élément', 'Item'), L('Valeur', 'Value')]], body: rows, styles: { fontSize: 10 }, headStyles: { fillColor: [15, 61, 94] }, columnStyles: { 0: { cellWidth: 170, fontStyle: 'bold' } } });
    var y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 20 : 90;
    doc.setFontSize(11); doc.text(L('Chaîne de traçabilité', 'Chain of custody'), 40, y);
    if (doc.autoTable) doc.autoTable({ startY: y + 8, head: [[L('Quand', 'When'), L('Étape', 'Step'), L('De', 'From'), L('À', 'To'), L('Par', 'By')]], body: (s.custody || []).map(function (c) { return [B.fmtDT(c.at), lbl2(STATUS[c.action]) || c.action, c.from, c.to, c.by]; }), styles: { fontSize: 8.5 }, headStyles: { fillColor: [15, 61, 94] } });
    doc.save('rapport_labo_' + (s.lab_id || s.id).replace(/[^A-Za-z0-9_-]/g, '_') + '.pdf');
    B.audit('download', 'sample_report', s.id, 'pdf');
  }

  // Where is each suspected case now, and what is its lab status?
  function whereView() {
    var cases = db().assessments.filter(function (a) { return a.classification && ['suspected', 'probable', 'confirmed'].indexOf(a.classification.status) >= 0; }).slice(0, 100);
    if (!cases.length) return '';
    return '<section class="card"><h3>' + L('Cas suspects/probables/confirmés : localisation et statut laboratoire', 'Suspected/probable/confirmed cases: location and lab status') + '</h3><div class="scroll"><table class="tbl small"><tr><th>' + L('Cas', 'Case') + '</th><th>' + L('Classification', 'Classification') + '</th><th>' + L('Prise en charge', 'Care status') + '</th><th>' + L('Lieu', 'Location') + '</th><th>' + L('Laboratoire', 'Laboratory') + '</th></tr>' +
      cases.map(function (a) { return '<tr><td><code>' + esc(a.id) + '</code></td><td>' + esc(B.classLabel(a.classification)) + '</td><td>' + esc(B.careLabel ? B.careLabel(a) : '-') + '</td><td>' + esc(B.nm(B.G.facilities, a.care ? a.care.location : a.geo.facility)) + '</td><td>' + B.labSummary(a.id) + '</td></tr>'; }).join('') + '</table></div></section>';
  }
})();
