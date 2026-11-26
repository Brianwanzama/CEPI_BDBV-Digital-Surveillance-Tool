# 7. User interface prototype – guide

## 7.1 Run it
No installation and no internet needed. Open `prototype/index.html` in a browser (Chrome on Android or a desktop browser). To test offline caching and "install to home screen", serve the folder over HTTP:

```bash
cd prototype && python3 -m http.server 8080
```

Then open `http://localhost:8080` (or the computer's IP from a phone on the same network).

At first launch, **synthetic demonstration data** are generated: 5 health zones, 10 health areas, 30 villages, 160 assessments and 8 weeks of RECO reports, with three "hot" villages so the early-warning signals can be seen. All data stay in the browser (localStorage). *Home → Erase all local data* clears them.

### Signing in
The app opens on a sign-in screen. Only the public can use it without an account: *Make a report* opens the public event form. Everyone else signs in.

- **Without a server** (the file opened directly, or the published page) the screen lists one demonstration account per role. Click one to sign in as that role. These accounts have no password because there is nothing to protect in a browser holding only synthetic data.
- **With the pilot server** (document 11) the screen asks for a username and password, the demonstration accounts are not offered, and the role, facility and zone come from the account on the server.

*Sign out* (top right) returns to the sign-in screen. The demonstration names (N. Kahindo, J. Mapendo and so on) are fictitious and tagged [DEMO].

## 7.2 Interface language
The interface opens in **French** by default (version 2 brief). Use the language menu at the top or on the sign-in screen (Français / English / Kiswahili) to switch. Each user's choice is remembered on their device. To change the default for everyone, edit one line in `prototype/app.js`:

```js
var DEFAULT_LANG = 'en';
```

Text the system writes itself (alert SMS, queue descriptions, verification findings in the demo data, care notes) is stored as a code and rendered in the language being viewed, so an alert raised by a French-speaking nurse reads in English for an English-speaking reviewer. Free text typed by a user is shown as typed.

All dropdowns and checklists (occupation, comorbidities, rash type, event types, information sources, lab status, verification status) store **language-neutral codes**. Records entered in one language display correctly in the other, and the data exported to national systems do not depend on the interface language. Screen text is in `prototype/i18n.js`, and the code lists are at the top of `prototype/app.js`. Scoring-variable labels are in `config/scoring_rules.json` (`label_fr` / `label_en`). The rationale texts on the scoring-rules screen are in English only (technical documentation).

## 7.3 AI voice capture
On the **Triage** screen, open *AI voice capture (optional)*:
1. Tick the patient-consent box.
2. Press *Start dictation* and speak (French or English), or type or paste a note. *Insert example note* fills in a sample.
3. Press *Extract answers with AI* (shown when the page can use an AI service), or *Basic offline extraction*.
4. Check the review table (value + source phrase), untick anything wrong, then *Apply selected to the form*.
5. AI-filled fields are highlighted until you edit them. Before saving, tick "I have checked every AI-proposed answer…".

Where it works: in the published web page, dictation and AI extraction work in Chrome or Edge and in the desktop viewer app. Each viewer is asked once to allow the microphone and AI use, and AI use counts against the viewer's own account allowance. Opened from the repository, dictation uses the browser's speech recognition where available, and extraction is the offline keyword version. **Use role-played cases only.**

## 7.4 What to try

| Role (demo account) | Walk-through |
|---|---|
| **Health worker (facility)** | *Triage* → fill name, age, sex; choose village *Village RWA-11* (a hot spot) → tick **Fever: Yes** and **Contact with a case: Yes** with a date 9 days before onset. Watch the live panel: score 45 but **RED** because rule F1 applies. The purple community panel shows high concern but does not change the score. Save → recommended actions, SMS preview → *Manage alert* → tick actions → *Acknowledge*. Try a patient with only headache → **GREEN** with reassessment triggers. Leave items as *Unknown* to see the "category could rise" warning. Use *Reassess* to update. Try *AI voice capture* with the example note. |
| **RECO (community volunteer)** | Only 3 tabs (no clinical data). Switch the network toggle **off**, fill counts with +/−, add an event, send → "kept on the phone" message and the pending counter. Toggle the network back **on** → *Sync*. *My reports* shows verification status. |
| **Surveillance (HZ/DPS)** | *Verification*: set event status; see linked facility assessments from the same village. *Assessments*: names hidden. *Dashboard*: filters, map (click a village), trends with statistical signals. *Scoring rules*: full matrix, sources; change thresholds → new local version, logged in the *Audit log*. |
| **Policymaker (aggregate)** | Dashboard only (aggregated). Switch the language to French. |

## 7.4b Version 2 walk-through (sign in with one role at a time)
| Role | Try this |
|---|---|
| **Public (report an event)** | Fill in the simple form (Kiswahili available), tick "stay anonymous", send → you get a reference number |
| **Surveillance officer** | *Verification*: filter Source = Rumour, open the alert → acknowledge → assign → start → record the outcome → approve. Turnaround medians and overdue alerts at the top. *Contacts*: register a contact for a RED case, add a visit with 38.6 °C → "developed symptoms" → refer. *Map*: toggle layers A–E, click a marker, move the week slider, tick "compare", switch to zone level to see the "not mapped" list, download CSV/Excel/PDF. *Reports*: 10 report types × 3 formats; identifiers need a reason. *Analysis*: occupation, age × sex |
| **Health worker** | *Assessments*: the referred contact appears at the top → *Start triage* (pre-filled) → save. *Laboratory*: register the sample |
| **Laboratory personnel** | Open the sample → record custody steps → *Release result*. A positive result is what confirms the case |
| **Clinician** | *Case management*: move a case to a holding unit (transfer recorded); home-based care is disabled until the administrator enables it |
| **Facility head** | Facility dashboard: activity, timeliness, bottlenecks; no names |
| **HZ surveillance officer / Prov.-nat. administrator** | Same surveillance views; administrators see aggregates only |
| **System administrator** | *Configuration*: zone→province links (confirm / change), add units, TAT targets, follow-up period, home-care flag, affected zones, permission matrix |

## 7.5 Files
| File | Role |
|---|---|
| `index.html`, `styles.css` | Shell and responsive styles (light/dark) |
| `app.js` | Screens, workflows, storage, demo data |
| `geodata.js`, `geo.js` | Map data (generated, real sources) and supplied geography |
| `modules/*.js` | v2 modules |
| `i18n-sw.js` | Congolese Kiswahili |
| `vendor/` | SheetJS, jsPDF (offline export) |
| `voice.js` | Voice-capture extraction: AI prompt and validation, offline keyword extractor |
| `scoring.js` | Scoring engine, community concern, early warning (pure functions, shared with tests) |
| `rules.js` | Generated from `config/scoring_rules.json` by `node tools/build_rules.js` |
| `geo.js` | Demonstration geography (replace with DHIS2 org units) |
| `i18n.js` | Interface strings (EN default, FR; add other languages here) |
| `sw.js`, `manifest.webmanifest` | Offline cache and installable app (over HTTP) |

## 7.6 Tests
```bash
node tests/scoring.test.js
```
```bash
node tests/voice.test.js
```
```bash
node tests/e2e.test.js
```
The first runs 12 unit tests of the scoring logic (floors, 21-day window, caps, Unknown handling, overrides, configurable thresholds, community separation, early warning). The second runs 8 tests of the voice extraction: negation, relative dates, no default "No", contradictions, and validation of AI replies. The third is an end-to-end run of all four roles in headless Chromium at phone width (requires Playwright). It includes both voice paths, the AI one with a simulated platform.

## 7.7 Prototype limits (by design)
- There is no server: *Sync* simulates upload, and SMS is shown as a preview only.
- Security features (accounts, encryption, PINs) are described in document 05 but not implemented. Role switching is open for demonstration.
- Geography, facilities, names and all numbers are fictitious.
- Scoring rules are provisional (document 03) and **must not be used for patient care**.
