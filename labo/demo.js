/*
 * Hôte navigateur de LaboCore : formatage des dates et mode démonstration
 * (stockage localStorage, données entièrement fictives).
 */
var LaboNav = (function () {
  var TZ = 'Europe/Paris';
  var CLE = 'labo-demo-v3';

  function parties(d) {
    var f = new Intl.DateTimeFormat('fr-FR', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    });
    var p = {};
    f.formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    return p;
  }

  function format(d, motif) {
    var p = parties(d);
    return motif.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day)
      .replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second);
  }

  function parseLocal(dateStr, hhmm) {
    var y = +dateStr.slice(0, 4), m = +dateStr.slice(5, 7), j = +dateStr.slice(8, 10);
    var h = hhmm.split(':');
    var naif = Date.UTC(y, m - 1, j, +h[0], +h[1]);
    var p = parties(new Date(naif));
    var vu = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    return new Date(naif - (vu - naif));
  }

  function aleatoire(n) {
    var s = '';
    var b = new Uint8Array(n);
    (typeof crypto !== 'undefined' && crypto.getRandomValues ? crypto.getRandomValues(b) : b.forEach(function (x, i) { b[i] = Math.random() * 256; }));
    for (var i = 0; i < n; i++) s += '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'[b[i] % 34];
    return s;
  }


  var memoire = null;
  function charger() { try { return JSON.parse(localStorage.getItem(CLE)) || null; } catch (e) { return null; } }
  function sauver() { try { localStorage.setItem(CLE, JSON.stringify(memoire)); } catch (e) { /* démo en mémoire seulement */ } }
  function base() {
    if (!memoire) memoire = charger() || {};
    Object.keys(LaboCore.TABLES).forEach(function (t) { if (!memoire[t]) memoire[t] = []; });
    if (!memoire._cache) memoire._cache = {};
    return memoire;
  }

  var env = {
    now: function () { return new Date(); },
    format: format,
    parseLocal: parseLocal,
    random: aleatoire,
    cache: {
      get: function (k) { var v = base()._cache[k]; return v && v.exp > Date.now() ? v.v : null; },
      put: function (k, v, s) { base()._cache[k] = { v: v, exp: Date.now() + s * 1000 }; sauver(); },
      remove: function (k) { delete base()._cache[k]; sauver(); }
    },
    notify: null,
    pilotage: null
  };

  function store() {
    base();
    function copie(o) { return JSON.parse(JSON.stringify(o)); }
    return {
      all: function (t) { return copie(memoire[t]); },
      get: function (t, id) { var r = memoire[t].filter(function (x) { return String(x.id) === String(id); })[0]; return r ? copie(r) : null; },
      insert: function (t, o) { memoire[t].push(copie(o)); sauver(); },
      update: function (t, id, patch) {
        var r = memoire[t].filter(function (x) { return String(x.id) === String(id); })[0];
        if (!r) throw new Error('Ligne introuvable');
        Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
        sauver();
      }
    };
  }

  function decaler(j) { return format(new Date(Date.now() + j * 86400000), 'yyyy-MM-dd'); }

  var COMPTES = [
    ['T1', 'Technicienne A', 'technicienne.a@demo.local', 'technicienne', '', '', '30'],
    ['T2', 'Technicienne B', 'technicienne.b@demo.local', 'technicienne', '', '', '30'],
    ['L1', 'Aide-laborantine C', 'aide.c@demo.local', 'aide_laborantine', '', '', '20'],
    ['E1', 'Enseignant BIOMED microbiologie', 'prof.biomed@demo.local', 'enseignant', 'BIOMED', 'Microbiologie', ''],
    ['E2', 'Enseignante BIOALC biochimie', 'prof.bioalc@demo.local', 'enseignant', 'BIOALC', 'Biochimie', ''],
    ['R1', 'Prof référent', 'referent@demo.local', 'prof_referent', '', '', ''],
    ['C1', 'Coordination pédagogique', 'coordination@demo.local', 'coordinateur', '', '', ''],
    ['D1', 'Directeur du campus', 'direction@demo.local', 'directeur', '', '', '']
  ];

  function amorcer(core) {
    var s = store();
    if (s.all('Utilisateurs').length) return;
    COMPTES.forEach(function (c) {
      s.insert('Utilisateurs', { id: c[0], nom: c[1], email: c[2], role: c[3], filiere: c[4], disciplines: c[5], taux_horaire: c[6], actif: 'oui' });
    });
    var emails = {};
    COMPTES.forEach(function (c) { emails[c[0]] = c[2]; });
    function q(id, action, data) {
      var r = core.handle({ action: action, data: data }, { email: emails[id] });
      if (!r.ok && typeof console !== 'undefined') console.warn('démo', action, r.error);
      return r.data;
    }

    // Programme fictif inspiré des intitulés de référentiel (pas d'extrait du scénario réel).
    [
      ['P1', 'BIOMED', '1A', 'Biochimie', 'BC2', 'S3-5', decaler(-3), decaler(25), 'Spectrophotométrie et gamme d\'étalonnage', 'Gamme d\'étalonnage des protéines totales (biuret), dosage d\'inconnus', 'Recherche de la limite de linéarité', 'Spectrophotomètre | Cuves | Réactif de biuret | Micropipettes et cônes'],
      ['P2', 'BIOMED', '1A', 'Microbiologie', 'BC2', 'S4-6', decaler(4), decaler(30), 'Examen microscopique et coloration de Gram', 'État frais et coloration de Gram sur souches non pathogènes', 'Lecture de lames et identification présomptive', 'Microscopes | Lames et lamelles | Kit coloration de Gram | Huile à immersion | Anses / öses'],
      ['P3', 'BIOMED', '1A', 'HAI', 'BC2', 'S5-7', decaler(10), decaler(38), 'Frottis sanguin et formule leucocytaire', 'Réalisation et coloration MGG de frottis', 'Formule leucocytaire sur lames commentées', 'Lames et lamelles | Colorant MGG | Microscopes | Huile à immersion'],
      ['P4', 'BIOALC', '1A', 'Biochimie', 'BC02', 'S5-11', decaler(1), decaler(45), 'Paramètres physico-chimiques d\'un produit', 'Mesures de pH, conductivité et extrait sec sur eau de process et lait', 'Exploitation des mesures et conformité', 'pH-mètre | Conductimètre | Balance analytique | Étuve | Verrerie jaugée'],
      ['P5', 'BIOALC', '1A', 'Microbiologie', 'BC02', 'S6-9', decaler(8), decaler(40), 'Dénombrement de la flore d\'un produit alimentaire', 'Ensemencement en masse et dénombrement sur PCA', 'Calcul et expression des résultats', 'Gélose PCA | Boîtes de Petri | Eau peptonée | Bain-marie | Étuve'],
      ['P6', 'BIOALC', '1A', 'Biologie cellulaire', 'BC02', 'S7-10', decaler(15), decaler(50), 'Numération cellulaire et viabilité', 'Numération sur cellule de Malassez et test au bleu trypan', 'Comparaison de méthodes de numération', 'Cellule de Malassez | Bleu trypan | Microscopes | Micropipettes et cônes']
    ].forEach(function (p) {
      s.insert('Programme', { id: p[0], filiere: p[1], annee: p[2], matiere: p[3], bloc: p[4], semaines: p[5], debut: p[6], fin: p[7], titre: p[8], tp: p[9], renforcement: p[10], materiel: p[11] });
    });

    [
      ['Fournisseur verrerie (démo)', 'Laboratoire', 'Verrerie | Petit matériel | Consommable', '', '', '', 'Exemple fictif'],
      ['Fournisseur microbiologie (démo)', 'Laboratoire', 'Milieu de culture | Petit matériel', '', '', '', 'Exemple fictif'],
      ['Fournisseur réactifs (démo)', 'Laboratoire', 'Réactif / coffret', '', '', '', 'Exemple fictif'],
      ['Fournisseur équipements (démo)', 'Laboratoire', 'Équipement', '', '', '', 'Exemple fictif']
    ].forEach(function (f) { s.insert('Fournisseurs', { nom: f[0], domaine: f[1], categories: f[2], contact: f[3], email: f[4], telephone: f[5], notes: f[6] }); });

    var art = {};
    [
      ['biuret', 'BIOMED', 'Réactif / coffret', 'Réactif de biuret', 'REF-DEMO-01', 'Fournisseur réactifs (démo)', 2, 'flacon', 2, decaler(400)],
      ['gram', 'Commun', 'Réactif / coffret', 'Kit coloration de Gram', 'REF-DEMO-02', 'Fournisseur microbiologie (démo)', 1, 'kit', 1, decaler(200)],
      ['mgg', 'BIOMED', 'Réactif / coffret', 'Colorant MGG', 'REF-DEMO-03', 'Fournisseur réactifs (démo)', 3, 'flacon', 1, decaler(20)],
      ['cones', 'Commun', 'Consommable', 'Cônes 200 µL', 'REF-DEMO-04', 'Fournisseur verrerie (démo)', 6, 'sachet de 1000', 2, ''],
      ['lames', 'Commun', 'Consommable', 'Lames et lamelles', 'REF-DEMO-05', 'Fournisseur verrerie (démo)', 8, 'boîte', 3, ''],
      ['pca', 'BIOALC', 'Milieu de culture', 'Gélose PCA déshydratée', 'REF-DEMO-06', 'Fournisseur microbiologie (démo)', 0, 'pot 500 g', 1, decaler(300)],
      ['petri', 'Commun', 'Consommable', 'Boîtes de Petri stériles', 'REF-DEMO-07', 'Fournisseur verrerie (démo)', 4, 'carton de 500', 2, ''],
      ['huile', 'Commun', 'Consommable', 'Huile à immersion', 'REF-DEMO-08', 'Fournisseur équipements (démo)', 1, 'flacon', 1, '']
    ].forEach(function (a) {
      art[a[0]] = q('T1', 'article', { filiere: a[1], categorie: a[2], designation: a[3], reference: a[4], fournisseur: a[5], quantite: a[6], unite: a[7], seuil: a[8], peremption: a[9], emplacement: 'Réserve' }).id;
    });

    var d1 = q('E1', 'demande', { date_tp: decaler(2), creneau: LaboCore.CONFIG.creneaux[1], labo: 'Labo Gerty Cori', classe: 'BM1', discipline: 'Microbiologie', competence: 'RNCP40027 BC2 – Analyses médicales les plus courantes', sequence_id: 'P2', titre: 'Réaliser une coloration de Gram et l\'interpréter', effectif: '15', besoin: 'Souches non pathogènes en bouillon, kit Gram, lames, microscopes, huile à immersion' });
    q('E2', 'demande', { date_tp: decaler(0), creneau: LaboCore.CONFIG.creneaux[3], labo: 'Labo Fleming', classe: 'BIOALC1', discipline: 'Biochimie', competence: 'RNCP38884 BC02 – Réalisation des analyses dans le cadre d\'un contrôle qualité', sequence_id: 'P4', titre: 'Mesurer le pH et la conductivité d\'une eau de process', effectif: '12', besoin: 'pH-mètres étalonnés, solutions tampons pH 4/7/10, conductimètres, échantillons d\'eau' });
    q('E2', 'demande', { date_tp: decaler(20), creneau: LaboCore.CONFIG.creneaux[2], labo: 'Labo Marie Curie', classe: 'BIOALC1', discipline: 'Microbiologie', competence: '', sequence_id: 'P5', titre: 'Dénombrer la flore aérobie mésophile d\'un lait', effectif: '12', besoin: 'Gélose PCA, boîtes de Petri, eau peptonée tamponnée, bain-marie 45 °C' });
    q('T1', 'majDemande', { id: d1.id, prendre: true });
    q('T1', 'message', { demande_id: d1.id, texte: 'Il ne reste qu\'un kit de Gram : suffisant pour 15 élèves en binômes ?' });
    q('E1', 'message', { demande_id: d1.id, texte: 'Oui, en binômes ça passe.' });

    var missions = LaboCore.CONFIG.missions;
    [[-9, '08:00', '12:30', 'T1'], [-8, '13:30', '18:00', 'T1'], [-7, '08:15', '12:00', 'T2'], [-3, '09:00', '17:30', 'T2'], [-2, '08:00', '11:45', 'T1'], [-2, '13:00', '16:00', 'L1']]
      .forEach(function (x, i) {
        var r = q(x[3], 'saisieManuelle', { date: decaler(x[0]), debut: x[1], fin: x[2], labo: LaboCore.CONFIG.labos[i % 4], missions: [missions[i % 2], missions[2]], motif: 'Reprise de l\'émargement papier (démo)' });
        if (r && i < 3) q('R1', 'validerSession', { id: r.id, decision: 'validee' });
      });

    q('T2', 'rangement', { labo: 'Labo Gerty Cori', controles: { 'Pipettes verre': 'ok', 'Becs Bunsen': 'ok', 'DASRI': 'nc', 'Microscopes': 'ok' }, remarques: 'Collecteur DASRI plein, pas de collecteur de rechange.' });
    q('T1', 'incident', { labo: 'Labo Robert Koch', categorie: 'Équipement en panne', gravite: 'Bloquant', description: 'Spectrophotomètre n° 2 : la lampe ne s\'allume plus.' });
    q('T2', 'mouvement', { article_id: art.cones, delta: -1, motif: 'Consommation TP' });

    q('T2', 'commande', { filiere: 'BIOALC', designation: 'Gélose PCA déshydratée 500 g', reference: 'REF-DEMO-06', quantite: 2, prix_unitaire_ttc: 85, fournisseur: 'Fournisseur microbiologie (démo)', justification: 'TP dénombrement flore aérobie mésophile BIOALC1 (séquence P5) : stock à 0.', article_id: art.pca, sequence_id: 'P5' });
    var c2 = q('T1', 'commande', { filiere: 'BIOMED', designation: 'Colorant MGG 1 L', quantite: 2, prix_unitaire_ttc: 40, fournisseur: 'Fournisseur réactifs (démo)', justification: 'Frottis sanguins BM1 (séquence P3), lot actuel proche de la péremption.', article_id: art.mgg, sequence_id: 'P3' });
    if (c2) q('R1', 'majCommande', { id: c2.id, statut: 'approuvee' });
  }

  function reinitialiser() {
    memoire = null;
    try { localStorage.removeItem(CLE); } catch (e) { /* rien */ }
  }

  // La démonstration tourne sur des dates relatives : son suivi démarre il y a 10 jours.
  LaboCore.CONFIG.debutSuivi = decaler(-10);

  return { env: env, store: store, amorcer: amorcer, reinitialiser: reinitialiser, format: format, comptes: COMPTES };
})();
