# 3. Risk-scoring framework (provisional)

> **Labels in the app (26 November 2026).** The three categories are shown to users as **High risk**, **Medium risk** and **Low risk** (French: risque élevé, moyen, faible; Kiswahili: hatari kubwa, ya wastani, ndogo), in red, amber and green. The score is called the *risk score*. This document and the data keep the codes RED, AMBER and GREEN, which mean the same three categories. The score is still an ordinal index, not a probability of infection.


> **Status: DRAFT v0.1.0-provisional. Not validated. Not for operational use.**
> The machine-readable version of this matrix is [`config/scoring_rules.json`](../config/scoring_rules.json). The prototype reads that file, so the table below and the running system cannot drift apart.

## 3.0 Changes in rule set v0.2 (follow-up brief §12)
- The symptom list now uses the **23 supplied symptoms**, with labels exactly as supplied. Nausea and jaundice were removed. Anorexia (tier B, 4 points: Guinea OR 2.5, Liberia, DRC), joint pain (C, 2), cough (0), other non-haemorrhagic signs (0, free text), DT, DRO and ICT (0, **unexpanded until defined**), respiratory breathing (0, meaning to confirm), coma (0, **flags urgent review**) and hiccups (D, 1) were added. "Bruising and bleeding" became "Hemorrhagic syndrome" (A, 15).
- **Correlation groups** stop correlated symptoms from adding up freely: gastro-intestinal (vomiting, diarrhoea, anorexia, abdominal pain) capped at 8; aches (headaches, joint pain, muscle pain) capped at 3; neurological (confusion, coma) capped at 3. These caps apply before the clinical domain cap of 45.
- Floor F1 counts ≥ 3 of the updated compatible-symptom list.
- The tables below describe v0.1. The machine-readable v0.2 matrix (with groups) is `config/scoring_rules.json` and is shown in the app (*Scoring rules* tab).

## 3.1 What the score is and is not

- The output is a **BDBV suspicion score from 0 to 100**. It is an ordinal index: a higher score means more of the features associated with Ebola disease are present. It is **not a probability of infection**, and the 70 and 50 cut-offs are **not percentages of anything**. The user brief describes the thresholds as "70%" and "50%". This design keeps the numbers but drops the percent sign in the interface, because no validated statistical model supports a probabilistic reading.
- The score supports triage. It does not diagnose. Only laboratory testing (RT-PCR at INRB or a designated laboratory) confirms BDBV infection.
- The clinician can always override the category. Raising it needs no permission. Lowering it needs a written justification and is flagged for review.

## 3.2 Why a rule-based score, not a fitted model

No published triage score has been derived or validated for **Bundibugyo** virus disease. The available derivation studies concern Zaire ebolavirus (EBOV):

| Study | Setting | Reference standard | Predictors retained | Performance |
|---|---|---|---|---|
| Tshomba et al. 2022, *PLoS ONE* | DRC (N. Kivu/Ituri 2018–20), 10,432 suspects, 651 cases | GeneXpert | Fatigue, difficulty swallowing, red eyes, gingival bleeding, haematemesis, confusion, haemoptysis, contact with an EVD case | WHO clinical definition alone: sens 61.6%, spec 76.4%. CPS at −1: sens 85.4%, spec 42.3%. Extended CPS: AUROC 0.88, sens 78.8%, spec 81.4% |
| Yango et al. 2024, *PLOS Glob Public Health* | Beni transit centre, DRC, 3,698 patients, 15.4% positive | RT-PCR | Asthenia, sore throat, conjunctivitis, bleeding gums, haematemesis, contact with a sick person, contact with a traditional healer | AUROC 0.764 (sens 81.4%, spec 53.6% at −1); external validation AUROC 0.766 |
| Hartley et al. 2017, *PLoS NTD* | Sierra Leone, 566 patients | Lab-confirmed | Sick contact, conjunctivitis, diarrhoea, referral time 4–9 d, pyrexia, dysphagia, haemorrhage; myalgia favoured EVD-negative/malaria | 89% discrimination |
| Levine et al. 2015, *Ann Emerg Med* | Liberia, 382 patients | Lab-confirmed | Sick contact, diarrhoea, loss of appetite, muscle pains, difficulty swallowing, *absence* of abdominal pain | AUROC 0.75 |
| Loubet et al. 2016, *AJTMH* | Guinea, 145 patients | Lab-confirmed | Temperature > 38.5 °C (OR 18.1), anorexia (OR 2.5), adjusted for epi risk factor | AUC 0.85 |
| Kebela et al. 2026, *Diagnostics* | DRC 10th outbreak, 450 patients | RT-PCR | Vomiting, anorexia, abdominal pain, muscle pain | Sens 82.4%, spec 33.7% |

Three conclusions shape the design:

1. **Epidemiological contact is the most consistent predictor.** It appears in every study.
2. **Bleeding, conjunctival injection, dysphagia and asthenia recur across studies.** General symptoms such as headache, myalgia and abdominal pain give **conflicting** signals and discriminate poorly in malaria-endemic settings.
3. **Every published score has modest specificity, and none has been tested on BDBV.** Point values from these EBOV studies cannot simply be transplanted. They depend on case mix, prevalence and the virus species.

So the score is built as a **transparent, evidence-tiered rule set**. Point values are an ordinal translation of the strength of evidence, not fitted coefficients. **This is an explicit assumption that must be replaced by calibration on DRC BDBV data** (section 3.8).

## 3.3 Structure

```
Score = min(100,  min(Clinical, 45) + min(Exposure, 60) + min(Geography, 10))
Category from score: RED ≥ 70, AMBER ≥ 50, GREEN < 50   (configurable)
Then minimum-category rules ("floors") can raise the category, never lower it
Then the clinician may override (recorded, with justification)
```

- **Domains** separate the kinds of evidence the brief asks to keep apart: symptoms, epidemiological exposures, and geographical context. Each domain has a **cap**, so that many non-specific symptoms cannot add up to a RED without any exposure.
- **General characteristics** (age, sex, occupation) are **collected but score 0** (section 3.6). Comorbidities, vaccination, malaria results and the travel log are no longer collected at triage (v0.2).
- **Community signals are never added to the score** (section 3.7).

### Evidence tiers used to set points

| Tier | Definition | Point range used |
|---|---|---|
| A | Element of the WHO/ECDC case or contact definition | Exposures 10–35, symptoms 10–15 |
| B | Independent predictor in ≥ 2 derivation studies, at least one in DRC | 4 |
| C | Single study, or conflicting findings | 2–5 |
| D | Plausibility or expert judgement only | 0–8 |

## 3.4 Scoring matrix

### Clinical domain (cap 45)

| Variable | Points | Tier | Rationale | Sources |
|---|---|---|---|---|
| Fever (reported or ≥ 38.0 °C) | 10 | A | WHO suspected-case entry criterion; strongest predictor in Guinea; low specificity where malaria is common | WHO-CD, Loubet, Hartley |
| Unexplained bleeding / bruising | 15 | A | WHO definition; gingival bleeding and haematemesis predictive in both DRC studies. Often late, so its absence does not reassure | WHO-CD, Yango, Tshomba, Hartley |
| Severe weakness/asthenia *(proposed addition)* | 4 | B | Predictor in both DRC studies | Yango, Tshomba |
| Red eyes/conjunctivitis *(proposed addition)* | 4 | B | DRC ×2, Sierra Leone | Yango, Tshomba, Hartley |
| Difficulty swallowing *(proposed addition)* | 4 | B | DRC, Liberia, Sierra Leone | Tshomba, Levine, Hartley |
| Diarrhoea | 4 | B | Liberia, Sierra Leone | Levine, Hartley |
| Vomiting | 4 | B | DRC 10th outbreak | Kebela |
| Sore throat | 3 | C | One DRC study | Yango |
| Confusion *(proposed addition)* | 3 | C | One DRC study | Tshomba |
| Abdominal pain | 2 | C | Conflicting (positive in DRC, absence predictive in Liberia) | Kebela, Levine |
| Muscle and joint pain | 2 | C | Conflicting (favours malaria in Sierra Leone) | Levine, Kebela, Hartley |
| Headache | 2 | C | Listed WHO symptom; not an independent predictor | WHO-CD |
| Nausea | 1 | D | No evidence; overlaps with vomiting | – |
| Jaundice | 1 | D | Not characteristic; points to yellow fever, hepatitis or severe malaria | – |
| Skin rash (distribution/appearance/type) | **0** | D | Collected for description and differential diagnosis (e.g. mpox, measles) | – |

"Proposed additions" are not in the original field list. The literature supports them, so they are included and flagged for the technical committee to accept or reject.

### Exposure domain (cap 60). An exposure counts only if dated within the 21 days before onset

| Variable | Points | Tier | Rationale |
|---|---|---|---|
| Contact with a suspected/probable/confirmed case | 35 | A | Core of WHO definitions; predictor in every study |
| Funeral preparation/burial of a suspected/confirmed case | 30 | A | Direct contact with the body (WHO contact definition) |
| Laboratory exposure to infectious specimens | 30 | A | WHO contact definition |
| Sexual contact with a case or survivor | 25 | A | Recognised route; slightly lower pending BDBV data |
| Contaminated environment/materials | 15 | A | WHO contact definition; exposure less certain |
| Contact with a person with unexplained compatible illness or death | 15 | B | "Sick contact" predictor (DRC, Liberia, Sierra Leone); source unclassified |
| Health facility with Ebola cases / injections *(proposed addition)* | 10 | A | WHO toolbox lists these as risk factors (nosocomial) |
| Bats/bushmeat | 8 | D | Spill-over route; low discrimination once transmission is human-to-human |
| Traditional healer visit *(proposed addition)* | 5 | C | DRC predictor (Yango) |

### Geography domain (cap 10)

| Variable | Points | Tier | Rationale |
|---|---|---|---|
| Lived in / travelled to a health zone with active transmission (21 d) | 10 | A | Epidemiological criterion of the ECDC 2026 interim BDBV definition. **The list of affected zones is maintained by national surveillance.** |

## 3.5 Minimum-category rules (floors)

A purely additive score in which the strongest single exposure is worth 35 cannot reach RED (70) on "fever + contact with a confirmed case" alone (10 + 35 = 45). Yet that combination is the textbook **suspected case**. The design therefore adds floors so that people who meet the case-definition structure are never classified below RED, whatever the points:

| Rule | Condition | Minimum category | To confirm |
|---|---|---|---|
| F1 Case definition | (fever OR bleeding OR ≥ 3 compatible symptoms) AND a high-risk exposure (case contact, funeral, lab, sexual) within 21 days | **RED** | Replace with the exact current DRC (PNLFHV/INSP) BDBV suspected-case definition |
| F2 Haemorrhagic syndrome | Fever AND unexplained bleeding, even without known exposure | **AMBER** | Whether national guidance makes this RED in affected provinces |
| F3 Unexplained death | Deceased AND (affected area OR case contact OR sick contact) | **RED** | National procedure for community deaths (safe burial, post-mortem swab) |

This mirrors the structure of the WHO definitions (WHO 2014 standard case definitions, Ebola/Marburg outbreak toolbox) **without inventing a national definition**. F1 is written so that the DRC definition can replace it in configuration.

**Implication for the 70/50 thresholds.** With evidence-tiered weights, a numerical RED (≥ 70) needs several strong elements, for example case contact (35) + fever (10) + bleeding (15) + two tier-B signs (8) + affected area (10) = 78. In practice, most REDs will come from F1. The numerical thresholds mainly separate AMBER from GREEN among people **without** a high-risk exposure. This must be reviewed during calibration.

## 3.6 Variables not scored, and why

Since v0.2 the triage form no longer collects comorbidities, vaccination, antimalarials/malaria RDT or the travel log (former section A.4). The reasoning below still applies if they are collected elsewhere, for example in the case investigation form. It matters most for vaccination and malaria: **neither may be used to lower suspicion.**

| Variable | Reason it scores 0 |
|---|---|
| Age, sex | No consistent independent effect on infection risk in triage studies (age affects *severity*, Hartley 2017 prognostic score) |
| Occupation | Captured through the specific exposures (health worker → lab/facility exposure; hunter → bushmeat; healer) to avoid double-counting |
| Comorbidities | Affect prognosis, not exposure |
| Ebola vaccination (Ervebo / rVSV-ZEBOV) | WHO states it is **not known whether Ervebo protects against Bundibugyo virus** in humans. Vaccination must not lower suspicion |
| Yellow fever vaccination | Differential diagnosis only |
| Antimalarials / malaria RDT | Malaria co-infection is common in EVD patients (Hartley 2017). **A positive RDT must not lower suspicion** |
| Travel details (dates, purpose, activities) | Scored only through "affected area" within 21 days and specific exposures; details kept for investigation |

**AI voice capture does not change the score.** Answers proposed from a dictated note count only once the health worker has accepted them into the form. The scoring engine never sees the transcript.

## 3.7 How community signals are used (and not used)

- RECO reports produce an **area concern level** (0 no signal, 1 watch, 2 elevated, 3 high) for the village, the health area and the zone, over a 14-day window. It uses provisional weights: suspected Ebola deaths ×3, clusters ×3, deaths after compatible illness ×2, unexplained deaths ×2, alerts/contact reports/compatible illness ×1.
- On the triage screen this appears in a **separate, visually distinct panel** (purple, dashed border). It is never mixed with the red/amber/green colours of the individual score.
- If the patient's village or health area is at level ≥ 2, an **advisory** is shown. It asks the clinician to re-check exposures, lower the threshold for discussing the case with surveillance, and consider reassessment. **The score and category do not change.**
- Rationale: community reports are unverified signals. Most community alerts turn out unrelated to Ebola. In Sierra Leone, 87% of CEBS alerts were non-Ebola deaths (Stone 2016) and only 2% met the suspected-case definition (Ratnayake 2016). In Ituri, 3% of community alerts were validated (O'Keeffe 2023). Letting them raise individual scores automatically would flood isolation capacity.
- The only geographical element in the score is "affected area", and that is defined by **official** surveillance (confirmed transmission), not by unverified reports.

## 3.8 Missing data

- Every scored item has three states: **Yes / No / Unknown–not assessed**. Unknown is never treated as No.
- The system computes:
  - the **observed score** (Yes only), which sets the category;
  - **completeness** (the share of scored items answered Yes or No);
  - the **potential category** (if every Unknown were Yes). When it is higher than the observed category, a warning tells the user the classification could rise if the missing items were assessed.
- An exposure answered Yes with no date is counted, with a note. An exposure dated outside the 21-day window (or after onset) is not counted. If the onset date is unknown, the assessment date is used as the reference.
- Fever must be explicitly answered (Yes, No or Unknown) before saving.

## 3.9 Consequences of misclassification

| Error | Consequence | Mitigation in the design |
|---|---|---|
| False negative (true case GREEN/AMBER) | Nosocomial transmission, missed chain, delayed care. **Most serious.** | Floors F1–F3; potential-category warning; clinician override; explicit statement that a low score does not prevent testing; reassessment triggers; community advisory |
| False positive (non-case RED) | Isolation burden, test load, stigma, co-location with true cases in holding areas | Domain caps; tiered weights; F1 tied to the case definition rather than symptoms alone; AMBER category for review rather than isolation |

During an active outbreak, the design deliberately favours **sensitivity**, in line with the DRC studies, which accepted specificities of 40–55% at their screening cut-offs.

## 3.10 Validation required before deployment

1. **Expert review (Delphi or nominal group)**: DRC MoH (PNLFHV, INSP/DSE), INRB, clinicians from ETCs/CTEs, IPC experts, WHO and Africa CDC. Confirm the variable list, tiers, points, floors and caps.
2. **Retrospective calibration** on the 2026 BDBV line list and triage data from Ituri/North Kivu (triage forms with RT-PCR results):
   - Estimate each variable's likelihood ratio (Spiegelhalter–Knill-Jones, as in Tshomba and Yango) or logistic coefficients.
   - Compare the provisional score with the national case definition: sensitivity, specificity, PPV/NPV, AUROC, and decision-curve net benefit (Tshomba 2022 method).
   - Choose thresholds from the ROC/net-benefit analysis at a target sensitivity (e.g. ≥ 90–95% for RED+AMBER) agreed by the MoH. **Retain 70/50 only if the analysis supports them.** Otherwise change the configuration.
3. **External validation** in a different health zone or time period.
4. **Prospective silent pilot**: the score is computed but not shown, and compared with clinician decisions and laboratory results.
5. **Ongoing recalibration**: review monthly during the outbreak, and whenever case definitions, affected areas or test positivity change materially. PPV falls as prevalence falls, so in the tail of an outbreak the same score means less.
6. **Geographical variation**: allow thresholds or the affected-area list to vary by province once data permit. Report performance by zone.

Each assessment stores the rule-set version used (`result.rule_set`), so performance can be analysed per version.

## 3.11 Elements requiring formal approval

| Element | Approver (to confirm) |
|---|---|
| Suspected/probable case definitions (replace F1/F3) | MoH / PNLFHV, INSP |
| Variable list, points, caps, thresholds | National technical committee (surveillance + clinical + INRB), with WHO/Africa CDC technical input |
| Affected-zone list | National surveillance (IMS/EOC) |
| Recommended actions per category, PPE levels, isolation | National IPC programme / PNLFHV |
| Specimen collection and laboratory pathway | INRB / national laboratory network |
| Community alert definitions and concern weights | DSE/INSP community surveillance, health-zone teams |
| Each new rule-set version | Same committee; signed change log in `config/` |
