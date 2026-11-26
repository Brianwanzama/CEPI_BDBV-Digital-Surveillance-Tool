# 10. Version 2: implementation status, tests and outstanding issues

Status categories, as requested in the brief:
- **Implemented**: working in the prototype with synthetic data and covered by automated tests. *Prototype scope*: the app runs in the browser with local storage and no server, so "implemented" means the workflow, rules and calculations work for one device. Multi-user operation needs the production back end.
- **Partial**: works, with a stated limitation.
- **Pending**: not built, or needs an external input (official data, approvals, infrastructure).

## 10.1 Status by requirement

| § | Requirement | Status | Notes |
|---|---|---|---|
| 2.1 A | Burial sites layer (location, date, deaths, linked case class, verification) | **Implemented** | From RECO burial events and rumours. Aggregated per administrative unit |
| 2.1 B | Infection locations by suspected / probable / confirmed | **Partial** | Uses the **residence** of the case. "Probable place of infection" is not captured separately (needs a case-investigation field) |
| 2.1 C | Probable cases (onset, report date, status) | **Implemented** | Classification set by surveillance; status from case management |
| 2.1 D | Areas reporting deaths; deaths by age group and occupation; trends | **Implemented** | Map layer plus the Analysis tab (age, sex, occupation, weekly trend) |
| 2.1 E | Facilities, holding/isolation units, community alerts, clusters, contacts, unusual increases | **Implemented** | Increases are a statistical signal (mean + 2 SD), labelled as not confirmed |
| 2.2 | Filters (province…village), layer toggles, period, time comparison, click details, download | **Implemented** | Week slider plus previous-period comparison. CSV/XLSX/PDF |
| 2.2 | Real DRC boundaries and locations; no invented coordinates | **Partial** | DRC national outline (Natural Earth) and reference points from GeoNames: 24/26 provincial capitals and 2/26 supplied zones (Aru, Aketi). **Province and health-zone boundaries are not included**: no open, versioned set was available in this build. Markers are aggregates at reference points, and everything else is listed as "not mapped". A test checks that every marker sits on a gazetteer point |
| 3.1 | Alert fields (ID, time, reporter, phone, location, type, description, source, supporting info) | **Implemented** | Reporter phone visible to verification roles only |
| 3.2 | 7-step workflow, 6 outcomes, officer, timestamps, findings, decision; GREEN included | **Implemented** | Every facility triage (all categories), RECO report and rumour enters the queue. Bulk actions; duplicate linking; escalation |
| 3.2 | Not shown as verified on dashboard until approved | **Implemented** | Dashboard and map default to approved-only, with a toggle to show pending (marked) |
| 3.3 | 4 TAT intervals, delayed alerts, configurable targets | **Implemented** | Medians, % within target, overdue flags. Targets set by the system administrator (provisional defaults 1 h / 4 h / 24 h / 12 h) |
| 4.1 | Contact registration; multiple index cases; contacts of several cases | **Implemented** | Duplicate detection offers to add the index case to the existing contact |
| 4.2 | 10 contact statuses, updatable | **Implemented** | |
| 4.3 | Follow-up encounters; dashboard (due, overdue, completed, symptomatic); protocol follow-up period | **Implemented** | Period configurable (default 21 days; to confirm). Symptomatic contact → referral → pre-filled triage |
| 5.1 | 11 laboratory categories | **Implemented** | "Awaiting collection" includes test requests without a sample |
| 5.2 | Sample fields, on-site and external testing, chain of custody, results by lab only, no confirmation by collection | **Implemented** | Role-enforced in the UI (production: server-side authorisation) |
| 5.3 | Links to assessments, contacts, holding units, referrals; where each case is | **Implemented** | "Where is each case" table in the Laboratory tab. Investigation records: see 2.1 B |
| 6 | Case-management dashboard (13 categories), responsible clinician, status updates, transfers; home care only if permitted | **Implemented** | 9 care statuses plus 4 lab-derived counts. Home-based care disabled until the administrator records a protocol reference |
| 7.1 | Public rumour form, anonymous, simple | **Implemented** | Attachments: **partial**: only file name, type and size are stored (no upload without a server) |
| 7.2 | Rumour verification queue (review, contact reporter, assign, findings, link, duplicate, escalate, approve); rumour dashboard | **Implemented** | Never classified as a case automatically |
| 8 | Facility-head dashboard with timeliness, bottlenecks, no names | **Implemented** | Scoped to the head's facility; zone officers can choose any facility |
| 9 | Standard age groups everywhere in aggregates | **Implemented** | `ageGroup()` used by dashboard, analysis, contacts, RECO death events and reports. Exact age kept only in the record |
| 10 | French + Congolese Kiswahili, complete workflows | **Partial** | French is the default. Kiswahili covers **all frontline workflows** (home, RECO, rumour, triage including voice, results and alerts, contacts, scoring labels: 503 strings plus 78 keys, checked by `tests/i18n.test.js`). Supervisory screens (queue, lab, map, reports, admin) fall back to French. **Native-speaker review of the Kiswahili is pending** |
| 11 | Supplied geography; flagged classification; configurable hierarchy | **Implemented** | List 1 → provinces, list 2 → health zones. Links proposed and editable, 4 unassigned, all flagged. Health areas, villages and facilities are demo placeholders until the DHIS2/SNIS master lists arrive |
| 12 | 23 supplied symptoms, DT/DRO/ICT unexpanded, unknown option, details, FR/SW, scoring review with correlation | **Implemented** | Rule set v0.2: group caps (GI 8, aches 3, neuro 3); DT/DRO/ICT/cough/rash/respiratory unscored; coma flags urgent review. Symptoms use Yes/No/Unknown buttons rather than plain checkboxes, to support Unknown |
| 13 | 10 report types; CSV/Excel/PDF; filters; access control | **Implemented** | Identifiers only for surveillance roles, on request, with a logged reason. Administrators get no line lists. Excel/PDF libraries are vendored for offline use |
| 14 | Occupation analysis (cases, deaths, age×sex, geography, trends) with no-causation caution | **Implemented** | Occupation added to RECO death/burial events |
| 15 | 9 roles (+ public), least privilege, audit | **Implemented (UI-level)** | Permission matrix drives tabs and actions. **Real authentication, server-side enforcement and an immutable audit log are pending** (production back end) |
| 16 | Multiple entry points | **Implemented** | Facility triage, RECO report, public rumour, contact referral, lab sample |

## 10.2 Tests performed

| Test | Command | Result |
|---|---|---|
| Scoring engine (floors, 21-day window, caps, group caps, unscored DT/DRO/ICT, severity, overrides, community separation, early warning) | `node tests/scoring.test.js` | 16/16 pass |
| Voice extraction (FR/EN/Kiswahili keywords, negation, dates, AI-reply validation) | `node tests/voice.test.js` | 9/9 pass |
| Kiswahili coverage (keys 100%, frontline strings 100%, report for other modules) | `node tests/i18n.test.js` | pass |
| v1 end-to-end (4 original roles, triage, alerts, RECO offline/sync, verification, dashboard, rules, voice AI path) | `node tests/e2e.test.js` | pass |
| v2 integration (geography lists; 23 symptoms; public rumour → full verification → approval; duplicate; overdue; dashboard approval gate; contact → follow-up → referral → pre-filled triage → classification; sample → custody → lab-only release → confirmation; care transfer and home-care gate; admin geography; facility dashboard without names; map markers on real points only, details, unmapped list, comparison, CSV; 10 report types with CSV/XLSX/PDF and identifier control; analysis; Kiswahili UI) | `node tests/e2e_v2.test.js` | 16/16 pass |
| No horizontal scroll at 375 px on every tab of every role | manual script (Playwright) | pass |

All tests use synthetic data generated in the browser (`prototype/modules/seed2.js`).

## 10.3 Outstanding issues and inputs needed

1. **Official boundaries and gazetteer** (MoH/DSNIS, possibly GRID3): province and health-zone shapefiles, health-area and village lists with codes and verified coordinates, and the master facility list. Until then the map aggregates at provincial capitals.
2. **Confirmation of the supplied geography**: whether list 1 is the provinces (as loaded), the province of each health zone (4 unassigned, 22 proposed), and DT/DRO/ICT definitions.
3. **Production back end**: server database, authentication, server-side permission checks, immutable audit, SMS gateway, attachment storage, multi-user synchronisation and conflict handling. DHIS2 Tracker remains the recommended base (document 05).
4. **Kiswahili**: native-speaker review, and translation of the supervisory screens if Kiswahili-speaking supervisors need them.
5. **Protocols to confirm**: follow-up period and visit frequency, TAT targets, home-based care policy, lab sample types and testing pathway, case definitions (probable/confirmed).
6. **Scoring v0.2** is still provisional. The symptom change must be included in the calibration in document 03 §3.10.
7. **Published web page**: Excel/PDF export loads the libraries from jsDelivr. This could not be tested from the build environment, but CSV works without them.
8. **Data in the prototype** stays in each browser. Data entered by different users on different devices is not shared.
