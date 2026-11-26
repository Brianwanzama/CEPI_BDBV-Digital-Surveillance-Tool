/* Occupational and demographic analysis (descriptive only). */
(function () {
  'use strict';
  var B = window.BDBV;
  var L = function (f, e) { return B.L(f, e); };
  var esc = function (x) { return B.esc(x); };
  var DAY = 86400000;
  var af = { days: '90', basis: 'cases', geo: {} };
  function db() { return B.db(); }
  function occLabel(c) { var o = B.OCCUPATIONS.filter(function (x) { return x[0] === c; })[0]; return c && o ? B.L(o[1], o[2]) : L('Non renseignée', 'Not recorded'); }

  B.VIEWS.analysis = function (v) {
    var d = db(), since = af.days === 'all' ? 0 : Date.now() - (+af.days) * DAY;
    var g = Object.assign({ facility: '' }, af.geo);
    var A = d.assessments.filter(function (a) { return new Date(a.assessed_at) >= since && B.inGeo(a.geo, g) && (af.basis === 'all' || (a.classification && ['suspected', 'probable', 'confirmed'].indexOf(a.classification.status) >= 0)); });
    // Deaths: RECO death/burial events with occupation + deaths of cases.
    var D = [];
    d.reports.forEach(function (r) {
      if (new Date(r.reported_at) < since || !B.inGeo({ province: r.province, zone: r.zone, area: r.area, village: r.village }, g)) return;
      r.events.forEach(function (e) { if (['death_unexplained', 'death_compatible', 'burial', 'unsafe_burial'].indexOf(e.type) >= 0 && (e.deaths || e.type.indexOf('death') === 0)) D.push({ occ: e.occupation, age: e.age_group, sex: e.sex, zone: r.zone, date: e.date_occurred, n: e.deaths || 1, src: 'reco' }); });
    });
    A.forEach(function (a) { if (a.care && a.care.status === 'deceased') D.push({ occ: a.person.occ, age: a.person.age_group, sex: a.person.sex, zone: a.geo.zone, date: a.assessed_at, n: 1, src: 'case' }); });
    var occs = B.OCCUPATIONS.map(function (o) { return o[0]; });
    var byOcc = function (list, f, w) { return occs.map(function (o) { return { label: occLabel(o), value: list.filter(function (x) { return (f(x) || '') === o; }).reduce(function (s, x) { return s + (w ? w(x) : 1); }, 0) }; }).filter(function (x) { return x.value; }).sort(function (a, b) { return b.value - a.value; }); };
    var cOcc = byOcc(A, function (a) { return a.person.occ; }), dOcc = byOcc(D, function (x) { return x.occ; }, function (x) { return x.n; });
    var pyramid = B.AGE_GROUPS.map(function (ag) { var F = A.filter(function (a) { return (a.person.age_group || B.ageGroup(a.person.age)) === ag && a.person.sex === 'F'; }).length, M = A.filter(function (a) { return (a.person.age_group || B.ageGroup(a.person.age)) === ag && a.person.sex === 'M'; }).length; return [ag, F, M]; });
    var maxP = Math.max.apply(null, pyramid.map(function (p) { return Math.max(p[1], p[2]); }).concat([1]));
    var zones = B.G.zones.filter(function (z) { return A.some(function (a) { return a.geo.zone === z.id; }); });
    var topOcc = cOcc.slice(0, 6).map(function (x) { return occs.filter(function (o) { return occLabel(o) === x.label; })[0]; });
    var weeks = [7, 6, 5, 4, 3, 2, 1, 0];
    v.innerHTML = '<section class="card"><h2>' + L('Analyse professionnelle et démographique', 'Occupational and demographic analysis') + '</h2>' +
      '<p class="flag small">' + L('Analyse descriptive uniquement : une association entre une profession et les cas ou décès ne prouve ni une exposition professionnelle ni une causalité. Les effectifs dépendent aussi de la composition de la population et de l\'accès aux soins.', 'Descriptive analysis only: an association between an occupation and cases or deaths does not show occupational exposure or causation. Counts also depend on population make-up and access to care.') + '</p>' +
      '<div data-geoholder="a_">' + B.geoFields('a_', af.geo, false, B.t('all')) + '</div>' +
      '<div class="vbar"><label class="inl">' + B.t('period') + ' <select id="adays">' + ['30', '90', 'all'].map(function (x) { return '<option value="' + x + '"' + (af.days === x ? ' selected' : '') + '>' + (x === 'all' ? B.t('all') : x + ' ' + B.t('days')) + '</option>'; }).join('') + '</select></label>' +
      '<label class="inl">' + L('Base', 'Basis') + ' <select id="abasis"><option value="cases">' + L('Cas suspects, probables et confirmés', 'Suspected, probable and confirmed cases') + '</option><option value="all"' + (af.basis === 'all' ? ' selected' : '') + '>' + L('Toutes les personnes dépistées', 'All people screened') + '</option></select></label></div>' +
      '<p class="small">' + A.length + L(' personne(s) · ', ' person(s) · ') + D.reduce(function (s, x) { return s + x.n; }, 0) + L(' décès avec détails', ' deaths with details') + '</p></section>' +
      '<section class="card"><div class="cols"><div><h4>' + L('Cas par profession', 'Cases by occupation') + '</h4>' + (cOcc.length ? B.bars(cOcc, '#b45309') : '<p class="muted">-</p>') + '</div>' +
      '<div><h4>' + L('Décès par profession', 'Deaths by occupation') + '</h4>' + (dOcc.length ? B.bars(dOcc, '#111827') : '<p class="muted">-</p>') + '<p class="muted small">' + L('Profession des décès : saisie dans les évènements RECO et les dossiers de cas, souvent non renseignée.', 'Occupation for deaths: recorded in RECO events and case records; often not recorded.') + '</p></div></div></section>' +
      '<section class="card"><h4>' + L('Par tranche d\'âge et sexe', 'By age group and sex') + '</h4><table class="tbl pyramid"><tr><th>' + L('Femmes', 'Female') + '</th><th>' + L('Âge', 'Age') + '</th><th>' + L('Hommes', 'Male') + '</th></tr>' +
      pyramid.slice().reverse().map(function (p) { return '<tr><td class="pl"><span class="pb pf" style="width:' + (100 * p[1] / maxP) + '%"></span> ' + p[1] + '</td><td class="pc">' + p[0] + '</td><td><span class="pb pm" style="width:' + (100 * p[2] / maxP) + '%"></span> ' + p[2] + '</td></tr>'; }).join('') + '</table></section>' +
      '<section class="card"><h4>' + L('Répartition géographique des professions (cas)', 'Geographical distribution of occupations (cases)') + '</h4><div class="scroll"><table class="tbl small"><tr><th>' + L('Zone', 'Zone') + '</th>' + occs.filter(Boolean).map(function (o) { return '<th>' + esc(occLabel(o)) + '</th>'; }).join('') + '<th>' + L('Non renseignée', 'Not recorded') + '</th></tr>' +
      zones.map(function (z) { var Z = A.filter(function (a) { return a.geo.zone === z.id; }); return '<tr><td>' + esc(z.name) + '</td>' + occs.filter(Boolean).concat(['']).map(function (o) { var n = Z.filter(function (a) { return (a.person.occ || '') === o; }).length; return '<td>' + (n || '') + '</td>'; }).join('') + '</tr>'; }).join('') + '</table></div></section>' +
      '<section class="card"><h4>' + L('Tendance hebdomadaire par profession (cas, 8 semaines)', 'Weekly trend by occupation (cases, 8 weeks)') + '</h4><div class="scroll"><table class="tbl small"><tr><th>' + L('Profession', 'Occupation') + '</th>' + weeks.map(function (w) { return '<th>' + (w ? 'S-' + w : L('cette sem.', 'this wk')) + '</th>'; }).join('') + '</tr>' +
      topOcc.map(function (o) { return '<tr><td>' + esc(occLabel(o)) + '</td>' + weeks.map(function (w) { var n = A.filter(function (a) { var wk = Math.floor((Date.now() - new Date(a.assessed_at)) / (7 * DAY)); return wk === w && (a.person.occ || '') === o; }).length; return '<td>' + n + '</td>'; }).join('') + '</tr>'; }).join('') +
      '<tr><td><b>' + L('Décès (toutes professions)', 'Deaths (all occupations)') + '</b></td>' + weeks.map(function (w) { return '<td>' + D.filter(function (x) { return Math.floor((Date.now() - new Date(x.date)) / (7 * DAY)) === w; }).reduce(function (s, x) { return s + x.n; }, 0) + '</td>'; }).join('') + '</tr></table></div></section>';
    B.bindGeo(v.querySelector('[data-geoholder="a_"]').parentNode, 'a_', false, B.t('all'), function (gg) { af.geo = gg; B.VIEWS.analysis(v); });
    B.$('#adays', v).onchange = function () { af.days = this.value; B.VIEWS.analysis(v); };
    B.$('#abasis', v).onchange = function () { af.basis = this.value; B.VIEWS.analysis(v); };
  };
})();
