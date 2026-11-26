/* Contact tracing and follow-up: registration, links to one or more index cases,
 * operational status, daily follow-up encounters, overdue detection and referral
 * of symptomatic contacts to clinical triage.
 */
(function () {
  'use strict';
  var B = window.BDBV;
  var L = function (f, e) { return B.L(f, e); };
  var esc = function (x) { return B.esc(x); };
  var DAY = 86400000;

  var STATUS = {
    identified: ['Contact identifié', 'Contact identified'], tracing: ['Recherche initiée', 'Contact tracing initiated'], located: ['Contact retrouvé', 'Contact successfully located'],
    followup: ['Sous suivi', 'Under follow-up'], completed: ['Suivi terminé', 'Follow-up completed'], lost: ['Perdu de vue', 'Lost to follow-up'],
    symptomatic: ['A développé des symptômes', 'Developed symptoms'], referred: ['Référé pour évaluation clinique', 'Referred for clinical assessment'],
    suspected: ['Classé cas suspect', 'Classified as suspected case'], closed: ['Suivi clôturé', 'Follow-up closed']
  };
  var ACTIVE = ['identified', 'tracing', 'located', 'followup', 'symptomatic'];
  var EXPO = [['household', 'Partage du ménage', 'Shared household'], ['care', 'Soins au malade', 'Cared for the patient'], ['body', 'Contact avec le corps / funérailles', 'Contact with the body / funeral'],
    ['fluids', 'Contact avec liquides biologiques', 'Contact with body fluids'], ['linen', 'Linge / objets du malade', 'Patient\'s linen / objects'], ['facility', 'Même structure de santé', 'Same health facility'], ['other', 'Autre', 'Other']];
  var FSYM = ['fever', 'asthenia', 'vomiting', 'diarrhoea', 'headache', 'bleeding', 'myalgia', 'sore_throat'];
  var ACTIONS = [['none', 'Aucune (asymptomatique)', 'None (no symptoms)'], ['advice', 'Conseils donnés', 'Advice given'], ['refer', 'Référé pour évaluation', 'Referred for assessment'], ['absent', 'Absent - nouvelle visite', 'Not found - revisit']];

  function db() { return B.db(); }
  function days() { return (db().config || {}).followup_days || 21; }
  function lbl2(p) { return p ? L(p[0], p[1]) : ''; }
  function endDate(c) { return c.last_exposure ? new Date(new Date(c.last_exposure).getTime() + days() * DAY) : null; }
  function lastFU(c) { return c.followups.length ? c.followups[c.followups.length - 1] : null; }
  function dayN(c, now) { return c.last_exposure ? Math.floor(((now || new Date()) - new Date(c.last_exposure)) / DAY) : null; }
  // Daily visits expected while active and within the follow-up period.
  function state(c, now) {
    now = now || new Date();
    var end = endDate(c), lf = lastFU(c);
    var inPeriod = end && now <= end;
    var active = ACTIVE.indexOf(c.status) >= 0;
    var since = lf ? (now - new Date(lf.at)) : (now - new Date(c.identified_at));
    return { inPeriod: !!inPeriod, active: active, periodEnded: !!(end && now > end && active), dueToday: active && inPeriod && (!lf || B.ymd(new Date(lf.at)) !== B.ymd(now)), overdue: active && inPeriod && since > DAY * 1.5, day: dayN(c, now) };
  }
  function setStatus(c, s, note) { c.status = s; c.status_history.push({ at: B.iso(new Date()), status: s, by: B.user(), note: note || '' }); c.synced = false; }

  B.contactsApi = { STATUS: STATUS, state: state, setStatus: setStatus, days: days };

  var cf = { status: 'active', zone: '', due: false, open: null, showForm: false };
  B.VIEWS.contacts = function (v) {
    var d = db(), now = new Date(), names = B.can('contacts_names'), edit = B.can('contacts_edit');
    var all = d.contacts;
    var k = { total: all.length, due: 0, overdue: 0, completed: 0, symptomatic: 0, lost: 0, active: 0 };
    all.forEach(function (c) {
      var s = state(c, now);
      if (s.active) k.active++; if (s.dueToday) k.due++; if (s.overdue) k.overdue++;
      if (c.status === 'completed' || c.status === 'closed') k.completed++;
      if (['symptomatic', 'referred', 'suspected'].indexOf(c.status) >= 0) k.symptomatic++;
      if (c.status === 'lost') k.lost++;
    });
    var rows = all.filter(function (c) {
      var s = state(c, now);
      if (cf.status === 'active' && !s.active) return false;
      if (cf.status !== 'active' && cf.status !== 'all' && c.status !== cf.status) return false;
      if (cf.zone && c.geo.zone !== cf.zone) return false;
      if (cf.due && !(s.dueToday || s.overdue)) return false;
      return true;
    }).sort(function (a, b) { return (state(b, now).overdue - state(a, now).overdue) || (new Date(b.identified_at) - new Date(a.identified_at)); });
    var kp = function (l, n, cls) { return '<div class="kpi ' + (cls || '') + '"><div class="kv">' + n + '</div><div class="kl">' + esc(l) + '</div></div>'; };
    var cases = d.assessments.filter(function (a) { return a.result.category !== 'GREEN' || (a.classification && ['suspected', 'probable', 'confirmed'].indexOf(a.classification.status) >= 0); }).slice(0, 300);
    v.innerHTML = '<section class="card"><h2>' + L('Suivi des contacts', 'Contact tracing and follow-up') + '</h2>' +
      '<p class="muted small">' + L('Période de suivi configurée : ', 'Configured follow-up period: ') + days() + L(' jours après le dernier contact (à confirmer selon le protocole national et l\'OMS). Visite quotidienne attendue ; « en retard » = pas de visite depuis plus de 36 h.', ' days after last exposure (to confirm against national and WHO protocol). Daily visit expected; "overdue" = no visit for more than 36 h.') + '</p>' +
      '<div class="kpis">' + kp(L('Contacts enregistrés', 'Contacts registered'), k.total) + kp(L('Actifs (à suivre)', 'Active (to follow)'), k.active) + kp(L('Visite due aujourd\'hui', 'Visit due today'), k.due, k.due ? 'k-AMBER' : '') + kp(L('Suivis en retard', 'Overdue follow-ups'), k.overdue, k.overdue ? 'k-RED' : '') +
      kp(L('Suivis terminés', 'Completed follow-ups'), k.completed, 'k-GREEN') + kp(L('Ont développé des symptômes', 'Developed symptoms'), k.symptomatic, k.symptomatic ? 'k-RED' : '') + kp(L('Perdus de vue', 'Lost to follow-up'), k.lost) + '</div></section>' +
      (edit ? '<section class="card"><details' + (cf.showForm ? ' open' : '') + ' id="cnew"><summary>+ ' + L('Enregistrer un contact', 'Register a contact') + '</summary>' + regForm(cases) + '</details></section>' : '') +
      '<section class="card"><div class="vbar"><label class="inl">' + L('Statut', 'Status') + ' <select id="cf-s"><option value="active">' + L('Actifs', 'Active') + '</option><option value="all"' + (cf.status === 'all' ? ' selected' : '') + '>' + B.t('all') + '</option>' +
      Object.keys(STATUS).map(function (s) { return '<option value="' + s + '"' + (cf.status === s ? ' selected' : '') + '>' + esc(lbl2(STATUS[s])) + '</option>'; }).join('') + '</select></label>' +
      '<label class="inl">' + L('Zone', 'Zone') + ' <select id="cf-z"><option value="">' + B.t('all') + '</option>' + B.G.zones.filter(function (z) { return all.some(function (c) { return c.geo.zone === z.id; }); }).map(function (z) { return '<option value="' + z.id + '"' + (cf.zone === z.id ? ' selected' : '') + '>' + esc(z.name) + '</option>'; }).join('') + '</select></label>' +
      '<label class="check"><input type="checkbox" id="cf-d"' + (cf.due ? ' checked' : '') + '> ' + L('À visiter / en retard', 'To visit / overdue') + '</label></div>' +
      '<div class="scroll"><table class="tbl"><tr><th>ID</th>' + (names ? '<th>' + L('Nom', 'Name') + '</th>' : '') + '<th>' + L('Âge / sexe', 'Age / sex') + '</th><th>' + L('Village', 'Village') + '</th><th>' + L('Cas index', 'Index case(s)') + '</th><th>' + L('Dernier contact', 'Last exposure') + '</th><th>' + L('Jour', 'Day') + '</th><th>' + L('Statut', 'Status') + '</th><th>' + L('Dernière visite', 'Last visit') + '</th></tr>' +
      rows.slice(0, 200).map(function (c) {
        var s = state(c, now), lf = lastFU(c);
        return '<tr><td><a href="#" data-copen="' + c.id + '"><code>' + esc(c.id) + '</code></a>' + (c.demo ? ' <span class="tag">' + L('démo', 'demo') + '</span>' : '') + '</td>' + (names ? '<td>' + esc(c.last + ' ' + c.first) + '</td>' : '') +
          '<td>' + esc(c.age_group || '-') + ' / ' + esc(c.sex || '-') + '</td><td>' + esc(B.nm(B.G.villages, c.geo.village)) + '</td><td class="small">' + c.index_cases.map(esc).join('<br>') + '</td>' +
          '<td>' + B.fmtD(c.last_exposure) + '</td><td>' + (s.day == null ? '-' : s.day + '/' + days()) + '</td><td>' + esc(lbl2(STATUS[c.status])) + (s.overdue ? ' <span class="sig">' + L('EN RETARD', 'OVERDUE') + '</span>' : (s.dueToday ? ' <span class="tag">' + L('à visiter', 'due') + '</span>' : '')) + (s.periodEnded ? ' <span class="tag">' + L('période terminée', 'period ended') + '</span>' : '') + '</td>' +
          '<td>' + (lf ? B.fmtDT(lf.at) : '-') + '</td></tr>';
      }).join('') + '</table></div></section><section class="card" id="cdetail"></section>';
    var bind = function (id, fn) { var el = B.$(id, v); if (el) el.onchange = fn; };
    bind('#cf-s', function () { cf.status = this.value; B.VIEWS.contacts(v); });
    bind('#cf-z', function () { cf.zone = this.value; B.VIEWS.contacts(v); });
    bind('#cf-d', function () { cf.due = this.checked; B.VIEWS.contacts(v); });
    B.$$('[data-copen]', v).forEach(function (a) { a.onclick = function (e) { e.preventDefault(); cf.open = a.getAttribute('data-copen'); detail(v); }; });
    var form = B.$('#cform', v);
    if (form) {
      B.bindGeo(form, 'c_', false, null);
      form.onsubmit = function (e) { e.preventDefault(); register(form, v); };
    }
    if (cf.open) detail(v);
  };

  function regForm(cases) {
    return '<form id="cform" novalidate><div class="grid">' +
      '<label>' + L('Nom', 'Surname') + ' *<input name="clast"></label><label>' + L('Prénom', 'First name') + ' *<input name="cfirst"></label>' +
      '<label>' + L('Tranche d\'âge', 'Age group') + ' *<select name="cage"><option value=""></option>' + B.AGE_GROUPS.map(function (g) { return '<option>' + g + '</option>'; }).join('') + '</select></label>' +
      '<label>' + L('Sexe', 'Sex') + ' *<select name="csex"><option value=""></option><option value="F">' + L('Féminin', 'Female') + '</option><option value="M">' + L('Masculin', 'Male') + '</option></select></label>' +
      '<label>' + L('Téléphone', 'Phone') + '<input type="tel" name="cphone"></label><label class="wide">' + L('Adresse de résidence', 'Residential address') + '<input name="caddr"></label></div>' +
      '<div data-geoholder="c_">' + B.geoFields('c_', { province: 'P-ituri', zone: 'Z-aru' }, false) + '</div><div class="grid">' +
      '<label class="wide">' + L('Cas index (un ou plusieurs ID, séparés par des virgules)', 'Index case(s) (one or more IDs, comma-separated)') + ' *<input name="cidx" list="cidx-list" placeholder="BDB-…"><datalist id="cidx-list">' + cases.map(function (a) { return '<option value="' + esc(a.id) + '">' + esc(a.result.category + ' · ' + B.classLabel(a.classification)) + '</option>'; }).join('') + '</datalist></label>' +
      '<label>' + L('Nature de l\'exposition', 'Nature of exposure') + ' *<select name="cexp">' + EXPO.map(function (x) { return '<option value="' + x[0] + '">' + esc(L(x[1], x[2])) + '</option>'; }).join('') + '</select></label>' +
      '<label>' + L('Date du dernier contact', 'Date of last exposure') + ' *<input type="date" name="clast_exp"></label>' +
      '<label>' + L('Date d\'identification', 'Date identified') + '<input type="date" name="cident" value="' + B.ymd(new Date()) + '"></label>' +
      '<label>' + L('Agent de suivi assigné', 'Assigned tracing officer') + '<select name="coff">' + B.queue.OFFICERS.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select></label></div>' +
      '<button class="primary" type="submit">' + L('Enregistrer le contact', 'Register contact') + '</button></form>';
  }

  function register(form, v) {
    var E = form.elements, g = B.readGeo(form, 'c_'), d = db(), miss = [];
    if (!E.clast.value.trim() || !E.cfirst.value.trim()) miss.push(L('Nom et prénom', 'Name'));
    if (!E.cage.value) miss.push(L('Tranche d\'âge', 'Age group'));
    if (!E.csex.value) miss.push(L('Sexe', 'Sex'));
    if (!g.village) miss.push('village');
    if (!E.clast_exp.value) miss.push(L('Date du dernier contact', 'Last exposure date'));
    var idx = E.cidx.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    var unknown = idx.filter(function (id) { return !B.byId(d.assessments, id); });
    if (!idx.length) miss.push(L('Cas index', 'Index case'));
    if (miss.length) { B.notify(B.t('required') + ' :\n- ' + miss.join('\n- '), 'err'); return; }
    if (unknown.length) { B.notify(L('Cas index introuvable : ', 'Index case not found: ') + unknown.join(', '), 'err'); return; }
    var gv = B.geoOfVillage(g.village);
    var c = { id: B.newId('CTC', gv.zone.replace('Z-', '').slice(0, 3).toUpperCase()), first: E.cfirst.value.trim(), last: E.clast.value.trim(), age_group: E.cage.value, sex: E.csex.value, phone: E.cphone.value, address: E.caddr.value,
      geo: gv, index_cases: idx, exposure: { nature: E.cexp.value }, last_exposure: E.clast_exp.value, identified_at: new Date(E.cident.value || Date.now()).toISOString(), officer: E.coff.value,
      status: 'identified', status_history: [{ at: B.iso(new Date()), status: 'identified', by: B.user(), note: '' }], followups: [], synced: false, demo: false };
    // Same person already registered for another case? Link instead of duplicating.
    var dup = d.contacts.filter(function (x) { return x.last.toLowerCase() === c.last.toLowerCase() && x.first.toLowerCase() === c.first.toLowerCase() && x.geo.village === c.geo.village; })[0];
    if (dup) {
      B.ask(L('Ce contact existe déjà : ', 'This contact already exists: ') + dup.id + L('. Ajouter le(s) cas index à ce contact ?', '. Add the index case(s) to this contact?'), L('Ajouter au contact existant', 'Add to existing contact'), L('Créer quand même', 'Create anyway'),
        function () { idx.forEach(function (i) { if (dup.index_cases.indexOf(i) < 0) dup.index_cases.push(i); }); if (c.last_exposure > dup.last_exposure) dup.last_exposure = c.last_exposure; B.audit('link_index', 'contact', dup.id, idx.join(',')); B.save(); cf.open = dup.id; B.VIEWS.contacts(v); },
        function () { save(c); });
      return;
    }
    save(c);
    function save(x) { d.contacts.unshift(x); B.audit('create', 'contact', x.id, idx.join(',')); B.save(); cf.open = x.id; cf.showForm = false; B.notify(L('Contact enregistré : ', 'Contact registered: ') + x.id); B.VIEWS.contacts(v); }
  }

  function detail(v) {
    var c = B.byId(db().contacts, cf.open), box = B.$('#cdetail', v); if (!c || !box) return;
    var s = state(c), edit = B.can('contacts_edit'), names = B.can('contacts_names');
    var end = endDate(c);
    box.innerHTML = '<h3>' + esc(c.id) + (names ? ' · ' + esc(c.last + ' ' + c.first) : '') + '</h3>' +
      '<div class="grid small"><div><b>' + L('Statut', 'Status') + '</b><br>' + esc(lbl2(STATUS[c.status])) + '</div><div><b>' + L('Cas index', 'Index case(s)') + '</b><br>' + c.index_cases.map(esc).join(', ') + '</div>' +
      '<div><b>' + L('Exposition', 'Exposure') + '</b><br>' + esc(L.apply(null, (EXPO.filter(function (x) { return x[0] === c.exposure.nature; })[0] || ['', '-', '-']).slice(1))) + ' · ' + B.fmtD(c.last_exposure) + '</div>' +
      '<div><b>' + L('Fin du suivi', 'End of follow-up') + '</b><br>' + (end ? B.fmtD(end.toISOString()) : '-') + ' (' + L('jour ', 'day ') + (s.day == null ? '-' : s.day) + '/' + days() + ')</div>' +
      '<div><b>' + L('Agent', 'Officer') + '</b><br>' + esc(c.officer) + '</div>' + (names ? '<div><b>' + L('Téléphone', 'Phone') + '</b><br>' + esc(c.phone || '-') + '</div><div><b>' + L('Adresse', 'Address') + '</b><br>' + esc(c.address || '-') + '</div>' : '') +
      (c.referred_assessment ? '<div><b>' + L('Évaluation clinique', 'Clinical assessment') + '</b><br><code>' + esc(c.referred_assessment) + '</code></div>' : '') + '</div>' +
      (edit ? '<div class="vbar"><label class="inl">' + L('Changer le statut', 'Change status') + ' <select id="cst">' + Object.keys(STATUS).map(function (k) { return '<option value="' + k + '"' + (k === c.status ? ' selected' : '') + '>' + esc(lbl2(STATUS[k])) + '</option>'; }).join('') + '</select></label><button class="sm" id="cstb">' + L('Enregistrer', 'Save') + '</button>' +
        (['symptomatic', 'followup', 'located'].indexOf(c.status) >= 0 && !c.referred_assessment ? '<button class="sm primary" id="cref">' + L('Référer pour évaluation clinique', 'Refer for clinical assessment') + '</button>' : '') + '</div>' +
        '<details open><summary>' + L('Ajouter une visite de suivi', 'Add a follow-up visit') + '</summary><form id="fuf" novalidate><div class="grid">' +
        '<label>' + L('Date et heure', 'Date and time') + '<input type="datetime-local" name="fat" value="' + new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) + '"></label>' +
        '<label>' + L('Température (°C)', 'Temperature (°C)') + '<input type="number" step="0.1" name="ftemp"></label>' +
        '<label>' + L('Lieu de la visite', 'Location of contact') + '<select name="floc"><option value="home">' + L('Domicile', 'Home') + '</option><option value="phone">' + L('Par téléphone', 'By phone') + '</option><option value="other">' + L('Autre lieu', 'Other place') + '</option></select></label>' +
        '<label>' + L('Action', 'Action') + '<select name="fact">' + ACTIONS.map(function (x) { return '<option value="' + x[0] + '">' + esc(L(x[1], x[2])) + '</option>'; }).join('') + '</select></label>' +
        '<label>' + L('Prochaine visite', 'Next visit') + '<input type="date" name="fnext" value="' + B.ymd(new Date(Date.now() + DAY)) + '"></label>' +
        '<label class="wide">' + L('Nouvelle exposition / remarques', 'New exposure / remarks') + '<input name="fnote"></label></div>' +
        '<p class="small">' + L('Symptômes observés ou rapportés :', 'Symptoms reported or observed:') + '</p><div class="checks">' + FSYM.map(function (id) { return '<label class="check"><input type="checkbox" name="fsym" value="' + id + '"> ' + esc(B.lbl(B.itemById(id))) + '</label>'; }).join('') + '</div>' +
        '<button class="primary" type="submit">' + L('Enregistrer la visite', 'Save visit') + '</button></form></details>' : '') +
      '<h4>' + L('Visites de suivi', 'Follow-up visits') + ' (' + c.followups.length + ')</h4><div class="scroll"><table class="tbl small"><tr><th>' + L('Date', 'Date') + '</th><th>' + L('Symptômes', 'Symptoms') + '</th><th>°C</th><th>' + L('Lieu', 'Place') + '</th><th>' + L('Agent', 'Officer') + '</th><th>' + L('Action', 'Action') + '</th><th>' + L('Prochaine', 'Next') + '</th></tr>' +
      c.followups.slice().reverse().map(function (f) { return '<tr><td>' + B.fmtDT(f.at) + '</td><td>' + (f.symptoms.length ? '<b>' + esc(f.symptoms.map(function (id) { return B.lbl(B.itemById(id)); }).join(', ')) + '</b>' : L('aucun', 'none')) + '</td><td>' + esc(f.temp || '-') + '</td><td>' + esc(f.location) + '</td><td>' + esc(f.officer) + '</td><td>' + esc(f.action) + '</td><td>' + B.fmtD(f.next_at) + '</td></tr>'; }).join('') + '</table></div>' +
      '<h4>' + L('Historique des statuts', 'Status history') + '</h4><p class="small">' + c.status_history.map(function (h) { return B.fmtDT(h.at) + ' - ' + esc(lbl2(STATUS[h.status])) + ' (' + esc(h.by) + ')'; }).join('<br>') + '</p>';
    var stb = B.$('#cstb', box); if (stb) stb.onclick = function () { setStatus(c, B.$('#cst', box).value); B.audit('status', 'contact', c.id, c.status); B.save(); B.VIEWS.contacts(v); };
    var ref = B.$('#cref', box); if (ref) ref.onclick = function () { refer(c); B.VIEWS.contacts(v); };
    var fuf = B.$('#fuf', box);
    if (fuf) fuf.onsubmit = function (e) {
      e.preventDefault();
      var E = fuf.elements, sym = B.$$('input[name="fsym"]:checked', fuf).map(function (x) { return x.value; });
      var temp = parseFloat(E.ftemp.value);
      if (!isNaN(temp) && temp >= 38 && sym.indexOf('fever') < 0) sym.unshift('fever');
      c.followups.push({ at: new Date(E.fat.value || Date.now()).toISOString(), symptoms: sym, temp: E.ftemp.value, exposure: E.fnote.value, location: E.floc.value, officer: B.user(), action: E.fact.value, next_at: E.fnext.value, outcome: sym.length ? 'symptomatic' : 'well' });
      if (['identified', 'tracing', 'located'].indexOf(c.status) >= 0) setStatus(c, 'followup');
      if (sym.length && ['followup', 'located'].indexOf(c.status) >= 0) setStatus(c, 'symptomatic', sym.join(','));
      if (E.fact.value === 'refer') refer(c);
      B.audit('followup', 'contact', c.id, sym.length ? 'symptoms: ' + sym.join(',') : 'well');
      B.save(); B.notify(sym.length ? L('Symptômes enregistrés : référez le contact pour évaluation clinique.', 'Symptoms recorded: refer the contact for clinical assessment.') : L('Visite enregistrée.', 'Visit saved.'), sym.length ? 'err' : '');
      B.VIEWS.contacts(v);
    };
  }

  // Referral: the contact appears in the referral list of health workers (Assessments tab),
  // who start a triage pre-filled from the contact record.
  function refer(c) {
    setStatus(c, 'referred'); c.referral = { at: B.iso(new Date()), by: B.user() };
    B.audit('refer', 'contact', c.id, '');
    B.save();
  }

  B.referralsPanel = function () {
    if (!B.can('triage')) return '';
    var list = db().contacts.filter(function (c) { return c.status === 'referred' && !c.referred_assessment; });
    if (!list.length) return '';
    return '<section class="card warn"><h3>' + L('Contacts référés pour évaluation clinique', 'Contacts referred for clinical assessment') + ' (' + list.length + ')</h3><ul>' +
      list.map(function (c) { return '<li><code>' + esc(c.id) + '</code> · ' + esc(c.last + ' ' + c.first) + ' · ' + esc(B.nm(B.G.villages, c.geo.village)) + ' · ' + L('cas index ', 'index ') + esc(c.index_cases.join(', ')) + ' <button class="sm primary" data-ctriage="' + c.id + '">' + L('Démarrer le triage', 'Start triage') + '</button></li>'; }).join('') + '</ul></section>';
  };
  B.bindReferrals = function (v) {
    B.$$('[data-ctriage]', v).forEach(function (b) {
      b.onclick = function () {
        var c = B.byId(db().contacts, b.getAttribute('data-ctriage'));
        var fac = (B.userCtx().facility) || '';
        B.st.prefill = { contact_id: c.id, geo: Object.assign({}, c.geo, { facility: fac }), person: { last: c.last, first: c.first, sex: c.sex, phone: c.phone, addr_cur: c.address }, exposure: { id: 'contact_case', date: c.last_exposure } };
        B.st.editing = null; B.go('triage');
      };
    });
  };
  B.applyPrefill = function (form) {
    var p = B.st.prefill; if (!p || !p.exposure) return;
    var r = form.querySelector('input[name="s_' + p.exposure.id + '"][value="yes"]'); if (!r) return;
    r.checked = true;
    var det = B.$('#det_' + p.exposure.id, form); if (det) det.classList.remove('hide');
    if (form.elements['d_' + p.exposure.id]) form.elements['d_' + p.exposure.id].value = p.exposure.date || '';
    if (form.elements['c_' + p.exposure.id]) form.elements['c_' + p.exposure.id].value = (B.byId(db().contacts, p.contact_id) || { index_cases: [] }).index_cases.join(', ');
  };
  // When the triage is saved, close the loop on the contact record.
  var prevCreated = B.onAssessmentCreated;
  B.onAssessmentCreated = function (rec) {
    if (prevCreated) prevCreated(rec);
    if (!rec.contact_id) return;
    var c = B.byId(db().contacts, rec.contact_id); if (!c) return;
    c.referred_assessment = rec.id;
    if (rec.result.category === 'RED') setStatus(c, 'suspected', rec.id);
  };
})();
