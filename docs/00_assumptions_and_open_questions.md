# Assumptions register and items requiring confirmation

Everything below was assumed provisionally in order to build the design and prototype. Each item must be confirmed or replaced by the named authority before operational use.

| # | Assumption / gap | Where used | Confirm with |
|---|---|---|---|
| 1 | The current **DRC national BDBV case definitions** (suspected, probable, confirmed, contact, community alert) were not available. Floor rules F1/F3 follow the structure of the 2014 WHO standard definitions and the ECDC 2026 interim definition | Scoring floors, alerts | MoH / PNLFHV, INSP |
| 2 | 21-day exposure window applies to BDBV | Scoring, A.3 | MoH / WHO |
| 3 | Point values are ordinal translations of evidence tiers from **EBOV** studies; no BDBV-specific derivation exists | Entire score | Technical committee + Phase 1 calibration |
| 4 | Thresholds 70/50 kept from the brief as configurable values; no evidence that they are optimal | Categories | Phase 1 calibration |
| 5 | Proposed additional symptoms (asthenia, conjunctivitis, dysphagia, confusion) and exposures (facility exposure, traditional healer) | A.2, A.3 | Technical committee |
| 6 | Recommended actions for RED/AMBER/GREEN, PPE levels, isolation arrangements | Alerts, result screen | National IPC programme, PNLFHV |
| 7 | Specimen collection and testing pathway (INRB/decentralised GeneXpert or other platforms) | RED actions, lab status | INRB |
| 8 | List of health zones with active transmission, and who updates it | `affected_area`, map | IMS/EOC surveillance |
| 9 | Community concern weights, 14-day window and level cut-offs | Area concern | DSE/INSP + zone teams; calibrate on CBS data |
| 10 | Early-warning method (mean + 2 SD of 4 weeks) | Trends | Surveillance epidemiologists; consider EARS-C/Farrington when longer baselines exist |
| 11 | Escalation timings (30 min, 2 h) and alert recipients | Alerts | Zone and provincial health teams |
| 12 | Platform choice (DHIS2 Tracker vs dedicated app), hosting, SMS gateway | Architecture | DSNIS / MoH ICT |
| 13 | Org-unit codes and village lists from DHIS2/SNIS; facility GPS | Geography | DSNIS |
| 14 | RECO reporting frequency (weekly + immediate) and compensation | Module B | DSE/INSP community surveillance |
| 15 | Data-protection legal basis, retention, access to identifiable data, ethics for validation | Security, roadmap | MoH legal counsel, national ethics committee |
| 16 | Languages to support beyond French | i18n | Provincial health divisions |
| 17 | Who may enter and see laboratory results in the tool | Lab status | INRB, MoH |
| 18 | Whether vaccination status (Ervebo or any BDBV candidate vaccine used in trials) must be recorded somewhere, now that it is no longer collected at triage | Investigation form | MoH, WHO, trial sponsors |
| 19 | AI voice capture: hosting model (on-device / MoH server / hybrid), speech and AI providers, data-processing agreements, consent wording, acceptance thresholds from a validation study | Module A, document 05 §5.7 | MoH, DSNIS, legal counsel, ethics committee |
| 21 | Supplied list 1 (26 names) treated as PROVINCES and list 2 as HEALTH ZONES; zone→province links taken from the supplied boundary file (26 November 2026), to be confirmed. "Banzow Moke" assumed to be "Banjow Moke" in the file | Geography, map | DSNIS / provincial health divisions |
| 22 | Definitions of DT, DRO and ICT, and the meaning of "Respiratory breathing" | Symptom list, scoring | Clinical and surveillance teams |
| 23 | TAT targets (1 h / 4 h / 24 h / 12 h), contact visit frequency (daily, overdue after 36 h), follow-up period (21 days) | Verification queue, contacts | Surveillance (INSP/DSE), WHO guidance |
| 24 | Map reference points: provincial capitals and same-name towns from GeoNames; no boundaries until official shapefiles are supplied | Map | DSNIS / GRID3 |
| 25 | Kiswahili translation (prototype) requires native-speaker review | Interface | Provincial health divisions (Ituri, Nord-Kivu, Sud-Kivu, Maniema, Tshopo) |
| 20 | Removal of section A.4 (history, travel log, vaccinations, malaria) from triage confirmed by the technical committee | Module A | Technical committee |

## Sources that could not be fetched in this session
The automated environment could not open www.who.int, www.ecdc.europa.eu or www.ncbi.nlm.nih.gov pages directly. Facts attributed to those sources were taken from search-engine summaries and research-database abstracts (see [references](references.md)). Before the documents are finalised, check them against the full texts, particularly:
- the WHO Disease Outbreak News series for the 2026 BDBV outbreak (dates, case counts, vaccine statement);
- the ECDC interim case definition (exact wording);
- the full texts of Tshomba 2022 and Yango 2024 (point values of their scores, which could be compared with the provisional points here).
