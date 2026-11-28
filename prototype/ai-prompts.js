/* AI tasks shared by the server (Claude API) and the demonstration page on claude.ai (the page's own
 * Claude access): instructions, answer formats and the builders of what is sent. One source, so the
 * deployed system and the demonstration behave the same.
 *
 * What is sent: for reports and rumours, the report's own facts without the reporter's name or phone
 * number (numbers inside the text are removed); for briefs, counts only; for a laboratory check, the
 * sample record and the case's age, sex, risk level, onset and signs, never a name.
 * Every answer is a suggestion shown as such: it never changes a record or decides anything.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BDBV_AI = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var PRIORITIES = ['high', 'medium', 'low'];
  var strList = { type: 'array', items: { type: 'string' } };

  var TASKS = {
    rumour: {
      system: [
        'You help surveillance officers in the Democratic Republic of the Congo sort community reports and rumours during a Bundibugyo ebolavirus (BDBV) outbreak response.',
        'You organise information for a human officer who will verify it in the field. You never confirm or rule out Ebola, and you never decide whether a report is true.',
        'Reports may be written in French, Lingala, Kiswahili or English, often briefly and with spelling mistakes.',
        'Recommend a review priority:',
        '- high: any unexplained death or death after illness; two or more ill or dead people linked by place or household; an ill health worker; contact with a known or suspected case; bleeding; an unsafe burial;',
        '- medium: one ill person with signs compatible with Ebola (fever with vomiting, diarrhoea, weakness, or unexplained bleeding) and no death;',
        '- low: vague, unrelated to illness, or clearly not compatible.',
        'When unsure between two levels, choose the higher one: a missed urgent report costs more than an extra check.',
        'Possible duplicates: only list IDs from the recent reports provided, and only when the place, date and event plausibly describe the same thing. Give the reason in a few words.',
        'Missing information: the specific questions the officer should ask the reporter (for example exact village, date of death, number ill, symptoms, burial arrangements).',
        'Keep lists short (at most five items each). Do not invent facts that the report does not contain. Write all text in the language requested.'
      ].join('\n'),
      schema: {
        type: 'object', additionalProperties: false,
        required: ['summary', 'priority', 'priority_reasons', 'places', 'dates', 'events', 'compatible_signs', 'possible_duplicates', 'missing_information'],
        properties: {
          summary: { type: 'string' }, priority: { type: 'string', enum: PRIORITIES }, priority_reasons: strList,
          places: strList, dates: strList, events: strList, compatible_signs: strList,
          possible_duplicates: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'reason'], properties: { id: { type: 'string' }, reason: { type: 'string' } } } },
          missing_information: strList
        }
      }
    },
    brief: {
      system: [
        'You write a short situation brief for a public-health officer working on the Bundibugyo ebolavirus (BDBV) outbreak response in the Democratic Republic of the Congo.',
        'You receive aggregated counts only (no individual data), for the officer\'s own area of responsibility, for the last 7 days and the 7 days before.',
        'Write: a one-sentence headline; up to five key points, each marked watch (a worrying change or signal), action (something overdue or waiting on this officer) or info, naming the health zone or laboratory step it concerns; and up to three concrete actions for the next 24 hours.',
        'Use only the numbers given. Compare the two weeks where it helps. Say plainly when numbers are small or data are missing. Never call a case confirmed unless the counts say laboratory-confirmed.',
        'The triage risk level (high, medium, low) is not a diagnosis. Plain words, no jargon, short sentences. Write in the language requested.'
      ].join('\n'),
      schema: {
        type: 'object', additionalProperties: false, required: ['headline', 'points', 'actions', 'caveats'],
        properties: {
          headline: { type: 'string' },
          points: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['kind', 'text', 'where'], properties: { kind: { type: 'string', enum: ['watch', 'action', 'info'] }, text: { type: 'string' }, where: { type: 'string' } } } },
          actions: strList, caveats: strList
        }
      }
    },
    lab_review: {
      system: [
        'You check one laboratory record for a Bundibugyo ebolavirus (BDBV) test before the laboratory manager approves the result. You do not approve or reject: you help the manager look.',
        'Look for: dates out of order (collection, receipt, testing); a result that does not fit its Ct value (with RT-PCR, a positive with a very late Ct, for example above about 37, deserves a second look; an inconclusive result needs a repeat); missing method, sample type or tester; a sample type that does not fit the patient (an oral swab is for a deceased person); gaps in the chain of custody.',
        'Compare with the clinical picture: a negative result on a sample taken less than 72 hours after symptom onset is commonly repeated on a later sample; a negative result in a high-risk patient with bleeding deserves attention.',
        'List the issues by severity (high, medium, low), suggest a short comment the manager could record, and recommend one of: approve (nothing found), check (look at the issues first), repeat (a new sample is advisable). Say "approve" only when you find nothing of concern.',
        'Be specific and brief. Do not invent values that are not in the record. Write in the language requested.'
      ].join('\n'),
      schema: {
        type: 'object', additionalProperties: false, required: ['summary', 'recommendation', 'issues', 'suggested_comment'],
        properties: {
          summary: { type: 'string' }, recommendation: { type: 'string', enum: ['approve', 'check', 'repeat'] },
          issues: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['severity', 'text'], properties: { severity: { type: 'string', enum: PRIORITIES }, text: { type: 'string' } } } },
          suggested_comment: { type: 'string' }
        }
      }
    }
  };

  var LANG = { en: 'English', fr: 'French', sw: 'Kiswahili' };
  function scrub(s, n) { return String(s == null ? '' : s).replace(/\+?\d[\d\s.\-]{6,}\d/g, '[number removed]').slice(0, n || 1500); }
  function userMessage(task, payload, lang) {
    return 'Write in ' + (LANG[lang] || 'English') + '.\n\n' +
      (task === 'rumour' ? 'Report to review (JSON):\n' + JSON.stringify(payload.item) + '\n\nRecent reports from the same health zone, for possible duplicates (JSON):\n' + JSON.stringify(payload.recent || [])
        : task === 'brief' ? 'Officer: ' + (payload.role || '') + (payload.area ? ', area: ' + payload.area : '') + '\nCounts (JSON):\n' + JSON.stringify(payload.counts)
          : 'Laboratory record and case summary (JSON):\n' + JSON.stringify(payload));
  }
  // The same prompt as one string, for the page's own Claude access (which takes text and returns JSON).
  function pagePrompt(task, payload, lang) {
    return TASKS[task].system + '\n\n' + userMessage(task, payload, lang) + '\n\nAnswer with JSON only, matching this JSON schema exactly:\n' + JSON.stringify(TASKS[task].schema);
  }

  // What is sent about one alert: its facts and those of its source record, never the reporter's identity.
  function describeAlert(alert, source) {
    var g = alert.geo || {};
    var out = { id: alert.id, source: alert.source, type: alert.type, submitted_at: alert.submitted_at, health_zone: g.zone, health_area: g.area, village_code: g.village, summary_line: scrub(alert.description, 300) };
    if (source && alert.source === 'rumour') {
      out.event_type = source.type; out.place_described = scrub(source.place_text, 200); out.date_occurred = source.date_occurred;
      out.people_ill = source.n_people; out.deaths = source.n_deaths; out.reporter_relationship = source.relationship; out.description = scrub(source.description);
    }
    if (source && alert.source === 'reco') {
      out.counts = source.counts || {};
      out.events = (source.events || []).slice(0, 10).map(function (e) { return { type: e.type, date_occurred: e.date_occurred, n: e.n, location: scrub(e.location, 120), description: scrub(e.description, 400) }; });
    }
    return out;
  }

  // Keep only what each format allows (and duplicates that really are among the recent reports).
  function clean(task, r, ctx) {
    r = r || {};
    var list = function (v, n) { return (Array.isArray(v) ? v : []).filter(function (x) { return typeof x === 'string' && x.trim(); }).slice(0, n || 5).map(function (x) { return x.slice(0, 400); }); };
    if (task === 'rumour') {
      var ids = (ctx && ctx.recentIds) || {};
      return {
        summary: String(r.summary || '').slice(0, 600), priority: PRIORITIES.indexOf(r.priority) >= 0 ? r.priority : 'medium',
        priority_reasons: list(r.priority_reasons), places: list(r.places), dates: list(r.dates), events: list(r.events),
        compatible_signs: list(r.compatible_signs), missing_information: list(r.missing_information),
        possible_duplicates: (Array.isArray(r.possible_duplicates) ? r.possible_duplicates : []).filter(function (d) { return d && ids[d.id]; }).slice(0, 5).map(function (d) { return { id: d.id, reason: String(d.reason || '').slice(0, 200) }; })
      };
    }
    if (task === 'brief') {
      return {
        headline: String(r.headline || '').slice(0, 300),
        points: (Array.isArray(r.points) ? r.points : []).slice(0, 5).map(function (p) { return { kind: ['watch', 'action', 'info'].indexOf(p && p.kind) >= 0 ? p.kind : 'info', text: String((p && p.text) || '').slice(0, 400), where: String((p && p.where) || '').slice(0, 120) }; }).filter(function (p) { return p.text; }),
        actions: list(r.actions, 3), caveats: list(r.caveats, 3)
      };
    }
    return {
      summary: String(r.summary || '').slice(0, 600), recommendation: ['approve', 'check', 'repeat'].indexOf(r.recommendation) >= 0 ? r.recommendation : 'check',
      issues: (Array.isArray(r.issues) ? r.issues : []).slice(0, 6).map(function (i) { return { severity: PRIORITIES.indexOf(i && i.severity) >= 0 ? i.severity : 'medium', text: String((i && i.text) || '').slice(0, 400) }; }).filter(function (i) { return i.text; }),
      suggested_comment: String(r.suggested_comment || '').slice(0, 400)
    };
  }

  // Predictable answers for automated tests (no AI service called).
  function mock(task, payload) {
    if (task === 'brief') {
      var c = payload.counts || {}, t = c.this_week || {};
      return { headline: 'Mock brief: ' + (t.high_risk || 0) + ' high-risk assessment(s) this week.', points: [{ kind: 'watch', text: 'High-risk assessments this week: ' + (t.high_risk || 0), where: payload.area || 'all' }], actions: ['Review overdue alerts'], caveats: ['Mock answer for tests'] };
    }
    if (task === 'lab_review') {
      var s = payload.sample || {}, issues = [];
      if (s.result === 'positive' && +s.ct > 37) issues.push({ severity: 'high', text: 'Positive with a late Ct (' + s.ct + ')' });
      if (s.result === 'negative' && payload.case && payload.case.days_onset_to_collection != null && payload.case.days_onset_to_collection < 3) issues.push({ severity: 'medium', text: 'Negative on a sample taken less than 72 hours after onset' });
      if (!s.method) issues.push({ severity: 'medium', text: 'Method missing' });
      return { summary: issues.length ? 'Points to check before approval.' : 'Nothing of concern found.', recommendation: issues.some(function (i) { return i.severity === 'high'; }) ? 'repeat' : (issues.length ? 'check' : 'approve'), issues: issues, suggested_comment: issues.length ? issues[0].text : '' };
    }
    var it = payload.item || {}, text = JSON.stringify(it).toLowerCase();
    var high = (it.deaths > 0) || (it.people_ill >= 2) || /d[ée]c[èe]s|mort|death|died|kufa|saign|bleed|cluster|infirmi|nurse|soignant/.test(text);
    var medium = /fi[èe]vre|fever|homa|vomi|diarrh/.test(text);
    var dups = (payload.recent || []).filter(function (r) { return r.event_type && r.event_type === it.event_type && r.village_code === it.village_code; }).slice(0, 3).map(function (r) { return { id: r.id, reason: 'same village and event type' }; });
    return { summary: (it.description || it.summary_line || '').slice(0, 160), priority: high ? 'high' : (medium ? 'medium' : 'low'), priority_reasons: high ? ['death, cluster, bleeding or health worker mentioned'] : (medium ? ['compatible signs mentioned'] : ['no compatible signs mentioned']), places: [it.place_described].filter(Boolean), dates: [it.date_occurred].filter(Boolean), events: [it.event_type].filter(Boolean), compatible_signs: [], possible_duplicates: dups, missing_information: ['exact village', 'date of onset or death'] };
  }

  return { TASKS: TASKS, PRIORITIES: PRIORITIES, scrub: scrub, userMessage: userMessage, pagePrompt: pagePrompt, describeAlert: describeAlert, clean: clean, mock: mock };
});
