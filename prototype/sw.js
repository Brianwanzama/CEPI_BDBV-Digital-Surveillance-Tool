// Offline cache for the app (works when served over http/https).
// Network first: when online the latest version is always used and the cache refreshed;
// the cached copy is used only when the network is not available.
var CACHE = 'bdbv-proto-v11';
var FILES = ['./', 'index.html', 'styles.css', 'manifest.webmanifest', 'assets/emblem.png', 'assets/logo.png', 'vendor/xlsx.full.min.js', 'vendor/jspdf.umd.min.js', 'vendor/jspdf.plugin.autotable.min.js', 'vendor/fonts/atkinson-hyperlegible-latin-400-normal.woff2', 'vendor/fonts/atkinson-hyperlegible-latin-700-normal.woff2', 'vendor/fonts/barlow-semi-condensed-latin-600-normal.woff2', 'vendor/fonts/barlow-semi-condensed-latin-700-normal.woff2', 'vendor/fonts/ibm-plex-mono-latin-500-normal.woff2', 'rules.js', 'geodata.js', 'boundaries.js', 'geo.js', 'i18n.js', 'i18n-sw.js', 'scoring.js', 'voice.js', 'app.js', 'modules/workflow.js', 'modules/rumour.js', 'modules/contacts.js', 'modules/lab.js', 'modules/casemgmt.js', 'modules/map.js', 'modules/facility.js', 'modules/reports.js', 'modules/analysis.js', 'modules/history.js', 'modules/admin.js', 'modules/seed2.js', 'config.js', 'errors.js', 'api.js', 'auth.js', 'resilience.js', 'register-sw.js'];
self.addEventListener('install', function (e) { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); })); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.url.indexOf('/api/') >= 0) return; // API calls always go to the network
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(function (r) {
    if (r && r.ok && new URL(e.request.url).origin === self.location.origin) { var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); }
    return r;
  }).catch(function () { return caches.match(e.request).then(function (r) { return r || caches.match('index.html'); }); }));
});
