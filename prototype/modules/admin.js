/* System administration: geography hierarchy (zone→province links, health areas,
 * villages, facilities), turnaround-time targets, follow-up period, home-based care
 * flag, demo affected zones, permission matrix. All changes are versioned in the
 * audit log; in production they would also need approval.
 */
(function () {
  'use strict';
  var B = window.BDBV, GD = window.BDBV_GEODATA;
  var L = function (f, e) { return B.L(f, e); };
  var esc = function (x) { return B.esc(x); };
  function db() { return B.db(); }
  function cfg() { var c = db().config; c.geo = c.geo || {}; return c; }
  var LINK = { proposed: ['Proposé (à confirmer)', 'Proposed (to confirm)'], unassigned: ['Non attribué', 'Unassigned'], set_by_admin: ['Défini par l\'administrateur (à confirmer)', 'Set by administrator (to confirm)'], confirmed: ['Confirmé', 'Confirmed'] };
  var slug = function (s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); };

  B.VIEWS.admin = function (v) {
    if (!B.can('config')) { v.innerHTML = '<section class="card"><p>' + L('Accès réservé à l\'administrateur système.', 'System administrator only.') + '</p></section>'; return; }
    var c = cfg(), tat = B.queue.targets(), G = B.G;
    var provOpts = function (sel) { return G.provinces.map(function (p) { return '<option value="' + p.id + '"' + (p.id === sel ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join(''); };
    v.innerHTML = '<section class="card"><h2>' + L('Configuration du système', 'System configuration') + '</h2><p class="muted small">' + L('Chaque modification est enregistrée dans le journal d\'audit. En production, elles passent par un circuit d\'approbation (MSP / DSNIS).', 'Every change is written to the audit log. In production, changes go through an approval workflow (MoH / DSNIS).') + '</p></section>' +

      '<section class="card"><h3>1. ' + L('Hiérarchie géographique : zones de santé → provinces', 'Geographical hierarchy: health zones → provinces') + '</h3>' +
      '<p class="small">' + L('Liste 1 fournie (26 noms) chargée comme PROVINCES ; liste 2 fournie chargée comme ZONES DE SANTÉ. Les rattachements zone→province sont des propositions à confirmer avec la DSNIS. Point de référence : ville homonyme dans GeoNames, sinon chef-lieu de province, sinon aucun.', 'Supplied list 1 (26 names) loaded as PROVINCES; supplied list 2 loaded as HEALTH ZONES. Zone→province links are proposals to confirm with DSNIS. Reference point: same-name town in GeoNames, otherwise provincial capital, otherwise none.') + '</p>' +
      '<div class="scroll"><table class="tbl small"><tr><th>' + L('Zone de santé', 'Health zone') + '</th><th>' + L('Province', 'Province') + '</th><th>' + L('Statut du rattachement', 'Link status') + '</th><th>' + L('Confirmé', 'Confirmed') + '</th><th>' + L('Point de référence', 'Reference point') + '</th></tr>' +
      G.zones.map(function (z) {
        var pn = (B.byId(G.provinces, z.province) || {}).name_fr, gp = pn && GD.provinces[pn];
        var ref = GD.zones[z.name] ? 'GeoNames: ' + GD.zones[z.name].lat + ', ' + GD.zones[z.name].lon : (gp && gp.lat != null ? L('chef-lieu : ', 'capital: ') + gp.capital : L('aucun', 'none'));
        return '<tr><td>' + esc(z.name) + '</td><td><select data-zprov="' + z.id + '">' + provOpts(z.province) + '</select></td><td>' + esc(B.L(LINK[z.link_status][0], LINK[z.link_status][1])) + '</td><td><input type="checkbox" data-zconf="' + z.id + '"' + (z.link_status === 'confirmed' ? ' checked' : '') + '></td><td>' + esc(ref) + '</td></tr>';
      }).join('') + '</table></div><button class="primary" id="gsave">' + L('Enregistrer les rattachements', 'Save links') + '</button></section>' +

      '<section class="card"><h3>2. ' + L('Ajouter une unité', 'Add a unit') + '</h3><div class="grid">' +
      '<label>' + L('Type', 'Type') + '<select id="ukind"><option value="zone">' + L('Zone de santé', 'Health zone') + '</option><option value="area">' + L('Aire de santé', 'Health area') + '</option><option value="village">' + L('Village / localité', 'Village / locality') + '</option><option value="facility">' + L('Formation sanitaire / unité', 'Facility / unit') + '</option></select></label>' +
      '<label>' + L('Nom', 'Name') + '<input id="uname"></label>' +
      '<label>' + L('Parent (province / zone / aire)', 'Parent (province / zone / area)') + '<select id="uparent"></select></label>' +
      '<label>' + L('Type de FOSA', 'Facility type') + '<select id="ufac">' + Object.keys(G.facility_types).map(function (k) { return '<option value="' + k + '">' + esc(B.L(G.facility_types[k][0], G.facility_types[k][1])) + '</option>'; }).join('') + '</select></label>' +
      '<label>' + L('Code', 'Code') + '<input id="ucode" placeholder="DHIS2 / SNIS"></label></div><button class="primary" id="uadd">' + L('Ajouter', 'Add') + '</button>' +
      '<p class="muted small">' + L('Les coordonnées GPS des nouvelles unités ne sont pas saisies ici : elles doivent venir de la liste officielle des structures (géocodage vérifié).', 'GPS coordinates of new units are not entered here: they must come from the official master facility list (verified geocoding).') + '</p></section>' +

      '<section class="card"><h3>3. ' + L('Délais cibles de traitement des alertes (minutes)', 'Alert turnaround targets (minutes)') + '</h3><div class="grid">' +
      Object.keys(B.queue.DEFAULT_TAT).map(function (k) { return '<label>' + esc(B.L(B.queue.INT_LABEL[k][0], B.queue.INT_LABEL[k][1])) + '<input type="number" min="1" data-tat="' + k + '" value="' + tat[k] + '"></label>'; }).join('') +
      '<label>' + L('Période de suivi des contacts (jours)', 'Contact follow-up period (days)') + '<input type="number" min="1" max="60" id="fudays" value="' + (c.followup_days || 21) + '"></label></div>' +
      '<p class="muted small">' + L('Valeurs par défaut provisoires (à valider) : réception 1 h, début de vérification 4 h, vérification 24 h, approbation 12 h ; suivi des contacts 21 jours (période d\'incubation maximale reconnue).', 'Provisional defaults (to validate): acknowledgement 1 h, verification start 4 h, verification 24 h, approval 12 h; contact follow-up 21 days (recognised maximum incubation period).') + '</p><button class="primary" id="tsave">' + L('Enregistrer', 'Save') + '</button></section>' +

      '<section class="card"><h3>4. ' + L('Prise en charge à domicile', 'Home-based care') + '</h3><label class="check"><input type="checkbox" id="home"' + (c.home_care_permitted ? ' checked' : '') + '> ' + L('Autorisée par les protocoles nationaux cliniques et PCI approuvés', 'Permitted by approved national clinical and IPC protocols') + '</label>' +
      '<label>' + L('Référence du protocole (obligatoire pour activer)', 'Protocol reference (required to enable)') + '<input id="homeref" value="' + esc(c.home_care_ref || '') + '"></label><button class="primary" id="hsave">' + L('Enregistrer', 'Save') + '</button></section>' +

      '<section class="card"><h3>5. ' + L('Zones avec transmission active (scénario de démonstration)', 'Zones with active transmission (demo scenario)') + '</h3><div class="checks">' +
      G.zones.map(function (z) { return '<label class="check"><input type="checkbox" data-aff="' + z.id + '"' + (G.affected_zones.indexOf(z.id) >= 0 ? ' checked' : '') + '> ' + esc(z.name) + '</label>'; }).join('') + '</div><button class="primary" id="asave">' + L('Enregistrer', 'Save') + '</button></section>' +

      '<section class="card"><h3>6. ' + L('Matrice des rôles et permissions', 'Role and permission matrix') + '</h3><div class="scroll"><table class="tbl small"><tr><th>' + L('Rôle', 'Role') + '</th><th>' + L('Onglets', 'Tabs') + '</th><th>' + L('Permissions', 'Permissions') + '</th></tr>' +
      Object.keys(B.ROLES).map(function (r) { return '<tr><td>' + esc(B.t('role_' + r)) + '</td><td>' + B.ROLES[r].map(function (tb) { return esc(B.t('tab_' + tb)); }).join(', ') + '</td><td>' + Object.keys(B.PERMS).filter(function (p) { return B.PERMS[p].indexOf(r) >= 0; }).join(', ') + '</td></tr>'; }).join('') + '</table></div>' +
      '<p class="muted small">' + L('Prototype : les rôles se changent librement en haut de page. En production : comptes individuels, authentification et attribution des rôles par l\'administrateur.', 'Prototype: roles are switched freely at the top. In production: individual accounts, authentication and role assignment by the administrator.') + '</p></section>';

    var parentSel = function () {
      var k = B.$('#ukind', v).value, list = k === 'zone' ? G.provinces : (k === 'area' ? G.zones : G.areas);
      B.$('#uparent', v).innerHTML = list.map(function (x) { return '<option value="' + x.id + '">' + esc(x.name) + '</option>'; }).join('');
      B.$('#ufac', v).disabled = k !== 'facility';
    };
    B.$('#ukind', v).onchange = parentSel; parentSel();
    var done = function (what, detail) { B.audit('config_' + what, 'config', what, detail || ''); B.save(); G.applyConfig(cfg().geo); B.notify(L('Configuration enregistrée.', 'Configuration saved.')); B.VIEWS.admin(v); };
    B.$('#gsave', v).onclick = function () {
      var g = cfg().geo; g.zone_province = g.zone_province || {}; g.confirmed = g.confirmed || {}; var n = 0;
      B.$$('[data-zprov]', v).forEach(function (s) { var z = B.byId(G.zones, s.getAttribute('data-zprov')); if (s.value !== z.province_default || g.zone_province[z.id]) { if (g.zone_province[z.id] !== s.value) n++; g.zone_province[z.id] = s.value; } });
      B.$$('[data-zconf]', v).forEach(function (cb) { var id = cb.getAttribute('data-zconf'); if (!!g.confirmed[id] !== cb.checked) n++; if (cb.checked) g.confirmed[id] = true; else delete g.confirmed[id]; });
      done('zone_links', n + ' change(s)');
    };
    B.$('#uadd', v).onclick = function () {
      var k = B.$('#ukind', v).value, name = B.$('#uname', v).value.trim(), parent = B.$('#uparent', v).value, code = B.$('#ucode', v).value.trim();
      if (!name || !parent) { B.notify(B.t('required'), 'err'); return; }
      var g = cfg().geo;
      if (k === 'zone') { g.added_zones = g.added_zones || []; g.added_zones.push({ id: 'Z-' + slug(name), name: name, province: parent, code: code }); }
      if (k === 'area') { g.added_areas = g.added_areas || []; g.added_areas.push({ id: parent + '-' + slug(name), zone: parent, name_fr: name, name_en: name, name_sw: name, code: code }); }
      if (k === 'village') { g.added_villages = g.added_villages || []; g.added_villages.push({ id: parent + '-' + slug(name), area: parent, name_fr: name, name_en: name, name_sw: name, code: code }); }
      if (k === 'facility') { g.added_facilities = g.added_facilities || []; g.added_facilities.push({ id: parent + '-' + slug(name), area: parent, type: B.$('#ufac', v).value, code: (code || slug(name).slice(0, 4)).toUpperCase(), name_fr: name, name_en: name, name_sw: name }); }
      done('add_' + k, name);
    };
    B.$('#tsave', v).onclick = function () {
      var t = {}; B.$$('[data-tat]', v).forEach(function (i) { t[i.getAttribute('data-tat')] = Math.max(1, +i.value || B.queue.DEFAULT_TAT[i.getAttribute('data-tat')]); });
      cfg().tat = t; cfg().followup_days = Math.max(1, +B.$('#fudays', v).value || 21);
      done('tat', JSON.stringify(t) + ' followup=' + cfg().followup_days);
    };
    B.$('#hsave', v).onclick = function () {
      var on = B.$('#home', v).checked, ref = B.$('#homeref', v).value.trim();
      if (on && ref.length < 3) { B.notify(L('Indiquez la référence du protocole national autorisant la prise en charge à domicile.', 'Enter the reference of the national protocol permitting home-based care.'), 'err'); return; }
      cfg().home_care_permitted = on; cfg().home_care_ref = ref; done('home_care', on + ' ' + ref);
    };
    B.$('#asave', v).onclick = function () { cfg().geo.affected_zones = B.$$('[data-aff]:checked', v).map(function (x) { return x.getAttribute('data-aff'); }); done('affected_zones', cfg().geo.affected_zones.join(',')); };
  };
})();
