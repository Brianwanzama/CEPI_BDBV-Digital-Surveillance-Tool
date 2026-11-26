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
  assert.ok(/Zone inconnue/.test(rep) && /\| Adi \| Haut-Uele \| Ituri \(boundary\) \| DIFFERS \|/.test(rep) && /\| Aru \| Ituri \| Ituri \(boundary\) \| agrees \|/.test(rep), rep);
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

    // GeoPackage with two levels in one table (like the supplied DRC file), rows chosen with a filter.
    let sqlite; try { sqlite = require('node:sqlite'); } catch (e) { console.log('skip - GeoPackage test needs Node 22.5+'); return; }
    const gp = path.join(tmp, 'admin.gpkg');
    const db = new sqlite.DatabaseSync(gp);
    db.exec("CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT, srs_id INTEGER PRIMARY KEY, organization TEXT, organization_coordsys_id INTEGER, definition TEXT, description TEXT);" +
      "INSERT INTO gpkg_spatial_ref_sys VALUES ('WGS 84', 4326, 'EPSG', 4326, 'GEOGCS[\"WGS 84\"]', NULL);" +
      "CREATE TABLE gpkg_contents (table_name TEXT PRIMARY KEY, data_type TEXT, identifier TEXT, srs_id INTEGER);" +
      "INSERT INTO gpkg_contents VALUES ('adm', 'features', 'adm', 4326);" +
      "CREATE TABLE gpkg_geometry_columns (table_name TEXT, column_name TEXT, geometry_type_name TEXT, srs_id INTEGER, z INTEGER, m INTEGER);" +
      "INSERT INTO gpkg_geometry_columns VALUES ('adm', 'geom', 'MULTIPOLYGON', 4326, 0, 0);" +
      "CREATE TABLE adm (fid INTEGER PRIMARY KEY, geom BLOB, ADM_LEVEL TEXT, ADM_NAME TEXT, ADM1_NAME TEXT, ADM_PCODE TEXT);");
    const blob = (ring) => { // GP header (little endian, no envelope) + WKB MultiPolygon with one polygon
      const b = Buffer.alloc(8 + 9 + 9 + 4 + 4 + ring.length * 16);
      b.write('GP', 0); b[2] = 0; b[3] = 1; b.writeInt32LE(4326, 4);
      let o = 8; b[o++] = 1; b.writeUInt32LE(6, o); o += 4; b.writeUInt32LE(1, o); o += 4;
      b[o++] = 1; b.writeUInt32LE(3, o); o += 4; b.writeUInt32LE(1, o); o += 4; b.writeUInt32LE(ring.length, o); o += 4;
      ring.forEach((pt) => { b.writeDoubleLE(pt[0], o); b.writeDoubleLE(pt[1], o + 8); o += 16; });
      return b;
    };
    const ins = db.prepare('INSERT INTO adm (geom, ADM_LEVEL, ADM_NAME, ADM1_NAME, ADM_PCODE) VALUES (?, ?, ?, ?, ?)');
    ins.run(blob(sq(28.5, 0.5, 2.5)[0]), 'ADM1', 'Ituri', 'Ituri', 'CD54');
    ins.run(blob(sq(30.5, 2.6, 0.4)[0]), 'ADM3', 'Aru', 'Ituri', 'CD540901');
    ins.run(blob(sq(29.0, 1.0, 0.4)[0]), 'ADM3', 'Banjow Moke', 'Maï-Ndombe', 'CD330201');
    db.close();
    const out3 = path.join(tmp, 'out3');
    execFileSync('node', ['--no-warnings', path.join(__dirname, '..', 'tools', 'import_boundaries.js'), '--zones', gp, '--zone-filter', 'ADM_LEVEL=ADM3', '--zone-field', 'ADM_NAME', '--provinces', gp, '--province-filter', 'ADM_LEVEL=ADM1', '--province-field', 'ADM_NAME', '--alias', 'Banjow Moke=Banzow Moke', '--out-dir', out3], { encoding: 'utf8' });
    const w3 = {}; new Function('window', fs.readFileSync(path.join(out3, 'prototype', 'boundaries.js'), 'utf8'))(w3);
    const B3 = w3.BDBV_BOUNDARIES;
    assert.deepStrictEqual(B3.provinces.features.map((f) => f.properties.id), ['P-ituri'], 'ADM1 rows only');
    assert.deepStrictEqual(B3.zones.features.map((f) => [f.properties.id, f.properties.code, f.properties.p]), [['Z-aru', 'CD540901', 'Ituri'], ['Z-banzow-moke', 'CD330201', 'Maï-Ndombe']], 'ADM3 rows, P-codes kept, alias applied');
    const c3 = B3.zones.features[0].properties.c;
    assert.ok(Math.abs(c3[0] - 30.7) < 0.01 && Math.abs(c3[1] - 2.8) < 0.01, 'GeoPackage geometry decoded: ' + c3);
    assert.ok(/Banjow Moke → Banzow Moke/.test(fs.readFileSync(path.join(out3, 'docs', 'boundaries_import_report.md'), 'utf8')), 'alias reported');
    console.log('ok - GeoPackage read (one table, two levels chosen by filter), P-codes kept, spelling alias applied and reported, topology decoded');
  });
});
