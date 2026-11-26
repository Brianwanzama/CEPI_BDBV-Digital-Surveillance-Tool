/* Laboratory module: samples linked to cases, status tracking, chain of custody,
 * on-site and external testing, results released by laboratory personnel only.
 * A case becomes laboratory-confirmed ONLY when a positive result is released.
 */
(function () {
  'use strict';
  var B = window.BDBV;
  var L = function (f, e) { return B.L(f, e); };
  var esc = function (x) { return B.esc(x); };

  var STATUS = {
    awaiting_collection: ['En attente de prélèvement', 'Awaiting collection'], collected: ['Prélevé', 'Collected'], awaiting_dispatch: ['En attente d\'expédition', 'Awaiting dispatch'],
    in_transit: ['En transit', 'In transit'], received: ['Reçu au laboratoire', 'Received by laboratory'], under_analysis: ['En cours d\'analyse', 'Undergoing analysis'],
    analysed_onsite: ['Analysé sur place', 'Analysed on-site'], referred_external: ['Référé à un laboratoire externe', 'Referred to external laboratory'],
    result_pending: ['Résultat en attente', 'Result pending'], result_released: ['Résultat publié', 'Result released'], repeat_required: ['Nouveau test requis', 'Repeat testing required']
  };
  var TYPES = [['whole_blood', 'Sang total (EDTA)', 'Whole blood (EDTA)'], ['oral_swab', 'Écouvillon buccal (post-mortem)', 'Oral swab (post-mortem)'], ['other', 'Autre', 'Other']];
  var RESULTS = { positive: ['POSITIF', 'POSITIVE'], negative: ['Négatif', 'Negative'], inconclusive: ['Non concluant / invalide', 'Inconclusive / invalid'] };
  var METHODS = ['RT-PCR (GeneXpert)', 'RT-PCR (autre plateforme / other platform)', 'Autre / other'];
  var LABS = ['Laboratoire provincial (démo)', 'Laboratoire de la FOSA - analyse sur place (démo)', 'INRB Kinshasa / Goma (référence)'];
  var lbl2 = function (p) { return p ? L(p[0], p[1]) : ''; };
  function db() { return B.db(); }

  function samplesOf(caseId) { return db().samples.filter(function (s) { return s.case_id === caseId; }).sort(function (a, b) { return new Date(a.created_at) - new Date(b.created_at); }); }
  function latest(caseId) { var l = samplesOf(caseId); return l[l.length - 1]; }
  // Cases with a test requested but no sample registered = "awaiting collection".
  function requestedNoSample() { return db().assessments.filter(function (a) { return a.lab && a.lab.status === 'requested' && !samplesOf(a.id).length; }); }

  B.labSummary = function (caseId) {
    var s = latest(caseId);
    if (!s) { var a = B.byId(db().assessments, caseId); return a && a.lab && a.lab.status === 'requested' ? esc(lbl2(STATUS.awaiting_collection)) : '-'; }
    return esc(lbl2(STATUS[s.status])) + (s.result && s.status === 'result_released' ? ' · <b>' + esc(lbl2(RESULTS[s.result])) + '</b>' : '');
  };
  B.labApi = {
    STATUS: STATUS, RESULTS: RESULTS, samplesOf: samplesOf, latest: latest, requestedNoSample: requestedNoSample,
    caseLab: function (caseId) {
      var l = samplesOf(caseId), rel = l.filter(function (s) { return s.status === 'result_released'; });
      var last = rel[rel.length - 1];
      return { samples: l.length, awaitingTest: !l.length && (B.byId(db().assessments, caseId) || {}).lab && B.byId(db().assessments, caseId).lab.status === 'requested', awaitingResult: l.length && !rel.length, result: last ? last.result : null };
    }
  };

  function custody(s, action, from, to, by, at) { s.custody.push({ at: at || B.iso(new Date()), action: action, from: from || '', to: to || '', by: by || B.user() }); }
  function syncCase(s) {
    var a = B.byId(db().assessments, s.case_id); if (!a) return;
    if (s.status === 'result_released') {
      a.lab = { status: s.result === 'positive' ? 'pos' : (s.result === 'negative' ? 'neg' : 'collected'), at: s.released_at };
      if (s.result === 'positive') a.classification = { status: 'confirmed', at: s.released_at, by: s.released_by + ' (labo ' + s.id + ')' };
      else if (s.result === 'negative' && a.classification && a.classification.status !== 'confirmed') a.classification = { status: 'lab_negative', at: s.released_at, by: s.released_by + ' (labo ' + s.id + ')' };
    } else if (a.lab.status === 'none' || a.lab.status === 'requested') a.lab = { status: 'collected', at: s.collected_at };
    a.synced = false;
  }
  B.labApi.register = function (o) {
    var s = { id: B.newId('SMP', 'LAB'), case_id: o.case_id, type: o.type, collected_at: o.collected_at, collection_place: o.collection_place, collector: o.collector,
      testing_site: o.testing_site, received_at: null, method: '', status: o.status || 'collected', result: null, released_at: null, released_by: null, repeat: false, comments: o.comments || '',
      custody: [], created_at: o.created_at || B.iso(new Date()), synced: false, demo: !!o.demo };
    custody(s, 'collected', o.collector, o.collection_place, o.by || B.user(), o.collected_at);
    db().samples.unshift(s); syncCase(s);
    return s;
  };
  B.labApi.setStatus = function (s, st, from, to, by, at) {
    s.status = st; if (st === 'received') s.received_at = at || B.iso(new Date());
    custody(s, st, from, to, by, at); s.synced = false; syncCase(s);
  };
  B.labApi.release = function (s, result, method, comments, by, at) {
    s.result = result; s.method = method; s.comments = comments || s.comments; s.released_at = at || B.iso(new Date()); s.released_by = by || B.user();
    s.status = result === 'inconclusive' ? 'repeat_required' : 'result_released'; s.repeat = result === 'inconclusive';
    custody(s, 'result_released', '', '', s.released_by, s.released_at); s.synced = false; syncCase(s);
  };

  var lf = { status: '', open: null };
  B.VIEWS.lab = function (v) {
    var d = db(), all = d.samples, canReg = B.can('sample_register'), canRes = B.can('lab_results');
    var pend = requestedNoSample();
    var cnt = {}; Object.keys(STATUS).forEach(function (k) { cnt[k] = 0; }); all.forEach(function (s) { cnt[s.status]++; });
    cnt.awaiting_collection += pend.length;
    var rows = all.filter(function (s) { return !lf.status || s.status === lf.status; });
    v.innerHTML = '<section class="card"><h2>' + L('Laboratoire : suivi des échantillons', 'Laboratory: sample tracking') + '</h2>' +
      '<p class="muted small">' + L('Un cas n\'est confirmé par le laboratoire QUE lorsqu\'un résultat positif est publié par le personnel de laboratoire autorisé. Le prélèvement ou l\'envoi d\'un échantillon ne confirme rien.', 'A case is laboratory-confirmed ONLY when a positive result is released by authorised laboratory staff. Collecting or sending a sample confirms nothing.') + '</p>' +
      '<div class="kpis">' + Object.keys(STATUS).map(function (k) { return '<button class="kpi kbtn' + (lf.status === k ? ' on' : '') + '" data-lst="' + k + '"><div class="kv">' + cnt[k] + '</div><div class="kl">' + esc(lbl2(STATUS[k])) + '</div></button>'; }).join('') +
      '<button class="kpi kbtn' + (!lf.status ? ' on' : '') + '" data-lst=""><div class="kv">' + all.length + '</div><div class="kl">' + L('Tous les échantillons', 'All samples') + '</div></button></div></section>' +
      (pend.length ? '<section class="card warn"><h3>' + L('Tests demandés sans échantillon enregistré', 'Tests requested with no sample registered') + ' (' + pend.length + ')</h3><p class="small">' + pend.slice(0, 30).map(function (a) { return '<code>' + esc(a.id) + '</code> (' + esc(B.nm(B.G.facilities, a.geo.facility)) + ')' + (canReg ? ' <button class="sm" data-reg="' + a.id + '">' + L('Enregistrer le prélèvement', 'Register collection') + '</button>' : ''); }).join('<br>') + '</p></section>' : '') +
      (canReg ? '<section class="card"><details id="lnew"><summary>+ ' + L('Enregistrer un échantillon', 'Register a sample') + '</summary>' + regForm() + '</details></section>' : '') +
      '<section class="card"><h3>' + (lf.status ? esc(lbl2(STATUS[lf.status])) : L('Tous les échantillons', 'All samples')) + ' (' + rows.length + ')</h3><div class="scroll"><table class="tbl"><tr><th>' + L('Échantillon', 'Sample') + '</th><th>' + L('Cas', 'Case') + '</th><th>' + L('Type', 'Type') + '</th><th>' + L('Prélevé', 'Collected') + '</th><th>' + L('Site de test', 'Testing site') + '</th><th>' + L('Statut', 'Status') + '</th><th>' + L('Résultat', 'Result') + '</th></tr>' +
      rows.slice(0, 200).map(function (s) {
        return '<tr><td><a href="#" data-sopen="' + s.id + '"><code>' + esc(s.id) + '</code></a>' + (s.demo ? ' <span class="tag">' + L('démo', 'demo') + '</span>' : '') + '</td><td><code>' + esc(s.case_id) + '</code></td><td>' + esc(L.apply(null, (TYPES.filter(function (t) { return t[0] === s.type; })[0] || ['', s.type, s.type]).slice(1))) + '</td><td>' + B.fmtDT(s.collected_at) + '</td>' +
          '<td>' + esc(s.testing_site.name) + ' <span class="tag">' + (s.testing_site.kind === 'onsite' ? L('sur place', 'on-site') : L('externe', 'external')) + '</span></td><td>' + esc(lbl2(STATUS[s.status])) + '</td><td>' + (s.status === 'result_released' ? '<b>' + esc(lbl2(RESULTS[s.result])) + '</b>' : (s.result === 'inconclusive' ? esc(lbl2(RESULTS.inconclusive)) : '-')) + '</td></tr>';
      }).join('') + '</table></div></section><section class="card" id="ldetail"></section>' + whereView();
    B.$$('[data-lst]', v).forEach(function (b) { b.onclick = function () { lf.status = b.getAttribute('data-lst'); B.VIEWS.lab(v); }; });
    B.$$('[data-sopen]', v).forEach(function (a) { a.onclick = function (e) { e.preventDefault(); lf.open = a.getAttribute('data-sopen'); detail(v); }; });
    B.$$('[data-reg]', v).forEach(function (b) { b.onclick = function () { var det = B.$('#lnew', v); det.open = true; B.$('[name=scase]', det).value = b.getAttribute('data-reg'); det.scrollIntoView(); }; });
    var form = B.$('#lform', v);
    if (form) form.onsubmit = function (e) {
      e.preventDefault();
      var E = form.elements, a = B.byId(db().assessments, E.scase.value.trim());
      if (!a) { B.notify(L('ID de cas introuvable.', 'Case ID not found.'), 'err'); return; }
      if (!E.scoll.value) { B.notify(B.t('required') + ' : ' + L('date de prélèvement', 'collection date'), 'err'); return; }
      var s = B.labApi.register({ case_id: a.id, type: E.stype.value, collected_at: new Date(E.scoll.value).toISOString(), collection_place: B.nm(B.G.facilities, a.geo.facility), collector: E.scollector.value || B.user(), testing_site: { kind: E.skind.value, name: E.ssite.value }, comments: E.scomm.value, status: E.skind.value === 'onsite' ? 'under_analysis' : 'awaiting_dispatch' });
      B.audit('create', 'sample', s.id, a.id); B.save(); lf.open = s.id; B.notify(L('Échantillon enregistré : ', 'Sample registered: ') + s.id); B.VIEWS.lab(v);
    };
    if (lf.open) detail(v);
  };

  function regForm() {
    return '<form id="lform" novalidate><div class="grid">' +
      '<label>' + L('ID du cas', 'Case ID') + ' *<input name="scase" placeholder="BDB-…"></label>' +
      '<label>' + L('Type d\'échantillon', 'Sample type') + '<select name="stype">' + TYPES.map(function (t) { return '<option value="' + t[0] + '">' + esc(L(t[1], t[2])) + '</option>'; }).join('') + '</select></label>' +
      '<label>' + L('Date et heure du prélèvement', 'Collection date and time') + ' *<input type="datetime-local" name="scoll"></label>' +
      '<label>' + L('Préleveur', 'Collecting health worker') + '<input name="scollector" placeholder="' + esc(B.user()) + '"></label>' +
      '<label>' + L('Analyse', 'Analysis') + '<select name="skind"><option value="external">' + L('Laboratoire externe désigné', 'Designated external laboratory') + '</option><option value="onsite">' + L('Sur place (FOSA / CTE équipé)', 'On-site (equipped facility / ETC)') + '</option></select></label>' +
      '<label>' + L('Laboratoire', 'Testing facility') + '<select name="ssite">' + LABS.map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('') + '</select></label>' +
      '<label class="wide">' + L('Commentaires', 'Comments') + '<input name="scomm"></label></div><button class="primary" type="submit">' + L('Enregistrer', 'Register') + '</button></form>';
  }

  function detail(v) {
    var s = B.byId(db().samples, lf.open), box = B.$('#ldetail', v); if (!s || !box) return;
    var canRes = B.can('lab_results'), canMove = B.can('lab_custody');
    var a = B.byId(db().assessments, s.case_id);
    var nextOpts = Object.keys(STATUS).filter(function (k) { return k !== 'result_released' && k !== s.status; });
    box.innerHTML = '<h3>' + esc(s.id) + ' · ' + L('cas ', 'case ') + '<code>' + esc(s.case_id) + '</code></h3>' +
      '<div class="grid small"><div><b>' + L('Statut', 'Status') + '</b><br>' + esc(lbl2(STATUS[s.status])) + '</div><div><b>' + L('Lieu de prélèvement', 'Collection location') + '</b><br>' + esc(s.collection_place) + '</div><div><b>' + L('Préleveur', 'Collector') + '</b><br>' + esc(s.collector) + '</div>' +
      '<div><b>' + L('Laboratoire', 'Testing facility') + '</b><br>' + esc(s.testing_site.name) + '</div><div><b>' + L('Reçu', 'Received') + '</b><br>' + B.fmtDT(s.received_at) + '</div><div><b>' + L('Méthode', 'Method') + '</b><br>' + esc(s.method || '-') + '</div>' +
      '<div><b>' + L('Résultat', 'Result') + '</b><br>' + (s.result ? esc(lbl2(RESULTS[s.result])) + ' · ' + B.fmtDT(s.released_at) + ' · ' + esc(s.released_by) : '-') + '</div>' +
      '<div><b>' + L('Classification du cas', 'Case classification') + '</b><br>' + esc(a ? B.classLabel(a.classification) : '-') + '</div>' +
      (a && a.contact_id ? '<div><b>' + L('Contact suivi', 'Traced contact') + '</b><br><code>' + esc(a.contact_id) + '</code></div>' : '') +
      (a && a.care ? '<div><b>' + L('Localisation du cas', 'Case location') + '</b><br>' + esc(B.nm(B.G.facilities, a.care.location)) + '</div>' : '') + '</div>' +
      (s.comments ? '<p class="small"><b>' + L('Commentaires', 'Comments') + ' :</b> ' + esc(s.comments) + '</p>' : '') +
      (canMove && s.status !== 'result_released' ? '<div class="vbar"><label class="inl">' + L('Nouvelle étape', 'Next step') + ' <select id="lns">' + nextOpts.map(function (k) { return '<option value="' + k + '">' + esc(lbl2(STATUS[k])) + '</option>'; }).join('') + '</select></label><input id="lfrom" placeholder="' + L('Remis par', 'Handed over by') + '" style="max-width:160px"><input id="lto" placeholder="' + L('Reçu par / destination', 'Received by / destination') + '" style="max-width:180px"><button class="sm" id="lnsb">' + L('Enregistrer (chaîne de traçabilité)', 'Record (chain of custody)') + '</button></div>' : '') +
      (canRes && s.status !== 'result_released' ? '<div class="vbar card inner"><b>' + L('Publication du résultat (personnel de laboratoire)', 'Result release (laboratory personnel)') + '</b><label class="inl">' + L('Résultat', 'Result') + ' <select id="lres">' + Object.keys(RESULTS).map(function (k) { return '<option value="' + k + '">' + esc(lbl2(RESULTS[k])) + '</option>'; }).join('') + '</select></label><label class="inl">' + L('Méthode', 'Method') + ' <select id="lmeth">' + METHODS.map(function (m) { return '<option>' + esc(m) + '</option>'; }).join('') + '</select></label><input id="lcom" placeholder="' + L('Commentaires et recommandations', 'Comments and recommendations') + '"><button class="sm primary" id="lresb">' + L('Publier le résultat', 'Release result') + '</button></div>' : '') +
      (!canRes ? '<p class="muted small">' + L('Seul le personnel de laboratoire autorisé peut saisir et publier un résultat.', 'Only authorised laboratory personnel can enter and release a result.') + '</p>' : '') +
      '<h4>' + L('Chaîne de traçabilité', 'Chain of custody') + '</h4><div class="scroll"><table class="tbl small"><tr><th>' + L('Quand', 'When') + '</th><th>' + L('Étape', 'Step') + '</th><th>' + L('De', 'From') + '</th><th>' + L('À', 'To') + '</th><th>' + L('Par', 'By') + '</th></tr>' +
      s.custody.map(function (c) { return '<tr><td>' + B.fmtDT(c.at) + '</td><td>' + esc(lbl2(STATUS[c.action]) || c.action) + '</td><td>' + esc(c.from) + '</td><td>' + esc(c.to) + '</td><td>' + esc(c.by) + '</td></tr>'; }).join('') + '</table></div>';
    var nb = B.$('#lnsb', box); if (nb) nb.onclick = function () { B.labApi.setStatus(s, B.$('#lns', box).value, B.$('#lfrom', box).value, B.$('#lto', box).value); B.audit('custody', 'sample', s.id, s.status); B.save(); B.VIEWS.lab(v); };
    var rb = B.$('#lresb', box); if (rb) rb.onclick = function () {
      if (!B.can('lab_results')) return;
      var res = B.$('#lres', box).value;
      B.ask(L('Publier le résultat ', 'Release result ') + lbl2(RESULTS[res]) + L(' pour ', ' for ') + s.case_id + ' ?', L('Publier', 'Release'), B.t('cancel'), function () {
        B.labApi.release(s, res, B.$('#lmeth', box).value, B.$('#lcom', box).value); B.audit('result_release', 'sample', s.id, res); B.save(); B.notify(L('Résultat publié.', 'Result released.')); B.VIEWS.lab(v);
      });
    };
  }

  // Where is each suspected case now, and what is its lab status?
  function whereView() {
    var cases = db().assessments.filter(function (a) { return a.classification && ['suspected', 'probable', 'confirmed'].indexOf(a.classification.status) >= 0; }).slice(0, 100);
    if (!cases.length) return '';
    return '<section class="card"><h3>' + L('Cas suspects/probables/confirmés : localisation et statut laboratoire', 'Suspected/probable/confirmed cases: location and lab status') + '</h3><div class="scroll"><table class="tbl small"><tr><th>' + L('Cas', 'Case') + '</th><th>' + L('Classification', 'Classification') + '</th><th>' + L('Prise en charge', 'Care status') + '</th><th>' + L('Localisation', 'Location') + '</th><th>' + L('Laboratoire', 'Laboratory') + '</th></tr>' +
      cases.map(function (a) { return '<tr><td><code>' + esc(a.id) + '</code></td><td>' + esc(B.classLabel(a.classification)) + '</td><td>' + esc(B.careLabel ? B.careLabel(a) : '-') + '</td><td>' + esc(B.nm(B.G.facilities, a.care ? a.care.location : a.geo.facility)) + '</td><td>' + B.labSummary(a.id) + '</td></tr>'; }).join('') + '</table></div></section>';
  }
})();
