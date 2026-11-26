/*
 * BDBV triage scoring engine (provisional, rule-based).
 * Pure functions, no DOM: used by the prototype (browser) and tests (Node).
 * All weights, caps, thresholds and floor rules come from the rule-set JSON
 * (config/scoring_rules.json), so they can be changed without code changes.
 *
 * The output is an ordinal SUSPICION INDEX (0-100), NOT a probability.
 */
(function (root) {
  'use strict';

  var CAT_ORDER = { GREEN: 0, AMBER: 1, RED: 2 };
  var DAY = 86400000;

  function toDate(s) {
    if (!s) return null;
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function catFromScore(score, th) {
    if (score >= th.red) return 'RED';
    if (score >= th.amber) return 'AMBER';
    return 'GREEN';
  }

  function maxCat(a, b) { return CAT_ORDER[a] >= CAT_ORDER[b] ? a : b; }

  // Evaluate a floor condition against a map id -> boolean ("is present").
  function cond(c, present) {
    if (c.all) return c.all.every(function (x) { return cond(x, present); });
    if (c.or) return c.or.some(function (x) { return cond(x, present); });
    if (c.any) return c.any.some(function (id) { return !!present[id]; });
    if (c.count) {
      var n = c.count.ids.filter(function (id) { return !!present[id]; }).length;
      return n >= c.count.min;
    }
    return false;
  }

  /*
   * input = {
   *   onset_date: 'YYYY-MM-DD' | null,
   *   assessed_at: ISO string,
   *   items: { <id>: { s: 'yes'|'no'|'unk', date: 'YYYY-MM-DD'|null } },
   *   deceased: boolean,
   *   clinician: { category: 'RED'|'AMBER'|'GREEN'|'', reason: string }
   * }
   */
  function evaluate(input, rules) {
    var th = rules.thresholds;
    var win = rules.exposure_window_days;
    var assessed = toDate(input.assessed_at) || new Date();
    var onset = toDate(input.onset_date);
    var ref = onset || assessed;
    var notes = [];
    if (!onset) notes.push('ONSET_UNKNOWN');

    var dom = {};
    Object.keys(rules.domains).forEach(function (k) { dom[k] = { observed: 0, potential: 0 }; });

    var contributions = [];
    // Correlated symptoms share a group cap (rules.groups), so ticking more of them
    // does not add points freely.
    var groups = rules.groups || {};
    var grp = {};
    Object.keys(groups).forEach(function (g) { grp[g] = { observed: 0, potential: 0 }; });
    function addPts(it, kind, pts) {
      if (it.group && grp[it.group]) grp[it.group][kind] += pts; else dom[it.domain][kind] += pts;
    }
    var presentObs = {};   // known present
    var presentPot = {};   // present or unknown
    var scored = 0, answered = 0;
    var unknownItems = [];

    rules.items.forEach(function (it) {
      var v = (input.items && input.items[it.id]) || { s: 'unk' };
      var s = v.s || 'unk';
      var counted = s === 'yes';
      var outOfWindow = false;

      if (counted && it.window && v.date) {
        var d = toDate(v.date);
        if (d) {
          var diff = Math.round((ref.getTime() - d.getTime()) / DAY);
          if (diff > win || diff < -1) {   // >21 days before onset, or after onset
            counted = false; outOfWindow = true;
            notes.push('OUT_OF_WINDOW:' + it.id);
          }
        }
      }
      if (counted && it.window && !v.date) notes.push('EXPOSURE_DATE_UNKNOWN:' + it.id);

      if (counted) presentObs[it.id] = true;
      if (counted || s === 'unk') presentPot[it.id] = true;

      if (it.points > 0) {
        scored++;
        if (s !== 'unk') answered++; else unknownItems.push(it.id);
        if (counted) addPts(it, 'observed', it.points);
        if (counted || s === 'unk') addPts(it, 'potential', it.points);
      }
      if (counted && it.severity) notes.push('SEVERITY_SIGN:' + it.id);
      contributions.push({
        id: it.id, domain: it.domain, points: it.points, tier: it.tier, group: it.group || null,
        status: outOfWindow ? 'out_of_window' : s,
        counted: counted && it.points > 0
      });
    });

    if (input.deceased) { presentObs.deceased = true; presentPot.deceased = true; }

    // Fold capped group totals into their domains.
    var groupScores = {};
    Object.keys(grp).forEach(function (g) {
      var cap = groups[g].cap, dm = groups[g].domain || 'clinical';
      groupScores[g] = { observed: Math.min(grp[g].observed, cap), raw: grp[g].observed, cap: cap };
      dom[dm].observed += Math.min(grp[g].observed, cap);
      dom[dm].potential += Math.min(grp[g].potential, cap);
    });

    function total(kind) {
      var sum = 0;
      Object.keys(dom).forEach(function (k) {
        sum += Math.min(dom[k][kind], rules.domains[k].cap);
      });
      return Math.min(100, sum);
    }
    var score = total('observed');
    var potentialScore = total('potential');

    function categorise(sc, present) {
      var cat = catFromScore(sc, th);
      var fired = [];
      (rules.floors || []).forEach(function (f) {
        if (cond(f.when, present)) {
          fired.push(f.id);
          cat = maxCat(cat, f.min_category);
        }
      });
      return { category: cat, floors: fired };
    }

    var obs = categorise(score, presentObs);
    var pot = categorise(potentialScore, presentPot);

    var algorithmCategory = obs.category;
    var finalCategory = algorithmCategory;
    var override = null;
    if (input.clinician && input.clinician.category && input.clinician.category !== algorithmCategory) {
      override = {
        from: algorithmCategory,
        to: input.clinician.category,
        reason: input.clinician.reason || '',
        direction: CAT_ORDER[input.clinician.category] > CAT_ORDER[algorithmCategory] ? 'up' : 'down'
      };
      finalCategory = input.clinician.category;
    }

    var domainScores = {};
    Object.keys(dom).forEach(function (k) {
      domainScores[k] = { observed: Math.min(dom[k].observed, rules.domains[k].cap), cap: rules.domains[k].cap };
    });

    return {
      rule_set: rules.rule_set_id + ' v' + rules.version,
      score: score,
      domain_scores: domainScores,
      group_scores: groupScores,
      severity_signs: notes.filter(function (n) { return n.indexOf('SEVERITY_SIGN:') === 0; }).map(function (n) { return n.split(':')[1]; }),
      algorithm_category: algorithmCategory,
      category: finalCategory,
      floors_applied: obs.floors,
      override: override,
      completeness: scored ? Math.round(100 * answered / scored) : 0,
      unknown_items: unknownItems,
      potential_score: potentialScore,
      potential_category: pot.category,
      incomplete_could_escalate: CAT_ORDER[pot.category] > CAT_ORDER[algorithmCategory],
      contributions: contributions,
      notes: notes
    };
  }

  /*
   * Community concern level for an area, from RECO reports.
   * reports: [{ village, area, zone, reported_at, counts: {...}, events: [...] }]
   * Returns the level for the village and for its health area, kept SEPARATE
   * from the individual score.
   */
  function areaConcern(reports, rules, filterFn, now) {
    var c = rules.community;
    now = now || new Date();
    var since = now.getTime() - c.window_days * DAY;
    var pts = 0, totals = {}, unverified = 0, n = 0;
    Object.keys(c.weights).forEach(function (k) { totals[k] = 0; });
    reports.forEach(function (r) {
      var t = toDate(r.reported_at);
      if (!t || t.getTime() < since || t.getTime() > now.getTime() + DAY) return;
      if (!filterFn(r)) return;
      n++;
      Object.keys(c.weights).forEach(function (k) {
        var v = (r.counts && +r.counts[k]) || 0;
        totals[k] += v;
        pts += v * c.weights[k];
      });
      (r.events || []).forEach(function (e) {
        if (e.verification === 'reported' || e.verification === 'in_progress') unverified++;
      });
    });
    var level = c.levels[0];
    c.levels.forEach(function (l) { if (pts >= l.min_points) level = l; });
    return { level: level.level, label_fr: level.label_fr, label_en: level.label_en, points: pts, totals: totals, reports: n, unverified_events: unverified };
  }

  function communityContext(reports, rules, geo, now) {
    var village = areaConcern(reports, rules, function (r) { return r.village === geo.village; }, now);
    var area = areaConcern(reports, rules, function (r) { return r.area === geo.area; }, now);
    var zone = areaConcern(reports, rules, function (r) { return r.zone === geo.zone; }, now);
    var maxLevel = Math.max(village.level, area.level);
    return { village: village, area: area, zone: zone, advisory: maxLevel >= 2 };
  }

  /* Early warning: compare most recent week with baseline of previous weeks.
     series: array of weekly counts, index 0 = current week (most recent). */
  function earlyWarning(series, ew) {
    var current = series[0] || 0;
    var base = series.slice(1, 1 + ew.baseline_weeks);
    if (base.length < ew.baseline_weeks) return { signal: false, reason: 'INSUFFICIENT_BASELINE', current: current };
    var mean = base.reduce(function (a, b) { return a + b; }, 0) / base.length;
    var sd = Math.sqrt(base.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / base.length);
    var thresh = mean + ew.sd_multiplier * Math.max(sd, ew.min_sd);
    return {
      signal: current > thresh && current >= ew.min_count,
      current: current, mean: Math.round(mean * 10) / 10, threshold: Math.round(thresh * 10) / 10
    };
  }

  var api = { evaluate: evaluate, communityContext: communityContext, areaConcern: areaConcern, earlyWarning: earlyWarning, catFromScore: catFromScore };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BDBVScoring = api;
})(typeof window !== 'undefined' ? window : this);
