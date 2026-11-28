# 11. Backend, hosting and GitHub workflow

## 11.1 What runs where

GitHub holds the code, runs the tests and builds the container image. It **cannot run the server or the database**: GitHub Pages serves static files only. The backend therefore runs as a Docker container on any host (a cloud service for the pilot, a Ministry of Health server later), and GitHub deploys to it.

```mermaid
flowchart LR
  DEV[Development changes] -->|git push| GH[GitHub repository]
  GH --> CI[GitHub Actions CI<br/>unit · API · browser tests]
  CI --> IMG[Container image<br/>ghcr.io/&lt;owner&gt;/&lt;repo&gt;]
  IMG --> HOST[Any Docker host<br/>Render · Railway · VPS · MoH server]
  HOST --- DB[(PostgreSQL)]
  GH -. optional .-> PAGES[GitHub Pages<br/>web app only]
  PAGES -->|HTTPS API calls| HOST
  USERS[Health workers · RECOs · surveillance] --> HOST
```

The API container also serves the web app, so **one deployment is enough**. GitHub Pages is only needed if you want the app on a `github.io` address.

## 11.2 Data rule for this version: synthetic data only

- The server runs only in `DATA_MODE=synthetic`. It refuses to start in any other mode, labels every response (`X-BDBV-Data-Mode: synthetic`), stores `synthetic: true` on every record, and the app shows a "PILOT SERVER - synthetic data only" banner.
- **Do not enter real patient, contact or reporter data.** Real data need, at minimum: MoH approval and hosting approved by the MoH/DSNIS, a data-protection impact assessment, data-sharing and processing agreements, encrypted backups and a restore test, server hardening and a penetration test, real user management (provisioning, password policy, 2FA), and a legal basis for retention (see §11.7).

## 11.3 Components (`backend/`)

| Part | What it does |
|---|---|
| `src/app.js` | REST API `/api/v1`: login, sync, records, identifiers, public rumours, config, audit, history. Security headers (CSP, nosniff, frame-deny, HSTS behind HTTPS), CORS limited to `ALLOWED_ORIGINS`, request size limit, rate limits on login and public reports |
| `src/permissions.js` | Server-side permission matrix: who reads which records (facility, zone, ownership scoping in SQL), who writes what, protected transitions (lab results, confirmation, verification stages, referral fields), and redaction of names and phone numbers by role |
| `src/auth.js` | bcrypt password hashes, signed tokens (12 h), account re-checked on every request (deactivation takes effect at once) |
| `src/shared.js` | Reuses the app's scoring engine and rule set: **the server recomputes every triage score** and ignores the client's value. Also runs the app's synthetic-data generator headless |
| `src/schema.sql` | PostgreSQL: `records` (JSON documents + scope columns + version), `record_history` (every previous version), `audit_log` (**append-only, enforced by database triggers**), `users`, `config` |
| `src/seed.js` | Demo accounts (one per role) and synthetic data |

**Sync model (offline-first).** The app keeps working offline. When connected it sends unsynchronised records and pulls changes since its last sync. Every record carries a version number: if someone else changed a record first, the server refuses the stale copy and the app takes the server's version (reported to the user). Records refused for permission reasons are flagged and not retried.

**Personal data.** Only clinical staff of the facility receive patient names. Surveillance roles receive pseudonymised records and can reveal names only through `/api/v1/identifiers`, with a written reason logged on the server; revealed names are used for the export and not stored on the device. Anonymous public reports keep no phone number.

### Demo accounts

| Username | Role | Scope |
|---|---|---|
| `reco.aru` | RECO | own reports |
| `nurse.aru` | Health worker | CS Aru 1 (demo) |
| `clinician.aru` | Clinician | CS Aru 1 (demo) |
| `surveillance` | Surveillance officer | all, pseudonymised |
| `lab` | Laboratory | samples, enters results; cases pseudonymised |
| `labmgr` | Laboratory manager | approves and releases results; cases pseudonymised |
| `head.aru` | Facility head | CS Aru 1, no names |
| `zone.aru` | HZ surveillance officer | health zone Aru |
| `admin.ph` | Prov./national administrator | aggregate views |
| `sysadmin` | System administrator | configuration, audit |

Passwords: the value of `SEED_USER_PASSWORD`, or, if it is empty, a random password per account printed **once** in the server log at first start.

## 11.4 Run it on your computer

Requires Docker Desktop (or Docker Engine with Compose).

```bash
cp .env.example .env
```

Edit `.env`: set `POSTGRES_PASSWORD`, `JWT_SECRET` (32+ characters, e.g. from `openssl rand -base64 48`) and `SEED_USER_PASSWORD`. Then:

```bash
docker compose up -d
```

Open http://localhost:8080. The sign-in screen asks for a username and password: use a demo account from §11.3 with the `SEED_USER_PASSWORD` you set. The public report form is available from the same screen without an account. Stop with:

```bash
docker compose down
```

## 11.5 Host it (choose one)

**A. Render.com (blueprint in the repository, quickest).**
1. Create a Render account and connect GitHub.
2. *New > Blueprint*, then select this repository. `render.yaml` creates the API service and a PostgreSQL database.
3. When asked, set `SEED_USER_PASSWORD`. Leave `ALLOWED_ORIGINS` empty unless you use GitHub Pages.
4. Open the service URL. Each push to `main` redeploys.

The free tier sleeps when idle, and Render's free databases expire after a period; check Render's current terms.

**B. Any server with Docker (VPS, Ministry server, Railway, Fly.io…).**
- Run `docker compose up -d` on the server with a `.env` (as in §11.4), behind HTTPS (e.g. Caddy or nginx with a certificate) and `TRUST_PROXY=true`.
- Or run the image built by CI, `ghcr.io/<owner>/<repo>:latest`, with a managed PostgreSQL: set `DATABASE_URL`, `JWT_SECRET`, `SEED_DEMO`, `SEED_USER_PASSWORD`.

**C. Optional: web app on GitHub Pages.**
1. Settings > Pages > Source: *GitHub Actions*.
2. Settings > Secrets and variables > Actions > *Variables*: set `BDBV_API_URL` to your API address (from A or B).
3. On the API, set `ALLOWED_ORIGINS=https://<owner>.github.io`.
4. Push to `main`, or run the *Publish app to GitHub Pages* workflow by hand.

### Environment variables

| Variable | Required | Meaning |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string (add `?sslmode=require` for managed databases that need TLS) |
| `JWT_SECRET` | yes | Token signing secret, 32+ characters. Keep it secret; changing it signs everyone out |
| `DATA_MODE` | no | Must be `synthetic` (the only supported value) |
| `SEED_DEMO` | no | `true`: create the demo accounts on first start |
| `SEED_DEMO_DATA` | no | `true`: add synthetic records. Anything else (the Render setting is `false`): the system starts empty, and records marked as demonstration are removed at each start. Records entered by people are never removed |
| `SEED_USER_PASSWORD` | no | Password for all demo accounts (otherwise random, printed once) |
| `ALLOWED_ORIGINS` | no | Comma-separated origins allowed to call the API from a browser (e.g. GitHub Pages) |
| `TRUST_PROXY` | no | `true` behind a reverse proxy / platform load balancer |
| `PORT` | no | Default 8080 |
| `TOKEN_TTL` | no | Token lifetime, default `12h` |
| `ANTHROPIC_API_KEY` | no | Key for the AI suggestions (Anthropic API). Without it AI is unavailable. Even with it, AI stays off until the system administrator switches it on in Configuration. Add it as a secret in the host's settings; never commit it |
| `AI_MODEL` | no | Model for the AI suggestions, default `claude-opus-5-5` |
| `AI_PROVIDER` | no | `mock` only for tests (predictable suggestions without calling any service) |
| `RESET_DEMO_PASSWORDS` | no | `true` for one start: sets every demo account's password to `SEED_USER_PASSWORD` (8+ characters), logged in the audit log. Set it back to `false` afterwards |

### If the site does not open or sign-in fails (Render)

- **The page takes a long time or shows "waking up".** On the free plan the service sleeps after about 15 minutes without visits. The first visit after that wakes it, which can take about a minute. Wait and reload. A paid instance does not sleep.
- **"Wrong username or password".** Demo accounts receive their password only on the very first start. If `SEED_USER_PASSWORD` was empty then, each account got a random password that was printed once in that first deploy's log (Render > the service > *Logs*, search for "Demo accounts created"). Changing `SEED_USER_PASSWORD` later does not change existing accounts. To set them: in Render > *Environment*, give `SEED_USER_PASSWORD` a value of 8+ characters and set `RESET_DEMO_PASSWORDS` to `true`, save (Render redeploys), sign in, then set `RESET_DEMO_PASSWORDS` back to `false`.
- **Usernames** are listed in §11.3 (for example `surveillance`, `nurse.aru`, `admin.ph`).
- **Check the server itself:** `https://<your-service>.onrender.com/api/v1/health` should return `{"status":"ok","data_mode":"synthetic",...}`.

## 11.5b Accounts: sign in, request an account, forgotten password

The sign-in screen has two tabs, **Sign in** and **Request an account**, and a **Forgot password?** link.

- **Request an account.** The person gives their name, phone or e-mail, the role they need, their workplace, a username and a password (10+ characters with letters and digits). The account is created as *pending* and cannot be used. The system administrator sees the request under *Configuration > User accounts*, checks who the person is, chooses the role and the facility or health zone, and approves or rejects it. Self-registration without approval is deliberately not offered: accounts give access to health data, so a person must check each one. Requests are rate-limited.
- **Forgot password.** The person gives their username and a phone or e-mail. The answer is the same whether or not the account exists, so the form cannot be used to find usernames. The request appears under *User accounts*; the administrator confirms the person's identity (for example by phone), clicks *Create temporary password* and passes it on in person or by phone. It is shown once. At the next sign-in the person must choose a new password before anything else works (the server refuses every other request until then).
- **Change password.** Any signed-in user can change their password from the Home screen.
- **Disable an account.** The administrator can disable and re-enable accounts; a disabled account loses access at once.

Every step is in the audit log. There is no e-mail or SMS service yet, so reset links cannot be sent automatically; adding one later (with a gateway contract) would replace the manual temporary password.

## 11.5c Live data flow

Each save is sent to the server within about a second, and every signed-in screen asks the server for new information every 30 seconds (every 2 minutes in a hidden tab, and at once when the tab is shown again or the connection returns). Nobody needs to press Sync or reload. The header shows a "Live" pill with the time of the last exchange; a notice tells each person what has arrived for them. Offline, records stay on the device and go at the next connection, as before.

`tests/e2e_flow.test.js` checks this on a running server with accounts created through *Request an account* and approved by the administrator: seven people keep their screens open and the test waits for each item to arrive (nurse → clinician's alerts and the surveillance and zone queues; clinician's test request → laboratory; laboratory result → laboratory manager; approval → clinician, case confirmed; RECO report → surveillance; acknowledgement → zone officer).

## 11.5d Sessions, drafts, lock and AI support (phase 1)

- **Refresh.** The session (a token that expires after `TOKEN_TTL`, 12 hours by default) and the screen the person was on survive a refresh or a reload by the phone.
- **Drafts.** What is typed in a form or a record panel is kept on the device as a draft (browser storage, per account, 7 days), restored after a reload or a redraw, and removed when the form is saved or the person signs out. Passwords are never kept.
- **Lock.** After 30 minutes without use (Configuration > AI support and security, 5 to 240 minutes) the screen locks. The account password opens it: with the server when online (this also renews an expired session), otherwise against a salted PBKDF2 hash kept on the device.
- **Expired session.** The screen locks; nothing is deleted. Unsent records are sent once the password is entered.
- **Sign-out with unsent records.** They stay on the device for that account and are sent at its next sign-in.
- **Errors.** `POST /api/v1/client-errors` (rate-limited, `CLIENT_ERROR_RATE_LIMIT` per hour) records errors from phones in the audit log as `client_error`.
- **AI suggestions.** `GET /api/v1/ai/status`, `POST /api/v1/ai/analyse` and `POST /api/v1/ai/feedback` (surveillance roles); new community reports and rumours are analysed in the background when AI is on. Suggestions are stored in the `ai_suggestions` table and sent with the sync to surveillance staff of the zone. To switch on: add `ANTHROPIC_API_KEY` to the server's environment (Render > the service > Environment), redeploy, then tick "Switch on AI suggestions" in Configuration. To switch off: untick it; removing the key disables it completely.

## 11.6 GitHub Actions

| Workflow | When | What |
|---|---|---|
| `CI` (`.github/workflows/ci.yml`) | every push and pull request | Unit tests; backend API tests against a PostgreSQL service; browser tests of the offline app; starts the API with synthetic data and runs browser tests against it; builds the Docker image and, on `main`, publishes it to `ghcr.io` |
| `Publish app to GitHub Pages` (`pages.yml`) | push to `main` (app files) or manual | Publishes `prototype/` with `config.js` pointing at `BDBV_API_URL` |

The development branch is `claude/great-shannon-chjevm`. Merging it into `main` (through a pull request) triggers the image publication and Pages deployment.

## 11.7 Tests (run locally in this session)

| Test | Result |
|---|---|
| `backend`: `npm test` against PostgreSQL 16 (18 tests: health/data mode, authentication, scoping, redaction, server rescoring, write permissions, results entered by the laboratory and released only by the laboratory manager, verification rights, version conflicts and history, incremental sync, public rumours and rate limit, identifier reveal with logged reason, configuration rights, append-only audit, input validation, historical data: counts only, import rights, batches locked, demo password reset, account requests, approval, rejection, forgotten password, forced password change) | 18/18 pass |
| `tests/e2e_server.test.js` against the Docker Compose stack: app served by API, password sign-in shown and no demo accounts offered; public rumour to server without an account; nurse signs in (role from account, facility scope, names), triage synced and rescored to RED; surveillance without names; rumour acknowledged and synced; identifier export fetched from server with reason audited; Excel/PDF under the CSP; account requested on the sign-in screen and approved by the administrator; forgotten password handled with a temporary password and a forced change; a deployment never falls back to demonstration accounts (retries the server instead); no CSP or JS errors | 10/10 pass |
| `backend`: new tests for the officer list, error reporting and AI suggestions (off until switched on, surveillance roles only, nothing identifying the reporter sent, duplicates, feedback, background analysis) | 21/21 pass |
| `tests/e2e_phase1.test.js` on an emulated Pixel 7: refresh keeps session, screen and typed text, and updates continue; text in an open alert survives the 30-second update and a reload; rule priority and AI suggestion (mock) shown apart; assignment to accounts with instructions; lock, wrong password, unlock; expired session resumes; records saved offline kept after sign-out and sent at the next sign-in; a phone error reaches the audit log | 8/8 pass |
| `tests/e2e_flow.test.js` against an empty server (`SEED_DEMO_DATA=false`): seven new accounts, information passed from person to person without Sync or reload (see §11.5c) | 10/10 pass |
| Start-up with `SEED_DEMO_DATA=false` after a start with synthetic data: 1,267 demonstration records removed, a record entered by hand kept | pass |
| Existing suites (scoring, voice, i18n, offline e2e v1 and v2, boundary import) | pass |
| Docker image build (dependencies verified at build time) and `docker compose up` | pass |

The GitHub Actions workflows were written and checked for valid YAML, but have **not yet run on GitHub**: they run at the next push. The Render blueprint has not been deployed from here.

## 11.8 Not done yet (needed before real data or scale)

- Two-factor authentication, automatic password reset by SMS or e-mail (needs a gateway), password expiry. Account requests, approval and temporary passwords are in place (§11.5b).
- Server-side SMS alerts and escalation (needs an SMS gateway contract), and attachment storage for rumour photos.
- Backups and restore procedure, monitoring and alerting, log retention policy.
- Field-level merge of concurrent edits. Currently the first writer wins and the second gets the server copy.
- DHIS2 / IDSR / Go.Data / laboratory system interfaces.
- Penetration test, data-protection impact assessment, MoH approval: see §11.2.

## 11.9 Importing official boundaries (shapefile)

The map can draw official province and health-zone boundaries. None are included yet: they have to come from the Ministry of Health (DSNIS) or a source it accepts, such as GRID3. Until a file is imported, markers sit at provincial capitals and GeoNames towns, as described in document 10.

**What to send.** One layer for health zones and, if available, one for provinces. Any of these works:
- an ESRI shapefile, meaning the `.shp` together with its `.shx`, `.dbf` and `.prj` (and `.cpg` if there is one);
- the same files in one `.zip`;
- GeoJSON;
- a GeoPackage (`.gpkg`). Reading it needs Node.js 22.5 or later. One table can hold several levels; choose the rows with `--zone-filter` and `--province-filter`.

Projected files (UTM, for example) are converted to latitude/longitude using the `.prj`. Put the files in `data/boundaries/` on the development branch (GitHub: *Add file → Upload files*), or attach them in the chat, and say where the data come from and which version they are.

**Run the import.**

```bash
cd tools && npm install && cd ..
```

```bash
node tools/import_boundaries.js --zones data/boundaries/zones.zip --provinces data/boundaries/provinces.zip
```

The tool guesses which attribute holds the name (`NOM_ZS`, `ADM2_FR`, `Nom`, …). If it guesses wrong, name it with `--zone-field`, `--province-field` or `--zone-province-field`. `--tolerance` sets how much the outlines are simplified (default 0.005 degrees, about 500 m). Provinces and zones are simplified together so shared borders stay identical, and the result is stored as a compact topology that the app expands when it loads. `--alias "Name in file=Name in list"` accepts a spelling variant on purpose; every alias is listed in the report.

**What it writes.**

| File | Content |
|---|---|
| `prototype/boundaries.js` | Simplified outlines and the centre of each unit, loaded by the map |
| `docs/boundaries_import_report.md` | Which names matched the supplied province and health-zone lists, which did not, and how each zone's province in the file compares with the link proposed in the app |
| `config/zone_province_from_boundaries.json` | The zone → province links found in the file |

Names are matched after removing accents, case and prefixes such as "ZS" or "Zone de santé". A name that does not match is listed in the report and drawn as context with no data. It is never attached to the nearest list entry. The zone → province links in the file are not applied automatically: the system administrator reviews the report and confirms each link under *Configuration → Geographical hierarchy* (system administrator account), which is audited.

**What changes on the map.** Units are drawn with their outlines, units with events in the period are shaded, and each marker moves to the centre of its official boundary. Marker details say "centre of the official boundary" so the source of the position stays visible. Markers are still totals per administrative unit, never the position of a household, grave or facility.

The tool is tested on synthetic squares as a shapefile, GeoJSON, a UTM shapefile and a GeoPackage (`tests/boundaries.test.js`).

### Import done on 26 November 2026

The project supplied `DRC_admin_boundaries_ADM1_ADM2_ADM3.gpkg` (now in `data/boundaries/`), downloaded from the Humanitarian Data Exchange.

**Citation.** OCHA, *Democratic Republic of the Congo - Subnational Administrative Boundaries* (COD-AB), Humanitarian Data Exchange, https://data.humdata.org/dataset/cod-ab-cod. Source credited on HDX: Référentiel Géographique Commun (RGC). Version valid from 11 September 2019. The citation is stored with the boundaries (`--citation`) and shown under the map and the dashboard map. The licence shown on the HDX page should be checked before the file is redistributed outside the project.

 It holds one table with 26 provinces (ADM1), 164 territories (ADM2) and 519 health zones (ADM3), with P-codes and a validity date of 11 September 2019. The command used was:

```bash
node tools/import_boundaries.js --zones data/boundaries/DRC_admin_boundaries_ADM1_ADM2_ADM3.gpkg --zone-filter ADM_LEVEL=ADM3 --zone-field ADM_NAME --zone-province-field ADM1_NAME --provinces data/boundaries/DRC_admin_boundaries_ADM1_ADM2_ADM3.gpkg --province-filter ADM_LEVEL=ADM1 --province-field ADM_NAME --alias "Banjow Moke=Banzow Moke" --citation "OCHA, Democratic Republic of the Congo - Subnational Administrative Boundaries (COD-AB), Humanitarian Data Exchange, https://data.humdata.org/dataset/cod-ab-cod; source credited on HDX: Référentiel Géographique Commun (RGC); version valid from 2019-09-11"
```

Results (full detail in `docs/boundaries_import_report.md`):
- all 26 provinces and all 26 supplied health zones matched. "Banzow Moke" is spelt "Banjow Moke" in the file (Maï-Ndombe, P-code CD330201) and was matched through the alias above. The project confirmed on 26 November 2026 that they are the same zone; the map shows "also written Banjow Moke";
- the other 493 health zones are drawn for context and carry no data in this pilot;
- the file gives a province for every supplied zone. It agrees with the 22 links proposed earlier and fills the 4 that were unassigned: Baka → Haut-Lomami, Banga Lubaka → Kasaï, Bangabola → Sud-Ubangi, Banzow Moke → Mai-Ndombe. The app now uses these links, marked "from the official boundary file (to confirm)";
- `prototype/boundaries.js` is 379 KB.



## 11.10 Historical data on the server

Imported historical data (document 07, *Historical data* tab) are stored as a `history` collection: one record per uploaded batch, holding weekly counts per province or health zone and nothing else. The server checks every batch: only the expected fields are accepted, each row must be a date, place codes and six non-negative whole numbers, so names or other personal fields cannot be stored there. Surveillance officers, health-zone officers and public-health administrators can import and read batches (all zones, since the data are aggregated). Clinical and community roles do not receive them. A batch cannot be edited after upload; it can only be withdrawn, and both actions are kept in the record history and the audit log.

The pilot server still runs with synthetic data only (§11.2). Aggregated counts that have already been published, such as situation-report figures, carry no personal data, but uploading them to the pilot should be agreed with the Ministry of Health first.
