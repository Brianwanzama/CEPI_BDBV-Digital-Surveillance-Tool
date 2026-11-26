/* Sign-in. Everyone except the public must sign in.
 *
 * - With a server (deployed system): username and password, checked by the server
 *   (api.js). The role, facility and zone come from the account.
 * - Without a server (offline demonstration, single web page): the screen says so and
 *   offers the demonstration accounts. They have no password because there is nothing
 *   to protect them against in a browser-only demo; the deployed system always uses
 *   real passwords.
 * - Public reporters never sign in: they reach the event-report form directly.
 */
(function () {
  'use strict';
  var B = window.BDBV;
  var L = function (f, e) { return B.L(f, e); };
  var esc = function (x) { return B.esc(x); };
  var KEY = 'bdbv_demo_session';
  // Same accounts as backend/src/seed.js
  var DEMO = [
    ['reco.aru', 'reco', 'RECO ARU1-001', null, 'Z-aru'],
    ['nurse.aru', 'soignant', 'N. Kahindo', 'Z-aru-A1-F', 'Z-aru'],
    ['clinician.aru', 'clinician', 'Dr K. Lusamba', 'Z-aru-A1-F', 'Z-aru'],
    ['surveillance', 'surveillant', 'J. Mapendo', null, null],
    ['lab', 'lab', 'P. Ndjoli', null, null],
    ['head.aru', 'facility_head', 'M. Furaha', 'Z-aru-A1-F', 'Z-aru'],
    ['zone.aru', 'zone_officer', 'R. Kambale', null, 'Z-aru'],
    ['admin.ph', 'decideur', 'A. Baraka', null, null],
    ['sysadmin', 'sysadmin', 'T. Ilunga', null, null]
  ];

  // Apply an identity (from the server or a demo account).
  B.applyAuth = function (u, mode) {
    B.st.auth = { mode: mode, username: u.username, name: u.name, role: u.role, facility: u.facility || null, zone: u.zone || null };
    B.st.role = u.role;
    B.USER_NAMES[u.role] = [u.name, u.name];
    B.USER_CTX[u.role] = { facility: u.facility || undefined, zone: u.zone || undefined, lab: u.role === 'lab' ? u.name : undefined };
  };
  function store(v) { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch (e) { /* private mode */ } }

  B.signInDemo = function (username) {
    var a = DEMO.filter(function (x) { return x[0] === username; })[0];
    if (!a) return false;
    var u = { username: a[0], role: a[1], name: a[2] + ' [DEMO]', facility: a[3], zone: a[4] };
    B.applyAuth(u, 'demo'); store(u);
    B.audit('login', 'session', u.username, 'demo');
    B.st.tab = B.ROLES[u.role][0]; B.st.editing = null; B.st.prefill = null;
    B.render();
    return true;
  };
  B.signOut = function () {
    if (B.st.auth && B.st.auth.mode === 'server' && B.serverLogout) { B.serverLogout(false); return; }
    if (B.st.auth) B.audit('logout', 'session', B.st.auth.username);
    B.st.auth = null; store(null);
    B.st.role = 'public'; B.st.tab = 'login'; B.st.editing = null; B.st.prefill = null;
    B.render();
  };
  B.reportAsPublic = function () { B.st.role = 'public'; B.st.tab = 'rumour'; B.render(); };

  // Restore a demonstration session (not when a server session exists: api.js handles that).
  if (!B.serverMode) {
    try { var saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved && saved.role) B.applyAuth(saved, 'demo'); } catch (e) { /* ignore */ }
  }
  if (!B.st.auth) { B.st.role = 'public'; B.st.tab = 'login'; }

  B.VIEWS.login = function (v) {
    var srv = B.server || {}, checking = srv.checking, server = srv.available;
    var langs = [['fr', 'Français'], ['en', 'English'], ['sw', 'Kiswahili']];
    var html = '<div class="signin"><section class="panel signin-main">' +
      '<p class="eyebrow">' + L('Accès réservé', 'Restricted access') + '</p><h2>' + L('Connexion', 'Sign in') + '</h2>' +
      '<label class="inl">' + L('Langue', 'Language') + ' <select id="login-lang">' + langs.map(function (l) { return '<option value="' + l[0] + '"' + (B.st.lang === l[0] ? ' selected' : '') + '>' + l[1] + '</option>'; }).join('') + '</select></label>';
    if (checking) {
      html += '<p class="muted">' + L('Recherche du serveur…', 'Looking for the server…') + '</p>';
    } else if (server) {
      html += '<form id="loginform" autocomplete="on"><label>' + L('Identifiant', 'Username') + '<input id="login-user" autocomplete="username" autocapitalize="none" required></label>' +
        '<label>' + L('Mot de passe', 'Password') + '<input id="login-pass" type="password" autocomplete="current-password" required></label>' +
        '<button class="primary" type="submit">' + L('Se connecter', 'Sign in') + '</button></form>' +
        '<p class="fine">' + L('Pilote : données synthétiques uniquement. Ne saisissez pas de données réelles de patients.', 'Pilot: synthetic data only. Do not enter real patient data.') + '</p>';
    } else {
      html += '<p class="note">' + L('Mode démonstration : aucun serveur n\'est connecté. Choisissez un compte de démonstration. Dans le système déployé, chaque personne se connecte avec son propre mot de passe.', 'Demonstration mode: no server is connected. Choose a demonstration account. In the deployed system each person signs in with their own password.') + '</p>' +
        '<div class="accounts">' + DEMO.map(function (a) { return '<button class="account" data-demo="' + a[0] + '"><span class="acc-role">' + esc(B.t('role_' + a[1])) + '</span><span class="acc-user">' + esc(a[0]) + '</span></button>'; }).join('') + '</div>';
    }
    html += '</section><section class="panel signin-public"><p class="eyebrow">' + L('Pas de compte nécessaire', 'No account needed') + '</p><h2>' + L('Signaler un évènement de santé', 'Report a health event') + '</h2>' +
      '<p>' + L('Un décès inexpliqué, plusieurs malades dans une famille, une inhumation à risque ? Tout le monde peut le signaler, de façon anonyme si vous le souhaitez.', 'An unexplained death, several sick people in one family, a risky burial? Anyone can report it, anonymously if you wish.') + '</p>' +
      '<button class="big" id="go-public">' + L('Faire un signalement', 'Make a report') + '</button></section></div>';
    v.innerHTML = html;
    B.$('#login-lang', v).onchange = function () { B.st.lang = this.value; try { localStorage.setItem('bdbv_proto_lang', this.value); } catch (e) { /* ignore */ } B.render(); };
    B.$('#go-public', v).onclick = B.reportAsPublic;
    B.$$('[data-demo]', v).forEach(function (b) { b.onclick = function () { B.signInDemo(b.getAttribute('data-demo')); }; });
    var f = B.$('#loginform', v);
    if (f) {
      B.$('#login-user', v).focus();
      f.onsubmit = function (e) {
        e.preventDefault();
        var btn = f.querySelector('button'); btn.disabled = true;
        B.serverLogin(B.$('#login-user', v).value.trim(), B.$('#login-pass', v).value).catch(function (err) {
          btn.disabled = false;
          B.notify(err.status === 401 ? L('Identifiant ou mot de passe incorrect.', 'Wrong username or password.') : L('Serveur injoignable. Réessayez.', 'Server unreachable. Try again.'), 'err');
        });
      };
    }
  };

  // Test helper: sign in with the demonstration account of a role.
  window.BDBVApp.signInDemoRole = function (role) {
    if (role === 'public') { if (B.st.auth) B.signOut(); B.reportAsPublic(); return true; }
    var a = DEMO.filter(function (x) { return x[1] === role; })[0];
    return a ? B.signInDemo(a[0]) : false;
  };
  B.DEMO_ACCOUNTS = DEMO;
})();
