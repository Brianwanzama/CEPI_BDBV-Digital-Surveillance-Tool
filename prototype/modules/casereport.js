/* Individual case report (PDF): one patient record with its triage, laboratory tests, care and
 * verification history. Names are printed only for roles that may see them and only when the record
 * holds them (other roles receive pseudonymised records from the server).
 */
(function () {
  'use strict';
  var B = window.BDBV;
  var L = function (f, e) { return B.L(f, e); };

  function yesItems(map, kind) {
    return Object.keys(map || {}).filter(function (id) { return map[id] && map[id].s === 'yes'; })
      .map(function (id) { var it = B.itemById(id); return (it ? B.lbl(it) : id) + (map[id].date ? ' (' + map[id].date + ')' : ''); });
  }

  B.caseReportPDF = function (id) {
    var J = window.jspdf && window.jspdf.jsPDF;
    if (!J) { B.notify(L('Bibliothèque PDF non chargée.', 'PDF library not loaded.'), 'err'); return; }
    var d = B.db(), a = B.byId(d.assessments, id); if (!a) return;
    var p = a.person || {}, g = a.geo || {}, c = a.clinical || {}, r = a.result || {};
    var names = B.can('see_names') && !p.redacted && (p.last || p.first);
    var doc = new J({ unit: 'pt', format: 'a4' }), y = 48;
    var line = function (txt, size, bold) { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size || 10); doc.splitTextToSize(String(txt), 515).forEach(function (l) { if (y > 790) { doc.addPage(); y = 48; } doc.text(l, 40, y); y += (size || 10) + 4; }); };
    var table = function (head, rows) {
      if (!rows.length) { line('-'); return; }
      doc.autoTable({ startY: y, head: [head], body: rows, margin: { left: 40, right: 40 }, styles: { fontSize: 8.5, cellPadding: 3 }, headStyles: { fillColor: [15, 61, 94] } });
      y = doc.lastAutoTable.finalY + 14;
    };
    line(L('Rapport de cas individuel', 'Individual case report'), 16, true);
    line(L('Données synthétiques - prototype. Aide à la décision : ne remplace pas le jugement clinique. Généré le ', 'Synthetic data - prototype. Decision support: does not replace clinical judgement. Generated ') + B.fmtDT(new Date().toISOString()) + L(' par ', ' by ') + B.user(), 8);
    y += 6;
    line(L('Identification', 'Identification'), 12, true);
    table([L('Champ', 'Field'), L('Valeur', 'Value')], [
      [L('ID du cas', 'Case ID'), a.id],
      [L('Patient', 'Patient'), names ? (p.last || '') + ' ' + (p.first || '') : L('pseudonymisé', 'pseudonymised')],
      [L('Âge / sexe', 'Age / sex'), (p.age != null ? p.age + ' ' + L('ans', 'y') : '-') + ' / ' + (p.sex || '-')],
      [L('Lieu de résidence', 'Residence'), [g.village && B.nm(B.G.villages, g.village), g.area && B.nm(B.G.areas, g.area), g.zone && B.nm(B.G.zones, g.zone)].filter(Boolean).join(', ') || '-'],
      [L('Structure de santé', 'Health facility'), g.facility ? B.nm(B.G.facilities, g.facility) : '-'],
      [L('Évalué le', 'Assessed on'), B.fmtDT(a.assessed_at)]
    ]);
    line(L('Triage', 'Triage'), 12, true);
    table([L('Champ', 'Field'), L('Valeur', 'Value')], [
      [L('Niveau de risque', 'Risk level'), (r.category ? B.t(r.category) : '-') + (r.score != null ? ' (' + r.score + '/100)' : '')],
      [L('Classification', 'Classification'), B.classLabel(a.classification)],
      [L('Début des symptômes', 'Symptom onset'), c.onset_unknown ? L('inconnu', 'unknown') : (c.onset_date || '-')],
      [L('Température', 'Temperature'), c.temp ? c.temp + ' °C' : '-'],
      [L('Signes présents', 'Signs present'), yesItems(c.symptoms).join(', ') || '-'],
      [L('Expositions', 'Exposures'), yesItems(a.exposures).join(', ') || '-'],
      [L('Évalué par', 'Assessed by'), a.clinician || '-']
    ]);
    line(L('Laboratoire', 'Laboratory'), 12, true);
    var samples = (d.samples || []).filter(function (s) { return s.case_id === a.id; });
    table([L('ID labo', 'Lab ID'), L('Type', 'Type'), L('Prélevé', 'Collected'), L('Statut', 'Status'), L('Résultat', 'Result'), L('Testé par', 'Tested by'), L('Approuvé par', 'Approved by')],
      samples.map(function (s) {
        var api = B.labApi || {}, st = api.STATUS && api.STATUS[s.status], rs = api.RESULTS && api.RESULTS[s.result];
        var lbl2 = function (x) { return x ? (Array.isArray(x) ? L(x[0], x[1]) : String(x)) : ''; };
        return [s.lab_id || s.id, s.type || '-', s.collected_at ? B.fmtDT(s.collected_at) : '-', lbl2(st) || s.status, s.status === 'result_released' ? (lbl2(rs) || s.result || '-') : L('non publié', 'not released'), s.tested_by || '-', s.approved_by || '-'];
      }));
    line(L('Prise en charge', 'Care'), 12, true);
    table([L('Quand', 'When'), L('Statut', 'Status'), L('Lieu', 'Location'), L('Responsable', 'Responsible')],
      ((a.care && a.care.history) || []).map(function (h) { return [B.fmtDT(h.at), h.status, h.location || '-', h.responsible || '-']; }));
    line(L('Vérification par la surveillance', 'Surveillance verification'), 12, true);
    line(B.queueStatus ? (B.queueStatus(a.id) || '-') : '-');
    doc.save = null; // always through the download helper (works in the browser and inside claude.ai)
    var name = 'rapport_cas_' + a.id.replace(/[^A-Za-z0-9_-]/g, '_') + '.pdf';
    B.audit('export_case_report', 'assessment', a.id, names ? 'with names' : 'pseudonymised');
    return B.saveBlob(name, doc.output('blob'));
  };
})();
