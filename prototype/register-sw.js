// Offline cache (only when served over http/https). When a new version of the app is
// installed, the page reloads once so that everyone uses the latest version.
if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
  var hadController = !!navigator.serviceWorker.controller, reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (reg) { reg.update(); }).catch(function () {});
}
