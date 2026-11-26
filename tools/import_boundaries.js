#!/usr/bin/env node
// Import official province and health-zone boundaries into the map.
//
//   cd tools && npm install
//   node tools/import_boundaries.js --zones data/boundaries/zones.zip [--provinces data/boundaries/provinces.zip]
//        [--zone-field NAME] [--province-field NAME] [--zone-province-field NAME] [--tolerance 0.002]
//
// Inputs: an ESRI shapefile (.shp with .dbf/.prj/.cpg beside it), a .zip holding one, or GeoJSON.
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
  console.error('Usage: node tools/import_boundaries.js --zones <file> [--provinces <file>] [--zone-field F] [--province-field F] [--zone-province-field F] [--tolerance 0.002] [--out-dir DIR]');
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

async function readLayer(file) {
  let f = path.resolve(file);
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

function simplify(fc, tol) {
  const topo = topoServer.topology({ l: fc }, 1e5);
  const pre = topoSimplify.presimplify(topo);
  const simp = topoSimplify.simplify(pre, tol * tol);
  const out = topoClient.feature(simp, simp.objects.l);
  const round = (c) => (typeof c[0] === 'number' ? [Math.round(c[0] * 1000) / 1000, Math.round(c[1] * 1000) / 1000] : c.map(round));
  out.features.forEach((f) => { if (f.geometry) f.geometry.coordinates = round(f.geometry.coordinates); });
  return out;
}

async function run() {
  const tol = +(args.tolerance || 0.002); // degrees (~200 m)
  const result = { generated: new Date().toISOString().slice(0, 10), provinces: null, zones: null, sources: {} };
  const report = ['# Boundary import report', '', 'Generated ' + result.generated + ' by `tools/import_boundaries.js`.', ''];
  const zoneLinks = {};

  async function layer(kind, file, field, hints, list, listName) {
    const { fc, crs } = await readLayer(file);
    const f = pickField(fc, field, hints, kind);
    const byNorm = {}; list.forEach((x) => { byNorm[norm(x.name_fr || x.name)] = x; });
    const seen = {}, unmatched = [];
    fc.features = fc.features.filter((ft) => ft.geometry && /Polygon/.test(ft.geometry.type));
    fc.features.forEach((ft) => {
      const name = String(ft.properties[f] || '').trim();
      const hit = byNorm[norm(name)];
      ft.properties = { name, id: hit ? hit.id : null, match: hit ? 'matched' : 'unmatched', _src: ft.properties };
      if (hit) seen[hit.id] = true; else unmatched.push(name);
    });
    const missing = list.filter((x) => !seen[x.id] && !x.placeholder).map((x) => x.name_fr || x.name);
    report.push('## ' + listName, '', '- Source: `' + path.basename(file) + '` (' + fc.features.length + ' polygons; ' + crs + '); name field `' + f + '`.',
      '- Matched to the supplied list: ' + Object.keys(seen).length + ' of ' + list.filter((x) => !x.placeholder).length + '.',
      '- In the file but not in the supplied list (' + unmatched.length + '): ' + (unmatched.length ? unmatched.slice(0, 600).join(', ') : 'none') + '.',
      '- In the supplied list but not found in the file (' + missing.length + '): ' + (missing.length ? missing.join(', ') : 'none') + '.', '');
    return { fc, field: f };
  }

  if (args.provinces) {
    const p = await layer('provinces', args.provinces, args['province-field'], [/^(nom|name|province|adm1_fr|adm1_name|nom_prov)/i, /prov/i, /nom|name/i], G.provinces, 'Provinces');
    const s = simplify(p.fc, tol);
    s.features.forEach((ft, i) => { ft.properties = { name: p.fc.features[i].properties.name, id: p.fc.features[i].properties.id, c: centroid(ft.geometry) }; });
    result.provinces = s; result.sources.provinces = path.basename(args.provinces);
  }
  if (args.zones) {
    const z = await layer('zones', args.zones, args['zone-field'], [/^(nom_zs|zs_name|zone|nom|name|adm2_fr|adm2_name)/i, /zs|zone/i, /nom|name/i], G.zones, 'Health zones');
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
    const s = simplify(z.fc, tol);
    s.features.forEach((ft, i) => { const src = z.fc.features[i].properties; ft.properties = { name: src.name, id: src.id, c: centroid(ft.geometry), p: pf ? String(src._src[pf] || '') : '' }; });
    result.zones = s; result.sources.zones = path.basename(args.zones);
  }

  const js = '/* GENERATED by tools/import_boundaries.js from ' + Object.values(result.sources).join(', ') + ' - do not edit. */\nwindow.BDBV_BOUNDARIES = ' + JSON.stringify(result) + ';\n';
  fs.mkdirSync(path.join(OUT, 'prototype'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'config'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'prototype', 'boundaries.js'), js);
  fs.writeFileSync(path.join(OUT, 'docs', 'boundaries_import_report.md'), report.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'config', 'zone_province_from_boundaries.json'), JSON.stringify(zoneLinks, null, 2) + '\n');
  console.log('boundaries.js written (' + Math.round(js.length / 1024) + ' KB): ' + (result.provinces ? result.provinces.features.length + ' province polygons, ' : '') + (result.zones ? result.zones.features.length + ' zone polygons' : ''));
  console.log('Report: docs/boundaries_import_report.md');
}

run().catch((e) => { console.error(e.message || e); process.exit(1); });
