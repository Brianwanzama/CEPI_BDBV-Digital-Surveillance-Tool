// Test of the boundary import tool with a small synthetic shapefile (fake squares, NOT real
// boundaries). Run: (cd tools && npm install) && node tests/boundaries.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bdbv-bt-'));
const sq = (x, y, d) => [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]];
const zones = { type: 'FeatureCollection', features: [
  { type: 'Feature', properties: { NOM_ZS: 'ZS Aru', PROVINCE: 'Ituri' }, geometry: { type: 'Polygon', coordinates: sq(30.5, 2.6, 0.4) } },
  { type: 'Feature', properties: { NOM_ZS: 'Adi', PROVINCE: 'Haut-Uele' }, geometry: { type: 'Polygon', coordinates: sq(30.0, 3.2, 0.3) } },
  { type: 'Feature', properties: { NOM_ZS: 'Zone inconnue', PROVINCE: 'Ituri' }, geometry: { type: 'Polygon', coordinates: sq(29.5, 1.0, 0.3) } }
] };
const provinces = { type: 'FeatureCollection', features: [
  { type: 'Feature', properties: { NOM: 'Ituri' }, geometry: { type: 'Polygon', coordinates: sq(28.5, 0.5, 2.5) } },
  { type: 'Feature', properties: { NOM: 'Haut-Uélé' }, geometry: { type: 'Polygon', coordinates: sq(25.0, 2.5, 3.0) } }
] };
// Zones as a shapefile (written with shp-write), provinces as GeoJSON: both formats are supported.
const writeShp = require(path.join(__dirname, '..', 'tools', 'node_modules', '@mapbox', 'shp-write', 'src', 'write.js'));
writeShp(zones.features.map((f) => f.properties), 'POLYGON', zones.features.map((f) => f.geometry.coordinates), (err, out) => {
  if (err) throw err;
  const toBuf = (v) => Buffer.from(v.buffer ? v.buffer : v);
  fs.writeFileSync(path.join(tmp, 'zones.shp'), toBuf(out.shp));
  fs.writeFileSync(path.join(tmp, 'zones.shx'), toBuf(out.shx));
  fs.writeFileSync(path.join(tmp, 'zones.dbf'), toBuf(out.dbf));
  fs.writeFileSync(path.join(tmp, 'zones.prj'), 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]]');
  fs.writeFileSync(path.join(tmp, 'provinces.geojson'), JSON.stringify(provinces));
  const outDir = path.join(tmp, 'out');
  const log = execFileSync('node', [path.join(__dirname, '..', 'tools', 'import_boundaries.js'), '--zones', path.join(tmp, 'zones.shp'), '--provinces', path.join(tmp, 'provinces.geojson'), '--out-dir', outDir], { encoding: 'utf8' });
  assert.ok(/3 zone polygons/.test(log), log);
  const win = {}; new Function('window', fs.readFileSync(path.join(outDir, 'prototype', 'boundaries.js'), 'utf8'))(win);
  const B = win.BDBV_BOUNDARIES;
  const zi = B.zones.features.map((f) => f.properties);
  assert.deepStrictEqual(zi.map((p) => p.id), ['Z-aru', 'Z-adi', null], '"ZS Aru" matched after prefix removal; unknown zone not forced');
  assert.ok(Math.abs(zi[0].c[0] - 30.7) < 0.01 && Math.abs(zi[0].c[1] - 2.8) < 0.01, 'centroid of the polygon');
  assert.deepStrictEqual(B.provinces.features.map((f) => f.properties.id), ['P-ituri', 'P-haut-uele'], 'accents ignored when matching');
  const rep = fs.readFileSync(path.join(outDir, 'docs', 'boundaries_import_report.md'), 'utf8');
  assert.ok(/Zone inconnue/.test(rep) && /\| Adi \| Haut-Uele \| Ituri \(proposed\) \| DIFFERS \|/.test(rep) && /\| Aru \| Ituri \| Ituri \(proposed\) \| agrees \|/.test(rep), rep);
  const links = JSON.parse(fs.readFileSync(path.join(outDir, 'config', 'zone_province_from_boundaries.json'), 'utf8'));
  assert.deepStrictEqual(links, { 'Z-aru': 'P-ituri', 'Z-adi': 'P-haut-uele' });
  console.log('ok - shapefile + GeoJSON read, names matched (prefixes/accents), unmatched reported, zone->province compared, centroids computed');

  // Projected shapefile (WGS 84 / UTM zone 35N, metres) must come back in degrees.
  const proj4 = require(path.join(__dirname, '..', 'tools', 'node_modules', 'proj4'));
  const utm = '+proj=utm +zone=35 +datum=WGS84 +units=m +no_defs';
  const toUtm = (ring) => ring.map((pt) => proj4('EPSG:4326', utm, pt));
  writeShp([{ NOM_ZS: 'Aru' }], 'POLYGON', [[toUtm(sq(30.5, 2.6, 0.4)[0])]], (err2, o2) => {
    if (err2) throw err2;
    const toBuf = (v) => Buffer.from(v.buffer ? v.buffer : v);
    ['shp', 'shx', 'dbf'].forEach((k) => fs.writeFileSync(path.join(tmp, 'utm.' + k), toBuf(o2[k])));
    fs.writeFileSync(path.join(tmp, 'utm.prj'), 'PROJCS["WGS_1984_UTM_Zone_35N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",27.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]');
    const out2 = path.join(tmp, 'out2');
    const log2 = execFileSync('node', [path.join(__dirname, '..', 'tools', 'import_boundaries.js'), '--zones', path.join(tmp, 'utm.shp'), '--out-dir', out2], { encoding: 'utf8' });
    const w2 = {}; new Function('window', fs.readFileSync(path.join(out2, 'prototype', 'boundaries.js'), 'utf8'))(w2);
    const c = w2.BDBV_BOUNDARIES.zones.features[0].properties.c;
    assert.ok(Math.abs(c[0] - 30.7) < 0.01 && Math.abs(c[1] - 2.8) < 0.01, 'UTM converted to degrees: ' + c);
    assert.ok(/converted to WGS84/.test(fs.readFileSync(path.join(out2, 'docs', 'boundaries_import_report.md'), 'utf8')));
    console.log('ok - projected (UTM 35N) shapefile converted to WGS84 using its .prj');
  });
});
