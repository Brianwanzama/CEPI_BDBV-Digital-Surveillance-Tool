/* Interactive epidemiological surveillance map.
 *
 * Official boundaries (boundaries.js, from tools/import_boundaries.js) give the provinces and the
 * 519 health zones. Units are shaded by an indicator (cases, deaths, community alerts, contacts),
 * with hover cards, a profile panel with a 12-week trend, zoom and pan (wheel, drag, pinch, keys),
 * search, a weekly time slider with playback, and proportional symbols for layers A to E.
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
    level: 'province', days: '30', week: 0, compare: false, approvedOnly: true, ind: 'cases', symbols: true, vb: null, sel: null, cls: { suspected: true, probable: true, confirmed: true }, geo: {}, open: null };

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

  function collectAll(range) {
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
    return items;
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

  /* ---------- units (official boundaries) ---------- */
  // Indicators shaded on the map. Each counts items of the listed layers in the period.
  var IND = {
    cases: { fr: 'Cas (suspects, probables, confirmés)', en: 'Cases (suspected, probable, confirmed)', layers: ['infection'], ramp: ['#fde4c8', '#f9b77e', '#ef8445', '#cf4f25', '#93270f'] },
    deaths: { fr: 'Décès signalés', en: 'Reported deaths', layers: ['deaths'], ramp: ['#e4e1de', '#beb5ad', '#8f8178', '#5f5049', '#2d2420'] },
    alerts: { fr: 'Alertes et évènements communautaires', en: 'Community alerts and events', layers: ['alerts', 'cluster', 'burial'], ramp: ['#d9e6f2', '#a6c3de', '#6c9bc5', '#38709f', '#0f3d5e'] },
    contacts: { fr: 'Contacts enregistrés', en: 'Contacts registered', layers: ['contacts'], ramp: ['#d6eee7', '#9bd4c3', '#5bb29d', '#2a8771', '#0c584a'] }
  };
  var BREAKS = [1, 3, 6, 11, 21];
  var BREAK_LBL = ['1–2', '3–5', '6–10', '11–20', '21+'];
  function klass(v) { if (!v) return -1; for (var i = BREAKS.length - 1; i >= 0; i--) if (v >= BREAKS[i]) return i; return -1; }

  var UNITS = {}; // key -> { key, level, name, prov, code, feature, d, box }
  function geoPath(geom) {
    var polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    return polys.map(function (poly) { return poly.map(function (ring) { return 'M' + ring.map(function (pt) { var p = proj(pt[0], pt[1]); return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join('L') + 'Z'; }).join(''); }).join('');
  }
  function geoBox(geom) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    (geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates).forEach(function (poly) { poly[0].forEach(function (pt) { var p = proj(pt[0], pt[1]); b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); }); });
    return b;
  }
  if (BND) {
    (BND.provinces ? BND.provinces.features : []).forEach(function (f, i) {
      if (!f.geometry) return;
      var key = f.properties.id ? 'P:' + f.properties.id : 'XP:' + i;
      UNITS[key] = { key: key, level: 'province', id: f.properties.id, fname: f.properties.name, feature: f };
    });
    (BND.zones ? BND.zones.features : []).forEach(function (f, i) {
      if (!f.geometry) return;
      var key = f.properties.id ? 'Z:' + f.properties.id : 'X:' + i;
      UNITS[key] = { key: key, level: 'zone', id: f.properties.id, fname: f.properties.name, prov: f.properties.p, code: f.properties.code, feature: f };
    });
  }
  function unitD(u) { if (!u.d) { u.d = geoPath(u.feature.geometry); u.box = geoBox(u.feature.geometry); } return u.d; }
  function unitName(u) {
    if (u.level === 'province') return u.id ? B.nm(B.G.provinces, u.id) : u.fname;
    return u.id ? B.nm(B.G.zones, u.id) : u.fname;
  }
  function unitAka(u) { var z = u.id && u.level === 'zone' && B.byId(B.G.zones, u.id); return z && z.aka ? L('aussi écrit ', 'also written ') + z.aka : ''; }
  function unitProv(u) {
    if (u.level === 'province') return '';
    if (u.id) { var z = B.byId(B.G.zones, u.id); return z ? B.nm(B.G.provinces, z.province) : ''; }
    return u.prov || '';
  }
  // Key of the unit an item belongs to at a level (province of a zone = current confirmed/proposed link).
  function unitKey(geo, level) {
    if (!geo || !geo.zone) return null;
    var z = B.byId(B.G.zones, geo.zone); if (!z) return null;
    if (level === 'zone') return 'Z:' + z.id;
    return z.province && z.province !== 'P-tbc' ? 'P:' + z.province : null;
  }
  function values(items, level) {
    var out = {};
    Object.keys(IND).forEach(function (ind) { out[ind] = {}; });
    items.forEach(function (it) {
      var k = unitKey(it.geo, level); if (!k) return;
      Object.keys(IND).forEach(function (ind) { if (IND[ind].layers.indexOf(it.layer) >= 0) out[ind][k] = (out[ind][k] || 0) + it.n; });
    });
    return out;
  }

  /* ---------- base map (built once, then only restyled) ---------- */
  var baseCache = null;
  function baseLayers() {
    if (baseCache) return baseCache;
    var prov = '', zone = '', borders = '';
    Object.keys(UNITS).forEach(function (k) {
      var u = UNITS[k], d = unitD(u);
      if (u.level === 'province') { prov += '<path class="u up" data-u="' + k + '" d="' + d + '"/>'; borders += '<path d="' + d + '"/>'; }
      else zone += '<path class="u uz' + (u.id ? '' : ' other') + '" data-u="' + k + '" d="' + d + '"/>';
    });
    baseCache = '<path d="' + outlinePath + '" class="drc"/><g class="gprov">' + prov + '</g><g class="gzone">' + zone + '</g><g class="gborder">' + borders + '</g>';
    return baseCache;
  }

  /* ---------- view state ---------- */
  function vbox() { return mf.vb || { x: 0, y: 0, w: W, h: H }; }
  function zoomScale() { return W / vbox().w; }
  function clampVB(b) {
    var w = Math.max(W / 60, Math.min(W, b.w)), h = w * H / W;
    if (w >= W - 0.01) return { x: 0, y: 0, w: W, h: H }; // whole country: always centred
    var x = Math.max(-W * 0.1, Math.min(W * 1.1 - w, b.x)), y = Math.max(-H * 0.1, Math.min(H * 1.1 - h, b.y));
    return { x: x, y: y, w: w, h: h };
  }

  function glyphLayer(agg, prevAgg, interactive) {
    var s = 1 / zoomScale(), out = ''; // constant size on screen
    Object.keys(agg.groups).forEach(function (key) {
      var g = agg.groups[key], p = proj(g.anchor.lon, g.anchor.lat), ls = Object.keys(g.layers).filter(function (l) { return l !== 'increase'; });
      if (g.layers.increase) out += glyph('ring', p[0], p[1], 6 * s, LAYERS.increase.color, ' vector-effect="non-scaling-stroke"');
      ls.forEach(function (l, i) {
        var ang = ls.length === 1 ? 0 : (2 * Math.PI * i / ls.length) - Math.PI / 2, off = (ls.length === 1 ? 0 : Math.max(14, 6 * ls.length)) * s;
        var x = p[0] + off * Math.cos(ang), y = p[1] + off * Math.sin(ang), n = g.layers[l], r = Math.min(4 + Math.sqrt(n) * 1.5, 12) * s;
        var color = LAYERS[l].color;
        if (l === 'infection') { var c = { suspected: 0, probable: 0, confirmed: 0 }; g.items.forEach(function (it) { if (it.layer === 'infection') c[it.cls]++; }); color = c.confirmed ? CLS_COLOR.confirmed : (c.probable ? CLS_COLOR.probable : CLS_COLOR.suspected); }
        var delta = prevAgg && prevAgg.groups[key] ? n - (prevAgg.groups[key].layers[l] || 0) : (prevAgg ? n : null);
        out += '<g class="mk"' + (interactive ? ' data-mk="' + esc(key) + '" tabindex="0"' : '') + '>' + glyph(LAYERS[l].shape, +x.toFixed(2), +y.toFixed(2), +r.toFixed(2), color, ' vector-effect="non-scaling-stroke"') +
          '<title>' + esc(g.anchor.label + ' - ' + L(LAYERS[l].fr, LAYERS[l].en) + ' : ' + n + (delta != null ? ' (Δ ' + (delta >= 0 ? '+' : '') + delta + ')' : '')) + '</title></g>';
      });
    });
    return out;
  }
  function labelLayer(vals) {
    if (!BND) return '';
    var z = zoomScale(), fs = 11 / z, out = '';
    Object.keys(UNITS).forEach(function (k) {
      var u = UNITS[k], c = u.feature.properties.c; if (!c) return;
      var show = u.level === 'province' ? (mf.level === 'province' || z < 3) : (mf.level === 'zone' && z >= 2.2 && (vals[k] || k === mf.sel || z >= 6));
      if (!show) return;
      var p = proj(c[0], c[1]);
      out += '<text x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '" class="ulbl ' + (u.level === 'province' ? 'lp' : 'lz') + '" font-size="' + (u.level === 'province' ? fs * 1.05 : fs * 0.95).toFixed(2) + '">' + esc(unitName(u)) + '</text>';
    });
    return out;
  }
  function selOutline() {
    var u = mf.sel && UNITS[mf.sel];
    return u ? '<path class="selo" d="' + unitD(u) + '" vector-effect="non-scaling-stroke"/>' : '';
  }

  // Static SVG (dashboard overview): health zones shaded by cases, province borders and names.
  // Label placement without overlaps (approximate text boxes in map units).
  function placeLabels(list, fs) {
    var boxes = [], out = '';
    list.forEach(function (l) {
      var w = l.text.length * fs * 0.52, h = fs * 1.1, b = [l.x - w / 2, l.y - h / 2, l.x + w / 2, l.y + h / 2];
      if (boxes.some(function (o) { return b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]; })) return;
      boxes.push(b);
      out += '<text class="ulbl ' + l.cls + '" x="' + l.x.toFixed(1) + '" y="' + l.y.toFixed(1) + '" font-size="' + fs.toFixed(2) + '">' + esc(l.text) + '</text>';
    });
    return out;
  }
  // Box (map units) around the zones with a value, for the "affected area" panel.
  function affectedBox(vals) {
    var b = null;
    Object.keys(vals).forEach(function (k) { var u = UNITS[k]; if (!u || !vals[k]) return; unitD(u); b = b ? [Math.min(b[0], u.box[0]), Math.min(b[1], u.box[1]), Math.max(b[2], u.box[2]), Math.max(b[3], u.box[3])] : u.box.slice(); });
    if (!b) return null;
    var cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, w = Math.max(b[2] - b[0], b[3] - b[1], 50) * 1.6;
    return { x: cx - w / 2, y: cy - w / 2, w: w, h: w };
  }
  function staticSVG(vals, vb) {
    var z = vb ? W / vb.w : 1;
    var out = '<svg class="dmap" viewBox="' + (vb ? [vb.x, vb.y, vb.w, vb.h].map(function (n) { return n.toFixed(1); }).join(' ') : '0 0 ' + W + ' ' + H) + '" role="img" aria-label="' + (vb ? L('Zone touchée : cas par zone de santé', 'Affected area: cases by health zone') : L('Carte de la RDC : cas par zone de santé', 'Map of the DRC: cases by health zone')) + '"><path d="' + outlinePath + '" class="drc"/>';
    if (!BND) {
      Object.keys(GD.provinces).forEach(function (pn) { var gp = GD.provinces[pn]; if (gp.lat == null) return; var p = proj(gp.lon, gp.lat); out += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="1.6" class="refpt"/>'; });
      return out + '</svg>';
    }
    var zones = '', borders = '', zl = [], pl = [];
    Object.keys(UNITS).forEach(function (k) {
      var u = UNITS[k], c = u.feature.properties.c, p = c && proj(c[0], c[1]);
      if (u.level === 'zone') {
        var n = vals.cases[k] || 0, ci = klass(n);
        zones += '<path class="uz' + (u.id ? '' : ' other') + '" d="' + unitD(u) + '"' + (ci >= 0 ? ' style="fill:' + IND.cases.ramp[ci] + '"' : '') + '>' + (ci >= 0 ? '<title>' + esc(unitName(u) + ' : ' + n) + '</title>' : '') + '</path>';
        if (vb && p && p[0] > vb.x && p[0] < vb.x + vb.w && p[1] > vb.y && p[1] < vb.y + vb.h) zl.push({ x: p[0], y: p[1], text: unitName(u) + (n ? ' (' + n + ')' : ''), cls: 'lz', n: n });
      } else {
        borders += '<path d="' + unitD(u) + '"/>';
        if (p) pl.push({ x: p[0], y: p[1], text: unitName(u), cls: 'lp' });
      }
    });
    zl.sort(function (a, b) { return b.n - a.n; });
    var labels = vb ? placeLabels(zl, 15 / z) : placeLabels(pl, 15);
    return out + '<g class="gzone">' + zones + '</g><g class="gborder">' + borders + '</g>' + labels + '</svg>';
  }

  function legend() {
    return '<div class="mlegend">' + Object.keys(LAYERS).map(function (l) {
      var Lr = LAYERS[l];
      return '<label class="check"><input type="checkbox" data-layer="' + l + '"' + (mf.layers[l] ? ' checked' : '') + '><svg width="22" height="22" viewBox="0 0 22 22">' + glyph(Lr.shape === 'ring' ? 'ring' : Lr.shape, 11, 11, Lr.shape === 'ring' ? -2 : 6, Lr.color) + '</svg> <b>' + Lr.group + '</b> ' + esc(L(Lr.fr, Lr.en)) + '</label>';
    }).join('') + '<div class="small">' + L('Couleur des cas : ', 'Case colour: ') + '<span style="color:' + CLS_COLOR.suspected + '">● ' + L('suspect', 'suspected') + '</span> <span style="color:' + CLS_COLOR.probable + '">● ' + L('probable', 'probable') + '</span> <span style="color:' + CLS_COLOR.confirmed + '">● ' + L('confirmé', 'confirmed') + '</span></div></div>';
  }
  function scaleLegend() {
    var r = IND[mf.ind].ramp;
    return '<div class="mscale"><b>' + esc(L(IND[mf.ind].fr, IND[mf.ind].en)) + '</b><div class="mscale-row"><span class="sw sw0"></span><span>0</span>' +
      r.map(function (c, i) { return '<span class="sw" style="background:' + c + '"></span><span>' + BREAK_LBL[i] + '</span>'; }).join('') + '</div></div>';
  }

  // Weekly series of the current indicator for one unit (12 weeks ending at the end of the period).
  function weekly(key, level) {
    var end = windowRange()[1], out = [];
    for (var w = 11; w >= 0; w--) {
      var r = [new Date(end - (w + 1) * 7 * DAY), new Date(end - w * 7 * DAY)], n = 0;
      collectAll(r).forEach(function (it) { if (IND[mf.ind].layers.indexOf(it.layer) >= 0 && unitKey(it.geo, level) === key) n += it.n; });
      out.push({ end: r[1], n: n });
    }
    return out;
  }
  function spark(series) {
    var mx = Math.max.apply(null, series.map(function (s) { return s.n; }).concat([1])), bw = 14, h = 54;
    return '<svg class="spark" viewBox="0 0 ' + (series.length * bw) + ' ' + (h + 14) + '" role="img" aria-label="' + L('Tendance hebdomadaire', 'Weekly trend') + '">' +
      series.map(function (s, i) { var bh = s.n ? Math.max(2, s.n / mx * h) : 0; return '<rect x="' + (i * bw + 2) + '" y="' + (h - bh) + '" width="' + (bw - 4) + '" height="' + bh + '"><title>' + B.fmtD(s.end.toISOString()) + ' : ' + s.n + '</title></rect>'; }).join('') +
      '<line x1="0" x2="' + series.length * bw + '" y1="' + h + '" y2="' + h + '"/><text x="0" y="' + (h + 11) + '">' + B.fmtD(series[0].end.toISOString()).slice(0, 5) + '</text><text x="' + series.length * bw + '" y="' + (h + 11) + '" text-anchor="end">' + B.fmtD(series[series.length - 1].end.toISOString()).slice(0, 5) + '</text></svg>';
  }

  /* ---------- main view ---------- */
  var cur = null; // { v, range, items, agg, prevAgg, vals, prevVals }
  var playTimer = null;

  B.VIEWS.map = function (v) {
    if (playTimer && !document.body.contains(v)) { clearInterval(playTimer); playTimer = null; }
    var agOnly = B.can('aggregate_only');
    var searchList = Object.keys(UNITS).filter(function (k) { return UNITS[k].level === 'province' || UNITS[k].id || true; }).map(function (k) { var u = UNITS[k]; return '<option value="' + esc(unitName(u) + (u.level === 'zone' ? ' (' + L('ZS', 'HZ') + (unitProv(u) ? ', ' + unitProv(u) : '') + ')' : ' (' + L('province', 'province') + ')')) + '" data-k="' + k + '"></option>' + (unitAka(u) ? '<option value="' + esc(B.byId(B.G.zones, u.id).aka + ' (' + L('ZS', 'HZ') + ', ' + unitProv(u) + ')') + '" data-k="' + k + '"></option>' : ''); }).join('');
    v.innerHTML = '<section class="card mapcard"><div class="mhead"><div><p class="eyebrow">' + L('Surveillance', 'Surveillance') + '</p><h2>' + L('Carte de surveillance épidémiologique', 'Epidemiological surveillance map') + '</h2></div>' +
      (BND ? '<label class="msearch">' + L('Aller à', 'Go to') + ' <input id="msearch" list="munits" placeholder="' + L('province ou zone de santé', 'province or health zone') + '" autocomplete="off"><datalist id="munits">' + searchList + '</datalist></label>' : '') + '</div>' +
      '<div class="vbar mtools">' +
      (BND ? '<label class="inl">' + L('Indicateur', 'Indicator') + ' <select id="mind">' + Object.keys(IND).map(function (k) { return '<option value="' + k + '"' + (mf.ind === k ? ' selected' : '') + '>' + esc(L(IND[k].fr, IND[k].en)) + '</option>'; }).join('') + '</select></label>' : '') +
      '<label class="inl">' + L('Niveau', 'Level') + ' <select id="mlevel"><option value="province">' + L('Provinces', 'Provinces') + '</option><option value="zone"' + (mf.level === 'zone' ? ' selected' : '') + '>' + L('Zones de santé', 'Health zones') + '</option></select></label>' +
      '<label class="inl">' + B.t('period') + ' <select id="mdays">' + ['7', '14', '30', '90', 'all'].map(function (x) { return '<option value="' + x + '"' + (mf.days === x ? ' selected' : '') + '>' + (x === 'all' ? B.t('all') : x + ' ' + B.t('days')) + '</option>'; }).join('') + '</select></label>' +
      '<label class="check"><input type="checkbox" id="mappr"' + (mf.approvedOnly ? ' checked' : '') + '> ' + L('Signalements approuvés seulement', 'Approved reports only') + '</label>' +
      '<label class="check"><input type="checkbox" id="mcomp"' + (mf.compare ? ' checked' : '') + '> ' + L('Comparer à la période précédente', 'Compare with previous period') + '</label></div>' +
      '<div class="mtime"><button class="sm" id="mplay" type="button" aria-pressed="false">' + L('Lecture', 'Play') + '</button><input type="range" id="mweek" min="0" max="11" value="' + mf.week + '" aria-label="' + L('Fin de période', 'End of period') + '"><span id="mweeklbl"></span></div>' +
      '<details class="mfilter"><summary>' + L('Filtrer par zone géographique et classification', 'Filter by area and classification') + '</summary><div data-geoholder="m_">' + B.geoFields('m_', mf.geo, false, B.t('all')) + '</div>' +
      '<div class="vbar small">' + L('Classification : ', 'Classification: ') + ['suspected', 'probable', 'confirmed'].map(function (c) { return '<label class="check"><input type="checkbox" data-cls="' + c + '"' + (mf.cls[c] ? ' checked' : '') + '> ' + esc(B.L.apply(null, B.CLASS[c])) + '</label>'; }).join('') + '</div></details>' +
      '<div class="mapwrap"><div class="mapbox" id="mapbox">' +
      '<svg class="dmap zm lvl-' + mf.level + '" id="msvg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + L('Carte de la RDC', 'Map of the DRC') + '">' + baseLayers() + '<g id="msel"></g><g id="mglyph"></g><g id="mlabels"></g></svg>' +
      '<div class="mzoom" role="group" aria-label="' + L('Zoom', 'Zoom') + '"><button type="button" data-z="in" title="' + L('Zoom avant', 'Zoom in') + '">+</button><button type="button" data-z="out" title="' + L('Zoom arrière', 'Zoom out') + '">−</button><button type="button" data-z="reset" title="' + L('Vue entière', 'Whole country') + '"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></button>' +
      (document.fullscreenEnabled ? '<button type="button" data-z="full" title="' + L('Plein écran', 'Full screen') + '"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M1 5V1h4M15 5V1h-4M1 11v4h4M15 11v4h-4M5 5h6v6H5z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button>' : '') + '</div>' +
      '<div class="mtip" id="mtip" hidden></div><div id="mscale"></div></div>' +
      '<aside class="mside"><div id="mpanel"></div><details class="msym"' + (BND ? '' : ' open') + '><summary>' + L('Symboles (couches A à E)', 'Symbols (layers A to E)') + '</summary><label class="check"><input type="checkbox" id="msymon"' + (mf.symbols ? ' checked' : '') + '> ' + L('Afficher les symboles', 'Show symbols') + '</label>' + legend() + '</details></aside></div>' +
      '<p class="small" id="msum"></p><div id="mdetail"></div><div id="mextra"></div>' +
      (B.can('reports') ? '<div class="vbar"><button class="sm" id="mcsv">' + L('Télécharger (CSV)', 'Download (CSV)') + '</button><button class="sm" id="mxlsx">Excel</button><button class="sm" id="mpdf">PDF</button></div>' : '') +
      '<p class="muted small">' + (BND ? L('Chaque unité est colorée selon le total de l\'indicateur dans la période. Les symboles sont des totaux par unité, placés au centre de sa limite officielle : ce n\'est PAS l\'emplacement d\'un ménage, d\'une tombe ou d\'une FOSA. Survolez ou touchez une unité pour les détails ; molette, glisser ou pincer pour zoomer.', 'Each unit is shaded by the indicator\'s total in the period. Symbols are totals per unit, drawn at the centre of its official boundary: NOT the location of a household, grave or facility. Hover over or tap a unit for details; scroll, drag or pinch to zoom.') : L('Chaque symbole = total pour une unité administrative, placé au point de référence de cette unité (GeoNames). Ce n\'est PAS l\'emplacement exact d\'un ménage, d\'une tombe ou d\'une FOSA.', 'Each symbol = total for an administrative unit, drawn at its reference point (GeoNames). It is NOT the exact location of a household, grave or facility.')) + '</p>' +
      '<p class="muted small">' + esc(GD.attribution) + ' ' + (BND ? L('Limites : ', 'Boundaries: ') + esc(Object.keys(BND.sources || {}).map(function (k) { return BND.sources[k]; }).filter(function (x, i, a) { return a.indexOf(x) === i; }).join(', ')) + ' (' + L('importé le ', 'imported ') + esc(BND.generated) + ').' : esc(GD.boundaries_note)) + (agOnly ? ' ' + L('Vue agrégée.', 'Aggregated view.') : '') + '</p></section>';

    cur = { v: v };
    var svgEl = B.$('#msvg', v);
    setVB(mf.vb || { x: 0, y: 0, w: W, h: H }, true);
    draw();

    B.bindGeo(v.querySelector('[data-geoholder="m_"]').parentNode, 'm_', false, B.t('all'), function (g) { mf.geo = g; draw(); });
    var redraw = function (fn) { return function () { fn.call(this); draw(); }; };
    if (B.$('#mind', v)) B.$('#mind', v).onchange = redraw(function () { mf.ind = this.value; });
    B.$('#mlevel', v).onchange = function () { mf.level = this.value; mf.sel = null; mf.open = null; svgEl.setAttribute('class', 'dmap zm lvl-' + mf.level); draw(); };
    B.$('#mdays', v).onchange = redraw(function () { mf.days = this.value; });
    B.$('#mweek', v).oninput = redraw(function () { mf.week = +this.value; });
    B.$('#mcomp', v).onchange = redraw(function () { mf.compare = this.checked; });
    B.$('#mappr', v).onchange = redraw(function () { mf.approvedOnly = this.checked; });
    B.$('#msymon', v).onchange = redraw(function () { mf.symbols = this.checked; });
    B.$$('[data-layer]', v).forEach(function (c) { c.onchange = redraw(function () { mf.layers[c.getAttribute('data-layer')] = c.checked; }); });
    B.$$('[data-cls]', v).forEach(function (c) { c.onchange = redraw(function () { mf.cls[c.getAttribute('data-cls')] = c.checked; }); });
    B.$('#mplay', v).onclick = function () { togglePlay(); };
    if (B.$('#msearch', v)) B.$('#msearch', v).onchange = function () {
      var val = this.value, opt = [].filter.call(B.$('#munits', v).options, function (o) { return o.value === val; })[0];
      if (!opt) return;
      var k = opt.getAttribute('data-k'), u = UNITS[k];
      if (u.level === 'zone' && mf.level !== 'zone') { mf.level = 'zone'; B.$('#mlevel', v).value = 'zone'; svgEl.setAttribute('class', 'dmap zm lvl-zone'); }
      if (u.level === 'province' && mf.level !== 'province') { mf.level = 'province'; B.$('#mlevel', v).value = 'province'; svgEl.setAttribute('class', 'dmap zm lvl-province'); }
      select(k); zoomTo(k); this.value = '';
    };
    bindZoom(svgEl);
    B.$$('[data-z]', v).forEach(function (b) {
      b.onclick = function () {
        var z = b.getAttribute('data-z'), c = vbox();
        if (z === 'in') zoomAt(1.6, c.x + c.w / 2, c.y + c.h / 2);
        else if (z === 'out') zoomAt(1 / 1.6, c.x + c.w / 2, c.y + c.h / 2);
        else if (z === 'reset') setVB({ x: 0, y: 0, w: W, h: H });
        else if (z === 'full') { var box = B.$('#mapbox', v); if (document.fullscreenElement) document.exitFullscreen(); else if (box.requestFullscreen) box.requestFullscreen(); }
      };
    });
    var ex = function (fmt) { if (B.exportTable) { B.exportTable(fmt, 'carte_surveillance', L('Rapport géographique de surveillance', 'Geographical surveillance report'), exportRows(cur.agg, cur.vals)); B.audit('download', 'map', fmt, Object.keys(cur.agg.groups).length + ' units'); } };
    if (B.$('#mcsv', v)) { B.$('#mcsv', v).onclick = function () { ex('csv'); }; B.$('#mxlsx', v).onclick = function () { ex('xlsx'); }; B.$('#mpdf', v).onclick = function () { ex('pdf'); }; }
  };

  function draw() {
    var v = cur && cur.v; if (!v || !document.body.contains(v)) return;
    var range = windowRange(), all = collectAll(range), items = all.filter(function (it) { return mf.layers[it.layer]; });
    var agg = aggregate(items), prevAgg = null, prevAll = null;
    if (mf.days !== 'all') { var len = range[1] - range[0]; prevAll = collectAll([new Date(range[0] - len), range[0]]); }
    if (mf.compare && prevAll) prevAgg = aggregate(prevAll.filter(function (it) { return mf.layers[it.layer]; }));
    var vals = values(all, mf.level), prevVals = prevAll ? values(prevAll, mf.level) : null;
    Object.assign(cur, { range: range, items: items, agg: agg, prevAgg: prevAgg, vals: vals, prevVals: prevVals });

    // shading
    var ramp = IND[mf.ind].ramp, iv = vals[mf.ind];
    B.$$('#msvg .u', v).forEach(function (p) {
      var k = p.getAttribute('data-u'), act = (mf.level === 'zone') === p.classList.contains('uz');
      var ci = act ? klass(iv[k]) : -1;
      p.style.fill = ci >= 0 ? ramp[ci] : '';
      p.classList.toggle('sel', k === mf.sel);
    });
    B.$('#mscale', v).innerHTML = BND ? scaleLegend() : '';
    redrawOverlays();
    var lbl = B.$('#mweeklbl', v);
    lbl.textContent = B.fmtD(range[0].toISOString()) + ' → ' + B.fmtD(range[1].toISOString()) + (mf.week ? ' (' + mf.week + L(' sem. avant aujourd\'hui)', ' wk before today)') : '');
    B.$('#mweek', v).value = mf.week;

    // summary line, unmapped, comparison
    var tot = {}; items.forEach(function (it) { tot[it.layer] = (tot[it.layer] || 0) + it.n; });
    B.$('#msum', v).textContent = Object.keys(tot).map(function (l) { return L(LAYERS[l].fr, LAYERS[l].en) + ' ' + tot[l]; }).join(' · ');
    var unplacedKeys = Object.keys(agg.unplaced);
    B.$('#mextra', v).innerHTML = (unplacedKeys.length ? '<details class="card inner"><summary>' + L('Non cartographiés (pas de point de référence vérifié) : ', 'Not mapped (no verified reference point): ') + unplacedKeys.length + L(' zone(s)', ' zone(s)') + '</summary><table class="tbl small"><tr><th>' + L('Zone', 'Zone') + '</th><th>' + L('Couches', 'Layers') + '</th></tr>' + unplacedKeys.map(function (k) { return '<tr><td>' + esc(k) + '</td><td>' + Object.keys(agg.unplaced[k]).map(function (l) { return esc(L(LAYERS[l].fr, LAYERS[l].en)) + ' ' + agg.unplaced[k][l]; }).join(' · ') + '</td></tr>'; }).join('') + '</table></details>' : '') +
      (prevAgg ? compareTable(agg, prevAgg) : '') + rankTable(vals, prevVals);
    B.$$('[data-rank]', v).forEach(function (r) { r.onclick = function () { var k = r.getAttribute('data-rank'); select(k); zoomTo(k); B.$('#mapbox', v).scrollIntoView({ block: 'nearest' }); }; });
    panel();
    if (mf.open && agg.groups[mf.open]) detail(v, agg, prevAgg); else B.$('#mdetail', v).innerHTML = '';
  }

  function rankTable(vals, prevVals) {
    var iv = vals[mf.ind], keys = Object.keys(iv).filter(function (k) { return iv[k]; }).sort(function (a, b) { return iv[b] - iv[a]; });
    if (!keys.length) return '';
    return '<details class="card inner"' + (keys.length ? ' open' : '') + '><summary>' + L('Unités par ', 'Units by ') + esc(L(IND[mf.ind].fr, IND[mf.ind].en).toLowerCase()) + ' (' + keys.length + ')</summary><div class="scroll"><table class="tbl small mrank"><tr><th>' + L('Unité', 'Unit') + '</th><th>' + L('Province', 'Province') + '</th>' + Object.keys(IND).map(function (k) { return '<th' + (k === mf.ind ? ' class="hl"' : '') + '>' + esc(L(IND[k].fr, IND[k].en)) + '</th>'; }).join('') + (prevVals ? '<th>' + L('Évolution', 'Change') + '</th>' : '') + '</tr>' +
      keys.map(function (k) {
        var u = UNITS[k], nmU = u ? unitName(u) : (k.charAt(0) === 'Z' ? B.nm(B.G.zones, k.slice(2)) : B.nm(B.G.provinces, k.slice(2)));
        var pr = u ? unitProv(u) : '', d = prevVals ? iv[k] - (prevVals[mf.ind][k] || 0) : null;
        return '<tr data-rank="' + esc(k) + '" class="' + (k === mf.sel ? 'on' : '') + '"><td><b>' + esc(nmU) + '</b></td><td>' + esc(pr) + '</td>' + Object.keys(IND).map(function (i2) { return '<td>' + (vals[i2][k] || 0) + '</td>'; }).join('') + (prevVals ? '<td>' + (d > 0 ? '<span class="up">+' + d + '</span>' : d) + '</td>' : '') + '</tr>';
      }).join('') + '</table></div></details>';
  }

  function redrawOverlays() {
    var v = cur && cur.v; if (!v || !cur.agg) return;
    B.$('#mglyph', v).innerHTML = mf.symbols ? glyphLayer(cur.agg, cur.prevAgg, true) : '';
    B.$('#mlabels', v).innerHTML = labelLayer(cur.vals[mf.ind]);
    B.$('#msel', v).innerHTML = selOutline();
    B.$$('#mglyph [data-mk]', v).forEach(function (g) {
      var open = function () { mf.open = g.getAttribute('data-mk'); select(mf.open, true); detail(v, cur.agg, cur.prevAgg); };
      g.onclick = function (e) { e.stopPropagation(); open(); };
      g.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
    });
  }

  function panel() {
    var v = cur.v, box = B.$('#mpanel', v), u = mf.sel && UNITS[mf.sel];
    var iv = cur.vals[mf.ind];
    if (!u && !mf.sel) {
      var keys = Object.keys(iv).filter(function (k) { return iv[k]; }), total = keys.reduce(function (s, k) { return s + iv[k]; }, 0);
      box.innerHTML = '<div class="mprof"><p class="eyebrow">' + L('Vue nationale', 'National view') + '</p><div class="mbig">' + total + '</div><p class="small">' + esc(L(IND[mf.ind].fr, IND[mf.ind].en)) + ' · ' + keys.length + ' ' + (mf.level === 'zone' ? L('zone(s) de santé touchée(s)', 'health zone(s) affected') : L('province(s) touchée(s)', 'province(s) affected')) + '</p><p class="muted small">' + L('Sélectionnez une unité sur la carte ou dans le tableau pour voir son profil.', 'Select a unit on the map or in the table to see its profile.') + '</p></div>';
      return;
    }
    var name = u ? unitName(u) : mf.sel, level = u ? u.level : mf.level;
    var series = weekly(mf.sel, level);
    box.innerHTML = '<div class="mprof"><p class="eyebrow">' + (level === 'zone' ? L('Zone de santé', 'Health zone') : L('Province', 'Province')) + '</p><h3>' + esc(name) + '</h3>' +
      '<p class="muted small">' + esc([u ? unitProv(u) : '', u && u.code ? 'P-code ' + u.code : '', u ? unitAka(u) : ''].filter(Boolean).join(' · ')) + (u && !u.id ? '<br>' + L('Hors de la liste fournie : pas de collecte dans ce pilote.', 'Not in the supplied list: no data collected in this pilot.') : '') + '</p>' +
      '<table class="tbl small mfig">' + Object.keys(IND).map(function (k) {
        var a = cur.vals[k][mf.sel] || 0, b = cur.prevVals ? (cur.prevVals[k][mf.sel] || 0) : null;
        return '<tr' + (k === mf.ind ? ' class="hl"' : '') + '><td>' + esc(L(IND[k].fr, IND[k].en)) + '</td><td class="num">' + a + '</td>' + (b != null ? '<td class="num ' + (a > b ? 'up' : 'muted') + '">' + (a - b > 0 ? '+' : '') + (a - b) + '</td>' : '') + '</tr>';
      }).join('') + '</table>' + (cur.prevVals ? '<p class="fine">' + L('Évolution par rapport à la période précédente de même durée.', 'Change against the previous period of the same length.') + '</p>' : '') +
      '<p class="small"><b>' + esc(L(IND[mf.ind].fr, IND[mf.ind].en)) + '</b>, ' + L('12 dernières semaines', 'last 12 weeks') + '</p>' + spark(series) +
      '<div class="vbar"><button class="sm" id="mzoomu" type="button">' + L('Zoomer sur l\'unité', 'Zoom to unit') + '</button>' + (cur.agg.groups[mf.sel] ? '<button class="sm" id="mrecs" type="button">' + L('Voir les enregistrements', 'Show records') + '</button>' : '') + '<button class="sm ghost" id="mclear" type="button">' + L('Fermer', 'Close') + '</button></div></div>';
    B.$('#mzoomu', box).onclick = function () { zoomTo(mf.sel); };
    if (B.$('#mrecs', box)) B.$('#mrecs', box).onclick = function () { mf.open = mf.sel; detail(v, cur.agg, cur.prevAgg); };
    B.$('#mclear', box).onclick = function () { select(null); };
  }

  function select(k, keepDetail) {
    mf.sel = k;
    if (!keepDetail) mf.open = null;
    var v = cur && cur.v; if (!v) return;
    B.$$('#msvg .u', v).forEach(function (p) { p.classList.toggle('sel', p.getAttribute('data-u') === k); });
    B.$('#msel', v).innerHTML = selOutline();
    B.$('#mlabels', v).innerHTML = labelLayer(cur.vals[mf.ind]);
    B.$$('[data-rank]', v).forEach(function (r) { r.classList.toggle('on', r.getAttribute('data-rank') === k); });
    panel();
    if (!keepDetail) B.$('#mdetail', v).innerHTML = '';
  }

  /* ---------- zoom and pan ---------- */
  function setVB(b, silent) {
    mf.vb = clampVB(b);
    var v = cur && cur.v; if (!v) return;
    var s = B.$('#msvg', v); if (!s) return;
    s.setAttribute('viewBox', mf.vb.x.toFixed(2) + ' ' + mf.vb.y.toFixed(2) + ' ' + mf.vb.w.toFixed(2) + ' ' + mf.vb.h.toFixed(2));
    s.style.setProperty('--zs', zoomScale().toFixed(3));
    if (!silent) scheduleOverlay();
  }
  var ovPending = false;
  function scheduleOverlay() { if (ovPending) return; ovPending = true; requestAnimationFrame(function () { ovPending = false; redrawOverlays(); }); }
  function zoomAt(f, px, py) {
    var c = vbox(), w = c.w / f, h = c.h / f;
    setVB({ x: px - (px - c.x) / f, y: py - (py - c.y) / f, w: w, h: h });
  }
  function zoomTo(k) {
    var u = UNITS[k]; if (!u) return;
    unitD(u);
    var b = u.box, bw = Math.max(b[2] - b[0], 24), bh = Math.max(b[3] - b[1], 24), pad = 0.6;
    var w = Math.max(bw * (1 + 2 * pad), bh * (1 + 2 * pad) * W / H), h = w * H / W;
    setVB({ x: (b[0] + b[2]) / 2 - w / 2, y: (b[1] + b[3]) / 2 - h / 2, w: w, h: h });
  }
  function svgPoint(s, cx, cy) {
    var r = s.getBoundingClientRect(), c = vbox();
    // preserveAspectRatio xMidYMid meet: the drawing is centred in the element
    var scale = Math.min(r.width / c.w, r.height / c.h), ox = (r.width - c.w * scale) / 2, oy = (r.height - c.h * scale) / 2;
    return [c.x + (cx - r.left - ox) / scale, c.y + (cy - r.top - oy) / scale, scale];
  }
  function bindZoom(s) {
    var pts = {}, start = null, moved = false, tip = B.$('#mtip', cur.v), box = B.$('#mapbox', cur.v);
    s.addEventListener('wheel', function (e) {
      e.preventDefault();
      var p = svgPoint(s, e.clientX, e.clientY);
      zoomAt(Math.pow(1.0018, -e.deltaY * (e.deltaMode === 1 ? 16 : 1)), p[0], p[1]);
    }, { passive: false });
    s.addEventListener('dblclick', function (e) { e.preventDefault(); var p = svgPoint(s, e.clientX, e.clientY); zoomAt(2, p[0], p[1]); });
    s.addEventListener('pointerdown', function (e) {
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pts);
      if (ids.length === 1) { start = { x: e.clientX, y: e.clientY, vb: vbox() }; moved = false; }
      else if (ids.length === 2) { var a = pts[ids[0]], b = pts[ids[1]]; start = { pinch: Math.hypot(a.x - b.x, a.y - b.y), mid: svgPoint(s, (a.x + b.x) / 2, (a.y + b.y) / 2), vb: vbox() }; moved = true; }
    });
    s.addEventListener('pointermove', function (e) {
      if (pts[e.pointerId]) {
        pts[e.pointerId] = { x: e.clientX, y: e.clientY };
        var ids = Object.keys(pts);
        if (ids.length === 1 && start && !start.pinch) {
          var dx = e.clientX - start.x, dy = e.clientY - start.y;
          if (!moved && Math.hypot(dx, dy) > 4) { moved = true; try { s.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ } s.classList.add('dragging'); tip.hidden = true; }
          if (moved) { var sc = svgPoint(s, 0, 0)[2]; setVB({ x: start.vb.x - dx / sc, y: start.vb.y - dy / sc, w: start.vb.w, h: start.vb.h }); }
          return;
        }
        if (ids.length === 2 && start && start.pinch) {
          var a = pts[ids[0]], b = pts[ids[1]], f = Math.hypot(a.x - b.x, a.y - b.y) / start.pinch;
          var w = start.vb.w / f, h = start.vb.h / f, m = start.mid;
          setVB({ x: m[0] - (m[0] - start.vb.x) / f, y: m[1] - (m[1] - start.vb.y) / f, w: w, h: h });
          return;
        }
      }
      // hover card
      if (e.pointerType === 'touch') return;
      var t = e.target.closest && e.target.closest('[data-u]');
      if (!t) { tip.hidden = true; return; }
      tip.innerHTML = tipHTML(t.getAttribute('data-u'));
      tip.hidden = false;
      var br = box.getBoundingClientRect(), x = e.clientX - br.left + 14, y = e.clientY - br.top + 14;
      if (x + tip.offsetWidth > br.width - 4) x = e.clientX - br.left - tip.offsetWidth - 14;
      if (y + tip.offsetHeight > br.height - 4) y = e.clientY - br.top - tip.offsetHeight - 14;
      tip.style.left = Math.max(4, x) + 'px'; tip.style.top = Math.max(4, y) + 'px';
    });
    var end = function (e) {
      var wasDrag = moved;
      delete pts[e.pointerId];
      if (!Object.keys(pts).length) { s.classList.remove('dragging'); start = null; }
      if (e.type === 'pointerup' && !wasDrag) {
        var mk = e.target.closest && e.target.closest('[data-mk]');
        if (mk) return; // marker click handled by its own handler
        var t = e.target.closest && e.target.closest('[data-u]');
        var k = t ? t.getAttribute('data-u') : null;
        if (k && (mf.level === 'zone') !== (UNITS[k] && UNITS[k].level === 'zone')) k = null;
        select(k && k === mf.sel ? null : k);
        if (e.pointerType === 'touch' && k) { tip.innerHTML = tipHTML(k); tip.hidden = false; tip.style.left = '8px'; tip.style.top = '8px'; }
      }
      moved = false;
    };
    s.addEventListener('pointerup', end);
    s.addEventListener('pointercancel', end);
    s.addEventListener('pointerleave', function () { tip.hidden = true; });
    s.setAttribute('tabindex', '0');
    s.addEventListener('keydown', function (e) {
      var c = vbox(), st = c.w * 0.12;
      var map = { '+': function () { zoomAt(1.4, c.x + c.w / 2, c.y + c.h / 2); }, '=': function () { zoomAt(1.4, c.x + c.w / 2, c.y + c.h / 2); }, '-': function () { zoomAt(1 / 1.4, c.x + c.w / 2, c.y + c.h / 2); },
        ArrowLeft: function () { setVB({ x: c.x - st, y: c.y, w: c.w, h: c.h }); }, ArrowRight: function () { setVB({ x: c.x + st, y: c.y, w: c.w, h: c.h }); },
        ArrowUp: function () { setVB({ x: c.x, y: c.y - st, w: c.w, h: c.h }); }, ArrowDown: function () { setVB({ x: c.x, y: c.y + st, w: c.w, h: c.h }); }, '0': function () { setVB({ x: 0, y: 0, w: W, h: H }); } };
      if (map[e.key]) { e.preventDefault(); map[e.key](); }
    });
  }
  function tipHTML(k) {
    var u = UNITS[k]; if (!u) return '';
    var act = (mf.level === 'zone') === (u.level === 'zone');
    var rows = act ? Object.keys(IND).map(function (i) {
      var a = cur.vals[i][k] || 0, b = cur.prevVals ? (cur.prevVals[i][k] || 0) : null;
      return '<tr' + (i === mf.ind ? ' class="hl"' : '') + '><td>' + esc(L(IND[i].fr, IND[i].en)) + '</td><td class="num">' + a + '</td>' + (b != null ? '<td class="num ' + (a > b ? 'up' : 'muted') + '">' + (a - b > 0 ? '+' : '') + (a - b) + '</td>' : '') + '</tr>';
    }).join('') : '';
    return '<b>' + esc(unitName(u)) + '</b><div class="muted">' + esc([u.level === 'zone' ? L('Zone de santé', 'Health zone') : L('Province', 'Province'), unitProv(u), u.code, unitAka(u)].filter(Boolean).join(' · ')) + '</div>' +
      (u.level === 'zone' && !u.id ? '<div class="muted">' + L('Hors liste fournie : pas de données', 'Not in supplied list: no data') + '</div>' : '') + (rows ? '<table>' + rows + '</table>' : '');
  }

  function togglePlay() {
    var v = cur && cur.v, b = v && B.$('#mplay', v);
    if (playTimer) { clearInterval(playTimer); playTimer = null; if (b) { b.textContent = L('Lecture', 'Play'); b.setAttribute('aria-pressed', 'false'); } return; }
    if (mf.days === 'all') { mf.days = '7'; B.$('#mdays', v).value = '7'; }
    mf.week = 11; draw();
    if (b) { b.textContent = L('Pause', 'Pause'); b.setAttribute('aria-pressed', 'true'); }
    playTimer = setInterval(function () {
      if (!cur || !document.body.contains(cur.v)) { clearInterval(playTimer); playTimer = null; return; }
      if (mf.week <= 0) { togglePlay(); return; }
      mf.week--; draw();
    }, 1100);
  }

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

  // Overview for the dashboard: health zones shaded by cases in the dashboard's filters and period.
  B.mapMini = function () {
    var was = JSON.parse(JSON.stringify(mf)), saveVB = mf.vb;
    mf.week = 0; mf.approvedOnly = !B.st.f.showPending; mf.cls = { suspected: true, probable: true, confirmed: true };
    mf.geo = Object.assign({}, B.st.f); delete mf.geo.days; mf.days = B.st.f.days || '30';
    var vals = values(collectAll(windowRange()), 'zone'), ind = mf.ind; mf.ind = 'cases';
    var nz = Object.keys(vals.cases).filter(function (k) { return vals.cases[k]; }).length;
    var box = BND ? affectedBox(vals.cases) : null;
    var html = '<div class="mapmini' + (box ? ' two' : '') + '"><figure><figcaption>' + L('Pays entier', 'Whole country') + '</figcaption>' + staticSVG(vals) + '</figure>' +
      (box ? '<figure><figcaption>' + L('Zone touchée', 'Affected area') + '</figcaption>' + staticSVG(vals, box) + '</figure>' : '') + '</div>' +
      (BND ? '<div class="mscale-mini">' + scaleLegend() + '</div><p class="small muted">' + nz + ' ' + L('zone(s) de santé avec des cas dans la période.', 'health zone(s) with cases in the period.') + '</p>' : '');
    Object.assign(mf, was); mf.vb = saveVB; mf.ind = ind;
    return html;
  };
  B.mapApi = { anchor: anchor, LAYERS: LAYERS, IND: IND, UNITS: UNITS, state: mf, select: function (k) { select(k); }, zoomTo: function (k) { zoomTo(k); }, values: function () { return cur && cur.vals; } };
})();
