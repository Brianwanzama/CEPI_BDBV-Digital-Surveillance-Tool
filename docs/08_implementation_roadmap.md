# 8. Implementation roadmap

The outbreak is ongoing, so the roadmap runs two tracks in parallel: **fast, low-risk deployment of the data-collection and alerting functions**, and **evidence generation to validate the score before it is shown to clinicians as decision support**.

## Phase 0 – Governance and alignment (weeks 0–4)
- Set up a technical working group under the MoH (PNLFHV, INSP/DSE surveillance, DSNIS/DHIS2 team, INRB, the provincial health division of Ituri, IPC programme), with WHO, Africa CDC and implementing partners.
- Obtain and incorporate: the current **national BDBV case definitions**, community alert definitions, the IPC/PPE protocol, the specimen pathway, the affected-zone list process and alert recipient roles.
- Decide the platform (DHIS2 Tracker vs dedicated app, document 05 §5.1); confirm hosting, the SMS gateway, the data-protection basis and data-sharing agreements.
- Expert review (Delphi, 2 rounds) of the variable list, the proposed additions, tiers, points, floors and community weights → rule set v0.2.
- Ethics/regulatory: determine whether the validation work needs ethics approval (retrospective line-list analysis and prospective silent pilot: **to confirm with the national ethics committee**).

## Phase 1 – Retrospective calibration (weeks 2–8, overlaps Phase 0)
- Data: 2026 BDBV triage/suspect-case forms with RT-PCR results from ETCs/CTEs and transit centres in Ituri and North Kivu.
- Methods: likelihood ratios (Spiegelhalter–Knill-Jones) or penalised logistic regression; compare against the national case definition; ROC/AUROC; decision-curve analysis; choose thresholds for a target sensitivity agreed by the MoH; subgroup analysis by zone, age and time since onset; handle missing data by multiple imputation for analysis (not for the tool).
- Output: rule set v1.0-candidate, with a report on sensitivity, specificity, PPV and NPV at the retained thresholds, and an explicit decision to keep or change 70/50.

## Phase 2 – Build and usability testing (weeks 4–12)
- Configure or build the production apps, French first; translate the RECO interface into Swahili and Lingala (Ituri/North Kivu), with Kikongo/Tshiluba as needed.
- Usability tests with 10–15 triage nurses and 15–20 RECOs (think-aloud, time-on-task, error rates). Target: triage < 5 min, RECO report < 3 min.
- Field tests of offline operation, sync, SMS delivery and escalation in low-connectivity areas.
- Security review and penetration test; data-protection impact assessment.
- Training package: 1-day facility training, ½-day RECO training with pictogram cards, supervisor guide, job aids for alert response.

## Phase 3 – Pilot (weeks 12–24)
- **Sites:** 2 health zones (one high-transmission, one at risk/bordering), ~10–15 facilities, ~100–200 RECOs, using existing CBS networks.
- **Stage 3a, silent mode (4–6 weeks):** full data collection and alerts follow existing procedures. The score is computed but hidden from clinicians and compared with their decisions and laboratory results.
- **Stage 3b, active mode:** the score and recommended actions are visible.
- **Evaluation (CDC updated guidelines for evaluating surveillance systems attributes):**

| Domain | Indicators |
|---|---|
| Accuracy | Sensitivity/specificity of RED and RED+AMBER vs RT-PCR; missed confirmed cases (each reviewed) |
| Timeliness | Arrival → classification; RED → acknowledgement; RED → isolation; event → verification |
| Acceptability/usability | Completion rates, override rates, user satisfaction (SUS), qualitative interviews |
| Data quality | Completeness, % Unknown, % exposures dated, duplicates |
| Community surveillance | RECO reporting completeness, % of alerts verified within 24 h, % validated |
| Burden | Isolation-area occupancy, tests per confirmed case |
| Safety | Downward overrides with adverse outcome; any harm attributable to the tool |

- **Stop/go criteria** (to be agreed in advance), e.g. sensitivity of RED+AMBER ≥ 95% vs RT-PCR among tested patients, no confirmed case classified GREEN without override, acknowledgement median ≤ 30 min.

## Phase 4 – Scale-up (month 6+)
- Phased extension to all affected and at-risk zones, prioritised by transmission and connectivity; integration with DHIS2 aggregate reporting, Go.Data and the laboratory system.
- Supervision: monthly data-quality reviews by zone, RECO feedback bulletins (results of their reports), and refresher training.

## Continuous: governance of the score
- Monthly performance review during the active outbreak; quarterly afterwards. Recalibrate when the case definition, affected areas or test positivity change materially, or when entering the outbreak's tail (falling PPV).
- Each change → new version, approval record and communication to users.
- Post-outbreak: transfer to preparedness mode (lower community thresholds, integration with routine IDSR) and publication of the validation results.

## Key risks and mitigations
| Risk | Mitigation |
|---|---|
| Score over-trusted as a diagnosis | Wording "not a probability"; clinician override; training; silent pilot |
| Alert fatigue / isolation overload | Calibrated thresholds; AMBER review instead of isolation; monitor burden indicators |
| Community mistrust, attacks on teams, data misuse fears | Community engagement, no names in RECO module, local governance of CBS ([Baker 2026](https://consensus.app/papers/details/w:bda7e31b-93aa-4380-a46a-b042cc221bca/?utm_source=claude_desktop); [O'Keeffe 2023](https://consensus.app/papers/details/w:3deb2942-4f7b-4361-8b87-4c0dd54051d2/?utm_source=claude_desktop)) |
| Insecurity and connectivity | Offline-first, SMS fallback, paper backup forms with later entry |
| RECO attrition and unpaid work | Compensation and supervision (drivers of CBS success, [McGowan 2022](https://consensus.app/papers/details/w:d06c7b2c-472b-47ce-816d-02b7f73455af/?utm_source=claude_desktop)) |
| Parallel systems | Build on DHIS2/IDSR; single data entry with automatic exports |
