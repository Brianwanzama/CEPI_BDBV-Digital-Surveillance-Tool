// Offline cache for the prototype shell (works when served over http/https).
var CACHE = 'bdbv-proto-v4';
var FILES = ['./', 'index.html', 'styles.css', 'manifest.webmanifest', 'vendor/xlsx.full.min.js', 'vendor/jspdf.umd.min.js', 'vendor/jspdf.plugin.autotable.min.js', 'rules.js', 'geodata.js', 'geo.js', 'i18n.js', 'i18n-sw.js', 'scoring.js', 'voice.js', 'app.js', 'modules/workflow.js', 'modules/rumour.js', 'modules/contacts.js', 'modules/lab.js', 'modules/casemgmt.js', 'modules/map.js', 'modules/facility.js', 'modules/reports.js', 'modules/analysis.js', 'modules/admin.js', 'modules/seed2.js', 'config.js', 'api.js', 'register-sw.js'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); })); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.url.indexOf('/api/') >= 0) return; // API calls always go to the network
  e.respondWith(caches.match(e.request).then(function (r) { return r || fetch(e.request); }));
});
