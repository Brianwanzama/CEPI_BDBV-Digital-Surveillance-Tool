/* Error reporting from phones and computers. Loaded first, so that an error in any later file is
 * recorded. Errors are kept on the device (at most 20) and sent to the server when it can be
 * reached; the system administrator sees them in the audit log ("client_error"). No form content
 * is sent: only the error message, the file and line, the screen and the role.
 */
(function () {
  'use strict';
  var KEY = 'bdbv_client_errors', MAX = 20, timer = null;
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
  function store(l) { try { localStorage.setItem(KEY, JSON.stringify(l.slice(-MAX))); } catch (e) { /* storage full or blocked */ } }
  function base() {
    var CFG = window.BDBV_CONFIG || {};
    if (CFG.demoCopy) return null;
    return CFG.apiUrl ? CFG.apiUrl.replace(/\/$/, '') : (location.protocol.indexOf('http') === 0 ? location.origin : null);
  }
  function record(msg, src, line, col, stack) {
    var B = window.BDBV || {}, st = B.st || {};
    var e = {
      at: new Date().toISOString(), msg: String(msg || '').slice(0, 300),
      src: String(src || '').replace(location.origin, '').slice(0, 120), line: line || 0, col: col || 0,
      stack: String(stack || '').slice(0, 800), tab: st.tab || '', role: st.role || '', ua: String(navigator.userAgent || '').slice(0, 160)
    };
    var l = load(), sig = e.msg + '|' + e.src + '|' + e.line;
    // the same error repeated within a minute is recorded once
    if (l.some(function (x) { return x.msg + '|' + x.src + '|' + x.line === sig && Date.parse(e.at) - Date.parse(x.at) < 60000; })) return;
    l.push(e); store(l);
    clearTimeout(timer); timer = setTimeout(flush, 3000);
  }
  function flush() {
    var l = load(), b = base();
    if (!l.length || !b || navigator.onLine === false) return;
    var h = { 'content-type': 'application/json' };
    try { var s = JSON.parse(localStorage.getItem('bdbv_server_session') || 'null'); if (s && s.token) h.authorization = 'Bearer ' + s.token; } catch (e) { /* ignore */ }
    fetch(b + '/api/v1/client-errors', { method: 'POST', headers: h, body: JSON.stringify({ errors: l }) })
      .then(function (r) { if (r.ok) store(load().filter(function (x) { return l.every(function (y) { return y.at !== x.at || y.msg !== x.msg; }); })); })
      .catch(function () { /* try again later */ });
  }
  window.addEventListener('error', function (ev) { if (ev && ev.message) record(ev.message, ev.filename, ev.lineno, ev.colno, ev.error && ev.error.stack); });
  window.addEventListener('unhandledrejection', function (ev) { var r = (ev && ev.reason) || {}; record('Unhandled: ' + (r.message || String(r)), '', 0, 0, r.stack); });
  window.addEventListener('online', flush);
  window.addEventListener('load', function () { setTimeout(flush, 5000); });
  window.BDBVErrors = { list: load, flush: flush, record: record };
})();
