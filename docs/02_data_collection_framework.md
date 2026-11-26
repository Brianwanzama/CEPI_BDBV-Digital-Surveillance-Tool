# 2. Data collection framework (data dictionary)

Conventions
- **M** = mandatory, **C** = conditional (mandatory when the trigger is met), **O** = optional.
- `YNU` = Yes / No / Unknown–not assessed. In the database: `yes|no|unk`. "Unknown" is a valid answer and is distinct from a missing value.
- Dates use ISO 8601 (`YYYY-MM-DD`); date-times are stored in UTC and shown in local time (Africa/Lubumbashi, UTC+2 for Ituri/North Kivu; Kinshasa is UTC+1).
- Geography uses the official DHIS2/SNIS org-unit codes. The prototype uses demonstration codes (see `prototype/geo.js`).
- *Scored* indicates the variable feeds the suspicion score ([document 03](03_risk_scoring_framework.md)).

## 2.1 Module A – Health facility triage

### A.0 System fields
| Variable | Definition | Format | M/O |
|---|---|---|---|
| `assessment_id` | Unique assessment ID `BDB-<facility code>-<yymmdd>-<4 random><check char>` | text, system | M |
| `patient_key` | Normalised name + DOB/age + village, for duplicate detection (hashed on the server) | text, system | M |
| `created_at`, `updated_at` | Record timestamps | datetime, system | M |
| `created_by` | User account | system | M |
| `rule_set` | Scoring rule-set ID and version used | system | M |
| `sync_status` | pending / synced | system | M |
| `history_log[]` | Previous scores and categories with timestamps and users | system | M |

### A.1 Sociodemographic information
| Variable | Definition | Format | M/O |
|---|---|---|---|
| `last_name` | Surname (nom, postnom) | text | M ("inconnu" allowed) |
| `first_name` | First name | text | M ("inconnu" allowed) |
| `dob` | Date of birth | date | O |
| `age_years` | Age in years (computed from DOB if given; estimate allowed) | integer 0–120 | M if no DOB |
| `sex` | Sex | F / M | M |
| `phone` | Telephone of patient or next of kin | text | O |
| `occupation` | Occupation (list: health worker, traditional healer, hunter, miner, trader, farmer, student, transport/moto-taxi, homemaker, child, other) | single choice + text | O |
| `address_permanent` | Permanent home address | text | O |
| `address_current` | Current residence if different | text | O |
| `province` | Province | DHIS2 code | M |
| `health_zone` | Zone de santé | DHIS2 code | M |
| `health_area` | Aire de santé | DHIS2 code | M |
| `village` | Village or locality (quartier) | code from master list; free text "other" with later coding | M |
| `facility` | Health facility of assessment | Master facility list code | M |
| `assessed_at` | Date and time of assessment | datetime | M |

### A.2 Clinical information
| Variable | Definition | Format | M/O |
|---|---|---|---|
| `onset_date` | Date of first symptom | date | M (or `onset_unknown` = true) |
| `onset_unknown` | Onset date unknown | boolean | C |
| `temperature_c` | Measured axillary temperature | decimal 30–44 | O |
| `deceased` | Person deceased at assessment (post-mortem/community death) | boolean | O |
| For each symptom `s_<id>`: | | | |
| `s_<id>` | Presence | YNU | M for fever; O otherwise (blank = Unknown) |
| `s_<id>_onset` | Onset date of that symptom | date | O |
| `s_<id>_course` | ongoing / resolved | choice | C (if Yes) |
| `s_<id>_obs` | Clinical observations | text | O |

Symptom `id`s: `fever`*, `headache`*, `myalgia`* (muscle and joint pain), `abdominal_pain`*, `sore_throat`*, `nausea`*, `vomiting`*, `diarrhoea`*, `jaundice`*, `bleeding`* (bruising and bleeding manifestations; plus `bleed_sites` text), `rash` (not scored; plus `rash_distribution`, `rash_appearance`, `rash_type` [maculopapular / petechial-purpuric / vesicular-pustular / other]).
Proposed evidence-based additions (scored, pending approval): `asthenia`, `conjunctivitis`, `dysphagia`, `confusion`.
(* scored)

### A.3 Epidemiological exposure (21 days before onset)
For each exposure `e_<id>`:
| Variable | Definition | Format | M/O |
|---|---|---|---|
| `e_<id>` | Exposure occurred | YNU | O (blank = Unknown) |
| `e_<id>_date` | Date of (last) exposure | date | C (if Yes; strongly recommended because it is used for the 21-day window) |
| `e_<id>_place` | Place (village/facility/country) | text | O |
| `e_<id>_nature` | Nature of contact (nursing, shared bed, body washing, touching body fluids, etc.) | text | O |
| `e_<id>_relationship` | Relationship to source case | text | O |
| `e_<id>_source_case_id` | ID of the source case if known (links to the case/contact list) | text | O |

Exposure `id`s (all scored): `contact_case`, `funeral`, `lab_exposure`, `sexual_contact`, `contaminated_env`, `sick_or_dead_contact`, `bats_bushmeat`, `affected_area` (lived in / travelled to a health zone with active transmission); proposed additions `health_facility_exposure`, `traditional_healer`.

### A.4 (removed in v0.2)
The former section *Medical and travel history* (comorbidities, travel log, Ebola and yellow fever vaccination, antimalarials, malaria RDT) has been removed from the triage form. None of these fields were scored. Travel to areas with active transmission is still captured by the scored exposure `affected_area` (A.3). If needed for investigation, these variables belong in the case investigation form used after a RED alert, not at triage.

### A.5 Assessment and outcome (clinical judgement is shown as A.4 on screen)
| Variable | Definition | Format | M/O |
|---|---|---|---|
| `score` | Suspicion score 0–100 | integer, system | M |
| `domain_scores` | Clinical / exposure / geography sub-scores | system | M |
| `algorithm_category` | RED/AMBER/GREEN from score and floors | system | M |
| `floors_applied` | Floor rules fired | system | M |
| `completeness_pct`, `potential_category` | Missing-data indicators | system | M |
| `clinician_category` | Clinician override | RED/AMBER/GREEN | O |
| `clinician_reason` | Justification | text | C (if override) |
| `final_category` | Category used for actions | system | M |
| `community_snapshot` | Village/area concern level at time of assessment | system | M |
| `review_status` | AMBER review: pending/done, by, at | system/user | C |
| `lab_status` | none / requested / collected / positive / negative (authorised roles) | choice | O |
| `lab_specimen_id` | Laboratory specimen ID (link to lab system) | text | O |
| `disposition` | isolated / referred to ETC/CTE / admitted / discharged / died | choice | O (recommended) |

### Voice-capture provenance (when AI voice capture was used)
| Variable | Definition | Format | M/O |
|---|---|---|---|
| `voice.engine` | `ai` (Claude) or `local` (offline keyword extraction) | system | C |
| `voice.ai_fields[]` | Fields whose value came from an accepted AI proposal (e.g. `age`, `item:fever`) | system | C |
| `voice.edited_after_ai[]` | AI-filled fields the health worker changed afterwards | system | C |
| `voice.reviewed` | Health worker confirmed every AI answer was checked with the patient | boolean | C (mandatory if any AI field) |
| `voice.transcript` | Transcript text, only if the worker chose to keep it (default: not kept) | text | O |
| consent | Patient/carer consent to voice capture (required before dictation/extraction; in production record it as a field) | boolean | C |

### Alert record
`alert_id`, `assessment_id`, `facility`, `zone`, `created_at`, `recipients[]`, `sms_text`, `sms_delivery_status`, `ack_at`, `ack_by`, `ack_delay_min`, `actions[]` (isolation, IPC, clinical assessment, specimen requested, surveillance notified, referred), `note`, `escalations[]`, `closed`.

## 2.2 Module B – RECO community report

### B.1 Geography and report metadata
| Variable | Definition | Format | M/O |
|---|---|---|---|
| `report_id` | `RCO-<zone>-<yymmdd>-<random><check>` | system | M |
| `reco_id` | RECO identifier (from RECO registry; pre-filled from login) | code | M |
| `province`, `health_zone`, `health_area`, `village` | Pre-filled from the RECO's assignment; editable | codes | M |
| `reported_at` | Date and time of report | datetime | M |
| `period_from`, `period_to` | Reporting period (default: last 7 days) | date | M |

### B.2 Counts for the period (integer ≥ 0; 0 = none; mandatory, default 0)
| Variable | Definition (to align with national CEBS/IDSR community definitions) |
|---|---|
| `deaths_total` | All deaths in the village during the period |
| `deaths_unexplained` | Deaths without a known cause (sudden or after a short illness), subset of total |
| `deaths_compatible` | Deaths following illness with fever and/or bleeding and/or diarrhoea/vomiting, subset |
| `deaths_suspected_ebola` | Deaths the community or RECO suspects to be Ebola, subset |
| `burials` | Burials conducted |
| `alerts` | Ebola alerts reported (suspected or confirmed) |
| `compatible_illness_people` | Living people with signs compatible with Ebola |
| `clusters` | Groups of ≥ 2 ill or dead people in the same household/family/gathering within a short period |
| `contact_reports` | People reporting contact with a suspected/confirmed case |
| `other_events` | Other unusual events (e.g. dead wild animals such as bats or primates) |

Consistency rule: each death subset ≤ `deaths_total`.

### B.2b Funeral practices
| Variable | Format |
|---|---|
| `practice_family_body_washing` | YNU: bodies washed/prepared by the family |
| `practice_burial_without_sdb` | YNU: burials without a Safe and Dignified Burial (EDS) team |

### B.2c Event list (repeating; one per signal)
| Variable | Definition | Format | M/O |
|---|---|---|---|
| `event_id` | `EVT-…` | system | M |
| `event_type` | unexplained death / death after compatible illness / ill person with compatible signs / cluster / contact with a case / unsafe burial / dead animals / other | choice | M |
| `date_occurred` | When it happened | date | M |
| `date_reported` | When reported | datetime, system | M |
| `n_people` | Number of people involved | integer | O (default 1) |
| `location` | Neighbourhood / household description, **no names** | text | O |
| `source` | direct observation / family / community or religious leader / traditional healer / rumour-radio-social media / other | choice | M |
| `description` | Short free text | text | O |
| `verification_status` | reported → in_progress → verified / discarded | system / surveillance | M |
| `verification_history[]` | status, at, by, notes | system | M |
| `possible_duplicate_of` | Earlier event with the same village, type and date | system | C |
| `linked_assessment_ids[]` | Facility assessments linked during investigation | surveillance | O |

**Personal data:** the RECO module collects no names of ill or deceased people. Names needed for follow-up are collected by the verification team, not by the RECO, and are stored in the investigation record with restricted access.

## 2.3 Code lists and master data (to be supplied by MoH)
- Org-unit hierarchy and codes (DHIS2/SNIS), including villages/localities where available.
- Master facility list, with GPS.
- RECO registry (ID, village assignment, supervisor, phone).
- List of health zones with active transmission (updated by IMS/EOC; drives the `affected_area` prompt).
- Alert recipient directory per facility and zone (role-based, not personal phone numbers in configuration).
