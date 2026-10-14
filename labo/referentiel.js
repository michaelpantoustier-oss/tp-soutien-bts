/*
 * Catalogue des TP incontournables par filière, établi par la direction du
 * campus à partir des référentiels BTS Biologie médicale (RNCP40027) et BTS
 * Bioanalyses en laboratoire de contrôle (RNCP38884).
 *
 * Chaque TP porte :
 *  - codes : savoir-faire (SF), savoirs (T) ou compétences (C) du référentiel ;
 *  - motsCles : expression régulière qui repère le TP dans le texte des
 *    séquences des scénarios pédagogiques (titre, tronc commun, renforcement) ;
 *  - materiel : matériel type à préparer, rapproché de l'inventaire.
 * Le matériel type est indicatif : l'enseignant l'ajuste dans sa demande.
 */
var LaboReferentiel = {
  BIOMED: {
    intro: 'Microbiologie (REMIC / CA-SFM), hématologie, immunologie, biochimie, biologie moléculaire, ACP et prélèvements simulés.',
    domaines: [
      { nom: 'Microbiologie médicale (REMIC / CA-SFM)', tps: [
        { id: 'BM-MIC-1', intitule: 'Ensemencement et isolement sous PSM de type 2', codes: 'SF2.3.1',
          description: 'Isolement sur milieux sélectifs, d\'enrichissement et d\'orientation (milieux chromogènes) en conditions strictes d\'asepsie.',
          motsCles: 'ensemencement|isolement|chromog|milieux? (usuels|sélectifs|d.enrichissement)|\\bpsm\\b',
          materiel: ['Poste de sécurité microbiologique de type 2', 'Géloses sélectives et chromogènes', 'Bouillons d\'enrichissement', 'Anses / öses stériles', 'Boîtes de Petri', 'Souches de référence'] },
        { id: 'BM-MIC-2', intitule: 'Examens macroscopiques et lecture de milieux différentiels', codes: 'SF2.3.3',
          description: 'Étude des caractères culturaux des colonies, lecture de milieux différentiels.',
          motsCles: 'macroscopique|caractères culturaux|colonies|différentiels?|lecture des (boîtes|milieux)',
          materiel: ['Milieux différentiels (lactose, mannitol…)', 'Cultures de 24 h', 'Loupes / compte-colonies'] },
        { id: 'BM-MIC-3', intitule: 'États frais et colorations différentielles', codes: 'SF2.3.2 · T2.3',
          description: 'États frais, coloration de Gram et autres colorations pour l\'identification morphologique et tinctoriale de bactéries, levures et champignons filamenteux.',
          motsCles: 'état[s]? frais|\\bgram\\b|colorations? (de gram|différentielles?)|levures?|micromycète|fongique|mycolog',
          materiel: ['Kit coloration de Gram', 'Lames et lamelles', 'Microscopes', 'Huile à immersion', 'Bleu de lactophénol', 'Souches bactériennes et fongiques'] },
        { id: 'BM-MIC-4', intitule: 'Antibiogramme par diffusion en gélose (CA-SFM)', codes: 'SF2.3.3 · T2.3',
          description: 'Réalisation standardisée selon le CA-SFM, mesure des diamètres de zones d\'inhibition.',
          motsCles: 'antibiogramme|ca-sfm|disques?|diamètres?|résistance',
          materiel: ['Gélose Mueller-Hinton', 'Disques d\'antibiotiques', 'Distributeur de disques', 'Standard McFarland 0,5', 'Pied à coulisse ou réglet', 'Souches de contrôle'] },
        { id: 'BM-MIC-5', intitule: 'Microbiologie quantitative et ECBU', codes: 'SF2.3.2 · T2.3',
          description: 'Dénombrement de germes et d\'éléments figurés (seuils de positivité de l\'ECBU).',
          motsCles: 'ecbu|urinaire|dénombrement|leucocyturie|seuils? de positivité|kova|numération des éléments',
          materiel: ['Urines simulées', 'Cellules de numération (Kova, Malassez)', 'Bandelettes urinaires', 'Gélose CLED ou chromogène urinaire', 'Anses calibrées 1 et 10 µL'] }
      ] },
      { nom: 'Hématologie, cytologie et hémostase', tps: [
        { id: 'BM-HEM-1', intitule: 'Frottis sanguin, coloration MGG et formule leucocytaire', codes: 'SF2.3.2 · T2.3 · T2.6',
          description: 'Confection, coloration MGG, identification des cellules matures et immatures des lignées myéloïde et lymphoïde, recherche d\'anomalies et d\'atypies.',
          motsCles: 'frottis|\\bmgg\\b|may|formule leucocytaire|lignées?|cytologie sanguine|atypies?',
          materiel: ['Sang EDTA ou frottis pédagogiques', 'Lames dégraissées', 'Colorants May-Grünwald et Giemsa', 'Tampon pH 7,2', 'Microscopes', 'Huile à immersion', 'Atlas de cytologie'] },
        { id: 'BM-HEM-2', intitule: 'Numération cellulaire manuelle', codes: 'SF2.3.2 · T2.3',
          description: 'Comptage sur cellule hématimétrique.',
          motsCles: 'numération (globulaire|des (hématies|leucocytes|globules)|cellulaire|et formule)|hématimètre|malassez|thoma|hématimétrique',
          materiel: ['Cellules de Malassez ou Thoma', 'Liquide de dilution (Hayem, Lazarus)', 'Micropipettes et cônes', 'Microscopes', 'Compteur manuel'] },
        { id: 'BM-HEM-3', intitule: 'Hémostase chronométrique (TP/INR, TCA, tests de correction)', codes: 'SF2.4.1 · T2.3 · T2.6',
          description: 'Tests chronométriques manuels ou sur semi-automate, tests de correction pour anticoagulant circulant ou déficit en facteurs.',
          motsCles: 'hémostase|\\btca\\b|\\btq\\b|\\binr\\b|taux de prothrombine|chronométrique|anticoagulant circulant|tests? de correction|coagulation',
          materiel: ['Semi-automate d\'hémostase ou bain-marie 37 °C', 'Réactifs TQ (thromboplastine) et TCA', 'Plasmas de contrôle normal et pathologique', 'Plasma témoin pour correction', 'Cuvettes et billes', 'Chronomètres'] }
      ] },
      { nom: 'Immunologie et immuno-hématologie', tps: [
        { id: 'BM-IMM-1', intitule: 'Agglutination manuelle (groupage ABO-Rh, latex)', codes: 'SF2.3.4 · T2.3',
          description: 'Recherche et identification d\'antigènes ou d\'anticorps par agglutination directe ou réactifs particulaires.',
          motsCles: 'agglutin|groupage|\\babo\\b|rhésus|beth|simonin|latex|phénotyp',
          materiel: ['Sérums tests anti-A, anti-B, anti-AB, anti-D', 'Hématies tests A1 et B', 'Plaques d\'opaline ou cartes', 'Réactifs latex', 'Sangs de groupe connu'] },
        { id: 'BM-IMM-2', intitule: 'ELISA quantitatif sur lecteur de microplaques', codes: 'SF2.3.5 · T2.3',
          description: 'Dosage d\'antigènes ou d\'anticorps avec gamme d\'étalonnage, témoins de spécificité et d\'efficacité.',
          motsCles: 'elisa|immuno-?enzym|immunodosage|microplaques?',
          materiel: ['Kit ELISA', 'Microplaques 96 puits', 'Lecteur de microplaques', 'Micropipettes multicanaux', 'Laveur ou pissettes de tampon', 'Étuve 37 °C'] },
        { id: 'BM-IMM-3', intitule: 'Tests rapides d\'immunochromatographie', codes: 'SF2.3.4',
          description: 'Mise en œuvre et lecture de bandelettes ou cassettes.',
          motsCles: 'trod|immunochromato|tests? rapides?|cassettes?',
          materiel: ['Cassettes ou bandelettes de TROD', 'Contrôles positifs et négatifs', 'Minuteurs'] }
      ] },
      { nom: 'Biochimie clinique et séparations', tps: [
        { id: 'BM-BIO-1', intitule: 'Dosages colorimétriques en point final', codes: 'SF2.3.6 · T2.3',
          description: 'Dosages de substrats avec ou sans enzymes outils, gammes étalons, limites de linéarité et domaine de mesure.',
          motsCles: 'point final|colorimétr|gamme d.étalonnage|beer|glucose|urée|créatinine|cholest|biuret|protéines totales',
          materiel: ['Spectrophotomètre', 'Cuves', 'Coffrets de dosage (glucose, urée, créatinine…)', 'Étalons', 'Micropipettes et cônes', 'Tubes à hémolyse'] },
        { id: 'BM-BIO-2', intitule: 'Cinétiques enzymatiques (vitesse initiale, deux points)', codes: 'SF2.3.7 · T2.3',
          description: 'Dosage d\'enzymes sériques en continu ou en deux points sur spectrophotomètre thermostaté.',
          motsCles: 'cinétique|activité enzymatique|vitesse initiale|alat|asat|transaminases|\\bldh\\b|\\bpal\\b|deux points',
          materiel: ['Spectrophotomètre thermostaté', 'Coffrets ALAT, ASAT, PAL, LDH', 'Sérums de contrôle', 'Chronomètres', 'Cuves'] },
        { id: 'BM-BIO-3', intitule: 'Électrophorèse manuelle des protéines ou hémoglobines', codes: 'T2.3',
          description: 'Migration, révélation, corrélation électrophorégramme et densitogramme.',
          motsCles: 'électrophorèse|densitogramme|électrophorégramme|hémoglobines?',
          materiel: ['Cuve et générateur d\'électrophorèse', 'Gels d\'agarose ou bandes d\'acétate de cellulose', 'Tampon de migration', 'Colorant (noir amide, Ponceau)', 'Sérums normaux et pathologiques', 'Densitomètre ou scanner'] },
        { id: 'BM-BIO-4', intitule: 'Contrôle interne de qualité (Levey-Jennings, Westgard)', codes: 'SF2.1.3 · SF2.5.3 · T2.4',
          description: 'Contrôles haut et bas, cartes de Levey-Jennings, règles de Westgard, actions curatives.',
          motsCles: '\\bciq\\b|levey|westgard|contrôle (interne )?de qualité|cartes? de contrôle',
          materiel: ['Sérums de contrôle deux niveaux', 'Cartes de contrôle (tableur)', 'Coffrets de dosage en cours'] }
      ] },
      { nom: 'Biologie moléculaire', tps: [
        { id: 'BM-MOL-1', intitule: 'PCR en point final', codes: 'SF2.3.8 · T2.3',
          description: 'Pipetage en zone dédiée, préparation des mix, programmation du thermocycleur, témoins positifs et négatifs.',
          motsCles: '\\bpcr\\b|thermocycleur|amplification génique',
          materiel: ['Thermocycleur', 'Mix PCR et amorces', 'ADN témoin positif', 'Eau sans nucléase', 'Tubes PCR 0,2 mL', 'Cônes à filtre', 'Hotte ou zone dédiée'] },
        { id: 'BM-MOL-2', intitule: 'Électrophorèse des amplicons sur gel d\'agarose', codes: 'SF2.3.8',
          description: 'Contrôle et séparation des fragments amplifiés, visualisation UV ou lumière bleue.',
          motsCles: 'agarose|amplicons?|fragments amplifiés|transillumin|produits? (de )?pcr|révélation sur gel',
          materiel: ['Agarose', 'Tampon TAE ou TBE', 'Intercalant (SYBR Safe ou équivalent)', 'Marqueur de taille', 'Cuve et générateur', 'Transilluminateur'] }
      ] },
      { nom: 'Anatomie et cytologie pathologiques, gamètes', tps: [
        { id: 'BM-ACP-1', intitule: 'Technique histologique (coupe au microtome, coloration)', codes: 'SF2.2.3 · T2.6',
          description: 'Préparation et traitement pré-analytique de pièces, coupe au microtome, coloration de tissus.',
          motsCles: 'histolog|microtome|coupes?|anatomo|cytopatholog|\\bacp\\b|tissus?',
          materiel: ['Blocs en paraffine pédagogiques', 'Microtome et lames de rasoir', 'Bain d\'étalement', 'Colorants HES ou HE', 'Lames et lamelles', 'Milieu de montage'] },
        { id: 'BM-ACP-2', intitule: 'Spermiologie : frottis, morphologie et numération', codes: 'SF3.4.2 · T3.4',
          description: 'Frottis coloré de gamètes, morphologie selon David ou Krüger, numération.',
          motsCles: 'spermi|sperme|spermatozo|gamètes?|david|krüger|kruger|\\bamp\\b|paillettes',
          materiel: ['Paillettes de sperme bovin', 'Colorant de Papanicolaou ou Spermac', 'Cellules de numération', 'Bain-marie 37 °C', 'Microscopes'] }
      ] },
      { nom: 'Prélèvements en pratique simulée (BC5, U9)', tps: [
        { id: 'BM-PRE-1', intitule: 'Ponctions sanguines simulées', codes: 'SF5.3.2 · SF5.3.4 · SF5.3.6 · T5.1',
          description: 'Bras d\'entraînement (pli du coude, dos de la main, ponction capillaire), ordre des tubes selon les additifs, identitovigilance, étiquetage, AES.',
          motsCles: 'ponction|veineuse|prélèvement sanguin|bras|mannequin|capillaire|ordre des tubes|identitovigilance|\\baes\\b',
          materiel: ['Bras d\'entraînement', 'Aiguilles et corps de pompe', 'Tubes sous vide (citrate, héparine, EDTA, sec)', 'Garrots', 'Antiseptique et compresses', 'Collecteurs DASRI', 'Étiquettes'] },
        { id: 'BM-PRE-2', intitule: 'Prélèvements par écouvillonnage simulé', codes: 'SF5.3.2 · T5.1',
          description: 'Gestes nasopharyngés, oropharyngés, nasaux et salivaires selon les recommandations de la SFM.',
          motsCles: 'écouvillon|nasopharyng|oropharyng|salivaire|nasal',
          materiel: ['Écouvillons floqués', 'Milieux de transport', 'Têtes de simulation', 'EPI (masques, gants, lunettes)'] }
      ] }
    ]
  },
  BIOALC: {
    intro: 'Bloc 2 (U4) : réalisation des analyses dans le cadre d\'un contrôle qualité (C2.3 à C2.6), en lien avec le bloc 3 (optimisation de méthodes).',
    domaines: [
      { nom: 'Microbiologie (C2.4, T2.2)', tps: [
        { id: 'AC-MIC-1', intitule: 'Détection et isolement à partir de matrices', codes: 'C2.4 · T2.2',
          description: 'Isolement à partir de matrices agroalimentaires, cosmétiques, pharmaceutiques ou environnementales ; orientation microscopique et galeries d\'identification.',
          motsCles: 'isolement|détecter|détection|matrices?|galeries?|identifi|cosmétique',
          materiel: ['Milieux d\'enrichissement et sélectifs', 'Galeries d\'identification', 'Kit coloration de Gram', 'Microscopes', 'Échantillons de matrices (lait, eau, cosmétique)'] },
        { id: 'AC-MIC-2', intitule: 'Dénombrements (masse, surface, membrane, numération)', codes: 'C2.4 · T2.2',
          description: 'Dilutions en série, ensemencement en masse et en surface, filtration sur membrane, comptage direct, suivi de biomasse par turbidimétrie.',
          motsCles: 'dénombr|en masse|en surface|filtration sur membrane|turbidim|biomasse',
          materiel: ['Diluant (eau peptonée tamponnée)', 'Géloses PCA et sélectives', 'Rampe de filtration et membranes', 'Cellules de numération', 'Spectrophotomètre', 'Bain-marie 45 °C'] },
        { id: 'AC-MIC-3', intitule: 'Efficacité d\'antimicrobiens et barèmes thermiques', codes: 'C2.4',
          description: 'Efficacité d\'un antiseptique ou désinfectant, barèmes de destruction thermique, stérilisation à froid.',
          motsCles: 'antisept|désinfect|antimicrob|destruction thermique|barèmes?|stérilisation|pasteurisation|bactéricid',
          materiel: ['Désinfectants à tester', 'Neutralisant', 'Souches de référence', 'Bain-marie thermostaté', 'Chronomètres'] },
        { id: 'AC-MIC-4', intitule: 'Culture en bioréacteur de paillasse', codes: 'C2.4',
          description: 'Suivi en ligne et hors ligne (pH, pO2, température), biomasse et production de métabolites.',
          motsCles: 'bioréacteur|fermente|fermentaire|bioproduction|\\bpo2\\b',
          materiel: ['Bioréacteur de paillasse', 'Sondes pH et pO2', 'Milieu de culture', 'Souche de production', 'Spectrophotomètre'] },
        { id: 'AC-MIC-5', intitule: 'Contrôles environnementaux (surfaces, air)', codes: 'C2.4',
          description: 'Prélèvements de surfaces (écouvillons, boîtes contact) et aérobiocontamination (biocollecteur d\'air).',
          motsCles: 'surfaces?|environnement|boîtes? contact|biocollecteur|aérobio|\\bair\\b',
          materiel: ['Boîtes contact', 'Écouvillons', 'Biocollecteur d\'air', 'Géloses TSA et Sabouraud'] }
      ] },
      { nom: 'Biochimie analytique et physico-chimie (C2.3, T2.2)', tps: [
        { id: 'AC-BIO-1', intitule: 'Mesures physico-chimiques de base', codes: 'C2.3 · T2.2',
          description: 'pH-métrie, conductimétrie, réfractométrie, polarimétrie, viscosimétrie, aw, matière sèche, cendres, Kjeldahl.',
          motsCles: 'ph-?m|conductim|réfractom|polarim|viscosi|\\baw\\b|activité de l.eau|matière sèche|extrait sec|cendres|kjeldahl|physico-chimiques?',
          materiel: ['pH-mètres et tampons', 'Conductimètre', 'Réfractomètre', 'Polarimètre', 'Viscosimètre', 'Balance analytique', 'Étuve et four à moufle', 'Minéralisateur Kjeldahl'] },
        { id: 'AC-BIO-2', intitule: 'Chromatographie (CLHP, CPG, échange d\'ions)', codes: 'C2.3 · T2.2',
          description: 'Préparation des échantillons, réglage de la chaîne, temps de rétention, intégration des pics.',
          motsCles: 'chromatograph|clhp|hplc|\\bcpg\\b|rétention|échangeuses? d.ions',
          materiel: ['Chaîne CLHP ou CPG', 'Colonnes', 'Solvants qualité HPLC', 'Étalons', 'Filtres seringue', 'Résines échangeuses d\'ions'] },
        { id: 'AC-BIO-3', intitule: 'Électrophorèse des protéines (agarose, SDS-PAGE)', codes: 'C2.3 · T2.2',
          description: 'Coulée, migration, révélation et profil densitométrique.',
          motsCles: 'électrophorèse|sds|polyacrylamide|page\\b|densitom',
          materiel: ['Cuve verticale et générateur', 'Gels ou réactifs de coulée', 'Marqueur de masse moléculaire', 'Bleu de Coomassie', 'Échantillons protéiques'] },
        { id: 'AC-BIO-4', intitule: 'Dosages spectrophotométriques, cinétiques et ELISA', codes: 'C2.3 · T2.2',
          description: 'Gammes d\'étalonnage externe, ajouts dosés, mesure d\'activité catalytique, ELISA sandwich ou compétitif en plaque 96 puits.',
          motsCles: 'dosage|spectrophotom|gamme|ajouts dosés|cinétique|activité|elisa|biuret|enzymat',
          materiel: ['Spectrophotomètre', 'Cuves', 'Réactifs de dosage', 'Kit ELISA', 'Lecteur de microplaques', 'Micropipettes et cônes'] }
      ] },
      { nom: 'Biologie moléculaire des acides nucléiques (C2.5, T2.2)', tps: [
        { id: 'AC-MOL-1', intitule: 'Extraction et dosage des acides nucléiques', codes: 'C2.5 · T2.2',
          description: 'Extraction d\'ADN ou d\'ARN sur colonnes, pureté et concentration (A260/A280).',
          motsCles: 'extraction|purification|acides nucléiques|\\badn\\b|\\barn\\b|a260',
          materiel: ['Kits d\'extraction sur colonnes', 'Microcentrifugeuse', 'Spectrophotomètre UV et microcuves', 'Éthanol', 'Tubes 1,5 mL'] },
        { id: 'AC-MOL-2', intitule: 'PCR et qPCR', codes: 'C2.5 · T2.2',
          description: 'Mélanges réactionnels en marche en avant, thermocycleur classique et en temps réel.',
          motsCles: '\\bpcr\\b|qpcr|temps réel|amplification|thermocycleur|marche en avant',
          materiel: ['Thermocycleur', 'Thermocycleur temps réel', 'Mix PCR et qPCR', 'Amorces et sondes', 'Plaques ou tubes PCR', 'Cônes à filtre'] },
        { id: 'AC-MOL-3', intitule: 'Caractérisation : gel d\'agarose et restriction', codes: 'C2.5 · T2.2',
          description: 'Électrophorèse avec marqueurs de taille, digestion par enzymes de restriction.',
          motsCles: 'agarose|restriction|amplicons?|marqueurs? de taille',
          materiel: ['Agarose et tampon', 'Marqueur de taille', 'Enzymes de restriction et tampons', 'Transilluminateur', 'Intercalant'] }
      ] },
      { nom: 'Biologie cellulaire (C2.6, T2.2)', tps: [
        { id: 'AC-CEL-1', intitule: 'Culture de cellules eucaryotes et repiquage', codes: 'C2.6 · T2.2',
          description: 'Travail aseptique sous PSM II, entretien de lignées (trypsination, étuve CO2), culture in vitro de tissus végétaux, congélation et décongélation.',
          motsCles: 'culture cellulaire|lignées? cellulaires?|trypsin|\\bco2\\b|eucaryote|végéta|\\bcals?\\b|congélation',
          materiel: ['PSM II dédié', 'Étuve à CO2', 'Milieux de culture cellulaire et sérum', 'Trypsine-EDTA', 'Flasques et plaques', 'Pipettes sérologiques', 'Microscope inversé'] },
        { id: 'AC-CEL-2', intitule: 'Numération et viabilité cellulaires', codes: 'C2.6 · T2.2',
          description: 'Observation au microscope inversé, numération sur cellule hématimétrique, bleu trypan ou tests colorimétriques de viabilité.',
          motsCles: 'numération|viabilité|bleu trypan|malassez|bürker|cytotox|confluence',
          materiel: ['Cellules de Malassez ou Bürker', 'Bleu trypan', 'Microscopes', 'Réactif MTT ou équivalent', 'Lecteur de microplaques'] }
      ] },
      { nom: 'Métrologie, contrôle qualité et données (C1.2, C2.7, C2.8)', tps: [
        { id: 'AC-QUA-1', intitule: 'Contrôle et suivi métrologique des équipements', codes: 'C1.2 · C2.7',
          description: 'Vérification de pipettes, étalonnage de balances, qualification de température d\'enceintes.',
          motsCles: 'métrolog|vérification|étalonnage|gravimétr|qualification|enceintes?|balances?|pipettes?',
          materiel: ['Balance analytique', 'Masses étalons', 'Thermomètres ou enregistreurs étalonnés', 'Micropipettes à vérifier'] },
        { id: 'AC-QUA-2', intitule: 'Validation de série et incertitudes', codes: 'C2.7 · C2.8',
          description: 'Matériaux de référence, cartes de Levey-Jennings, incertitudes de mesure (ISO 5725, ISO 17025).',
          motsCles: 'levey|validation|incertitude|matériaux de référence|carte de contrôle|iso 5725|17025|fidélité|justesse',
          materiel: ['Matériaux de référence', 'Étalons-contrôles', 'Tableur de cartes de contrôle'] }
      ] }
    ]
  }
};

if (typeof module !== 'undefined') module.exports = LaboReferentiel;
