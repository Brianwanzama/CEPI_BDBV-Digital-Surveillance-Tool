/* Interface strings in English and French. The default language is set by
   DEFAULT_LANG in app.js (currently English); users can switch at any time.
   Further languages (Lingala, Swahili, Kikongo, Tshiluba) can be added by
   translating this file and the code lists in app.js. Clinical/protocol wording marked
   [À VALIDER] must be confirmed against DRC Ministry of Health protocols. */
window.BDBV_I18N = {
  fr: {
    app_title: 'BDBV Triage & Surveillance',
    app_sub: 'Prototype - aide à la décision, ne remplace pas le jugement clinique',
    proto_banner: 'PROTOTYPE DE DÉMONSTRATION - règles de score PROVISOIRES, non validées. Ne pas utiliser pour des décisions réelles.',
    role: 'Rôle', role_reco: 'RECO (relais communautaire)', role_soignant: 'Agent de santé (FOSA)', role_surveillant: 'Surveillance (ZS / DPS)', role_decideur: 'Décideur (agrégé)',
    online: 'En ligne', offline: 'Hors ligne', sync: 'Synchroniser', pending: 'en attente',
    tab_home: 'Accueil', tab_triage: 'Triage', tab_patients: 'Évaluations', tab_alerts: 'Alertes', tab_reco: 'Rapport RECO', tab_myreports: 'Mes rapports', tab_verify: 'Vérification', tab_dashboard: 'Tableau de bord', tab_rules: 'Règles de score', tab_audit: 'Journal d\'audit', tab_result: 'Résultat',
    RED: 'ROUGE - suspicion élevée', AMBER: 'ORANGE - suspicion moyenne', GREEN: 'VERT - suspicion faible',
    yes: 'Oui', no: 'Non', unk: 'Inconnu / non évalué',
    save: 'Enregistrer', cancel: 'Annuler', view: 'Voir', reassess: 'Réévaluer', add: 'Ajouter',
    score: 'Score de suspicion', score_note: 'Indice ordinal 0-100 - ce n\'est PAS une probabilité d\'infection.',
    completeness: 'Complétude', floors: 'Règle(s) de classement appliquée(s)', potential: 'Si les éléments inconnus étaient présents, la catégorie pourrait monter à',
    community_ctx: 'Contexte communautaire (séparé du score individuel)',
    demo_load: 'Charger des données de démonstration (synthétiques)', demo_reset: 'Effacer toutes les données locales',
    synthetic: 'Données synthétiques de démonstration',
    rec_RED: [
      'Isoler immédiatement le patient dans la zone d\'isolement / de dépistage désignée de la FOSA, selon le dispositif PCI approuvé.',
      'Appliquer les précautions PCI renforcées (EPI selon protocole national) pour tout contact avec le patient.',
      'Évaluation clinique urgente par le clinicien responsable.',
      'Notifier immédiatement l\'équipe de surveillance de la zone de santé (alerte générée).',
      'Prélèvement et test de laboratoire selon le protocole national (INRB / laboratoire désigné) - par du personnel formé.',
      'Prioriser l\'investigation, le transfert éventuel vers un CTE/centre de transit et le suivi des contacts.',
      'Enregistrer l\'accusé de réception de l\'alerte et les mesures prises.'
    ],
    rec_AMBER: [
      'Maintenir sous surveillance clinique ; ne pas renvoyer sans revue.',
      'Revue par le clinicien responsable ou l\'officier de surveillance (cas signalé pour revue).',
      'Appliquer le niveau d\'EPI correspondant au protocole PCI et à l\'exposition évaluée.',
      'Réévaluer dès qu\'un nouveau symptôme ou une nouvelle information d\'exposition apparaît.',
      'Compléter les éléments « inconnus » : ils peuvent changer la catégorie.'
    ],
    rec_GREEN: [
      'Prise en charge clinique de routine (y compris recherche d\'autres diagnostics, ex. paludisme).',
      'Réévaluer si : apparition de fièvre, saignement, vomissements/diarrhée, ou découverte d\'une exposition (contact, funérailles).',
      'Un score faible n\'interdit PAS de demander un test ni d\'isoler si le clinicien a une inquiétude.'
    ],
    rec_flag: '[À VALIDER selon protocoles du Ministère de la Santé / PNLFHV]',
    sms_preview: 'Aperçu SMS (minimum d\'informations)',
    ack: 'Accuser réception', acked: 'Pris en charge', not_acked: 'Non acquitté',
    escalated: 'Escalade (simulée) : superviseur ZS notifié - non acquitté après',
    filters: 'Filtres', all: 'Tous', period: 'Période', days: 'jours',
    concern_legend: 'Niveau de préoccupation communautaire (zone) - distinct du risque individuel',
    stat_signal: 'Signal statistique (non confirmé)', no_signal: 'Pas de signal',
    privacy_names_hidden: 'Identité masquée pour ce rôle',
    required: 'Champs obligatoires manquants',
    role_public: 'Public (signalement)', role_clinician: 'Clinicien', role_surveillant: 'Officier de surveillance', role_lab: 'Personnel de laboratoire', role_facility_head: 'Chef de FOSA', role_zone_officer: 'Surveillant de zone de santé', role_decideur: 'Administrateur santé publique (prov./nat.)', role_sysadmin: 'Administrateur système',
    tab_verify: 'Vérification', tab_rumour: 'Signaler', tab_lab: 'Laboratoire', tab_casemgmt: 'Prise en charge', tab_contacts: 'Contacts', tab_map: 'Carte', tab_rumours: 'Rumeurs', tab_analysis: 'Analyse', tab_history: 'Historique', tab_reports: 'Rapports', tab_facility: 'Tableau FOSA', tab_admin: 'Configuration',
    footer: 'Outil d\'aide à la décision : ne remplace ni le jugement clinique ni les procédures nationales (MSP / PNLFHV / INRB). Le score n\'est pas une probabilité d\'infection.'
  },
  en: {
    app_title: 'BDBV Triage & Surveillance',
    app_sub: 'Prototype - decision support, does not replace clinical judgement',
    proto_banner: 'DEMONSTRATION PROTOTYPE - PROVISIONAL, unvalidated scoring rules. Do not use for real decisions.',
    role: 'Role', role_reco: 'RECO (community volunteer)', role_soignant: 'Health worker (facility)', role_surveillant: 'Surveillance (HZ / DPS)', role_decideur: 'Policymaker (aggregate)',
    online: 'Online', offline: 'Offline', sync: 'Sync', pending: 'pending',
    tab_home: 'Home', tab_triage: 'Triage', tab_patients: 'Assessments', tab_alerts: 'Alerts', tab_reco: 'RECO report', tab_myreports: 'My reports', tab_verify: 'Verification', tab_dashboard: 'Dashboard', tab_rules: 'Scoring rules', tab_audit: 'Audit log', tab_result: 'Result',
    RED: 'RED - high suspicion', AMBER: 'AMBER - medium suspicion', GREEN: 'GREEN - low suspicion',
    yes: 'Yes', no: 'No', unk: 'Unknown / not assessed',
    save: 'Save', cancel: 'Cancel', view: 'View', reassess: 'Reassess', add: 'Add',
    score: 'Suspicion score', score_note: 'Ordinal index 0-100 - NOT a probability of infection.',
    completeness: 'Completeness', floors: 'Classification rule(s) applied', potential: 'If unknown items were present, category could rise to',
    community_ctx: 'Community context (separate from individual score)',
    demo_load: 'Load demonstration data (synthetic)', demo_reset: 'Erase all local data',
    synthetic: 'Synthetic demonstration data',
    rec_RED: [
      'Immediately place the patient in the facility\'s designated screening/isolation area, per approved IPC arrangements.',
      'Apply enhanced IPC precautions (PPE per national protocol) for all patient contact.',
      'Urgent clinical assessment by the responsible clinician.',
      'Notify the health-zone surveillance team immediately (alert generated).',
      'Specimen collection and laboratory testing per national protocol (INRB / designated lab) by trained staff.',
      'Prioritise investigation, possible transfer to an ETC/transit centre, and contact follow-up.',
      'Record alert acknowledgement and actions taken.'
    ],
    rec_AMBER: [
      'Keep under clinical monitoring; do not discharge without review.',
      'Review by responsible clinician or surveillance officer (flagged for review).',
      'Apply the PPE level matching the IPC protocol and assessed exposure.',
      'Reassess as soon as any new symptom or exposure information emerges.',
      'Complete "unknown" items: they may change the category.'
    ],
    rec_GREEN: [
      'Routine clinical care (including other diagnoses, e.g. malaria).',
      'Reassess if: fever, bleeding, vomiting/diarrhoea appear, or an exposure is discovered (contact, funeral).',
      'A low score does NOT prevent testing or isolation if the clinician is concerned.'
    ],
    rec_flag: '[TO VALIDATE against Ministry of Health / PNLFHV protocols]',
    sms_preview: 'SMS preview (minimal information)',
    ack: 'Acknowledge', acked: 'Acknowledged', not_acked: 'Not acknowledged',
    escalated: 'Escalation (simulated): HZ supervisor notified - unacknowledged after',
    filters: 'Filters', all: 'All', period: 'Period', days: 'days',
    concern_legend: 'Community concern level (area) - distinct from individual risk',
    stat_signal: 'Statistical signal (not confirmed)', no_signal: 'No signal',
    privacy_names_hidden: 'Identity hidden for this role',
    required: 'Missing mandatory fields',
    role_public: 'Public (report an event)', role_clinician: 'Clinician', role_surveillant: 'Surveillance officer', role_lab: 'Laboratory personnel', role_facility_head: 'Facility head', role_zone_officer: 'Health zone surveillance officer', role_decideur: 'Public health administrator (prov./nat.)', role_sysadmin: 'System administrator',
    tab_verify: 'Verification', tab_rumour: 'Report', tab_lab: 'Laboratory', tab_casemgmt: 'Case management', tab_contacts: 'Contacts', tab_map: 'Map', tab_rumours: 'Rumours', tab_analysis: 'Analysis', tab_history: 'Historical data', tab_reports: 'Reports', tab_facility: 'Facility dashboard', tab_admin: 'Configuration',
    footer: 'Decision-support tool: does not replace clinical judgement or national procedures (MoH / PNLFHV / INRB). The score is not a probability of infection.'
  }
};
