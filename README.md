# BDBV Clinical Triage & Community Surveillance Decision-Support Tool (DRC)

An integrated design and working prototype to strengthen early detection of **Bundibugyo virus disease (BDBV)** in the Democratic Republic of the Congo. It links:

- **Module A: health facility triage**, which collects clinical and exposure data (optionally by **AI voice capture**, reviewed by the health worker) and gives a transparent **suspicion score** with RED/AMBER/GREEN actions and alerts;
- **Module B: community-based surveillance (RECO)**, which handles rapid, offline reporting of deaths, burials, clusters and alerts, with a verification workflow;
- **an integrated dashboard** with a map, trends and early-warning signals;
- **v2 modules**: alert verification queue with turnaround times, interactive surveillance map (real DRC outline, no invented coordinates), contact tracing and follow-up, laboratory sample tracking with chain of custody, case management, public rumour reporting, facility-head dashboard, occupational analysis, 10 downloadable reports (CSV/Excel/PDF), French and Congolese Kiswahili.

> ⚠️ **Status: design and demonstration prototype.** The scoring rules are **provisional and not validated**. This is decision support, not a diagnostic tool: the score is **not a probability of infection**. All clinical decisions, specimen collection and confirmation must follow DRC Ministry of Health and WHO procedures. See [assumptions and items to confirm](docs/00_assumptions_and_open_questions.md).

## Deliverables

| # | Deliverable | Location |
|---|---|---|
| 1 | System requirements document | [docs/01_system_requirements.md](docs/01_system_requirements.md) |
| 2 | Data collection framework (data dictionary) | [docs/02_data_collection_framework.md](docs/02_data_collection_framework.md) |
| 3 | Risk-scoring framework (matrix, rationale, validation) | [docs/03_risk_scoring_framework.md](docs/03_risk_scoring_framework.md) · machine-readable: [config/scoring_rules.json](config/scoring_rules.json) |
| 4 | Alert and decision framework | [docs/04_alert_decision_framework.md](docs/04_alert_decision_framework.md) |
| 5 | System architecture | [docs/05_system_architecture.md](docs/05_system_architecture.md) |
| 6 | Dashboard design | [docs/06_dashboard_design.md](docs/06_dashboard_design.md) |
| 7 | Functional UI prototype | [prototype/](prototype/) · guide: [docs/07_prototype_guide.md](docs/07_prototype_guide.md) |
| 8 | Implementation roadmap | [docs/08_implementation_roadmap.md](docs/08_implementation_roadmap.md) |
| 9 | v2 gap analysis, architecture, schema, permissions, tab layout | [docs/09_v2_gap_analysis_and_design.md](docs/09_v2_gap_analysis_and_design.md) |
| 10 | v2 implementation status, tests, outstanding issues | [docs/10_v2_implementation_status.md](docs/10_v2_implementation_status.md) |
| – | Assumptions register | [docs/00_assumptions_and_open_questions.md](docs/00_assumptions_and_open_questions.md) |
| – | References | [docs/references.md](docs/references.md) |

## Scoring in one paragraph
Evidence-tiered points in three capped domains: clinical (max 45), exposures within 21 days of onset (max 60) and geography (max 10). Total capped at 100. RED ≥ 70, AMBER ≥ 50 (configurable). **Minimum-category rules** mirror the WHO case-definition structure: compatible illness plus a high-risk exposure is always RED, and fever with unexplained bleeding is at least AMBER. "Unknown" is never treated as "No"; the tool reports completeness and whether missing items could raise the category. Community signals are shown **beside** the score, never added to it. Clinicians can always override.

## Quick start
```bash
xdg-open prototype/index.html
```
Opening `prototype/index.html` directly in any browser works offline, with synthetic demo data. The interface opens in French; switch to Kiswahili or English from the menu at the top (`DEFAULT_LANG` in `prototype/app.js`). Use the role menu to see each user's screens. Run the tests with:
```bash
node tests/scoring.test.js
```
```bash
node tests/voice.test.js
```
```bash
node tests/i18n.test.js
```
```bash
node tests/e2e_v2.test.js
```
```bash
node tests/e2e.test.js
```
After editing `config/scoring_rules.json`, regenerate the prototype's copy with:
```bash
node tools/build_rules.js
```

## Repository layout
```
config/scoring_rules.json   versioned rule set (single source of truth)
prototype/                  offline-first web app (EN/FR), no build step
tests/                      unit tests (scoring, voice) + end-to-end (Playwright)
tools/build_rules.js        copies the rule set into the prototype
tools/build_geodata.js      builds the map data from Natural Earth + GeoNames
tools/build_single_file.py  bundles the prototype into one web page
prototype/modules/          v2 modules (queue, map, contacts, lab, cases, rumours, facility, reports, analysis, admin)
prototype/vendor/           SheetJS + jsPDF for offline export
docs/                       deliverables 1–8, assumptions, references
```
