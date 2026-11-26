// End-to-end integration test of the v2 modules on synthetic data (headless Chromium).
// Run: node tests/e2e_v2.test.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

(async () => {
  const url = 'file://' + path.join(__dirname, '..', 'prototype', 'index.html');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(url);
  const role = async (r) => { assert.ok(await page.evaluate((x) => BDBVApp.signInDemoRole(x), r), 'sign in ' + r); };
  // Sign-in screen: only the public can use the app without an account.
  assert.ok(await page.isHidden('#nav'));
  assert.strictEqual(await page.$$eval('[data-demo]', (b) => b.length), 9);
  await page.click('#go-public');
  assert.deepStrictEqual(await page.$$eval('#nav .tab', b => b.map(x => x.getAttribute('data-tab'))), ['rumour']);
  await page.click('#authbtn');
  await page.waitForSelector('[data-demo]');
  console.log('ok - sign-in screen: nine role accounts; public can report without an account');
  const tab = async (t) => { await page.click('[data-tab="' + t + '"]'); };
  const db = (fn, arg) => page.evaluate(fn, arg);
  const view = () => page.textContent('#view');
  let n = 0; const ok = (m) => { n++; console.log('ok -', m); };

  // ---- Geography (§11) ----
  const geo = await db(() => ({ prov: BDBV.G.provinces.filter(p => p.supplied).map(p => p.name_fr), zones: BDBV.G.zones.filter(z => z.supplied).map(z => z.name), unassigned: BDBV.G.zones.filter(z => z.link_status === 'unassigned').map(z => z.name) }));
  assert.strictEqual(geo.prov.length, 26); assert.strictEqual(geo.zones.length, 26);
  assert.ok(geo.prov.includes('Ituri') && geo.zones.includes('Banzow Moke'));
  assert.deepStrictEqual(geo.unassigned, [], 'every zone linked to a province from the boundary file');
  ok('supplied lists loaded: 26 provinces, 26 health zones; zone links taken from the official boundary file (to confirm)');

  // ---- Symptoms (§12) ----
  await page.selectOption('#lang', 'en');
  await role('soignant'); await tab('triage');
  const symLabels = await page.$$eval('.row[data-item] .ilabel', els => els.map(e => e.firstChild.textContent.trim()));
  ['Fever', 'Fatigue', 'Anorexia', 'Joint pain', 'Cough', 'DT *', 'Respiratory breathing', 'Hemorrhagic syndrome', 'Coma', 'Hiccups', 'DRO *', 'ICT *'].forEach(l => assert.ok(symLabels.includes(l) || symLabels.includes(l + ' *'), 'symptom ' + l));
  assert.strictEqual(symLabels.length, 23 + 10, '23 symptoms + 10 exposures');
  assert.ok(/definition to confirm/.test(await page.textContent('.row[data-item="dt"]')));
  ok('triage form shows the 23 supplied symptoms; DT/DRO/ICT flagged "definition to confirm"');

  // ---- Public rumour (§7) ----
  await page.selectOption('#lang', 'fr');
  await role('public');
  assert.deepStrictEqual(await page.$$eval('#nav .tab', b => b.map(x => x.getAttribute('data-tab'))), ['rumour']);
  await page.click('input[name=ptype][value=death_unexplained]', { force: true });
  await page.selectOption('[name=p_zone]', 'Z-aru');
  await page.fill('[name=pdesc]', 'Deux décès soudains dans la même famille');
  await page.fill('[name=pdeaths]', '2');
  await page.check('[name=panon]');
  await page.click('#pf button[type=submit]');
  await page.waitForSelector('.card.ok');
  const rumId = (await page.textContent('.card.ok code')).trim();
  const rq = await db((id) => { const q = BDBV.queue.byRef(id); return { src: q.source, approved: BDBV.isApproved(id), anon: q.reporter.anonymous, urgent: q.urgent }; }, rumId);
  assert.deepStrictEqual(rq, { src: 'rumour', approved: false, anon: true, urgent: true });
  ok('public rumour submitted anonymously → enters queue, not approved, escalated (2 deaths)');

  // ---- Verification workflow + TAT (§3) ----
  await role('surveillant'); await tab('verify');
  await page.selectOption('#qf-src', 'rumour'); await page.selectOption('#qf-b', 'to_ack');
  await page.click('[data-qopen]:has-text("' + (await db((id) => BDBV.queue.byRef(id).id, rumId)) + '")');
  await page.click('[data-step="acknowledged"]');
  await page.click('[data-step="assigned"]');
  await page.click('[data-step="started"]');
  await page.selectOption('#qout', 'verified'); await page.fill('#qfind', 'Visite : 2 décès confirmés par l\'IT');
  await page.click('[data-step="completed"]');
  await page.click('[data-step="approved"]');
  const rq2 = await db((id) => { const q = BDBV.queue.byRef(id); return { approved: BDBV.isApproved(id), outcome: q.outcome, stages: Object.keys(q.stages), dur: Object.keys(BDBV.queue.durations(q)).sort() }; }, rumId);
  assert.ok(rq2.approved && rq2.outcome === 'verified');
  assert.deepStrictEqual(rq2.stages, ['acknowledged', 'assigned', 'started', 'completed', 'approved']);
  assert.deepStrictEqual(rq2.dur, ['ack', 'approve', 'complete', 'start']);
  ok('7-step workflow: received → assigned → verification → outcome → approval; 4 turnaround intervals computed');
  const dupOk = await db(() => { const qs = BDBV.db().queue.filter(q => !q.stages.started); const a = qs[0]; BDBV.queue.act(a, 'acknowledged'); BDBV.queue.act(a, 'assigned', { to: 'x' }); BDBV.queue.act(a, 'started'); BDBV.queue.complete(a, 'duplicate', '', qs[1].id); BDBV.queue.approve(a, false); return { inc: BDBV.isApproved(a.source_ref), dup: a.duplicate_of === qs[1].id }; });
  assert.deepStrictEqual(dupOk, { inc: false, dup: true });
  ok('duplicate outcome recorded and excluded from the dashboard');
  const late = await db(() => { const q = BDBV.queue.submit({ source: 'rumour', source_ref: 'TEST', type: 'other', geo: {}, submitted_at: new Date(Date.now() - 3 * 3600000).toISOString() }); const o = BDBV.queue.overdue(q); BDBV.db().queue.shift(); return o; });
  assert.ok(late.late && late.interval === 'ack');
  ok('unacknowledged alert after 3 h flagged overdue against 1 h target');

  // ---- Dashboard approval gate (§3) ----
  await tab('dashboard');
  const approvedTxt = await view();
  await page.check('#fpending');
  const allTxt = await view();
  const rep = (t) => +((t.match(/(\d+)Rapports reçus/) || [])[1]);
  assert.ok(rep(approvedTxt) < rep(allTxt), 'approved-only shows fewer reports ' + rep(approvedTxt) + ' < ' + rep(allTxt));
  assert.ok(/Délais de traitement des alertes/.test(allTxt) && /0-9/.test(allTxt) && /70\+/.test(allTxt));
  ok('dashboard counts only approved community reports by default; TAT indicators and age groups shown');

  // ---- Contacts (§4) + referral to triage ----
  const idx = await db(() => BDBV.db().assessments.find(a => a.result.category === 'RED').id);
  await tab('contacts');
  await page.click('#cnew summary');
  await page.fill('[name=clast]', 'KASONGO'); await page.fill('[name=cfirst]', 'Amani');
  await page.selectOption('[name=cage]', '20-29'); await page.selectOption('[name=csex]', 'F');
  await page.selectOption('[name=c_village]', 'Z-aru-A1-V2');
  await page.fill('[name=cidx]', idx);
  await page.fill('[name=clast_exp]', new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10));
  await page.click('#cform button[type=submit]');
  await page.waitForSelector('#fuf');
  await page.fill('[name=ftemp]', '38.6');
  await page.click('#fuf button[type=submit]');
  const ct = await db(() => BDBV.db().contacts.find(c => c.last === 'KASONGO'));
  assert.strictEqual(ct.status, 'symptomatic'); assert.deepStrictEqual(ct.followups[0].symptoms, ['fever']);
  await page.click('#cref');
  await role('soignant'); await tab('patients');
  assert.ok(/KASONGO Amani/.test(await view()), 'referral visible to health worker');
  await page.click('[data-ctriage="' + ct.id + '"]');
  assert.strictEqual(await page.inputValue('[name=last]'), 'KASONGO');
  assert.ok(await page.isChecked('input[name=s_contact_case][value=yes]'));
  await page.fill('[name=age]', '25'); await page.selectOption('[name=sex]', 'F');
  await page.check('[name=onset_unk]'); await page.click('[data-item=fever] .o-yes span');
  await page.click('#tf button[type=submit]'); await page.waitForSelector('.result');
  const ct2 = await db((id) => { const c = BDBV.db().contacts.find(x => x.id === id); const a = BDBV.db().assessments.find(x => x.id === c.referred_assessment); return { status: c.status, cat: a.result.category, link: a.contact_id === id }; }, ct.id);
  assert.deepStrictEqual(ct2, { status: 'suspected', cat: 'RED', link: true });
  ok('contact registered → fever at follow-up → referred → triage pre-filled → RED → contact classified suspected');

  // ---- Laboratory (§5) ----
  const newCase = await db((id) => BDBV.db().contacts.find(x => x.id === id).referred_assessment, ct.id);
  await tab('lab');
  assert.strictEqual(await page.$('#lresb'), null, 'health worker cannot release results');
  await page.click('#lnew summary');
  await page.fill('[name=scase]', newCase); await page.fill('[name=scoll]', new Date(Date.now() - 2 * 3600000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
  await page.click('#lform button[type=submit]'); await page.waitForSelector('#ldetail h3');
  assert.strictEqual(await db((id) => BDBV.db().assessments.find(a => a.id === id).classification.status, newCase), 'suspected', 'sample collection does not confirm');
  await role('lab'); await tab('lab');
  const sid = await db((id) => BDBV.labApi.latest(id).id, newCase);
  await page.click('[data-sopen="' + sid + '"]');
  await page.selectOption('#lns', 'in_transit'); await page.fill('#lfrom', 'FOSA Aru 1'); await page.fill('#lto', 'Transporteur'); await page.click('#lnsb');
  await page.click('[data-sopen="' + sid + '"]');
  await page.selectOption('#lns', 'received'); await page.click('#lnsb');
  await page.click('[data-sopen="' + sid + '"]');
  await page.selectOption('#lres', 'positive'); await page.click('#lresb'); await page.click('#askyes');
  const lab = await db((id) => { const s = BDBV.labApi.latest(id); const a = BDBV.db().assessments.find(x => x.id === id); return { st: s.status, custody: s.custody.length, cls: a.classification.status, by: s.released_by }; }, newCase);
  assert.strictEqual(lab.st, 'result_released'); assert.ok(lab.custody >= 4); assert.strictEqual(lab.cls, 'confirmed'); assert.ok(/Ndjoli/.test(lab.by), 'released by the signed-in lab user: ' + lab.by);
  ok('sample registered → custody chain → result released by lab only → case confirmed only then');

  // ---- Case management (§6) ----
  await role('clinician'); await tab('casemgmt');
  await page.click('[data-mopen="' + newCase + '"]');
  assert.ok(await page.$eval('#mst option[value=home_care]', o => o.disabled), 'home care disabled by default');
  await page.selectOption('#mst', 'in_holding'); await page.selectOption('#mloc', 'Z-aru-A1-ARUT'); await page.fill('#mresp', 'Dr Test');
  await page.click('#msave');
  const care = await db((id) => BDBV.db().assessments.find(a => a.id === id).care, newCase);
  assert.strictEqual(care.status, 'in_holding'); assert.ok(care.history.some(h => h.transfer));
  await role('sysadmin'); await tab('admin');
  await page.check('#home'); await page.click('#hsave');
  assert.ok(/référence|reference/i.test(await page.textContent('#toast')), 'protocol reference required');
  await page.fill('#homeref', 'Protocole PNLFHV (référence test)'); await page.click('#hsave');
  await role('clinician'); await tab('casemgmt'); await page.click('[data-mopen="' + newCase + '"]');
  assert.ok(!(await page.$eval('#mst option[value=home_care]', o => o.disabled)), 'home care enabled after admin decision');
  ok('care status and transfer recorded; home-based care only after admin records a protocol reference');

  // ---- Admin geography (§11) ----
  await role('sysadmin'); await tab('admin');
  await page.selectOption('[data-zprov="Z-baka"]', 'P-kwilu'); await page.check('[data-zconf="Z-aru"]'); await page.click('#gsave');
  const links = await db(() => ({ baka: BDBV.G.zones.find(z => z.id === 'Z-baka'), aru: BDBV.G.zones.find(z => z.id === 'Z-aru').link_status }));
  assert.strictEqual(links.baka.province, 'P-kwilu'); assert.strictEqual(links.baka.link_status, 'set_by_admin'); assert.strictEqual(links.aru, 'confirmed');
  ok('administrator sets/confirms zone→province links (audited)');

  // ---- Facility head (§8) ----
  await role('facility_head'); await tab('facility');
  const fh = await view();
  assert.ok(/Personnes dépistées/.test(fh) && /Goulots/.test(fh));
  assert.ok(!/KASONGO|Testeur|DÉMO/.test(fh), 'no patient names');
  ok('facility-head dashboard: activity, timeliness, bottlenecks, no names');

  // ---- Map (§2) ----
  await role('surveillant'); await tab('map');
  const markers = await page.$$eval('.dmap [data-mk]', els => els.length);
  assert.ok(markers > 0);
  // every marker sits at the centre of an official boundary or a gazetteer point (no invented coordinates)
  const anchorsOk = await db(() => {
    const GD = window.BDBV_GEODATA, BND = window.BDBV_BOUNDARIES, pts = new Set();
    Object.values(GD.provinces).forEach(p => p.lat != null && pts.add(p.lat + ',' + p.lon));
    Object.values(GD.zones).forEach(z => pts.add(z.lat + ',' + z.lon));
    ['provinces', 'zones'].forEach(l => BND && BND[l].features.forEach(f => f.properties.c && pts.add(f.properties.c[1] + ',' + f.properties.c[0])));
    const keys = [...document.querySelectorAll('.dmap [data-mk]')].map(e => e.getAttribute('data-mk'));
    return keys.every(k => { const [lvl, id] = k.split(':'); const geo = lvl === 'P' ? { zone: BDBV.G.zones.find(z => z.province === id).id } : { zone: id }; const a = BDBV.mapApi.anchor(geo, lvl === 'P' ? 'province' : 'zone'); return a && pts.has(a.lat + ',' + a.lon); });
  });
  assert.ok(anchorsOk, 'all markers at official centroids or gazetteer points');
  // official boundaries: 26 provinces + 519 health zones drawn; units shaded by the indicator
  assert.strictEqual(await page.$$eval('#msvg .up', e => e.length), 26);
  assert.strictEqual(await page.$$eval('#msvg .uz', e => e.length), 519);
  // default view: triage risk level, in the same colours as the high / medium / low labels
  const riskShade = await page.$$eval('#msvg .up', e => e.filter(x => x.style.fill).map(x => [x.getAttribute('data-u'), getComputedStyle(x).fill]));
  const lvl = await db(() => BDBV.mapApi.values().riskLvl);
  const RGB = { 1: 'rgb(63, 158, 107)', 2: 'rgb(240, 165, 49)', 3: 'rgb(214, 69, 65)' };
  assert.ok(riskShade.length > 0 && riskShade.every(([k, f]) => f === RGB[lvl[k]]), 'provinces coloured by highest risk: ' + JSON.stringify(riskShade.slice(0, 3)));
  assert.ok(/High risk|Risque élevé/.test(await page.textContent('#mscale')) && /Low risk|Risque faible/.test(await page.textContent('#mscale')));
  await page.selectOption('#mind', 'cases');
  const shaded = await page.$$eval('#msvg .up', e => e.filter(x => x.style.fill).map(x => x.getAttribute('data-u')));
  const vals = await db(() => BDBV.mapApi.values().cases);
  assert.ok(shaded.length > 0 && shaded.every(k => vals[k] > 0), 'shaded provinces = provinces with cases');
  // hover card
  await page.hover('#msvg .up[data-u="' + shaded[0] + '"]', { force: true });
  await page.waitForSelector('#mtip:not([hidden])');
  assert.ok(/Cas \(suspects/.test(await page.textContent('#mtip')), 'hover card with indicator values');
  await page.click('.dmap [data-mk]');
  assert.ok(/Point de référence/.test(await page.textContent('#mdetail')));
  // zone level, search, profile panel with P-code and weekly trend
  await page.selectOption('#mlevel', 'zone');
  const optAru = await page.$$eval('#munits option', os => os.map(o => o.value).find(v => /^Aru \(/.test(v)));
  await page.fill('#msearch', optAru); await page.dispatchEvent('#msearch', 'change');
  assert.strictEqual(await db(() => BDBV.mapApi.state.sel), 'Z:Z-aru');
  assert.notStrictEqual(await page.getAttribute('#msvg', 'viewBox'), '0 0 560 560', 'zoomed to the zone');
  assert.ok(/CD54/.test(await page.textContent('#mpanel')) && await page.$('#mpanel svg.spark'), 'profile with P-code and 12-week trend');
  await page.click('[data-z="reset"]');
  assert.strictEqual(await page.getAttribute('#msvg', 'viewBox'), '0.00 0.00 560.00 560.00');
  await page.click('[data-z="in"]');
  assert.notStrictEqual(await page.getAttribute('#msvg', 'viewBox'), '0.00 0.00 560.00 560.00', 'zoom button');
  // indicator switch and playback through the weeks
  await page.selectOption('#mind', 'deaths');
  assert.ok(/Décès signalés/.test(await page.textContent('#mscale')));
  await page.click('#mplay');
  await page.waitForFunction(() => BDBV.mapApi.state.week < 11, null, { timeout: 5000 });
  await page.click('#mplay');
  await page.click('details.msym summary'); await page.uncheck('[data-layer="burial"]');
  assert.strictEqual(await db(() => BDBV.mapApi.state.layers.burial), false, 'symbol layer switched off');
  await page.check('#mcomp');
  assert.ok(/Comparaison avec la période précédente/.test(await view()));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#mcsv')]);
  assert.ok(/carte_surveillance.*\.csv$/.test(dl.suggestedFilename()));
  ok('map: official boundaries (26 provinces, 519 zones), risk level in category colours, shading by indicator, hover card, marker details, search and zoom, profile with trend, playback, comparison, CSV');
  const optBj = await page.$$eval('#munits option', os => os.map(o => o.value).find(v => /^Banjow Moke/.test(v)));
  await page.fill('#msearch', optBj); await page.dispatchEvent('#msearch', 'change');
  assert.strictEqual(await db(() => BDBV.mapApi.state.sel), 'Z:Z-banzow-moke', 'other spelling finds the same zone');
  assert.ok(/Banjow Moke/.test(await page.textContent('#mpanel')) && /CD330201/.test(await page.textContent('#mpanel')));
  await tab('dashboard');
  const mini = await db(() => ({ panels: document.querySelectorAll('.mapmini figure').length, zones: document.querySelectorAll('.mapmini figure:first-child .uz').length, shaded: [...document.querySelectorAll('.mapmini figure:first-child .uz')].filter(p => p.style.fill).length }));
  assert.ok(mini.panels === 2 && mini.zones === 519 && mini.shaded > 0, 'dashboard map from the boundaries, with affected-area panel: ' + JSON.stringify(mini));
  ok('dashboard map uses the official boundaries (zones shaded, affected-area panel); Banjow Moke spelling finds Banzow Moke');

  // ---- Reports (§13) ----
  await tab('reports');
  const types = await page.$$eval('#rtype option', o => o.map(x => x.value));
  assert.strictEqual(types.length, 10);
  for (const t of types) { await page.selectOption('#rtype', t); const rows = await db((tt) => BDBV.reportRows(tt, {}).rows.length, t); assert.ok(rows >= 1, t); }
  await page.selectOption('#rtype', 'cases');
  for (const fmt of ['csv', 'xlsx', 'pdf']) {
    const [d] = await Promise.all([page.waitForEvent('download'), page.click('[data-fmt="' + fmt + '"]')]);
    const p = await d.path(); assert.ok(fs.statSync(p).size > 500, fmt + ' size');
    if (fmt === 'csv') assert.ok(!/KASONGO/.test(fs.readFileSync(p, 'utf8')), 'pseudonymised by default');
  }
  await page.check('#rid'); await page.click('[data-fmt="csv"]');
  assert.ok(/motif|reason/i.test(await page.textContent('#toast')), 'reason required for identifiers');
  await page.fill('#rreason', 'Investigation du cas index (test)'); await page.dispatchEvent('#rreason', 'change');
  await page.check('#rid');
  const [d2] = await Promise.all([page.waitForEvent('download'), page.click('[data-fmt="csv"]')]);
  assert.ok(/KASONGO/.test(fs.readFileSync(await d2.path(), 'utf8')), 'identifiers included with reason');
  assert.ok(await db(() => BDBV.db().audit.some(a => a.action === 'download' && /IDENTIFIERS/.test(a.detail))));
  await role('decideur'); await tab('reports');
  const dtypes = await page.$$eval('#rtype option', o => o.map(x => x.value));
  assert.ok(!dtypes.includes('cases') && !dtypes.includes('contacts'), 'no line lists for administrators');
  ok('10 report types; CSV/XLSX/PDF downloads; pseudonymised unless authorised with logged reason');

  // ---- Analysis (§14) ----
  await role('surveillant'); await tab('analysis');
  const an = await view();
  assert.ok(/ne prouve ni une exposition professionnelle ni une causalité/.test(an) && /70\+/.test(an));
  ok('occupational & demographic analysis with no-causation notice and standard age groups');

  // ---- Kiswahili (§10) ----
  await page.selectOption('#lang', 'sw');
  await role('reco'); await tab('reco');
  assert.ok(/Ripoti ya jamii/.test(await view()) && /Vifo \(jumla\) katika kipindi/.test(await view()));
  await tab('rumour');
  assert.ok(/Ripoti tukio la kiafya/.test(await view()));
  await role('soignant'); await tab('triage');
  assert.ok(/Homa/.test(await view()) && /Dalili za kutokwa damu/.test(await view()));
  await page.selectOption('#lang', 'fr');
  ok('Kiswahili: RECO, rumour and triage workflows translated');

  // ---- Historical data import (trend before the system was in use) ----
  await page.selectOption('#lang', 'en');
  await role('surveillant'); await tab('history');
  await page.click('#hdemo');
  assert.ok(await page.$$eval('.hchart .bimp', (e) => e.length) > 20, 'synthetic earlier wave drawn as imported bars');
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'bdbv-hist-'));
  const weekly = path.join(tmp, 'sitreps_2025.csv');
  fs.writeFileSync(weekly, 'Rapport de situation DPS (synthetique)\nsemaine;province;zone_de_sante;cas_suspects;cas_confirmes;deces\n2025-W10;Ituri;ZS Aru;4;1;1\n03/03/2025;Ituri;Ariwara;2;0;0\n2025-03-10;Mai-Ndombe;Banjow Moke;1;0;0\n2025-03-10;Ituri;Nowhere;3;0;0\n2025-03-10;Ituri;Aru;x;0;0\n2025-03-17;Nord-Kivu;;5;2;1\n');
  await page.setInputFiles('#hfile', weekly);
  await page.waitForSelector('#hok');
  const prev = await page.textContent('#hprev');
  assert.ok(/Weekly counts/.test(prev) && /2 row\(s\) rejected/.test(prev) && /unknown health zone: Nowhere/.test(prev) && /invalid number/.test(prev), 'preview: layout detected, bad rows listed: ' + prev.slice(0, 300));
  await page.fill('#hsource', 'DPS situation reports (synthetic test)');
  await page.click('#hok');
  const b1 = await db(() => BDBV.historyApi.active().find((b) => /sitreps_2025/.test(b.file)));
  assert.deepStrictEqual(b1.rows.map((r) => [r[0], r[1], r[2]]), [['2025-03-03', 'P-ituri', 'Z-ariwara'], ['2025-03-03', 'P-ituri', 'Z-aru'], ['2025-03-10', 'P-mai-ndombe', 'Z-banzow-moke'], ['2025-03-17', 'P-nord-kivu', '']], 'weeks to Monday, ZS prefix, other spelling, province-only row');
  assert.deepStrictEqual(b1.totals, [12, 0, 3, 2, 0, 0]);
  // line list: one row per case, names column present but never stored
  const ll = path.join(tmp, 'linelist.csv');
  fs.writeFileSync(ll, 'nom,date,province,health_zone,classification,outcome\nKAHINDO Jean,2025-04-02,Ituri,Aru,Confirmé,Décédé\nMAPENDO Ana,2025-04-03,Ituri,Aru,suspect,vivant\nBARAKA Paul,2025-04-03,Ituri,Aru,non-cas,vivant\n');
  await page.setInputFiles('#hfile', ll);
  await page.waitForSelector('#hok');
  assert.ok(/Line list/.test(await page.textContent('#hprev')) && /1 non-cases left out/.test(await page.textContent('#hprev')));
  await page.click('#hok');
  const b2 = await db(() => JSON.stringify(BDBV.historyApi.active().find((b) => b.kind === 'linelist')));
  assert.ok(!/KAHINDO|MAPENDO|BARAKA/.test(b2), 'no names stored');
  assert.deepStrictEqual(JSON.parse(b2).rows, [['2025-03-31', 'P-ituri', 'Z-aru', 'CD540904', 1, 0, 1, 1, 0, 0]], 'line list reduced to one weekly row (P-code kept)');
  // Excel workbook with real date cells (as exported from DHIS2 / Excel)
  const XLSXn = require(path.join(__dirname, '..', 'prototype', 'vendor', 'xlsx.full.min.js'));
  const wb = XLSXn.utils.book_new();
  XLSXn.utils.book_append_sheet(wb, XLSXn.utils.aoa_to_sheet([['week_start', 'province', 'health_zone', 'suspected', 'deaths', 'contacts'], [new Date(Date.UTC(2025, 4, 14)), 'Ituri', 'Adi', 6, 2, 30]], { cellDates: true }), 'Data');
  const xl = path.join(tmp, 'dhis2_export.xlsx'); fs.writeFileSync(xl, XLSXn.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  await page.setInputFiles('#hfile', xl);
  await page.waitForSelector('#hok'); await page.click('#hok');
  const b3 = await db(() => BDBV.historyApi.active().find((b) => b.file === 'dhis2_export.xlsx').rows);
  assert.deepStrictEqual(b3.map((r) => [r[0], r[2], r[4], r[7], r[9]]), [['2025-05-12', 'Z-adi', 6, 2, 30]], 'Excel date cell read, week starts Monday');
  // imported counts appear on the map (period: all) and can be switched off
  await tab('map'); await page.selectOption('#mdays', 'all'); await page.selectOption('#mlevel', 'zone');
  const withH = await db(() => BDBV.mapApi.values().cases['Z:Z-banzow-moke'] || 0);
  assert.strictEqual(withH, 1, 'imported case shades Banzow Moke');
  await page.uncheck('#mhist');
  assert.strictEqual(await db(() => BDBV.mapApi.values().cases['Z:Z-banzow-moke'] || 0), 0);
  await page.check('#mhist');
  // withdraw a batch: kept in the list, no longer counted
  await tab('history');
  await page.click('[data-hdel="' + b1.id + '"]'); await page.click('#askyes');
  assert.ok(await db((id) => BDBV.historyApi.batches().find((b) => b.id === id).deleted, b1.id));
  assert.ok(/withdrawn/.test(await view()));
  assert.ok(await db(() => BDBV.db().audit.some((a) => a.action === 'import' && a.entity === 'history') && BDBV.db().audit.some((a) => a.action === 'withdraw')), 'audited');
  await page.selectOption('#lang', 'fr');
  ok('historical data: CSV and Excel, weekly counts and line lists imported (names never stored), rows checked and rejected with reasons, shown on map and trend, withdrawable, audited');

  // ---- System-generated text follows the chosen language (alerts, queue, SMS) ----
  await page.selectOption('#lang', 'en');
  await role('surveillant'); await tab('alerts');
  const al = await view();
  assert.ok(/BDBV HIGH-RISK ALERT\. Record /.test(al) && !/ALERTE BDBV|Ouvrir l'application/.test(al), 'alert SMS in English');
  await tab('verify');
  const qv = await view();
  assert.ok(!/Risque élevé|Visite de terrain|Lieu de démonstration/.test(qv), 'queue in English');
  assert.ok(/^Triage: (High|Medium|Low) risk \(score/.test(await db(() => BDBV.queue.describe(BDBV.db().queue.find((q) => q.source === 'facility')))), 'queue description uses the risk labels');
  await page.selectOption('#lang', 'fr'); await tab('alerts');
  assert.ok(/ALERTE BDBV RISQUE ÉLEVÉ\. Dossier /.test(await view()), 'same alert in French after switching');
  ok('alerts, SMS text and queue descriptions are rendered in the language chosen, not the language they were stored in');

  assert.deepStrictEqual(errors, [], 'no JS errors: ' + errors.join(' | '));
  await browser.close();
  console.log('\ne2e v2: ' + n + ' checks passed');
})().catch(e => { console.error(e); process.exit(1); });
