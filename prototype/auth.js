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
    B.st.auth = { mode: mode, username: u.username, name: u.name, role: u.role, facility: u.facility || null, zone: u.zone || null, must_change: !!u.must_change_password };
    B.st.role = u.role;
    B.USER_NAMES[u.role] = [u.name, u.name];
    B.USER_CTX[u.role] = { facility: u.facility || undefined, zone: u.zone || undefined, lab: u.role === 'lab' ? u.name : undefined };
  };
  function store(v) { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch (e) { /* private mode */ } }

  B.signInDemo = function (username) {
    if (B.server && B.server.deployed) return false; // never on a deployment
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
  if (!B.serverMode && !(B.server && B.server.deployed)) {
    try { var saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved && saved.role) B.applyAuth(saved, 'demo'); } catch (e) { /* ignore */ }
  }
  if (!B.st.auth) { B.st.role = 'public'; B.st.tab = 'login'; }

  // Messages for the account endpoints (api.js passes the server's error code).
  var ERR = {
    invalid_credentials: ['Identifiant ou mot de passe incorrect.', 'Wrong username or password.'],
    account_pending: ['Votre demande de compte attend l\'approbation de l\'administrateur.', 'Your account request is waiting for the administrator\'s approval.'],
    account_rejected: ['Cette demande de compte a été refusée. Contactez l\'administrateur.', 'This account request was refused. Contact the administrator.'],
    account_disabled: ['Ce compte est désactivé. Contactez l\'administrateur.', 'This account is disabled. Contact the administrator.'],
    username_taken: ['Cet identifiant est déjà utilisé. Choisissez-en un autre.', 'This username is already taken. Choose another one.'],
    invalid_username: ['Identifiant : 3 à 32 caractères, lettres minuscules, chiffres, point, tiret.', 'Username: 3 to 32 characters, lower-case letters, digits, dot, dash.'],
    password_too_short: ['Mot de passe : au moins 10 caractères.', 'Password: at least 10 characters.'],
    password_needs_letters_and_digits: ['Le mot de passe doit contenir des lettres et des chiffres.', 'The password must contain letters and digits.'],
    password_contains_username: ['Le mot de passe ne doit pas contenir l\'identifiant.', 'The password must not contain the username.'],
    password_unchanged: ['Choisissez un mot de passe différent de l\'actuel.', 'Choose a password different from the current one.'],
    name_required: ['Indiquez votre nom.', 'Enter your name.'],
    contact_required: ['Indiquez un téléphone ou un e-mail.', 'Enter a phone number or e-mail.'],
    invalid_role: ['Choisissez une fonction.', 'Choose a role.'],
    rate_limited: ['Trop de tentatives. Réessayez plus tard.', 'Too many attempts. Try again later.'],
    mismatch: ['Les deux mots de passe ne sont pas identiques.', 'The two passwords do not match.']
  };
  B.authError = function (err) {
    var code = err && (err.message || err), m = ERR[code];
    if (m) return L(m[0], m[1]);
    return err && err.status ? L('Erreur du serveur (' + code + ').', 'Server error (' + code + ').') : L('Serveur injoignable. Réessayez.', 'Server unreachable. Try again.');
  };
  var mode = 'signin'; // signin | request | forgot
  var REQ_ROLES = ['soignant', 'clinician', 'reco', 'surveillant', 'zone_officer', 'lab', 'facility_head', 'decideur'];

  B.VIEWS.login = function (v) {
    var srv = B.server || {}, checking = srv.checking, server = srv.available;
    var langs = [['en', 'English'], ['fr', 'Français'], ['sw', 'Kiswahili']];
    var html = '<div class="signin"><section class="panel signin-main"><img class="signin-logo" src="assets/logo.png" alt="IDΣMU, Mathematical Modelling Unit, Uganda" width="640" height="310">' +
      '<p class="eyebrow">' + L('Accès réservé', 'Restricted access') + '</p>' +
      '<div class="authtabs" role="tablist"><button type="button" role="tab" data-mode="signin" aria-selected="' + (mode !== 'request') + '">' + L('Se connecter', 'Sign in') + '</button><button type="button" role="tab" data-mode="request" aria-selected="' + (mode === 'request') + '">' + L('Demander un compte', 'Request an account') + '</button></div>' +
      '<label class="inl">' + L('Langue', 'Language') + ' <select id="login-lang">' + langs.map(function (l) { return '<option value="' + l[0] + '"' + (B.st.lang === l[0] ? ' selected' : '') + '>' + l[1] + '</option>'; }).join('') + '</select></label>';
    var demoNote = !server && !checking ? '<p class="note">' + L('Mode démonstration : aucun serveur n\'est connecté, la demande n\'est donc pas envoyée. Sur le système déployé, elle va à l\'administrateur du système.', 'Demonstration mode: no server is connected, so this request is not sent. On the deployed system it goes to the system administrator.') + '</p>' : '';
    if (checking) {
      html += '<p class="muted">' + L('Connexion au serveur… Un serveur en veille peut mettre jusqu\'à une minute à répondre.', 'Connecting to the server… A server that was asleep can take up to a minute to answer.') + '</p>';
    } else if (srv.failed) {
      html += '<p class="flag">' + L('Le serveur ne répond pas. Vérifiez la connexion internet puis réessayez.', 'The server is not answering. Check the internet connection and try again.') + '</p><button type="button" class="primary" id="srv-retry">' + L('Réessayer', 'Try again') + '</button>';
    } else if (mode === 'request') {
      html += '<form id="reqform" class="authform" autocomplete="on"><p class="small">' + L('Votre demande est examinée par l\'administrateur du système, qui attribue votre fonction et votre structure. Vous pourrez vous connecter après approbation.', 'Your request is reviewed by the system administrator, who assigns your role and workplace. You can sign in once it is approved.') + '</p>' +
        '<label>' + L('Nom complet', 'Full name') + '<input id="rq-name" autocomplete="name" required maxlength="80"></label>' +
        '<label>' + L('Téléphone ou e-mail', 'Phone or e-mail') + '<input id="rq-contact" autocomplete="tel" required maxlength="120"></label>' +
        '<label>' + L('Fonction demandée', 'Role requested') + '<select id="rq-role" required><option value="">-</option>' + REQ_ROLES.map(function (r) { return '<option value="' + r + '">' + esc(B.t('role_' + r)) + '</option>'; }).join('') + '</select></label>' +
        '<label>' + L('Structure / zone de santé', 'Workplace / health zone') + '<input id="rq-work" maxlength="300" placeholder="' + L('ex. CS Aru 1, ZS Aru', 'e.g. HC Aru 1, HZ Aru') + '"></label>' +
        '<label>' + L('Identifiant souhaité', 'Username') + '<input id="rq-user" autocomplete="username" autocapitalize="none" required pattern="[a-z0-9._\\-]{3,32}" maxlength="32"></label>' +
        '<label>' + L('Mot de passe (10 caractères ou plus, lettres et chiffres)', 'Password (10+ characters, letters and digits)') + '<input id="rq-pass" type="password" autocomplete="new-password" required minlength="10"></label>' +
        '<label>' + L('Confirmer le mot de passe', 'Confirm password') + '<input id="rq-pass2" type="password" autocomplete="new-password" required minlength="10"></label>' +
        '<button class="primary" type="submit">' + L('Envoyer la demande', 'Send request') + '</button></form>' + demoNote;
    } else if (mode === 'forgot') {
      html += '<form id="fgform" class="authform"><h2>' + L('Mot de passe oublié', 'Forgot password') + '</h2><p class="small">' + L('Indiquez votre identifiant et un moyen de vous joindre. L\'administrateur du système vérifie votre identité et vous remet un mot de passe temporaire, à changer à la première connexion.', 'Enter your username and a way to reach you. The system administrator checks who you are and gives you a temporary password, which you change at your first sign-in.') + '</p>' +
        '<label>' + L('Identifiant', 'Username') + '<input id="fg-user" autocomplete="username" autocapitalize="none" required maxlength="32"></label>' +
        '<label>' + L('Téléphone ou e-mail', 'Phone or e-mail') + '<input id="fg-contact" required maxlength="120"></label>' +
        '<button class="primary" type="submit">' + L('Envoyer', 'Send') + '</button> <button type="button" class="ghost" data-mode="signin">' + L('Retour', 'Back') + '</button></form>' + demoNote;
    } else if (server) {
      html += '<form id="loginform" class="authform" autocomplete="on"><label>' + L('Identifiant', 'Username') + '<input id="login-user" autocomplete="username" autocapitalize="none" required></label>' +
        '<label>' + L('Mot de passe', 'Password') + '<input id="login-pass" type="password" autocomplete="current-password" required></label>' +
        '<button class="primary" type="submit">' + L('Se connecter', 'Sign in') + '</button>' +
        '<button type="button" class="linkbtn" data-mode="forgot">' + L('Mot de passe oublié ?', 'Forgot password?') + '</button></form>' +
        '<p class="disclaimer small">' + L('Pilote : données synthétiques uniquement. Ne saisissez pas de données réelles de patients.', 'Pilot: synthetic data only. Do not enter real patient data.') + '</p>';
    } else {
      html += '<p class="note">' + L('Mode démonstration : aucun serveur n\'est connecté. Choisissez un compte de démonstration. Dans le système déployé, chaque personne se connecte avec son propre mot de passe.', 'Demonstration mode: no server is connected. Choose a demonstration account. In the deployed system each person signs in with their own password.') + '</p>' +
        '<div class="accounts">' + DEMO.map(function (a) { return '<button class="account" data-demo="' + a[0] + '"><span class="acc-role">' + esc(B.t('role_' + a[1])) + '</span><span class="acc-user">' + esc(a[0]) + '</span></button>'; }).join('') + '</div>' +
        '<button type="button" class="linkbtn" data-mode="forgot">' + L('Mot de passe oublié ?', 'Forgot password?') + '</button>';
    }
    html += '<div id="authmsg" aria-live="polite"></div></section><section class="panel signin-public"><p class="eyebrow">' + L('Pas de compte nécessaire', 'No account needed') + '</p><h2>' + L('Signaler un évènement de santé', 'Report a health event') + '</h2>' +
      '<p>' + L('Un décès inexpliqué, plusieurs malades dans une famille, une inhumation à risque ? Tout le monde peut le signaler, de façon anonyme si vous le souhaitez.', 'An unexplained death, several sick people in one family, a risky burial? Anyone can report it, anonymously if you wish.') + '</p>' +
      '<button class="big" id="go-public">' + L('Faire un signalement', 'Make a report') + '</button></section></div>';
    v.innerHTML = html;
    var msg = function (text, kind) { B.$('#authmsg', v).innerHTML = '<p class="' + (kind === 'ok' ? 'card ok' : 'flag') + '">' + esc(text) + '</p>'; };
    B.$('#login-lang', v).onchange = function () { B.st.lang = this.value; try { localStorage.setItem('bdbv_proto_lang', this.value); } catch (e) { /* ignore */ } B.render(); };
    B.$('#go-public', v).onclick = B.reportAsPublic;
    B.$$('[data-mode]', v).forEach(function (b) { b.onclick = function () { mode = b.getAttribute('data-mode'); B.VIEWS.login(v); }; });
    B.$$('[data-demo]', v).forEach(function (b) { b.onclick = function () { B.signInDemo(b.getAttribute('data-demo')); }; });
    if (B.$('#srv-retry', v)) B.$('#srv-retry', v).onclick = function () { B.retryServer(); };
    var f = B.$('#loginform', v);
    if (f) {
      B.$('#login-user', v).focus();
      f.onsubmit = function (e) {
        e.preventDefault();
        var btn = f.querySelector('button[type=submit]'); btn.disabled = true;
        B.serverLogin(B.$('#login-user', v).value.trim(), B.$('#login-pass', v).value).catch(function (err) { btn.disabled = false; msg(B.authError(err)); });
      };
    }
    var rf = B.$('#reqform', v);
    if (rf) rf.onsubmit = function (e) {
      e.preventDefault();
      if (B.$('#rq-pass', v).value !== B.$('#rq-pass2', v).value) return msg(B.authError('mismatch'));
      if (!server) return msg(L('Mode démonstration : demande non envoyée (aucun serveur).', 'Demonstration mode: request not sent (no server).'));
      var btn = rf.querySelector('button[type=submit]'); btn.disabled = true;
      B.serverSignup({ name: B.$('#rq-name', v).value, contact: B.$('#rq-contact', v).value, role: B.$('#rq-role', v).value, workplace: B.$('#rq-work', v).value, username: B.$('#rq-user', v).value.trim().toLowerCase(), password: B.$('#rq-pass', v).value })
        .then(function () { rf.reset(); btn.disabled = false; msg(L('Demande envoyée. L\'administrateur du système va l\'examiner ; vous pourrez vous connecter après approbation.', 'Request sent. The system administrator will review it; you can sign in once it is approved.'), 'ok'); })
        .catch(function (err) { btn.disabled = false; msg(B.authError(err)); });
    };
    var ff = B.$('#fgform', v);
    if (ff) ff.onsubmit = function (e) {
      e.preventDefault();
      if (!server) return msg(L('Mode démonstration : demande non envoyée (aucun serveur).', 'Demonstration mode: request not sent (no server).'));
      var btn = ff.querySelector('button[type=submit]'); btn.disabled = true;
      B.serverForgot({ username: B.$('#fg-user', v).value.trim().toLowerCase(), contact: B.$('#fg-contact', v).value })
        .then(function () { ff.reset(); btn.disabled = false; msg(L('Demande reçue. Si ce compte existe, l\'administrateur du système vous contactera avec un mot de passe temporaire.', 'Request received. If this account exists, the system administrator will contact you with a temporary password.'), 'ok'); })
        .catch(function (err) { btn.disabled = false; msg(B.authError(err)); });
    };
  };

  // Change password (forced after a temporary password; also from the Home screen).
  B.VIEWS.changepw = function (v) {
    var forced = !!(B.st.auth && B.st.auth.must_change);
    v.innerHTML = '<div class="signin one"><section class="panel"><p class="eyebrow">' + L('Compte', 'Account') + '</p><h2>' + L('Changer le mot de passe', 'Change password') + '</h2>' +
      (forced ? '<p class="note">' + L('Vous utilisez un mot de passe temporaire. Choisissez votre propre mot de passe pour continuer.', 'You are using a temporary password. Choose your own password to continue.') + '</p>' : '') +
      '<form id="cpform" class="authform"><label>' + L('Mot de passe actuel', 'Current password') + '<input id="cp-cur" type="password" autocomplete="current-password" required></label>' +
      '<label>' + L('Nouveau mot de passe (10 caractères ou plus, lettres et chiffres)', 'New password (10+ characters, letters and digits)') + '<input id="cp-new" type="password" autocomplete="new-password" required minlength="10"></label>' +
      '<label>' + L('Confirmer le nouveau mot de passe', 'Confirm new password') + '<input id="cp-new2" type="password" autocomplete="new-password" required minlength="10"></label>' +
      '<button class="primary" type="submit">' + L('Enregistrer', 'Save') + '</button>' + (forced ? '' : ' <button type="button" class="ghost" id="cp-back">' + L('Annuler', 'Cancel') + '</button>') + '</form><div id="authmsg" aria-live="polite"></div></section></div>';
    var msg = function (text) { B.$('#authmsg', v).innerHTML = '<p class="flag">' + esc(text) + '</p>'; };
    if (B.$('#cp-back', v)) B.$('#cp-back', v).onclick = function () { B.go('home'); };
    B.$('#cpform', v).onsubmit = function (e) {
      e.preventDefault();
      if (B.$('#cp-new', v).value !== B.$('#cp-new2', v).value) return msg(B.authError('mismatch'));
      var btn = this.querySelector('button[type=submit]'); btn.disabled = true;
      B.serverChangePassword(B.$('#cp-cur', v).value, B.$('#cp-new', v).value)
        .then(function () { B.notify(L('Mot de passe modifié.', 'Password changed.'), 'ok'); })
        .catch(function (err) { btn.disabled = false; msg(B.authError(err)); });
    };
  };

  // Test helper: sign in with the demonstration account of a role.
  window.BDBVApp.signInDemoRole = function (role) {
    if (B.server && B.server.deployed) return false;
    if (role === 'public') { if (B.st.auth) B.signOut(); B.reportAsPublic(); return true; }
    var a = DEMO.filter(function (x) { return x[1] === role; })[0];
    return a ? B.signInDemo(a[0]) : false;
  };
  B.DEMO_ACCOUNTS = DEMO;
})();
