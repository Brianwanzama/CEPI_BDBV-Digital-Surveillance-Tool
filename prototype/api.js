/* Server connection (optional). Without a server the app works exactly as before
 * (local demo data). With a server (same origin, or BDBV_CONFIG.apiUrl), users sign in;
 * their role, facility and zone then come from their account, and data are synchronised:
 * local changes are pushed, the server's (scoped and redacted) records are pulled.
 * The server enforces permissions; the app only mirrors them.
 */
(function () {
  'use strict';
  var B = window.BDBV, CFG = window.BDBV_CONFIG || {};
  var L = function (f, e) { return B.L(f, e); };
  var KEY = 'bdbv_server_session';
  var COLS = ['assessments', 'reports', 'alerts', 'queue', 'contacts', 'samples', 'rumours'];
  var base = CFG.apiUrl ? CFG.apiUrl.replace(/\/$/, '') : (location.protocol.indexOf('http') === 0 ? location.origin : null);
  var session = null;
  try { session = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { session = null; }
  if (session && session.token) B.serverMode = true; // tells app.js not to generate local demo data

  function saveSession() { try { if (session) localStorage.setItem(KEY, JSON.stringify(session)); else localStorage.removeItem(KEY); } catch (e) { /* private mode */ } }
  function api(path, opt) {
    opt = opt || {};
    var h = { 'content-type': 'application/json' };
    if (session && session.token) h.authorization = 'Bearer ' + session.token;
    return fetch(base + '/api/v1' + path, { method: opt.method || 'GET', headers: h, body: opt.body ? JSON.stringify(opt.body) : undefined }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) { if (!r.ok) { var e = new Error(b.error || ('http_' + r.status)); e.status = r.status; throw e; } return b; });
    });
  }

  B.server = { available: false, base: base, user: function () { return session && session.user; }, lastSync: function () { return session && session.lastSync; } };

  function applyIdentity() { B.applyAuth(session.user, 'server'); }

  function mergeConfig(cfg) {
    var d = B.db(); d.config = Object.assign({}, d.config || {}, cfg || {});
    B.G.applyConfig(d.config.geo);
  }

  // Push unsynced local records + device audit entries, pull changes since last sync.
  function sync(full) {
    if (!session) return Promise.resolve();
    var d = B.db(), changes = {}, n = 0;
    COLS.forEach(function (c) { changes[c] = (d[c] || []).filter(function (x) { return !x.synced && !x.sync_error; }); n += changes[c].length; });
    var aud = (d.audit || []).filter(function (a) { return !a.up; }).slice(0, 2000);
    changes.audit = aud;
    setStatus(L('Synchronisation…', 'Synchronising…'));
    return api('/sync', { method: 'POST', body: { since: full ? null : session.lastSync, changes: changes } }).then(function (res) {
      aud.forEach(function (a) { a.up = true; });
      Object.keys(res.accepted || {}).forEach(function (c) { res.accepted[c].forEach(function (id) { var x = B.byId(d[c], id); if (x) x.synced = true; }); });
      var conflicts = [];
      (res.rejected || []).forEach(function (r) {
        var x = B.byId(d[r.collection] || [], r.id);
        if (r.reason === 'conflict') conflicts.push(r);
        else if (x) { x.sync_error = r.reason; x.synced = true; }
      });
      COLS.forEach(function (c) {
        if (full) d[c] = (d[c] || []).filter(function (x) { return !x.synced; });
        (res.records[c] || []).forEach(function (rec) {
          var i = d[c].findIndex(function (x) { return x.id === rec.id; });
          if (i >= 0) d[c][i] = rec; else d[c].push(rec);
        });
      });
      // Conflicts: someone else changed the record first; take the server copy.
      return Promise.all(conflicts.map(function (r) {
        return api('/records/' + r.collection + '/' + encodeURIComponent(r.id)).then(function (rec) { rec.synced = true; var i = d[r.collection].findIndex(function (x) { return x.id === r.id; }); if (i >= 0) d[r.collection][i] = rec; }).catch(function () {});
      })).then(function () {
        mergeConfig(res.config);
        session.lastSync = res.server_time; saveSession(); B.save();
        var rej = (res.rejected || []).filter(function (r) { return r.reason !== 'conflict'; });
        setStatus('');
        B.render();
        var msg = n + L(' envoyé(s)', ' sent') + ' · ' + COLS.reduce(function (s, c) { return s + (res.records[c] || []).length; }, 0) + L(' reçu(s)', ' received');
        if (conflicts.length) msg += ' · ' + conflicts.length + L(' conflit(s) : version du serveur conservée', ' conflict(s): server version kept');
        if (rej.length) msg += ' · ' + rej.length + L(' refusé(s) par le serveur : ', ' refused by the server: ') + rej.slice(0, 3).map(function (r) { return r.id + ' (' + r.reason + ')'; }).join(', ');
        B.notify(msg, rej.length ? 'err' : '');
      });
    }).catch(function (e) {
      setStatus('');
      if (e.status === 401) { B.notify(L('Session expirée : reconnectez-vous.', 'Session expired: sign in again.'), 'err'); logout(true); return; }
      B.notify(L('Synchronisation impossible (réseau ou serveur). Les données restent sur l\'appareil.', 'Sync failed (network or server). Data stay on the device.'), 'err');
    });
  }
  B.serverSync = function () { if (!session) return false; if (!B.st.online) { B.notify(L('Hors ligne : la synchronisation se fera au retour du réseau.', 'Offline: sync will run when the network returns.'), 'err'); return true; } sync(false); return true; };

  // Names for authorised exports (surveillance roles), with the reason logged on the server.
  B.revealIdentifiers = function (collection, ids, reason) {
    if (!session) return Promise.resolve({});
    return api('/identifiers', { method: 'POST', body: { collection: collection, ids: ids, reason: reason } });
  };
  // Public rumour straight to the server when there is no session.
  B.submitPublicRumour = function (r) {
    if (!base || !B.server.available || session) return null;
    return api('/public/rumours', { method: 'POST', body: r });
  };

  function setStatus(txt) { var el = B.$('#syncbtn'); if (el && txt) el.textContent = txt; }

  // Called by the sign-in screen (auth.js).
  B.serverLogin = function (username, password) {
    return api('/auth/login', { method: 'POST', body: { username: username, password: password } }).then(function (r) {
      session = { token: r.token, user: r.user, lastSync: null }; saveSession();
      B.serverMode = true; applyIdentity();
      var d = B.db();
      COLS.forEach(function (c) { d[c] = (d[c] || []).filter(function (x) { return !x.demo && !x.synced; }); });
      B.st.tab = B.ROLES[r.user.role][0];
      B.render();
      return sync(true);
    });
  };
  B.serverLogout = function (silent) { logout(silent); };

  function logout(silent) {
    var d = B.db();
    var pending = COLS.reduce(function (s, c) { return s + (d[c] || []).filter(function (x) { return !x.synced; }).length; }, 0);
    var go = function () { session = null; saveSession(); try { localStorage.removeItem('bdbv_proto_db_v1'); localStorage.removeItem('bdbv_demo_session'); } catch (e) { /* ignore */ } location.reload(); };
    if (pending && !silent) B.ask(pending + L(' enregistrement(s) non synchronisé(s) seront perdus. Se déconnecter quand même ?', ' unsynchronised record(s) will be lost. Sign out anyway?'), L('Se déconnecter', 'Sign out'), B.t('cancel'), go);
    else go();
  }

  if (session && session.token) applyIdentity();
  B.server.checking = !!base;

  document.addEventListener('DOMContentLoaded', function () {
    if (!base) { B.server.checking = false; return; }
    api('/health').then(function (h) {
      B.server.available = h.status === 'ok';
      B.server.checking = false;
      // A demonstration session is not valid on a real deployment.
      if (B.server.available && B.st.auth && B.st.auth.mode === 'demo') { B.signOut(); return; }
      if (session) return api('/auth/me').then(function () { sync(false); }).catch(function (e) { if (e.status === 401) logout(true); });
      B.render();
    }).catch(function () { B.server.available = false; B.server.checking = false; if (B.st.tab === 'login') B.render(); });
    // Background sync every 2 minutes while signed in and online.
    setInterval(function () { if (session && B.st.online) sync(false); }, 120000);
  });
})();
