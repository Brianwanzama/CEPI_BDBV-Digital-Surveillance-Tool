/* Keeping work safe on phones (loaded after api.js and auth.js):
 *  - the screen the person was on comes back after a refresh;
 *  - what is typed in a form is saved on the device as a draft and restored after a reload,
 *    a crash or an update from the server, until the form is saved;
 *  - a screen being filled in is not redrawn by the 30-second update;
 *  - the screen locks after 30 minutes without use (account password to unlock; works offline);
 *  - number fields with a usual value (temperature) start from it, not from 0.1.
 */
(function () {
  'use strict';
  var B = window.BDBV, L = function (f, e) { return B.L(f, e); }, esc = B.esc;
  var TABKEY = 'bdbv_last_tab', DKEY = 'bdbv_drafts:', ACT = 'bdbv_last_activity';
  var DRAFT_DAYS = 7, restoring = false;

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } return null; }
  function who() { return (B.st.auth && B.st.auth.username) || B.st.role || 'public'; }

  /* ---------- Screen kept after a refresh ---------- */
  try {
    var saved = sessionStorage.getItem(TABKEY);
    if (saved && B.st.auth && B.ROLES[B.st.role] && B.ROLES[B.st.role].indexOf(saved) >= 0) B.st.tab = saved;
  } catch (e) { /* ignore */ }

  /* ---------- Starting value for number fields (temperature) ---------- */
  document.addEventListener('focusin', function (e) { var el = e.target; if (el && el.dataset && el.dataset.start) el._last = el.value; }, true);
  document.addEventListener('input', function (e) {
    var el = e.target; if (!el || !el.dataset || !el.dataset.start) return;
    // Arrow keys, the wheel or the spinner on an empty field: start from the usual value.
    if (!e.inputType && !el._last) el.value = el.dataset.start;
    el._last = el.value;
  }, true);

  /* ---------- Drafts ---------- */
  var AUTH_FORMS = /^(loginform|cpform|reqform|fgform|lockform)$/;
  function container(el) { return (el.form || (el.closest && el.closest('form'))) || (el.closest && el.closest('[data-draft]')); }
  function scopeOf(c) {
    if (!c || (c.tagName === 'FORM' && AUTH_FORMS.test(c.id))) return null;
    var parts = [B.st.tab], d = c.closest('[data-draft]');
    if (d) parts.push(d.getAttribute('data-draft'));
    if (c.tagName === 'FORM') parts.push(c.id || 'form');
    if (B.st.editing) parts.push('edit-' + (B.st.editing.id || B.st.editing));
    return parts.join('|');
  }
  function draftable(el) { return el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && !/^(password|file|hidden|submit|button|search)$/.test(el.type) && !el.hasAttribute('data-nodraft'); }
  function fieldKey(el) { return el.name ? 'n:' + el.name + (el.type === 'radio' || el.type === 'checkbox' ? ':' + el.value : '') : (el.id ? 'i:' + el.id : null); }
  function allDrafts() { try { return JSON.parse(ls(DKEY + who()) || '{}'); } catch (e) { return {}; } }
  function putDrafts(d) { ls(DKEY + who(), Object.keys(d).length ? JSON.stringify(d) : null); }
  function snapshot(c) {
    var f = {}, any = false;
    Array.prototype.forEach.call(c.querySelectorAll('input, select, textarea'), function (el) {
      if (!draftable(el)) return; var k = fieldKey(el); if (!k) return;
      if (el.type === 'radio' || el.type === 'checkbox') { if (el.checked) { f[k] = true; any = true; } else f[k] = false; } else { f[k] = el.value; if (el.value) any = true; }
    });
    return any ? f : null;
  }
  var timers = {};
  function saveSoon(c) {
    var sc = scopeOf(c); if (!sc) return;
    clearTimeout(timers[sc]);
    timers[sc] = setTimeout(function () {
      if (!document.body.contains(c)) return;
      var d = allDrafts(), f = snapshot(c);
      if (f) d[sc] = { at: Date.now(), f: f }; else delete d[sc];
      putDrafts(d);
    }, 400);
  }
  function dropDraft(c) { var sc = scopeOf(c); if (!sc) return; clearTimeout(timers[sc]); var d = allDrafts(); if (d[sc]) { delete d[sc]; putDrafts(d); } }
  function fire(el, type) { el.dispatchEvent(new Event(type, { bubbles: true })); }
  function restore() {
    if (restoring) return;
    var view = document.getElementById('view'); if (!view) return;
    // Only fields that have just appeared are filled from a draft: a field already on the screen is
    // never overwritten, because the person may be typing in it.
    var fresh = Array.prototype.filter.call(view.querySelectorAll('input, select, textarea'), function (el) { if (el._draftSeen) return false; el._draftSeen = true; return draftable(el); });
    if (!fresh.length) return;
    var d = allDrafts(), n = 0;
    if (!Object.keys(d).length) return;
    restoring = true;
    try {
      fresh.forEach(function (el) {
        var c = container(el), sc = c && scopeOf(c), entry = sc && d[sc]; if (!entry) return;
        var k = fieldKey(el); if (!k || !(k in entry.f)) return;
        var val = entry.f[k];
        if (el.type === 'radio' || el.type === 'checkbox') { if (el.checked !== val) { el.checked = val; fire(el, 'change'); n++; } }
        else if (el.value !== val && val !== '') { el.value = val; fire(el, 'input'); fire(el, 'change'); n++; }
      });
    } finally { restoring = false; }
    if (n) { B.st.viewDirty = true; B.notify(L('Saisie non enregistrée restaurée sur cet appareil.', 'Unsaved entries restored on this device.'), 'ok'); }
  }
  // Drafts older than 7 days are removed.
  (function purge() {
    try {
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i); if (!k || k.indexOf(DKEY) !== 0) continue;
        var d = JSON.parse(localStorage.getItem(k) || '{}'), keep = {};
        Object.keys(d).forEach(function (s) { if (Date.now() - d[s].at < DRAFT_DAYS * 864e5) keep[s] = d[s]; });
        if (Object.keys(keep).length) localStorage.setItem(k, JSON.stringify(keep)); else localStorage.removeItem(k);
      }
    } catch (e) { /* ignore */ }
  })();
  B.clearDrafts = function (username) { ls(DKEY + (username || who()), null); };

  function onEdit(e) {
    if (!e.isTrusted || restoring) return;
    var el = e.target, view = document.getElementById('view');
    if (!view || !view.contains(el) || !draftable(el)) return;
    var c = container(el); if (!c || !scopeOf(c)) return;
    B.st.viewDirty = true;
    saveSoon(c);
  }
  document.addEventListener('input', onEdit, true);
  document.addEventListener('change', onEdit, true);
  // Saving a form (or acting on a record panel) ends its draft.
  document.addEventListener('submit', function (e) { var f = e.target; if (f && f.tagName === 'FORM') dropDraft(f); }, true);
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest && e.target.closest('button'); if (!btn || btn.type === 'submit') return;
    var c = btn.closest('[data-draft]'); if (c && !btn.closest('form') && (btn.classList.contains('primary') || btn.hasAttribute('data-step') || btn.hasAttribute('data-consumes'))) dropDraft(c);
  }, true);

  // Modules redraw their own panels (an alert, a sample, a contact) without a full redraw: restore
  // drafts whenever the screen's content changes.
  var moTimer = null;
  var mo = window.MutationObserver ? new MutationObserver(function () { if (restoring) return; clearTimeout(moTimer); moTimer = setTimeout(restore, 0); }) : null;
  document.addEventListener('DOMContentLoaded', function () { var v = document.getElementById('view'); if (mo && v) mo.observe(v, { childList: true, subtree: true }); });

  /* ---------- After every full redraw ---------- */
  var prevAfter = B.afterRender;
  B.afterRender = function () {
    if (prevAfter) prevAfter();
    try { if (B.st.auth) sessionStorage.setItem(TABKEY, B.st.tab); } catch (e) { /* ignore */ }
    restore();
  };

  /* ---------- Inactivity lock (server accounts) ---------- */
  var lastAct = +(ls(ACT) || 0) || Date.now(), locked = false;
  function limitMin() { var c = B.db().config || {}; return +c.lock_minutes > 0 ? +c.lock_minutes : 30; }
  function serverUser() { return B.st.auth && B.st.auth.mode === 'server'; }
  function touch() { if (locked) return; var now = Date.now(); if (now - lastAct > 15000 || !ls(ACT)) ls(ACT, String(now)); lastAct = now; }
  ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(function (ev) { document.addEventListener(ev, touch, { capture: true, passive: true }); });
  function check() {
    if (locked || !serverUser()) return;
    if (B.server && B.server.expired && B.server.expired()) { B.lock('expired'); return; }
    if (Date.now() - lastAct > limitMin() * 60000) B.lock('idle');
  }
  B.lock = function (reason) {
    if (!serverUser()) return;
    if (locked) { if (reason === 'expired') setMsg(); return; }
    locked = true;
    var name = (B.st.auth && B.st.auth.name) || '';
    var o = document.createElement('div'); o.id = 'lock'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-labelledby', 'lockt');
    o.innerHTML = '<div class="lockbox"><img src="assets/emblem.png" alt="" class="lockemb"><h2 id="lockt">' + L('Écran verrouillé', 'Screen locked') + '</h2>' +
      '<p id="lockwhy"></p><p class="small muted">' + esc(name) + '</p>' +
      '<form id="lockform" novalidate><label>' + L('Mot de passe', 'Password') + '<input type="password" id="lockpw" autocomplete="current-password"></label>' +
      '<p id="lockmsg" class="flag" hidden></p><button class="primary" type="submit">' + L('Déverrouiller', 'Unlock') + '</button></form>' +
      '<button class="ghost sm" type="button" id="lockother">' + L('Se connecter avec un autre compte', 'Sign in with another account') + '</button></div>';
    document.body.appendChild(o); document.body.classList.add('locked');
    function setMsg() {
      var w = document.getElementById('lockwhy'); if (!w) return;
      w.textContent = B.server && B.server.expired && B.server.expired()
        ? L('Votre session a expiré. Entrez votre mot de passe pour continuer. Les données non envoyées sont gardées.', 'Your session has ended. Enter your password to continue. Data not yet sent are kept.')
        : L('Verrouillé après ', 'Locked after ') + limitMin() + L(' minutes sans utilisation. Rien de ce que vous avez saisi n\'est perdu.', ' minutes without use. Nothing you entered has been lost.');
    }
    B.lock.setMsg = setMsg; setMsg();
    var pw = document.getElementById('lockpw'); setTimeout(function () { pw.focus(); }, 50);
    document.getElementById('lockform').onsubmit = function (e) {
      e.preventDefault();
      var m = document.getElementById('lockmsg'); m.hidden = true;
      if (!pw.value) { m.textContent = L('Entrez votre mot de passe.', 'Enter your password.'); m.hidden = false; return; }
      B.serverUnlock(pw.value).then(function (how) {
        unlock();
        if (how === 'local-expired') B.notify(L('Déverrouillé hors ligne. Votre mot de passe sera redemandé au retour du réseau, pour envoyer vos données.', 'Unlocked offline. You will be asked for your password again when the network returns, to send your data.'), 'ok');
      }).catch(function (err) {
        pw.value = '';
        m.textContent = err && err.message === 'offline_no_verifier'
          ? L('Connectez-vous à internet pour déverrouiller.', 'Connect to the internet to unlock.')
          : (B.authError ? B.authError(err) : L('Mot de passe incorrect.', 'Wrong password.'));
        m.hidden = false;
      });
    };
    // Another person on a shared phone: the current user's unsent records are kept for them.
    document.getElementById('lockother').onclick = function () { B.serverLogout(true); };
  };
  function unlock() {
    var o = document.getElementById('lock'); if (o) o.remove();
    document.body.classList.remove('locked'); locked = false; lastAct = Date.now(); ls(ACT, String(lastAct));
    B.render({ chromeOnly: true });
  }
  B.lockNow = function () { B.lock('idle'); };
  B.isLocked = function () { return locked; };
  setInterval(check, 20000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
  document.addEventListener('DOMContentLoaded', function () { setTimeout(check, 0); });

  /* ---------- "New information" in the header: tap to show ---------- */
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest && e.target.closest('#liveind');
    if (el && B.st.pendingRedraw) B.render({ keepScroll: true });
  });
})();
