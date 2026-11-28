# 6. Dashboard design

The working dashboard is in the prototype (`prototype/index.html` → *Tableau de bord*). This document specifies it.

## 6.1 Layout (single scrolling page, mobile-first; two columns on desktop)

```
┌─────────────────────────────────────────────────────────────┐
│ [Synthetic-data banner when demo data are present]           │
│ FILTERS: Province ▾  Zone ▾  Aire ▾  Village ▾  FOSA ▾       │
│          Period: 7 / 14 / 30 / 90 days / all   [Reset]       │
├─────────────────────────────────────────────────────────────┤
│ A. INDIVIDUAL-LEVEL (facilities)                             │
│ [Assessed] [RED n,%] [AMBER n,%] [GREEN n,%]                 │
│ [Red alerts] [Acknowledged %, median delay] [With actions %] │
│ [Referred for testing; results + / −]                        │
│ By facility (stacked R/A/G) │ By health zone (stacked R/A/G) │
│ Top symptoms (bars)         │ Top exposures (bars)           │
├─────────────────────────────────────────────────────────────┤
│ B. COMMUNITY-LEVEL (RECO)                                     │
│ [Reports] [Deaths] [Unexplained] [Suspected Ebola deaths]    │
│ [Community alerts] [Burials] [Clusters] [Awaiting verif.]    │
│ Villages with most signals (bars)                            │
├─────────────────────────────────────────────────────────────┤
│ C. MAP: zones, villages coloured by concern level (purple    │
│    scale), facilities (teal squares + count of RED), affected │
│    zones dashed. Click a village → filter.                    │
├─────────────────────────────────────────────────────────────┤
│ D. TRENDS & EARLY WARNING (8 weeks, bar + threshold line)     │
│ Community deaths │ Unexplained deaths │ Suspected alerts     │
│ Clusters         │ RED assessments                           │
│ "Signal statistique (non confirmé)" badge when triggered      │
└─────────────────────────────────────────────────────────────┘
```

## 6.2 Indicators

| Section | Indicator | Definition |
|---|---|---|
| A | Individuals assessed | Assessments in period and filter (reassessments counted once, latest category) |
| A | % RED / AMBER / GREEN | Final category ÷ assessed |
| A | Distribution by facility / province / zone / area / village | Stacked counts by category; filters drill down |
| A | Common symptoms / exposures | Count of "Yes" per item (Unknown excluded and reported separately as a data-quality indicator) |
| A | Red alerts generated | Alerts in period |
| A | Acknowledged and acted upon | % acknowledged; median acknowledgement delay; % with ≥ 1 action recorded |
| A | Referred for laboratory testing | lab_status ≠ none |
| A | Testing status and results | requested/collected/positive/negative, **only where authorised**, and only from the designated laboratory |
| A (proposed) | Overrides | Count of up/down overrides (down = review) |
| A (proposed) | Data completeness | Median completeness %; % with exposure dates |
| B | Total / unexplained / suspected Ebola deaths, burials, alerts, clusters | Sum of report counts |
| B | Reports awaiting verification | Events in *reported* or *in progress* |
| B (proposed) | Verification timeliness | % of events verified within 24 h |
| B (proposed) | RECO reporting completeness | Reports received ÷ expected (active RECOs × weeks) |
| C | Area concern level | 0–3 from community weights over 14 days (document 03 §3.7) |
| D | Statistical signal | Current week > mean + 2·max(SD,1) of previous 4 weeks, and ≥ 2 |

## 6.3 Visual conventions
- **Individual risk** always uses red/amber/green **with text labels** (never colour alone).
- **Geographical concern** uses a **purple sequential scale** (grey → light → mid → dark purple) and a dashed purple frame, so it cannot be confused with patient categories.
- Statistical signals: a red "▲ Signal statistique (non confirmé)" badge and a dashed threshold line. The footer states that signals are not outbreak confirmation.
- Demo/synthetic data are always bannered.

## 6.4 Role views
| Role | Sees |
|---|---|
| Health worker | Own facility by default; can widen to zone (aggregates) |
| Surveillance officer | Own zone/province; all sections; line lists with pseudonymised IDs |
| Decision-maker | All sections, aggregated; no line lists; small-number suppression in exports |

## 6.5 Production map
The prototype uses a schematic SVG with demonstration coordinates. Production should use official health-zone and health-area boundaries (e.g. GRID3 DRC health boundaries, **to confirm with MoH/DSNIS**) and facility GPS from the master facility list. Use vector tiles cached for offline use, and choropleth for health areas plus points for villages and facilities.
