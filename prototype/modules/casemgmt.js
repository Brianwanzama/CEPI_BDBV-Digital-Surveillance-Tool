/* Patient and case-management dashboard: care status, location, responsible
 * clinician, transfers. Laboratory-derived counts come from the lab module.
 * Home-based care is offered only when the administrator has recorded that it
 * is permitted by approved national clinical and IPC protocols.
 */
(function () {
  'use strict';
  var B = window.BDBV;
  var L = function (f, e) { return B.L(f, e); };
  var esc = function (x) { return B.esc(x); };
  var CARE = {
    initial_assessment: ['En évaluation clinique initiale', 'Under initial clinical assessment'], awaiting_review: ['En attente de revue clinique', 'Awaiting further clinical review'],
    referred_holding: ['Référé vers une unité de transit', 'Referred to a holding unit'], in_holding: ['En unité de transit', 'Currently in a holding unit'],
    isolation_care: ['En isolement / prise en charge désignée', 'Under isolation or designated clinical care'], home_care: ['Prise en charge à domicile', 'Home-based care'],
    needs_referral: ['Référence ou transfert nécessaire', 'Requiring referral or transfer'], discharged: ['Sorti / fin du suivi', 'Discharged or released from follow-up'], deceased: ['Décédé', 'Deceased']
  };
  var lbl2 = function (p) { return p ? L(p[0], p[1]) : ''; };
  function db() { return B.db(); }
  function homeOK() { return !!(db().config || {}).home_care_permitted; }
  B.careLabel = function (a) { return a.care ? lbl2(CARE[a.care.status]) : '-'; };
  B.careApi = { CARE: CARE, homeOK: homeOK };
  B.careApi.set = function (a, status, location, responsible, note, by, at) {
    if (status === 'home_care' && !homeOK()) return false;
    a.care = a.care || { history: [] };
    var moved = location && location !== a.care.location;
    a.care.history.push({ at: at || B.iso(new Date()), status: status, location: location || a.care.location, from: moved ? a.care.location : '', responsible: responsible || a.care.responsible, note: note || '', by: by || B.user(), transfer: !!moved });
    a.care.status = status; if (location) a.care.location = location; if (responsible) a.care.responsible = responsible;
    a.synced = false; return true;
  };

  var mf = { status: '', open: null };
  B.VIEWS.casemgmt = function (v) {
    var d = db(), list = d.assessments.filter(function (a) { return a.care && (a.result.category !== 'GREEN' || a.care.status !== 'initial_assessment' || a.classification.status !== 'under_assessment'); });
    var cnt = {}; Object.keys(CARE).forEach(function (k) { cnt[k] = 0; }); list.forEach(function (a) { cnt[a.care.status]++; });
    var lab = { awaitTest: 0, awaitRes: 0, conf: 0, neg: 0 };
    d.assessments.forEach(function (a) {
      var cl = B.labApi ? B.labApi.caseLab(a.id) : {};
      if (cl.awaitingTest) lab.awaitTest++; if (cl.awaitingResult) lab.awaitRes++;
      if (a.classification && a.classification.status === 'confirmed') lab.conf++;
      if (a.classification && a.classification.status === 'lab_negative') lab.neg++;
    });
    var rows = list.filter(function (a) { return !mf.status || a.care.status === mf.status; }).slice(0, 200);
    var names = B.can('see_names'), edit = B.can('care_edit');
    var k = function (key, n, label, cls) { return '<button class="kpi kbtn ' + (cls || '') + (mf.status === key ? ' on' : '') + '"' + (key ? ' data-cst="' + key + '"' : ' disabled') + '><div class="kv">' + n + '</div><div class="kl">' + esc(label) + '</div></button>'; };
    v.innerHTML = '<section class="card"><h2>' + L('Prise en charge des patients', 'Patient case management') + '</h2>' +
      '<div class="kpis">' + Object.keys(CARE).map(function (s) { return (s === 'home_care' && !homeOK() && !cnt[s]) ? '' : k(s, cnt[s], lbl2(CARE[s]), s === 'deceased' ? '' : ''); }).join('') +
      k('', lab.awaitTest, L('En attente de test', 'Awaiting laboratory testing'), 'k-AMBER') + k('', lab.awaitRes, L('En attente de résultat', 'Awaiting laboratory results'), 'k-AMBER') + k('', lab.conf, L('Cas confirmés (labo)', 'Laboratory-confirmed cases'), 'k-RED') + k('', lab.neg, L('Cas négatifs (labo)', 'Laboratory-negative cases'), 'k-GREEN') + '</div>' +
      (homeOK() ? '' : '<p class="muted small">' + L('Prise en charge à domicile désactivée : elle n\'est proposée que si l\'administrateur confirme qu\'elle est autorisée par les protocoles nationaux cliniques et PCI approuvés.', 'Home-based care disabled: offered only when the administrator confirms it is permitted by approved national clinical and IPC protocols.') + '</p>') +
      (mf.status ? '<button class="sm ghost" id="mclear">' + L('Afficher tous les statuts', 'Show all statuses') + '</button>' : '') + '</section>' +
      '<section class="card"><div class="scroll"><table class="tbl"><tr><th>' + L('Cas', 'Case') + '</th>' + (names ? '<th>' + L('Nom', 'Name') + '</th>' : '') + '<th>' + L('Triage', 'Triage') + '</th><th>' + L('Classification', 'Classification') + '</th><th>' + L('Statut de prise en charge', 'Care status') + '</th><th>' + L('Lieu', 'Location') + '</th><th>' + L('Responsable', 'Responsible') + '</th><th>' + L('Laboratoire', 'Laboratory') + '</th></tr>' +
      rows.map(function (a) { return '<tr><td><a href="#" data-mopen="' + a.id + '"><code>' + esc(a.id) + '</code></a></td>' + (names ? '<td>' + esc(a.person.last + ' ' + a.person.first) + '</td>' : '') + '<td>' + B.chip(a.result.category) + '</td><td>' + esc(B.classLabel(a.classification)) + '</td><td>' + esc(lbl2(CARE[a.care.status])) + '</td><td>' + esc(B.nm(B.G.facilities, a.care.location)) + '</td><td>' + esc(a.care.responsible || '-') + '</td><td>' + B.labSummary(a.id) + '</td></tr>'; }).join('') + '</table></div></section><section class="card" id="mdetail"></section>';
    B.$$('[data-cst]', v).forEach(function (b) { b.onclick = function () { mf.status = b.getAttribute('data-cst'); B.VIEWS.casemgmt(v); }; });
    var c = B.$('#mclear', v); if (c) c.onclick = function () { mf.status = ''; B.VIEWS.casemgmt(v); };
    B.$$('[data-mopen]', v).forEach(function (el) { el.onclick = function (e) { e.preventDefault(); mf.open = el.getAttribute('data-mopen'); detail(v, edit); }; });
    if (mf.open) detail(v, edit);
  };

  function detail(v, edit) {
    var a = B.byId(db().assessments, mf.open), box = B.$('#mdetail', v); if (!a || !box) return;
    box.setAttribute('data-draft', 'm:' + a.id);
    var facs = B.G.facilities;
    box.innerHTML = '<h3>' + esc(a.id) + ' · ' + B.chip(a.result.category) + ' · ' + esc(B.classLabel(a.classification)) + ' <button class="sm ghost" id="mpdf">' + L('Rapport du cas (PDF)', 'Case report (PDF)') + '</button></h3>' +
      (edit ? '<div class="grid"><label>' + L('Statut', 'Status') + '<select id="mst">' + Object.keys(CARE).map(function (s) { return '<option value="' + s + '"' + (s === a.care.status ? ' selected' : '') + (s === 'home_care' && !homeOK() ? ' disabled' : '') + '>' + esc(lbl2(CARE[s])) + (s === 'home_care' && !homeOK() ? L(' (non autorisé)', ' (not permitted)') : '') + '</option>'; }).join('') + '</select></label>' +
        '<label>' + L('Lieu de prise en charge', 'Care location') + '<select id="mloc">' + facs.map(function (f) { return '<option value="' + f.id + '"' + (f.id === a.care.location ? ' selected' : '') + '>' + esc(f.name) + ' · ' + esc(L.apply(null, (B.G.facility_types[f.type] || ['', '']).slice(0, 2))) + '</option>'; }).join('') + '</select></label>' +
        '<label>' + L('Clinicien responsable', 'Responsible clinician') + '<input id="mresp" value="' + esc(a.care.responsible || '') + '"></label><label class="wide">' + L('Note', 'Note') + '<input id="mnote"></label></div><button class="primary" id="msave">' + L('Mettre à jour', 'Update') + '</button>' +
        ' <button class="ghost" id="mtri">' + L('Ouvrir le dossier de triage', 'Open triage record') + '</button>' : '<p class="muted small">' + L('Lecture seule pour ce rôle.', 'Read-only for this role.') + '</p>') +
      '<h4>' + L('Historique et transferts', 'History and transfers') + '</h4><div class="scroll"><table class="tbl small"><tr><th>' + L('Quand', 'When') + '</th><th>' + L('Statut', 'Status') + '</th><th>' + L('Lieu', 'Location') + '</th><th>' + L('Responsable', 'Responsible') + '</th><th>' + L('Par', 'By') + '</th><th>' + L('Note', 'Note') + '</th></tr>' +
      a.care.history.slice().reverse().map(function (h) { return '<tr><td>' + B.fmtDT(h.at) + '</td><td>' + esc(lbl2(CARE[h.status])) + '</td><td>' + (h.transfer ? '<b>' + L('Transfert : ', 'Transfer: ') + '</b>' + esc(B.nm(facs, h.from)) + ' → ' : '') + esc(B.nm(facs, h.location)) + '</td><td>' + esc(h.responsible || '') + '</td><td>' + esc(h.by) + '</td><td>' + esc(B.sysText(h.note)) + '</td></tr>'; }).join('') + '</table></div>';
    if (B.$('#mpdf', box)) B.$('#mpdf', box).onclick = function () { B.caseReportPDF(a.id); };
    var s = B.$('#msave', box);
    if (s) s.onclick = function () {
      var ok = B.careApi.set(a, B.$('#mst', box).value, B.$('#mloc', box).value, B.$('#mresp', box).value, B.$('#mnote', box).value);
      if (!ok) { B.notify(L('Prise en charge à domicile non autorisée.', 'Home-based care not permitted.'), 'err'); return; }
      if (a.review && a.review.status === 'pending') a.review = { status: 'done', at: B.iso(new Date()), by: B.user() };
      B.audit('care_update', 'assessment', a.id, a.care.status); B.save(); B.VIEWS.casemgmt(v);
    };
    var tr = B.$('#mtri', box); if (tr) tr.onclick = function () { B.st.lastId = a.id; B.go('result'); };
  }
})();
