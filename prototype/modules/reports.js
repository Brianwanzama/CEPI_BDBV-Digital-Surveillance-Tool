/* Reports and data export: 10 report types, common filters, CSV / Excel / PDF.
 * Identifiers (names, phone numbers) are included only for roles allowed to export
 * them, only on request, and only with a reason that is written to the audit log.
 */
(function () {
  'use strict';
  var B = window.BDBV;
  var L = function (f, e) { return B.L(f, e); };
  var esc = function (x) { return B.esc(x); };
  var DAY = 86400000;
  function db() { return B.db(); }

  /* ---------- file export ---------- */
  var downloads = null;
  if (window.claude && typeof window.claude.use === 'function') window.claude.use('downloads').then(function (d) { downloads = d; }).catch(function () {});
  function saveBlob(filename, blob) {
    if (downloads) return downloads.save({ filename: filename, data: blob }).catch(function (e) { if (e && e.code !== 'cancelled') B.notify(L('Téléchargement impossible : ', 'Download failed: ') + (e.code || ''), 'err'); });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    return Promise.resolve();
  }
  function csv(rows) {
    return '﻿' + rows.map(function (r) { return r.map(function (c) { var s = c == null ? '' : String(c); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(','); }).join('\r\n');
  }
  function stamp() { return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-'); }
  // Exposed for other modules (map, facility).
  B.exportTable = function (fmt, base, title, rows) {
    var name = base + '_' + stamp();
    var meta = L('Prototype - données synthétiques. Généré le ', 'Prototype - synthetic data. Generated ') + B.fmtDT(new Date().toISOString()) + L(' par ', ' by ') + B.user();
    if (fmt === 'csv') return saveBlob(name + '.csv', new Blob([csv(rows)], { type: 'text/csv;charset=utf-8' }));
    if (fmt === 'xlsx') {
      if (!window.XLSX) { B.notify(L('Bibliothèque Excel non chargée.', 'Excel library not loaded.'), 'err'); return; }
      var wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet([[title], [meta], []].concat(rows));
      XLSX.utils.book_append_sheet(wb, ws, 'Rapport');
      return saveBlob(name + '.xlsx', new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    }
    if (fmt === 'pdf') {
      if (!window.jspdf || !window.jspdf.jsPDF) { B.notify(L('Bibliothèque PDF non chargée.', 'PDF library not loaded.'), 'err'); return; }
      var doc = new window.jspdf.jsPDF({ orientation: rows[0] && rows[0].length > 7 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
      doc.setFontSize(13); doc.text(title, 30, 32); doc.setFontSize(8); doc.text(meta, 30, 46);
      doc.autoTable({ head: [rows[0].map(String)], body: rows.slice(1).map(function (r) { return r.map(function (c) { return c == null ? '' : String(c); }); }), startY: 56, styles: { fontSize: 6.5, cellPadding: 2 }, headStyles: { fillColor: [15, 61, 94] }, margin: { left: 30, right: 30 } });
      return saveBlob(name + '.pdf', doc.output('blob'));
    }
  };

  /* ---------- report definitions ---------- */
  var TYPES = {
    daily: ['Synthèse quotidienne de surveillance', 'Daily surveillance summary'],
    weekly: ['Rapport épidémiologique hebdomadaire', 'Weekly epidemiological report'],
    cases: ['Rapport d\'investigation des cas', 'Case investigation report'],
    contacts: ['Rapport de suivi des contacts', 'Contact tracing report'],
    lab: ['Rapport de surveillance laboratoire', 'Laboratory surveillance report'],
    alerts: ['Rapport des rumeurs et alertes communautaires', 'Community rumour and alert report'],
    deaths: ['Rapport de surveillance des décès et inhumations', 'Burial and death surveillance report'],
    facility: ['Rapport de performance des FOSA', 'Facility performance report'],
    tat: ['Rapport des délais de vérification', 'Verification turnaround time report'],
    geo: ['Rapport géographique de surveillance', 'Geographical surveillance report']
  };
  var ROW_LEVEL = ['cases', 'contacts', 'lab'];
  var ACCESS = { surveillant: Object.keys(TYPES), zone_officer: Object.keys(TYPES), decideur: ['daily', 'weekly', 'alerts', 'deaths', 'facility', 'tat', 'geo'], lab: ['lab'], facility_head: ['facility', 'daily'] };
  function allowed() { return ACCESS[B.st.role] || []; }

  function zoneName(id) { return id ? B.nm(B.G.zones, id) : ''; }
  function provName(id) { return id ? B.nm(B.G.provinces, id) : ''; }
  function geoMatch(g, f) { return B.inGeo(g || {}, { province: f.province, zone: f.zone, area: f.area, village: f.village, facility: f.facility }); }
  function inRange(d, f) { if (!d) return true; var t = new Date(d); return (!f.from || t >= new Date(f.from)) && (!f.to || t <= new Date(f.to + 'T23:59:59')); }
  function occLabel(c) { var o = B.OCCUPATIONS.filter(function (x) { return x[0] === c; })[0]; return o && c ? B.L(o[1], o[2]) : ''; }
  function isoWeek(d) { d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); var day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day); var y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return d.getUTCFullYear() + '-S' + String(Math.ceil((((d - y0) / DAY) + 1) / 7)).padStart(2, '0'); }
  function cases(f) {
    return db().assessments.filter(function (a) {
      return geoMatch(a.geo, f) && inRange(a.assessed_at, f) && (!f.cls || (a.classification && a.classification.status === f.cls)) &&
        (!f.occ || a.person.occ === f.occ) && (!f.age || (a.person.age_group || B.ageGroup(a.person.age)) === f.age) &&
        (!f.labst || labState(a) === f.labst) && (!f.vstat || B.outcomeOf(a.id) === f.vstat);
    });
  }
  function labState(a) { var cl = B.labApi.caseLab(a.id); return cl.result ? 'result_' + cl.result : (cl.awaitingResult ? 'awaiting_result' : (cl.awaitingTest ? 'awaiting_test' : 'none')); }
  function reports(f) { return db().reports.filter(function (r) { return geoMatch({ province: r.province, zone: r.zone, area: r.area, village: r.village }, Object.assign({}, f, { facility: '' })) && inRange(r.reported_at, f); }); }
  function indicators(A, P, Q, C, S) {
    var sum = function (k) { return P.reduce(function (s, r) { return s + (r.counts[k] || 0); }, 0); };
    return [A.length, A.filter(function (a) { return a.result.category === 'RED'; }).length, A.filter(function (a) { return a.result.category === 'AMBER'; }).length, A.filter(function (a) { return a.result.category === 'GREEN'; }).length,
      A.filter(function (a) { return a.classification && a.classification.status === 'confirmed'; }).length, sum('deaths_total'), sum('deaths_unexplained'), sum('deaths_suspected_ebola'),
      Q.length, Q.filter(function (q) { return q.outcome === 'verified'; }).length, C.length, S.length, S.filter(function (s) { return s.result === 'positive' && s.status === 'result_released'; }).length];
  }
  var IND_HEAD = function () { return [L('Dépistés', 'Screened'), 'ROUGE/RED', 'ORANGE/AMBER', 'VERT/GREEN', L('Confirmés (labo)', 'Confirmed (lab)'), L('Décès communautaires', 'Community deaths'), L('Décès inexpliqués', 'Unexplained deaths'), L('Décès suspects Ebola', 'Suspected Ebola deaths'), L('Alertes soumises', 'Alerts submitted'), L('Alertes vérifiées', 'Alerts verified'), L('Contacts identifiés', 'Contacts identified'), L('Échantillons', 'Samples'), L('Positifs', 'Positive')]; };

  B.reportRows = function (type, f) {
    f = f || {}; var d = db(), ident = !!f.identifiers && B.can('export_identifiable');
    var title = B.L(TYPES[type][0], TYPES[type][1]), rows;
    if (type === 'facility') {
      var facs = B.G.facilities.filter(function (x) { return (!f.facility || x.id === f.facility) && x.type === 'hc'; });
      if (B.st.role === 'facility_head') facs = facs.filter(function (x) { return x.id === (B.userCtx().facility); });
      rows = [[L('FOSA', 'Facility'), L('Zone', 'Zone'), L('Dépistés', 'Screened'), 'ROUGE', 'ORANGE', 'VERT', L('Alertes', 'Alerts'), L('En attente de revue', 'Awaiting review'), L('Vérifiées', 'Verified'), L('Transit', 'Holding'), L('Attente labo', 'Awaiting lab'), L('Positifs', 'Positive'), L('Négatifs', 'Negative'), L('Contacts', 'Contacts'), L('Suivis', 'Followed'), L('Transférés', 'Transferred'), L('Sortis', 'Discharged'), L('Décédés', 'Deceased'), L('Dépistage→revue (min)', 'Screening→review (min)'), L('Soumission→vérification (min)', 'Submission→verification (min)'), L('Goulots', 'Bottlenecks')]].concat(facs.map(function (fa) {
        var s = B.facilityStats(fa.id, f.days || 'all'), ar = B.byId(B.G.areas, fa.area);
        return [fa.name, zoneName(ar.zone), s.n, s.cnt.RED, s.cnt.AMBER, s.cnt.GREEN, s.alerts, s.awaitingReview, s.verified, s.referredHolding, s.awaitRes, s.pos, s.neg, s.contacts, s.followed, s.transferred, s.discharged, s.deceased, s.reviewMean == null ? '' : Math.round(s.reviewMean), s.verifMean == null ? '' : Math.round(s.verifMean), s.bottlenecks.map(function (b) { return b[0] + ' ' + b[1]; }).join('; ')];
      }));
    } else if (type === 'daily' || type === 'weekly') {
      var A = cases(f), P = reports(f), Q = d.queue.filter(function (q) { return geoMatch(q.geo, Object.assign({}, f, { facility: '' })) && inRange(q.submitted_at, f); }), C = d.contacts.filter(function (c) { return geoMatch(c.geo, Object.assign({}, f, { facility: '' })) && inRange(c.identified_at, f); }), S = d.samples.filter(function (s) { var a = B.byId(d.assessments, s.case_id); return a && geoMatch(a.geo, f) && inRange(s.collected_at, f); });
      var keyOf = type === 'daily' ? function (x) { return B.ymd(new Date(x)); } : function (x) { return isoWeek(new Date(x)); };
      var keys = {};
      A.forEach(function (a) { keys[keyOf(a.assessed_at)] = 1; }); P.forEach(function (r) { keys[keyOf(r.reported_at)] = 1; });
      rows = [[type === 'daily' ? L('Jour', 'Day') : L('Semaine épidémiologique', 'Epi week')].concat(IND_HEAD())].concat(Object.keys(keys).sort().reverse().map(function (k2) {
        var pick = function (list, fld) { return list.filter(function (x) { return keyOf(x[fld]) === k2; }); };
        return [k2].concat(indicators(pick(A, 'assessed_at'), pick(P, 'reported_at'), pick(Q, 'submitted_at'), pick(C, 'identified_at'), pick(S, 'collected_at')));
      }));
    } else if (type === 'cases') {
      rows = [['ID'].concat(ident ? [L('Nom', 'Name'), L('Téléphone', 'Phone')] : []).concat([L('Date', 'Date'), L('Province', 'Province'), L('Zone', 'Zone'), L('Village', 'Village'), L('FOSA', 'Facility'), L('Tranche d\'âge', 'Age group'), L('Sexe', 'Sex'), L('Profession', 'Occupation'), L('Catégorie', 'Category'), 'Score', L('Classification', 'Classification'), L('Prise en charge', 'Care status'), L('Début', 'Onset'), L('Expositions (oui)', 'Exposures (yes)'), L('Laboratoire', 'Laboratory'), L('Vérification', 'Verification'), L('Version des règles', 'Rule set')])].concat(cases(f).map(function (a) {
        var pp = (B.revealed && B.revealed[a.id]) || a.person;
        return [a.id].concat(ident ? [pp.last + ' ' + pp.first, pp.phone || ''] : []).concat([B.ymd(new Date(a.assessed_at)), provName(a.geo.province), zoneName(a.geo.zone), B.nm(B.G.villages, a.geo.village), B.nm(B.G.facilities, a.geo.facility), a.person.age_group || B.ageGroup(a.person.age), a.person.sex, occLabel(a.person.occ), a.result.category, a.result.score, B.classLabel(a.classification), B.careLabel(a), a.clinical.onset_date || '',
          Object.keys(a.exposures).filter(function (k3) { return a.exposures[k3].s === 'yes'; }).join(' '), labState(a), B.outcomeOf(a.id) || '', a.result.rule_set]);
      }));
    } else if (type === 'contacts') {
      var CS = B.contactsApi.STATUS;
      rows = [['ID'].concat(ident ? [L('Nom', 'Name'), L('Téléphone', 'Phone'), L('Adresse', 'Address')] : []).concat([L('Tranche d\'âge', 'Age group'), L('Sexe', 'Sex'), L('Zone', 'Zone'), L('Village', 'Village'), L('Cas index', 'Index cases'), L('Dernier contact', 'Last exposure'), L('Identifié', 'Identified'), L('Agent', 'Officer'), L('Statut', 'Status'), L('Jour de suivi', 'Follow-up day'), L('Visites', 'Visits'), L('Dernière visite', 'Last visit'), L('En retard', 'Overdue')])].concat(d.contacts.filter(function (c) { return geoMatch(c.geo, Object.assign({}, f, { facility: '' })) && inRange(c.identified_at, f) && (!f.cstat || c.status === f.cstat) && (!f.age || c.age_group === f.age); }).map(function (c) {
        var s = B.contactsApi.state(c), lf = c.followups[c.followups.length - 1];
        var rc = (B.revealed && B.revealed[c.id]) || c;
        return [c.id].concat(ident ? [rc.last + ' ' + rc.first, rc.phone || '', rc.address || ''] : []).concat([c.age_group, c.sex, zoneName(c.geo.zone), B.nm(B.G.villages, c.geo.village), c.index_cases.join(' '), c.last_exposure, B.ymd(new Date(c.identified_at)), c.officer, B.L(CS[c.status][0], CS[c.status][1]), s.day, c.followups.length, lf ? B.fmtDT(lf.at) : '', s.overdue ? L('oui', 'yes') : '']);
      }));
    } else if (type === 'lab') {
      var LS = B.labApi.STATUS, LR = B.labApi.RESULTS;
      rows = [[L('Échantillon', 'Sample'), L('Cas', 'Case'), L('Zone', 'Zone'), L('Type', 'Type'), L('Prélevé', 'Collected'), L('Lieu', 'Place'), L('Préleveur', 'Collector'), L('Laboratoire', 'Testing facility'), L('Sur place / externe', 'On-site / external'), L('Reçu', 'Received'), L('Méthode', 'Method'), L('Statut', 'Status'), L('Résultat', 'Result'), L('Publié', 'Released'), L('Par', 'By'), L('Étapes de traçabilité', 'Custody steps')]].concat(d.samples.filter(function (s) { var a = B.byId(d.assessments, s.case_id); return a && geoMatch(a.geo, f) && inRange(s.collected_at, f) && (!f.labst || ('result_' + s.result === f.labst) || (f.labst === 'awaiting_result' && s.status !== 'result_released')); }).map(function (s) {
        var a = B.byId(d.assessments, s.case_id);
        return [s.id, s.case_id, zoneName(a.geo.zone), s.type, B.fmtDT(s.collected_at), s.collection_place, s.collector, s.testing_site.name, s.testing_site.kind, s.received_at ? B.fmtDT(s.received_at) : '', s.method, B.L(LS[s.status][0], LS[s.status][1]), s.result ? B.L(LR[s.result][0], LR[s.result][1]) : '', s.released_at ? B.fmtDT(s.released_at) : '', s.released_by || '', s.custody.length];
      }));
    } else if (type === 'alerts' || type === 'tat') {
      var Qa = d.queue.filter(function (q) { return geoMatch(q.geo, Object.assign({}, f, { facility: '' })) && inRange(q.submitted_at, f) && (!f.vstat || q.outcome === f.vstat) && (type === 'tat' || q.source !== 'facility'); });
      var tg = B.queue.targets(), now = new Date();
      rows = [['ID', L('Source', 'Source'), L('Type', 'Type'), L('Zone', 'Zone'), L('Soumise', 'Submitted'), L('Étape', 'Stage'), L('Résultat', 'Outcome'), L('Urgente', 'Urgent')].concat(type === 'alerts' && ident ? [L('Téléphone du déclarant', 'Reporter phone')] : []).concat([L('Réception (min)', 'Acknowledgement (min)'), L('Début vérif. (min)', 'Verification start (min)'), L('Vérification (min)', 'Verification (min)'), L('Approbation (min)', 'Approval (min)'), L('En retard', 'Overdue'), L('Constatations', 'Findings')])].concat(Qa.map(function (q) {
        var du = B.queue.durations(q), o = B.queue.overdue(q, now);
        return [q.id, q.source, q.type, zoneName(q.geo.zone), B.fmtDT(q.submitted_at), B.queue.currentStage(q), q.outcome, q.urgent ? 'x' : ''].concat(type === 'alerts' && ident ? [(q.reporter && q.reporter.phone) || ''] : []).concat([du.ack, du.start, du.complete, du.approve, o && o.late ? L('oui', 'yes') + ' (' + o.interval + ')' : '', q.findings]);
      }));
      if (type === 'tat') rows.push([], [L('Cibles (min)', 'Targets (min)'), '', '', '', '', '', '', '', tg.ack, tg.start, tg.complete, tg.approve]);
    } else if (type === 'deaths') {
      rows = [[L('Date', 'Date'), L('Zone', 'Zone'), L('Village', 'Village'), L('Type', 'Type'), L('Décès', 'Deaths'), L('Tranche d\'âge', 'Age group'), L('Sexe', 'Sex'), L('Profession', 'Occupation'), L('Cas associé', 'Linked case'), L('Vérification', 'Verification'), 'ID']];
      reports(f).forEach(function (r) {
        if (r.counts.deaths_total) rows.push([B.ymd(new Date(r.reported_at)), zoneName(r.zone), B.nm(B.G.villages, r.village), L('Total rapporté (RECO)', 'Total reported (RECO)'), r.counts.deaths_total, '', '', '', '', B.queueStatus(r.id), r.id]);
        r.events.forEach(function (e) { if (['burial', 'unsafe_burial', 'death_unexplained', 'death_compatible'].indexOf(e.type) >= 0 && (!f.occ || e.occupation === f.occ) && (!f.age || e.age_group === f.age)) rows.push([e.date_occurred, zoneName(r.zone), B.nm(B.G.villages, r.village), B.evLabel(e.type), e.deaths || (e.type.indexOf('death') === 0 ? 1 : ''), e.age_group || '', e.sex || '', occLabel(e.occupation), e.case_class || '', e.verification, e.id]); });
      });
      cases(f).filter(function (a) { return a.care && a.care.status === 'deceased'; }).forEach(function (a) { rows.push([B.ymd(new Date(a.assessed_at)), zoneName(a.geo.zone), B.nm(B.G.villages, a.geo.village), L('Décès d\'un cas', 'Death of a case'), 1, a.person.age_group, a.person.sex, occLabel(a.person.occ), B.classLabel(a.classification), '', a.id]); });
    } else if (type === 'geo') {
      var GD = window.BDBV_GEODATA;
      rows = [[L('Province', 'Province'), L('Zone de santé', 'Health zone'), L('Lien zone→province', 'Zone→province link'), L('Point de référence', 'Reference point'), L('Suspects', 'Suspected'), L('Probables', 'Probable'), L('Confirmés', 'Confirmed'), L('Décès (RECO)', 'Deaths (RECO)'), L('Inhumations', 'Burials'), L('Groupes', 'Clusters'), L('Rumeurs', 'Rumours'), L('Contacts', 'Contacts')]];
      B.G.zones.filter(function (z) { return (!f.province || z.province === f.province) && (!f.zone || z.id === f.zone); }).forEach(function (z) {
        var A2 = d.assessments.filter(function (a) { return a.geo.zone === z.id && inRange(a.assessed_at, f); }), P2 = d.reports.filter(function (r) { return r.zone === z.id && inRange(r.reported_at, f); });
        var cc = function (s) { return A2.filter(function (a) { return a.classification && a.classification.status === s; }).length; };
        var ev = function (t) { return P2.reduce(function (s, r) { return s + r.events.filter(function (e) { return t.indexOf(e.type) >= 0; }).length; }, 0); };
        var pn = provName(z.province), ref = GD.zones[z.name] ? L('ville homonyme (GeoNames)', 'same-name town (GeoNames)') : (GD.provinces[B.byId(B.G.provinces, z.province) ? B.byId(B.G.provinces, z.province).name_fr : ''] && GD.provinces[B.byId(B.G.provinces, z.province).name_fr].lat != null ? L('chef-lieu de province', 'provincial capital') : L('aucun', 'none'));
        rows.push([pn, z.name, z.link_status, ref, cc('suspected'), cc('probable'), cc('confirmed'), P2.reduce(function (s, r) { return s + r.counts.deaths_total; }, 0), ev(['burial', 'unsafe_burial']), ev(['cluster']), d.rumours.filter(function (r) { return r.geo.zone === z.id && inRange(r.submitted_at, f); }).length, d.contacts.filter(function (c) { return c.geo.zone === z.id && inRange(c.identified_at, f); }).length]);
      });
    }
    return { title: title, rows: rows };
  };

  var rf = { type: '', province: '', zone: '', area: '', village: '', facility: '', from: '', to: '', cls: '', labst: '', cstat: '', vstat: '', occ: '', age: '', identifiers: false, reason: '' };
  B.VIEWS.reports = function (v) {
    var types = allowed();
    if (!rf.type || types.indexOf(rf.type) < 0) rf.type = types[0];
    if (!rf.from) { rf.from = B.ymd(new Date(Date.now() - 30 * DAY)); rf.to = B.ymd(new Date()); }
    if (B.st.role === 'facility_head') rf.facility = B.userCtx().facility;
    var canId = B.can('export_identifiable') && ['cases', 'contacts', 'alerts'].indexOf(rf.type) >= 0;
    var sel = function (id, label, opts, val) { return '<label>' + label + '<select id="' + id + '"><option value="">' + B.t('all') + '</option>' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (val === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></label>'; };
    var r = B.reportRows(rf.type, Object.assign({}, rf, { identifiers: canId && rf.identifiers && rf.reason.trim().length > 4 }));
    v.innerHTML = '<section class="card"><h2>' + L('Rapports et exports', 'Reports and exports') + '</h2>' +
      '<div class="grid"><label>' + L('Type de rapport', 'Report type') + '<select id="rtype">' + types.map(function (k) { return '<option value="' + k + '"' + (rf.type === k ? ' selected' : '') + '>' + esc(B.L(TYPES[k][0], TYPES[k][1])) + '</option>'; }).join('') + '</select></label>' +
      '<label>' + L('Du', 'From') + '<input type="date" id="rfrom" value="' + rf.from + '"></label><label>' + L('Au', 'To') + '<input type="date" id="rto" value="' + rf.to + '"></label></div>' +
      '<div data-geoholder="r2_">' + B.geoFields('r2_', rf, true, B.t('all')) + '</div>' +
      '<div class="grid">' +
      sel('rcls', L('Classification', 'Case classification'), Object.keys(B.CLASS).map(function (k) { return [k, B.L(B.CLASS[k][0], B.CLASS[k][1])]; }), rf.cls) +
      sel('rlab', L('Statut laboratoire', 'Laboratory status'), [['awaiting_test', L('En attente de test', 'Awaiting test')], ['awaiting_result', L('En attente de résultat', 'Awaiting result')], ['result_positive', L('Positif', 'Positive')], ['result_negative', L('Négatif', 'Negative')]], rf.labst) +
      sel('rcst', L('Statut du contact', 'Contact status'), Object.keys(B.contactsApi.STATUS).map(function (k) { return [k, B.L(B.contactsApi.STATUS[k][0], B.contactsApi.STATUS[k][1])]; }), rf.cstat) +
      sel('rvst', L('Statut de vérification', 'Verification status'), Object.keys(B.queue.OUTCOMES).map(function (k) { return [k, B.L(B.queue.OUTCOMES[k][0], B.queue.OUTCOMES[k][1])]; }), rf.vstat) +
      sel('rocc', L('Profession', 'Occupation'), B.OCCUPATIONS.filter(function (o) { return o[0]; }).map(function (o) { return [o[0], B.L(o[1], o[2])]; }), rf.occ) +
      sel('rage', L('Tranche d\'âge', 'Age group'), B.AGE_GROUPS.map(function (g) { return [g, g]; }), rf.age) + '</div>' +
      (canId ? '<div class="card inner"><label class="check"><input type="checkbox" id="rid"' + (rf.identifiers ? ' checked' : '') + '> ' + L('Inclure les identifiants (noms, téléphones)', 'Include identifiers (names, phone numbers)') + '</label><label>' + L('Motif (obligatoire, enregistré dans le journal d\'audit)', 'Reason (required, written to the audit log)') + '<input id="rreason" value="' + esc(rf.reason) + '"></label></div>' : (ROW_LEVEL.indexOf(rf.type) >= 0 || rf.type === 'alerts' ? '<p class="muted small">' + L('Export pseudonymisé : aucun nom ni téléphone.', 'Pseudonymised export: no names or phone numbers.') + '</p>' : '')) +
      '<div class="vbar"><button class="primary" data-fmt="csv">CSV</button><button class="primary" data-fmt="xlsx">Excel (.xlsx)</button><button class="primary" data-fmt="pdf">PDF</button></div></section>' +
      '<section class="card"><h3>' + esc(r.title) + ' - ' + L('aperçu', 'preview') + ' (' + Math.max(0, r.rows.length - 1) + L(' ligne(s)', ' row(s)') + ')</h3><div class="scroll"><table class="tbl small"><tr>' + r.rows[0].map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr>' +
      r.rows.slice(1, 51).map(function (row) { return '<tr>' + row.map(function (c) { return '<td>' + esc(c == null ? '' : c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table></div>' + (r.rows.length > 51 ? '<p class="muted small">' + L('50 premières lignes affichées ; l\'export contient tout.', 'First 50 rows shown; the export contains everything.') + '</p>' : '') + '</section>';
    var rer = function () { B.VIEWS.reports(v); };
    B.$('#rtype', v).onchange = function () { rf.type = this.value; rer(); };
    B.$('#rfrom', v).onchange = function () { rf.from = this.value; rer(); };
    B.$('#rto', v).onchange = function () { rf.to = this.value; rer(); };
    [['#rcls', 'cls'], ['#rlab', 'labst'], ['#rcst', 'cstat'], ['#rvst', 'vstat'], ['#rocc', 'occ'], ['#rage', 'age']].forEach(function (p) { B.$(p[0], v).onchange = function () { rf[p[1]] = this.value; rer(); }; });
    if (B.$('#rid', v)) { B.$('#rid', v).onchange = function () { rf.identifiers = this.checked; }; B.$('#rreason', v).onchange = function () { rf.reason = this.value; rer(); }; }
    B.bindGeo(v.querySelector('[data-geoholder="r2_"]').parentNode, 'r2_', true, B.t('all'), function (g) { Object.assign(rf, g); if (B.st.role === 'facility_head') rf.facility = B.userCtx().facility; rer(); });
    B.$$('[data-fmt]', v).forEach(function (b) {
      b.onclick = function () {
        var wantId = canId && rf.identifiers;
        if (wantId && (!B.$('#rreason', v) || B.$('#rreason', v).value.trim().length < 5)) { B.notify(L('Indiquez le motif de l\'export avec identifiants.', 'Give the reason for exporting identifiers.'), 'err'); return; }
        if (wantId) rf.reason = B.$('#rreason', v).value.trim();
        var run = function () {
          var out = B.reportRows(rf.type, Object.assign({}, rf, { identifiers: wantId }));
          B.revealed = null;
          B.exportTable(b.getAttribute('data-fmt'), 'rapport_' + rf.type, out.title, out.rows);
          B.audit('download', 'report', rf.type + '.' + b.getAttribute('data-fmt'), (wantId ? 'IDENTIFIERS - ' + rf.reason + ' - ' : '') + (out.rows.length - 1) + ' rows');
        };
        // Server mode: names are fetched from the server (reason logged there), never stored locally.
        var col = { cases: 'assessments', contacts: 'contacts' }[rf.type];
        if (wantId && col && B.server && B.server.user()) {
          var ids = B.db()[col].map(function (x) { return x.id; });
          B.revealIdentifiers(col, ids, rf.reason).then(function (map) { B.revealed = map; run(); }).catch(function () { B.notify(L('Le serveur a refusé l\'accès aux identifiants.', 'The server refused access to identifiers.'), 'err'); });
          return;
        }
        run();
      };
    });
  };
})();
