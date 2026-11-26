/* BDBV Triage & Community Surveillance - functional prototype.
 * Offline-first single-page app. Data are kept in the browser (localStorage)
 * and marked "pending" until synchronised. There is no server in this
 * prototype: "Sync" simulates the upload step described in docs/05.
 */
(function () {
  'use strict';
  var BASE_RULES = window.BDBV_RULES, G = window.BDBV_GEO, S = window.BDBVScoring, I18N = window.BDBV_I18N;
  var DB_KEY = 'bdbv_proto_db_v1';
  var DAY = 86400000;

  var st = { lang: 'fr', role: 'soignant', tab: 'home', online: true, editing: null, lastId: null,
    f: { province: '', zone: '', area: '', village: '', facility: '', days: '30' } };

  var ROLES = {
    reco: ['home', 'reco', 'myreports'],
    soignant: ['home', 'triage', 'patients', 'alerts', 'dashboard'],
    surveillant: ['home', 'patients', 'alerts', 'verify', 'dashboard', 'rules', 'audit'],
    decideur: ['home', 'dashboard']
  };
  var USERS = { reco: 'RECO-BUN1-001 (démo)', soignant: 'Infirmier·e démo', surveillant: 'Surveillant·e ZS démo', decideur: 'Décideur démo' };
  var RECO_HOME = { village: 'Z-RWA-A1-V1' };
  var ALERT_ESCALATION_MIN = 30;

  /* ---------- storage ---------- */
  function fresh() { return { assessments: [], reports: [], alerts: [], audit: [], override: null }; }
  function load() { try { var s = localStorage.getItem(DB_KEY); if (s) return JSON.parse(s); } catch (e) {} return fresh(); }
  var db = load();
  function save() { try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) {} }
  function rules() {
    if (!db.override) return BASE_RULES;
    var r = JSON.parse(JSON.stringify(BASE_RULES));
    r.thresholds = db.override.thresholds;
    r.version = BASE_RULES.version + '+local.' + db.override.rev;
    return r;
  }

  /* ---------- helpers ---------- */
  function $(s, e) { return (e || document).querySelector(s); }
  function $$(s, e) { return Array.prototype.slice.call((e || document).querySelectorAll(s)); }
  function t(k) { return (I18N[st.lang] && I18N[st.lang][k]) || I18N.fr[k] || k; }
  function L(fr, en) { return st.lang === 'en' ? en : fr; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function nm(list, id) { var o = byId(list, id); return o ? o.name : '-'; }
  function lbl(it) { return st.lang === 'en' ? it.label_en : it.label_fr; }
  function iso(d) { return d.toISOString(); }
  function ymd(d) { return d.toISOString().slice(0, 10); }
  function fmtDT(s) { var d = new Date(s); return isNaN(d) ? '-' : d.toLocaleString(st.lang === 'en' ? 'en-GB' : 'fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  function fmtD(s) { var d = new Date(s); return isNaN(d) ? '-' : d.toLocaleDateString(st.lang === 'en' ? 'en-GB' : 'fr-FR'); }
  function localDT(d) { var z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 16); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, ''); }
  function chip(cat) { return '<span class="chip ' + cat + '">' + esc(t(cat)) + '</span>'; }
  function geoOfVillage(vid) {
    var v = byId(G.villages, vid); if (!v) return {};
    var a = byId(G.areas, v.area), z = byId(G.zones, a.zone);
    return { village: v.id, area: a.id, zone: z.id, province: z.province };
  }
  function itemsOf(kind) { return rules().items.filter(function (i) { return i.kind === kind; }); }
  function itemById(id) { return byId(rules().items, id); }

  var B32 = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  function rnd(n) {
    var a = new Uint32Array(n);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a); else for (var i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 1e9);
    return Array.prototype.map.call(a, function (x) { return B32[x % B32.length]; }).join('');
  }
  function withCheck(s) { var sum = 0; for (var i = 0; i < s.length; i++) sum = (sum * 31 + s.charCodeAt(i)) % B32.length; return s + B32[sum]; }
  function newId(prefix, code, d) { return withCheck(prefix + '-' + (code ? code + '-' : '') + ymd(d || new Date()).replace(/-/g, '').slice(2) + '-' + rnd(4)); }

  // In-page messages and confirmations (browser alert/confirm dialogs are
  // unreliable in embedded or sandboxed viewers).
  function notify(msg, kind) {
    var el = $('#toast'); if (!el) return;
    el.textContent = msg; el.className = 'toast ' + (kind || ''); el.hidden = false;
    clearTimeout(notify.t); notify.t = setTimeout(function () { el.hidden = true; }, kind === 'err' ? 9000 : 5000);
  }
  function ask(msg, yesLabel, noLabel, onYes, onNo) {
    var el = $('#ask'); if (!el) return;
    el.innerHTML = '<div class="askbox" role="dialog" aria-modal="true"><p>' + esc(msg).replace(/\n/g, '<br>') + '</p><div class="actions"><button class="primary" id="askyes">' + esc(yesLabel) + '</button> <button class="ghost" id="askno">' + esc(noLabel) + '</button></div></div>';
    el.hidden = false;
    $('#askyes', el).focus();
    $('#askyes', el).onclick = function () { el.hidden = true; if (onYes) onYes(); };
    $('#askno', el).onclick = function () { el.hidden = true; if (onNo) onNo(); };
  }

  function audit(action, entity, id, detail) {
    db.audit.unshift({ at: iso(new Date()), user: USERS[st.role], role: st.role, action: action, entity: entity, id: id, detail: detail || '' });
    if (db.audit.length > 1000) db.audit.length = 1000;
    save();
  }
  function pendingCount() {
    return db.assessments.filter(function (x) { return !x.synced; }).length + db.reports.filter(function (x) { return !x.synced; }).length + db.alerts.filter(function (x) { return !x.synced; }).length;
  }

  /* ---------- geo select component ---------- */
  function opts(list, sel, allLabel) {
    return '<option value="">' + esc(allLabel || '-') + '</option>' + list.map(function (o) { return '<option value="' + o.id + '"' + (o.id === sel ? ' selected' : '') + '>' + esc(o.name) + '</option>'; }).join('');
  }
  function geoFields(p, v, withFacility, allLabel) {
    v = v || {};
    var zones = G.zones.filter(function (z) { return !v.province || z.province === v.province; });
    var areas = G.areas.filter(function (a) { return v.zone ? a.zone === v.zone : (!v.province || byId(G.zones, a.zone).province === v.province); });
    var vills = G.villages.filter(function (x) { return v.area ? x.area === v.area : areas.some(function (a) { return a.id === x.area; }); });
    var facs = G.facilities.filter(function (f) { return v.zone ? byId(G.areas, f.area).zone === v.zone : areas.some(function (a) { return a.id === f.area; }); });
    var h = '<div class="grid">' +
      '<label>' + L('Province', 'Province') + (allLabel ? '' : ' *') + '<select data-geo="' + p + '" name="' + p + 'province">' + opts(G.provinces, v.province, allLabel) + '</select></label>' +
      '<label>' + L('Zone de santé', 'Health zone') + (allLabel ? '' : ' *') + '<select data-geo="' + p + '" name="' + p + 'zone">' + opts(zones, v.zone, allLabel) + '</select></label>' +
      '<label>' + L('Aire de santé', 'Health area') + (allLabel ? '' : ' *') + '<select data-geo="' + p + '" name="' + p + 'area">' + opts(areas, v.area, allLabel) + '</select></label>' +
      '<label>' + L('Village / localité', 'Village / locality') + (allLabel ? '' : ' *') + '<select data-geo="' + p + '" name="' + p + 'village">' + opts(vills, v.village, allLabel) + '</select></label>';
    if (withFacility) h += '<label>' + L('Formation sanitaire', 'Health facility') + (allLabel ? '' : ' *') + '<select data-geo="' + p + '" name="' + p + 'facility">' + opts(facs, v.facility, allLabel) + '</select></label>';
    return h + '</div>';
  }
  function readGeo(form, p) {
    var g = {};
    ['province', 'zone', 'area', 'village', 'facility'].forEach(function (k) {
      var el = form.elements ? form.elements[p + k] : form.querySelector('[name="' + p + k + '"]');
      if (el) g[k] = el.value;
    });
    return g;
  }
  // Re-render a geo block after a change, clearing children of the changed level.
  function bindGeo(container, p, withFacility, allLabel, onChange) {
    container.addEventListener('change', function (e) {
      var el = e.target; if (el.getAttribute('data-geo') !== p) return;
      var form = el.form || container;
      var g = readGeo(form, p), lvl = el.name.slice(p.length);
      var order = ['province', 'zone', 'area', 'village'];
      var i = order.indexOf(lvl);
      if (i >= 0) order.slice(i + 1).forEach(function (k) { g[k] = ''; });
      if (lvl === 'zone' || lvl === 'province') g.facility = '';
      // Derive parent levels from the level that changed.
      if (lvl === 'village' && g.village) { var gv = geoOfVillage(g.village); g.area = gv.area; g.zone = gv.zone; g.province = gv.province; }
      if (lvl === 'area' && g.area) { g.zone = byId(G.areas, g.area).zone; g.province = byId(G.zones, g.zone).province; }
      if (lvl === 'zone' && g.zone) { g.province = byId(G.zones, g.zone).province; }
      if (lvl === 'facility' && g.facility && !g.area) { var fa = byId(G.facilities, g.facility); g.area = fa.area; g.zone = byId(G.areas, fa.area).zone; g.province = byId(G.zones, g.zone).province; }
      var holder = $('[data-geoholder="' + p + '"]', container);
      holder.innerHTML = geoFields(p, g, withFacility, allLabel);
      if (onChange) onChange(g);
    });
  }

  /* ---------- layout ---------- */
  function render() {
    var tabs = ROLES[st.role];
    if (tabs.indexOf(st.tab) < 0 && st.tab !== 'result') st.tab = 'home';
    document.documentElement.lang = st.lang;
    $('#title').textContent = t('app_title');
    $('#subtitle').textContent = t('app_sub');
    $('#banner').textContent = t('proto_banner');
    $('#role').innerHTML = Object.keys(ROLES).map(function (r) { return '<option value="' + r + '"' + (r === st.role ? ' selected' : '') + '>' + esc(t('role_' + r)) + '</option>'; }).join('');
    $('#netlabel').textContent = st.online ? t('online') : t('offline');
    $('#net').checked = st.online;
    $('#netdot').className = 'dot ' + (st.online ? 'on' : 'off');
    $('#syncbtn').textContent = t('sync') + ' (' + pendingCount() + ' ' + t('pending') + ')';
    $('#nav').innerHTML = tabs.map(function (k) {
      var badge = '';
      if (k === 'alerts') { var n = db.alerts.filter(function (a) { return !a.ack && visibleAlert(a); }).length; if (n) badge = ' <span class="badge">' + n + '</span>'; }
      if (k === 'verify') { var m = allEvents().filter(function (e) { return e.ev.verification === 'reported'; }).length; if (m) badge = ' <span class="badge">' + m + '</span>'; }
      return '<button class="tab' + (k === st.tab ? ' on' : '') + '" data-tab="' + k + '">' + esc(t('tab_' + k)) + badge + '</button>';
    }).join('');
    var view = $('#view');
    (VIEWS[st.tab] || VIEWS.home)(view);
    window.scrollTo(0, 0);
  }
  function go(tab) { st.tab = tab; render(); }

  /* ---------- HOME ---------- */
  var VIEWS = {};
  VIEWS.home = function (v) {
    var actions = {
      reco: [['reco', L('Nouveau rapport communautaire', 'New community report')], ['myreports', L('Mes rapports et leur statut', 'My reports and status')]],
      soignant: [['triage', L('Nouvelle évaluation de triage', 'New triage assessment')], ['alerts', L('Alertes de ma FOSA', 'My facility alerts')], ['dashboard', L('Tableau de bord', 'Dashboard')]],
      surveillant: [['verify', L('Vérifier les signaux communautaires', 'Verify community signals')], ['alerts', L('Suivre les alertes rouges', 'Follow red alerts')], ['dashboard', L('Tableau de bord intégré', 'Integrated dashboard')]],
      decideur: [['dashboard', L('Tableau de bord (agrégé)', 'Dashboard (aggregate)')]]
    }[st.role];
    v.innerHTML = '<section class="card"><h2>' + esc(t('role_' + st.role)) + '</h2>' +
      '<p class="muted">' + L('Utilisateur :', 'User:') + ' ' + esc(USERS[st.role]) + '</p>' +
      '<div class="bigbtns">' + actions.map(function (a) { return '<button class="big" data-go="' + a[0] + '">' + esc(a[1]) + '</button>'; }).join('') + '</div></section>' +
      '<section class="card warn"><h3>' + L('Principes', 'Principles') + '</h3><ul>' +
      '<li>' + L('Outil d\'alerte précoce et d\'aide à la décision : <b>il ne pose pas de diagnostic</b>. Seul le laboratoire confirme une infection BDBV.', 'Early-warning and decision-support tool: <b>it does not diagnose</b>. Only the laboratory confirms BDBV infection.') + '</li>' +
      '<li>' + L('Suspicion clinique individuelle, signaux communautaires et confirmation biologique sont trois notions <b>séparées</b>.', 'Individual clinical suspicion, community signals and laboratory confirmation are three <b>separate</b> concepts.') + '</li>' +
      '<li>' + L('Le jugement du clinicien prime toujours : il peut relever (ou, avec justification, abaisser) la catégorie.', 'Clinician judgement always prevails: they can raise (or, with justification, lower) the category.') + '</li>' +
      '<li>' + L('Saisie possible hors ligne ; les données sont envoyées à la synchronisation.', 'Works offline; data are sent at synchronisation.') + '</li></ul></section>' +
      '<section class="card"><h3>' + L('Données de démonstration', 'Demonstration data') + '</h3>' +
      '<p class="muted">' + L('Évaluations : ', 'Assessments: ') + db.assessments.length + ' · ' + L('Rapports RECO : ', 'RECO reports: ') + db.reports.length + ' · ' + L('Alertes : ', 'Alerts: ') + db.alerts.length + '</p>' +
      '<button id="seed">' + esc(t('demo_load')) + '</button> <button id="wipe" class="ghost">' + esc(t('demo_reset')) + '</button></section>';
    $$('[data-go]', v).forEach(function (b) { b.onclick = function () { go(b.getAttribute('data-go')); }; });
    $('#seed', v).onclick = function () { seedDemo(); audit('seed_demo', 'system', '-'); render(); };
    $('#wipe', v).onclick = function () { ask(L('Effacer toutes les données enregistrées sur cet appareil ?', 'Erase all data stored on this device?'), L('Effacer', 'Erase'), t('cancel'), function () { db = fresh(); save(); render(); notify(L('Données effacées.', 'Data erased.')); }); };
  };

  /* ---------- TRIAGE FORM (Module A) ---------- */
  function radios(name, val) {
    return '<span class="seg">' + ['yes', 'no', 'unk'].map(function (o) {
      return '<label class="o-' + o + '"><input type="radio" name="' + name + '" value="' + o + '"' + (val === o ? ' checked' : '') + '><span>' + esc(t(o)) + '</span></label>';
    }).join('') + '</span>';
  }
  function symptomRow(it, rec) {
    var s = (rec && rec.clinical.symptoms[it.id]) || {};
    var extra = '';
    if (it.id === 'rash') {
      var r = (rec && rec.clinical.rash) || {};
      extra = '<label>' + L('Distribution', 'Distribution') + '<input name="rash_dist" value="' + esc(r.dist) + '" placeholder="' + L('ex. tronc, généralisée', 'e.g. trunk, generalised') + '"></label>' +
        '<label>' + L('Aspect', 'Appearance') + '<input name="rash_app" value="' + esc(r.appearance) + '" placeholder="' + L('ex. maculopapuleuse', 'e.g. maculopapular') + '"></label>' +
        '<label>' + L('Type', 'Type') + '<select name="rash_type">' + ['', 'maculopapuleuse', 'pétéchiale/purpurique', 'vésiculaire/pustuleuse', 'autre'].map(function (o) { return '<option' + (r.type === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></label>';
    }
    if (it.id === 'bleeding') {
      extra = '<label>' + L('Site(s)', 'Site(s)') + '<input name="bleed_sites" value="' + esc((rec && rec.clinical.bleed_sites) || '') + '" placeholder="' + L('gencives, hématémèse, injection, selles...', 'gums, haematemesis, injection site, stool...') + '"></label>';
    }
    return '<div class="row" data-item="' + it.id + '"><div class="rowhead"><span class="ilabel">' + esc(lbl(it)) + (it.id === 'fever' ? ' *' : '') + (it.core ? '' : ' <span class="tag">' + L('ajout proposé', 'proposed') + '</span>') + '</span>' + radios('s_' + it.id, s.s) + '</div>' +
      '<div class="det' + (s.s === 'yes' ? '' : ' hide') + '" id="det_' + it.id + '"><div class="grid">' +
      '<label>' + L('Date de début', 'Onset date') + '<input type="date" name="d_' + it.id + '" value="' + esc(s.date) + '"></label>' +
      '<label>' + L('Évolution', 'Course') + '<select name="e_' + it.id + '"><option value="ongoing"' + (s.evol === 'ongoing' ? ' selected' : '') + '>' + L('En cours', 'Ongoing') + '</option><option value="resolved"' + (s.evol === 'resolved' ? ' selected' : '') + '>' + L('Résolu', 'Resolved') + '</option></select></label>' +
      '<label class="wide">' + L('Observations', 'Observations') + '<input name="o_' + it.id + '" value="' + esc(s.obs) + '"></label>' + extra + '</div></div></div>';
  }
  function exposureRow(it, rec) {
    var s = (rec && rec.exposures[it.id]) || {};
    return '<div class="row" data-item="' + it.id + '"><div class="rowhead"><span class="ilabel">' + esc(lbl(it)) + (it.core ? '' : ' <span class="tag">' + L('ajout proposé', 'proposed') + '</span>') + '</span>' + radios('s_' + it.id, s.s) + '</div>' +
      '<div class="det' + (s.s === 'yes' ? '' : ' hide') + '" id="det_' + it.id + '"><div class="grid">' +
      '<label>' + L('Date (dernière exposition)', 'Date (last exposure)') + '<input type="date" name="d_' + it.id + '" value="' + esc(s.date) + '"></label>' +
      '<label>' + L('Lieu', 'Place') + '<input name="l_' + it.id + '" value="' + esc(s.loc) + '"></label>' +
      '<label>' + L('Nature du contact', 'Nature of contact') + '<input name="n_' + it.id + '" value="' + esc(s.nature) + '" placeholder="' + L('ex. soins, partage du lit, toilette', 'e.g. nursing, shared bed, body washing') + '"></label>' +
      '<label>' + L('Lien avec le cas', 'Relationship to case') + '<input name="r_' + it.id + '" value="' + esc(s.rel) + '"></label>' +
      '<label>' + L('ID du cas source (si connu)', 'Source case ID (if known)') + '<input name="c_' + it.id + '" value="' + esc(s.case_id) + '"></label>' +
      '</div></div></div>';
  }
  function travelRow(tr) {
    tr = tr || {};
    return '<div class="trip grid">' +
      '<label>' + L('Type', 'Type') + '<select name="tr_type"><option value="dom"' + (tr.type === 'dom' ? ' selected' : '') + '>' + L('Intérieur', 'Domestic') + '</option><option value="int"' + (tr.type === 'int' ? ' selected' : '') + '>' + L('International', 'International') + '</option></select></label>' +
      '<label>' + L('Pays / province', 'Country / province') + '<input name="tr_where" value="' + esc(tr.where) + '"></label>' +
      '<label>' + L('Lieu précis', 'Specific place') + '<input name="tr_place" value="' + esc(tr.place) + '"></label>' +
      '<label>' + L('Du', 'From') + '<input type="date" name="tr_from" value="' + esc(tr.from) + '"></label>' +
      '<label>' + L('Au', 'To') + '<input type="date" name="tr_to" value="' + esc(tr.to) + '"></label>' +
      '<label>' + L('Motif', 'Purpose') + '<input name="tr_purpose" value="' + esc(tr.purpose) + '"></label>' +
      '<label class="wide">' + L('Activités (funérailles, soins, marché, mine...)', 'Activities (funerals, care, market, mining...)') + '<input name="tr_act" value="' + esc(tr.act) + '"></label></div>';
  }

  VIEWS.triage = function (v) {
    var rec = st.editing ? byId(db.assessments, st.editing) : null;
    var p = rec ? rec.person : {}, g = rec ? rec.geo : { province: 'P-ITU', zone: 'Z-RWA', area: 'Z-RWA-A1', facility: 'Z-RWA-A1-F' }, c = rec ? rec.clinical : {}, h = rec ? rec.history : {};
    var comorb = ['VIH', 'Diabète', 'HTA', 'Drépanocytose', 'Grossesse', 'Malnutrition', 'Tuberculose', 'Insuffisance rénale'];
    var occ = ['', 'Agent de santé', 'Tradipraticien', 'Chasseur', 'Mineur / orpailleur', 'Commerçant', 'Cultivateur', 'Élève / étudiant', 'Transporteur / moto-taxi', 'Ménagère', 'Enfant (non applicable)', 'Autre'];
    v.innerHTML = '<form id="tf" class="card" novalidate autocomplete="off">' +
      '<h2>' + (rec ? L('Réévaluation', 'Reassessment') + ' - ' + esc(rec.id) : L('Nouvelle évaluation de triage', 'New triage assessment')) + '</h2>' +
      '<p class="muted">' + L('* obligatoire. « Inconnu / non évalué » n\'est jamais compté comme une absence.', '* mandatory. "Unknown / not assessed" is never counted as absent.') + '</p>' +
      '<details open><summary>A.1 ' + L('Identité et localisation', 'Identity and location') + '</summary><div class="grid">' +
      '<label>' + L('Nom (postnom)', 'Surname') + ' *<input name="last" value="' + esc(p.last) + '"></label>' +
      '<label>' + L('Prénom', 'First name') + ' *<input name="first" value="' + esc(p.first) + '"></label>' +
      '<label>' + L('Date de naissance', 'Date of birth') + '<input type="date" name="dob" value="' + esc(p.dob) + '"></label>' +
      '<label>' + L('Âge (années)', 'Age (years)') + ' *<input type="number" min="0" max="120" name="age" value="' + esc(p.age) + '"></label>' +
      '<label>' + L('Sexe', 'Sex') + ' *<select name="sex"><option value=""></option><option value="F"' + (p.sex === 'F' ? ' selected' : '') + '>' + L('Féminin', 'Female') + '</option><option value="M"' + (p.sex === 'M' ? ' selected' : '') + '>' + L('Masculin', 'Male') + '</option></select></label>' +
      '<label>' + L('Téléphone / contact', 'Phone / contact') + '<input type="tel" name="phone" value="' + esc(p.phone) + '"></label>' +
      '<label>' + L('Profession', 'Occupation') + '<select name="occ">' + occ.map(function (o) { return '<option' + (p.occ === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></label>' +
      '<label class="wide">' + L('Adresse permanente', 'Permanent address') + '<input name="addr_home" value="' + esc(p.addr_home) + '"></label>' +
      '<label class="wide">' + L('Adresse de résidence actuelle', 'Current residence') + '<input name="addr_cur" value="' + esc(p.addr_cur) + '"></label></div>' +
      '<div data-geoholder="g_">' + geoFields('g_', g, true) + '</div>' +
      '<div class="grid"><label>' + L('Date et heure de l\'évaluation', 'Assessment date & time') + ' *<input type="datetime-local" name="assessed_at" value="' + localDT(rec ? new Date() : new Date()) + '"></label></div></details>' +

      '<details open><summary>A.2 ' + L('Informations cliniques', 'Clinical information') + '</summary><div class="grid">' +
      '<label>' + L('Date de début de la maladie', 'Illness onset date') + ' *<input type="date" name="onset" value="' + esc(c.onset_date) + '"></label>' +
      '<label class="check"><input type="checkbox" name="onset_unk"' + (c.onset_unknown ? ' checked' : '') + '> ' + L('Date de début inconnue', 'Onset date unknown') + '</label>' +
      '<label>' + L('Température mesurée (°C)', 'Measured temperature (°C)') + '<input type="number" step="0.1" min="30" max="44" name="temp" value="' + esc(c.temp) + '"></label>' +
      '<label class="check"><input type="checkbox" name="deceased"' + (c.deceased ? ' checked' : '') + '> ' + L('Personne décédée (évaluation post-mortem)', 'Person deceased (post-mortem assessment)') + '</label></div>' +
      itemsOf('symptom').map(function (it) { return symptomRow(it, rec); }).join('') + '</details>' +

      '<details open><summary>A.3 ' + L('Expositions dans les 21 jours avant le début', 'Exposures in the 21 days before onset') + '</summary>' +
      '<p class="muted">' + L('Une exposition datée de plus de 21 jours avant le début (ou après) n\'est pas comptée dans le score.', 'An exposure dated more than 21 days before onset (or after) is not counted in the score.') + '</p>' +
      itemsOf('exposure').concat(itemsOf('geography')).map(function (it) { return exposureRow(it, rec); }).join('') + '</details>' +

      '<details><summary>A.4 ' + L('Antécédents, voyages, vaccinations (contexte - hors score)', 'History, travel, vaccinations (context - not scored)') + '</summary>' +
      '<p class="muted">' + L('Ces variables sont conservées pour le contexte clinique et épidémiologique. Elles ne modifient pas le score (justification : voir document 03).', 'Kept for clinical/epidemiological context; they do not change the score (see document 03).') + '</p>' +
      '<div class="checks">' + comorb.map(function (x) { return '<label class="check"><input type="checkbox" name="comorb" value="' + x + '"' + ((h.comorb || []).indexOf(x) >= 0 ? ' checked' : '') + '> ' + x + '</label>'; }).join('') + '</div>' +
      '<div class="grid"><label class="wide">' + L('Autres antécédents', 'Other conditions') + '<input name="comorb_other" value="' + esc(h.comorb_other) + '"></label></div>' +
      '<h4>' + L('Voyages (4 semaines avant la maladie)', 'Travel (4 weeks before illness)') + '</h4><div id="trips">' + ((h.travel || []).map(travelRow).join('')) + '</div>' +
      '<button type="button" class="ghost" id="addtrip">+ ' + L('Ajouter un voyage', 'Add a trip') + '</button>' +
      '<div class="grid">' +
      '<label>' + L('Vaccin Ebola', 'Ebola vaccine') + '<select name="evax"><option value="unk">' + t('unk') + '</option><option value="yes"' + ((h.evax || {}).s === 'yes' ? ' selected' : '') + '>' + t('yes') + '</option><option value="no"' + ((h.evax || {}).s === 'no' ? ' selected' : '') + '>' + t('no') + '</option></select></label>' +
      '<label>' + L('Type de vaccin', 'Vaccine type') + '<input name="evax_type" value="' + esc((h.evax || {}).type) + '" placeholder="ex. rVSV-ZEBOV (Ervebo)"></label>' +
      '<label>' + L('Date', 'Date') + '<input type="date" name="evax_date" value="' + esc((h.evax || {}).date) + '"></label>' +
      '<label>' + L('Vaccin fièvre jaune', 'Yellow fever vaccine') + '<select name="yf"><option value="unk">' + t('unk') + '</option><option value="yes"' + (h.yf === 'yes' ? ' selected' : '') + '>' + t('yes') + '</option><option value="no"' + (h.yf === 'no' ? ' selected' : '') + '>' + t('no') + '</option></select></label>' +
      '<label>' + L('Antipaludéens', 'Antimalarials') + '<select name="am">' + [['unk', t('unk')], ['none', L('Aucun', 'None')], ['prophylaxis', L('Prophylaxie', 'Prophylaxis')], ['treatment', L('Traitement récent', 'Recent treatment')]].map(function (o) { return '<option value="' + o[0] + '"' + (h.am === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
      '<label>' + L('TDR paludisme', 'Malaria RDT') + '<select name="mrdt">' + [['nd', L('Non fait', 'Not done')], ['pos', L('Positif', 'Positive')], ['neg', L('Négatif', 'Negative')]].map(function (o) { return '<option value="' + o[0] + '"' + (h.mrdt === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label></div>' +
      '<p class="note">' + L('Vaccin Ervebo : sa protection contre le virus Bundibugyo chez l\'humain n\'est pas connue (OMS) - il n\'abaisse donc pas le score. Un TDR paludisme positif n\'exclut pas Ebola.', 'Ervebo: protection against Bundibugyo virus in humans is not known (WHO) - so it does not lower the score. A positive malaria RDT does not exclude Ebola.') + '</p></details>' +

      '<details open><summary>A.5 ' + L('Jugement clinique', 'Clinical judgement') + '</summary><div class="grid">' +
      '<label>' + L('Catégorie retenue par le clinicien (si différente)', 'Clinician category (if different)') + '<select name="cl_cat"><option value="">' + L('- Suivre le résultat de l\'outil -', '- Follow tool result -') + '</option><option value="RED">' + t('RED') + '</option><option value="AMBER">' + t('AMBER') + '</option><option value="GREEN">' + t('GREEN') + '</option></select></label>' +
      '<label class="wide">' + L('Justification (obligatoire si modifiée)', 'Justification (required if changed)') + '<input name="cl_reason"></label></div></details>' +
      '<div id="live" class="live"></div>' +
      '<div class="actions"><button type="submit" class="primary">' + esc(t('save')) + '</button> <button type="button" class="ghost" id="cancel">' + esc(t('cancel')) + '</button></div></form>';

    var form = $('#tf', v);
    if (rec) {
      if (rec.clinician && rec.clinician.category) form.elements.cl_cat.value = rec.clinician.category;
    }
    bindGeo(form, 'g_', true, null, function () { live(form); });
    form.addEventListener('change', function (e) {
      var m = /^s_(.+)$/.exec(e.target.name || '');
      if (m) { var d = $('#det_' + m[1], form); if (d) d.classList.toggle('hide', e.target.value !== 'yes'); }
      if (e.target.name === 'temp' && +e.target.value >= 38) { var fy = form.querySelector('input[name="s_fever"][value="yes"]'); if (fy && !form.elements.s_fever.value) fy.checked = true; }
      if (e.target.name === 'dob' && e.target.value) { var yrs = Math.floor((Date.now() - new Date(e.target.value)) / (365.25 * DAY)); if (yrs >= 0) form.elements.age.value = yrs; }
      live(form);
    });
    form.addEventListener('input', function () { live(form); });
    $('#addtrip', v).onclick = function () { $('#trips', v).insertAdjacentHTML('beforeend', travelRow()); };
    $('#cancel', v).onclick = function () { st.editing = null; go(st.role === 'soignant' ? 'patients' : 'home'); };
    form.onsubmit = function (e) { e.preventDefault(); submitAssessment(form, rec); };
    live(form);
  };

  function buildInput(form) {
    var items = {};
    rules().items.forEach(function (it) {
      var el = form.elements['s_' + it.id];
      var s = (el && el.value) || 'unk';
      var d = form.elements['d_' + it.id];
      items[it.id] = { s: s, date: d && d.value ? d.value : null };
    });
    var onset = form.elements.onset_unk.checked ? null : (form.elements.onset.value || null);
    return {
      onset_date: onset,
      assessed_at: form.elements.assessed_at.value ? new Date(form.elements.assessed_at.value).toISOString() : new Date().toISOString(),
      items: items, deceased: form.elements.deceased.checked,
      clinician: { category: form.elements.cl_cat.value, reason: form.elements.cl_reason.value }
    };
  }

  function resultBlock(res, ctx) {
    var R = rules();
    var h = '<div class="result ' + res.category + '"><div class="rhead">' + chip(res.category) +
      '<div class="score"><b>' + res.score + '</b><small>/100</small></div></div>' +
      '<p class="muted small">' + esc(t('score_note')) + ' ' + L('Seuils (configurables) : rouge ≥ ', 'Thresholds (configurable): red ≥ ') + R.thresholds.red + ', ' + L('orange ≥ ', 'amber ≥ ') + R.thresholds.amber + ' · ' + esc(res.rule_set) + '</p>' +
      '<p>' + Object.keys(res.domain_scores).map(function (k) { return '<span class="pill">' + esc(st.lang === 'en' ? R.domains[k].label_en : R.domains[k].label_fr) + ' ' + res.domain_scores[k].observed + '/' + res.domain_scores[k].cap + '</span>'; }).join(' ') + '</p>' +
      '<p>' + esc(t('completeness')) + ' : <b>' + res.completeness + '%</b></p>';
    if (res.floors_applied.length) h += '<p class="flag">' + esc(t('floors')) + ' : ' + res.floors_applied.map(function (id) { var f = byId(R.floors.map(function (x) { return Object.assign({ id: x.id }, x); }), id); return '<br>• ' + esc(st.lang === 'en' ? f.label_en : f.label_fr) + ' → ' + chip(f.min_category); }).join('') + '</p>';
    if (res.override) h += '<p class="flag">' + L('Catégorie de l\'outil : ', 'Tool category: ') + chip(res.override.from) + ' → ' + L('catégorie du clinicien : ', 'clinician category: ') + chip(res.override.to) + (res.override.direction === 'down' ? ' <b>' + L('(abaissement - revue requise)', '(lowered - review required)') + '</b>' : '') + '</p>';
    if (res.incomplete_could_escalate) h += '<p class="flag">⚠ ' + esc(t('potential')) + ' ' + chip(res.potential_category) + ' (' + L('éléments inconnus : ', 'unknown items: ') + res.unknown_items.length + ')</p>';
    var oow = res.notes.filter(function (n) { return n.indexOf('OUT_OF_WINDOW') === 0; });
    if (oow.length) h += '<p class="muted small">' + L('Expositions hors fenêtre de 21 jours (non comptées) : ', 'Exposures outside 21-day window (not counted): ') + oow.map(function (n) { return esc(lbl(itemById(n.split(':')[1]))); }).join(', ') + '</p>';
    h += '<details><summary>' + L('Détail du calcul', 'Score breakdown') + '</summary><table class="tbl"><tr><th>' + L('Variable', 'Variable') + '</th><th>' + L('Statut', 'Status') + '</th><th>' + L('Points', 'Points') + '</th><th>' + L('Niveau de preuve', 'Evidence') + '</th></tr>' +
      res.contributions.filter(function (c) { return c.points > 0; }).map(function (c) {
        return '<tr class="' + (c.counted ? 'on' : '') + '"><td>' + esc(lbl(itemById(c.id))) + '</td><td>' + esc(c.status === 'out_of_window' ? L('hors fenêtre', 'out of window') : t(c.status)) + '</td><td>' + (c.counted ? '+' + c.points : '0') + '</td><td>' + c.tier + '</td></tr>';
      }).join('') + '</table><p class="muted small">' + L('Plafonds par domaine appliqués avant la somme. Total plafonné à 100.', 'Domain caps applied before summing. Total capped at 100.') + '</p></details></div>';
    if (ctx) h += communityBlock(ctx);
    return h;
  }

  function communityBlock(ctx) {
    var lv = function (o) { return '<span class="lvl l' + o.level + '">' + esc(st.lang === 'en' ? o.label_en : o.label_fr) + '</span>'; };
    var tt = ctx.area.totals;
    return '<div class="ctx"><h4>' + esc(t('community_ctx')) + '</h4>' +
      '<p>' + L('Village : ', 'Village: ') + lv(ctx.village) + ' · ' + L('Aire de santé : ', 'Health area: ') + lv(ctx.area) + ' · ' + L('Zone : ', 'Zone: ') + lv(ctx.zone) + '</p>' +
      '<p class="small">' + L('Aire de santé, ', 'Health area, ') + rules().community.window_days + L(' derniers jours : ', ' last days: ') +
      L('décès inexpliqués ', 'unexplained deaths ') + tt.deaths_unexplained + ' · ' + L('décès suspects Ebola ', 'suspected Ebola deaths ') + tt.deaths_suspected_ebola + ' · ' + L('alertes ', 'alerts ') + tt.alerts + ' · ' + L('groupes de cas ', 'clusters ') + tt.clusters + ' · ' + L('évènements non vérifiés ', 'unverified events ') + ctx.area.unverified_events + '</p>' +
      (ctx.advisory ? '<p class="flag">' + esc(st.lang === 'en' ? rules().community.advisory_en : rules().community.advisory_fr) + '</p>' : '<p class="muted small">' + L('Ces signaux n\'entrent pas dans le score individuel.', 'These signals are not part of the individual score.') + '</p>') + '</div>';
  }

  function live(form) {
    var res = S.evaluate(buildInput(form), rules());
    var g = readGeo(form, 'g_');
    var ctx = g.village ? S.communityContext(db.reports, rules(), geoOfVillage(g.village)) : null;
    $('#live').innerHTML = '<h3>' + L('Résultat en direct', 'Live result') + '</h3>' + resultBlock(res, ctx);
  }

  function submitAssessment(form, rec) {
    var E = form.elements, miss = [];
    if (!E.last.value.trim()) miss.push(L('Nom', 'Surname'));
    if (!E.first.value.trim()) miss.push(L('Prénom', 'First name'));
    if (!E.sex.value) miss.push(L('Sexe', 'Sex'));
    if (!E.age.value && !E.dob.value) miss.push(L('Âge ou date de naissance', 'Age or DOB'));
    var g = readGeo(form, 'g_');
    ['province', 'zone', 'area', 'village', 'facility'].forEach(function (k) { if (!g[k]) miss.push(k); });
    if (!E.onset.value && !E.onset_unk.checked) miss.push(L('Date de début (ou « inconnue »)', 'Onset date (or "unknown")'));
    if (!E.s_fever.value) miss.push(L('Fièvre (oui / non / inconnu)', 'Fever (yes / no / unknown)'));
    if (E.cl_cat.value && !E.cl_reason.value.trim()) miss.push(L('Justification du clinicien', 'Clinician justification'));
    if (miss.length) { notify(t('required') + ' :\n- ' + miss.join('\n- '), 'err'); return; }

    var input = buildInput(form);
    var res = S.evaluate(input, rules());
    var person = { last: E.last.value.trim(), first: E.first.value.trim(), dob: E.dob.value, age: E.age.value, sex: E.sex.value, phone: E.phone.value, occ: E.occ.value, addr_home: E.addr_home.value, addr_cur: E.addr_cur.value };
    var key = norm(person.last + person.first) + '|' + (person.dob || person.age) + '|' + g.village;
    if (!rec) {
      var dup = db.assessments.filter(function (a) { return a.patient_key === key && (Date.now() - new Date(a.assessed_at)) < 30 * DAY; })[0];
      if (dup) {
        ask(L('Doublon possible : ', 'Possible duplicate: ') + dup.id + ' (' + fmtD(dup.assessed_at) + ').\n' + L('Même nom, âge/date de naissance et village dans les 30 derniers jours.', 'Same name, age/DOB and village in the last 30 days.'),
          L('Rouvrir l\'existant (réévaluation)', 'Reopen existing (reassessment)'), L('Créer un nouveau dossier', 'Create a new record'),
          function () { st.editing = dup.id; go('triage'); },
          function () { saveAssessment(form, rec, input, res, person, key, g); });
        return;
      }
    }
    saveAssessment(form, rec, input, res, person, key, g);
  }

  function saveAssessment(form, rec, input, res, person, key, g) {
    var E = form.elements;
    var symptoms = {}, exposures = {};
    itemsOf('symptom').forEach(function (it) { symptoms[it.id] = { s: input.items[it.id].s, date: input.items[it.id].date, evol: E['e_' + it.id].value, obs: E['o_' + it.id].value }; });
    itemsOf('exposure').concat(itemsOf('geography')).forEach(function (it) { exposures[it.id] = { s: input.items[it.id].s, date: input.items[it.id].date, loc: E['l_' + it.id].value, nature: E['n_' + it.id].value, rel: E['r_' + it.id].value, case_id: E['c_' + it.id].value }; });
    var trips = $$('.trip', form).map(function (tr) { var q = function (n) { return $('[name="' + n + '"]', tr).value; }; return { type: q('tr_type'), where: q('tr_where'), place: q('tr_place'), from: q('tr_from'), to: q('tr_to'), purpose: q('tr_purpose'), act: q('tr_act') }; }).filter(function (x) { return x.where || x.place; });
    var fac = byId(G.facilities, g.facility);
    var ctx = S.communityContext(db.reports, rules(), geoOfVillage(g.village));
    var data = {
      patient_key: key, assessed_at: input.assessed_at, person: person, geo: g,
      clinical: { onset_date: input.onset_date, onset_unknown: E.onset_unk.checked, temp: E.temp.value, deceased: input.deceased, symptoms: symptoms, bleed_sites: E.bleed_sites ? E.bleed_sites.value : '', rash: { dist: E.rash_dist.value, appearance: E.rash_app.value, type: E.rash_type.value } },
      exposures: exposures,
      history: { comorb: $$('input[name="comorb"]:checked', form).map(function (x) { return x.value; }), comorb_other: E.comorb_other.value, travel: trips, evax: { s: E.evax.value, type: E.evax_type.value, date: E.evax_date.value }, yf: E.yf.value, am: E.am.value, mrdt: E.mrdt.value },
      clinician: input.clinician, result: res,
      community_snapshot: { village_level: ctx.village.level, area_level: ctx.area.level, advisory: ctx.advisory }
    };
    var id;
    if (rec) {
      var prev = rec.result.category;
      Object.assign(rec, data); rec.synced = false; rec.updated_at = iso(new Date());
      rec.history_log.push({ at: iso(new Date()), score: res.score, category: res.category, by: USERS[st.role] });
      id = rec.id;
      audit('update', 'assessment', id, prev !== res.category ? L('Catégorie ', 'Category ') + prev + ' → ' + res.category : L('Mise à jour', 'Update'));
      rec.review = res.category === 'AMBER' ? { status: 'pending' } : rec.review;
    } else {
      id = newId('BDB', fac.code, new Date(input.assessed_at));
      rec = Object.assign({ id: id, created_at: iso(new Date()), synced: false, demo: false, lab: { status: 'none', result: '' }, history_log: [{ at: iso(new Date()), score: res.score, category: res.category, by: USERS[st.role] }], review: res.category === 'AMBER' ? { status: 'pending' } : null }, data);
      db.assessments.unshift(rec);
      audit('create', 'assessment', id, res.category + ' (' + res.score + ')');
    }
    if (res.category === 'RED' && !db.alerts.some(function (a) { return a.assessment_id === id && !a.closed; })) createAlert(rec);
    save(); st.editing = null; st.lastId = id; go('result');
  }

  function createAlert(rec) {
    var fac = byId(G.facilities, rec.geo.facility);
    var a = { id: newId('ALR', fac.code), assessment_id: rec.id, facility: rec.geo.facility, zone: rec.geo.zone, created_at: iso(new Date()), synced: false, ack: null, actions: [], closed: false,
      sms: 'ALERTE BDBV ROUGE. Dossier ' + rec.id + ', ' + fac.name + ', ' + fmtDT(new Date().toISOString()) + '. Ouvrir l\'application pour details. Repondre OK pour accuser reception.',
      recipients: [L('Clinicien responsable FOSA', 'Facility responsible clinician'), L('Point focal surveillance ZS', 'HZ surveillance focal point')] };
    db.alerts.unshift(a);
    audit('alert_created', 'alert', a.id, rec.id);
    return a;
  }

  VIEWS.result = function (v) {
    var rec = byId(db.assessments, st.lastId);
    if (!rec) return VIEWS.home(v);
    audit('view', 'assessment', rec.id);
    var ctx = S.communityContext(db.reports, rules(), geoOfVillage(rec.geo.village));
    var al = db.alerts.filter(function (a) { return a.assessment_id === rec.id; })[0];
    v.innerHTML = '<section class="card"><h2>' + L('Évaluation enregistrée', 'Assessment saved') + ' <code>' + esc(rec.id) + '</code></h2>' +
      '<p class="muted">' + (rec.synced ? '✓ ' + L('synchronisée', 'synced') : '⏳ ' + L('en attente de synchronisation', 'pending synchronisation')) + '</p>' +
      resultBlock(rec.result, ctx) +
      '<h3>' + L('Conduite à tenir recommandée', 'Recommended actions') + '</h3><ol class="recs">' + t('rec_' + rec.result.category).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol><p class="muted small">' + esc(t('rec_flag')) + '</p>' +
      (al ? '<div class="sms"><b>' + esc(t('sms_preview')) + '</b> → ' + esc(al.recipients.join(', ')) + '<pre>' + esc(al.sms) + '</pre></div>' : '') +
      '<div class="actions"><button data-go="triage" id="newb" class="primary">' + L('Nouvelle évaluation', 'New assessment') + '</button> <button id="reb">' + esc(t('reassess')) + '</button>' + (al ? ' <button data-go="alerts">' + L('Gérer l\'alerte', 'Manage alert') + '</button>' : '') + '</div></section>';
    $('#newb', v).onclick = function () { st.editing = null; go('triage'); };
    $('#reb', v).onclick = function () { st.editing = rec.id; go('triage'); };
    $$('[data-go="alerts"]', v).forEach(function (b) { b.onclick = function () { go('alerts'); }; });
  };

  /* ---------- PATIENT LIST ---------- */
  VIEWS.patients = function (v) {
    var showNames = st.role === 'soignant';
    var rows = db.assessments.slice().sort(function (a, b) { return new Date(b.assessed_at) - new Date(a.assessed_at); }).slice(0, 200);
    v.innerHTML = '<section class="card"><h2>' + esc(t('tab_patients')) + ' (' + db.assessments.length + ')</h2>' +
      (showNames ? '' : '<p class="muted">' + esc(t('privacy_names_hidden')) + '</p>') +
      '<div class="scroll"><table class="tbl"><tr><th>ID</th>' + (showNames ? '<th>' + L('Nom', 'Name') + '</th>' : '') + '<th>' + L('FOSA', 'Facility') + '</th><th>' + L('Date', 'Date') + '</th><th>Score</th><th>' + L('Catégorie', 'Category') + '</th><th>' + L('Revue', 'Review') + '</th><th>' + L('Laboratoire', 'Laboratory') + '</th><th></th></tr>' +
      rows.map(function (a) {
        return '<tr><td><code>' + esc(a.id) + '</code>' + (a.demo ? ' <span class="tag">démo</span>' : '') + '</td>' + (showNames ? '<td>' + esc(a.person.last + ' ' + a.person.first) + '</td>' : '') +
          '<td>' + esc(nm(G.facilities, a.geo.facility)) + '</td><td>' + fmtDT(a.assessed_at) + '</td><td>' + a.result.score + '</td><td>' + chip(a.result.category) + '</td>' +
          '<td>' + (a.review ? (a.review.status === 'done' ? '✓' : '<button class="sm" data-rev="' + a.id + '">' + L('Marquer revu', 'Mark reviewed') + '</button>') : '') + '</td>' +
          '<td><select class="sm" data-lab="' + a.id + '">' + [['none', L('Non demandé', 'Not requested')], ['requested', L('Demandé', 'Requested')], ['collected', L('Prélevé', 'Collected')], ['pos', L('Résultat positif', 'Positive')], ['neg', L('Résultat négatif', 'Negative')]].map(function (o) { return '<option value="' + o[0] + '"' + (a.lab.status === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></td>' +
          '<td><button class="sm" data-view="' + a.id + '">' + esc(t('view')) + '</button>' + (st.role === 'soignant' ? ' <button class="sm" data-re="' + a.id + '">' + esc(t('reassess')) + '</button>' : '') + '</td></tr>';
      }).join('') + '</table></div><p class="muted small">' + L('Statut laboratoire : saisi uniquement par les personnes autorisées ; la confirmation relève du laboratoire désigné (INRB).', 'Lab status: entered by authorised staff only; confirmation is by the designated laboratory (INRB).') + '</p></section>';
    $$('[data-view]', v).forEach(function (b) { b.onclick = function () { st.lastId = b.getAttribute('data-view'); go('result'); }; });
    $$('[data-re]', v).forEach(function (b) { b.onclick = function () { st.editing = b.getAttribute('data-re'); go('triage'); }; });
    $$('[data-rev]', v).forEach(function (b) { b.onclick = function () { var a = byId(db.assessments, b.getAttribute('data-rev')); a.review = { status: 'done', at: iso(new Date()), by: USERS[st.role] }; a.synced = false; audit('review', 'assessment', a.id); render(); }; });
    $$('[data-lab]', v).forEach(function (s) { s.onchange = function () { var a = byId(db.assessments, s.getAttribute('data-lab')); a.lab = { status: s.value, at: iso(new Date()) }; a.synced = false; audit('lab_status', 'assessment', a.id, s.value); save(); }; });
  };

  /* ---------- ALERTS ---------- */
  function visibleAlert(a) { return st.role !== 'soignant' || true; }
  VIEWS.alerts = function (v) {
    var list = db.alerts.slice().sort(function (a, b) { return (a.ack ? 1 : 0) - (b.ack ? 1 : 0) || new Date(b.created_at) - new Date(a.created_at); }).slice(0, 100);
    var amber = db.assessments.filter(function (a) { return a.review && a.review.status === 'pending'; });
    var acts = [['isolation', L('Isolé dans la zone désignée', 'Isolated in designated area')], ['ipc', L('Précautions PCI appliquées', 'IPC precautions applied')], ['clin', L('Évaluation clinique faite', 'Clinical assessment done')], ['specimen', L('Prélèvement demandé', 'Specimen requested')], ['surv', L('Surveillance notifiée', 'Surveillance notified')], ['referral', L('Référé / transféré', 'Referred / transferred')]];
    v.innerHTML = '<section class="card"><h2>' + L('Alertes ROUGES', 'RED alerts') + '</h2>' + (list.length ? '' : '<p class="muted">' + L('Aucune alerte.', 'No alerts.') + '</p>') +
      list.map(function (a) {
        var mins = Math.round((Date.now() - new Date(a.created_at)) / 60000);
        var esc8 = !a.ack && mins > ALERT_ESCALATION_MIN;
        return '<div class="alert ' + (a.ack ? 'done' : 'open') + '"><div class="ahead">' + chip('RED') + ' <code>' + esc(a.id) + '</code> · ' + L('dossier', 'record') + ' <a href="#" data-open="' + a.assessment_id + '">' + esc(a.assessment_id) + '</a> · ' + esc(nm(G.facilities, a.facility)) + ' · ' + fmtDT(a.created_at) + '</div>' +
          (esc8 ? '<p class="flag">' + esc(t('escalated')) + ' ' + ALERT_ESCALATION_MIN + ' min</p>' : '') +
          '<details><summary>' + esc(t('sms_preview')) + '</summary><pre>' + esc(a.sms) + '</pre></details>' +
          (a.ack ? '<p>✓ ' + esc(t('acked')) + ' ' + L('par', 'by') + ' ' + esc(a.ack.by) + ' · ' + fmtDT(a.ack.at) + ' · ' + L('délai', 'delay') + ' ' + a.ack.delay_min + ' min<br>' + L('Mesures : ', 'Actions: ') + esc(a.actions.map(function (x) { var f = acts.filter(function (y) { return y[0] === x; })[0]; return f ? f[1] : x; }).join(', ') || '-') + (a.ack.note ? '<br>' + esc(a.ack.note) : '') + '</p>' :
            (st.role === 'decideur' ? '' : '<div class="checks">' + acts.map(function (x) { return '<label class="check"><input type="checkbox" data-act="' + a.id + '" value="' + x[0] + '"> ' + esc(x[1]) + '</label>'; }).join('') + '</div><input class="note-in" data-note="' + a.id + '" placeholder="' + L('Commentaire', 'Comment') + '"> <button class="primary sm" data-ack="' + a.id + '">' + esc(t('ack')) + '</button>')) + '</div>';
      }).join('') + '</section>' +
      '<section class="card"><h2>' + L('Cas ORANGE à revoir', 'AMBER cases for review') + ' (' + amber.length + ')</h2>' +
      amber.slice(0, 50).map(function (a) { return '<div class="alert"><code>' + esc(a.id) + '</code> · ' + esc(nm(G.facilities, a.geo.facility)) + ' · ' + fmtDT(a.assessed_at) + ' · score ' + a.result.score + ' <button class="sm" data-rev="' + a.id + '">' + L('Marquer revu', 'Mark reviewed') + '</button> <button class="sm" data-open="' + a.id + '">' + esc(t('view')) + '</button></div>'; }).join('') + '</section>';
    $$('[data-open]', v).forEach(function (b) { b.onclick = function (e) { e.preventDefault(); st.lastId = b.getAttribute('data-open'); go('result'); }; });
    $$('[data-rev]', v).forEach(function (b) { b.onclick = function () { var a = byId(db.assessments, b.getAttribute('data-rev')); a.review = { status: 'done', at: iso(new Date()), by: USERS[st.role] }; a.synced = false; audit('review', 'assessment', a.id); render(); }; });
    $$('[data-ack]', v).forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-ack'), a = byId(db.alerts, id);
        a.actions = $$('input[data-act="' + id + '"]:checked', v).map(function (x) { return x.value; });
        a.ack = { at: iso(new Date()), by: USERS[st.role], note: $('input[data-note="' + id + '"]', v).value, delay_min: Math.round((Date.now() - new Date(a.created_at)) / 60000) };
        a.synced = false;
        if (a.actions.indexOf('specimen') >= 0) { var r = byId(db.assessments, a.assessment_id); if (r && r.lab.status === 'none') r.lab = { status: 'requested', at: iso(new Date()) }; }
        audit('alert_ack', 'alert', id, a.actions.join(','));
        render();
      };
    });
  };

  /* ---------- RECO REPORT (Module B) ---------- */
  var COUNTS = [
    ['deaths_total', 'Décès (total) dans la période', 'Deaths (total) in period'],
    ['deaths_unexplained', '… dont décès inexpliqués', '… of which unexplained'],
    ['deaths_compatible', '… dont décès après une maladie compatible (fièvre, saignement, diarrhée/vomissements)', '… of which after a compatible illness'],
    ['deaths_suspected_ebola', '… dont décès suspects d\'Ebola', '… of which suspected Ebola'],
    ['burials', 'Inhumations effectuées', 'Burials conducted'],
    ['alerts', 'Alertes Ebola signalées (suspectes ou confirmées)', 'Ebola alerts reported (suspected/confirmed)'],
    ['compatible_illness_people', 'Personnes malades avec signes compatibles', 'People ill with compatible signs'],
    ['clusters', 'Groupes de malades ou de décès (même ménage / famille)', 'Clusters of illness or deaths (same household / family)'],
    ['contact_reports', 'Personnes ayant eu contact avec un cas suspect/confirmé', 'People reporting contact with suspected/confirmed case'],
    ['other_events', 'Autres évènements inhabituels (ex. animaux morts)', 'Other unusual events (e.g. dead animals)']
  ];
  var EVT = [['death_unexplained', 'Décès inexpliqué', 'Unexplained death'], ['death_compatible', 'Décès après maladie compatible', 'Death after compatible illness'], ['sick_compatible', 'Malade avec signes compatibles', 'Ill person with compatible signs'], ['cluster', 'Groupe de malades / décès', 'Cluster of illness / deaths'], ['contact', 'Contact avec un cas', 'Contact with a case'], ['unsafe_burial', 'Inhumation à risque (sans équipe EDS)', 'Unsafe burial (no SDB team)'], ['animal', 'Animaux morts (chauves-souris, singes...)', 'Dead animals (bats, primates...)'], ['other', 'Autre évènement inhabituel', 'Other unusual event']];
  var SRC = [['direct', 'Observation directe', 'Direct observation'], ['family', 'Famille / ménage', 'Family / household'], ['leader', 'Leader communautaire / religieux', 'Community / religious leader'], ['healer', 'Tradipraticien', 'Traditional healer'], ['rumour', 'Rumeur / radio / réseaux', 'Rumour / radio / social media'], ['other', 'Autre', 'Other']];
  function evLabel(type) { var e = EVT.filter(function (x) { return x[0] === type; })[0]; return e ? L(e[1], e[2]) : type; }
  function eventBlock(i) {
    return '<div class="event card inner" data-ev="' + i + '"><div class="grid">' +
      '<label>' + L('Type d\'évènement', 'Event type') + ' *<select name="ev_type">' + EVT.map(function (o) { return '<option value="' + o[0] + '">' + L(o[1], o[2]) + '</option>'; }).join('') + '</select></label>' +
      '<label>' + L('Date de survenue', 'Date occurred') + ' *<input type="date" name="ev_date" value="' + ymd(new Date()) + '"></label>' +
      '<label>' + L('Nombre de personnes concernées', 'Number of people') + '<input type="number" min="1" name="ev_n" value="1"></label>' +
      '<label>' + L('Lieu (quartier / ménage, sans nom)', 'Place (neighbourhood / household, no names)') + '<input name="ev_loc"></label>' +
      '<label>' + L('Source de l\'information', 'Source of information') + '<select name="ev_src">' + SRC.map(function (o) { return '<option value="' + o[0] + '">' + L(o[1], o[2]) + '</option>'; }).join('') + '</select></label>' +
      '<label class="wide">' + L('Description courte', 'Short description') + '<input name="ev_desc"></label></div><button type="button" class="ghost sm" data-rmev>✕ ' + L('Retirer', 'Remove') + '</button></div>';
  }
  VIEWS.reco = function (v) {
    var g = Object.assign(geoOfVillage(RECO_HOME.village), {});
    var start = new Date(Date.now() - 6 * DAY);
    v.innerHTML = '<form id="rf" class="card" novalidate><h2>' + L('Rapport communautaire', 'Community report') + '</h2>' +
      '<p class="muted">' + L('Rapportez ce que vous avez vu ou appris. Un rapport est un <b>signal à vérifier</b> - ce n\'est pas une confirmation d\'Ebola. N\'écrivez pas les noms des personnes.', 'Report what you saw or heard. A report is a <b>signal to verify</b> - not an Ebola confirmation. Do not write people\'s names.') + '</p>' +
      '<div class="grid"><label>' + L('Identifiant RECO', 'RECO ID') + '<input name="reco_id" value="RECO-BUN1-001" readonly></label>' +
      '<label>' + L('Date et heure du rapport', 'Report date & time') + '<input type="datetime-local" name="rep_at" value="' + localDT(new Date()) + '"></label>' +
      '<label>' + L('Période du', 'Period from') + '<input type="date" name="p_from" value="' + ymd(start) + '"></label>' +
      '<label>' + L('au', 'to') + '<input type="date" name="p_to" value="' + ymd(new Date()) + '"></label></div>' +
      '<div data-geoholder="r_">' + geoFields('r_', g, false) + '</div>' +
      '<h3>' + L('Nombres pendant la période (0 si aucun)', 'Counts in the period (0 if none)') + '</h3>' +
      COUNTS.map(function (c) { return '<div class="counter"><span>' + esc(L(c[1], c[2])) + '</span><span class="cbtn"><button type="button" data-dec="' + c[0] + '">−</button><input type="number" min="0" name="c_' + c[0] + '" value="0" inputmode="numeric"><button type="button" data-inc="' + c[0] + '">+</button></span></div>'; }).join('') +
      '<h3>' + L('Pratiques funéraires', 'Funeral practices') + '</h3>' +
      '<div class="row"><div class="rowhead"><span class="ilabel">' + L('Des corps ont-ils été lavés / préparés par la famille ?', 'Were bodies washed / prepared by family?') + '</span>' + radios('fp_wash', 'unk') + '</div></div>' +
      '<div class="row"><div class="rowhead"><span class="ilabel">' + L('Des inhumations ont-elles eu lieu sans équipe EDS (Enterrement Digne et Sécurisé) ?', 'Burials without a Safe and Dignified Burial team?') + '</span>' + radios('fp_nosdb', 'unk') + '</div></div>' +
      '<h3>' + L('Évènements à signaler', 'Events to report') + '</h3><div id="events"></div><button type="button" id="addev">+ ' + L('Ajouter un évènement', 'Add an event') + '</button>' +
      '<div id="rwarn"></div><div class="actions"><button type="submit" class="primary big">' + L('Envoyer le rapport', 'Send report') + '</button></div></form>';
    var form = $('#rf', v), n = 0;
    bindGeo(form, 'r_', false, null);
    $('#addev', v).onclick = function () { $('#events', v).insertAdjacentHTML('beforeend', eventBlock(n++)); };
    form.addEventListener('click', function (e) {
      var d = e.target.getAttribute('data-dec'), i = e.target.getAttribute('data-inc');
      if (d) { var el = form.elements['c_' + d]; el.value = Math.max(0, (+el.value || 0) - 1); }
      if (i) { var el2 = form.elements['c_' + i]; el2.value = (+el2.value || 0) + 1; }
      if (e.target.hasAttribute('data-rmev')) e.target.closest('.event').remove();
    });
    form.onsubmit = function (e) {
      e.preventDefault();
      var g2 = readGeo(form, 'r_');
      if (!g2.village) { notify(t('required') + ' : village', 'err'); return; }
      var counts = {}; COUNTS.forEach(function (c) { counts[c[0]] = Math.max(0, parseInt(form.elements['c_' + c[0]].value, 10) || 0); });
      var sub = Math.max(counts.deaths_unexplained, counts.deaths_compatible, counts.deaths_suspected_ebola);
      if (sub > counts.deaths_total) { notify(L('Les décès inexpliqués / compatibles / suspects ne peuvent pas dépasser le total des décès.', 'Unexplained / compatible / suspected deaths cannot exceed total deaths.')); return; }
      var gv = geoOfVillage(g2.village);
      var reportedAt = new Date(form.elements.rep_at.value || Date.now()).toISOString();
      var rep = { id: newId('RCO', gv.zone.slice(2)), reco_id: form.elements.reco_id.value, province: gv.province, zone: gv.zone, area: gv.area, village: gv.village, reported_at: reportedAt, period_from: form.elements.p_from.value, period_to: form.elements.p_to.value, counts: counts,
        practices: { family_washing: form.elements.fp_wash.value || 'unk', no_sdb: form.elements.fp_nosdb.value || 'unk' }, events: [], synced: false, demo: false };
      var dups = [];
      $$('.event', form).forEach(function (el) {
        var q = function (nme) { return $('[name="' + nme + '"]', el).value; };
        var ev = { id: newId('EVT', gv.zone.slice(2)), type: q('ev_type'), date_occurred: q('ev_date'), date_reported: reportedAt, n: +q('ev_n') || 1, location: q('ev_loc'), source: q('ev_src'), description: q('ev_desc'), verification: 'reported', history: [{ at: reportedAt, status: 'reported', by: rep.reco_id }] };
        var dup = allEvents().filter(function (x) { return x.rep.village === gv.village && x.ev.type === ev.type && x.ev.date_occurred === ev.date_occurred; })[0];
        if (dup) { ev.possible_duplicate_of = dup.ev.id; dups.push(dup.ev.id); }
        rep.events.push(ev);
      });
      db.reports.unshift(rep);
      audit('create', 'reco_report', rep.id, rep.events.length + ' évènement(s)');
      save();
      v.innerHTML = '<section class="card ok"><h2>✓ ' + L('Rapport enregistré', 'Report saved') + '</h2><p><code>' + esc(rep.id) + '</code></p><p>' + (st.online ? L('Il sera envoyé à la synchronisation.', 'It will be sent at synchronisation.') : L('Vous êtes hors ligne : le rapport est gardé sur le téléphone et sera envoyé dès que le réseau revient.', 'You are offline: the report is kept on the phone and will be sent when the network returns.')) + '</p>' +
        (dups.length ? '<p class="flag">' + L('Doublon possible avec un évènement déjà signalé : ', 'Possible duplicate of an already reported event: ') + esc(dups.join(', ')) + L(' - l\'équipe de surveillance va vérifier.', ' - the surveillance team will check.') + '</p>' : '') +
        '<p>' + L('Prochaine étape : l\'équipe de surveillance de l\'aire de santé va <b>vérifier</b> le signal.', 'Next step: the health-area surveillance team will <b>verify</b> the signal.') + '</p><button class="big" id="again">' + L('Nouveau rapport', 'New report') + '</button></section>';
      $('#again', v).onclick = function () { render(); };
      $('#syncbtn').textContent = t('sync') + ' (' + pendingCount() + ' ' + t('pending') + ')';
    };
  };
  var VSTAT = { reported: ['Signalé - à vérifier', 'Reported - to verify'], in_progress: ['Vérification en cours', 'Verification in progress'], verified: ['Vérifié - investigation', 'Verified - investigation'], discarded: ['Écarté (non pertinent)', 'Discarded'] };
  function vlabel(s) { return L(VSTAT[s][0], VSTAT[s][1]); }
  function allEvents() { var out = []; db.reports.forEach(function (r) { (r.events || []).forEach(function (e) { out.push({ rep: r, ev: e }); }); }); return out; }

  VIEWS.myreports = function (v) {
    var mine = db.reports.filter(function (r) { return r.reco_id === 'RECO-BUN1-001'; });
    v.innerHTML = '<section class="card"><h2>' + esc(t('tab_myreports')) + '</h2><p class="muted">' + L('Vous voyez vos rapports et le statut de vérification - pas les dossiers cliniques.', 'You see your reports and verification status - not clinical records.') + '</p>' +
      (mine.length ? mine.map(function (r) {
        return '<div class="alert"><b>' + fmtDT(r.reported_at) + '</b> · ' + esc(nm(G.villages, r.village)) + ' · ' + (r.synced ? '✓ ' + L('envoyé', 'sent') : '⏳ ' + L('en attente', 'pending')) + '<br>' + L('Décès', 'Deaths') + ' ' + r.counts.deaths_total + ' · ' + L('inexpliqués', 'unexplained') + ' ' + r.counts.deaths_unexplained + ' · ' + L('alertes', 'alerts') + ' ' + r.counts.alerts +
          (r.events.length ? '<ul>' + r.events.map(function (e) { return '<li>' + esc(evLabel(e.type)) + ' (' + fmtD(e.date_occurred) + ') - <span class="vs ' + e.verification + '">' + esc(vlabel(e.verification)) + '</span></li>'; }).join('') + '</ul>' : '') + '</div>';
      }).join('') : '<p class="muted">' + L('Aucun rapport.', 'No reports.') + '</p>') + '</section>';
  };

  /* ---------- VERIFICATION (surveillance) ---------- */
  VIEWS.verify = function (v) {
    var evs = allEvents().sort(function (a, b) { var o = { reported: 0, in_progress: 1, verified: 2, discarded: 3 }; return o[a.ev.verification] - o[b.ev.verification] || new Date(b.ev.date_reported) - new Date(a.ev.date_reported); }).slice(0, 150);
    v.innerHTML = '<section class="card"><h2>' + L('Vérification des signaux communautaires', 'Verification of community signals') + '</h2>' +
      '<p class="muted">' + L('Un signal RECO déclenche une vérification (idéalement < 24 h). Seuls les évènements vérifiés passent en investigation. Les évaluations FOSA du même village (21 j) sont affichées pour relier les deux sources.', 'A RECO signal triggers verification (ideally < 24 h). Only verified events go to investigation. Facility assessments from the same village (21 d) are shown to link both sources.') + '</p>' +
      '<div class="scroll"><table class="tbl"><tr><th>' + L('Évènement', 'Event') + '</th><th>' + L('Village', 'Village') + '</th><th>' + L('Survenu', 'Occurred') + '</th><th>' + L('Source', 'Source') + '</th><th>' + L('Évaluations FOSA liées (21 j)', 'Linked facility assessments (21 d)') + '</th><th>' + L('Statut', 'Status') + '</th></tr>' +
      evs.map(function (x) {
        var e = x.ev, r = x.rep;
        var linked = db.assessments.filter(function (a) { return a.geo.village === r.village && Math.abs(new Date(a.assessed_at) - new Date(e.date_occurred)) < 21 * DAY; });
        var cats = { RED: 0, AMBER: 0, GREEN: 0 }; linked.forEach(function (a) { cats[a.result.category]++; });
        var src = SRC.filter(function (s) { return s[0] === e.source; })[0];
        return '<tr><td><b>' + esc(evLabel(e.type)) + '</b> (' + e.n + ')<br><small>' + esc(e.description) + '</small><br><code class="small">' + esc(e.id) + '</code>' + (e.possible_duplicate_of ? '<br><span class="tag">' + L('doublon possible de ', 'possible duplicate of ') + esc(e.possible_duplicate_of) + '</span>' : '') + '</td>' +
          '<td>' + esc(nm(G.villages, r.village)) + '</td><td>' + fmtD(e.date_occurred) + '</td><td>' + esc(src ? L(src[1], src[2]) : e.source) + '</td>' +
          '<td>' + (linked.length ? '<span class="chip RED sm">' + cats.RED + '</span> <span class="chip AMBER sm">' + cats.AMBER + '</span> <span class="chip GREEN sm">' + cats.GREEN + '</span>' : '-') + '</td>' +
          '<td><select class="sm" data-ver="' + e.id + '">' + Object.keys(VSTAT).map(function (k) { return '<option value="' + k + '"' + (e.verification === k ? ' selected' : '') + '>' + esc(vlabel(k)) + '</option>'; }).join('') + '</select></td></tr>';
      }).join('') + '</table></div></section>';
    $$('[data-ver]', v).forEach(function (s) {
      s.onchange = function () {
        var x = allEvents().filter(function (y) { return y.ev.id === s.getAttribute('data-ver'); })[0];
        x.ev.verification = s.value; x.ev.history = x.ev.history || []; x.ev.history.push({ at: iso(new Date()), status: s.value, by: USERS[st.role] });
        x.rep.synced = false; audit('verify', 'event', x.ev.id, s.value); render();
      };
    });
  };

  /* ---------- DASHBOARD ---------- */
  function inGeo(g, f) {
    if (f.facility && g.facility && g.facility !== f.facility) return false;
    if (f.village && g.village !== f.village) return false;
    if (f.area && g.area !== f.area) return false;
    if (f.zone && g.zone !== f.zone) return false;
    if (f.province && g.province !== f.province) return false;
    return true;
  }
  function inPeriod(d, days) { return days === 'all' || (Date.now() - new Date(d)) <= (+days) * DAY; }
  function pct(n, d) { return d ? Math.round(100 * n / d) : 0; }
  function bars(rows, color) {
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([1]));
    return '<div class="bars">' + rows.map(function (r) { return '<div class="bar"><span class="bl">' + esc(r.label) + '</span><span class="bt"><span class="bf" style="width:' + (100 * r.value / max) + '%;background:' + (r.color || color) + '"></span></span><span class="bv">' + r.value + '</span></div>'; }).join('') + '</div>';
  }
  function stacked(rows) {
    var max = Math.max.apply(null, rows.map(function (r) { return r.RED + r.AMBER + r.GREEN; }).concat([1]));
    return '<div class="bars">' + rows.map(function (r) {
      var tot = r.RED + r.AMBER + r.GREEN;
      return '<div class="bar"><span class="bl">' + esc(r.label) + '</span><span class="bt">' + ['RED', 'AMBER', 'GREEN'].map(function (k) { return '<span class="bf seg-' + k + '" style="width:' + (100 * r[k] / max) + '%" title="' + k + ' ' + r[k] + '"></span>'; }).join('') + '</span><span class="bv">' + tot + ' <small>(' + r.RED + '/' + r.AMBER + '/' + r.GREEN + ')</small></span></div>';
    }).join('') + '</div>';
  }
  function weekly(list, dateFn, valFn) {
    var s = [0, 0, 0, 0, 0, 0, 0, 0];
    list.forEach(function (x) { var w = Math.floor((Date.now() - new Date(dateFn(x))) / (7 * DAY)); if (w >= 0 && w < 8) s[w] += valFn(x); });
    return s;
  }
  function trend(title, series) {
    var ew = S.earlyWarning(series, rules().early_warning);
    var W = 300, H = 110, pad = 18, bw = (W - pad * 2) / 8;
    var max = Math.max.apply(null, series.concat([ew.threshold || 0, 1]));
    var y = function (val) { return H - pad - (H - pad * 2) * val / max; };
    var bs = series.slice().reverse().map(function (val, i) {
      var cur = i === 7;
      return '<rect x="' + (pad + i * bw + 2) + '" y="' + y(val) + '" width="' + (bw - 4) + '" height="' + (H - pad - y(val)) + '" fill="' + (cur ? (ew.signal ? '#b91c1c' : '#1d4ed8') : '#93a4c3') + '"><title>S-' + (7 - i) + ': ' + val + '</title></rect>' +
        '<text x="' + (pad + i * bw + bw / 2) + '" y="' + (H - 4) + '" font-size="9" text-anchor="middle" fill="currentColor">' + (cur ? L('cette sem.', 'this wk') : 'S-' + (7 - i)) + '</text>' +
        '<text x="' + (pad + i * bw + bw / 2) + '" y="' + (y(val) - 2) + '" font-size="9" text-anchor="middle" fill="currentColor">' + val + '</text>';
    }).join('');
    var line = ew.threshold != null ? '<line x1="' + pad + '" x2="' + (W - pad) + '" y1="' + y(ew.threshold) + '" y2="' + y(ew.threshold) + '" stroke="#b91c1c" stroke-dasharray="4 3"/><text x="' + (W - pad) + '" y="' + (y(ew.threshold) - 3) + '" font-size="9" text-anchor="end" fill="#b91c1c">' + L('seuil', 'threshold') + ' ' + ew.threshold + '</text>' : '';
    return '<div class="trend"><div class="th"><b>' + esc(title) + '</b> ' + (ew.signal ? '<span class="sig">▲ ' + esc(t('stat_signal')) + '</span>' : '<span class="muted small">' + esc(t('no_signal')) + '</span>') + '</div><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(title) + '">' + bs + line + '</svg></div>';
  }
  function mapSvg(assess, f) {
    var R = rules(), colors = ['#e5e7eb', '#c4b5fd', '#8b5cf6', '#4c1d95'];
    var zl = G.zones.map(function (z) {
      var aff = G.affected_zones.indexOf(z.id) >= 0;
      return '<circle cx="' + z.cx + '" cy="' + z.cy + '" r="62" fill="none" stroke="' + (aff ? '#9a3412' : '#94a3b8') + '" stroke-dasharray="' + (aff ? '6 4' : '2 4') + '"/><text x="' + z.cx + '" y="' + (z.cy - 48) + '" font-size="11" text-anchor="middle" fill="currentColor" font-weight="600">ZS ' + esc(z.name) + (aff ? ' *' : '') + '</text>';
    }).join('');
    var vl = G.villages.map(function (vv) {
      var c = S.areaConcern(db.reports, R, function (r) { return r.village === vv.id; });
      var dim = f.village && f.village !== vv.id;
      return '<g class="mv" data-v="' + vv.id + '" opacity="' + (dim ? 0.35 : 1) + '"><circle cx="' + vv.x + '" cy="' + vv.y + '" r="' + (6 + c.level * 2) + '" fill="' + colors[c.level] + '" stroke="#334155" stroke-width="0.8"/><title>' + esc(vv.name) + ' - ' + esc(st.lang === 'en' ? c.label_en : c.label_fr) + ' (' + c.points + ' pts, ' + c.reports + ' rapports)</title></g>';
    }).join('');
    var fl = G.facilities.map(function (fa) {
      var reds = assess.filter(function (a) { return a.geo.facility === fa.id && a.result.category === 'RED'; }).length;
      return '<g><rect x="' + (fa.x - 6) + '" y="' + (fa.y - 6) + '" width="12" height="12" fill="#0f766e" stroke="#fff"/>' + (reds ? '<text x="' + (fa.x + 9) + '" y="' + (fa.y + 4) + '" font-size="10" font-weight="700" fill="#b91c1c">' + reds + '</text>' : '') + '<title>' + esc(fa.name) + ' - ' + reds + ' ' + L('évaluation(s) rouge(s)', 'red assessment(s)') + '</title></g>';
    }).join('');
    var lg = '<g transform="translate(8,405)" font-size="11" fill="currentColor"><text y="8" font-weight="600">' + esc(t('concern_legend')) + '</text>' +
      R.community.levels.map(function (l, i) { return '<circle cx="6" cy="' + (22 + i * 14) + '" r="5" fill="' + colors[i] + '" stroke="#334155" stroke-width="0.8"/><text x="16" y="' + (26 + i * 14) + '">' + esc(st.lang === 'en' ? l.label_en : l.label_fr) + '</text>'; }).join('') +
      '<rect x="1" y="' + (22 + 4 * 14 - 5) + '" width="10" height="10" fill="#0f766e"/><text x="16" y="' + (26 + 4 * 14) + '">' + L('FOSA (chiffre rouge = évaluations ROUGES)', 'Facility (red number = RED assessments)') + '</text>' +
      '<text y="' + (26 + 5 * 14) + '">* ' + L('ZS avec transmission active (liste à tenir par la surveillance)', 'HZ with active transmission (list maintained by surveillance)') + '</text></g>';
    return '<svg class="map" viewBox="0 0 600 500" role="img" aria-label="' + L('Carte schématique', 'Schematic map') + '">' + zl + vl + fl + lg + '</svg>';
  }

  VIEWS.dashboard = function (v) {
    var f = st.f, R = rules();
    var A = db.assessments.filter(function (a) { return inGeo(a.geo, f) && inPeriod(a.assessed_at, f.days); });
    var P = db.reports.filter(function (r) { return inGeo({ province: r.province, zone: r.zone, area: r.area, village: r.village }, Object.assign({}, f, { facility: '' })) && inPeriod(r.reported_at, f.days); });
    var AL = db.alerts.filter(function (a) { var r = byId(db.assessments, a.assessment_id); return r && A.indexOf(r) >= 0; });
    var n = A.length, cnt = { RED: 0, AMBER: 0, GREEN: 0 };
    A.forEach(function (a) { cnt[a.result.category]++; });
    var acked = AL.filter(function (a) { return a.ack; });
    var acted = AL.filter(function (a) { return a.ack && a.actions.length; });
    var labReq = A.filter(function (a) { return a.lab.status !== 'none'; }).length;
    var labPos = A.filter(function (a) { return a.lab.status === 'pos'; }).length, labNeg = A.filter(function (a) { return a.lab.status === 'neg'; }).length;
    var sum = function (k) { return P.reduce(function (s, r) { return s + (r.counts[k] || 0); }, 0); };
    var evs = []; P.forEach(function (r) { r.events.forEach(function (e) { evs.push(e); }); });
    var awaiting = evs.filter(function (e) { return e.verification === 'reported' || e.verification === 'in_progress'; }).length;
    var medDelay = (function () { var d = acked.map(function (a) { return a.ack.delay_min; }).sort(function (a, b) { return a - b; }); return d.length ? d[Math.floor(d.length / 2)] : '-'; })();

    var byFac = G.facilities.filter(function (fa) { return inGeo({ facility: fa.id, area: fa.area, zone: byId(G.areas, fa.area).zone, province: byId(G.zones, byId(G.areas, fa.area).zone).province, village: f.village ? f.village : undefined }, Object.assign({}, f, { village: '' })); }).map(function (fa) {
      var r = { label: fa.name.replace(' (démo)', ''), RED: 0, AMBER: 0, GREEN: 0 }; A.forEach(function (a) { if (a.geo.facility === fa.id) r[a.result.category]++; }); return r;
    }).filter(function (r) { return r.RED + r.AMBER + r.GREEN; });
    var byZone = G.zones.map(function (z) { var r = { label: z.name, RED: 0, AMBER: 0, GREEN: 0 }; A.forEach(function (a) { if (a.geo.zone === z.id) r[a.result.category]++; }); return r; }).filter(function (r) { return r.RED + r.AMBER + r.GREEN; });
    var symp = itemsOf('symptom').map(function (it) { return { label: lbl(it).replace(/\s*\(.*\)$/, ''), value: A.filter(function (a) { return a.clinical.symptoms[it.id] && a.clinical.symptoms[it.id].s === 'yes'; }).length }; }).sort(function (a, b) { return b.value - a.value; }).slice(0, 8);
    var expo = itemsOf('exposure').concat(itemsOf('geography')).map(function (it) { return { label: lbl(it).replace(/\s*\(.*\)$/, ''), value: A.filter(function (a) { return a.exposures[it.id] && a.exposures[it.id].s === 'yes'; }).length }; }).sort(function (a, b) { return b.value - a.value; }).slice(0, 8);
    var byVill = G.villages.map(function (vv) { var s = 0; P.forEach(function (r) { if (r.village === vv.id) s += r.counts.deaths_unexplained + r.counts.deaths_suspected_ebola + r.counts.alerts + r.counts.clusters; }); return { label: vv.name.replace(' (démo)', ''), value: s }; }).filter(function (x) { return x.value; }).sort(function (a, b) { return b.value - a.value; }).slice(0, 8);

    var allA = db.assessments.filter(function (a) { return inGeo(a.geo, f); });
    var allP = db.reports.filter(function (r) { return inGeo({ province: r.province, zone: r.zone, area: r.area, village: r.village }, Object.assign({}, f, { facility: '' })); });
    var wk = function (k) { return weekly(allP, function (r) { return r.reported_at; }, function (r) { return r.counts[k] || 0; }); };
    var kpi = function (label, val, sub, cls) { return '<div class="kpi ' + (cls || '') + '"><div class="kv">' + val + '</div><div class="kl">' + esc(label) + '</div>' + (sub ? '<div class="ks">' + sub + '</div>' : '') + '</div>'; };
    var anyDemo = db.assessments.some(function (a) { return a.demo; }) || db.reports.some(function (r) { return r.demo; });

    v.innerHTML = (anyDemo ? '<div class="demo-flag">' + esc(t('synthetic')) + '</div>' : '') +
      '<section class="card filters"><h3>' + esc(t('filters')) + '</h3><div data-geoholder="f_">' + geoFields('f_', f, true, t('all')) + '</div>' +
      '<div class="grid"><label>' + esc(t('period')) + '<select id="fdays">' + ['7', '14', '30', '90', 'all'].map(function (d) { return '<option value="' + d + '"' + (f.days === d ? ' selected' : '') + '>' + (d === 'all' ? t('all') : d + ' ' + t('days')) + '</option>'; }).join('') + '</select></label><label>&nbsp;<button id="freset" class="ghost">' + L('Réinitialiser', 'Reset') + '</button></label></div></section>' +

      '<section class="card"><h2>A. ' + L('Surveillance individuelle (FOSA)', 'Individual-level surveillance (facilities)') + '</h2><div class="kpis">' +
      kpi(L('Personnes évaluées', 'People assessed'), n) +
      kpi(L('ROUGE', 'RED'), cnt.RED, pct(cnt.RED, n) + '%', 'k-RED') + kpi(L('ORANGE', 'AMBER'), cnt.AMBER, pct(cnt.AMBER, n) + '%', 'k-AMBER') + kpi(L('VERT', 'GREEN'), cnt.GREEN, pct(cnt.GREEN, n) + '%', 'k-GREEN') +
      kpi(L('Alertes rouges', 'Red alerts'), AL.length) + kpi(L('Acquittées', 'Acknowledged'), acked.length, pct(acked.length, AL.length) + '% · ' + L('délai médian ', 'median delay ') + medDelay + ' min') + kpi(L('Avec mesures enregistrées', 'With actions recorded'), acted.length, pct(acted.length, AL.length) + '%') +
      kpi(L('Référés pour test', 'Referred for testing'), labReq, L('résultats : ', 'results: ') + labPos + ' + / ' + labNeg + ' −') + '</div>' +
      '<div class="cols"><div><h4>' + L('Par formation sanitaire', 'By health facility') + '</h4>' + (byFac.length ? stacked(byFac) : '<p class="muted">-</p>') + '</div>' +
      '<div><h4>' + L('Par zone de santé', 'By health zone') + '</h4>' + (byZone.length ? stacked(byZone) : '<p class="muted">-</p>') + '</div>' +
      '<div><h4>' + L('Symptômes les plus fréquents', 'Most common symptoms') + '</h4>' + bars(symp, '#475569') + '</div>' +
      '<div><h4>' + L('Expositions les plus fréquentes', 'Most common exposures') + '</h4>' + bars(expo, '#7c2d12') + '</div></div>' +
      '<p class="muted small">' + L('Résultats de laboratoire affichés uniquement lorsqu\'ils sont autorisés et disponibles. La catégorie de triage n\'est pas un diagnostic.', 'Lab results shown only where authorised and available. Triage category is not a diagnosis.') + '</p></section>' +

      '<section class="card"><h2>B. ' + L('Surveillance communautaire (RECO)', 'Community-level surveillance (RECO)') + '</h2><div class="kpis">' +
      kpi(L('Rapports reçus', 'Reports received'), P.length) + kpi(L('Décès rapportés', 'Deaths reported'), sum('deaths_total')) + kpi(L('Décès inexpliqués', 'Unexplained deaths'), sum('deaths_unexplained')) + kpi(L('Décès suspects Ebola', 'Suspected Ebola deaths'), sum('deaths_suspected_ebola')) +
      kpi(L('Alertes Ebola communautaires', 'Community Ebola alerts'), sum('alerts')) + kpi(L('Inhumations', 'Burials'), sum('burials')) + kpi(L('Groupes de cas', 'Clusters'), sum('clusters')) + kpi(L('Évènements à vérifier', 'Events awaiting verification'), awaiting, evs.length + ' ' + L('évènements au total', 'events in total'), awaiting ? 'k-AMBER' : '') + '</div>' +
      '<div class="cols"><div><h4>' + L('Villages avec le plus de signaux', 'Villages with most signals') + '</h4>' + (byVill.length ? bars(byVill, '#6d28d9') : '<p class="muted">-</p>') + '</div></div></section>' +

      '<section class="card"><h2>C. ' + L('Carte schématique', 'Schematic map') + '</h2><p class="muted small">' + L('Couleur = niveau de préoccupation communautaire des 14 derniers jours (violet), distinct du risque individuel (rouge/orange/vert). Cliquez un village pour filtrer. En production : fond de carte hors ligne et coordonnées GPS officielles.', 'Colour = community concern level, last 14 days (purple), distinct from individual risk (red/amber/green). Click a village to filter. In production: offline basemap and official GPS coordinates.') + '</p>' + mapSvg(A, f) + '</section>' +

      '<section class="card"><h2>D. ' + L('Tendances et alerte précoce', 'Trends and early warning') + '</h2><p class="muted small">' + esc(R.early_warning.note) + ' ' + L('(Filtres géographiques appliqués ; période ignorée : 8 dernières semaines.)', '(Geographic filters applied; period ignored: last 8 weeks.)') + '</p><div class="trends">' +
      trend(L('Décès communautaires', 'Community deaths'), wk('deaths_total')) +
      trend(L('Décès inexpliqués', 'Unexplained deaths'), wk('deaths_unexplained')) +
      trend(L('Alertes Ebola suspectes', 'Suspected Ebola alerts'), wk('alerts')) +
      trend(L('Groupes de malades compatibles', 'Compatible illness clusters'), wk('clusters')) +
      trend(L('Évaluations ROUGES (FOSA)', 'RED assessments (facility)'), weekly(allA, function (a) { return a.assessed_at; }, function (a) { return a.result.category === 'RED' ? 1 : 0; })) +
      '</div><p class="flag small">' + L('Un signal statistique déclenche une revue par l\'équipe de surveillance. Ce n\'est PAS la confirmation d\'une épidémie.', 'A statistical signal triggers review by the surveillance team. It is NOT confirmation of an outbreak.') + '</p></section>';

    bindGeo(v.querySelector('.filters'), 'f_', true, t('all'), function (g) { st.f = Object.assign(st.f, g); VIEWS.dashboard(v); });
    $('#fdays', v).onchange = function () { st.f.days = this.value; VIEWS.dashboard(v); };
    $('#freset', v).onclick = function () { st.f = { province: '', zone: '', area: '', village: '', facility: '', days: '30' }; VIEWS.dashboard(v); };
    $$('.mv', v).forEach(function (g) { g.onclick = function () { var gv = geoOfVillage(g.getAttribute('data-v')); st.f = Object.assign(st.f, gv, { facility: '' }); VIEWS.dashboard(v); }; });
    audit('view', 'dashboard', '-');
  };

  /* ---------- RULES ---------- */
  VIEWS.rules = function (v) {
    var R = rules();
    v.innerHTML = '<section class="card"><h2>' + esc(t('tab_rules')) + ' - ' + esc(R.rule_set_id) + ' v' + esc(R.version) + '</h2><p class="flag">' + esc(R.status) + '</p>' +
      '<p>' + esc(R.output_label) + '</p>' +
      '<div class="grid"><label>' + L('Seuil ROUGE (≥)', 'RED threshold (≥)') + '<input type="number" id="thr" value="' + R.thresholds.red + '" min="1" max="100"></label><label>' + L('Seuil ORANGE (≥)', 'AMBER threshold (≥)') + '<input type="number" id="tha" value="' + R.thresholds.amber + '" min="1" max="100"></label>' +
      '<label>&nbsp;<button id="thsave">' + L('Enregistrer (version locale)', 'Save (local version)') + '</button></label><label>&nbsp;<button id="threset" class="ghost">' + L('Revenir à la version de référence', 'Revert to reference version') + '</button></label></div>' +
      '<p class="muted small">' + L('En production, toute modification passe par un circuit d\'approbation (MSP / INSP / comité technique) et crée une nouvelle version ; chaque évaluation garde la version utilisée.', 'In production every change goes through an approval workflow (MoH / INSP / technical committee) and creates a new version; each assessment stores the version used.') + '</p>' +
      '<h3>' + L('Matrice de score', 'Scoring matrix') + '</h3><div class="scroll"><table class="tbl"><tr><th>' + L('Variable', 'Variable') + '</th><th>' + L('Domaine (plafond)', 'Domain (cap)') + '</th><th>Points</th><th>' + L('Preuve', 'Evidence') + '</th><th>' + L('Justification', 'Rationale') + '</th><th>' + L('Sources', 'Sources') + '</th></tr>' +
      R.items.map(function (it) { return '<tr><td>' + esc(lbl(it)) + '</td><td>' + esc(it.domain) + ' (' + R.domains[it.domain].cap + ')</td><td><b>' + it.points + '</b></td><td>' + it.tier + '</td><td class="small">' + esc(it.rationale) + '</td><td class="small">' + esc(it.sources.join(', ')) + '</td></tr>'; }).join('') + '</table></div>' +
      '<h3>' + L('Règles de classement minimal (planchers)', 'Minimum-category rules (floors)') + '</h3><ul>' + R.floors.map(function (f) { return '<li><b>' + esc(f.id) + '</b> → ' + chip(f.min_category) + ' : ' + esc(st.lang === 'en' ? f.label_en : f.label_fr) + '<br><span class="muted small">' + esc(f.requires_confirmation) + '</span></li>'; }).join('') + '</ul>' +
      '<h3>' + L('Niveaux de preuve', 'Evidence tiers') + '</h3><ul>' + Object.keys(R.evidence_tiers).map(function (k) { return '<li><b>' + k + '</b> : ' + esc(R.evidence_tiers[k]) + '</li>'; }).join('') + '</ul>' +
      '<h3>Sources</h3><ul class="small">' + Object.keys(R.sources).map(function (k) { return '<li><b>' + k + '</b> : ' + esc(R.sources[k]) + '</li>'; }).join('') + '</ul></section>';
    $('#thsave', v).onclick = function () {
      var r = +$('#thr', v).value, a = +$('#tha', v).value;
      if (!(r > a && a > 0 && r <= 100)) { notify(L('Les seuils doivent respecter 0 < orange < rouge ≤ 100.', 'Thresholds must satisfy 0 < amber < red ≤ 100.'), 'err'); return; }
      db.override = { thresholds: { red: r, amber: a }, rev: ((db.override && db.override.rev) || 0) + 1, at: iso(new Date()), by: USERS[st.role] };
      audit('rules_change', 'ruleset', BASE_RULES.version, 'red=' + r + ' amber=' + a); render();
    };
    $('#threset', v).onclick = function () { db.override = null; audit('rules_revert', 'ruleset', BASE_RULES.version); render(); };
  };

  VIEWS.audit = function (v) {
    v.innerHTML = '<section class="card"><h2>' + esc(t('tab_audit')) + '</h2><p class="muted small">' + L('Qui a saisi, consulté ou modifié quoi, et quand. En production : journal immuable côté serveur.', 'Who entered, viewed or modified what, and when. In production: immutable server-side log.') + '</p><div class="scroll"><table class="tbl"><tr><th>' + L('Quand', 'When') + '</th><th>' + L('Utilisateur', 'User') + '</th><th>Action</th><th>' + L('Objet', 'Entity') + '</th><th>ID</th><th>' + L('Détail', 'Detail') + '</th></tr>' +
      db.audit.slice(0, 300).map(function (a) { return '<tr><td>' + fmtDT(a.at) + '</td><td>' + esc(a.user) + '</td><td>' + esc(a.action) + '</td><td>' + esc(a.entity) + '</td><td><code class="small">' + esc(a.id) + '</code></td><td>' + esc(a.detail) + '</td></tr>'; }).join('') + '</table></div></section>';
  };

  /* ---------- DEMO DATA (synthetic) ---------- */
  function prng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; }; }
  function pois(r, lam) { var Lm = Math.exp(-lam), k = 0, p = 1; do { k++; p *= r(); } while (p > Lm); return k - 1; }
  function seedDemo() {
    var r = prng(20261126), now = Date.now(), R = rules();
    db.assessments = db.assessments.filter(function (a) { return !a.demo; });
    db.reports = db.reports.filter(function (x) { return !x.demo; });
    db.alerts = db.alerts.filter(function (a) { return !a.demo; });
    var hot = ['Z-RWA-A1-V1', 'Z-RWA-A1-V2', 'Z-BUN-A2-V1'];
    G.villages.forEach(function (vv) {
      var gv = geoOfVillage(vv.id), isHot = hot.indexOf(vv.id) >= 0;
      for (var w = 7; w >= 0; w--) {
        var at = new Date(now - w * 7 * DAY - Math.floor(r() * 3) * DAY - 3600000);
        var boost = isHot && w <= 1 ? 1 : 0;
        var c = { deaths_unexplained: pois(r, boost ? 1.6 : 0.08), deaths_compatible: pois(r, boost ? 1.2 : 0.05), deaths_suspected_ebola: pois(r, boost ? 0.9 : 0.02), alerts: pois(r, boost ? 2.2 : 0.15), burials: 0, compatible_illness_people: pois(r, boost ? 2.5 : 0.3), clusters: boost && r() < 0.6 ? 1 : 0, contact_reports: pois(r, boost ? 1.5 : 0.05), other_events: pois(r, 0.05) };
        c.deaths_total = Math.max(c.deaths_unexplained, c.deaths_compatible, c.deaths_suspected_ebola) + pois(r, 0.5);
        c.burials = c.deaths_total;
        var rep = { id: 'RCO-DEMO-' + vv.id + '-W' + w, reco_id: vv.id === 'Z-RWA-A1-V1' ? 'RECO-BUN1-001' : 'RECO-' + vv.id.slice(2), province: gv.province, zone: gv.zone, area: gv.area, village: vv.id, reported_at: iso(at), period_from: ymd(new Date(at - 6 * DAY)), period_to: ymd(at), counts: c, practices: { family_washing: boost ? 'yes' : 'unk', no_sdb: boost ? 'yes' : 'no' }, events: [], synced: true, demo: true };
        var mk = function (type, k) { for (var i = 0; i < k; i++) rep.events.push({ id: 'EVT-DEMO-' + vv.id + '-' + w + '-' + type + i, type: type, date_occurred: ymd(new Date(at - Math.floor(r() * 5) * DAY)), date_reported: iso(at), n: 1, location: L('Quartier démo', 'Demo neighbourhood'), source: ['family', 'leader', 'direct', 'rumour'][Math.floor(r() * 4)], description: L('Évènement synthétique de démonstration', 'Synthetic demonstration event'), verification: w >= 2 ? (r() < 0.8 ? 'discarded' : 'verified') : (w === 1 ? (r() < 0.5 ? 'verified' : 'in_progress') : 'reported'), history: [] }); };
        mk('death_unexplained', c.deaths_unexplained); mk('cluster', c.clusters); mk('sick_compatible', Math.min(c.compatible_illness_people, 2));
        db.reports.push(rep);
      }
    });
    var syms = itemsOf('symptom'), exps = itemsOf('exposure').concat(itemsOf('geography'));
    for (var i = 0; i < 160; i++) {
      var ageD = Math.floor(Math.pow(r(), 1.6) * 56);
      var fac = G.facilities[Math.floor(r() * G.facilities.length)];
      if (ageD < 14 && r() < 0.4) fac = byId(G.facilities, ['Z-RWA-A1-F', 'Z-BUN-A2-F'][Math.floor(r() * 2)]);
      var vills = G.villages.filter(function (x) { return x.area === fac.area; }), vv = vills[Math.floor(r() * vills.length)];
      var gv = geoOfVillage(vv.id); gv.facility = fac.id;
      var at = new Date(now - ageD * DAY - Math.floor(r() * 10) * 3600000);
      var onset = new Date(at - Math.floor(1 + r() * 5) * DAY);
      var suspicious = r() < (hot.indexOf(vv.id) >= 0 && ageD < 14 ? 0.45 : 0.08);
      var pS = suspicious ? { fever: 0.9, bleeding: 0.3, vomiting: 0.6, diarrhoea: 0.6, asthenia: 0.75, conjunctivitis: 0.35, dysphagia: 0.3, headache: 0.6, myalgia: 0.5, abdominal_pain: 0.5, sore_throat: 0.3, confusion: 0.1, nausea: 0.4, jaundice: 0.03, rash: 0.05 } : { fever: 0.65, bleeding: 0.02, vomiting: 0.2, diarrhoea: 0.2, asthenia: 0.3, conjunctivitis: 0.05, dysphagia: 0.04, headache: 0.55, myalgia: 0.45, abdominal_pain: 0.3, sore_throat: 0.15, confusion: 0.03, nausea: 0.25, jaundice: 0.04, rash: 0.06 };
      var pE = suspicious ? { contact_case: 0.5, funeral: 0.25, lab_exposure: 0, sexual_contact: 0.03, contaminated_env: 0.2, sick_or_dead_contact: 0.45, bats_bushmeat: 0.1, traditional_healer: 0.2, health_facility_exposure: 0.15, affected_area: 0.9 } : { contact_case: 0.01, funeral: 0.02, lab_exposure: 0, sexual_contact: 0, contaminated_env: 0.01, sick_or_dead_contact: 0.05, bats_bushmeat: 0.08, traditional_healer: 0.08, health_facility_exposure: 0.05, affected_area: G.affected_zones.indexOf(gv.zone) >= 0 ? 0.9 : 0.05 };
      var items = {}, symptoms = {}, exposures = {};
      syms.forEach(function (it) { var s = r() < 0.08 ? 'unk' : (r() < pS[it.id] ? 'yes' : 'no'); items[it.id] = { s: s, date: null }; symptoms[it.id] = { s: s, date: s === 'yes' ? ymd(onset) : '', evol: 'ongoing', obs: '' }; });
      exps.forEach(function (it) { var s = r() < 0.1 ? 'unk' : (r() < pE[it.id] ? 'yes' : 'no'); var d = s === 'yes' ? ymd(new Date(onset - Math.floor(2 + r() * 12) * DAY)) : null; items[it.id] = { s: s, date: d }; exposures[it.id] = { s: s, date: d || '', loc: '', nature: '', rel: '', case_id: '' }; });
      var input = { onset_date: ymd(onset), assessed_at: iso(at), items: items, deceased: false, clinician: { category: '', reason: '' } };
      var res = S.evaluate(input, R);
      var id = 'BDB-' + fac.code + '-DEMO-' + (1000 + i);
      var lab = { status: 'none' };
      if (res.category === 'RED') lab = { status: ageD < 1 ? 'requested' : (suspicious && r() < 0.35 ? 'pos' : 'neg') };
      else if (res.category === 'AMBER' && r() < 0.3) lab = { status: 'neg' };
      var rec = { id: id, demo: true, synced: true, created_at: iso(at), assessed_at: iso(at), patient_key: 'demo' + i,
        person: { last: 'DÉMO', first: 'Patient ' + (i + 1), age: String(Math.floor(2 + r() * 70)), sex: r() < 0.5 ? 'F' : 'M', dob: '', phone: '', occ: '', addr_home: '', addr_cur: '' },
        geo: gv, clinical: { onset_date: ymd(onset), temp: '', deceased: false, symptoms: symptoms, rash: {} }, exposures: exposures,
        history: { comorb: [], travel: [], evax: { s: 'unk' }, yf: 'unk', am: 'unk', mrdt: r() < 0.5 ? 'pos' : 'nd' }, clinician: input.clinician, result: res,
        lab: lab, history_log: [{ at: iso(at), score: res.score, category: res.category }], review: res.category === 'AMBER' ? { status: ageD < 3 ? 'pending' : 'done' } : null };
      db.assessments.push(rec);
      if (res.category === 'RED') {
        var ackd = ageD >= 1 || r() < 0.5, delay = Math.floor(5 + r() * 90);
        db.alerts.push({ id: 'ALR-' + fac.code + '-DEMO-' + (1000 + i), demo: true, synced: true, assessment_id: id, facility: fac.id, zone: gv.zone, created_at: iso(at), closed: false,
          ack: ackd ? { at: iso(new Date(at.getTime() + delay * 60000)), by: 'Clinicien démo', note: '', delay_min: delay } : null,
          actions: ackd ? ['isolation', 'ipc', 'clin', 'specimen', 'surv'].filter(function () { return r() < 0.85; }) : [],
          sms: 'ALERTE BDBV ROUGE. Dossier ' + id + ', ' + fac.name + '. Ouvrir l\'application pour details.', recipients: [] });
      }
    }
    db.assessments.sort(function (a, b) { return new Date(b.assessed_at) - new Date(a.assessed_at); });
    save();
  }

  /* ---------- init ---------- */
  function init() {
    $('#role').onchange = function () { st.role = this.value; st.tab = 'home'; st.editing = null; audit('login', 'session', st.role); render(); };
    $('#lang').onchange = function () { st.lang = this.value; render(); };
    $('#net').onchange = function () { st.online = this.checked; render(); };
    $('#syncbtn').onclick = function () {
      if (!st.online) { notify(L('Hors ligne : les données restent sur l\'appareil et seront envoyées au retour du réseau.', 'Offline: data stay on the device and will be sent when the network returns.'), 'err'); return; }
      var n = pendingCount();
      db.assessments.concat(db.reports, db.alerts).forEach(function (x) { x.synced = true; });
      audit('sync', 'system', '-', n + ' enregistrement(s)'); render(); notify(n + L(' enregistrement(s) synchronisé(s).', ' record(s) synced.'));
    };
    $('#nav').onclick = function (e) { var b = e.target.closest('[data-tab]'); if (b) { st.editing = null; go(b.getAttribute('data-tab')); } };
    window.addEventListener('online', function () { st.online = true; render(); });
    window.addEventListener('offline', function () { st.online = false; render(); });
    if (!db.assessments.length && !db.reports.length) seedDemo();
    render();
  }
  window.BDBVApp = { state: st, db: function () { return db; }, seedDemo: seedDemo, render: render, go: go };
  document.addEventListener('DOMContentLoaded', init);
})();
