/* GENERATED from config/scoring_rules.json by tools/build_rules.js - do not edit */
window.BDBV_RULES = {
 "rule_set_id": "BDBV-TRIAGE",
 "version": "0.1.0-provisional",
 "status": "DRAFT - NOT VALIDATED - NOT FOR OPERATIONAL USE",
 "effective_date": null,
 "approved_by": null,
 "change_log": [
  {
   "version": "0.1.0-provisional",
   "date": "2026-11-26",
   "author": "Design team (draft)",
   "summary": "First provisional rule set. Points are ordinal evidence tiers converted to points by expert judgement; they are NOT fitted coefficients. Requires calibration on DRC line-list data and approval by the DRC Ministry of Health (INSP / PNLFHV), INRB and clinical/IPC experts."
  }
 ],
 "output_label": "Score de suspicion BDBV (0-100) - indice ordinal, PAS une probabilite d'infection",
 "output_label_en": "BDBV suspicion score (0-100) - ordinal index, NOT a probability of infection",
 "thresholds": {
  "red": 70,
  "amber": 50
 },
 "exposure_window_days": 21,
 "travel_window_days": 28,
 "domains": {
  "clinical": {
   "cap": 45,
   "label_fr": "Signes cliniques",
   "label_en": "Clinical signs"
  },
  "exposure": {
   "cap": 60,
   "label_fr": "Expositions (21 jours)",
   "label_en": "Exposures (21 days)"
  },
  "geography": {
   "cap": 10,
   "label_fr": "Contexte geographique",
   "label_en": "Geographical context"
  }
 },
 "evidence_tiers": {
  "A": "Element of WHO/ECDC Ebola disease case or contact definition (structure to be confirmed against the current DRC national definition).",
  "B": "Independent predictor of laboratory-confirmed Ebola disease in two or more triage derivation studies, including at least one from DRC.",
  "C": "Predictor in a single study, or conflicting findings across studies.",
  "D": "Biological plausibility or expert judgement only; no derivation-study support found. Low or zero weight."
 },
 "sources": {
  "WHO-CD": "WHO Ebola and Marburg virus outbreak toolbox - standard case and contact definitions (2014). https://who.int/emergencies/outbreak-toolkit/disease-outbreak-toolboxes/ebola-and-marburg-virus-outbreak-toolbox",
  "ECDC-2026": "ECDC. Ebola disease interim case definition for reporting in the EU/EEA (Bundibugyo virus outbreak, 2026). https://www.ecdc.europa.eu/en/ebola-disease-interim-case-definition-reporting-eueea",
  "YANGO-2024": "Yango J et al. Development of a clinical prediction score for EVD screening at triage centers in the DRC. PLOS Glob Public Health 2024. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11346649/",
  "TSHOMBA-2022": "Tshomba AO et al. Development of EVD prediction scores: screening tools for Ebola suspects at the triage-point. PLoS ONE 2022. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9757576/",
  "HARTLEY-2017": "Hartley MA et al. Predicting Ebola infection: a malaria-sensitive triage score for EVD. PLoS Negl Trop Dis 2017. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5322888/",
  "LEVINE-2015": "Levine AC et al. Derivation and internal validation of the Ebola Prediction Score. Ann Emerg Med 2015. https://consensus.app/papers/details/w:5c9782ae-c940-41d5-8aa4-5fb3fc34c5f0/",
  "LOUBET-2016": "Loubet P et al. Development of a prediction model for EVD, Nzerekore, Guinea. Am J Trop Med Hyg 2016. https://consensus.app/papers/details/w:a9f97a0e-f19d-464e-96ed-51d15431c367/",
  "KEBELA-2026": "Kebela JK et al. Validation of a Bayesian Ebola diagnostic model, 10th DRC epidemic. Diagnostics 2026. https://consensus.app/papers/details/w:081f9e66-adf4-40e4-b59f-6f5a45513a94/"
 },
 "items": [
  {
   "id": "fever",
   "kind": "symptom",
   "domain": "clinical",
   "core": true,
   "points": 10,
   "tier": "A",
   "label_fr": "Fievre (rapportee ou >= 38,0 C)",
   "label_en": "Fever (reported or >= 38.0 C)",
   "rationale": "Entry criterion of WHO suspected-case definition; temperature > 38.5 C was the strongest independent predictor in Guinea (OR 18.1); in Sierra Leone pyrexia was among 7 characteristics with highest odds. Low specificity in malaria-endemic settings.",
   "sources": [
    "WHO-CD",
    "LOUBET-2016",
    "HARTLEY-2017"
   ]
  },
  {
   "id": "bleeding",
   "kind": "symptom",
   "domain": "clinical",
   "core": true,
   "points": 15,
   "tier": "A",
   "label_fr": "Saignement inexplique / ecchymoses (gencives, hematemese, autre)",
   "label_en": "Unexplained bleeding / bruising (gums, haematemesis, other)",
   "rationale": "Unexplained bleeding is part of WHO suspected-case definition. Gingival bleeding and haematemesis were independent predictors in both DRC derivation studies; haemorrhage in Sierra Leone. Often absent early, so absence must not reassure.",
   "sources": [
    "WHO-CD",
    "YANGO-2024",
    "TSHOMBA-2022",
    "HARTLEY-2017"
   ]
  },
  {
   "id": "asthenia",
   "kind": "symptom",
   "domain": "clinical",
   "core": false,
   "points": 4,
   "tier": "B",
   "label_fr": "Asthenie / fatigue intense (ajout propose)",
   "label_en": "Severe weakness / fatigue (proposed addition)",
   "rationale": "Independent predictor in both DRC derivation studies (asthenia; fatigue). Not in the original field list - proposed addition.",
   "sources": [
    "YANGO-2024",
    "TSHOMBA-2022"
   ]
  },
  {
   "id": "conjunctivitis",
   "kind": "symptom",
   "domain": "clinical",
   "core": false,
   "points": 4,
   "tier": "B",
   "label_fr": "Yeux rouges / conjonctivite (ajout propose)",
   "label_en": "Red eyes / conjunctivitis (proposed addition)",
   "rationale": "Predictor in both DRC studies (conjunctivitis; red eyes) and in Sierra Leone. Proposed addition.",
   "sources": [
    "YANGO-2024",
    "TSHOMBA-2022",
    "HARTLEY-2017"
   ]
  },
  {
   "id": "dysphagia",
   "kind": "symptom",
   "domain": "clinical",
   "core": false,
   "points": 4,
   "tier": "B",
   "label_fr": "Difficulte a avaler (ajout propose)",
   "label_en": "Difficulty swallowing (proposed addition)",
   "rationale": "Predictor in DRC (Tshomba), Liberia (Levine) and Sierra Leone (Hartley). Proposed addition.",
   "sources": [
    "TSHOMBA-2022",
    "LEVINE-2015",
    "HARTLEY-2017"
   ]
  },
  {
   "id": "diarrhoea",
   "kind": "symptom",
   "domain": "clinical",
   "core": true,
   "points": 4,
   "tier": "B",
   "label_fr": "Diarrhee",
   "label_en": "Diarrhoea",
   "rationale": "Independent predictor in Liberia and Sierra Leone; listed WHO symptom.",
   "sources": [
    "LEVINE-2015",
    "HARTLEY-2017",
    "WHO-CD"
   ]
  },
  {
   "id": "vomiting",
   "kind": "symptom",
   "domain": "clinical",
   "core": true,
   "points": 4,
   "tier": "B",
   "label_fr": "Vomissements",
   "label_en": "Vomiting",
   "rationale": "Independently associated with confirmed EVD in DRC 10th-outbreak validation; listed WHO symptom.",
   "sources": [
    "KEBELA-2026",
    "WHO-CD"
   ]
  },
  {
   "id": "sore_throat",
   "kind": "symptom",
   "domain": "clinical",
   "core": true,
   "points": 3,
   "tier": "C",
   "label_fr": "Mal de gorge",
   "label_en": "Sore throat",
   "rationale": "Predictor in one DRC derivation study (Yango).",
   "sources": [
    "YANGO-2024"
   ]
  },
  {
   "id": "confusion",
   "kind": "symptom",
   "domain": "clinical",
   "core": false,
   "points": 3,
   "tier": "C",
   "label_fr": "Confusion (ajout propose)",
   "label_en": "Confusion (proposed addition)",
   "rationale": "Predictor in one DRC study (Tshomba). Proposed addition.",
   "sources": [
    "TSHOMBA-2022"
   ]
  },
  {
   "id": "abdominal_pain",
   "kind": "symptom",
   "domain": "clinical",
   "core": true,
   "points": 2,
   "tier": "C",
   "label_fr": "Douleur abdominale",
   "label_en": "Abdominal pain",
   "rationale": "Conflicting: associated with confirmed EVD in DRC (Kebela) but its ABSENCE was predictive in Liberia (Levine). Low weight pending local data.",
   "sources": [
    "KEBELA-2026",
    "LEVINE-2015"
   ]
  },
  {
   "id": "myalgia",
   "kind": "symptom",
   "domain": "clinical",
   "core": true,
   "points": 2,
   "tier": "C",
   "label_fr": "Douleurs musculaires et articulaires",
   "label_en": "Muscle and joint pain",
   "rationale": "Conflicting: positive predictor in Liberia and DRC (Kebela), but more predictive of EVD-negative/malaria in Sierra Leone (Hartley). Low weight.",
   "sources": [
    "LEVINE-2015",
    "KEBELA-2026",
    "HARTLEY-2017"
   ]
  },
  {
   "id": "headache",
   "kind": "symptom",
   "domain": "clinical",
   "core": true,
   "points": 2,
   "tier": "C",
   "label_fr": "Cephalees",
   "label_en": "Headache",
   "rationale": "Listed among compatible symptoms in WHO definitions; not an independent predictor in the derivation studies reviewed. Very non-specific.",
   "sources": [
    "WHO-CD"
   ]
  },
  {
   "id": "nausea",
   "kind": "symptom",
   "domain": "clinical",
   "core": true,
   "points": 1,
   "tier": "D",
   "label_fr": "Nausees",
   "label_en": "Nausea",
   "rationale": "No independent predictive evidence found; overlaps with vomiting. Minimal weight.",
   "sources": []
  },
  {
   "id": "jaundice",
   "kind": "symptom",
   "domain": "clinical",
   "core": true,
   "points": 1,
   "tier": "D",
   "label_fr": "Ictere (jaunisse)",
   "label_en": "Jaundice",
   "rationale": "Not a characteristic early Ebola sign; points more to yellow fever, hepatitis or severe malaria. Kept for differential diagnosis; minimal weight.",
   "sources": []
  },
  {
   "id": "rash",
   "kind": "symptom",
   "domain": "clinical",
   "core": true,
   "points": 0,
   "tier": "D",
   "label_fr": "Eruption cutanee",
   "label_en": "Skin rash",
   "rationale": "Collected for clinical description (distribution, appearance, type) and differential diagnosis (e.g. mpox, measles). Zero weight until BDBV-specific evidence is available.",
   "sources": []
  },
  {
   "id": "contact_case",
   "kind": "exposure",
   "domain": "exposure",
   "core": true,
   "points": 35,
   "tier": "A",
   "window": true,
   "high_risk": true,
   "label_fr": "Contact avec un cas suspect, probable ou confirme d'Ebola",
   "label_en": "Contact with a suspected, probable or confirmed Ebola case",
   "rationale": "Core of WHO suspected-case and contact definitions; contact with an EVD case/sick person was an independent predictor in every derivation study reviewed (DRC x2, Liberia, Sierra Leone).",
   "sources": [
    "WHO-CD",
    "ECDC-2026",
    "TSHOMBA-2022",
    "YANGO-2024",
    "LEVINE-2015",
    "HARTLEY-2017"
   ]
  },
  {
   "id": "funeral",
   "kind": "exposure",
   "domain": "exposure",
   "core": true,
   "points": 30,
   "tier": "A",
   "window": true,
   "high_risk": true,
   "label_fr": "Participation a la preparation funeraire ou a l'inhumation d'un cas suspect/confirme",
   "label_en": "Funeral preparation or burial of a suspected/confirmed case",
   "rationale": "Direct contact with the body of a deceased case is a recognised high-risk exposure in WHO contact definitions.",
   "sources": [
    "WHO-CD"
   ]
  },
  {
   "id": "lab_exposure",
   "kind": "exposure",
   "domain": "exposure",
   "core": true,
   "points": 30,
   "tier": "A",
   "window": true,
   "high_risk": true,
   "label_fr": "Exposition en laboratoire a des echantillons potentiellement infectieux",
   "label_en": "Laboratory exposure to potentially infectious specimens",
   "rationale": "Exposure to laboratory biological material is treated as a contact exposure in WHO definitions.",
   "sources": [
    "WHO-CD"
   ]
  },
  {
   "id": "sexual_contact",
   "kind": "exposure",
   "domain": "exposure",
   "core": true,
   "points": 25,
   "tier": "A",
   "window": true,
   "high_risk": true,
   "label_fr": "Contact sexuel avec un cas suspect/confirme (ou survivant)",
   "label_en": "Sexual contact with a suspected/confirmed case (or survivor)",
   "rationale": "Recognised transmission route including from survivors; treated as a contact exposure. Weight slightly below direct-care contact pending BDBV-specific data.",
   "sources": [
    "WHO-CD"
   ]
  },
  {
   "id": "contaminated_env",
   "kind": "exposure",
   "domain": "exposure",
   "core": true,
   "points": 15,
   "tier": "A",
   "window": true,
   "high_risk": false,
   "label_fr": "Contact avec un environnement ou du materiel contamine (linge, literie, liquides)",
   "label_en": "Contact with contaminated environment or materials",
   "rationale": "Contact with soiled clothing/linen/body fluids is part of WHO contact definition; lower than direct contact as exposure is less certain.",
   "sources": [
    "WHO-CD"
   ]
  },
  {
   "id": "sick_or_dead_contact",
   "kind": "exposure",
   "domain": "exposure",
   "core": true,
   "points": 15,
   "tier": "B",
   "window": true,
   "high_risk": false,
   "label_fr": "Contact avec une personne malade ou decedee d'une maladie inexpliquee compatible",
   "label_en": "Contact with a person with unexplained compatible illness or death",
   "rationale": "'Contact with a sick person' was an independent predictor in DRC (Yango), Liberia and Sierra Leone. Lower than known-case contact because the source case is unclassified.",
   "sources": [
    "YANGO-2024",
    "LEVINE-2015",
    "HARTLEY-2017"
   ]
  },
  {
   "id": "bats_bushmeat",
   "kind": "exposure",
   "domain": "exposure",
   "core": true,
   "points": 8,
   "tier": "D",
   "window": true,
   "high_risk": false,
   "label_fr": "Chasse, manipulation, abattage ou consommation de chauves-souris / viande de brousse",
   "label_en": "Handling, hunting, slaughtering or eating bats / bushmeat",
   "rationale": "Plausible zoonotic spill-over route listed in WHO guidance; during established human-to-human transmission its discriminative value is likely low. Moderate weight; recalibrate.",
   "sources": [
    "WHO-CD"
   ]
  },
  {
   "id": "traditional_healer",
   "kind": "exposure",
   "domain": "exposure",
   "core": false,
   "points": 5,
   "tier": "C",
   "window": true,
   "high_risk": false,
   "label_fr": "Visite chez un tradipraticien / lieu de priere de guerison (ajout propose)",
   "label_en": "Visit to a traditional healer / healing prayer site (proposed addition)",
   "rationale": "Independent predictor in DRC (Yango); proxy for contact with sick people. Proposed addition.",
   "sources": [
    "YANGO-2024"
   ]
  },
  {
   "id": "health_facility_exposure",
   "kind": "exposure",
   "domain": "exposure",
   "core": false,
   "points": 10,
   "tier": "A",
   "window": true,
   "high_risk": false,
   "label_fr": "Visite ou soins dans une structure ayant recu des cas d'Ebola, injection (ajout propose)",
   "label_en": "Attended a facility treating Ebola cases or received injections (proposed addition)",
   "rationale": "WHO toolbox lists contact with a hospital treating Ebola cases and injections in the preceding 21 days as risk factors (nosocomial transmission).",
   "sources": [
    "WHO-CD"
   ]
  },
  {
   "id": "affected_area",
   "kind": "geography",
   "domain": "geography",
   "core": true,
   "points": 10,
   "tier": "A",
   "window": true,
   "high_risk": false,
   "label_fr": "Residence ou sejour dans une zone de sante avec transmission active (21 jours)",
   "label_en": "Lived in / travelled to a health zone with active transmission (21 days)",
   "rationale": "Being in an affected area within 21 days is the epidemiological criterion of the ECDC 2026 interim BDBV definition. The list of affected zones must be maintained by national surveillance.",
   "sources": [
    "ECDC-2026",
    "WHO-CD"
   ]
  }
 ],
 "floors": [
  {
   "id": "F1_CASE_DEFINITION",
   "min_category": "RED",
   "label_fr": "Compatible avec la structure de la definition OMS de cas suspect : signes compatibles + exposition a haut risque dans les 21 jours",
   "label_en": "Consistent with the structure of the WHO suspected-case definition: compatible illness + high-risk exposure within 21 days",
   "when": {
    "all": [
     {
      "or": [
       {
        "any": [
         "fever",
         "bleeding"
        ]
       },
       {
        "count": {
         "ids": [
          "vomiting",
          "diarrhoea",
          "asthenia",
          "headache",
          "myalgia",
          "abdominal_pain",
          "dysphagia",
          "conjunctivitis",
          "sore_throat",
          "confusion"
         ],
         "min": 3
        }
       }
      ]
     },
     {
      "any": [
       "contact_case",
       "funeral",
       "lab_exposure",
       "sexual_contact"
      ]
     }
    ]
   },
   "requires_confirmation": "Must be replaced by the exact current DRC national (PNLFHV/INSP) suspected-case definition for BDBV."
  },
  {
   "id": "F2_HAEMORRHAGIC_FEVER",
   "min_category": "AMBER",
   "label_fr": "Fievre avec saignement inexplique (syndrome hemorragique) - meme sans exposition connue",
   "label_en": "Fever with unexplained bleeding (haemorrhagic syndrome) - even without known exposure",
   "when": {
    "all": [
     {
      "any": [
       "fever"
      ]
     },
     {
      "any": [
       "bleeding"
      ]
     }
    ]
   },
   "requires_confirmation": "Confirm whether national guidance classifies this as suspected case (RED) in affected provinces."
  },
  {
   "id": "F3_UNEXPLAINED_DEATH",
   "min_category": "RED",
   "label_fr": "Deces brutal inexplique d'une personne venant d'une zone affectee (evaluation post-mortem)",
   "label_en": "Sudden unexplained death of a person from an affected area (post-mortem assessment)",
   "when": {
    "all": [
     {
      "any": [
       "deceased"
      ]
     },
     {
      "any": [
       "affected_area",
       "contact_case",
       "sick_or_dead_contact"
      ]
     }
    ]
   },
   "requires_confirmation": "Aligns with WHO/ECDC probable-case logic for deceased persons; confirm national procedure (safe burial, post-mortem swab)."
  }
 ],
 "community": {
  "window_days": 14,
  "note": "Community signals produce an AREA concern level shown alongside - never added to - the individual score.",
  "weights": {
   "deaths_suspected_ebola": 3,
   "clusters": 3,
   "deaths_compatible": 2,
   "deaths_unexplained": 2,
   "alerts": 1,
   "contact_reports": 1,
   "compatible_illness_people": 1
  },
  "levels": [
   {
    "level": 0,
    "min_points": 0,
    "label_fr": "Aucun signal",
    "label_en": "No signal"
   },
   {
    "level": 1,
    "min_points": 1,
    "label_fr": "Vigilance",
    "label_en": "Watch"
   },
   {
    "level": 2,
    "min_points": 4,
    "label_fr": "Preoccupation elevee",
    "label_en": "Elevated concern"
   },
   {
    "level": 3,
    "min_points": 8,
    "label_fr": "Preoccupation forte - investigation prioritaire",
    "label_en": "High concern - priority investigation"
   }
  ],
  "advisory_fr": "Des signaux communautaires recents existent dans la zone du patient. Ils ne modifient PAS le score individuel, mais le clinicien doit en tenir compte : abaisser le seuil de discussion avec la surveillance, verifier les expositions, et envisager une reevaluation.",
  "advisory_en": "Recent community signals exist in the patient's area. They do NOT change the individual score, but the clinician should consider them: lower the threshold to discuss with surveillance, re-check exposures and consider reassessment."
 },
 "early_warning": {
  "baseline_weeks": 4,
  "sd_multiplier": 2,
  "min_sd": 1,
  "min_count": 2,
  "note": "Statistical signal only: current week > mean + 2 SD of previous 4 weeks. Not an outbreak confirmation.",
  "note_fr": "Signal statistique uniquement : semaine en cours > moyenne + 2 écarts-types des 4 semaines précédentes. Ce n'est pas la confirmation d'une épidémie."
 }
};
