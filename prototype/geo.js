/*
 * DEMONSTRATION geography. Province and health-zone names are real DRC
 * entities, but health areas, villages, facilities and all coordinates are
 * FICTITIOUS placeholders. In deployment this file is replaced by the official
 * DRC master lists (SNIS / DHIS2 org-unit hierarchy and master facility list),
 * with official codes and GPS coordinates.
 * x/y are schematic map coordinates (0-600 / 0-380), not GPS.
 */
(function () {
  var zones = [
    { id: 'Z-BUN', province: 'P-ITU', name: 'Bunia', cx: 330, cy: 120 },
    { id: 'Z-RWA', province: 'P-ITU', name: 'Rwampara', cx: 250, cy: 170 },
    { id: 'Z-MGB', province: 'P-ITU', name: 'Mongbwalu', cx: 360, cy: 50 },
    { id: 'Z-BEN', province: 'P-NKV', name: 'Beni', cx: 250, cy: 290 },
    { id: 'Z-BUT', province: 'P-NKV', name: 'Butembo', cx: 330, cy: 340 }
  ];
  var areas = [], villages = [], facilities = [];
  var offsets = [[-35, -20], [30, 15], [-10, 35]];
  zones.forEach(function (z, zi) {
    for (var a = 1; a <= 2; a++) {
      var aid = z.id + '-A' + a;
      var acx = z.cx + (a === 1 ? -32 : 32), acy = z.cy + (a === 1 ? -6 : 10);
      areas.push({ id: aid, zone: z.id, name: 'AS ' + z.name + ' ' + a + ' (démo)' });
      facilities.push({ id: aid + '-F', area: aid, code: z.id.slice(2) + a, name: 'CS ' + z.name + ' ' + a + ' (démo)', x: acx, y: acy });
      for (var v = 0; v < 3; v++) {
        villages.push({
          id: aid + '-V' + (v + 1), area: aid,
          name: 'Village ' + z.name.slice(0, 3).toUpperCase() + '-' + a + (v + 1) + ' (démo)',
          x: acx + offsets[v][0] * 0.6 + (zi % 2) * 4, y: acy + offsets[v][1] * 0.6
        });
      }
    }
  });
  window.BDBV_GEO = {
    provinces: [{ id: 'P-ITU', name: 'Ituri' }, { id: 'P-NKV', name: 'Nord-Kivu' }],
    zones: zones, areas: areas, villages: villages, facilities: facilities,
    // Health zones flagged as having active transmission (to be maintained by national surveillance)
    affected_zones: ['Z-BUN', 'Z-RWA', 'Z-MGB']
  };
})();
