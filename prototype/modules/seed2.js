/* Synthetic demonstration data for the v2 modules (alert queue, rumours, contacts,
 * samples, care pathway, burial/death details). Runs after the v1 demo seed, with
 * the same deterministic random generator. Every record is flagged demo:true.
 * Phone numbers are clearly fake (+243 000 …).
 */
(function () {
  'use strict';
  var B = window.BDBV;
  var MIN = 60000, HOUR = 3600000, DAY = 86400000;
  var OFF = ['J. Mapendo [DEMO]', 'R. Kambale [DEMO]', 'A. Baraka [DEMO]'];
  var HOLD = { 'Z-aru': 'Z-aru-A1-ARUT', 'Z-adi': 'Z-adi-A1-ADIT' }, ETC = 'Z-ariwara-A1-ARIC';

  B.seed2 = function (r) {
    var d = B.db(), now = Date.now();
    var pick = function (arr) { return arr[Math.floor(r() * arr.length)]; };
    var wpick = function (pairs) { var x = r(), acc = 0; for (var i = 0; i < pairs.length; i++) { acc += pairs[i][1]; if (x < acc) return pairs[i][0]; } return pairs[pairs.length - 1][0]; };
    var iso = function (t) { return new Date(t).toISOString(); };
    var phone = function () { return '+243 000 ' + String(100 + Math.floor(r() * 900)) + ' ' + String(100 + Math.floor(r() * 900)) + ' (démo)'; };
    var occs = B.OCCUPATIONS.slice(1).map(function (o) { return o[0]; });

    // Move an alert through the workflow with realistic delays, stopping at "now".
    function progress(q, t0, outcome, findings) {
      var t = t0, off = pick(OFF);
      var steps = [['acknowledged', 5 + r() * (r() < 0.15 ? 400 : 110)], ['assigned', 5 + r() * 60], ['started', 20 + r() * (r() < 0.2 ? 900 : 300)], ['completed', 60 + r() * (r() < 0.2 ? 2600 : 1300)], ['approved', 20 + r() * (r() < 0.15 ? 1500 : 600)]];
      for (var i = 0; i < steps.length; i++) {
        t += steps[i][1] * MIN; if (t > now) return;
        var st = steps[i][0], at = iso(t);
        if (st === 'completed') B.queue.complete(q, outcome, findings || '', '', off, at);
        else if (st === 'approved') B.queue.approve(q, outcome === 'verified' || outcome === 'referred', off, at);
        else B.queue.act(q, st, st === 'assigned' ? { to: off } : null, off, at);
      }
    }

    /* 1. RECO reports: death details, burials, queue */
    d.reports.filter(function (x) { return x.demo; }).forEach(function (rep) {
      var hot = B.G.affected_zones.indexOf(rep.zone) >= 0, t0 = new Date(rep.reported_at).getTime();
      rep.events.forEach(function (e) {
        if (e.type.indexOf('death') === 0) { e.deaths = 1; e.age_group = pick(B.AGE_GROUPS); e.sex = r() < 0.5 ? 'F' : 'M'; e.occupation = r() < 0.25 ? '' : pick(occs); }
      });
      if (rep.counts.deaths_total && r() < 0.6) {
        var cc = rep.counts.deaths_suspected_ebola ? wpick([['suspected', 0.6], ['probable', 0.3], ['confirmed', 0.1]]) : '';
        rep.events.push({ id: 'EVT-DEMO-B-' + rep.id.slice(9), type: cc && r() < 0.5 ? 'unsafe_burial' : 'burial', date_occurred: B.ymd(new Date(t0 - Math.floor(r() * 4) * DAY)), date_reported: rep.reported_at, n: rep.counts.deaths_total, deaths: rep.counts.deaths_total,
          location: 'key:burial_place', source: 'leader', description: 'key:burial_synth', verification: 'reported', case_class: cc, age_group: pick(B.AGE_GROUPS), sex: r() < 0.5 ? 'F' : 'M', occupation: r() < 0.3 ? '' : pick(occs), history: [] });
      }
      var c = rep.counts, sig = c.deaths_unexplained + c.deaths_suspected_ebola + c.alerts + c.clusters;
      var q = B.queue.submit({ source: 'reco', source_ref: rep.id, type: sig ? 'reco_signal' : 'reco_routine', geo: { province: rep.province, zone: rep.zone, area: rep.area, village: rep.village }, reporter: { name: rep.reco_id, phone: phone() },
        description: 'Rapport RECO : ' + c.deaths_total + ' décès, ' + rep.events.length + ' évènement(s)', info_source: 'reco', submitted_at: rep.reported_at, urgent: c.deaths_suspected_ebola > 0 || c.clusters > 0, demo: true });
      var out = !sig ? 'verified' : (hot ? wpick([['verified', 0.55], ['referred', 0.15], ['not_verified', 0.15], ['duplicate', 0.05], ['insufficient', 0.1]]) : wpick([['verified', 0.3], ['not_verified', 0.45], ['insufficient', 0.15], ['duplicate', 0.1]]));
      progress(q, t0, out, sig ? 'key:field_visit' : 'key:routine_ok');
      q.synced = true;
    });

    /* 2. Facility assessments: queue, care pathway, samples, probable cases */
    var cases = d.assessments.filter(function (x) { return x.demo; });
    cases.forEach(function (a) {
      var t0 = new Date(a.assessed_at).getTime(), ageD = (now - t0) / DAY, cat = a.result.category;
      var q = B.queue.submit({ source: 'facility', source_ref: a.id, type: 'triage_' + cat, category: cat, geo: a.geo, reporter: { name: 'N. Kahindo [DEMO]' }, description: 'Triage ' + cat + ' (score ' + a.result.score + ')', info_source: 'health_facility', submitted_at: a.assessed_at, urgent: cat === 'RED', demo: true });
      progress(q, t0, cat === 'RED' ? wpick([['verified', 0.85], ['referred', 0.1], ['not_verified', 0.05]]) : (cat === 'AMBER' ? wpick([['verified', 0.6], ['not_verified', 0.3], ['insufficient', 0.1]]) : wpick([['verified', 0.95], ['insufficient', 0.05]])), 'key:triage_check');
      q.synced = true;
      var hold = HOLD[a.geo.zone] || ETC, step = function (dt, st, loc, note) { var t = t0 + dt; if (t > now) return false; B.careApi.set(a, st, loc, st === 'initial_assessment' ? '' : 'Dr K. Lusamba [DEMO]', note || '', 'Dr K. Lusamba [DEMO]', iso(t)); return true; };
      var site = a.geo.zone === 'Z-ariwara' ? { kind: 'onsite', name: 'Laboratoire de la FOSA - analyse sur place (démo)' } : { kind: 'external', name: 'Laboratoire provincial (démo)' };
      var labRes = a.lab.status;
      if (cat === 'RED') {
        var probable = labRes !== 'requested' && ageD > 5 && r() < 0.1;
        step(45 * MIN, 'awaiting_review') && step(2 * HOUR, 'referred_holding', a.geo.facility) && step(4 * HOUR, 'in_holding', hold, 'key:to_holding');
        if (probable) {
          a.lab = { status: 'none' };
          if (step(30 * HOUR, 'deceased', hold, 'key:died_before_sample')) a.classification = { status: 'probable', at: iso(t0 + 2 * DAY), by: 'J. Mapendo [DEMO]' };
          return;
        }
        if (labRes === 'requested') {
          if (r() < 0.5) { var s0 = B.labApi.register({ case_id: a.id, type: 'whole_blood', collected_at: iso(Math.min(now, t0 + 3 * HOUR)), collection_place: B.nm(B.G.facilities, a.geo.facility), collector: 'N. Kahindo [DEMO]', testing_site: site, status: 'collected', by: 'N. Kahindo [DEMO]', demo: true, created_at: iso(t0 + 3 * HOUR) }); if (r() < 0.5) B.labApi.setStatus(s0, 'in_transit', 'FOSA', 'Courier [DEMO]', 'N. Kahindo [DEMO]', iso(Math.min(now, t0 + 5 * HOUR))); s0.synced = true; }
          return;
        }
        var s = B.labApi.register({ case_id: a.id, type: 'whole_blood', collected_at: iso(t0 + 3 * HOUR), collection_place: B.nm(B.G.facilities, hold), collector: 'N. Kahindo [DEMO]', testing_site: site, status: 'collected', by: 'N. Kahindo [DEMO]', demo: true, created_at: iso(t0 + 3 * HOUR) });
        var chain = site.kind === 'onsite' ? [[4, 'under_analysis'], [6, 'analysed_onsite']] : [[5, 'awaiting_dispatch'], [8, 'in_transit'], [20, 'received'], [22, 'under_analysis']];
        var stopped = false;
        chain.forEach(function (c2) { if (stopped) return; var t = t0 + c2[0] * HOUR; if (t > now) { stopped = true; return; } B.labApi.setStatus(s, c2[1], c2[1] === 'in_transit' ? 'FOSA' : '', c2[1] === 'received' ? 'Laboratoire provincial (démo)' : '', 'P. Ndjoli [DEMO]', iso(t)); });
        var rel = t0 + (site.kind === 'onsite' ? 8 : 30) * HOUR;
        if (!stopped && rel < now) B.labApi.release(s, labRes === 'pos' ? 'positive' : 'negative', 'RT-PCR (GeneXpert)', '', 'P. Ndjoli [DEMO]', iso(rel));
        s.synced = true;
        if (a.classification.status === 'confirmed') {
          step(rel - t0 + 2 * HOUR, 'isolation_care', ETC, 'key:to_etc') && (ageD > 9 && step((r() < 0.36 ? 6 : 16) * DAY, r() < 0.36 ? 'deceased' : 'discharged', ETC));
        } else if (a.classification.status === 'lab_negative') step(rel - t0 + 6 * HOUR, 'discharged', hold, 'key:neg_result');
      } else if (cat === 'AMBER') {
        step(90 * MIN, 'awaiting_review');
        if (!(a.review && a.review.status === 'pending')) step(20 * HOUR, r() < 0.15 ? 'referred_holding' : 'discharged', a.geo.facility);
        if (labRes === 'neg') { var sa = B.labApi.register({ case_id: a.id, type: 'whole_blood', collected_at: iso(t0 + 4 * HOUR), collection_place: B.nm(B.G.facilities, a.geo.facility), collector: 'N. Kahindo [DEMO]', testing_site: site, status: 'collected', by: 'N. Kahindo [DEMO]', demo: true, created_at: iso(t0 + 4 * HOUR) }); if (t0 + 30 * HOUR < now) B.labApi.release(sa, 'negative', 'RT-PCR (GeneXpert)', '', 'P. Ndjoli [DEMO]', iso(t0 + 30 * HOUR)); sa.synced = true; }
      } else if (r() < 0.8) step(2 * HOUR, 'discharged', a.geo.facility, 'key:routine_care');
    });

    /* 3. Contacts of RED / suspected / probable / confirmed cases */
    var idx = cases.filter(function (a) { return a.result.category === 'RED' && (now - new Date(a.assessed_at)) / DAY >= 1 && (now - new Date(a.assessed_at)) / DAY < 40; });
    var n = 0;
    idx.forEach(function (a) {
      var k = 2 + Math.floor(r() * 4);
      for (var i = 0; i < k; i++) {
        n++;
        var t0 = new Date(a.assessed_at).getTime() + (12 + r() * 24) * HOUR;
        var vills = B.G.villages.filter(function (x) { return x.area === a.geo.area; });
        var gv = B.geoOfVillage(r() < 0.75 ? a.geo.village : pick(vills).id);
        var lastExp = B.ymd(new Date(new Date(a.assessed_at).getTime() - Math.floor(r() * 3) * DAY));
        var c = { id: 'CTC-DEMO-' + (1000 + n), first: 'Contact', last: 'DÉMO-' + (1000 + n), age_group: pick(B.AGE_GROUPS), sex: r() < 0.5 ? 'F' : 'M', phone: r() < 0.6 ? phone() : '', address: 'key:demo_address', geo: gv,
          index_cases: [a.id], exposure: { nature: pick(['household', 'care', 'body', 'fluids', 'linen', 'facility']) }, last_exposure: lastExp, identified_at: iso(t0), officer: pick(OFF),
          status: 'identified', status_history: [{ at: iso(t0), status: 'identified', by: '[DEMO]', note: '' }], followups: [], synced: true, demo: true };
        var hist = function (s, t) { if (t <= now) { c.status = s; c.status_history.push({ at: iso(t), status: s, by: c.officer, note: '' }); } };
        hist('tracing', t0 + 2 * HOUR); hist('located', t0 + 8 * HOUR);
        var end = new Date(lastExp).getTime() + B.contactsApi.days() * DAY;
        var lost = r() < 0.04, sym = r() < 0.05, symDay = 2 + Math.floor(r() * 10);
        for (var dday = 1; ; dday++) {
          var tv = new Date(B.ymd(new Date(t0 + dday * DAY)) + 'T09:00:00').getTime() + r() * 7 * HOUR;
          if (tv > now || tv > end) break;
          if (lost && dday > 5) { hist('lost', tv); break; }
          if (r() > 0.88) continue;
          var symptomatic = sym && dday >= symDay;
          c.followups.push({ at: iso(tv), symptoms: symptomatic ? ['fever', 'asthenia'] : [], temp: symptomatic ? '38.4' : (36 + r()).toFixed(1), exposure: '', location: r() < 0.85 ? 'home' : 'phone', officer: c.officer, action: symptomatic ? 'refer' : 'none', next_at: B.ymd(new Date(tv + DAY)), outcome: symptomatic ? 'symptomatic' : 'well' });
          if (c.status === 'located') hist('followup', tv);
          if (symptomatic) { hist('symptomatic', tv); hist('referred', tv + HOUR); break; }
        }
        if (c.status === 'followup' && end < now) hist('completed', end);
        d.contacts.push(c);
      }
    });

    /* 4. Public rumours */
    var types = ['death_unexplained', 'death_compatible', 'sick_compatible', 'cluster', 'unsafe_burial', 'burial', 'animal', 'other', 'contact'];
    var rels = ['witness', 'family', 'neighbour', 'leader', 'teacher', 'health', 'heard', 'other'];
    for (var i = 0; i < 30; i++) {
      var hotZ = r() < 0.6;
      var zid = hotZ ? pick(B.G.affected_zones) : pick(B.G.zones).id, z = B.byId(B.G.zones, zid);
      var areas = B.G.areas.filter(function (x) { return x.zone === zid; });
      var ar = areas.length ? pick(areas) : null, vil = ar ? pick(B.G.villages.filter(function (x) { return x.area === ar.id; })) : null;
      var ago = Math.pow(r(), 1.3) * 55, ts = now - ago * DAY;
      var type = pick(types), anon = r() < 0.4, deaths = type.indexOf('death') === 0 || type.indexOf('burial') >= 0 ? 1 + Math.floor(r() * 3) : (type === 'cluster' ? Math.floor(r() * 2) : 0);
      var rum = { id: 'RUM-DEMO-' + (100 + i), type: type, geo: { province: z.province, zone: zid, area: ar ? ar.id : '', village: vil ? vil.id : '' }, place_text: 'key:landmark ' + (i + 1), date_occurred: B.ymd(new Date(ts - r() * 2 * DAY)), submitted_at: iso(ts),
        description: 'key:rumour_synth', n_people: 1 + Math.floor(r() * 4), n_deaths: deaths, anonymous: anon, name: anon ? '' : 'Reporter ' + (i + 1) + ' [DEMO]', phone: anon ? '' : phone(), relationship: pick(rels), attachment: null, synced: true, demo: true };
      d.rumours.push(rum);
      var qr = B.queue.submit({ source: 'rumour', source_ref: rum.id, type: type, geo: rum.geo, reporter: { name: rum.name, phone: rum.phone, anonymous: anon }, description: rum.description, info_source: 'public:' + rum.relationship, submitted_at: rum.submitted_at, urgent: deaths > 1 || type === 'cluster', demo: true });
      qr.place_text = rum.place_text;
      progress(qr, ts, hotZ ? wpick([['verified', 0.45], ['referred', 0.15], ['not_verified', 0.2], ['duplicate', 0.1], ['insufficient', 0.1]]) : wpick([['verified', 0.2], ['not_verified', 0.45], ['duplicate', 0.1], ['insufficient', 0.25]]), 'key:field_check');
      qr.synced = true;
    }
    d.queue.sort(function (x, y) { return new Date(y.submitted_at) - new Date(x.submitted_at); });
    // Demo history is treated as already synchronised.
    ['assessments', 'reports', 'queue', 'contacts', 'samples', 'rumours', 'alerts'].forEach(function (k) { d[k].forEach(function (x) { if (x.demo) x.synced = true; }); });
  };
})();
