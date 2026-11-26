# 1. System requirements document

## 1.1 Context

The DRC Ministry of Health declared an outbreak of Ebola disease caused by **Bundibugyo virus (BDBV)** on 15 May 2026, after confirmation by INRB. Ituri is the epicentre, and spread has been reported to other countries. WHO determined the event a Public Health Emergency of International Concern ([WHO Disease Outbreak News, 2026](https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON602)). A field assessment in Ituri ([Muambangu Milambo et al., 2026](https://consensus.app/papers/details/w:cbfb54aa-0ef7-4bb5-b30c-f96de010910f/?utm_source=claude_desktop)) reported that by 12 July 2026, 66.7% of deaths in one 24-hour period were community deaths. It also reported that only 64.4% of contacts were followed, alongside delays in detection and referral. WHO states that it is not known whether Ervebo protects against BDBV.

Early detection therefore depends on two things: (1) clinicians suspecting Ebola at first contact, and (2) community signals (deaths, burials, clusters) reaching surveillance teams fast. This system supports both and links them.

## 1.2 Objectives

| # | Objective | Measure |
|---|---|---|
| O1 | Raise the index of suspicion at facility triage by systematically capturing clinical and exposure information | % of eligible patients with a complete triage; % of lab-confirmed cases classified RED/AMBER at first contact |
| O2 | Trigger appropriate, timely action for high-suspicion patients | Median time from RED classification to acknowledgement; % of REDs with isolation and specimen recorded |
| O3 | Capture community deaths, burials and illness events systematically and route them to verification | RECO reporting completeness and timeliness; % of signals verified within 24 h |
| O4 | Link community and facility information by place | % of assessments with village code; % of verified events with linked facility assessments reviewed |
| O5 | Give decision-makers a near-real-time, filterable picture with early-warning signals | Dashboard latency; statistical signals reviewed within 48 h |

**Out of scope:** an electronic medical record, clinical case management in ETCs/CTEs, laboratory information management, contact tracing (an interface is foreseen), and diagnosis.

## 1.3 Users and roles

| Role | Who | Main tasks | Data access |
|---|---|---|---|
| RECO | Relais communautaire (village) | Weekly and immediate community reports; follow status of their signals | Only their own reports and verification status. **No clinical records, no names of patients** |
| Health worker | Triage nurse/clinician at a health facility (FOSA) | Triage form, view result and actions, acknowledge alerts, reassess, record lab status | Identifiable data for patients of **their facility** |
| Facility clinician (alert recipient) | Responsible clinician (médecin chef / infirmier titulaire) | Receives RED alerts, acknowledges, records actions; reviews AMBER | As above |
| Surveillance officer | Health area (IT), health zone (ZS) and provincial (DPS) surveillance staff | Verify community signals, follow alerts, review AMBER, dashboard, manage rule versions (with approval) | Pseudonymised patient records (ID, place, clinical and exposure fields; **names hidden by default**, revealed only with logged justification for investigation); all community data in their area |
| Decision-maker | DPS, national IMS/EOC, MoH, partners | Dashboard | **Aggregated** data only |
| System administrator | National HIS / DSNIS team | Users, master lists, configuration deployment | Technical access; all access logged |

## 1.4 Modules and workflows

### Module A – Health facility clinical triage
1. The patient arrives. The triage worker opens a new assessment (online or offline).
2. They record identity and location (A.1) using the official geographic hierarchy (province > health zone > health area > village) and the facility.
3. Clinical signs (A.2), each Yes/No/Unknown with onset date and course.
4. Exposures in the 21 days before onset (A.3), with date, place, nature of contact and relationship.
5. Context (A.4): history, travel, vaccinations, antimalarials, malaria RDT. Not scored.
6. A live score, category and community-context panel update while the form is filled in.
7. Clinical judgement (A.5): optional override with justification.
8. Save. The system assigns a unique ID, checks for duplicates, stores the rule-set version and shows recommended actions.
9. RED: an alert is generated (in-app plus SMS) to the facility clinician and the zone surveillance focal point. Acknowledgement and actions are recorded, with escalation if not acknowledged.
10. AMBER: flagged for review. GREEN: reassessment triggers are shown.
11. Reassessment updates the same record and keeps the category history.

### Module B – Community-based surveillance (RECO)
1. The RECO opens a report for their village (pre-filled), defaults to the last 7 days, and enters counts with +/− buttons.
2. They answer two funeral-practice questions and add events (type, date, number of people, place without names, source, short description).
3. They send the report. It is stored offline and synced when the network returns.
4. Each event starts as **Reported – to verify**. The health-area or zone surveillance team verifies it and sets: In progress, then Verified (investigation) or Discarded.
5. Immediate reporting: a suspected Ebola death or cluster should also be phoned or SMSed to the health-area nurse at once, following IDSR/CEBS practice. The app does not replace this.

### Integration (see document 05)
- Each patient assessment shows the community concern level for the patient's village, health area and zone.
- Each community event shows the facility assessments from the same village within ±21 days.
- RED facility alerts appear in the zone's surveillance picture and on the map.

## 1.5 Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-01 | Capture all fields of the data dictionary (document 02), marking mandatory fields | Must |
| FR-02 | Three-state answers (Yes/No/Unknown) for every symptom and exposure; Unknown never treated as No | Must |
| FR-03 | Generate unique IDs: `BDB-<facility>-<yymmdd>-<4 chars><check>` for assessments, `RCO-…` reports, `EVT-…` events, `ALR-…` alerts | Must |
| FR-04 | Detect possible duplicate patients (normalised name + DOB/age + village, 30 days) and duplicate events (village + type + date) | Must |
| FR-05 | Compute score, category, floors, completeness and potential category from a versioned configuration file | Must |
| FR-06 | Show the score breakdown (variable, status, points, evidence tier) | Must |
| FR-07 | Show community context separately from the individual score | Must |
| FR-08 | Clinician override (up or down) with mandatory justification; downward overrides flagged | Must |
| FR-09 | Category-specific recommended actions, configurable text, flagged pending national validation | Must |
| FR-10 | RED alert: in-app plus SMS with minimal information; record acknowledgement, actions and delay; escalate after a configurable time (prototype: 30 min) | Must |
| FR-11 | AMBER review queue; record review | Must |
| FR-12 | Reassessment with category history | Must |
| FR-13 | Lab status per assessment (none/requested/collected/positive/negative), editable by authorised roles only | Should |
| FR-14 | RECO report with counts, practices and events; internal consistency checks (subsets ≤ total deaths) | Must |
| FR-15 | Verification workflow for events, with history | Must |
| FR-16 | Dashboard (document 06) with filters by geography, facility and period | Must |
| FR-17 | Early-warning statistical signals against a historical baseline | Should |
| FR-18 | Role-based access as in 1.3 | Must |
| FR-19 | Audit trail of create, view, update, verify, acknowledge, sync and rule changes | Must |
| FR-20 | Update thresholds and weights by configuration with version control and approval | Must |
| FR-21 | French interface; additional languages by translation file (Lingala, Swahili, Kikongo, Tshiluba) | Must (FR) / Should (others) |
| FR-22 | Export to national systems (DHIS2 aggregate and tracker, IDSR weekly) | Should |

## 1.6 Non-functional requirements

| Area | Requirement |
|---|---|
| Connectivity | Fully functional offline for data entry, scoring and local alerts; store-and-forward sync; SMS fallback for alerts and for RECO reports where there is no data network |
| Devices | Low-end Android (Android 8+, 2 GB RAM), 5–6" screens; touch targets ≥ 44 px; works in bright light |
| Performance | Form usable in < 5 min for a typical triage; score updates in < 100 ms |
| Usability | RECO form completable by a volunteer with minimal literacy support (icons, counters, pictogram training cards) |
| Security | TLS 1.2+ in transit; encrypted storage on device and server; device PIN; per-user accounts; session timeout; remote wipe |
| Privacy | Data minimisation (RECO module collects no patient names); pseudonymisation for surveillance views; aggregated only for decision-makers; SMS carries an ID, facility and time only |
| Audit | Immutable server-side log; retention per MoH policy |
| Configurability | Scoring rules, thresholds, alert recipients, escalation time, community weights, affected-zone list and translations all outside the code |
| Interoperability | DHIS2 org-unit codes for geography; FHIR/DHIS2 tracker mapping; IDSR weekly aggregate |
| Availability | Server ≥ 99% during outbreak response; local operation unaffected by outages |

## 1.7 Key provisional assumptions (full register in [`00_assumptions_and_open_questions.md`](00_assumptions_and_open_questions.md))
- The 2014 WHO case-definition structure and the 21-day window apply to BDBV until the DRC national definition is supplied.
- Health-zone and health-area codes come from the DHIS2/SNIS org-unit hierarchy.
- An SMS gateway (aggregator or operator short code) will be available through the MoH.
- RECOs report weekly, and immediately for suspected Ebola deaths or clusters.
