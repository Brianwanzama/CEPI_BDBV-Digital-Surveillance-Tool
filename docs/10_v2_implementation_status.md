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
| 2.2 | Real DRC boundaries and locations; no invented coordinates | **Implemented** | Province (26) and health-zone (519) boundaries from OCHA's COD-AB dataset on the Humanitarian Data Exchange (`data/boundaries/`, valid from 2019-09-11), cited under the maps. Symbols are totals per unit, drawn at the centre of the official boundary. Health areas and villages still have no coordinates |
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
| 11 | Supplied geography; flagged classification; configurable hierarchy | **Implemented** | List 1 → provinces, list 2 → health zones. Zone → province links taken from the supplied boundary file, editable and flagged until confirmed. Health areas, villages and facilities are demo placeholders until the DHIS2/SNIS master lists arrive |
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
| v2 integration (sign-in screen and public access; geography lists; 23 symptoms; public rumour → full verification → approval; duplicate; overdue; dashboard approval gate; contact → follow-up → referral → pre-filled triage → classification; sample → custody → lab-only release → confirmation; care transfer and home-care gate; admin geography; facility dashboard without names; map markers on real points only, details, unmapped list, comparison, CSV; 10 report types with CSV/XLSX/PDF and identifier control; analysis; Kiswahili UI; alerts and queue text in the viewer's language; map with official boundaries, shading, hover card, search, zoom, profile, playback; dashboard map; historical data import from CSV and Excel) | `node tests/e2e_v2.test.js` | 19/19 pass |
| Boundary import (shapefile, GeoJSON and GeoPackage, name matching, aliases, unmatched names reported, zone → province comparison, UTM conversion) | `node tests/boundaries.test.js` | pass |
| No horizontal scroll at 375 px on every tab of every role | manual script (Playwright) | pass |

All tests use synthetic data generated in the browser (`prototype/modules/seed2.js`).

## 10.2b Update: backend (v0.3)
A backend now exists (document 11). Items marked "prototype scope" above now work across users and devices when signed in to the server: role-based access, facility and zone scoping, and redaction are **enforced on the server**; scores are recomputed by the server; the audit log is append-only in the database; record history is kept; and offline sync uses version checks. Still pending: user administration, 2FA, SMS, attachments storage, backups/monitoring, DHIS2 interfaces, and approval for real data.

## 10.2c Update: sign-in, language, appearance and map (v0.4 and v0.5)

| Item | Status | Notes |
|---|---|---|
| Sign-in for every role except the public | **Implemented** | The app opens on a sign-in screen. With the server: username and password checked by the API. Without a server: one demonstration account per role, no password, clearly labelled as demonstration. The role menu has been removed, so a user can no longer switch role by hand |
| System text in the viewer's language | **Implemented** | Alert SMS, queue descriptions and other system-written text are stored as codes and rendered in French, English or Kiswahili at display time. Records created before this change keep their stored French text |
| Official boundaries on the map | **Implemented** | GeoPackage supplied by the project imported (document 11 §11.9): 26 provinces, 519 health zones, all 26 supplied zones matched |
| Visual identity | **Implemented** | Own typefaces (Atkinson Hyperlegible for legibility on low-end phones, Barlow Semi Condensed for headings and figures, IBM Plex Mono for record IDs), all served from the app so they work offline. Colours of version 1 (navy, slate) with navy for emphasis (active tab, focus, map selection). Disclaimers and principles (top banner, Home → Principles, demonstration notes, statistical-signal, analysis, scoring-rule and map caveats, footer) share one style: pale blue background with navy text and rule. Warnings that need action keep the amber style. IDΣMU emblem in the header and the full logo on the sign-in screen. Demo users have fictitious person names tagged [DEMO] |
| English as default language | **Implemented** | French and Kiswahili selectable; each user's choice is remembered |
| Account requests and passwords | **Implemented** | Sign-in screen with *Sign in* / *Request an account* tabs and *Forgot password?*. Requests stay pending until the system administrator approves them and assigns role and scope; forgotten passwords are handled with a one-time temporary password that must be changed at the next sign-in; users can change their password; accounts can be disabled. Server-enforced and audited. Without a server (demonstration page) the forms explain that nothing is sent |
| AI voice capture on the deployed system | **Partial** | Dictation (browser speech recognition in Chrome or Edge) and the offline keyword extraction work on the Render deployment. The language-model extraction worked only inside the claude.ai page; on the deployed system it needs a server-side AI service, which has not been added (decision and data-protection review needed) |
| Risk labels | **Implemented** | Categories shown as High / Medium / Low risk in English, French and Kiswahili (codes RED / AMBER / GREEN unchanged in the data); "suspicion" removed from the interface; alert SMS reads "BDBV HIGH-RISK ALERT" |
| Risk level on the map | **Implemented** | Default map view colours each province or health zone by the highest triage risk in the period, in the same red / amber / green as the labels, with counts of high / medium / low assessments in the hover card, profile and table |
| Visual style (v0.6) | **Implemented** | Rounded cards with a light shadow, pill-shaped risk labels with a coloured dot, rounded figures, buttons and inputs; disclaimers on pale blue with navy text; warnings on pale amber. Every tab of every role checked on desktop and at phone width (no horizontal scrolling) |
| Historical data import | **Implemented** | CSV or Excel; weekly counts or case line lists (reduced to weekly counts on import, names never read or stored); headings recognised in English or French; dates as any day, DD/MM/YYYY or ISO week; places matched to the supplied lists and the 519 zones; rejected rows listed with the reason; preview before import; batches labelled with their source, withdrawable, audited; shown on the map, dashboard map and a weekly trend chart, always apart from data recorded in the system; synchronised and validated by the server |
| Dashboard map | **Implemented** | Health zones shaded by cases within the dashboard's filters and period, province borders and names, and a second panel zoomed to the affected area |
| Interactive map | **Implemented** | Units shaded by indicator (cases, deaths, community alerts, contacts) with a graded legend; hover card per unit; click for a profile with a 12-week trend and change against the previous period; zoom and pan by wheel, drag, pinch, buttons or keys; full screen; search by province or zone; weekly playback; ranked table of units; symbols for layers A to E on top |

## 10.2d Update: live data flow, empty deployment and laboratory (v0.7)

| Item | Status | Notes |
|---|---|---|
| Information reaching the next person | **Fixed** | Before, a saved record waited on the device until someone pressed Sync or the two-minute timer ran, and the receiver also had to sync, so "sent" could mean nothing had reached anyone yet. Now each save is sent to the server within about a second, and every signed-in screen checks for new information every 30 seconds (every 2 minutes when the tab is hidden, and at once when it comes back or the network returns). New items appear without reloading; a short notice says what arrived (for example "New: 1 high-risk alert"). A form being filled in is never redrawn. A "Live" pill in the header shows the time of the last exchange and how many items are waiting to be sent. If the server refuses a record, the reason is shown |
| Deployment starts empty | **Implemented** | The server adds synthetic records only when `SEED_DEMO_DATA` is `true`. Otherwise it removes any records marked as demonstration at start-up (records entered by people stay), and the deployed app removes demonstration records kept on the device. Synthetic data remain in the claude.ai demonstration copy |
| Laboratory requests and approval | **Implemented** | A clinician or health worker requests a test for a case (or ticks "sample requested" on an alert); the request reaches the laboratory with the case ID. The laboratory assigns its own lab ID, records the sample type, collection date and time and collector, and whether the sample is tested on site or sent to a referral laboratory chosen from a list (set by the system administrator). The signed-in laboratory account is recorded as the tester when the result is entered. A new role, **laboratory manager**, approves and releases the result; only then is the case confirmed. The server enforces this (only laboratory staff may enter results, only the manager may release them). Tapping a sample shows all its details and the chain of custody, with an individual PDF report |
| Motion | **Implemented** | Faint drifting virus particles behind the sign-in screen only; pulsing red rings on the map where high-risk patients were assessed in the last 48 hours of the period. Both stop for users who ask their device for reduced motion |

## 10.2e Update: phase 1 of the next-phase plan (stability on phones, AI support)

The technical assessment of 28 November 2026 found the causes of three problems reported from phones. Phase 1 corrects them and adds the first AI support, switched off until approved.

| Item | Status | Notes |
|---|---|---|
| Signed out after a refresh; no updates afterwards | **Fixed** | A start-up error (the session was restored before the sign-in code had loaded) showed the sign-in screen and stopped the 30-second updates on that page, even after signing in again. The session and the screen the person was on now survive a refresh, and updates continue. A phone that reloads a tab by itself no longer loses the session |
| Form wiped while typing on a phone | **Fixed** | The 30-second update no longer redraws a screen where something has been typed and not saved; the header shows "new information: show" instead. Every form and record panel (triage, RECO report, public report, verification, laboratory, contacts, case management) is saved on the device as a draft as the person types, and restored after a reload, a crash or a redraw, until it is saved. Drafts are kept 7 days and removed at sign-out |
| Unsent records lost when a session ends | **Fixed** | An expired session now locks the screen and asks for the password instead of signing out and clearing the device. Signing out keeps unsent records on the device for their author; they are sent when that person signs in again, never under another account |
| Inactivity lock | **Implemented** | After 30 minutes without use (configurable from 5 to 240 minutes) the screen is hidden and locked; it opens with the account password, also offline (checked against a salted hash kept on the device, never the password). "Sign in with another account" keeps the first person's unsent work |
| Assignment to real officers | **Fixed** | "Assign to" lists the active surveillance accounts covering the alert's health zone (name, role, zone), with optional instructions; the account, role and instructions are recorded. The fixed list of demonstration names is used only in the demonstration copy |
| Device storage full | **Fixed** | A failed save used to be silent; the person is now told to synchronise |
| Error reporting | **Implemented** | JavaScript errors on phones and computers are sent to the server (no form content) and appear in the audit log as "client_error" for the system administrator |
| Temperature field | **Fixed** | Starts from 37.0 °C when the arrows or the wheel are used on an empty field, instead of 0.1 |
| Review priority by rules | **Implemented** | Every alert in the verification queue shows a priority (high, medium, low) with its reasons: reported deaths, several people ill, high-risk event types, warning words (death, bleeding, health worker) and compatible signs. Works offline. The queue can be ordered by priority |
| AI suggestions | **Implemented, switched off** | For community reports and rumours the server can suggest a summary, places, dates and events, compatible signs, possible duplicates among the zone's reports of the last 14 days, questions to ask the reporter and a priority with reasons. Shown in a separate box marked as a suggestion; it never changes the alert, confirms or rejects anything. Officers mark each suggestion useful or not right. Names and phone numbers of reporters are never sent. Runs only when the server has an AI key and the system administrator switches it on in Configuration, which should follow the Ministry of Health's approval. Tested with a mock provider; not yet tested against the live AI service |


1. **Gazetteer below health-zone level** (MoH/DSNIS, possibly GRID3): health-area and village lists with codes and verified coordinates, and the master facility list. Province and health-zone boundaries are now in place (document 11 §11.9).
2. **Confirmation of the supplied geography**: whether list 1 is the provinces (as loaded), the zone → province links now taken from the boundary file, the licence terms of the HDX file, and DT/DRO/ICT definitions.
3. **Production back end**: server database, authentication, server-side permission checks, immutable audit, SMS gateway, attachment storage, multi-user synchronisation and conflict handling. DHIS2 Tracker remains the recommended base (document 05).
4. **Kiswahili**: native-speaker review, and translation of the supervisory screens if Kiswahili-speaking supervisors need them.
5. **Protocols to confirm**: follow-up period and visit frequency, TAT targets, home-based care policy, lab sample types and testing pathway, case definitions (probable/confirmed).
6. **Scoring v0.2** is still provisional. The symptom change must be included in the calibration in document 03 §3.10.
7. **Published web page**: Excel/PDF export loads the libraries from jsDelivr. This could not be tested from the build environment, but CSV works without them.
8. **Data in the prototype** stays in each browser. Data entered by different users on different devices is not shared.
