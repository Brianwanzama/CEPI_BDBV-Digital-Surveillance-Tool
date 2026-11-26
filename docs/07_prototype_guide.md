# 7. User interface prototype – guide

## 7.1 Run it
No installation and no internet needed. Open `prototype/index.html` in a browser (Chrome on Android or a desktop browser). To test offline caching and "install to home screen", serve the folder over HTTP:

```bash
cd prototype && python3 -m http.server 8080
```

Then open `http://localhost:8080` (or the computer's IP from a phone on the same network).

At first launch, **synthetic demonstration data** are generated: 5 health zones, 10 health areas, 30 villages, 160 assessments and 8 weeks of RECO reports, with three "hot" villages so the early-warning signals can be seen. All data stay in the browser (localStorage). *Accueil → Effacer* clears them.

## 7.2 What to try

| Role (top menu) | Walk-through |
|---|---|
| **Agent de santé (FOSA)** | *Triage* → fill name, age, sex; choose village *Village RWA-11* (a hot spot) → tick **Fièvre: Oui** and **Contact avec un cas: Oui** with a date 9 days before onset. Watch the live panel: score 45 but **ROUGE** because rule F1 applies. The purple community panel shows high concern but does not change the score. Save → recommended actions, SMS preview → *Gérer l'alerte* → tick actions → *Accuser réception*. Try a patient with only headache → **VERT** with reassessment triggers. Leave items as *Inconnu* to see the "category could rise" warning. Use *Réévaluer* to update. |
| **RECO** | Only 3 tabs (no clinical data). Switch the network toggle **off**, fill counts with +/−, add an event, send → "kept on the phone" message and the pending counter. Toggle the network back **on** → *Synchroniser*. *Mes rapports* shows verification status. |
| **Surveillance (ZS/DPS)** | *Vérification*: set event status; see linked facility assessments from the same village. *Évaluations*: names hidden. *Tableau de bord*: filters, map (click a village), trends with statistical signals. *Règles de score*: full matrix, sources; change thresholds → new local version, logged in *Journal d'audit*. |
| **Décideur** | Dashboard only (aggregated). Switch the language to English. |

## 7.3 Files
| File | Role |
|---|---|
| `index.html`, `styles.css` | Shell and responsive styles (light/dark) |
| `app.js` | Screens, workflows, storage, demo data |
| `scoring.js` | Scoring engine, community concern, early warning (pure functions, shared with tests) |
| `rules.js` | Generated from `config/scoring_rules.json` by `node tools/build_rules.js` |
| `geo.js` | Demonstration geography (replace with DHIS2 org units) |
| `i18n.js` | Interface strings (FR primary, EN; add other languages here) |
| `sw.js`, `manifest.webmanifest` | Offline cache and installable app (over HTTP) |

## 7.4 Tests
```bash
node tests/scoring.test.js
```
```bash
node tests/e2e.test.js
```
The first runs 12 unit tests of the scoring logic (floors, 21-day window, caps, Unknown handling, overrides, configurable thresholds, community separation, early warning). The second is an end-to-end run of all four roles in headless Chromium at phone width (requires Playwright).

## 7.5 Prototype limits (by design)
- There is no server: *Synchroniser* simulates upload, and SMS is shown as a preview only.
- Security features (accounts, encryption, PINs) are described in document 05 but not implemented. Role switching is open for demonstration.
- Geography, facilities, names and all numbers are fictitious.
- Scoring rules are provisional (document 03) and **must not be used for patient care**.
