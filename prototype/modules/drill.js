/* Behind every number: a click on a figure, a bar or a map area opens the list of exactly the
 * records it counts, each with a link to the record itself. And "My work": each person's own
 * figures (their assignments, their facility's alerts, their laboratory queue), on Home and on the
 * dashboard. Lists show IDs and places, never names; they only hold records already on the device,
 * which the server has filtered and redacted for this person's role.
 */
(function () {
  'use strict';
  var B = window.BDBV;
  var L = function (f, e) { return B.L(f, e); };
  var esc = function (x) { return B.esc(x); };
  var lbl2 = function (x) { return x ? (Array.isArray(x) ? L(x[0], x[1]) : String(x)) : ''; };
  function db() { return B.db(); }
  var place = function (g) { g = g || {}; return [g.village && B.nm(B.G.villages, g.village), g.zone && B.nm(B.G.zones, g.zone)].filter(function (x) { return x && x !== '-'; }).join(', ') || '-'; };

  // Side panels open below the tab bar, so every tab stays reachable while a panel is open.
  B.sheetTop = function (el) { var nav = document.getElementById('nav'), r = nav && !nav.hidden ? nav.getBoundingClientRect() : null; el.style.top = (r && r.bottom > 0 ? Math.round(r.bottom) : 0) + 'px'; };
  window.addEventListener('scroll', function () { Array.prototype.forEach.call(document.querySelectorAll('.sheet:not([hidden])'), function (s) { B.sheetTop(s); }); }, { passive: true });

  /* ---------- The list panel ---------- */
  function close() { var o = document.getElementById('drill'); if (o) o.remove(); }
  B.drillClose = close;
  B.drill = function (title, head, rows, note) {
    close();
    var o = document.createElement('div'); o.id = 'drill'; o.className = 'sheet';
    var shown = rows.slice(0, 500);
    o.innerHTML = '<div class="sheetbox" role="dialog" aria-label="' + esc(title) + '"><button type="button" class="ghost sm sheetclose" id="drillclose">&#10005; ' + L('Fermer', 'Close') + '</button>' +
      '<section class="card"><h3>' + esc(title) + ' <span class="muted">(' + rows.length + ')</span></h3>' + (note ? '<p class="small muted">' + esc(note) + '</p>' : '') +
      (rows.length ? '<div class="scroll"><table class="tbl small"><tr>' + head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '<th></th></tr>' +
        shown.map(function (r, i) { return '<tr>' + r.cells.map(function (c) { return '<td>' + esc(c == null ? '-' : c) + '</td>'; }).join('') + '<td>' + (r.go ? '<button type="button" class="sm" data-drillgo="' + i + '">' + L('Ouvrir', 'Open') + '</button>' : '') + '</td></tr>'; }).join('') +
        '</table></div>' + (rows.length > shown.length ? '<p class="small muted">' + L('500 premiers affichés ; l\'export contient tout.', 'First 500 shown; the export has all.') + '</p>' : '') +
        '<p><button type="button" class="sm ghost" id="drillcsv">' + L('Exporter (CSV)', 'Export (CSV)') + '</button></p>'
        : '<p class="muted">' + L('Aucun enregistrement.', 'No records.') + '</p>') + '</section></div>';
    document.body.appendChild(o); B.sheetTop(o);
    o.addEventListener('click', function (e) { if (e.target === o) close(); });
    o.querySelector('#drillclose').onclick = close;
    var cb = o.querySelector('#drillcsv'); if (cb) cb.onclick = function () { B.exportTable('csv', 'detail', title, [head].concat(rows.map(function (r) { return r.cells; }))); };
    Array.prototype.forEach.call(o.querySelectorAll('[data-drillgo]'), function (b) { b.onclick = function () { var r = shown[+b.getAttribute('data-drillgo')]; close(); r.go(); }; });
    o.querySelector('#drillclose').focus();
    B.audit('view_detail', 'dashboard', title, rows.length + ' record(s)');
  };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

  /* ---------- Rows for each kind of record ---------- */
  var H = {
    assessments: function () { return [L('ID du cas', 'Case ID'), L('Évalué le', 'Assessed'), L('Lieu', 'Place'), L('Structure', 'Facility'), L('Risque', 'Risk'), L('Classification', 'Classification'), L('Laboratoire', 'Laboratory'), L('Vérification', 'Verification')]; },
    queue: function () { return [L('ID d\'alerte', 'Alert ID'), L('Source / type', 'Source / type'), L('Lieu', 'Place'), L('Soumise', 'Submitted'), L('Étape', 'Stage'), L('Assignée à', 'Assigned to')]; },
    samples: function () { return [L('ID labo', 'Lab ID'), L('Cas', 'Case'), L('Type', 'Type'), L('Statut', 'Status'), L('Demandé le', 'Requested'), L('Résultat', 'Result')]; },
    reports: function () { return [L('Rapport', 'Report'), L('Date', 'Date'), L('Village', 'Village'), L('Valeur', 'Value')]; },
    alerts: function () { return [L('Alerte', 'Alert'), L('Cas', 'Case'), L('Créée', 'Created'), L('Acquittée', 'Acknowledged'), L('Mesures', 'Measures')]; },
    contacts: function () { return [L('Contact', 'Contact'), L('Lieu', 'Place'), L('Statut', 'Status'), L('Dernière exposition', 'Last exposure')]; }
  };
  var R = {
    assessments: function (l) { return l.map(function (a) { return { cells: [a.id, B.fmtDT(a.assessed_at), place(a.geo), a.geo && a.geo.facility ? B.nm(B.G.facilities, a.geo.facility) : '-', a.result ? B.t(a.result.category) : '-', B.classLabel(a.classification), B.labSummary ? B.labSummary(a.id).replace(/<[^>]+>/g, '') : '-', B.queueStatus ? B.queueStatus(a.id) || '-' : '-'], go: function () { B.st.lastId = a.id; B.go('result'); } }; }); },
    queue: function (l) { return l.map(function (a) { var s = a.stages || {}; return { cells: [a.id, (B.queue.typeLabel ? B.queue.typeLabel(a.type) : a.type), place(a.geo), B.fmtDT(a.submitted_at), B.queue.stageLabel ? B.queue.stageLabel(a) : '', s.assigned ? s.assigned.to : '-'], go: function () { B.queue.open(a.id); } }; }); },
    samples: function (l) { return l.map(function (s) { var A = B.labApi; return { cells: [s.lab_id || s.id, s.case_id, s.type || '-', lbl2(A.STATUS[s.status]) || s.status, s.request ? B.fmtDT(s.request.at) : '-', s.status === 'result_released' ? lbl2(A.RESULTS[s.result]) || '-' : L('non publié', 'not released')], go: function () { A.open(s.id); } }; }); },
    reports: function (l, field) { return l.map(function (r) { return { cells: [r.id, B.fmtDT(r.reported_at), r.village ? B.nm(B.G.villages, r.village) : '-', field ? (r.counts[field] || 0) : (r.events || []).length + L(' évènement(s)', ' event(s)')], go: B.queue.byRef(r.id) ? function () { B.queue.open(B.queue.byRef(r.id).id); } : null }; }); },
    alerts: function (l) { return l.map(function (a) { return { cells: [a.id, a.assessment_id, B.fmtDT(a.created_at || a.at), a.ack ? B.fmtDT(a.ack.at) : L('non', 'no'), (a.actions || []).length], go: function () { B.st.lastId = a.assessment_id; B.go('result'); } }; }); },
    contacts: function (l) { return l.map(function (c) { return { cells: [c.id, place(c.geo || { village: c.village, zone: c.zone }), c.status || '-', c.last_exposure || '-'], go: null }; }); }
  };
  B.drillOf = function (kind, title, list, note, field) { B.drill(title, H[kind](), R[kind](list, field), note); };

  /* ---------- My work ---------- */
  function me() { return (B.st.auth && B.st.auth.username) || ''; }
  function myName() { return B.user(); }
  function tiles() {
    var d = db(), role = B.st.role, out = [];
    var add = function (key, label, list, kind, cls, note) { out.push({ key: key, label: label, list: list, kind: kind, cls: cls || '', note: note }); };
    var q = d.queue || [], now = new Date();
    if (['surveillant', 'zone_officer'].indexOf(role) >= 0) {
      var zone = role === 'zone_officer' ? B.userCtx().zone : null;
      var mine = q.filter(function (a) { var s = a.stages.assigned; return s && (s.to_user ? s.to_user === me() : s.to === myName()) && !a.stages.approved; });
      var scope = q.filter(function (a) { return !zone || (a.geo && a.geo.zone === zone); });
      add('mine', L('Assignées à moi, en cours', 'Assigned to me, open'), mine, 'queue', mine.length ? 'k-AMBER' : '');
      add('toack', L('À accuser réception', 'To acknowledge'), scope.filter(function (a) { return !a.stages.acknowledged; }), 'queue');
      add('late', L('En retard', 'Overdue'), scope.filter(function (a) { var o = B.queue.overdue(a, now); return o && o.late; }), 'queue', 'k-RED');
      add('high', L('Priorité élevée, non démarrées', 'High priority, not started'), scope.filter(function (a) { return !a.stages.started && B.queue.rulePriority(a).level === 'high'; }), 'queue');
      add('decide', L('En attente de décision', 'Awaiting decision'), scope.filter(function (a) { return a.stages.completed && !a.stages.approved; }), 'queue');
    } else if (['soignant', 'clinician', 'facility_head'].indexOf(role) >= 0) {
      var fac = B.userCtx().facility;
      var A = d.assessments.filter(function (a) { return !fac || (a.geo && a.geo.facility === fac); });
      var ids = {}; A.forEach(function (a) { ids[a.id] = true; });
      add('alerts', L('Alertes à risque élevé à acquitter', 'High-risk alerts to acknowledge'), d.alerts.filter(function (a) { return !a.ack && ids[a.assessment_id]; }), 'alerts', 'k-RED');
      add('amber', L('Risque moyen à revoir', 'Medium risk to review'), A.filter(function (a) { return a.result && a.result.category === 'AMBER' && !(a.review && a.review.status === 'done'); }), 'assessments', 'k-AMBER');
      var S = (d.samples || []).filter(function (s) { return ids[s.case_id]; });
      add('wait', L('Tests en attente de résultat', 'Tests waiting for a result'), S.filter(function (s) { return ['result_released', 'repeat_required'].indexOf(s.status) < 0; }), 'samples');
      add('res', L('Résultats reçus (7 jours)', 'Results received (7 days)'), S.filter(function (s) { return s.status === 'result_released' && s.released_at && now - new Date(s.released_at) < 7 * 864e5; }), 'samples');
      add('ref', L('Contacts référés', 'Referred contacts'), (d.contacts || []).filter(function (c) { return c.status === 'referred' && (!fac || !c.referred_facility || c.referred_facility === fac); }), 'contacts');
    } else if (['lab', 'lab_manager'].indexOf(role) >= 0) {
      var SS = d.samples || [], by = function (sts) { return SS.filter(function (s) { return sts.indexOf(s.status) >= 0; }); };
      add('lreq', L('Demandes reçues', 'Requests received'), by(['requested', 'awaiting_collection']), 'samples', 'k-AMBER');
      add('lwork', L('En cours d\'analyse', 'Being analysed'), by(['collected', 'in_transit', 'received', 'under_analysis', 'awaiting_dispatch', 'analysed_onsite', 'referred_external', 'result_pending']), 'samples');
      add('lappr', L('Résultats à approuver', 'Results to approve'), by(['result_entered']), 'samples', role === 'lab_manager' ? 'k-RED' : '');
      add('lrep', L('À refaire', 'Repeat required'), by(['repeat_required']), 'samples');
      if (role === 'lab') add('lmine', L('Testés par moi', 'Tested by me'), SS.filter(function (s) { return s.tested_by && s.tested_by === myName(); }), 'samples');
    }
    return out;
  }
  B.myWorkHTML = function () {
    var T = tiles(); if (!T.length) return '';
    return '<section class="card mywork"><h3>' + L('Mon travail', 'My work') + ' <span class="small muted">· ' + esc(myName()) + '</span></h3><div class="kpis">' +
      T.map(function (x) { return '<button type="button" class="kpi kbtn ' + (x.list.length ? x.cls : '') + '" data-mywork="' + x.key + '"><div class="kv">' + x.list.length + '</div><div class="kl">' + esc(x.label) + '</div></button>'; }).join('') +
      '</div><p class="small muted">' + L('Touchez un chiffre pour voir exactement les enregistrements comptés.', 'Tap a number to see exactly the records it counts.') + '</p></section>';
  };
  B.bindMyWork = function (v) {
    Array.prototype.forEach.call(v.querySelectorAll('[data-mywork]'), function (b) {
      b.onclick = function () { var x = tiles().filter(function (t) { return t.key === b.getAttribute('data-mywork'); })[0]; if (x) B.drillOf(x.kind, x.label, x.list, x.note); };
    });
  };
})();
