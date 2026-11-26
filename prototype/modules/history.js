/* Historical data import.
 *
 * Earlier surveillance data (from situation reports, DHIS2 exports or old line lists) can be
 * uploaded as CSV or Excel so that trends start before the system was in use.
 *  - Two layouts: weekly counts per health zone (or province), or a case line list.
 *  - A line list is reduced to weekly counts on import. Names and other personal fields are
 *    never read or stored: only date, place, classification and outcome are used.
 *  - Every row is checked: date, province and health zone (against the supplied lists and the
 *    519 zones of the official boundaries), counts. Rejected rows are listed with the reason.
 *  - Each upload is one batch (label, source, who, when); a batch can be withdrawn. Audited.
 * Imported counts appear in the map, the dashboard map and the trend chart below, always shown
 * apart from data recorded in the system.
 */
(function () {
  'use strict';
  var B = window.BDBV, BND = window.BDBV_BOUNDARIES || null;
  var L = function (f, e) { return B.L(f, e); };
  var esc = function (x) { return B.esc(x); };
  var DAY = 86400000;

  var IND = ['suspected', 'probable', 'confirmed', 'deaths', 'alerts', 'contacts'];
  var IND_LBL = {
    suspected: ['Cas suspects', 'Suspected cases'], probable: ['Cas probables', 'Probable cases'], confirmed: ['Cas confirmés', 'Confirmed cases'],
    deaths: ['Décès', 'Deaths'], alerts: ['Alertes communautaires', 'Community alerts'], contacts: ['Contacts enregistrés', 'Contacts registered']
  };
  // Row layout stored in a batch: [week start (Monday, YYYY-MM-DD), province id, zone id, zone P-code, then IND counts]
  var R_WEEK = 0, R_PROV = 1, R_ZONE = 2, R_CODE = 3, R_N = 4;

  /* ---------- column recognition (English and French headings) ---------- */
  var COLS = {
    date: ['week_start', 'week', 'semaine', 'debut_semaine', 'date_debut_semaine', 'epi_week', 'semaine_epi', 'semaine_epidemiologique', 'date', 'date_notification', 'date_de_notification', 'reporting_date', 'date_onset', 'onset_date', 'date_debut_symptomes', 'date_debut', 'date_report'],
    province: ['province', 'dps', 'adm1', 'adm1_name', 'adm1_fr', 'province_name'],
    zone: ['health_zone', 'zone_de_sante', 'zone_sante', 'zone', 'zs', 'adm3', 'adm3_name', 'adm3_fr', 'health_zone_name'],
    suspected: ['suspected', 'suspects', 'cas_suspects', 'suspected_cases', 'nb_suspects'],
    probable: ['probable', 'probables', 'cas_probables', 'probable_cases'],
    confirmed: ['confirmed', 'confirmes', 'cas_confirmes', 'confirmed_cases'],
    deaths: ['deaths', 'deces', 'total_deaths', 'nombre_deces', 'deces_total'],
    alerts: ['alerts', 'alertes', 'community_alerts', 'alertes_communautaires'],
    contacts: ['contacts', 'contacts_listed', 'contacts_enregistres', 'contacts_listes'],
    classification: ['classification', 'case_classification', 'classification_finale', 'case_status', 'statut', 'statut_cas', 'status'],
    outcome: ['outcome', 'issue', 'evolution', 'issue_finale', 'deceased', 'dead', 'decede', 'deces_oui_non']
  };
  var normH = function (s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); };
  var normN = function (s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^(zone de sante|zs|z\.s\.|province|dps|ps)\s+(de |du |d')?/, '').replace(/[^a-z0-9]+/g, ''); };

  function detectColumns(header) {
    var h = header.map(normH), map = {};
    Object.keys(COLS).forEach(function (k) {
      for (var i = 0; i < COLS[k].length; i++) { var j = h.indexOf(COLS[k][i]); if (j >= 0 && Object.keys(map).map(function (x) { return map[x]; }).indexOf(j) < 0) { map[k] = j; break; } }
    });
    return map;
  }

  /* ---------- dates ---------- */
  function toDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return isNaN(v) ? null : new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
    if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * DAY); // Excel serial
    var s = String(v).trim(), m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return new Date(Date.UTC(+m[1], m[2] - 1, +m[3]));
    if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/))) return new Date(Date.UTC(+m[3], m[2] - 1, +m[1])); // DD/MM/YYYY
    if ((m = s.match(/^(\d{4})\s*-?\s*[WSws]\s*(\d{1,2})$/)) || (m = s.match(/^[WSws]\s*(\d{1,2})\s*[-\/ ]\s*(\d{4})$/))) {
      var yr = +(m[1].length === 4 ? m[1] : m[2]), wk = +(m[1].length === 4 ? m[2] : m[1]);
      if (wk < 1 || wk > 53) return null;
      var jan4 = new Date(Date.UTC(yr, 0, 4)), mon1 = new Date(jan4 - ((jan4.getUTCDay() + 6) % 7) * DAY);
      return new Date(mon1.getTime() + (wk - 1) * 7 * DAY);
    }
    return null;
  }
  function weekStart(d) { return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY); }
  function ymdU(d) { return d.toISOString().slice(0, 10); }

  /* ---------- places ---------- */
  var PLACES = null;
  function places() {
    if (PLACES) return PLACES;
    var prov = {}, zones = {};
    B.G.provinces.forEach(function (p) { if (p.placeholder) return; [p.name_fr, p.name_en, p.name].forEach(function (n) { if (n) prov[normN(n)] = p.id; }); });
    var add = function (name, z) { var k = normN(name); (zones[k] = zones[k] || []).push(z); };
    var supplied = {};
    B.G.zones.forEach(function (z) { if (z.supplied) supplied[z.id] = z; });
    if (BND && BND.zones) BND.zones.features.forEach(function (f) {
      var pp = f.properties, pid = prov[normN(pp.p)] || '';
      var z = { id: pp.id || '', code: pp.code || '', prov: pp.id && supplied[pp.id] ? supplied[pp.id].province : pid, name: pp.id ? supplied[pp.id] && supplied[pp.id].name || pp.name : pp.name };
      add(pp.name, z);
      if (pp.id && supplied[pp.id]) { add(supplied[pp.id].name, z); if (supplied[pp.id].aka) add(supplied[pp.id].aka, z); }
    });
    else B.G.zones.forEach(function (z) { if (z.supplied) { add(z.name, { id: z.id, code: '', prov: z.province, name: z.name }); if (z.aka) add(z.aka, { id: z.id, code: '', prov: z.province, name: z.name }); } });
    Object.keys(zones).forEach(function (k) { var seen = {}; zones[k] = zones[k].filter(function (z) { var key = z.id + '|' + z.code; if (seen[key]) return false; seen[key] = 1; return true; }); });
    PLACES = { prov: prov, zones: zones };
    return PLACES;
  }
  function matchPlace(provTxt, zoneTxt) {
    var P = places(), pid = provTxt ? P.prov[normN(provTxt)] : '';
    if (provTxt && !pid) return { err: L('province inconnue : ', 'unknown province: ') + provTxt };
    if (!zoneTxt) return pid ? { prov: pid, zone: '', code: '' } : { err: L('ni province ni zone de santé', 'no province or health zone') };
    var c = P.zones[normN(zoneTxt)] || [];
    if (pid) c = c.filter(function (z) { return z.prov === pid; });
    if (!c.length) return { err: L('zone de santé inconnue : ', 'unknown health zone: ') + zoneTxt + (provTxt ? ' (' + provTxt + ')' : '') };
    if (c.length > 1) return { err: L('zone de santé ambiguë (préciser la province) : ', 'ambiguous health zone (give the province): ') + zoneTxt };
    return { prov: c[0].prov || pid, zone: c[0].id, code: c[0].code };
  }

  /* ---------- parsing ---------- */
  function count(v) {
    if (v == null || v === '') return 0;
    var n = typeof v === 'number' ? v : +String(v).replace(/\s/g, '').replace(',', '.');
    return isFinite(n) && n >= 0 && Math.floor(n) === n ? n : NaN;
  }
  var CLS = function (v) {
    var s = normH(v);
    if (/^(suspect|suspected|suspecte|suspects|suspectes|s)$/.test(s) || /suspect/.test(s)) return 'suspected';
    if (/probab/.test(s) || s === 'p') return 'probable';
    if (/confirm/.test(s) || s === 'c') return 'confirmed';
    return null;
  };
  var DEAD = function (v) { var s = normH(v); return /^(dead|deceased|died|death|decede|decedee|deces|mort|morte|dcd|oui|yes|y|o|1|true)$/.test(s) || /decede|deceased|died|dead/.test(s); };

  // rows: array of arrays (first rows may hold titles). Returns {kind, cols, rows, rejected, excluded}.
  function parse(table) {
    var hi = -1, cols = null;
    for (var i = 0; i < Math.min(table.length, 15); i++) {
      var c = detectColumns(table[i] || []);
      if (c.date != null && (c.zone != null || c.province != null)) { hi = i; cols = c; break; }
    }
    if (hi < 0) return { error: L('En-têtes non reconnus. Il faut au moins une colonne de date (ex. week_start, date) et une colonne province ou health_zone. Utilisez un modèle.', 'Headings not recognised. At least a date column (e.g. week_start, date) and a province or health_zone column are needed. Use a template.') };
    var hasCounts = IND.some(function (k) { return cols[k] != null; });
    var kind = hasCounts ? 'weekly' : 'linelist';
    if (kind === 'linelist' && cols.classification == null) return { error: L('Liste linéaire sans colonne de classification (suspect / probable / confirmé), et aucune colonne de comptage.', 'Line list without a classification column (suspected / probable / confirmed), and no count columns.') };
    var agg = {}, rejected = [], excluded = 0, nIn = 0;
    for (var r = hi + 1; r < table.length; r++) {
      var row = table[r] || [];
      if (!row.some(function (x) { return x !== '' && x != null; })) continue;
      nIn++;
      var line = r + 1, d = toDate(row[cols.date]);
      if (!d) { rejected.push([line, L('date illisible : ', 'unreadable date: ') + (row[cols.date] == null ? '' : row[cols.date])]); continue; }
      if (d > new Date(Date.now() + DAY)) { rejected.push([line, L('date dans le futur', 'date in the future')]); continue; }
      var pl = matchPlace(cols.province != null ? String(row[cols.province] || '').trim() : '', cols.zone != null ? String(row[cols.zone] || '').trim() : '');
      if (pl.err) { rejected.push([line, pl.err]); continue; }
      var vals = [0, 0, 0, 0, 0, 0];
      if (kind === 'weekly') {
        var bad = null;
        IND.forEach(function (k, j) { if (cols[k] == null) return; var n = count(row[cols[k]]); if (isNaN(n)) bad = k + ' = ' + row[cols[k]]; else vals[j] = n; });
        if (bad) { rejected.push([line, L('nombre invalide : ', 'invalid number: ') + bad]); continue; }
      } else {
        var cl = CLS(row[cols.classification]);
        if (!cl) { excluded++; continue; } // not a case (e.g. "non-cas", "négatif"): not counted
        vals[IND.indexOf(cl)] = 1;
        if (cols.outcome != null && DEAD(row[cols.outcome])) vals[3] = 1;
      }
      var wk = ymdU(weekStart(d)), key = wk + '|' + pl.prov + '|' + pl.zone + '|' + pl.code;
      var a = agg[key] = agg[key] || [wk, pl.prov, pl.zone, pl.code, 0, 0, 0, 0, 0, 0];
      vals.forEach(function (n, j) { a[R_N + j] += n; });
    }
    var rows = Object.keys(agg).sort().map(function (k) { return agg[k]; });
    return { kind: kind, cols: cols, header: table[hi], rows: rows, rejected: rejected, excluded: excluded, nIn: nIn };
  }

  // Simple CSV reader (fallback when the Excel library is not loaded): quotes, comma or semicolon.
  function readCSV(text) {
    text = text.replace(/^﻿/, '');
    var head = text.split(/\r?\n/).slice(0, 8).join('\n'), sep = (head.match(/;/g) || []).length > (head.match(/,/g) || []).length ? ';' : (head.match(/\t/g) || []).length > (head.match(/,/g) || []).length ? '\t' : ',';
    var out = [], row = [], cur = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; continue; }
      if (ch === '"') q = true;
      else if (ch === sep) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); out.push(row); row = []; cur = ''; }
      else cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); out.push(row); }
    return out;
  }
  function readFile(file, cb) {
    var r = new FileReader();
    // CSV is read as UTF-8 text (accented names and outcomes such as "Décédé" stay intact).
    if (/\.(csv|txt)$/i.test(file.name) || file.type === 'text/csv') { r.onload = function () { cb(null, readCSV(r.result)); }; r.readAsText(file, 'utf-8'); return; }
    if (!window.XLSX) { cb(L('Bibliothèque Excel non chargée : utilisez un fichier CSV.', 'Excel library not loaded: use a CSV file.')); return; }
    r.onload = function () {
      try {
        var wb = window.XLSX.read(new Uint8Array(r.result), { type: 'array', cellDates: true });
        var ws = wb.Sheets[wb.SheetNames[0]];
        cb(null, window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }));
      } catch (e) { cb(L('Fichier illisible : ', 'Could not read the file: ') + e.message); }
    };
    r.readAsArrayBuffer(file);
  }

  /* ---------- store ---------- */
  function batches() { var d = B.db(); if (!Array.isArray(d.history)) d.history = []; return d.history; }
  function active() { return batches().filter(function (b) { return !b.deleted; }); }
  // Rows of active batches whose week starts inside [from, to].
  B.historyRows = function (range) {
    var out = [], a = range ? ymdU(range[0]) : null, b = range ? ymdU(range[1]) : null;
    active().forEach(function (bt) { (bt.rows || []).forEach(function (r) { if (!range || (r[R_WEEK] >= a && r[R_WEEK] <= b)) out.push(r); }); });
    return out;
  };
  B.historyApi = { IND: IND, R_WEEK: R_WEEK, R_PROV: R_PROV, R_ZONE: R_ZONE, R_CODE: R_CODE, R_N: R_N, parse: parse, readCSV: readCSV, toDate: toDate, batches: batches, active: active };

  function totals(rows) { var t = [0, 0, 0, 0, 0, 0]; rows.forEach(function (r) { for (var j = 0; j < 6; j++) t[j] += r[R_N + j]; }); return t; }
  function saveBatch(p, label, source, fileName) {
    var t = totals(p.rows), weeks = p.rows.map(function (r) { return r[R_WEEK]; }).sort();
    var rec = { id: B.newId('HIS'), kind: p.kind, label: label, source: source, file: fileName, uploaded_at: new Date().toISOString(), uploaded_by: B.user(),
      period: [weeks[0], weeks[weeks.length - 1]], n_rows_in: p.nIn, n_rejected: p.rejected.length, n_excluded: p.excluded, totals: t, rows: p.rows, deleted: false, geo: {} };
    batches().push(rec); B.save();
    B.audit('import', 'history', rec.id, p.rows.length + ' rows, ' + p.kind + ', ' + rec.period.join(' → '));
    return rec;
  }

  /* ---------- trend: imported + recorded in the system, by week ---------- */
  function systemItems(range) { return B.mapApi && B.mapApi.collect ? B.mapApi.collect(range) : []; }
  function sysInd(it, ind) {
    if (ind === 'deaths') return it.layer === 'deaths';
    if (ind === 'alerts') return ['alerts', 'cluster', 'burial'].indexOf(it.layer) >= 0;
    if (ind === 'contacts') return it.layer === 'contacts';
    return it.layer === 'infection' && it.cls === ind;
  }
  var hf = { ind: 'cases', prov: '', zone: '' };
  function inPlace(prov, zone, code) {
    if (hf.zone) return hf.zone.charAt(0) === 'Z' ? zone === hf.zone.slice(2) : code === hf.zone.slice(2);
    if (hf.prov) return prov === hf.prov;
    return true;
  }
  function series() {
    var hist = B.historyRows(null), now = new Date();
    var first = hist.reduce(function (m, r) { return r[R_WEEK] < m ? r[R_WEEK] : m; }, ymdU(weekStart(new Date(now - 12 * 7 * DAY))));
    var start = new Date(first + 'T00:00:00Z'), end = weekStart(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())));
    var weeks = []; for (var t = start.getTime(); t <= end.getTime(); t += 7 * DAY) weeks.push(ymdU(new Date(t)));
    var idx = {}; weeks.forEach(function (w, i) { idx[w] = i; });
    var imp = weeks.map(function () { return 0; }), sys = weeks.map(function () { return 0; });
    var inds = hf.ind === 'cases' ? ['suspected', 'probable', 'confirmed'] : [hf.ind];
    hist.forEach(function (r) {
      if (!inPlace(r[R_PROV], r[R_ZONE], r[R_CODE]) || idx[r[R_WEEK]] == null) return;
      inds.forEach(function (k) { imp[idx[r[R_WEEK]]] += r[R_N + IND.indexOf(k)]; });
    });
    systemItems([start, new Date(end.getTime() + 7 * DAY)]).forEach(function (it) {
      if (!it.date || !inds.some(function (k) { return sysInd(it, k); })) return;
      var z = B.byId(B.G.zones, it.geo && it.geo.zone), prov = z ? z.province : (it.geo && it.geo.province);
      if (!inPlace(prov, it.geo && it.geo.zone, '')) return;
      var w = ymdU(weekStart(new Date(new Date(it.date).toISOString().slice(0, 10) + 'T00:00:00Z')));
      if (idx[w] != null) sys[idx[w]] += it.n;
    });
    return { weeks: weeks, imp: imp, sys: sys };
  }
  function chart(s) {
    var n = s.weeks.length, bw = Math.max(6, Math.min(24, 960 / Math.max(n, 1))), h = 170, top = 12, pad = 30, mx = Math.max.apply(null, s.weeks.map(function (w, i) { return s.imp[i] + s.sys[i]; }).concat([1]));
    var W = n * bw + pad + 6, out = '<svg class="hchart" viewBox="0 ' + (-top) + ' ' + W + ' ' + (h + 30 + top) + '" role="img" aria-label="' + L('Courbe épidémique hebdomadaire', 'Weekly epidemic curve') + '">';
    [0, 0.5, 1].forEach(function (f) { var y = h - f * h; out += '<line class="grid" x1="' + pad + '" x2="' + W + '" y1="' + y + '" y2="' + y + '"/><text class="ax" x="' + (pad - 4) + '" y="' + (y + 3) + '" text-anchor="end">' + Math.round(f * mx) + '</text>'; });
    s.weeks.forEach(function (w, i) {
      var x = pad + i * bw + 1, hi = s.imp[i] / mx * h, hs = s.sys[i] / mx * h;
      var tip = '<title>' + L('Semaine du ', 'Week of ') + B.fmtD(w) + ' : ' + L('importé ', 'imported ') + s.imp[i] + ', ' + L('système ', 'system ') + s.sys[i] + '</title>';
      if (hi) out += '<rect class="bimp" x="' + x + '" y="' + (h - hi).toFixed(1) + '" width="' + (bw - 2) + '" height="' + hi.toFixed(1) + '">' + tip + '</rect>';
      if (hs) out += '<rect class="bsys" x="' + x + '" y="' + (h - hi - hs).toFixed(1) + '" width="' + (bw - 2) + '" height="' + hs.toFixed(1) + '">' + tip + '</rect>';
      if (w.slice(8, 10) <= '07') { var m = w.slice(5, 7); if (i === 0 || m === '01' || (+m % 3 === 1)) out += '<text class="ax" x="' + x + '" y="' + (h + 14) + '">' + (m === '01' || i === 0 ? w.slice(0, 7) : w.slice(5, 7)) + '</text>'; }
    });
    return out + '<line class="base" x1="' + pad + '" x2="' + W + '" y1="' + h + '" y2="' + h + '"/></svg>';
  }

  /* ---------- view ---------- */
  var pending = null; // parsed file awaiting confirmation

  B.VIEWS.history = function (v) {
    var can = B.can('history_import'), list = batches().slice().reverse();
    var provOpts = B.G.provinces.filter(function (p) { return !p.placeholder; }).map(function (p) { return '<option value="' + p.id + '"' + (hf.prov === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('');
    var zoneOpts = (BND && BND.zones ? BND.zones.features : []).filter(function (f) { var P = places(); return !hf.prov || (f.properties.id ? (B.byId(B.G.zones, f.properties.id) || {}).province === hf.prov : P.prov[normN(f.properties.p)] === hf.prov); })
      .map(function (f) { var k = f.properties.id ? 'Z:' + f.properties.id : 'C:' + f.properties.code; return [k, f.properties.id ? B.nm(B.G.zones, f.properties.id) : f.properties.name]; })
      .sort(function (a, b) { return a[1].localeCompare(b[1]); }).map(function (z) { return '<option value="' + z[0] + '"' + (hf.zone === z[0] ? ' selected' : '') + '>' + esc(z[1]) + '</option>'; }).join('');
    var s = series(), tot = s.imp.reduce(function (a, b) { return a + b; }, 0), totS = s.sys.reduce(function (a, b) { return a + b; }, 0);
    v.innerHTML = '<section class="card"><p class="eyebrow">' + L('Surveillance', 'Surveillance') + '</p><h2>' + L('Données historiques', 'Historical data') + '</h2>' +
      '<p class="disclaimer small">' + L('Importez des données antérieures (rapports de situation, exports DHIS2, anciennes listes linéaires) pour voir les tendances avant la mise en service. Seuls des <b>comptages</b> sont conservés : une liste linéaire est réduite à des nombres par semaine et par zone, les noms et autres données personnelles ne sont ni lus ni enregistrés. Les données importées restent distinguées des données saisies dans le système.', 'Import earlier data (situation reports, DHIS2 exports, old line lists) to see trends from before the system was in use. Only <b>counts</b> are kept: a line list is reduced to numbers per week and zone, and names and other personal data are neither read nor stored. Imported data are always shown apart from data recorded in the system.') + (B.serverMode ? ' ' + L('Serveur pilote : n\'importez que des données synthétiques ou déjà publiées.', 'Pilot server: import only synthetic or already published data.') : '') + '</p>' +
      '<h3>' + L('Tendance hebdomadaire', 'Weekly trend') + '</h3>' +
      '<div class="vbar"><label class="inl">' + L('Indicateur', 'Indicator') + ' <select id="hind">' + [['cases', L('Cas (suspects, probables, confirmés)', 'Cases (suspected, probable, confirmed)')]].concat(IND.map(function (k) { return [k, L(IND_LBL[k][0], IND_LBL[k][1])]; })).map(function (o) { return '<option value="' + o[0] + '"' + (hf.ind === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></label>' +
      '<label class="inl">' + L('Province', 'Province') + ' <select id="hprov"><option value="">' + esc(B.t('all')) + '</option>' + provOpts + '</select></label>' +
      '<label class="inl">' + L('Zone de santé', 'Health zone') + ' <select id="hzone"><option value="">' + esc(B.t('all')) + '</option>' + zoneOpts + '</select></label></div>' +
      '<div class="scroll">' + chart(s) + '</div>' +
      '<p class="small"><span class="sw sw-imp"></span> ' + L('Importé', 'Imported') + ' (' + tot + ') &nbsp; <span class="sw sw-sys"></span> ' + L('Saisi dans le système', 'Recorded in the system') + ' (' + totS + ') · ' + s.weeks.length + L(' semaines depuis le ', ' weeks from ') + B.fmtD(s.weeks[0]) + '</p>' +
      (B.can('reports') ? '<div class="vbar"><button class="sm" id="hcsv">' + L('Télécharger la série (CSV)', 'Download the series (CSV)') + '</button></div>' : '') + '</section>' +
      (can ? '<section class="card"><h3>' + L('Importer un fichier', 'Import a file') + '</h3>' +
        '<p class="small">' + L('Formats : CSV, Excel (.xlsx, .xls). Deux présentations sont reconnues automatiquement d\'après les en-têtes (français ou anglais) :', 'Formats: CSV, Excel (.xlsx, .xls). Two layouts are recognised automatically from the headings (English or French):') + '</p><ul class="small">' +
        '<li><b>' + L('Comptages hebdomadaires', 'Weekly counts') + '</b> : week_start, province, health_zone, suspected, probable, confirmed, deaths, alerts, contacts. ' + L('La date peut être un jour de la semaine, JJ/MM/AAAA ou 2025-W07. Zone vide = total de la province.', 'The date can be any day of the week, DD/MM/YYYY or 2025-W07. Empty zone = province total.') + '</li>' +
        '<li><b>' + L('Liste linéaire de cas', 'Case line list') + '</b> : date, province, health_zone, classification (' + L('suspect / probable / confirmé', 'suspected / probable / confirmed') + '), outcome (' + L('décédé ou non', 'died or not') + '). ' + L('Une ligne par cas ; les autres colonnes sont ignorées.', 'One row per case; other columns are ignored.') + '</li></ul>' +
        '<div class="vbar"><button class="sm" id="htplw">' + L('Modèle : comptages hebdomadaires', 'Template: weekly counts') + '</button><button class="sm" id="htpll">' + L('Modèle : liste linéaire', 'Template: line list') + '</button><button class="sm ghost" id="hdemo">' + L('Charger un exemple synthétique', 'Load a synthetic example') + '</button></div>' +
        '<label>' + L('Fichier', 'File') + ' <input type="file" id="hfile" accept=".csv,.xlsx,.xls,text/csv"></label><div id="hprev"></div></section>' : '') +
      '<section class="card"><h3>' + L('Lots importés', 'Imported batches') + ' (' + list.filter(function (b) { return !b.deleted; }).length + ')</h3>' +
      (list.length ? '<div class="scroll"><table class="tbl small"><tr><th>' + L('Lot', 'Batch') + '</th><th>' + L('Source', 'Source') + '</th><th>' + L('Période', 'Period') + '</th><th>' + L('Lignes', 'Rows') + '</th>' + IND.map(function (k) { return '<th>' + esc(L(IND_LBL[k][0], IND_LBL[k][1])) + '</th>'; }).join('') + '<th>' + L('Importé par', 'Imported by') + '</th><th></th></tr>' +
        list.map(function (b) { return '<tr' + (b.deleted ? ' class="muted"' : '') + '><td><b>' + esc(b.label) + '</b><br><code>' + esc(b.id) + '</code></td><td>' + esc(b.source || '-') + '<br><span class="muted">' + esc(b.file ? b.file + ' · ' : '') + (b.kind === 'linelist' ? L('liste linéaire', 'line list') : L('comptages', 'counts')) + '</span></td><td>' + B.fmtD(b.period[0]) + ' → ' + B.fmtD(b.period[1]) + '</td><td>' + b.rows.length + (b.n_rejected ? '<br><span class="flag small">' + b.n_rejected + L(' rejetée(s)', ' rejected') + '</span>' : '') + '</td>' + b.totals.map(function (n) { return '<td class="num">' + n + '</td>'; }).join('') + '<td>' + esc(b.uploaded_by) + '<br><span class="muted">' + B.fmtDT(b.uploaded_at) + '</span></td><td>' + (b.deleted ? L('retiré', 'withdrawn') : (can ? '<button class="sm ghost" data-hdel="' + esc(b.id) + '">' + L('Retirer', 'Withdraw') + '</button>' : '')) + '</td></tr>'; }).join('') + '</table></div>' : '<p class="muted">' + L('Aucune donnée historique importée.', 'No historical data imported yet.') + '</p>') + '</section>';

    B.$('#hind', v).onchange = function () { hf.ind = this.value; B.VIEWS.history(v); };
    B.$('#hprov', v).onchange = function () { hf.prov = this.value; hf.zone = ''; B.VIEWS.history(v); };
    B.$('#hzone', v).onchange = function () { hf.zone = this.value; B.VIEWS.history(v); };
    if (B.$('#hcsv', v)) B.$('#hcsv', v).onclick = function () {
      B.exportTable('csv', 'serie_historique', L('Série hebdomadaire', 'Weekly series'), [[L('Semaine (lundi)', 'Week (Monday)'), L('Importé', 'Imported'), L('Système', 'System'), L('Total', 'Total')]].concat(s.weeks.map(function (w, i) { return [w, s.imp[i], s.sys[i], s.imp[i] + s.sys[i]]; })));
    };
    B.$$('[data-hdel]', v).forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-hdel');
        B.ask(L('Retirer ce lot ? Ses chiffres ne seront plus utilisés. Le retrait est enregistré dans le journal.', 'Withdraw this batch? Its figures will no longer be used. The withdrawal is logged.'), L('Retirer', 'Withdraw'), L('Annuler', 'Cancel'), function () {
          var bt = batches().filter(function (x) { return x.id === id; })[0]; if (!bt) return;
          bt.deleted = true; bt.deleted_at = new Date().toISOString(); bt.deleted_by = B.user(); bt.synced = false; B.save();
          B.audit('withdraw', 'history', id, ''); B.VIEWS.history(v);
        });
      };
    });
    if (!can) return;
    B.$('#htplw', v).onclick = function () {
      B.exportTable('csv', 'modele_comptages_hebdomadaires', '', [['week_start', 'province', 'health_zone', 'suspected', 'probable', 'confirmed', 'deaths', 'alerts', 'contacts'], ['2025-01-06', 'Ituri', 'Aru', 3, 1, 0, 1, 4, 12], ['2025-01-06', 'Ituri', '', 5, 1, 1, 2, 9, 20]]);
    };
    B.$('#htpll', v).onclick = function () {
      B.exportTable('csv', 'modele_liste_lineaire', '', [['date', 'province', 'health_zone', 'classification', 'outcome'], ['2025-01-08', 'Ituri', 'Aru', 'suspected', 'alive'], ['2025-01-09', 'Ituri', 'Aru', 'confirmed', 'died']]);
    };
    B.$('#hdemo', v).onclick = function () { loadExample(); B.VIEWS.history(v); };
    B.$('#hfile', v).onchange = function () {
      var f = this.files && this.files[0], box = B.$('#hprev', v); if (!f) return;
      if (f.size > 20 * 1024 * 1024) { box.innerHTML = '<p class="flag">' + L('Fichier trop volumineux (max. 20 Mo).', 'File too large (max 20 MB).') + '</p>'; return; }
      box.innerHTML = '<p class="muted">' + L('Lecture…', 'Reading…') + '</p>';
      readFile(f, function (err, table) {
        if (err) { box.innerHTML = '<p class="flag">' + esc(err) + '</p>'; return; }
        var p = parse(table);
        if (p.error) { box.innerHTML = '<p class="flag">' + esc(p.error) + '</p>'; return; }
        pending = { p: p, file: f.name };
        preview(v, box);
      });
    };
  };

  function preview(v, box) {
    var p = pending.p, t = totals(p.rows), weeks = p.rows.map(function (r) { return r[R_WEEK]; }).sort();
    var used = Object.keys(p.cols).map(function (k) { return k + ' ← "' + p.header[p.cols[k]] + '"'; });
    box.innerHTML = '<div class="card inner"><h4>' + L('Aperçu avant import', 'Preview before import') + '</h4>' +
      '<p class="small">' + (p.kind === 'linelist' ? L('Liste linéaire', 'Line list') : L('Comptages hebdomadaires', 'Weekly counts')) + ' · ' + L('colonnes : ', 'columns: ') + esc(used.join(', ')) + '</p>' +
      '<p class="small">' + p.nIn + L(' ligne(s) lue(s) → ', ' row(s) read → ') + '<b>' + p.rows.length + '</b>' + L(' ligne(s) semaine × lieu', ' week × place row(s)') + (p.rows.length ? ' · ' + B.fmtD(weeks[0]) + ' → ' + B.fmtD(weeks[weeks.length - 1]) : '') + (p.excluded ? ' · ' + p.excluded + L(' non-cas exclus', ' non-cases left out') : '') + '</p>' +
      '<table class="tbl small"><tr>' + IND.map(function (k) { return '<th>' + esc(L(IND_LBL[k][0], IND_LBL[k][1])) + '</th>'; }).join('') + '</tr><tr>' + t.map(function (n) { return '<td class="num">' + n + '</td>'; }).join('') + '</tr></table>' +
      (p.rejected.length ? '<details' + (p.rows.length ? '' : ' open') + '><summary class="flag">' + p.rejected.length + L(' ligne(s) rejetée(s) (non importées)', ' row(s) rejected (not imported)') + '</summary><table class="tbl small"><tr><th>' + L('Ligne', 'Line') + '</th><th>' + L('Motif', 'Reason') + '</th></tr>' + p.rejected.slice(0, 200).map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + esc(r[1]) + '</td></tr>'; }).join('') + '</table></details>' : '') +
      (p.rows.length ? '<div class="grid"><label>' + L('Nom du lot', 'Batch name') + ' <input id="hlabel" value="' + esc(pending.file.replace(/\.[^.]+$/, '')) + '"></label><label>' + L('Source des données', 'Data source') + ' <input id="hsource" placeholder="' + L('ex. DPS Ituri, rapports de situation 2025', 'e.g. DPS Ituri, situation reports 2025') + '"></label></div>' +
        '<div class="vbar"><button class="primary" id="hok">' + L('Importer ', 'Import ') + p.rows.length + L(' ligne(s)', ' row(s)') + '</button><button class="ghost" id="hcancel">' + L('Annuler', 'Cancel') + '</button></div>' : '') + '</div>';
    if (B.$('#hok', box)) {
      B.$('#hok', box).onclick = function () {
        var label = B.$('#hlabel', box).value.trim() || pending.file, src = B.$('#hsource', box).value.trim();
        var rec = saveBatch(pending.p, label, src, pending.file); pending = null;
        B.notify(L('Lot importé : ', 'Batch imported: ') + rec.rows.length + L(' ligne(s)', ' row(s)'), 'ok');
        B.VIEWS.history(v);
      };
      B.$('#hcancel', box).onclick = function () { pending = null; box.innerHTML = ''; };
    }
  }

  // Synthetic example: one earlier outbreak wave in five Ituri / North Kivu zones (fictitious numbers).
  function loadExample() {
    if (batches().some(function (b) { return b.example && !b.deleted; })) return;
    var rnd = B.prng ? B.prng(20250106) : Math.random, zones = ['Z-aru', 'Z-ariwara', 'Z-adi', 'Z-bambu', 'Z-alimbongo'];
    var start = weekStart(new Date(Date.now() - 64 * 7 * DAY)), rows = [];
    for (var w = 0; w < 48; w++) {
      var wk = ymdU(new Date(start.getTime() + w * 7 * DAY)), peak = Math.exp(-Math.pow((w - 20) / 7, 2));
      zones.forEach(function (zid, i) {
        var z = B.byId(B.G.zones, zid); if (!z) return;
        var lam = peak * (9 - i * 1.4) + 0.3, s = Math.round(lam * (0.6 + rnd() * 0.8)), c = Math.round(s * (0.25 + rnd() * 0.2)), p = Math.round(s * 0.1 * rnd() * 2);
        var d = Math.round((c + p) * (0.3 + rnd() * 0.3)), a = Math.round(s * 1.5 + rnd() * 3), k = Math.round(c * (8 + rnd() * 6));
        if (s + c + p + d + a + k) rows.push([wk, z.province, zid, '', s, p, c, d, a, k]);
      });
    }
    var rec = saveBatch({ kind: 'weekly', rows: rows, rejected: [], excluded: 0, nIn: rows.length }, L('Exemple synthétique (vague antérieure)', 'Synthetic example (earlier wave)'), L('Données fictives générées par l\'application', 'Fictitious data generated by the app'), '');
    rec.example = true; rec.demo = true; B.save();
  }
})();
