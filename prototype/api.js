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

  B.server = { available: false, base: base, user: function () { return session && session.user; } };

  function applyIdentity() {
    var u = session.user;
    B.st.role = u.role;
    B.USER_NAMES[u.role] = [u.name, u.name];
    B.USER_CTX[u.role] = { facility: u.facility || undefined, zone: u.zone || undefined };
  }

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

  function setStatus(txt) { var el = B.$('#srvstate'); if (el) el.textContent = txt; }
  function header() {
    var btn = B.$('#srvbtn'); if (!btn) return;
    btn.hidden = !B.server.available && !session;
    if (session) {
      btn.textContent = session.user.name + ' · ' + L('Déconnexion', 'Sign out');
      var role = B.$('#role'); if (role) { role.disabled = true; role.title = L('Rôle défini par le compte serveur', 'Role set by the server account'); }
      var ban = B.$('#banner'); if (ban) ban.textContent = L('SERVEUR PILOTE - données SYNTHÉTIQUES uniquement. Ne pas saisir de données réelles de patients.', 'PILOT SERVER - SYNTHETIC data only. Do not enter real patient data.');
    } else btn.textContent = L('Se connecter au serveur', 'Sign in to server');
  }
  B.afterRender = header;

  function loginDialog() {
    var el = B.$('#ask');
    el.innerHTML = '<form class="askbox" id="loginf"><h3>' + L('Connexion au serveur', 'Sign in to the server') + '</h3><p class="small muted">' + B.esc(base) + '</p>' +
      '<label>' + L('Identifiant', 'Username') + '<input id="lu" autocomplete="username" required></label><label>' + L('Mot de passe', 'Password') + '<input id="lp" type="password" autocomplete="current-password" required></label>' +
      '<p class="small">' + L('Données synthétiques uniquement (pilote). Les données de démonstration locales seront remplacées par celles du serveur.', 'Synthetic data only (pilot). Local demo data will be replaced by the server\'s data.') + '</p>' +
      '<div class="actions"><button class="primary" type="submit">' + L('Se connecter', 'Sign in') + '</button> <button type="button" class="ghost" id="lcancel">' + B.t('cancel') + '</button></div></form>';
    el.hidden = false; B.$('#lu', el).focus();
    B.$('#lcancel', el).onclick = function () { el.hidden = true; };
    B.$('#loginf', el).onsubmit = function (e) {
      e.preventDefault();
      api('/auth/login', { method: 'POST', body: { username: B.$('#lu', el).value, password: B.$('#lp', el).value } }).then(function (r) {
        el.hidden = true;
        session = { token: r.token, user: r.user, lastSync: null }; saveSession();
        B.serverMode = true; applyIdentity();
        var d = B.db();
        COLS.forEach(function (c) { d[c] = (d[c] || []).filter(function (x) { return !x.demo && !x.synced; }); });
        B.st.tab = B.ROLES[r.user.role][0];
        sync(true);
      }).catch(function (err) { B.notify(err.status === 401 ? L('Identifiant ou mot de passe incorrect.', 'Wrong username or password.') : L('Serveur injoignable.', 'Server unreachable.'), 'err'); });
    };
  }

  function logout(silent) {
    var d = B.db();
    var pending = COLS.reduce(function (s, c) { return s + (d[c] || []).filter(function (x) { return !x.synced; }).length; }, 0);
    var go = function () { session = null; saveSession(); try { localStorage.removeItem('bdbv_proto_db_v1'); } catch (e) { /* ignore */ } location.reload(); };
    if (pending && !silent) B.ask(pending + L(' enregistrement(s) non synchronisé(s) seront perdus. Se déconnecter quand même ?', ' unsynchronised record(s) will be lost. Sign out anyway?'), L('Se déconnecter', 'Sign out'), B.t('cancel'), go);
    else go();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var ctrls = B.$('.ctrls');
    if (ctrls && !B.$('#srvbtn')) { ctrls.insertAdjacentHTML('beforeend', '<button id="srvbtn" class="ghost" hidden></button><span id="srvstate" class="small"></span>'); }
    B.$('#srvbtn').onclick = function () { if (session) logout(false); else loginDialog(); };
    if (session) { applyIdentity(); B.render(); }
    if (!base) return;
    api('/health').then(function (h) {
      B.server.available = h.status === 'ok';
      if (session) return api('/auth/me').then(function () { sync(false); }).catch(function (e) { if (e.status === 401) logout(true); });
      header();
    }).catch(function () { B.server.available = false; header(); });
    // Background sync every 2 minutes while signed in and online.
    setInterval(function () { if (session && B.st.online) sync(false); }, 120000);
  });
})();
