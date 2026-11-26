#!/usr/bin/env node
// Import official province and health-zone boundaries into the map.
//
//   cd tools && npm install
//   node tools/import_boundaries.js --zones data/boundaries/zones.zip [--provinces data/boundaries/provinces.zip]
//        [--zone-field NAME] [--province-field NAME] [--zone-province-field NAME] [--tolerance 0.005]
//        [--zone-filter FIELD=VALUE] [--province-filter FIELD=VALUE] [--zone-layer T] [--province-layer T]
//        [--alias "Name in file=Name in list;..."]   spelling variants accepted on purpose (listed in the report)
//
// Inputs: an ESRI shapefile (.shp with .dbf/.prj/.cpg beside it), a .zip holding one, GeoJSON, or a
// GeoPackage (.gpkg, needs Node 22.5+). One GeoPackage table can hold several levels: pick the rows
// with --zone-filter / --province-filter (e.g. ADM_LEVEL=ADM3).
// Projected shapefiles are converted to WGS84 using their .prj. Names are matched to the supplied
// province and health-zone lists (prototype/geo.js). Outputs:
//   prototype/boundaries.js                  simplified boundaries + reference points (polygon centroids)
//   docs/boundaries_import_report.md         what matched, what did not, zone->province comparison
//   config/zone_province_from_boundaries.json  zone->province links found in the file (for the administrator)
// Nothing is guessed: unmatched names are reported, not forced onto a list entry.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const shapefile = require('shapefile');
const proj4 = require('proj4');
const topoServer = require('topojson-server');
const topoSimplify = require('topojson-simplify');
const topoClient = require('topojson-client');

const ROOT = path.join(__dirname, '..');
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
if (!args.zones && !args.provinces) {
  console.error('Usage: node tools/import_boundaries.js --zones <file> [--provinces <file>] [--zone-field F] [--province-field F] [--zone-province-field F] [--tolerance 0.005] [--out-dir DIR]');
  process.exit(1);
}
const OUT = args['out-dir'] || ROOT;

// Supplied geography (the app's master lists).
function loadGeo() {
  const win = {};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'prototype', 'geo.js'), 'utf8'), { window: win });
  return win.BDBV_GEO;
}
const G = loadGeo();
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/^(zone de sante|zs|z\.s\.|province|dps|ps)\s+(de |du |d')?/, '').replace(/[^a-z0-9]+/g, '');

// GeoPackage geometry blob: 'GP' header + envelope, then standard WKB.
function gpkgGeom(buf) {
  if (!buf || buf[0] !== 0x47 || buf[1] !== 0x50) return null;
  const flags = buf[3];
  if (flags & 0x10) return null; // empty geometry
  const env = [0, 32, 48, 48, 64][(flags >> 1) & 7];
  let o = 8 + env;
  const read = () => {
    const le = buf[o] === 1; o += 1;
    const u32 = () => { const v = le ? buf.readUInt32LE(o) : buf.readUInt32BE(o); o += 4; return v; };
    const f64 = () => { const v = le ? buf.readDoubleLE(o) : buf.readDoubleBE(o); o += 8; return v; };
    let t = u32(), dims = 2;
    if (t & 0x80000000) { dims++; t &= 0xffff; } if (t & 0x40000000) { dims++; t &= 0xffff; }
    if (t > 1000) { dims += ({ 1: 1, 2: 1, 3: 2 })[Math.floor(t / 1000)] || 0; t %= 1000; }
    const ring = () => { const n = u32(), r = []; for (let i = 0; i < n; i++) { const x = f64(), y = f64(); for (let d = 2; d < dims; d++) f64(); r.push([x, y]); } return r; };
    const poly = () => { const n = u32(), p = []; for (let i = 0; i < n; i++) p.push(ring()); return p; };
    if (t === 3) return { type: 'Polygon', coordinates: poly() };
    if (t === 6) { const n = u32(), m = []; for (let i = 0; i < n; i++) { const g = read(); m.push(g.coordinates); } return { type: 'MultiPolygon', coordinates: m }; }
    throw new Error('GeoPackage: unsupported geometry type ' + t);
  };
  return read();
}

function readGpkg(f, table, filter) {
  let sqlite;
  try { sqlite = require('node:sqlite'); } catch (e) { throw new Error('Reading a GeoPackage needs Node.js 22.5 or later (node:sqlite).'); }
  const db = new sqlite.DatabaseSync(f, { readOnly: true });
  const tables = db.prepare("SELECT c.table_name AS t, g.column_name AS g, c.srs_id AS srs FROM gpkg_contents c JOIN gpkg_geometry_columns g ON g.table_name = c.table_name WHERE c.data_type = 'features'").all();
  const tb = table ? tables.find((x) => x.t === table) : tables[0];
  if (!tb) throw new Error(f + ': feature table ' + (table || '') + ' not found. Tables: ' + tables.map((x) => x.t).join(', '));
  if (tables.length > 1 && !table) console.log('Note: ' + path.basename(f) + ' has ' + tables.length + ' tables; using "' + tb.t + '" (choose with --zone-layer / --province-layer).');
  const srs = db.prepare('SELECT organization AS org, organization_coordsys_id AS code, definition AS def FROM gpkg_spatial_ref_sys WHERE srs_id = ?').get(tb.srs) || {};
  let where = '', params = [];
  if (filter) { const m = filter.match(/^([A-Za-z0-9_]+)=(.*)$/); if (!m) throw new Error('Filter must look like FIELD=VALUE'); where = ' WHERE "' + m[1] + '" = ?'; params = [m[2]]; }
  const rows = db.prepare('SELECT * FROM "' + tb.t + '"' + where).all(...params);
  db.close();
  const fc = { type: 'FeatureCollection', features: rows.map((r) => {
    const props = {}; Object.keys(r).forEach((k) => { if (k !== tb.g) props[k] = r[k]; });
    return { type: 'Feature', properties: props, geometry: gpkgGeom(Buffer.from(r[tb.g])) };
  }) };
  const label = 'GeoPackage table ' + tb.t + (filter ? ' where ' + filter : '') + ', ' + (srs.org ? srs.org + ':' + srs.code : 'SRS ' + tb.srs);
  if (tb.srs !== 4326 && srs.def && /^\s*PROJCS/i.test(srs.def)) {
    const tr = proj4(srs.def, 'EPSG:4326');
    const conv = (c) => (typeof c[0] === 'number' ? tr.forward(c) : c.map(conv));
    fc.features.forEach((ft) => { if (ft.geometry) ft.geometry.coordinates = conv(ft.geometry.coordinates); });
    return { fc, crs: label + ' converted to WGS84' };
  }
  return { fc, crs: label };
}

async function readLayer(file, table, filter) {
  let f = path.resolve(file);
  if (/\.gpkg$/i.test(f)) return readGpkg(f, table, filter);
  if (/\.zip$/i.test(f)) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bdbv-bnd-'));
    execFileSync('unzip', ['-o', '-q', f, '-d', dir]);
    const find = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? find(path.join(d, e.name)) : [path.join(d, e.name)]);
    const shp = find(dir).filter((x) => /\.shp$/i.test(x));
    if (shp.length !== 1) throw new Error(file + ': expected one .shp in the zip, found ' + shp.length);
    f = shp[0];
  }
  if (/\.(geo)?json$/i.test(f)) return { fc: JSON.parse(fs.readFileSync(f, 'utf8')), crs: 'GeoJSON (WGS84 assumed)' };
  const base = f.replace(/\.shp$/i, '');
  const prjFile = ['.prj', '.PRJ'].map((e) => base + e).find((p) => fs.existsSync(p));
  const cpgFile = ['.cpg', '.CPG'].map((e) => base + e).find((p) => fs.existsSync(p));
  const encoding = cpgFile ? fs.readFileSync(cpgFile, 'utf8').trim().toLowerCase().replace(/^utf8$/, 'utf-8') : 'utf-8';
  const fc = await shapefile.read(f, base + '.dbf', { encoding });
  const prj = prjFile ? fs.readFileSync(prjFile, 'utf8') : '';
  if (/^\s*PROJCS/i.test(prj)) {
    const tr = proj4(prj, 'EPSG:4326');
    const conv = (c) => (typeof c[0] === 'number' ? tr.forward(c) : c.map(conv));
    fc.features.forEach((ft) => { if (ft.geometry) ft.geometry.coordinates = conv(ft.geometry.coordinates); });
    return { fc, crs: 'projected (' + (prj.match(/PROJCS\["([^"]+)"/i) || [])[1] + ') converted to WGS84' };
  }
  return { fc, crs: prj ? 'geographic (' + ((prj.match(/GEOGCS\["([^"]+)"/i) || [])[1] || 'WGS84') + ')' : 'no .prj: WGS84 assumed' };
}

function pickField(fc, wanted, hints, label) {
  const keys = Object.keys((fc.features[0] || {}).properties || {});
  if (wanted) { if (!keys.includes(wanted)) throw new Error(label + ': field "' + wanted + '" not found. Fields: ' + keys.join(', ')); return wanted; }
  const k = keys.find((x) => hints.some((h) => h.test(x)));
  if (!k) throw new Error(label + ': cannot guess the name field; pass it explicitly. Fields: ' + keys.join(', '));
  return k;
}

// Area-weighted centroid of the largest polygon ring (good enough for a marker).
function centroid(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  let best = null, bestA = 0;
  polys.forEach((p) => {
    const r = p[0]; let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const f = r[j][0] * r[i][1] - r[i][0] * r[j][1]; a += f; cx += (r[j][0] + r[i][0]) * f; cy += (r[j][1] + r[i][1]) * f; }
    if (Math.abs(a) > bestA) { bestA = Math.abs(a); best = [cx / (3 * a), cy / (3 * a)]; }
  });
  return best && best.map((v) => Math.round(v * 1e4) / 1e4);
}

function simplifyLayers(layers, tol) {
  const topo = topoServer.topology(layers, 1e5);
  const simp = topoSimplify.simplify(topoSimplify.presimplify(topo), tol * tol);
  const out = {};
  Object.keys(layers).forEach((k) => { out[k] = topoClient.feature(simp, simp.objects[k]); });
  return out;
}

// Runs in the browser: expands the stored topology back into GeoJSON FeatureCollections
// ({ provinces, zones }), keeping the order of features.
const DECODER = `function (R) {
  var T = R.topology, s = T.transform.scale, t = T.transform.translate;
  var arcs = T.arcs.map(function (a) { var x = 0, y = 0; return a.map(function (p) { x += p[0]; y += p[1]; return [+(x * s[0] + t[0]).toFixed(4), +(y * s[1] + t[1]).toFixed(4)]; }); });
  function ring(ids) { var r = []; ids.forEach(function (i, k) { var a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; r = r.concat(k ? a.slice(1) : a); }); return r; }
  function layer(name) {
    var o = T.objects[name]; if (!o) return null;
    return { type: 'FeatureCollection', features: o.geometries.map(function (g) {
      var geom = g.type === 'Polygon' ? { type: 'Polygon', coordinates: g.arcs.map(ring) } : g.type === 'MultiPolygon' ? { type: 'MultiPolygon', coordinates: g.arcs.map(function (p) { return p.map(ring); }) } : null;
      return { type: 'Feature', properties: g.properties || {}, geometry: geom };
    }) };
  }
  return { generated: R.generated, sources: R.sources, provinces: layer('provinces'), zones: layer('zones') };
}`;

async function run() {
  const tol = +(args.tolerance || 0.005); // degrees (~500 m)
  const result = { generated: new Date().toISOString().slice(0, 10), provinces: null, zones: null, sources: {} };
  const report = ['# Boundary import report', '', 'Generated ' + result.generated + ' by `tools/import_boundaries.js`.', ''];
  const zoneLinks = {}, layers = {};

  async function layer(kind, file, field, hints, list, listName, table, filter) {
    const { fc, crs } = await readLayer(file, table, filter);
    const f = pickField(fc, field, hints, kind);
    const byNorm = {}; list.forEach((x) => { byNorm[norm(x.name_fr || x.name)] = x; });
    const seen = {}, unmatched = [], aliased = [];
    const alias = {}; String(args.alias || '').split(';').filter(Boolean).forEach((p) => { const [a, b] = p.split('='); if (a && b) alias[norm(a)] = norm(b); });
    fc.features = fc.features.filter((ft) => ft.geometry && /Polygon/.test(ft.geometry.type));
    fc.features.forEach((ft) => {
      const name = String(ft.properties[f] || '').trim();
      let hit = byNorm[norm(name)];
      if (!hit && alias[norm(name)] && byNorm[alias[norm(name)]]) { hit = byNorm[alias[norm(name)]]; aliased.push(name + ' → ' + (hit.name_fr || hit.name)); }
      ft.properties = { name, id: hit ? hit.id : null, match: hit ? 'matched' : 'unmatched', _src: ft.properties };
      if (hit) seen[hit.id] = true; else unmatched.push(name);
    });
    const missing = list.filter((x) => !seen[x.id] && !x.placeholder).map((x) => x.name_fr || x.name);
    report.push('## ' + listName, '', '- Source: `' + path.basename(file) + '` (' + fc.features.length + ' polygons; ' + crs + '); name field `' + f + '`.',
      '- Matched to the supplied list: ' + Object.keys(seen).length + ' of ' + list.filter((x) => !x.placeholder).length + '.',
      '- Matched through an alias given with --alias (' + aliased.length + '): ' + (aliased.length ? aliased.join(', ') : 'none') + '.',
      '- In the file but not in the supplied list (' + unmatched.length + '): ' + (unmatched.length ? unmatched.slice(0, 600).join(', ') : 'none') + '.',
      '- In the supplied list but not found in the file (' + missing.length + '): ' + (missing.length ? missing.join(', ') : 'none') + '.', '');
    return { fc, field: f };
  }

  if (args.provinces) {
    const p = await layer('provinces', args.provinces, args['province-field'], [/^(nom|name|province|adm1_fr|adm1_name|nom_prov)/i, /prov/i, /nom|name/i], G.provinces, 'Provinces', args['province-layer'], args['province-filter']);
    p.fc.features.forEach((ft) => { ft.properties = { name: ft.properties.name, id: ft.properties.id }; });
    layers.provinces = p.fc; result.sources.provinces = path.basename(args.provinces);
  }
  if (args.zones) {
    const z = await layer('zones', args.zones, args['zone-field'], [/^(nom_zs|zs_name|zone|nom|name|adm2_fr|adm2_name)/i, /zs|zone/i, /nom|name/i], G.zones, 'Health zones', args['zone-layer'], args['zone-filter']);
    const pf = args['zone-province-field'] || Object.keys(z.fc.features[0].properties._src).find((k) => /^(province|prov|nom_prov|adm1_fr|adm1_name|dps)/i.test(k));
    const provByNorm = {}; G.provinces.forEach((p) => { provByNorm[norm(p.name_fr)] = p; });
    const cmp = [];
    if (pf) {
      z.fc.features.forEach((ft) => {
        if (!ft.properties.id) return;
        const pv = provByNorm[norm(ft.properties._src[pf])];
        const cur = G.zones.find((x) => x.id === ft.properties.id);
        if (pv) zoneLinks[ft.properties.id] = pv.id;
        cmp.push('| ' + cur.name + ' | ' + (ft.properties._src[pf] || '-') + ' | ' + ((G.provinces.find((x) => x.id === cur.province_default) || {}).name_fr || '-') + ' (' + cur.link_status + ') | ' + (!pv ? 'province not recognised' : (pv.id === cur.province_default ? 'agrees' : 'DIFFERS')) + ' |');
      });
      report.push('## Zone → province links', '', 'From field `' + pf + '` of the zone file, compared with the links proposed in the app.', '', '| Health zone | Province in file | Proposed in app | Result |', '|---|---|---|---|', ...cmp, '');
    } else report.push('## Zone → province links', '', 'The zone file has no province field; links were not checked.', '');
    const codeField = Object.keys(z.fc.features[0].properties._src).find((k) => /^(adm_pcode|adm3_pcode|pcode|code)$/i.test(k));
    z.fc.features.forEach((ft) => { const src = ft.properties; ft.properties = { name: src.name, id: src.id, p: pf ? String(src._src[pf] || '') : '', code: codeField ? String(src._src[codeField] || '') : '' }; });
    layers.zones = z.fc; result.sources.zones = path.basename(args.zones);
  }

  // Simplify all layers together so shared borders stay identical, add centroids, then store as a
  // quantised topology (each shared border once, delta-encoded): far smaller than GeoJSON.
  const simp = simplifyLayers(layers, tol);
  const out = {};
  Object.keys(simp).forEach((k) => { simp[k].features.forEach((ft) => { ft.properties.c = ft.geometry ? centroid(ft.geometry) : null; }); out[k] = simp[k]; });
  const topo = topoServer.topology(out, 1e4);
  result.topology = topo;
  const js = '/* GENERATED by tools/import_boundaries.js from ' + Object.values(result.sources).join(', ') + ' - do not edit. */\n' +
    'window.BDBV_BOUNDARIES = (' + DECODER + ')(' + JSON.stringify(result) + ');\n';
  fs.mkdirSync(path.join(OUT, 'prototype'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'config'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'prototype', 'boundaries.js'), js);
  fs.writeFileSync(path.join(OUT, 'docs', 'boundaries_import_report.md'), report.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'config', 'zone_province_from_boundaries.json'), JSON.stringify(zoneLinks, null, 2) + '\n');
  console.log('boundaries.js written (' + Math.round(js.length / 1024) + ' KB): ' + (layers.provinces ? layers.provinces.features.length + ' province polygons, ' : '') + (layers.zones ? layers.zones.features.length + ' zone polygons' : ''));
  console.log('Report: docs/boundaries_import_report.md');
}

run().catch((e) => { console.error(e.message || e); process.exit(1); });
