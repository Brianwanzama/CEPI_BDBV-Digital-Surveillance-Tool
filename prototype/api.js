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
  var COLS = ['assessments', 'reports', 'alerts', 'queue', 'contacts', 'samples', 'rumours', 'history'];
  var base = CFG.apiUrl ? CFG.apiUrl.replace(/\/$/, '') : (location.protocol.indexOf('http') === 0 ? location.origin : null);
  var session = null;
  try { session = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { session = null; }
  if (session && (session.token || session.expired)) B.serverMode = true; // tells app.js not to generate local demo data

  function saveSession() { try { if (session) localStorage.setItem(KEY, JSON.stringify(session)); else localStorage.removeItem(KEY); } catch (e) { /* private mode */ } }
  function api(path, opt) {
    opt = opt || {};
    var h = { 'content-type': 'application/json' };
    if (session && session.token) h.authorization = 'Bearer ' + session.token;
    return fetch(base + '/api/v1' + path, { method: opt.method || 'GET', headers: h, body: opt.body ? JSON.stringify(opt.body) : undefined }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) { if (!r.ok) { var e = new Error(b.error || ('http_' + r.status)); e.status = r.status; throw e; } return b; });
    });
  }

  // A deployment (app served by the API, or hosted with an apiUrl) never offers demonstration accounts.
  var deployed = !!(CFG.server || CFG.apiUrl);
  B.server = { available: false, base: base, deployed: deployed, user: function () { return session && session.user; }, lastSync: function () { return session && session.lastSync; }, expired: function () { return !!(session && session.expired); } };
  if (deployed) { try { localStorage.removeItem('bdbv_demo_session'); } catch (e) { /* ignore */ } }

  function applyIdentity() { B.applyAuth(session.user, 'server'); }

  function mergeConfig(cfg) {
    var d = B.db(); d.config = Object.assign({}, d.config || {}, cfg || {});
    B.G.applyConfig(d.config.geo);
  }

  // Push unsynced local records + device audit entries, pull changes since last sync.
  var syncing = null, again = false, lastOk = null;
  function pendingLocal() { var d = B.db(); return COLS.reduce(function (s, c) { return s + (d[c] || []).filter(function (x) { return !x.synced && !x.sync_error; }).length; }, 0); }
  function sync(full, quiet) {
    if (!session || !session.token || (session.user && session.user.must_change_password)) return Promise.resolve();
    if (syncing) { again = true; return syncing; }
    syncing = doSync(full, quiet).then(function (r) { syncing = null; if (again) { again = false; return sync(false, true); } return r; }, function (e) { syncing = null; throw e; });
    return syncing;
  }
  function doSync(full, quiet) {
    var d = B.db(), changes = {}, n = 0;
    COLS.forEach(function (c) { changes[c] = (d[c] || []).filter(function (x) { return !x.synced && !x.sync_error; }); n += changes[c].length; });
    var aud = (d.audit || []).filter(function (a) { return !a.up; }).slice(0, 2000);
    changes.audit = aud;
    if (!quiet) setStatus(L('Synchronisation…', 'Synchronising…'));
    var before = {}; COLS.forEach(function (c) { before[c] = {}; (d[c] || []).forEach(function (x) { before[c][x.id] = x._v || 0; }); });
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
        if (res.officers) d.officers = res.officers;
        if (res.ai) { d.ai = d.ai || {}; Object.keys(res.ai).forEach(function (k) { d.ai[k] = res.ai[k]; }); }
        session.lastSync = res.server_time; saveSession(); B.save();
        var rej = (res.rejected || []).filter(function (r) { return r.reason !== 'conflict'; });
        lastOk = new Date(); B.server.live = true;
        // What is new for this person (records they did not have, or that changed)?
        var fresh = {}, nFresh = 0;
        COLS.forEach(function (c) { fresh[c] = (res.records[c] || []).filter(function (r) { return !(r.id in before[c]) || before[c][r.id] !== (r._v || 0); }); nFresh += fresh[c].length; });
        if (!full && nFresh) B.newsFrom(fresh);
        setStatus('');
        if (full || n || nFresh || conflicts.length || rej.length) B.refresh(); else B.render({ chromeOnly: true });
        var msg = n + L(' envoyé(s)', ' sent') + ' · ' + COLS.reduce(function (s, c) { return s + (res.records[c] || []).length; }, 0) + L(' reçu(s)', ' received');
        if (conflicts.length) msg += ' · ' + conflicts.length + L(' conflit(s) : version du serveur conservée', ' conflict(s): server version kept');
        if (rej.length) msg += ' · ' + rej.length + L(' refusé(s) par le serveur : ', ' refused by the server: ') + rej.slice(0, 3).map(function (r) { return r.id + ' (' + r.reason + ')'; }).join(', ');
        if (!quiet || rej.length || conflicts.length) B.notify(msg, rej.length ? 'err' : '');
        else if (n) B.notify(n + L(' envoyé(s) au serveur', ' sent to the server'), 'ok');
      });
    }).catch(function (e) {
      setStatus(''); B.server.live = false; B.render({ chromeOnly: true });
      if (e.status === 401) { expire(); return; }
      if (!quiet) B.notify(L('Synchronisation impossible (réseau ou serveur). Les données restent sur l\'appareil.', 'Sync failed (network or server). Data stay on the device.'), 'err');
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
      var prevUser = session && session.user && session.user.username;
      if (prevUser && prevUser !== r.user.username) park(prevUser);
      session = { token: r.token, user: r.user, lastSync: null }; saveSession();
      makeVerifier(password).then(function (v) { if (v && session) { session.verifier = v; saveSession(); } });
      B.serverMode = true; applyIdentity();
      var d = B.db();
      COLS.forEach(function (c) { d[c] = (d[c] || []).filter(function (x) { return !x.demo && !x.synced && (!prevUser || prevUser === r.user.username); }); });
      var back = unpark(r.user.username);
      if (back) B.notify(back + L(' enregistrement(s) gardé(s) sur cet appareil vont être envoyés.', ' record(s) kept on this device will now be sent.'), 'ok');
      // A temporary password must be replaced first; nothing is synchronised until then.
      B.st.tab = r.user.must_change_password ? 'changepw' : B.ROLES[r.user.role][0];
      B.render();
      return r.user.must_change_password ? null : sync(true);
    });
  };
  B.serverSignup = function (req) { return api('/auth/signup', { method: 'POST', body: req }); };
  B.serverForgot = function (req) { return api('/auth/forgot', { method: 'POST', body: req }); };
  B.serverChangePassword = function (current, password) {
    return api('/auth/change-password', { method: 'POST', body: { current: current, password: password } }).then(function () {
      session.user.must_change_password = false; saveSession(); applyIdentity();
      B.st.tab = B.ROLES[session.user.role][0]; B.render();
      return sync(true);
    });
  };
  B.apiCall = api; // for the user-administration screen (modules/admin.js)

  // Send new records straight after they are saved (no need to press Sync).
  var pushTimer = null;
  B.afterSave = function () {
    if (!session || !session.token || !B.st.online || syncing) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { if (pendingLocal()) sync(false, true); }, 800);
  };
  B.server.lastOk = function () { return lastOk; };
  // "Live" indicator in the header (deployed system, signed in).
  B.renderLive = function () {
    var el = document.getElementById('liveind'); if (!el) return;
    if (!session || !B.st.auth || B.st.auth.mode !== 'server') { el.hidden = true; return; }
    el.hidden = false;
    var waiting = pendingLocal();
    var on = B.st.online && B.server.live !== false && lastOk;
    el.className = 'liveind ' + (on ? 'on' : 'off');
    el.title = lastOk ? L('Dernière mise à jour ', 'Last update ') + lastOk.toLocaleTimeString() : '';
    el.innerHTML = '<span class="pulse" aria-hidden="true"></span>' + (on ? L('En direct', 'Live') + ' · ' + lastOk.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (session && session.expired ? L('Session expirée', 'Session ended') : L('Hors ligne', 'Offline'))) + (waiting ? ' · ' + waiting + L(' en attente', ' waiting') : '') + (B.st.pendingRedraw ? ' · <u>' + L('nouvelles informations : afficher', 'new information: show') + '</u>' : '');
    el.style.cursor = B.st.pendingRedraw ? 'pointer' : '';
  };

  // Tell the person what arrived that concerns them.
  B.newsFrom = function (fresh) {
    var role = B.st.role, parts = [];
    var count = function (c, f) { return (fresh[c] || []).filter(f || function () { return true; }).length; };
    var add = function (n, fr, en) { if (n) parts.push(n + ' ' + L(fr, en)); };
    if (['soignant', 'clinician', 'facility_head'].indexOf(role) >= 0) add(count('alerts', function (a) { return !a.ack; }), 'alerte(s) à risque élevé', 'high-risk alert(s)');
    if (['surveillant', 'zone_officer'].indexOf(role) >= 0) add(count('queue', function (q) { return !q.stages || !q.stages.acknowledged; }), 'nouvelle(s) alerte(s) à vérifier', 'new alert(s) to verify');
    if (['lab', 'lab_manager'].indexOf(role) >= 0) add(count('samples', function (s) { return s.status === 'requested'; }), 'demande(s) de test', 'test request(s)');
    if (role === 'lab_manager') add(count('samples', function (s) { return s.status === 'result_entered'; }), 'résultat(s) à approuver', 'result(s) to approve');
    if (['soignant', 'clinician'].indexOf(role) >= 0) add(count('samples', function (s) { return s.status === 'result_released'; }), 'résultat(s) de laboratoire', 'laboratory result(s)');
    if (['soignant', 'clinician'].indexOf(role) >= 0) add(count('contacts', function (c) { return c.status === 'referred'; }), 'contact(s) référé(s)', 'referred contact(s)');
    if (role === 'reco') add(count('queue', function (q) { return q.stages && q.stages.completed; }), 'rapport(s) vérifié(s)', 'report(s) verified');
    if (parts.length) B.notify(L('Nouveau : ', 'New: ') + parts.join(' · '), 'ok');
  };
  B.serverLogout = function (silent) { logout(silent); };

  function expire() {
    if (!session) return;
    session.token = null; session.expired = true; saveSession();
    B.server.live = false; B.render({ chromeOnly: true });
    if (B.lock) B.lock('expired'); else logout(true);
  }

  // Password check without a network: a salted PBKDF2 hash kept with the session (never the password).
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function derive(password, saltHex, iter) {
    var salt = new Uint8Array(saltHex.match(/../g).map(function (h) { return parseInt(h, 16); }));
    return crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
      .then(function (k) { return crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' }, k, 256); }).then(hex);
  }
  function makeVerifier(password) {
    if (!window.crypto || !crypto.subtle) return Promise.resolve(null);
    var salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    return derive(password, salt, 150000).then(function (h) { return { salt: salt, iter: 150000, hash: h }; }).catch(function () { return null; });
  }
  function checkVerifier(password, v) {
    if (!v || !window.crypto || !crypto.subtle) return Promise.reject(new Error('offline_no_verifier'));
    return derive(password, v.salt, v.iter).then(function (h) { if (h !== v.hash) throw new Error('invalid_credentials'); });
  }
  // Unlock after the inactivity lock or an expired session: with the server when it can be reached
  // (this also renews the session), otherwise against the hash kept on the device.
  B.serverUnlock = function (password) {
    var u = session && session.user; if (!u) return Promise.reject(new Error('no_session'));
    var local = function () { return checkVerifier(password, session.verifier).then(function () { return session.token ? 'local' : 'local-expired'; }); };
    if (!B.st.online || !base) return local();
    return api('/auth/login', { method: 'POST', body: { username: u.username, password: password } }).then(function (r) {
      session.token = r.token; session.user = r.user; session.expired = false; saveSession(); applyIdentity();
      return makeVerifier(password).then(function (v) { if (v) { session.verifier = v; saveSession(); } sync(false, true); return 'server'; });
    }, function (e) { if (e.status) throw e; return local(); }); // no answer from the server: check on the device
  };

  // Records not yet sent are kept for their author when someone else signs in on this device.
  var PARK = 'bdbv_parked:';
  function park(username) {
    var d = B.db(), out = {}, n = 0;
    COLS.forEach(function (c) { var l = (d[c] || []).filter(function (x) { return !x.synced && !x.demo; }); if (l.length) { out[c] = l; n += l.length; } });
    if (!n || !username) return 0;
    try {
      var prev = JSON.parse(localStorage.getItem(PARK + username) || '{}');
      COLS.forEach(function (c) { if (out[c]) prev[c] = (prev[c] || []).filter(function (x) { return !out[c].some(function (y) { return y.id === x.id; }); }).concat(out[c]); });
      localStorage.setItem(PARK + username, JSON.stringify(prev));
    } catch (e) { return 0; }
    return n;
  }
  function unpark(username) {
    var p; try { p = JSON.parse(localStorage.getItem(PARK + username) || 'null'); } catch (e) { p = null; }
    if (!p) return 0;
    var d = B.db(), n = 0;
    COLS.forEach(function (c) { (p[c] || []).forEach(function (x) { if (!B.byId(d[c] || [], x.id)) { (d[c] = d[c] || []).push(x); n++; } }); });
    try { localStorage.removeItem(PARK + username); } catch (e) { /* ignore */ }
    return n;
  }

  function logout(silent) {
    var d = B.db();
    var pending = COLS.reduce(function (s, c) { return s + (d[c] || []).filter(function (x) { return !x.synced; }).length; }, 0);
    var user = session && session.user && session.user.username;
    var go = function () {
      park(user);
      if (B.clearDrafts && user) B.clearDrafts(user);
      session = null; saveSession();
      try { localStorage.removeItem('bdbv_proto_db_v1'); localStorage.removeItem('bdbv_demo_session'); localStorage.removeItem('bdbv_last_activity'); sessionStorage.removeItem('bdbv_last_tab'); } catch (e) { /* ignore */ }
      location.reload();
    };
    if (pending && !silent) B.ask(pending + L(' enregistrement(s) pas encore envoyé(s) resteront sur cet appareil et seront envoyés à votre prochaine connexion. Se déconnecter ?', ' record(s) not yet sent will stay on this device and be sent when you next sign in. Sign out?'), L('Se déconnecter', 'Sign out'), B.t('cancel'), go);
    else go();
  }

  // Restore a saved session. auth.js calls this once B.applyAuth exists (api.js loads before it).
  B.restoreServerSession = function () { if (session && session.user && (session.token || session.expired)) { applyIdentity(); return true; } return false; };
  B.server.checking = !!base;

  // Check the server; on a deployment keep trying (a sleeping free-tier server can take a minute to wake).
  var tries = 0;
  function checkServer() {
    B.server.checking = true; B.server.failed = false;
    api('/health').then(function (h) {
      B.server.available = h.status === 'ok';
      B.server.checking = false;
      // A demonstration session is not valid on a real deployment.
      if (B.server.available && B.st.auth && B.st.auth.mode === 'demo') { B.signOut(); return; }
      if (session && session.token) return api('/auth/me').then(function () { sync(false); }).catch(function (e) { if (e.status === 401) expire(); });
      if (session && session.expired && B.lock) { B.lock('expired'); return; }
      B.render();
    }).catch(function () {
      B.server.available = false;
      if (deployed && ++tries < 8) { setTimeout(checkServer, Math.min(2000 * tries, 10000)); if (B.st.tab === 'login') B.render(); return; }
      B.server.checking = false; B.server.failed = deployed;
      if (B.st.tab === 'login') B.render();
    });
  }
  B.retryServer = function () { tries = 0; checkServer(); B.render(); };

  document.addEventListener('DOMContentLoaded', function () {
    if (!base) { B.server.checking = false; return; }
    checkServer();
    // Live: check the server every 30 s while the page is visible (every 2 min when hidden).
    var tick = 0;
    setInterval(function () { tick++; if (!session || !B.st.online || !B.server.available) return; if (document.hidden && tick % 4) return; sync(false, true); }, 30000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && session && B.st.online) sync(false, true); });
    window.addEventListener('online', function () { if (session && session.expired && B.lock) B.lock('expired'); else if (session) sync(false, true); });
  });
})();
