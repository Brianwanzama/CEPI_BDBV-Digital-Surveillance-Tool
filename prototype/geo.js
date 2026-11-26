/*
 * Geography master (v2).
 *
 * SUPPLIED LISTS (project brief §11), kept with their exact names:
 *  - List 1 ("health zones / geographical areas"): the 26 names match the 26 provinces created in
 *    2015, so they are loaded as PROVINCES. Classification flagged for confirmation.
 *  - List 2 ("provinces / local administrative locations"): loaded as HEALTH ZONES, not provinces.
 *    Their province links come from the boundary file supplied by the project
 *    (data/boundaries/DRC_admin_boundaries_ADM1_ADM2_ADM3.gpkg, ADM3 = health zones, field ADM1_NAME;
 *    see docs/boundaries_import_report.md). "Banzow Moke" is spelt "Banjow Moke" in that file; the
 *    project confirmed on 26 November 2026 that they are the same zone. The system administrator
 *    still confirms each zone -> province link (Configuration tab).
 * DEMO: health areas, villages and facilities below exist only to exercise the prototype. They are
 * fictitious, marked "(démo)", and have NO coordinates. In deployment they come from DHIS2/SNIS.
 */
(function () {
  var PROVINCES = ['Bas-Uele', 'Equateur', 'Haut-Katanga', 'Haut-Lomami', 'Haut-Uele', 'Ituri', 'Kasaï', 'Kasaï-Central', 'Kasaï-Oriental',
    'Kinshasa', 'Kongo-Central', 'Kwango', 'Kwilu', 'Lomami', 'Lualaba', 'Mai-Ndombe', 'Maniema', 'Mongala', 'Nord-Kivu', 'Nord-Ubangi',
    'Sankuru', 'Sud-Kivu', 'Sud-Ubangi', 'Tanganyika', 'Tshopo', 'Tshuapa'];
  var EN = { 'Equateur': 'Equateur', 'Nord-Kivu': 'North Kivu', 'Sud-Kivu': 'South Kivu', 'Nord-Ubangi': 'North Ubangi', 'Sud-Ubangi': 'South Ubangi', 'Kongo-Central': 'Kongo Central' };
  var slug = function (s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); };
  var pid = function (name) { return 'P-' + slug(name); };

  var provinces = PROVINCES.map(function (n) { return { id: pid(n), name_fr: n, name_en: EN[n] || n, name_sw: n, supplied: true }; });
  provinces.push({ id: 'P-tbc', name_fr: '(province à confirmer)', name_en: '(province to confirm)', name_sw: '(jimbo la kuthibitisha)', placeholder: true });

  // Supplied health zones with the province given by the official boundary file (to be confirmed).
  var ZONES = [
    ['Aba', 'Haut-Uele'], ['Abuzi', 'Nord-Ubangi'], ['Adi', 'Ituri'], ['Adja', 'Ituri'], ['Aketi', 'Bas-Uele'], ['Alimbongo', 'Nord-Kivu'],
    ['Alunguli', 'Maniema'], ['Ango', 'Bas-Uele'], ['Angumu', 'Ituri'], ['Ankoro', 'Tanganyika'], ['Ariwara', 'Ituri'], ['Aru', 'Ituri'],
    ['Aungba', 'Ituri'], ['Bafwagbogbo', 'Tshopo'], ['Bafwasende', 'Tshopo'], ['Bagata', 'Kwilu'], ['Bagira', 'Sud-Kivu'], ['Baka', 'Haut-Lomami'],
    ['Bambo', 'Nord-Kivu'], ['Bambu', 'Ituri'], ['Banalia', 'Tshopo'], ['Bandalungwa', 'Kinshasa'], ['Bandundu', 'Kwilu'],
    ['Banga Lubaka', 'Kasaï'], ['Bangabola', 'Sud-Ubangi'], ['Banzow Moke', 'Mai-Ndombe']
  ];
  // Other spellings of supplied zones, confirmed by the project.
  var AKA = { 'Banzow Moke': 'Banjow Moke' };
  var zones = ZONES.map(function (z) {
    var p = z[1] ? pid(z[1]) : 'P-tbc';
    return { id: 'Z-' + slug(z[0]), name: z[0], aka: AKA[z[0]], province: p, province_default: p, link_status: z[1] ? 'boundary' : 'unassigned', supplied: true };
  });

  // Demo health areas / villages / facilities (fictitious, no coordinates).
  var DEMO_ZONES = ['Z-aru', 'Z-ariwara', 'Z-adi', 'Z-angumu', 'Z-bambu', 'Z-alimbongo', 'Z-bafwasende'];
  var areas = [], villages = [], facilities = [];
  DEMO_ZONES.forEach(function (zid) {
    var z = zones.filter(function (x) { return x.id === zid; })[0];
    var code = z.name.slice(0, 3).toUpperCase();
    for (var a = 1; a <= 2; a++) {
      var aid = zid + '-A' + a;
      areas.push({ id: aid, zone: zid, name_fr: 'AS ' + z.name + ' ' + a + ' (démo)', name_en: 'HA ' + z.name + ' ' + a + ' (demo)', name_sw: 'EA ' + z.name + ' ' + a + ' (demo)', demo: true });
      facilities.push({ id: aid + '-F', area: aid, type: 'hc', code: code + a, name_fr: 'CS ' + z.name + ' ' + a + ' (démo)', name_en: 'HC ' + z.name + ' ' + a + ' (demo)', name_sw: 'KA ' + z.name + ' ' + a + ' (demo)', demo: true });
      for (var v = 1; v <= 3; v++) {
        var nm = 'Village ' + code + '-' + a + v;
        villages.push({ id: aid + '-V' + v, area: aid, name_fr: nm + ' (démo)', name_en: nm + ' (demo)', name_sw: 'Kijiji ' + code + '-' + a + v + ' (demo)', demo: true });
      }
    }
  });
  // Demo holding / isolation units
  [['Z-aru-A1', 'holding', 'UT Aru (démo)', 'Holding unit Aru (demo)', 'Kituo cha kusubiri Aru (demo)', 'ARUT'],
   ['Z-adi-A1', 'holding', 'UT Adi (démo)', 'Holding unit Adi (demo)', 'Kituo cha kusubiri Adi (demo)', 'ADIT'],
   ['Z-ariwara-A1', 'isolation', 'CTE Ariwara (démo)', 'ETC Ariwara (demo)', 'Kituo cha matibabu Ariwara (demo)', 'ARIC']].forEach(function (h) {
    facilities.push({ id: h[0] + '-' + h[5], area: h[0], type: h[1], code: h[5], name_fr: h[2], name_en: h[3], name_sw: h[4], demo: true });
  });

  var G = {
    provinces: provinces, zones: zones, areas: areas, villages: villages, facilities: facilities,
    facility_types: { hc: ['Centre de santé', 'Health centre', 'Kituo cha afya'], hospital: ['Hôpital', 'Hospital', 'Hospitali'], holding: ['Unité de transit / dépistage', 'Holding / screening unit', 'Kituo cha kusubiri'], isolation: ['Centre de traitement / isolement', 'Treatment / isolation centre', 'Kituo cha kutenga'] },
    // DEMO scenario only: zones flagged "active transmission" for the synthetic data.
    affected_zones: ['Z-aru', 'Z-ariwara', 'Z-adi'],
    // Apply administrator configuration (stored in db.config.geo) on top of the defaults.
    applyConfig: function (cfg) {
      cfg = cfg || {};
      var links = cfg.zone_province || {}, conf = cfg.confirmed || {};
      zones.forEach(function (z) {
        z.province = links[z.id] || z.province_default;
        z.link_status = conf[z.id] ? 'confirmed' : (links[z.id] ? 'set_by_admin' : (z.province_default === 'P-tbc' ? 'unassigned' : 'boundary'));
      });
      (cfg.added_zones || []).forEach(function (x) { if (!zones.some(function (z) { return z.id === x.id; })) zones.push(Object.assign({ province_default: x.province, link_status: 'set_by_admin' }, x)); });
      (cfg.added_areas || []).forEach(function (x) { if (!areas.some(function (a) { return a.id === x.id; })) areas.push(x); });
      (cfg.added_villages || []).forEach(function (x) { if (!villages.some(function (a) { return a.id === x.id; })) villages.push(x); });
      (cfg.added_facilities || []).forEach(function (x) { if (!facilities.some(function (a) { return a.id === x.id; })) facilities.push(x); });
      if (cfg.affected_zones) G.affected_zones = cfg.affected_zones.slice();
    }
  };
  window.BDBV_GEO = G;
})();
