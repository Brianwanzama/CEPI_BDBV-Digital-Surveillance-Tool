/*
 * Kiswahili (Congolese Kiswahili) interface strings.
 *
 * STATUS: working translation produced for the prototype. It MUST be reviewed by
 * Congolese Kiswahili speakers (health-zone teams, RECO supervisors) before field use;
 * Congolese Kiswahili differs from East African standard Swahili in vocabulary.
 *
 * Coverage: complete for the frontline workflows (home, RECO report, public rumour form,
 * triage incl. voice capture, results and alerts, contact follow-up, scoring labels).
 * Supervisory screens (verification queue, laboratory, map, reports, configuration)
 * fall back to French, the administrative language. `node tests/i18n.test.js` lists
 * every string still untranslated.
 *
 * Two parts:
 *  - window.BDBV_I18N.sw : keyed interface strings (same keys as French/English);
 *  - window.BDBV_SW      : inline strings, keyed by their ENGLISH source text.
 */
(function () {
  window.BDBV_I18N.sw = {
    app_title: 'BDBV Uchunguzi & Ufuatiliaji',
    app_sub: 'Mfano wa majaribio - husaidia kufanya uamuzi, haubadilishi uamuzi wa mhudumu wa afya',
    proto_banner: 'MFANO WA MAJARIBIO - kanuni za alama ni za MUDA, hazijathibitishwa. Usitumie kwa maamuzi halisi.',
    role: 'Wajibu', role_reco: 'RECO (mjumbe wa jamii)', role_soignant: 'Mhudumu wa afya (kituo)', role_surveillant: 'Afisa wa ufuatiliaji', role_decideur: 'Msimamizi wa afya ya umma (jimbo/taifa)',
    role_public: 'Umma (kuripoti tukio)', role_clinician: 'Daktari / mhudumu wa matibabu', role_lab: 'Mfanyakazi wa maabara', role_facility_head: 'Mkuu wa kituo cha afya', role_zone_officer: 'Afisa wa ufuatiliaji wa eneo la afya', role_sysadmin: 'Msimamizi wa mfumo',
    online: 'Mtandaoni', offline: 'Nje ya mtandao', sync: 'Tuma data', pending: 'zinasubiri',
    tab_home: 'Mwanzo', tab_triage: 'Uchunguzi', tab_patients: 'Tathmini', tab_alerts: 'Tahadhari', tab_reco: 'Ripoti ya RECO', tab_myreports: 'Ripoti zangu', tab_verify: 'Uthibitisho', tab_dashboard: 'Dashibodi', tab_rules: 'Kanuni za alama', tab_audit: 'Kumbukumbu za ukaguzi', tab_result: 'Matokeo',
    tab_rumour: 'Ripoti', tab_lab: 'Maabara', tab_casemgmt: 'Huduma kwa wagonjwa', tab_contacts: 'Waliogusana', tab_map: 'Ramani', tab_rumours: 'Uvumi', tab_analysis: 'Uchambuzi', tab_history: 'Takwimu za zamani', tab_reports: 'Ripoti', tab_facility: 'Dashibodi ya kituo', tab_admin: 'Mipangilio',
    RED: 'Hatari kubwa', AMBER: 'Hatari ya wastani', GREEN: 'Hatari ndogo',
    yes: 'Ndiyo', no: 'Hapana', unk: 'Haijulikani / haijachunguzwa',
    save: 'Hifadhi', cancel: 'Ghairi', view: 'Angalia', reassess: 'Tathmini upya', add: 'Ongeza',
    score: 'Alama ya hatari', score_note: 'Kipimo cha mpangilio 0-100 - SI uwezekano wa maambukizi.',
    completeness: 'Ukamilifu', floors: 'Kanuni za uainishaji zilizotumika', potential: 'Kama mambo yasiyojulikana yangekuwepo, kundi lingeweza kupanda hadi',
    community_ctx: 'Hali ya jamii (tofauti na alama ya mgonjwa)',
    demo_load: 'Pakia data ya majaribio (ya kubuni)', demo_reset: 'Futa data yote iliyo kwenye kifaa hiki',
    synthetic: 'Data ya kubuni ya majaribio',
    rec_RED: [
      'Mweke mgonjwa mara moja katika eneo la kutenga / la uchunguzi la kituo, kulingana na mpango wa IPC uliokubaliwa.',
      'Tumia tahadhari kubwa za kuzuia maambukizi (vifaa vya kujikinga kulingana na itifaki ya taifa) kwa kila kugusana na mgonjwa.',
      'Tathmini ya haraka ya kitabibu na mhudumu anayehusika.',
      'Julisha timu ya ufuatiliaji ya eneo la afya mara moja (tahadhari imetumwa).',
      'Kuchukua sampuli na kupima maabara kulingana na itifaki ya taifa (INRB / maabara iliyoteuliwa) - na wafanyakazi waliofunzwa.',
      'Pa kipaumbele uchunguzi, uhamisho kwenda kituo cha matibabu ya Ebola na ufuatiliaji wa waliogusana.',
      'Andika kupokelewa kwa tahadhari na hatua zilizochukuliwa.'
    ],
    rec_AMBER: [
      'Endelea kumfuatilia kitabibu; usimruhusu kuondoka bila mapitio.',
      'Mapitio na mhudumu anayehusika au afisa wa ufuatiliaji (mgonjwa amewekwa kwa mapitio).',
      'Tumia kiwango cha vifaa vya kujikinga kulingana na itifaki ya IPC na kugusana kulikotathminiwa.',
      'Tathmini upya mara dalili mpya au taarifa mpya ya kugusana inapopatikana.',
      'Kamilisha mambo "yasiyojulikana": yanaweza kubadilisha kundi.'
    ],
    rec_GREEN: [
      'Huduma ya kawaida ya matibabu (pamoja na kutafuta magonjwa mengine, k.m. malaria).',
      'Tathmini upya kama: homa, kutokwa damu, kutapika/kuhara vinaanza, au kugusana kunagunduliwa (mgonjwa, mazishi).',
      'Alama ndogo HAIZUII kupima wala kutenga kama mhudumu ana wasiwasi.'
    ],
    rec_flag: '[KUTHIBITISHWA kulingana na itifaki za Wizara ya Afya / PNLFHV]',
    sms_preview: 'Muonekano wa SMS (taarifa chache tu)',
    ack: 'Thibitisha kupokea', acked: 'Imeshughulikiwa', not_acked: 'Haijathibitishwa',
    escalated: 'Kupandisha (kwa majaribio): msimamizi wa eneo amejulishwa - haijathibitishwa baada ya',
    filters: 'Vichujio', all: 'Zote', period: 'Kipindi', days: 'siku',
    concern_legend: 'Kiwango cha wasiwasi wa jamii (eneo) - tofauti na hatari ya mgonjwa',
    stat_signal: 'Ishara ya kitakwimu (haijathibitishwa)', no_signal: 'Hakuna ishara',
    privacy_names_hidden: 'Majina yamefichwa kwa wajibu huu',
    required: 'Sehemu za lazima hazijajazwa',
    footer: 'Chombo cha kusaidia uamuzi: hakibadilishi uamuzi wa kitabibu wala taratibu za taifa (Wizara ya Afya / PNLFHV / INRB). Alama si uwezekano wa maambukizi.'
  };

  window.BDBV_SW = {
    // geography and common
    'Province': 'Jimbo', 'Health zone': 'Eneo la afya', 'Health area': 'Eneo dogo la afya', 'Village / locality': 'Kijiji / mtaa', 'Health facility': 'Kituo cha afya',
    'Zone': 'Eneo', 'Village': 'Kijiji', 'Name': 'Jina', 'Facility': 'Kituo', 'Date': 'Tarehe', 'Category': 'Kundi', 'Status': 'Hali', 'Type': 'Aina', 'Place': 'Mahali',
    'Save': 'Hifadhi', 'Update': 'Sasisha', 'Remove': 'Ondoa', 'Reset': 'Anza upya', 'Stop': 'Simamisha', 'Apply': 'Tumia', 'Discard': 'Acha', 'Next': 'Ijayo', 'none': 'hakuna', 'demo': 'majaribio',
    'Female': 'Mwanamke', 'Male': 'Mwanaume', 'Sex': 'Jinsia', 'Age': 'Umri', ' years': ' miaka', 'Age group': 'Kundi la umri', 'Age / sex': 'Umri / jinsia', 'Phone': 'Simu', 'Address': 'Anwani', 'Occupation': 'Kazi',
    'Suspected': 'Anayeshukiwa', 'Probable': 'Anayewezekana', 'Confirmed': 'Aliyethibitishwa', 'Unknown / none': 'Haijulikani / hakuna',
    'RED': 'NYEKUNDU', 'AMBER': 'MANJANO', 'GREEN': 'KIJANI',
    // home
    'New community report': 'Ripoti mpya ya jamii', 'Report a rumour / event': 'Ripoti uvumi / tukio', 'My reports and status': 'Ripoti zangu na hali yake', 'New triage assessment': 'Tathmini mpya ya uchunguzi',
    'My facility alerts': 'Tahadhari za kituo changu', 'Dashboard': 'Dashibodi', 'Alert verification queue': 'Foleni ya kuthibitisha tahadhari', 'Contact follow-up': 'Ufuatiliaji wa waliogusana', 'Surveillance map': 'Ramani ya ufuatiliaji',
    'Follow high-risk alerts': 'Fuatilia tahadhari za hatari kubwa', 'Integrated dashboard': 'Dashibodi ya pamoja', 'Dashboard (aggregate)': 'Dashibodi (jumla)', 'Reports': 'Ripoti', 'Report an event': 'Ripoti tukio',
    'Patient case management': 'Huduma kwa wagonjwa', 'Samples and results': 'Sampuli na matokeo', 'Laboratory reports': 'Ripoti za maabara', 'Facility dashboard': 'Dashibodi ya kituo', 'Performance report': 'Ripoti ya utendaji',
    'Facility performance': 'Utendaji wa vituo', 'Historical data': 'Takwimu za zamani', 'Configuration (geography, timelines, care)': 'Mipangilio (maeneo, muda, huduma)', 'Scoring rules': 'Kanuni za alama', 'User:': 'Mtumiaji:', 'Principles': 'Kanuni za msingi',
    'Early-warning and decision-support tool: <b>it does not diagnose</b>. Only the laboratory confirms BDBV infection.': 'Chombo cha tahadhari ya mapema na kusaidia uamuzi: <b>hakitambui ugonjwa</b>. Maabara pekee ndiyo inathibitisha maambukizi ya BDBV.',
    'Individual clinical risk, community signals and laboratory confirmation are three <b>separate</b> concepts.': 'Hatari ya kitabibu kwa mtu, ishara za jamii na uthibitisho wa maabara ni mambo matatu <b>tofauti</b>.',
    'Clinician judgement always prevails: they can raise (or, with justification, lower) the category.': 'Uamuzi wa mhudumu wa afya ndio wa mwisho: anaweza kupandisha (au, kwa sababu, kushusha) kundi.',
    'Works offline; data are sent at synchronisation.': 'Inafanya kazi bila mtandao; data inatumwa wakati wa kutuma.',
    'Demonstration data': 'Data ya majaribio', 'Assessments: ': 'Tathmini: ', 'RECO reports: ': 'Ripoti za RECO: ', 'Alerts: ': 'Tahadhari: ',
    'Erase all data stored on this device?': 'Futa data yote iliyo kwenye kifaa hiki?', 'Erase': 'Futa', 'Data erased.': 'Data imefutwa.',
    // triage form
    'Distribution': 'Mahali ilipoenea', 'e.g. trunk, generalised': 'k.m. kifuani, mwili mzima', 'Appearance': 'Muonekano', 'e.g. maculopapular': 'k.m. madoa yaliyoinuka', 'Specify the signs': 'Eleza dalili',
    'Site(s)': 'Mahali', 'gums, haematemesis, injection site, stool...': 'fizi, kutapika damu, mahali pa sindano, choo...', 'proposed': 'inapendekezwa', 'definition to confirm': 'maana ya kuthibitishwa',
    'Onset date': 'Tarehe ya kuanza', 'Course': 'Mwenendo', 'Ongoing': 'Inaendelea', 'Resolved': 'Imekwisha', 'Observations': 'Maelezo',
    'Date (last exposure)': 'Tarehe (kugusana kwa mwisho)', 'Nature of contact': 'Aina ya kugusana', 'e.g. nursing, shared bed, body washing': 'k.m. kumhudumia, kulala kitanda kimoja, kuosha maiti', 'Relationship to case': 'Uhusiano na mgonjwa', 'Source case ID (if known)': 'Namba ya mgonjwa chanzo (kama inajulikana)',
    'Reassessment': 'Tathmini upya', '* mandatory. "Unknown / not assessed" is never counted as absent.': '* lazima. "Haijulikani / haijachunguzwa" haihesabiwi kamwe kama "hapana".',
    'Identity and location': 'Utambulisho na mahali', 'Surname': 'Jina la ukoo', 'First name': 'Jina la kwanza', 'Date of birth': 'Tarehe ya kuzaliwa', 'Age (years)': 'Umri (miaka)', 'Phone / contact': 'Simu / mawasiliano',
    'Permanent address': 'Anwani ya kudumu', 'Current residence': 'Makazi ya sasa', 'Assessment date & time': 'Tarehe na saa ya tathmini', 'Clinical information': 'Taarifa za kitabibu', 'Illness onset date': 'Tarehe ugonjwa ulipoanza',
    'Onset date unknown': 'Tarehe ya kuanza haijulikani', 'Measured temperature (°C)': 'Joto lililopimwa (°C)', 'Person deceased (post-mortem assessment)': 'Mtu amefariki (tathmini baada ya kifo)',
    'Exposures in the 21 days before onset': 'Kugusana katika siku 21 kabla ya kuanza kuugua', 'An exposure dated more than 21 days before onset (or after) is not counted in the score.': 'Kugusana kwa zaidi ya siku 21 kabla ya kuanza kuugua (au baada) hakuhesabiwi kwenye alama.',
    'Clinical judgement': 'Uamuzi wa kitabibu', 'Clinician category (if different)': 'Kundi la mhudumu (kama ni tofauti)', '- Follow tool result -': '- Fuata matokeo ya chombo -', 'Justification (required if changed)': 'Sababu (lazima ikibadilishwa)',
    'I have checked every AI-proposed answer (highlighted) with the patient.': 'Nimehakikisha kila jibu lililopendekezwa na AI (lililoangaziwa) pamoja na mgonjwa.', 'Keep the transcript with the record': 'Hifadhi maandishi pamoja na faili',
    // result
    'Thresholds (configurable): high risk ≥ ': 'Viwango (vinaweza kubadilishwa): hatari kubwa ≥ ', 'medium risk ≥ ': 'hatari ya wastani ≥ ', 'Severity sign: ': 'Dalili ya hatari: ', ' - urgent clinical review whatever the score.': ' - mapitio ya haraka ya kitabibu bila kujali alama.',
    'Tool category: ': 'Kundi la chombo: ', 'clinician category: ': 'kundi la mhudumu: ', '(lowered - review required)': '(imeshushwa - mapitio yanahitajika)', 'unknown items: ': 'mambo yasiyojulikana: ',
    'Exposures outside 21-day window (not counted): ': 'Kugusana nje ya siku 21 (hakuhesabiwi): ', 'Score breakdown': 'Ufafanuzi wa alama', 'Variable': 'Kigezo', 'Points': 'Alama', 'Evidence': 'Ushahidi', 'out of window': 'nje ya kipindi',
    'Domain caps applied before summing. Total capped at 100.': 'Viwango vya juu vya kila sehemu vimetumika kabla ya kujumlisha. Jumla isizidi 100.',
    'Village: ': 'Kijiji: ', 'Health area: ': 'Eneo dogo la afya: ', 'Zone: ': 'Eneo: ', 'Health area, ': 'Eneo dogo la afya, ', ' last days: ': ' siku zilizopita: ', 'unexplained deaths ': 'vifo visivyoelezeka ', 'suspected Ebola deaths ': 'vifo vinavyoshukiwa Ebola ', 'alerts ': 'tahadhari ', 'clusters ': 'makundi ', 'unverified events ': 'matukio yasiyothibitishwa ',
    'These signals are not part of the individual score.': 'Ishara hizi si sehemu ya alama ya mgonjwa.', 'Live result': 'Matokeo ya papo hapo',
    // voice capture
    'AI voice capture (optional)': 'Kurekodi kwa sauti kwa msaada wa AI (si lazima)',
    'Dictate or type what the patient says (or your summary). The AI <b>proposes</b> answers with the source phrase; nothing enters the form until you accept it. Audio is not recorded: only the text is used.': 'Sema au andika anachosema mgonjwa (au muhtasari wako). AI <b>inapendekeza</b> majibu pamoja na sentensi chanzo; hakuna kinachoingia kwenye fomu mpaka ukubali. Sauti hairekodiwi: maandishi pekee yanatumika.',
    'The patient (or carer) agrees to voice capture and transcription': 'Mgonjwa (au mlezi) amekubali kurekodiwa kwa sauti na kuandikwa', 'Start dictation': 'Anza kuongea', 'Spoken language': 'Lugha inayozungumzwa',
    'Dictation is not available here: type or paste the notes.': 'Kuongea hakupatikani hapa: andika au bandika maelezo.', 'Transcript (editable)': 'Maandishi (yanaweza kurekebishwa)', 'Dictated text appears here. You can also type or paste.': 'Maandishi ya sauti yanaonekana hapa. Unaweza pia kuandika au kubandika.',
    'Extract answers with AI': 'Toa majibu kwa AI', 'Basic offline extraction': 'Utoaji wa kawaida bila mtandao', 'Insert example note': 'Weka mfano wa maelezo',
    'Prototype: transcription and extraction may use an online service. Use only with role-played cases. In production: consent, a data-processing agreement and Ministry of Health approval are required (see document 05).': 'Mfano wa majaribio: kuandika na kutoa majibu kunaweza kutumia huduma ya mtandaoni. Tumia tu na wagonjwa wa kuigiza. Kwa matumizi halisi: ridhaa, mkataba wa usindikaji data na idhini ya Wizara ya Afya vinahitajika (angalia hati 05).',
    'AI is not available here: basic offline extraction only.': 'AI haipatikani hapa: utoaji wa kawaida bila mtandao pekee.', 'AI is not available': 'AI haipatikani', 'Stop dictation': 'Simamisha kuongea',
    'Microphone not allowed: type the notes.': 'Kipaza sauti hakiruhusiwi: andika maelezo.', 'Dictation is not available for this language or account. Try the other language or type.': 'Kuongea hakupatikani kwa lugha hii au akaunti hii. Jaribu lugha nyingine au andika.',
    'Dictation is busy, try again in a moment.': 'Huduma ya kuongea ina shughuli, jaribu tena baadaye kidogo.', 'The microphone or transcription service failed.': 'Kipaza sauti au huduma ya kuandika imeshindwa.', 'Maximum duration reached.': 'Muda wa juu umefikiwa.',
    'Tick the patient consent box first.': 'Weka alama kwenye kisanduku cha ridhaa ya mgonjwa kwanza.', 'Listening…': 'Inasikiliza…', 'No text to analyse.': 'Hakuna maandishi ya kuchambua.', 'AI is reading the note…': 'AI inasoma maelezo…',
    'AI is not allowed for this page. Use basic extraction.': 'AI hairuhusiwi kwa ukurasa huu. Tumia utoaji wa kawaida.', 'AI is not available for this account. Use basic extraction.': 'AI haipatikani kwa akaunti hii. Tumia utoaji wa kawaida.',
    'Too many requests. Try later or use basic extraction.': 'Maombi mengi mno. Jaribu baadaye au tumia utoaji wa kawaida.', 'The AI reply could not be read. Try again.': 'Jibu la AI halikusomeka. Jaribu tena.',
    'The AI declined this note. Edit it or use basic extraction.': 'AI imekataa maelezo haya. Yarekebishe au tumia utoaji wa kawaida.', 'AI failed. Try again or use basic extraction.': 'AI imeshindwa. Jaribu tena au tumia utoaji wa kawaida.',
    'Temperature': 'Joto', 'Deceased': 'Amefariki', 'offline': 'bila mtandao', 'Proposed by the AI assistant. Check every line.': 'Imependekezwa na msaidizi wa AI. Hakikisha kila mstari.',
    'Proposed by basic keyword extraction. Check every line; it can miss things.': 'Imependekezwa kwa utoaji wa maneno muhimu. Hakikisha kila mstari; inaweza kukosa mambo.', 'No answers found in the note.': 'Hakuna majibu yaliyopatikana kwenye maelezo.',
    'Field': 'Sehemu', 'Proposed': 'Lililopendekezwa', 'Source phrase': 'Sentensi chanzo', 'Already entered: ': 'Tayari imejazwa: ', 'The note contradicts itself': 'Maelezo yanajipinga', 'Apply selected to the form': 'Tumia yaliyochaguliwa kwenye fomu',
    'Items not mentioned stay "Unknown". The score is computed from the form only.': 'Mambo yasiyotajwa yanabaki "Haijulikani". Alama inahesabiwa kutoka kwenye fomu pekee.', 'No lines selected.': 'Hakuna mstari uliochaguliwa.',
    ' answer(s)': ' jibu/majibu', ' answer(s) applied. Check the highlighted fields with the patient.': ' jibu/majibu yametumika. Hakikisha sehemu zilizoangaziwa pamoja na mgonjwa.', 'Opening microphone…': 'Inafungua kipaza sauti…', 'Finishing…': 'Inamaliza…',
    // validation, duplicates, save
    'Age or DOB': 'Umri au tarehe ya kuzaliwa', 'Onset date (or "unknown")': 'Tarehe ya kuanza (au "haijulikani")', 'Fever (yes / no / unknown)': 'Homa (ndiyo / hapana / haijulikani)', 'Clinician justification': 'Sababu ya mhudumu',
    'Confirmation that AI-proposed answers were checked': 'Uthibitisho kwamba majibu ya AI yamehakikishwa', 'Possible duplicate: ': 'Huenda ni nakala: ', 'Same name, age/DOB and village in the last 30 days.': 'Jina, umri/tarehe ya kuzaliwa na kijiji sawa ndani ya siku 30 zilizopita.',
    'Reopen existing (reassessment)': 'Fungua iliyopo (tathmini upya)', 'Create a new record': 'Unda faili mpya', 'Category ': 'Kundi ', 'voice capture': 'kurekodi kwa sauti',
    'BDBV HIGH-RISK ALERT. Record ': 'TAHADHARI YA HATARI KUBWA BDBV. Faili ', '. Open the app for details. Reply OK to acknowledge.': '. Fungua programu kwa maelezo. Jibu OK kuthibitisha kupokea.',
    'Facility responsible clinician': 'Mhudumu anayehusika wa kituo', 'HZ surveillance focal point': 'Mratibu wa ufuatiliaji wa eneo la afya', 'Assessment saved': 'Tathmini imehifadhiwa', 'synced': 'imetumwa', 'pending synchronisation': 'inasubiri kutumwa',
    'Recommended actions': 'Hatua zinazopendekezwa', 'New assessment': 'Tathmini mpya', 'Manage alert': 'Shughulikia tahadhari', 'Review': 'Mapitio', 'Laboratory': 'Maabara', 'Mark reviewed': 'Weka kama imepitiwa', 'Classification': 'Uainishaji',
    'Lab status: entered by authorised staff only; confirmation is by the designated laboratory (INRB).': 'Hali ya maabara: inajazwa na wafanyakazi walioidhinishwa tu; uthibitisho ni wa maabara iliyoteuliwa (INRB).',
    // alerts
    'Isolated in designated area': 'Ametengwa katika eneo lililoteuliwa', 'IPC precautions applied': 'Tahadhari za kuzuia maambukizi zimetumika', 'Clinical assessment done': 'Tathmini ya kitabibu imefanyika', 'Specimen requested': 'Sampuli imeombwa',
    'Surveillance notified': 'Ufuatiliaji umejulishwa', 'Referred / transferred': 'Amepelekwa / amehamishwa', 'High-risk alerts': 'Tahadhari za hatari kubwa', 'No alerts.': 'Hakuna tahadhari.', 'record': 'faili', 'by': 'na', 'delay': 'muda', 'Actions: ': 'Hatua: ', 'Comment': 'Maoni', 'Medium-risk cases for review': 'Wagonjwa wa MANJANO wa kupitiwa',
    // RECO report
    'Event type': 'Aina ya tukio', 'Date occurred': 'Tarehe ya tukio', 'Number of people': 'Idadi ya watu', 'Place (neighbourhood / household, no names)': 'Mahali (mtaa / nyumba, bila majina)', 'Source of information': 'Chanzo cha taarifa', 'Short description': 'Maelezo mafupi',
    'Death / burial: details (if applicable)': 'Kifo / mazishi: maelezo (kama inahusika)', 'Number of deaths': 'Idadi ya vifo', 'Age group (deceased)': 'Kundi la umri (marehemu)', 'Case linked to the burial': 'Mgonjwa anayehusiana na mazishi',
    'Community report': 'Ripoti ya jamii', 'Report what you saw or heard. A report is a <b>signal to verify</b> - not an Ebola confirmation. Do not write people\'s names.': 'Ripoti ulichoona au kusikia. Ripoti ni <b>ishara ya kuthibitishwa</b> - si uthibitisho wa Ebola. Usiandike majina ya watu.',
    'RECO ID': 'Namba ya RECO', 'Report date & time': 'Tarehe na saa ya ripoti', 'Period from': 'Kipindi kuanzia', 'to': 'hadi', 'Counts in the period (0 if none)': 'Idadi katika kipindi (0 kama hakuna)', 'Funeral practices': 'Desturi za mazishi',
    'Were bodies washed / prepared by family?': 'Je, maiti zilioshwa / kuandaliwa na familia?', 'Burials without a Safe and Dignified Burial team?': 'Je, kulikuwa na mazishi bila timu ya Mazishi Salama na ya Heshima?', 'Events to report': 'Matukio ya kuripoti', 'Add an event': 'Ongeza tukio', 'Send report': 'Tuma ripoti',
    'Unexplained / compatible / suspected deaths cannot exceed total deaths.': 'Vifo visivyoelezeka / vinavyofanana / vinavyoshukiwa haviwezi kuzidi jumla ya vifo.', 'Report saved': 'Ripoti imehifadhiwa', 'It will be sent at synchronisation.': 'Itatumwa wakati wa kutuma data.',
    'You are offline: the report is kept on the phone and will be sent when the network returns.': 'Uko nje ya mtandao: ripoti imehifadhiwa kwenye simu na itatumwa mtandao ukirudi.', 'Possible duplicate of an already reported event: ': 'Huenda ni nakala ya tukio lililokwisha ripotiwa: ', ' - the surveillance team will check.': ' - timu ya ufuatiliaji itahakikisha.',
    'Next step: the health-area surveillance team will <b>verify</b> the signal.': 'Hatua inayofuata: timu ya ufuatiliaji ya eneo dogo la afya <b>itathibitisha</b> ishara.', 'New report': 'Ripoti mpya', 'You see your reports and verification status - not clinical records.': 'Unaona ripoti zako na hali ya uthibitisho - si faili za matibabu.',
    'sent': 'imetumwa', 'pending': 'inasubiri', 'Deaths': 'Vifo', 'unexplained': 'visivyoelezeka', 'alerts': 'tahadhari', 'No reports.': 'Hakuna ripoti.', 'Demo neighbourhood': 'Mtaa wa majaribio', 'Synthetic demonstration event': 'Tukio la kubuni la majaribio',
    'Offline: data stay on the device and will be sent when the network returns.': 'Nje ya mtandao: data inabaki kwenye kifaa na itatumwa mtandao ukirudi.', ' record(s) synced.': ' faili zimetumwa.',
    // RECO counters, event types, sources
    'Deaths (total) in period': 'Vifo (jumla) katika kipindi', '… of which unexplained': '… kati yake visivyoelezeka', '… of which after a compatible illness': '… kati yake baada ya ugonjwa unaofanana', '… of which suspected Ebola': '… kati yake vinavyoshukiwa Ebola',
    'Burials conducted': 'Mazishi yaliyofanyika', 'Ebola alerts reported (suspected/confirmed)': 'Tahadhari za Ebola zilizoripotiwa (zinazoshukiwa/zilizothibitishwa)', 'People ill with compatible signs': 'Watu wagonjwa wenye dalili zinazofanana',
    'Clusters of illness or deaths (same household / family)': 'Makundi ya wagonjwa au vifo (nyumba / familia moja)', 'People reporting contact with suspected/confirmed case': 'Watu walioripoti kugusana na mgonjwa anayeshukiwa/aliyethibitishwa', 'Other unusual events (e.g. dead animals)': 'Matukio mengine yasiyo ya kawaida (k.m. wanyama waliokufa)',
    'Burial / burial site': 'Mazishi / mahali pa kuzika', 'Unexplained death': 'Kifo kisichoelezeka', 'Death after compatible illness': 'Kifo baada ya ugonjwa unaofanana', 'Ill person with compatible signs': 'Mgonjwa mwenye dalili zinazofanana', 'Cluster of illness / deaths': 'Kundi la wagonjwa / vifo',
    'Contact with a case': 'Kugusana na mgonjwa', 'Unsafe burial (no SDB team)': 'Mazishi yasiyo salama (bila timu ya mazishi salama)', 'Dead animals (bats, primates...)': 'Wanyama waliokufa (popo, nyani...)', 'Other unusual event': 'Tukio jingine lisilo la kawaida', 'Contact with an Ebola patient': 'Kugusana na mgonjwa wa Ebola',
    'Direct observation': 'Kuona mwenyewe', 'Family / household': 'Familia / nyumba', 'Community / religious leader': 'Kiongozi wa jamii / wa dini', 'Traditional healer': 'Mganga wa kienyeji', 'Rumour / radio / social media': 'Uvumi / redio / mitandao ya kijamii', 'Other': 'Nyingine',
    'Reported - to verify': 'Imeripotiwa - ya kuthibitishwa', 'Verification in progress': 'Uthibitisho unaendelea', 'Verified - investigation': 'Imethibitishwa - uchunguzi', 'Discarded': 'Imeachwa',
    // occupations, classification
    'Health worker': 'Mhudumu wa afya', 'Hunter': 'Mwindaji', 'Miner / gold digger': 'Mchimba madini / dhahabu', 'Trader': 'Mfanyabiashara', 'Farmer': 'Mkulima', 'Pupil / student': 'Mwanafunzi', 'Transporter / moto-taxi': 'Msafirishaji / dereva wa pikipiki', 'Homemaker': 'Mama wa nyumbani', 'Child (not applicable)': 'Mtoto (haihusiki)',
    'Maculopapular': 'Madoa yaliyoinuka', 'Petechial / purpuric': 'Vidoa vya damu chini ya ngozi', 'Vesicular / pustular': 'Malengelenge / usaha',
    'Under assessment': 'Inatathminiwa', 'Confirmed (lab)': 'Aliyethibitishwa (maabara)', 'Lab-negative': 'Hasi (maabara)', 'Not a case': 'Si mgonjwa wa Ebola',
    // dashboard (frontline view for health workers)
    'this wk': 'wiki hii', 'threshold': 'kiwango', 'Include reports not yet approved (marked)': 'Jumuisha ripoti ambazo bado hazijaidhinishwa (zimewekwa alama)', 'Showing: ALL reports, including unverified.': 'Inaonyesha: ripoti ZOTE, pamoja na zisizothibitishwa.',
    'Showing: verified and approved community reports only.': 'Inaonyesha: ripoti za jamii zilizothibitishwa na kuidhinishwa pekee.', 'Individual-level surveillance (facilities)': 'Ufuatiliaji wa mtu mmoja mmoja (vituo)', 'People assessed (all submissions)': 'Watu waliotathminiwa (wote)',
    'Verified and approved suspected cases': 'Wagonjwa wanaoshukiwa waliothibitishwa na kuidhinishwa', 'High-risk alerts (facility)': 'Tahadhari za hatari kubwa (kituo)', 'Acknowledged': 'Zimethibitishwa kupokelewa', 'median delay ': 'muda wa kati ', 'With actions recorded': 'Zenye hatua zilizoandikwa', 'Referred for testing': 'Wamepelekwa kupimwa', 'results: ': 'matokeo: ',
    'By health facility': 'Kwa kituo cha afya', 'By health zone': 'Kwa eneo la afya', 'By age group': 'Kwa kundi la umri', 'Most common symptoms': 'Dalili za kawaida zaidi', 'Most common exposures': 'Kugusana kwa kawaida zaidi',
    'Lab results shown only where authorised and available. Triage category is not a diagnosis.': 'Matokeo ya maabara yanaonyeshwa tu yanaporuhusiwa na kupatikana. Kundi la uchunguzi si utambuzi wa ugonjwa.', 'Community-level surveillance (RECO)': 'Ufuatiliaji wa jamii (RECO)', 'Reports received': 'Ripoti zilizopokelewa',
    'Deaths reported': 'Vifo vilivyoripotiwa', 'Unexplained deaths': 'Vifo visivyoelezeka', 'Suspected Ebola deaths': 'Vifo vinavyoshukiwa Ebola', 'Community Ebola alerts': 'Tahadhari za Ebola za jamii', 'Burials': 'Mazishi', 'Clusters': 'Makundi', 'Events awaiting verification': 'Matukio yanayosubiri uthibitisho', 'events in total': 'matukio kwa jumla',
    'Villages with most signals': 'Vijiji vyenye ishara nyingi zaidi', 'Alert turnaround times': 'Muda wa kushughulikia tahadhari', 'Map (overview)': 'Ramani (muhtasari)', 'Full interactive map: "Map" tab.': 'Ramani kamili: kichupo cha "Ramani".', 'Trends and early warning': 'Mwenendo na tahadhari ya mapema',
    '(Geographic filters applied; period ignored: last 8 weeks.)': '(Vichujio vya maeneo vimetumika; kipindi hakitumiki: wiki 8 zilizopita.)', 'Community deaths': 'Vifo katika jamii', 'Suspected Ebola alerts': 'Tahadhari za Ebola zinazoshukiwa', 'Compatible illness clusters': 'Makundi ya magonjwa yanayofanana', 'High-risk assessments (facility)': 'Tathmini NYEKUNDU (kituo)',
    'A statistical signal triggers review by the surveillance team. It is NOT confirmation of an outbreak.': 'Ishara ya kitakwimu inaanzisha mapitio na timu ya ufuatiliaji. SI uthibitisho wa mlipuko.',
    // scoring rules & audit
    'Read-only: only the system administrator can change thresholds (after approval).': 'Kusoma tu: msimamizi wa mfumo pekee ndiye anaweza kubadilisha viwango (baada ya idhini).', 'High-risk threshold (≥)': 'Kiwango cha NYEKUNDU (≥)', 'Medium-risk threshold (≥)': 'Kiwango cha MANJANO (≥)', 'Save (local version)': 'Hifadhi (toleo la kifaa)', 'Revert to reference version': 'Rudi kwenye toleo la marejeo',
    'In production every change goes through an approval workflow (MoH / INSP / technical committee) and creates a new version; each assessment stores the version used.': 'Kwa matumizi halisi kila badiliko linapitia mchakato wa idhini (Wizara ya Afya / INSP / kamati ya kiufundi) na kuunda toleo jipya; kila tathmini inahifadhi toleo lililotumika.',
    'Scoring matrix': 'Jedwali la alama', 'Domain (cap)': 'Sehemu (kiwango cha juu)', 'Rationale': 'Sababu', 'Sources': 'Vyanzo', 'Minimum-category rules (floors)': 'Kanuni za kundi la chini kabisa', 'Evidence tiers': 'Viwango vya ushahidi', 'Thresholds must satisfy 0 < medium < high ≤ 100.': 'Viwango lazima viwe 0 < wastani < kubwa ≤ 100.',
    'Who entered, viewed or modified what, and when. In production: immutable server-side log.': 'Nani aliingiza, aliangalia au alibadilisha nini, na lini. Kwa matumizi halisi: kumbukumbu zisizobadilika kwenye seva.', 'When': 'Lini', 'User': 'Mtumiaji', 'Entity': 'Kitu', 'Detail': 'Maelezo',
    // public rumour form
    'Report a health event': 'Ripoti tukio la kiafya', 'Anyone can report. Your report will be <b>checked</b> by the health team: it is not a diagnosis. You can stay anonymous.': 'Mtu yeyote anaweza kuripoti. Ripoti yako <b>itahakikishwa</b> na timu ya afya: si utambuzi wa ugonjwa. Unaweza kubaki bila kujitambulisha.',
    '1. What did you see or hear?': '1. Uliona au ulisikia nini?', '2. Where?': '2. Wapi?', 'I don\'t know': 'Sijui', 'Exact place (neighbourhood, landmark, no person\'s name)': 'Mahali hasa (mtaa, alama inayojulikana, bila jina la mtu)', '3. When and how many?': '3. Lini na wangapi?',
    'Date of the event': 'Tarehe ya tukio', 'Number of people involved': 'Idadi ya watu wanaohusika', 'Describe what happened': 'Eleza kilichotokea', '4. You': '4. Wewe', 'I want to stay anonymous': 'Nataka kubaki bila kujitambulisha', 'Your name (optional)': 'Jina lako (si lazima)',
    'Your phone (optional, so we can call back)': 'Simu yako (si lazima, ili tukupigie)', 'Your relationship to the event': 'Uhusiano wako na tukio', 'Photo or document (optional)': 'Picha au hati (si lazima)', 'Prototype: only the file name and size are recorded; the file is not uploaded.': 'Mfano wa majaribio: jina na ukubwa wa faili pekee vinaandikwa; faili haitumwi.',
    'Send the report': 'Tuma ripoti', 'Describe the event in a few words.': 'Eleza tukio kwa maneno machache.', 'Give at least the health zone or the place.': 'Taja angalau eneo la afya au mahali.', ' death(s)': ' kifo/vifo', 'Attachment: ': 'Kiambatisho: ', 'Thank you, your report is saved': 'Asante, ripoti yako imehifadhiwa',
    'Reference number: ': 'Namba ya kumbukumbu: ', 'The surveillance team will check it. ': 'Timu ya ufuatiliaji itaihakikisha. ', 'They may call you.': 'Wanaweza kukupigia simu.', 'For a seriously ill person or a suspicious death, also call the health-area nurse or your zone\'s alert number.': 'Kwa mgonjwa mahututi au kifo cha kutia shaka, mpigie pia muuguzi wa eneo dogo la afya au namba ya tahadhari ya eneo lako.',
    'I saw it happen': 'Niliona likitokea', 'Family member': 'Mwanafamilia', 'Neighbour / community': 'Jirani / jamii', 'Community, religious or traditional leader': 'Kiongozi wa jamii, wa dini au wa kimila', 'Teacher': 'Mwalimu', 'Health worker / RECO': 'Mhudumu wa afya / RECO', 'I heard about it': 'Nilisikia habari zake',
    // contacts
    'Contact tracing and follow-up': 'Kutafuta na kufuatilia waliogusana', 'Configured follow-up period: ': 'Kipindi cha ufuatiliaji kilichowekwa: ', ' days after last exposure (to confirm against national and WHO protocol). Daily visit expected; "overdue" = no visit for more than 36 h.': ' siku baada ya kugusana kwa mwisho (kuthibitishwa kulingana na itifaki ya taifa na WHO). Ziara ya kila siku inatarajiwa; "imechelewa" = hakuna ziara kwa zaidi ya saa 36.',
    'Contacts registered': 'Waliogusana walioandikishwa', 'Active (to follow)': 'Wanaofuatiliwa', 'Visit due today': 'Ziara ya leo', 'Overdue follow-ups': 'Ufuatiliaji uliochelewa', 'Completed follow-ups': 'Ufuatiliaji uliokamilika', 'Developed symptoms': 'Wamepata dalili', 'Lost to follow-up': 'Wamepotea kwenye ufuatiliaji',
    'Register a contact': 'Andikisha aliyegusana', 'Active': 'Wanaofuatiliwa', 'To visit / overdue': 'Wa kutembelewa / waliochelewa', 'Index case(s)': 'Mgonjwa/wagonjwa chanzo', 'Last exposure': 'Kugusana kwa mwisho', 'Day': 'Siku', 'Last visit': 'Ziara ya mwisho', 'OVERDUE': 'IMECHELEWA', 'due': 'leo', 'period ended': 'kipindi kimekwisha',
    'Residential address': 'Anwani ya makazi', 'Index case(s) (one or more IDs, comma-separated)': 'Mgonjwa chanzo (namba moja au zaidi, zitenganishwe kwa koma)', 'Nature of exposure': 'Aina ya kugusana', 'Date of last exposure': 'Tarehe ya kugusana kwa mwisho', 'Date identified': 'Tarehe ya kutambuliwa', 'Assigned tracing officer': 'Afisa wa ufuatiliaji aliyepangiwa',
    'Register contact': 'Andikisha', 'Last exposure date': 'Tarehe ya kugusana kwa mwisho', 'Index case': 'Mgonjwa chanzo', 'Index case not found: ': 'Mgonjwa chanzo hakupatikana: ', 'This contact already exists: ': 'Aliyegusana huyu tayari yupo: ', '. Add the index case(s) to this contact?': '. Ongeza mgonjwa chanzo kwa aliyegusana huyu?',
    'Add to existing contact': 'Ongeza kwa aliyepo', 'Create anyway': 'Unda hata hivyo', 'Contact registered: ': 'Aliyegusana ameandikishwa: ', 'Exposure': 'Kugusana', 'End of follow-up': 'Mwisho wa ufuatiliaji', 'day ': 'siku ', 'Officer': 'Afisa', 'Clinical assessment': 'Tathmini ya kitabibu', 'Change status': 'Badilisha hali',
    'Refer for clinical assessment': 'Peleka kwa tathmini ya kitabibu', 'Add a follow-up visit': 'Ongeza ziara ya ufuatiliaji', 'Date and time': 'Tarehe na saa', 'Temperature (°C)': 'Joto (°C)', 'Location of contact': 'Mahali alipotembelewa', 'Home': 'Nyumbani', 'By phone': 'Kwa simu', 'Other place': 'Mahali pengine', 'Action': 'Hatua',
    'Next visit': 'Ziara ijayo', 'New exposure / remarks': 'Kugusana kupya / maoni', 'Symptoms reported or observed:': 'Dalili zilizoripotiwa au kuonekana:', 'Save visit': 'Hifadhi ziara', 'Follow-up visits': 'Ziara za ufuatiliaji', 'Symptoms': 'Dalili', 'Status history': 'Historia ya hali',
    'Symptoms recorded: refer the contact for clinical assessment.': 'Dalili zimeandikwa: mpeleke aliyegusana kwa tathmini ya kitabibu.', 'Visit saved.': 'Ziara imehifadhiwa.', 'Contacts referred for clinical assessment': 'Waliogusana waliopelekwa kwa tathmini ya kitabibu', 'index ': 'chanzo ', 'Start triage': 'Anza uchunguzi',
    'Shared household': 'Nyumba moja', 'Cared for the patient': 'Alimhudumia mgonjwa', 'Contact with the body / funeral': 'Kugusa maiti / mazishi', 'Contact with body fluids': 'Kugusa majimaji ya mwili', 'Patient\'s linen / objects': 'Nguo / vitu vya mgonjwa', 'Same health facility': 'Kituo kimoja cha afya',
    'None (no symptoms)': 'Hakuna (hana dalili)', 'Advice given': 'Ushauri umetolewa', 'Referred for assessment': 'Amepelekwa kwa tathmini', 'Not found - revisit': 'Hakupatikana - atembelewe tena',
    'Contact identified': 'Aliyegusana ametambuliwa', 'Contact tracing initiated': 'Utafutaji umeanza', 'Contact successfully located': 'Amepatikana', 'Under follow-up': 'Anafuatiliwa', 'Follow-up completed': 'Ufuatiliaji umekamilika',
    'Referred for clinical assessment': 'Amepelekwa kwa tathmini ya kitabibu',
    // system-generated texts
    'Synthetic demonstration event': 'Tukio la kubuni la majaribio', 'Demo neighbourhood': 'Mtaa wa majaribio', 'Triage data checked': 'Data ya uchunguzi imehakikishwa', 'Routine report in order': 'Ripoti ya kawaida iko sawa',
    'Verification visit (synthetic)': 'Ziara ya uthibitisho (ya kubuni)', 'Field verification (synthetic)': 'Uthibitisho shambani (wa kubuni)', 'Burial (synthetic)': 'Mazishi (ya kubuni)', 'Cemetery / demo site': 'Makaburi / mahali pa majaribio',
    'Synthetic demonstration report': 'Ripoti ya kubuni ya majaribio', 'Demo landmark': 'Alama ya mahali ya majaribio', 'Demo address': 'Anwani ya majaribio', 'Transfer to holding unit': 'Uhamisho kwenda kituo cha kusubiri', 'Negative result': 'Matokeo hasi',
    'Died before sampling': 'Alifariki kabla ya kuchukuliwa sampuli', 'Routine care': 'Huduma ya kawaida', 'Transfer to treatment centre': 'Uhamisho kwenda kituo cha matibabu', 'Bulk verification': 'Uthibitisho wa pamoja', 'Attachment:': 'Kiambatisho:',
    'BDBV HIGH-RISK ALERT. Record ': 'TAHADHARI YA HATARI KUBWA BDBV. Faili ', '. Open the app for details. Reply OK to acknowledge.': '. Fungua programu kwa maelezo. Jibu OK kuthibitisha kupokea.',
    // sign-in
    'Restricted access': 'Ufikiaji wenye vikwazo', 'Sign in': 'Ingia', 'Language': 'Lugha', 'Looking for the server…': 'Inatafuta seva…', 'Username': 'Jina la mtumiaji', 'Password': 'Nenosiri',
    'Pilot: synthetic data only. Do not enter real patient data.': 'Majaribio: data ya kubuni tu. Usiingize data halisi za wagonjwa.',
    'Demonstration mode: no server is connected. Choose a demonstration account. In the deployed system each person signs in with their own password.': 'Hali ya majaribio: hakuna seva iliyounganishwa. Chagua akaunti ya majaribio. Katika mfumo halisi kila mtu anaingia kwa nenosiri lake mwenyewe.',
    'No account needed': 'Hakuna akaunti inayohitajika', 'An unexplained death, several sick people in one family, a risky burial? Anyone can report it, anonymously if you wish.': 'Kifo kisichoelezeka, wagonjwa kadhaa katika familia moja, mazishi ya hatari? Mtu yeyote anaweza kuripoti, bila kujitambulisha ukipenda.',
    'Make a report': 'Toa ripoti', 'Wrong username or password.': 'Jina la mtumiaji au nenosiri si sahihi.', 'Server unreachable. Try again.': 'Seva haipatikani. Jaribu tena.', 'Sign out': 'Toka',
    'Pilot server: synthetic data only. Do not enter real patient data.': 'Seva ya majaribio: data ya kubuni tu. Usiingize data halisi za wagonjwa.', ' (demo)': ' (majaribio)',
    // demo user names
    'Public (anonymous)': 'Umma (bila jina)', 'RECO-ARU1-001 (demo)': 'RECO-ARU1-001 (majaribio)', 'Demo nurse': 'Muuguzi wa majaribio', 'Demo clinician': 'Daktari wa majaribio', 'Demo surveillance officer': 'Afisa wa ufuatiliaji wa majaribio',
    'Demo lab technician': 'Fundi wa maabara wa majaribio', 'Demo facility head': 'Mkuu wa kituo wa majaribio', 'Demo HZ surveillance officer': 'Afisa wa ufuatiliaji wa eneo wa majaribio', 'Demo public health administrator': 'Msimamizi wa afya ya umma wa majaribio', 'Demo system administrator': 'Msimamizi wa mfumo wa majaribio', 'Classified as suspected case': 'Ameainishwa kama mgonjwa anayeshukiwa', 'Follow-up closed': 'Ufuatiliaji umefungwa'
  };
})();

// Accounts: sign-in tabs, account requests, forgotten and changed passwords (v0.4).
(function () {
  'use strict';
  Object.assign(window.BDBV_SW, {
    'Request an account': 'Omba akaunti',
    'Demonstration mode: no server is connected, so this request is not sent. On the deployed system it goes to the system administrator.': 'Hali ya majaribio: hakuna seva iliyounganishwa, kwa hiyo ombi hili halitumwi. Katika mfumo halisi linamfikia msimamizi wa mfumo.',
    'Your request is reviewed by the system administrator, who assigns your role and workplace. You can sign in once it is approved.': 'Ombi lako linakaguliwa na msimamizi wa mfumo, anayekupa jukumu na mahali pa kazi. Utaweza kuingia likishaidhinishwa.',
    'Full name': 'Jina kamili',
    'Phone or e-mail': 'Simu au barua pepe',
    'Role requested': 'Jukumu unaloomba',
    'Workplace / health zone': 'Mahali pa kazi / eneo la afya',
    'e.g. HC Aru 1, HZ Aru': 'mf. KA Aru 1, EA Aru',
    'Password (10+ characters, letters and digits)': 'Nenosiri (herufi 10 au zaidi, herufi na tarakimu)',
    'Confirm password': 'Thibitisha nenosiri',
    'Send request': 'Tuma ombi',
    'Forgot password': 'Umesahau nenosiri',
    'Enter your username and a way to reach you. The system administrator checks who you are and gives you a temporary password, which you change at your first sign-in.': 'Andika jina lako la mtumiaji na namna ya kukufikia. Msimamizi wa mfumo anathibitisha wewe ni nani na anakupa nenosiri la muda, ambalo utalibadilisha unapoingia mara ya kwanza.',
    'Send': 'Tuma',
    'Back': 'Rudi',
    'Forgot password?': 'Umesahau nenosiri?',
    'Demonstration mode: request not sent (no server).': 'Hali ya majaribio: ombi halikutumwa (hakuna seva).',
    'Request sent. The system administrator will review it; you can sign in once it is approved.': 'Ombi limetumwa. Msimamizi wa mfumo atalikagua; utaweza kuingia likishaidhinishwa.',
    'Request received. If this account exists, the system administrator will contact you with a temporary password.': 'Ombi limepokelewa. Ikiwa akaunti hii ipo, msimamizi wa mfumo atakuwasiliana nawe na nenosiri la muda.',
    'Account': 'Akaunti',
    'Change password': 'Badilisha nenosiri',
    'You are using a temporary password. Choose your own password to continue.': 'Unatumia nenosiri la muda. Chagua nenosiri lako mwenyewe ili kuendelea.',
    'Current password': 'Nenosiri la sasa',
    'New password (10+ characters, letters and digits)': 'Nenosiri jipya (herufi 10 au zaidi, herufi na tarakimu)',
    'Confirm new password': 'Thibitisha nenosiri jipya',
    'Cancel': 'Ghairi',
    'Password changed.': 'Nenosiri limebadilishwa.',
    'Your account request is waiting for the administrator\'s approval.': 'Ombi lako la akaunti linasubiri idhini ya msimamizi.',
    'This account request was refused. Contact the administrator.': 'Ombi hili la akaunti limekataliwa. Wasiliana na msimamizi.',
    'This account is disabled. Contact the administrator.': 'Akaunti hii imezimwa. Wasiliana na msimamizi.',
    'This username is already taken. Choose another one.': 'Jina hili la mtumiaji tayari linatumika. Chagua jingine.',
    'Username: 3 to 32 characters, lower-case letters, digits, dot, dash.': 'Jina la mtumiaji: herufi 3 hadi 32, herufi ndogo, tarakimu, nukta, kistari.',
    'Password: at least 10 characters.': 'Nenosiri: angalau herufi 10.',
    'The password must contain letters and digits.': 'Nenosiri lazima liwe na herufi na tarakimu.',
    'The password must not contain the username.': 'Nenosiri lisiwe na jina la mtumiaji.',
    'Choose a password different from the current one.': 'Chagua nenosiri tofauti na la sasa.',
    'Enter your name.': 'Andika jina lako.',
    'Enter a phone number or e-mail.': 'Andika namba ya simu au barua pepe.',
    'Choose a role.': 'Chagua jukumu.',
    'Too many attempts. Try again later.': 'Majaribio mengi mno. Jaribu tena baadaye.',
    'The two passwords do not match.': 'Manenosiri mawili hayalingani.',
    'English': 'English', 'Français': 'Français', 'Kiswahili': 'Kiswahili'
  });
})();
(function () {
  'use strict';
  Object.assign(window.BDBV_SW, {
    'Connecting to the server… A server that was asleep can take up to a minute to answer.': 'Inaunganisha na seva… Seva iliyokuwa imelala inaweza kuchukua hadi dakika moja kujibu.',
    'The server is not answering. Check the internet connection and try again.': 'Seva haijibu. Angalia muunganisho wa intaneti kisha ujaribu tena.',
    'Try again': 'Jaribu tena'
  });
})();
