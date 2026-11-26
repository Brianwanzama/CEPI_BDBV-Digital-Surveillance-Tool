/* Interactive epidemiological surveillance map.
 *
 * Geography rules (brief §2.2):
 *  - Only real coordinates are used: the DRC outline (Natural Earth) and reference points from
 *    GeoNames (provincial capitals; health zones whose name matches a town). See geodata.js.
 *  - Every marker is an AGGREGATE for an administrative unit, drawn at that unit's reference point
 *    (provincial capital / town of the same name). It is not the location of a house, burial site
 *    or facility. Nothing is placed at an invented coordinate: items whose unit has no reference
 *    point are listed under "Not mapped".
 *  - No names are shown; details list record IDs, dates and statuses only.
 */
(function () {
  'use strict';
  var B = window.BDBV, GD = window.BDBV_GEODATA, BND = window.BDBV_BOUNDARIES || null;
  var L = function (f, e) { return B.L(f, e); };
  var esc = function (x) { return B.esc(x); };
  var DAY = 86400000;

  var LAYERS = {
    burial: { group: 'A', color: '#78716c', shape: 'square', fr: 'Sites d\'inhumation', en: 'Burial sites' },
    infection: { group: 'B', color: '#d97706', shape: 'circle', fr: 'Lieux d\'infection (cas par résidence)', en: 'Infection locations (cases by residence)' },
    probable: { group: 'C', color: '#7c2d12', shape: 'diamond', fr: 'Cas probables', en: 'Probable cases' },
    deaths: { group: 'D', color: '#111827', shape: 'triangle', fr: 'Zones rapportant des décès', en: 'Areas reporting deaths' },
    facility: { group: 'E', color: '#0f766e', shape: 'square', fr: 'Formations sanitaires', en: 'Health facilities' },
    holding: { group: 'E', color: '#0e7490', shape: 'cross', fr: 'Unités de transit et d\'isolement', en: 'Holding and isolation units' },
    alerts: { group: 'E', color: '#7c3aed', shape: 'circle', fr: 'Alertes communautaires', en: 'Community alerts' },
    cluster: { group: 'E', color: '#db2777', shape: 'star', fr: 'Groupes de cas suspects', en: 'Suspected outbreak clusters' },
    contacts: { group: 'E', color: '#2563eb', shape: 'circle', fr: 'Contacts (lieu de résidence)', en: 'Contact locations (residence)' },
    increase: { group: 'E', color: '#dc2626', shape: 'ring', fr: 'Hausse inhabituelle (signal statistique)', en: 'Unusual increase (statistical signal)' }
  };
  var CLS_COLOR = { suspected: '#f59e0b', probable: '#ea580c', confirmed: '#b91c1c' };
  var mf = { layers: { burial: true, infection: true, probable: true, deaths: true, alerts: true, cluster: true, increase: true, facility: false, holding: true, contacts: false },
    level: 'province', days: '30', week: 0, compare: false, approvedOnly: true, cls: { suspected: true, probable: true, confirmed: true }, geo: {}, open: null };

  /* ---------- projection ---------- */
  var W = 560, H = 560, P = 12;
  var bb = GD.bbox, k = Math.cos(((bb[1] + bb[3]) / 2) * Math.PI / 180);
  var sx = (W - 2 * P) / ((bb[2] - bb[0]) * k), sy = (H - 2 * P) / (bb[3] - bb[1]), sc = Math.min(sx, sy);
  function proj(lon, lat) { return [P + (lon - bb[0]) * k * sc, P + (bb[3] - lat) * sc]; }
  var outlinePath = GD.outline.map(function (ring) { return 'M' + ring.map(function (pt) { var p = proj(pt[0], pt[1]); return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join('L') + 'Z'; }).join('');

  function db() { return B.db(); }
  function provName(pid) { var p = B.byId(B.G.provinces, pid); return p ? p.name_fr : null; }
  // Reference point for a location at the chosen aggregation level, or null.
  // Official boundaries (tools/import_boundaries.js): reference point = centroid of the polygon.
  function bndFeature(layer, id) {
    if (!BND || !BND[layer] || !id) return null;
    return BND[layer].features.filter(function (f) { return f.properties.id === id; })[0] || null;
  }
  function anchor(geo, level) {
    if (!geo || !geo.zone) return null;
    var z = B.byId(B.G.zones, geo.zone);
    var bf = z && bndFeature(level === 'zone' ? 'zones' : 'provinces', level === 'zone' ? z.id : z.province);
    if (bf && bf.properties.c) {
      var nmB = level === 'zone' ? L('ZS ', 'HZ ') + z.name : (B.byId(B.G.provinces, z.province) || {}).name_fr;
      return { key: (level === 'zone' ? 'Z:' + z.id : 'P:' + z.province), label: nmB, lat: bf.properties.c[1], lon: bf.properties.c[0], src: L('centre de la limite officielle', 'centre of the official boundary'), official: true };
    }
    if (level === 'zone') {
      var g = z && GD.zones[z.name];
      return g ? { key: 'Z:' + z.id, label: L('ZS ', 'HZ ') + z.name, lat: g.lat, lon: g.lon, src: g.source } : null;
    }
    var pn = z && provName(z.province), gp = pn && GD.provinces[pn];
    return gp && gp.lat != null ? { key: 'P:' + z.province, label: pn + ' (' + gp.capital + ')', lat: gp.lat, lon: gp.lon, src: gp.source, unconfirmed: z.link_status !== 'confirmed' } : null;
  }

  /* ---------- collect items per layer ---------- */
  function windowRange() {
    var end = new Date(Date.now() - mf.week * 7 * DAY);
    var start = mf.days === 'all' ? new Date(0) : new Date(end.getTime() - (+mf.days) * DAY);
    return [start, end];
  }
  function inWin(date, r) { var t = new Date(date); return !isNaN(t) && t >= r[0] && t <= r[1]; }
  function geoOK(g) { return B.inGeo(g || {}, Object.assign({ facility: '' }, mf.geo, { facility: '' })); }
  function repGeo(r) { return { province: r.province, zone: r.zone, area: r.area, village: r.village }; }
  function approvedRep(id) { return !mf.approvedOnly || !B.isApproved || B.isApproved(id); }

  function collect(range) {
    var d = db(), items = [];
    var push = function (layer, geo, o) { if (geoOK(geo)) items.push(Object.assign({ layer: layer, geo: geo }, o)); };
    d.reports.forEach(function (r) {
      if (!approvedRep(r.id)) return;
      var g = repGeo(r);
      if (inWin(r.reported_at, range)) {
        var c = r.counts;
        if (c.deaths_total) push('deaths', g, { id: r.id, date: r.reported_at, n: c.deaths_total, detail: L('décès ', 'deaths ') + c.deaths_total + ' · ' + L('inexpliqués ', 'unexplained ') + c.deaths_unexplained + ' · ' + L('suspects Ebola ', 'suspected Ebola ') + c.deaths_suspected_ebola, unexplained: c.deaths_unexplained, suspected: c.deaths_suspected_ebola, status: B.queueStatus(r.id) });
        if (c.alerts) push('alerts', g, { id: r.id, date: r.reported_at, n: c.alerts, detail: L('alertes RECO : ', 'RECO alerts: ') + c.alerts, status: B.queueStatus(r.id) });
      }
      (r.events || []).forEach(function (e) {
        if (!inWin(e.date_occurred, range)) return;
        if (e.type === 'burial' || e.type === 'unsafe_burial') push('burial', g, { id: e.id, date: e.date_occurred, n: 1, detail: B.evLabel(e.type) + (e.deaths ? ' · ' + e.deaths + L(' décès', ' death(s)') : '') + (e.case_class ? ' · ' + L('cas ', 'case ') + e.case_class : ''), status: e.verification, case_class: e.case_class });
        if (e.type === 'cluster') push('cluster', g, { id: e.id, date: e.date_occurred, n: 1, detail: B.evLabel(e.type) + ' (' + e.n + ')', status: e.verification });
      });
    });
    d.rumours.forEach(function (r) {
      var a = B.queue.byRef(r.id);
      if (mf.approvedOnly && !(a && a.stages.approved && a.stages.approved.include)) return;
      if (!inWin(r.date_occurred || r.submitted_at, range)) return;
      var layer = (r.type === 'burial' || r.type === 'unsafe_burial') ? 'burial' : (r.type === 'cluster' ? 'cluster' : 'alerts');
      push(layer, r.geo, { id: r.id, date: r.date_occurred, n: 1, detail: L('Rumeur : ', 'Rumour: ') + B.evLabel(r.type) + (r.n_deaths ? ' · ' + r.n_deaths + L(' décès', ' death(s)') : ''), status: B.queueStatus(r.id) });
      if (r.n_deaths) push('deaths', r.geo, { id: r.id, date: r.date_occurred, n: r.n_deaths, detail: L('Rumeur : ', 'Rumour: ') + r.n_deaths + L(' décès', ' death(s)'), status: B.queueStatus(r.id) });
    });
    d.assessments.forEach(function (a) {
      var cs = a.classification && a.classification.status;
      if (['suspected', 'probable', 'confirmed'].indexOf(cs) < 0 || !mf.cls[cs]) return;
      if (!inWin(a.assessed_at, range)) return;
      var g = { province: a.geo.province, zone: a.geo.zone, area: a.geo.area, village: a.geo.village };
      push('infection', g, { id: a.id, date: a.assessed_at, n: 1, cls: cs, detail: B.classLabel(a.classification) + ' · ' + L('début ', 'onset ') + B.fmtD(a.clinical.onset_date), status: B.careLabel ? B.careLabel(a) : '' });
      if (cs === 'probable') push('probable', g, { id: a.id, date: a.assessed_at, n: 1, detail: L('Début ', 'Onset ') + B.fmtD(a.clinical.onset_date) + ' · ' + L('signalé ', 'reported ') + B.fmtD(a.assessed_at), status: B.careLabel ? B.careLabel(a) : '' });
      if (a.care && a.care.status === 'deceased') push('deaths', g, { id: a.id, date: a.assessed_at, n: 1, detail: L('Décès d\'un cas ', 'Death of a case ') + '(' + B.classLabel(a.classification) + ')', status: '' });
    });
    d.contacts.forEach(function (c) { if (inWin(c.identified_at, range)) push('contacts', c.geo, { id: c.id, date: c.identified_at, n: 1, detail: B.contactsApi ? B.L.apply(null, B.contactsApi.STATUS[c.status]) : c.status, status: '' }); });
    B.G.facilities.forEach(function (f) {
      var ar = B.byId(B.G.areas, f.area); if (!ar) return;
      var z = B.byId(B.G.zones, ar.zone), g = { province: z.province, zone: z.id, area: ar.id };
      push(f.type === 'holding' || f.type === 'isolation' ? 'holding' : 'facility', g, { id: f.id, date: null, n: 1, detail: f.name + ' · ' + B.L.apply(null, B.G.facility_types[f.type].slice(0, 2)), status: f.demo ? L('démo, sans coordonnées propres', 'demo, no own coordinates') : '' });
    });
    // Unusual increase: zones whose community deaths this week exceed baseline (statistical signal only)
    B.G.zones.forEach(function (z) {
      var reps = d.reports.filter(function (r) { return r.zone === z.id; });
      if (!reps.length) return;
      var series = [0, 0, 0, 0, 0];
      var ref = range[1];
      reps.forEach(function (r) { var w = Math.floor((ref - new Date(r.reported_at)) / (7 * DAY)); if (w >= 0 && w < 5) series[w] += r.counts.deaths_total + r.counts.compatible_illness_people; });
      var ew = B.S.earlyWarning(series, B.rules().early_warning);
      if (ew.signal) push('increase', { province: z.province, zone: z.id }, { id: z.id, date: ref.toISOString(), n: 1, detail: L('Décès + malades compatibles : ', 'Deaths + compatible illness: ') + ew.current + L(' cette semaine, seuil ', ' this week, threshold ') + ew.threshold, status: L('signal statistique, non confirmé', 'statistical signal, not confirmed') });
    });
    return items.filter(function (it) { return mf.layers[it.layer]; });
  }

  function aggregate(items) {
    var groups = {}, unplaced = {};
    items.forEach(function (it) {
      var a = anchor(it.geo, mf.level);
      if (!a) { var zk = it.geo.zone ? B.nm(B.G.zones, it.geo.zone) : L('(zone inconnue)', '(unknown zone)'); unplaced[zk] = unplaced[zk] || {}; unplaced[zk][it.layer] = (unplaced[zk][it.layer] || 0) + it.n; return; }
      var gk = groups[a.key] = groups[a.key] || { anchor: a, layers: {}, items: [] };
      gk.layers[it.layer] = (gk.layers[it.layer] || 0) + it.n; gk.items.push(it);
    });
    return { groups: groups, unplaced: unplaced };
  }

  function glyph(shape, x, y, r, color, extra) {
    var a = ' fill="' + color + '" stroke="#fff" stroke-width="1"' + (extra || '');
    if (shape === 'square') return '<rect x="' + (x - r) + '" y="' + (y - r) + '" width="' + 2 * r + '" height="' + 2 * r + '"' + a + '/>';
    if (shape === 'diamond') return '<path d="M' + x + ',' + (y - r * 1.3) + 'L' + (x + r * 1.3) + ',' + y + 'L' + x + ',' + (y + r * 1.3) + 'L' + (x - r * 1.3) + ',' + y + 'Z"' + a + '/>';
    if (shape === 'triangle') return '<path d="M' + x + ',' + (y + r * 1.2) + 'L' + (x + r * 1.2) + ',' + (y - r) + 'L' + (x - r * 1.2) + ',' + (y - r) + 'Z"' + a + '/>';
    if (shape === 'cross') return '<path d="M' + (x - r) + ',' + (y - r / 3) + 'h' + (2 * r / 3) + 'v' + (-2 * r / 3) + 'h' + (2 * r / 3) + 'v' + (2 * r / 3) + 'h' + (2 * r / 3) + 'v' + (2 * r / 3) + 'h' + (-2 * r / 3) + 'v' + (2 * r / 3) + 'h' + (-2 * r / 3) + 'v' + (-2 * r / 3) + 'h' + (-2 * r / 3) + 'Z"' + a + '/>';
    if (shape === 'star') { var p = ''; for (var i = 0; i < 10; i++) { var ang = Math.PI / 5 * i - Math.PI / 2, rr = i % 2 ? r * 0.5 : r * 1.3; p += (i ? 'L' : 'M') + (x + rr * Math.cos(ang)).toFixed(1) + ',' + (y + rr * Math.sin(ang)).toFixed(1); } return '<path d="' + p + 'Z"' + a + '/>'; }
    if (shape === 'ring') return '<circle cx="' + x + '" cy="' + y + '" r="' + (r + 10) + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-dasharray="5 3"' + (extra || '') + '/>';
    return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '"' + a + '/>';
  }

  function geoPath(geom) {
    var polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    return polys.map(function (poly) { return poly.map(function (ring) { return 'M' + ring.map(function (pt) { var p = proj(pt[0], pt[1]); return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join('L') + 'Z'; }).join(''); }).join('');
  }
  var pathCache = {};
  function boundaryLayer(layer, cls, active) {
    if (!BND || !BND[layer]) return '';
    return BND[layer].features.map(function (f, i) {
      var k = layer + i; if (!pathCache[k]) pathCache[k] = geoPath(f.geometry);
      var on = f.properties.id && active[(layer === 'zones' ? 'Z:' : 'P:') + f.properties.id];
      return '<path d="' + pathCache[k] + '" class="' + cls + (on ? ' hasdata' : '') + (f.properties.id ? '' : ' nomatch') + '"><title>' + esc(f.properties.name) + '</title></path>';
    }).join('');
  }

  function svg(agg, interactive, prevAgg) {
    var out = '<svg class="dmap" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + L('Carte de la RDC', 'Map of the DRC') + '"><path d="' + outlinePath + '" class="drc"/>';
    out += boundaryLayer('provinces', 'bprov', mf.level === 'province' ? agg.groups : {});
    if (mf.level === 'zone') out += boundaryLayer('zones', 'bzone', agg.groups);
    // reference points of all provinces (context)
    Object.keys(GD.provinces).forEach(function (pn) { var gp = GD.provinces[pn]; if (gp.lat == null) return; var p = proj(gp.lon, gp.lat); out += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="1.6" class="refpt"><title>' + esc(pn + ' - ' + gp.capital) + '</title></circle>'; });
    Object.keys(agg.groups).forEach(function (key) {
      var g = agg.groups[key], p = proj(g.anchor.lon, g.anchor.lat), ls = Object.keys(g.layers).filter(function (l) { return l !== 'increase'; });
      if (g.layers.increase) out += glyph('ring', p[0], p[1], 6, LAYERS.increase.color);
      ls.forEach(function (l, i) {
        var ang = ls.length === 1 ? 0 : (2 * Math.PI * i / ls.length) - Math.PI / 2, off = ls.length === 1 ? 0 : Math.max(16, 7 * ls.length);
        var x = p[0] + off * Math.cos(ang), y = p[1] + off * Math.sin(ang), n = g.layers[l], r = Math.min(4 + Math.sqrt(n) * 1.6, 13);
        var color = LAYERS[l].color;
        if (l === 'infection') { var c = { suspected: 0, probable: 0, confirmed: 0 }; g.items.forEach(function (it) { if (it.layer === 'infection') c[it.cls]++; }); color = c.confirmed ? CLS_COLOR.confirmed : (c.probable ? CLS_COLOR.probable : CLS_COLOR.suspected); }
        var delta = prevAgg && prevAgg.groups[key] ? n - (prevAgg.groups[key].layers[l] || 0) : (prevAgg ? n : null);
        out += '<g class="mk"' + (interactive ? ' data-mk="' + esc(key) + '" tabindex="0"' : '') + '>' + glyph(LAYERS[l].shape, +x.toFixed(1), +y.toFixed(1), r, color) +
          '<title>' + esc(g.anchor.label + ' - ' + L(LAYERS[l].fr, LAYERS[l].en) + ' : ' + n + (delta != null ? ' (Δ ' + (delta >= 0 ? '+' : '') + delta + ')' : '')) + '</title></g>';
      });
      if (interactive) out += '<text x="' + (p[0] + (ls.length > 1 ? Math.max(16, 7 * ls.length) + 16 : 14)) + '" y="' + (p[1] + 4) + '" class="mlbl">' + esc(g.anchor.label.replace(/ \(.*\)$/, '')) + '</text>';
    });
    return out + '</svg>';
  }

  function legend() {
    return '<div class="mlegend">' + Object.keys(LAYERS).map(function (l) {
      var Lr = LAYERS[l];
      return '<label class="check"><input type="checkbox" data-layer="' + l + '"' + (mf.layers[l] ? ' checked' : '') + '><svg width="22" height="22" viewBox="0 0 22 22">' + glyph(Lr.shape === 'ring' ? 'ring' : Lr.shape, 11, 11, Lr.shape === 'ring' ? -2 : 6, Lr.color) + '</svg> <b>' + Lr.group + '</b> ' + esc(L(Lr.fr, Lr.en)) + '</label>';
    }).join('') + '<div class="small">' + L('Couleur des cas : ', 'Case colour: ') + '<span style="color:' + CLS_COLOR.suspected + '">● ' + L('suspect', 'suspected') + '</span> <span style="color:' + CLS_COLOR.probable + '">● ' + L('probable', 'probable') + '</span> <span style="color:' + CLS_COLOR.confirmed + '">● ' + L('confirmé', 'confirmed') + '</span></div></div>';
  }

  B.VIEWS.map = function (v) {
    var range = windowRange(), items = collect(range), agg = aggregate(items);
    var prevAgg = null;
    if (mf.compare && mf.days !== 'all') { var len = range[1] - range[0]; prevAgg = aggregate(collect([new Date(range[0] - len), range[0]])); }
    var agOnly = B.can('aggregate_only');
    var unplacedKeys = Object.keys(agg.unplaced);
    var tot = {}; items.forEach(function (it) { tot[it.layer] = (tot[it.layer] || 0) + it.n; });
    v.innerHTML = '<section class="card"><h2>' + L('Carte de surveillance épidémiologique', 'Epidemiological surveillance map') + '</h2>' +
      '<p class="muted small">' + (BND ? L('Chaque symbole = total pour une unité administrative, placé au centre de sa limite officielle. Ce n\'est PAS l\'emplacement exact d\'un ménage, d\'une tombe ou d\'une FOSA. Les unités grisées ont des évènements dans la période.', 'Each symbol = total for an administrative unit, drawn at the centre of its official boundary. It is NOT the exact location of a household, grave or facility. Shaded units have events in the period.') : L('Chaque symbole = total pour une unité administrative, placé au point de référence de cette unité (chef-lieu de province, ou ville du même nom que la zone de santé ; source GeoNames). Ce n\'est PAS l\'emplacement exact d\'un ménage, d\'une tombe ou d\'une FOSA. Limites de provinces et de zones de santé : à fournir par le MSP/DSNIS.', 'Each symbol = total for an administrative unit, drawn at that unit\'s reference point (provincial capital, or town with the same name as the health zone; GeoNames). It is NOT the exact location of a household, grave or facility. Province and health-zone boundaries: to be supplied by MoH/DSNIS.')) + '</p>' +
      '<div data-geoholder="m_">' + B.geoFields('m_', mf.geo, false, B.t('all')) + '</div>' +
      '<div class="vbar"><label class="inl">' + L('Niveau d\'agrégation', 'Aggregation level') + ' <select id="mlevel"><option value="province">' + L('Province (chef-lieu)', 'Province (capital)') + '</option><option value="zone"' + (mf.level === 'zone' ? ' selected' : '') + '>' + L('Zone de santé (si géocodée)', 'Health zone (if geocoded)') + '</option></select></label>' +
      '<label class="inl">' + B.t('period') + ' <select id="mdays">' + ['7', '14', '30', '90', 'all'].map(function (x) { return '<option value="' + x + '"' + (mf.days === x ? ' selected' : '') + '>' + (x === 'all' ? B.t('all') : x + ' ' + B.t('days')) + '</option>'; }).join('') + '</select></label>' +
      '<label class="inl wide">' + L('Fin de période : il y a ', 'Period ends: ') + '<input type="range" id="mweek" min="0" max="11" value="' + mf.week + '"> <b>' + (mf.week ? mf.week + L(' sem.', ' wk ago') : L('aujourd\'hui', 'today')) + '</b></label>' +
      '<label class="check"><input type="checkbox" id="mcomp"' + (mf.compare ? ' checked' : '') + '> ' + L('Comparer à la période précédente', 'Compare with previous period') + '</label>' +
      '<label class="check"><input type="checkbox" id="mappr"' + (mf.approvedOnly ? ' checked' : '') + '> ' + L('Signalements approuvés seulement', 'Approved reports only') + '</label></div>' +
      '<div class="vbar small">' + L('Classification : ', 'Classification: ') + ['suspected', 'probable', 'confirmed'].map(function (c) { return '<label class="check"><input type="checkbox" data-cls="' + c + '"' + (mf.cls[c] ? ' checked' : '') + '> ' + esc(B.L.apply(null, B.CLASS[c])) + '</label>'; }).join('') + '</div>' +
      '<p class="small">' + B.fmtD(range[0].toISOString()) + ' → ' + B.fmtD(range[1].toISOString()) + ' · ' + Object.keys(tot).map(function (l) { return esc(L(LAYERS[l].fr, LAYERS[l].en)) + ' ' + tot[l]; }).join(' · ') + '</p>' +
      '<div class="mapwrap"><div>' + svg(agg, true, prevAgg) + '</div>' + legend() + '</div>' +
      '<div id="mdetail"></div>' +
      (unplacedKeys.length ? '<details class="card inner"><summary>' + L('Non cartographiés (pas de point de référence vérifié) : ', 'Not mapped (no verified reference point): ') + unplacedKeys.length + L(' zone(s)', ' zone(s)') + '</summary><table class="tbl small"><tr><th>' + L('Zone', 'Zone') + '</th><th>' + L('Couches', 'Layers') + '</th></tr>' + unplacedKeys.map(function (k) { return '<tr><td>' + esc(k) + '</td><td>' + Object.keys(agg.unplaced[k]).map(function (l) { return esc(L(LAYERS[l].fr, LAYERS[l].en)) + ' ' + agg.unplaced[k][l]; }).join(' · ') + '</td></tr>'; }).join('') + '</table></details>' : '') +
      (prevAgg ? compareTable(agg, prevAgg) : '') +
      (B.can('reports') ? '<div class="vbar"><button class="sm" id="mcsv">' + L('Télécharger (CSV)', 'Download (CSV)') + '</button><button class="sm" id="mxlsx">Excel</button><button class="sm" id="mpdf">PDF</button></div>' : '') +
      '<p class="muted small">' + esc(GD.attribution) + ' ' + (BND ? L('Limites officielles : ', 'Official boundaries: ') + esc(Object.keys(BND.sources || {}).map(function (k) { return BND.sources[k]; }).join(', ')) + ' (' + esc(BND.generated) + ').' : esc(GD.boundaries_note)) + (agOnly ? ' ' + L('Vue agrégée.', 'Aggregated view.') : '') + '</p></section>';
    B.bindGeo(v.querySelector('[data-geoholder="m_"]').parentNode, 'm_', false, B.t('all'), function (g) { mf.geo = g; B.VIEWS.map(v); });
    B.$('#mlevel', v).onchange = function () { mf.level = this.value; B.VIEWS.map(v); };
    B.$('#mdays', v).onchange = function () { mf.days = this.value; B.VIEWS.map(v); };
    B.$('#mweek', v).onchange = function () { mf.week = +this.value; B.VIEWS.map(v); };
    B.$('#mcomp', v).onchange = function () { mf.compare = this.checked; B.VIEWS.map(v); };
    B.$('#mappr', v).onchange = function () { mf.approvedOnly = this.checked; B.VIEWS.map(v); };
    B.$$('[data-layer]', v).forEach(function (c) { c.onchange = function () { mf.layers[c.getAttribute('data-layer')] = c.checked; B.VIEWS.map(v); }; });
    B.$$('[data-cls]', v).forEach(function (c) { c.onchange = function () { mf.cls[c.getAttribute('data-cls')] = c.checked; B.VIEWS.map(v); }; });
    B.$$('[data-mk]', v).forEach(function (g) {
      var open = function () { mf.open = g.getAttribute('data-mk'); detail(v, agg, prevAgg); };
      g.onclick = open; g.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
    });
    var rows = function () { return exportRows(agg); };
    var ex = function (fmt) { if (B.exportTable) { B.exportTable(fmt, 'carte_surveillance', L('Rapport géographique de surveillance', 'Geographical surveillance report'), rows()); B.audit('download', 'map', fmt, Object.keys(agg.groups).length + ' units'); } };
    if (B.$('#mcsv', v)) { B.$('#mcsv', v).onclick = function () { ex('csv'); }; B.$('#mxlsx', v).onclick = function () { ex('xlsx'); }; B.$('#mpdf', v).onclick = function () { ex('pdf'); }; }
    if (mf.open && agg.groups[mf.open]) detail(v, agg, prevAgg);
  };

  function exportRows(agg) {
    var head = [L('Unité', 'Unit'), L('Niveau', 'Level'), L('Lat (réf.)', 'Lat (ref.)'), L('Lon (réf.)', 'Lon (ref.)'), L('Source du point', 'Point source')].concat(Object.keys(LAYERS).map(function (l) { return L(LAYERS[l].fr, LAYERS[l].en); }));
    var body = Object.keys(agg.groups).map(function (k) { var g = agg.groups[k]; return [g.anchor.label, mf.level, g.anchor.lat, g.anchor.lon, g.anchor.src].concat(Object.keys(LAYERS).map(function (l) { return g.layers[l] || 0; })); });
    Object.keys(agg.unplaced).forEach(function (z) { body.push([z, L('non cartographié', 'not mapped'), '', '', ''].concat(Object.keys(LAYERS).map(function (l) { return agg.unplaced[z][l] || 0; }))); });
    return [head].concat(body);
  }

  function compareTable(agg, prev) {
    var keys = Object.keys(agg.groups).concat(Object.keys(prev.groups)).filter(function (x, i, a) { return a.indexOf(x) === i; });
    var ls = Object.keys(LAYERS).filter(function (l) { return mf.layers[l] && ['facility', 'holding'].indexOf(l) < 0; });
    return '<details class="card inner" open><summary>' + L('Comparaison avec la période précédente', 'Comparison with previous period') + '</summary><div class="scroll"><table class="tbl small"><tr><th>' + L('Unité', 'Unit') + '</th>' + ls.map(function (l) { return '<th>' + esc(L(LAYERS[l].fr, LAYERS[l].en)) + '</th>'; }).join('') + '</tr>' +
      keys.map(function (k) { var g = agg.groups[k] || prev.groups[k]; return '<tr><td>' + esc(g.anchor.label) + '</td>' + ls.map(function (l) { var a = (agg.groups[k] && agg.groups[k].layers[l]) || 0, b = (prev.groups[k] && prev.groups[k].layers[l]) || 0, dlt = a - b; return '<td>' + a + ' <small class="' + (dlt > 0 ? 'up' : 'muted') + '">(' + (dlt > 0 ? '+' : '') + dlt + ')</small></td>'; }).join('') + '</tr>'; }).join('') + '</table></div></details>';
  }

  function detail(v, agg, prev) {
    var g = agg.groups[mf.open], box = B.$('#mdetail', v); if (!g || !box) return;
    var byL = {}; g.items.forEach(function (it) { (byL[it.layer] = byL[it.layer] || []).push(it); });
    box.innerHTML = '<div class="card inner"><h3>' + esc(g.anchor.label) + '</h3><p class="muted small">' + L('Point de référence : ', 'Reference point: ') + esc(g.anchor.src) + (g.anchor.unconfirmed ? ' · ' + L('rattachement zone→province non confirmé', 'zone→province link not confirmed') : '') + '</p>' +
      Object.keys(byL).map(function (l) {
        return '<h4>' + LAYERS[l].group + ' · ' + esc(L(LAYERS[l].fr, LAYERS[l].en)) + ' (' + g.layers[l] + (prev ? ', ' + L('période précédente ', 'previous period ') + ((prev.groups[mf.open] && prev.groups[mf.open].layers[l]) || 0) : '') + ')</h4><div class="scroll"><table class="tbl small"><tr><th>ID</th><th>' + L('Zone / village', 'Zone / village') + '</th><th>' + L('Date', 'Date') + '</th><th>' + L('Détail', 'Detail') + '</th><th>' + L('Statut', 'Status') + '</th></tr>' +
          byL[l].slice(0, 60).map(function (it) { return '<tr><td><code>' + esc(it.id) + '</code></td><td>' + esc([B.nm(B.G.zones, it.geo.zone), it.geo.village ? B.nm(B.G.villages, it.geo.village) : ''].filter(function (x) { return x && x !== '-'; }).join(' / ')) + '</td><td>' + (it.date ? B.fmtD(it.date) : '-') + '</td><td>' + esc(it.detail) + '</td><td>' + esc(it.status || '') + '</td></tr>'; }).join('') + '</table></div>';
      }).join('') + '</div>';
    box.scrollIntoView({ block: 'nearest' });
  }

  // Small read-only overview for the dashboard.
  B.mapMini = function () {
    var save = JSON.stringify(mf), cur = JSON.parse(save);
    mf.layers = { infection: true, deaths: true, alerts: true, cluster: true, increase: true, burial: false, probable: false, facility: false, holding: false, contacts: false };
    mf.level = 'province'; mf.week = 0; mf.approvedOnly = !B.st.f.showPending; mf.cls = { suspected: true, probable: true, confirmed: true }; mf.geo = Object.assign({}, B.st.f); delete mf.geo.days; mf.days = B.st.f.days || '30';
    var html = '<div class="mapmini">' + svg(aggregate(collect(windowRange())), false, null) + '</div>';
    Object.assign(mf, cur);
    return html;
  };
  B.mapApi = { anchor: anchor, LAYERS: LAYERS };
})();
