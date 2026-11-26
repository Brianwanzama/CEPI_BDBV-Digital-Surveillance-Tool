/* Public rumour / event reporting: anyone can report, anonymously if they wish.
 * Every report enters the verification queue; nothing is classified as a case here.
 */
(function () {
  'use strict';
  var B = window.BDBV;
  var L = function (f, e) { return B.L(f, e); };
  var esc = function (x) { return B.esc(x); };
  var REL = [['witness', 'J\'ai vu l\'évènement', 'I saw it happen'], ['family', 'Membre de la famille', 'Family member'], ['neighbour', 'Voisin / communauté', 'Neighbour / community'],
    ['leader', 'Leader communautaire, religieux ou traditionnel', 'Community, religious or traditional leader'], ['teacher', 'Enseignant', 'Teacher'], ['health', 'Agent de santé / RECO', 'Health worker / RECO'], ['heard', 'Je l\'ai entendu dire', 'I heard about it'], ['other', 'Autre', 'Other']];

  B.VIEWS.rumour = function (v) {
    var types = B.EVT.filter(function (e) { return e[0] !== 'contact'; }).concat([['contact', 'Contact avec un malade d\'Ebola', 'Contact with an Ebola patient']]);
    v.innerHTML = '<form id="pf" class="card public" novalidate><h2>' + L('Signaler un évènement de santé', 'Report a health event') + '</h2>' +
      '<p>' + L('Tout le monde peut signaler. Votre signalement sera <b>vérifié</b> par l\'équipe de santé : ce n\'est pas un diagnostic. Vous pouvez rester anonyme.', 'Anyone can report. Your report will be <b>checked</b> by the health team: it is not a diagnosis. You can stay anonymous.') + '</p>' +
      '<fieldset><legend>' + L('1. Qu\'avez-vous vu ou entendu ?', '1. What did you see or hear?') + '</legend><div class="choices">' +
      types.map(function (e, i) { return '<label class="choice"><input type="radio" name="ptype" value="' + e[0] + '"' + (i === 0 ? ' checked' : '') + '><span>' + esc(L(e[1], e[2])) + '</span></label>'; }).join('') + '</div></fieldset>' +
      '<fieldset><legend>' + L('2. Où ?', '2. Where?') + '</legend><div data-geoholder="p_">' + B.geoFields('p_', { province: 'P-ituri' }, false, L('Je ne sais pas', 'I don\'t know')) + '</div>' +
      '<label>' + L('Lieu précis (quartier, repère, sans nom de personne)', 'Exact place (neighbourhood, landmark, no person\'s name)') + '<input name="pplace"></label></fieldset>' +
      '<fieldset><legend>' + L('3. Quand et combien ?', '3. When and how many?') + '</legend><div class="grid">' +
      '<label>' + L('Date de l\'évènement', 'Date of the event') + '<input type="date" name="pdate" value="' + B.ymd(new Date()) + '"></label>' +
      '<label>' + L('Nombre de personnes concernées', 'Number of people involved') + '<input type="number" min="0" name="pn" inputmode="numeric"></label>' +
      '<label>' + L('Nombre de décès', 'Number of deaths') + '<input type="number" min="0" name="pdeaths" inputmode="numeric"></label></div>' +
      '<label>' + L('Décrivez ce qui s\'est passé', 'Describe what happened') + '<textarea name="pdesc" rows="3"></textarea></label></fieldset>' +
      '<fieldset><legend>' + L('4. Vous', '4. You') + '</legend>' +
      '<label class="check"><input type="checkbox" name="panon"> ' + L('Je veux rester anonyme', 'I want to stay anonymous') + '</label>' +
      '<div class="grid" id="pwho"><label>' + L('Votre nom (facultatif)', 'Your name (optional)') + '<input name="pname"></label>' +
      '<label>' + L('Votre téléphone (facultatif, pour vous rappeler)', 'Your phone (optional, so we can call back)') + '<input type="tel" name="pphone"></label></div>' +
      '<label>' + L('Votre lien avec l\'évènement', 'Your relationship to the event') + '<select name="prel">' + REL.map(function (r) { return '<option value="' + r[0] + '">' + esc(L(r[1], r[2])) + '</option>'; }).join('') + '</select></label>' +
      '<label>' + L('Photo ou document (facultatif)', 'Photo or document (optional)') + '<input type="file" name="pfile" accept="image/*,application/pdf"></label>' +
      '<p class="muted small">' + L('Prototype : seul le nom et la taille du fichier sont enregistrés ; le fichier n\'est pas envoyé.', 'Prototype: only the file name and size are recorded; the file is not uploaded.') + '</p></fieldset>' +
      '<div class="actions"><button type="submit" class="primary big">' + L('Envoyer le signalement', 'Send the report') + '</button></div></form>';
    var form = B.$('#pf', v);
    B.bindGeo(form, 'p_', false, L('Je ne sais pas', 'I don\'t know'));
    form.elements.panon.onchange = function () { B.$('#pwho', form).hidden = this.checked; };
    form.onsubmit = function (e) {
      e.preventDefault();
      var E = form.elements, g = B.readGeo(form, 'p_');
      var desc = E.pdesc.value.trim(), place = E.pplace.value.trim();
      if (!desc) { B.notify(L('Décrivez l\'évènement en quelques mots.', 'Describe the event in a few words.'), 'err'); return; }
      if (!g.zone && !place) { B.notify(L('Indiquez au moins la zone de santé ou le lieu.', 'Give at least the health zone or the place.'), 'err'); return; }
      if (g.village) g = Object.assign(g, B.geoOfVillage(g.village));
      else if (g.area) { g.zone = B.byId(B.G.areas, g.area).zone; }
      if (g.zone && !g.province) g.province = B.byId(B.G.zones, g.zone).province;
      var anon = E.panon.checked, f = E.pfile.files && E.pfile.files[0];
      var r = { id: B.newId('RUM', (g.zone || 'Z-GEN').replace('Z-', '').slice(0, 3).toUpperCase()), type: form.querySelector('input[name="ptype"]:checked').value, geo: { province: g.province || '', zone: g.zone || '', area: g.area || '', village: g.village || '' },
        place_text: place, date_occurred: E.pdate.value, submitted_at: B.iso(new Date()), description: desc, n_people: +E.pn.value || 0, n_deaths: +E.pdeaths.value || 0,
        anonymous: anon, name: anon ? '' : E.pname.value.trim(), phone: anon ? '' : E.pphone.value.trim(), relationship: E.prel.value,
        attachment: f ? { name: f.name, type: f.type, size: f.size } : null, synced: false, demo: false };
      var showDone = function (ref, phone) {
        v.innerHTML = '<section class="card ok public"><h2>✓ ' + L('Merci, votre signalement est enregistré', 'Thank you, your report is saved') + '</h2>' +
          '<p>' + L('Numéro de référence : ', 'Reference number: ') + '<b><code>' + esc(ref) + '</code></b></p>' +
          '<p>' + L('L\'équipe de surveillance va vérifier. ', 'The surveillance team will check it. ') + (phone ? L('Elle pourra vous appeler.', 'They may call you.') : '') + '</p>' +
          '<p class="small">' + L('En cas de malade grave ou de décès suspect, appelez aussi l\'infirmier titulaire ou le numéro d\'alerte de votre zone.', 'For a seriously ill person or a suspicious death, also call the health-area nurse or your zone\'s alert number.') + '</p>' +
          '<button class="big" id="pagain">' + L('Nouveau signalement', 'New report') + '</button></section>';
        B.$('#pagain', v).onclick = function () { B.render(); };
      };
      var storeLocal = function () {
        B.db().rumours.unshift(r);
        var a = B.queue.submit({ source: 'rumour', source_ref: r.id, type: r.type, geo: r.geo, reporter: { name: r.name || '', phone: r.phone, anonymous: anon },
          description: desc + (r.n_deaths ? ' · ' + r.n_deaths + L(' décès', ' death(s)') : ''), info_source: 'public:' + r.relationship, supporting: f ? 'key:attachment ' + f.name : '', urgent: r.n_deaths > 1 || r.type === 'cluster' });
        a.place_text = place;
        B.audit('create', 'rumour', r.id, anon ? 'anonymous' : '');
        B.save();
        showDone(r.id, r.phone);
      };
      // Straight to the server when one is reachable (public reporters have no account).
      var srv = B.submitPublicRumour && B.submitPublicRumour({ type: r.type, geo: r.geo, place_text: r.place_text, date_occurred: r.date_occurred, description: r.description, n_people: r.n_people, n_deaths: r.n_deaths, anonymous: r.anonymous, name: r.name, phone: r.phone, relationship: r.relationship, attachment: r.attachment });
      if (srv) { srv.then(function (res) { showDone(res.id, r.phone); }).catch(storeLocal); return; }
      storeLocal();
    };
  };
})();
