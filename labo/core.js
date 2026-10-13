/*
 * Suivi labo Aurlom BTS+ — logique métier commune.
 *
 * Ce fichier tourne à deux endroits sans modification :
 *  - dans le navigateur (mode démonstration, données en localStorage) ;
 *  - dans Google Apps Script (fichier Core.gs, données dans Google Sheets).
 * Il ne dépend que de `store` (tables) et `env` (heure, hachage, sessions,
 * e-mails, classeur de pilotage des dépenses) fournis par l'hôte.
 *
 * Toutes les règles d'accès sont appliquées ici, côté serveur : l'interface
 * ne reçoit jamais une donnée que le rôle connecté n'a pas le droit de voir.
 */
var LaboCore = (function () {

  // ---------------------------------------------------------------------------
  // Référentiels (aucune donnée interne ici : ce fichier est public).
  // ---------------------------------------------------------------------------
  var CONFIG = {
    fuseau: 'Europe/Paris',
    delaiPrepaJours: 15,
    alerteSessionHeures: 11,
    seuilTroisDevisTTC: 1000, // à ajuster : au-delà, trois devis concurrents obligatoires
    alertePeremptionJours: 30,
    dureeSessionJours: 7,
    essaisMax: 5,
    blocageMinutes: 15,
    labos: ['Labo Fleming', 'Labo Robert Koch', 'Labo Gerty Cori', 'Labo Marie Curie'],
    creneaux: ['C1 · 9h00 – 10h00', 'C2 · 10h15 – 11h45', 'C3 · 12h00 – 13h30', 'C4 · 14h30 – 16h00', 'C5 · 16h15 – 17h45'],
    filieres: {
      BIOMED: {
        libelle: 'BTS Biologie médicale', court: 'BIOMED', rncp: 'RNCP40027', classes: ['BM1', 'BM2'],
        disciplines: ['Microbiologie', 'Biochimie', 'HAI (hématologie, anatomopathologie, immunologie)'],
        blocs: [
          'BC1 – Démarche qualité et organisation opérationnelle du laboratoire',
          'BC2 – Analyses médicales les plus courantes',
          'BC3 – Amélioration des méthodes d\'analyse et pratiques à visée thérapeutique',
          'BC4 – Communication et projet',
          'BC5 – Prélèvements'
        ]
      },
      BIOALC: {
        libelle: 'BTS Bioanalyses en laboratoire de contrôle', court: 'BIOALC', rncp: 'RNCP38884', classes: ['BIOALC1', 'BIOALC2'],
        disciplines: ['Microbiologie', 'Biochimie', 'Biologie cellulaire'],
        blocs: [
          'BC01 – Gestion opérationnelle et documentaire du laboratoire',
          'BC02 – Réalisation des analyses dans le cadre d\'un contrôle qualité',
          'BC03 – Expertise pour l\'optimisation de méthodes de bioanalyse',
          'BC04 – Relation professionnelle au laboratoire'
        ]
      }
    },
    roles: {
      technicienne: 'Technicienne de laboratoire',
      aide_laborantine: 'Aide-laborantine',
      enseignant: 'Enseignant·e',
      prof_referent: 'Prof référent',
      coordinateur: 'Coordinateur pédagogique',
      directeur: 'Directeur du campus'
    },
    missions: [
      'Préparation de TP', 'Assistance pendant le TP', 'Rangement et nettoyage',
      'Inventaire / réception de commande', 'Préparation de milieux / réactifs',
      'Autre (préciser en commentaire)'
    ],
    controlesRangement: [
      'Pipettes verre', 'Becs Bunsen', 'Écouvillons', 'Tubes', 'Pinces / öses', 'Lames',
      'Microscopes', 'DASRI', 'Verres à pied remplis', 'Portoirs remplis', 'Cuves',
      'Béchers / fioles jaugées', 'Paillasses désinfectées'
    ],
    categoriesIncident: [
      'Équipement en panne', 'Casse / matériel manquant', 'Stock bas ou rupture',
      'Réactif périmé', 'Hygiène / sécurité', 'Rangement non conforme', 'Autre'
    ],
    gravites: ['Faible', 'Gênant', 'Bloquant'],
    categoriesArticle: ['Réactif / coffret', 'Milieu de culture', 'Souche / échantillon pédagogique', 'Consommable', 'Verrerie', 'Petit matériel', 'Équipement', 'EPI / hygiène'],
    motifsMouvement: ['Consommation TP', 'Réception de commande', 'Correction d\'inventaire', 'Casse / perte', 'Péremption (mise au rebut)']
  };

  // Droits par action.
  var DROITS = {
    badge: ['technicienne', 'aide_laborantine'],
    voirEquipe: ['prof_referent', 'coordinateur', 'directeur'],
    validerPresence: ['prof_referent', 'directeur'],
    facturation: ['directeur'],
    creerDemandeTP: ['enseignant', 'prof_referent', 'coordinateur', 'directeur'],
    preparerTP: ['technicienne', 'aide_laborantine'],
    piloterTP: ['prof_referent', 'coordinateur', 'directeur'],
    rangement: ['technicienne', 'aide_laborantine', 'prof_referent', 'directeur'],
    traiterIncident: ['technicienne', 'aide_laborantine', 'prof_referent', 'coordinateur', 'directeur'],
    gererInventaire: ['technicienne', 'aide_laborantine', 'prof_referent', 'directeur'],
    proposerCommande: ['technicienne', 'aide_laborantine', 'enseignant', 'prof_referent', 'directeur'],
    approuverCommande: ['prof_referent', 'directeur'],
    suivreCommande: ['technicienne', 'aide_laborantine', 'prof_referent', 'directeur']
  };

  var TABLES = {
    Utilisateurs: ['id', 'nom', 'email', 'role', 'filiere', 'disciplines', 'pin', 'pin_hash', 'taux_horaire', 'actif'],
    Sessions: ['id', 'user_id', 'user_nom', 'date', 'arrivee', 'depart', 'duree_min', 'labo',
      'missions', 'demandes_ids', 'commentaire', 'source', 'corrections', 'statut',
      'valide_par', 'valide_le', 'motif_validation'],
    Rangements: ['id', 'horodatage', 'date', 'user_id', 'user_nom', 'labo', 'demande_id',
      'controles', 'nb_non_conformes', 'remarques'],
    Incidents: ['id', 'horodatage', 'date', 'user_id', 'user_nom', 'role', 'labo', 'categorie',
      'gravite', 'description', 'statut', 'traite_par', 'resolution', 'resolu_le'],
    Demandes: ['id', 'cree_le', 'prof_id', 'prof_nom', 'filiere', 'date_tp', 'creneau', 'labo', 'classe',
      'discipline', 'competence', 'sequence_id', 'titre', 'besoin', 'effectif', 'delai_jours',
      'prepa_id', 'prepa_nom', 'statut', 'maj_le'],
    Messages: ['id', 'horodatage', 'demande_id', 'user_id', 'user_nom', 'role', 'texte'],
    Articles: ['id', 'filiere', 'categorie', 'designation', 'reference', 'fournisseur', 'quantite', 'unite',
      'seuil', 'peremption', 'emplacement', 'notes', 'maj_le', 'maj_par', 'actif'],
    Mouvements: ['id', 'horodatage', 'article_id', 'designation', 'delta', 'quantite_apres', 'motif',
      'demande_tp_id', 'user_id', 'user_nom'],
    Commandes: ['id', 'cree_le', 'user_id', 'user_nom', 'filiere', 'designation', 'reference', 'quantite',
      'prix_unitaire_ttc', 'total_ttc', 'fournisseur', 'lien', 'justification', 'demande_tp_id', 'sequence_id',
      'article_id', 'devis', 'statut', 'approuve_par', 'approuve_le', 'motif_refus', 'pilotage_id', 'maj_le'],
    Fournisseurs: ['nom', 'domaine', 'categories', 'contact', 'email', 'telephone', 'notes'],
    Programme: ['id', 'filiere', 'annee', 'matiere', 'bloc', 'semaines', 'debut', 'fin', 'titre', 'tp', 'renforcement', 'materiel'],
    Journal: ['horodatage', 'user_id', 'user_nom', 'action', 'cible', 'detail']
  };

  var STATUTS_DEMANDE = { demandee: 'demandée', prise_en_charge: 'prise en charge', prete: 'prête', realisee: 'réalisée', annulee: 'annulée' };
  var STATUTS_COMMANDE = { soumise: 'soumise', approuvee: 'approuvée', refusee: 'refusée', commandee: 'commandée', livree: 'livrée', annulee: 'annulée' };

  function erreur(msg) { var e = new Error(msg); e.metier = true; return e; }

  // Le directeur a tous les droits, sauf ceux qui n'ont de sens que pour l'équipe du labo.
  function peut(user, droit) {
    if (user.role === 'directeur') return droit !== 'badge' && droit !== 'preparerTP';
    return DROITS[droit].indexOf(user.role) !== -1;
  }
  function exiger(user, droit) { if (!peut(user, droit)) throw erreur('Action non autorisée pour ton rôle.'); }

  function filiereDeClasse(classe) {
    for (var k in CONFIG.filieres) if (CONFIG.filieres[k].classes.indexOf(classe) !== -1) return k;
    return '';
  }

  function joursEntre(a, b) {
    var x = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
    var y = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
    return Math.round((y - x) / 86400000);
  }

  function texte(v, max) {
    var s = (v === undefined || v === null) ? '' : String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
    return max ? s.slice(0, max) : s;
  }
  function liste(v) { return Array.isArray(v) ? v.map(function (x) { return texte(x, 200); }).filter(Boolean) : []; }
  function nombre(v) { var n = Number(String(v === undefined || v === null ? '' : v).replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : NaN; }
  function arrondi(n) { return Math.round(n * 100) / 100; }
  function ymd(v) { return /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : ''; }

  function create(store, env) {

    function now() { return env.now(); }
    function iso(d) { return d.toISOString(); }
    function jour(d) { return env.format(d, 'yyyy-MM-dd'); }
    function nouvelId(p) { return p + '-' + now().getTime().toString(36).toUpperCase() + env.random(4); }

    function journal(user, action, cible, detail) {
      store.insert('Journal', {
        horodatage: iso(now()), user_id: user ? user.id : '', user_nom: user ? user.nom : '',
        action: action, cible: cible || '', detail: typeof detail === 'string' ? detail : JSON.stringify(detail || {}).slice(0, 2000)
      });
    }

    function actifs() {
      return store.all('Utilisateurs').filter(function (u) { return String(u.actif).toLowerCase() === 'oui' && CONFIG.roles[u.role]; });
    }
    function trouverUser(id) { return actifs().filter(function (u) { return String(u.id) === String(id); })[0] || null; }

    // -------------------------------------------------------------------------
    // Authentification : e-mail + PIN, jeton de session, blocage après échecs.
    // -------------------------------------------------------------------------
    function connexion(data) {
      var email = texte(data.email, 120).toLowerCase();
      var pin = texte(data.pin, 20);
      var cle = 'echecs:' + email;
      var echecs = Number(env.cache.get(cle) || 0);
      if (echecs >= CONFIG.essaisMax) throw erreur('Trop d\'essais. Réessaie dans ' + CONFIG.blocageMinutes + ' minutes.');
      var u = actifs().filter(function (x) { return String(x.email).toLowerCase() === email; })[0];
      var ok = u && u.pin_hash && pin.length >= 4 && env.hashPin(u.id, pin) === String(u.pin_hash);
      if (!ok) {
        env.cache.put(cle, String(echecs + 1), CONFIG.blocageMinutes * 60);
        journal(u || { id: '', nom: email }, 'connexion_refusee', '', '');
        throw erreur('E-mail ou code PIN incorrect.');
      }
      env.cache.remove(cle);
      var jeton = env.randomToken();
      env.sessions.put(jeton, { uid: u.id, exp: now().getTime() + CONFIG.dureeSessionJours * 86400000 });
      journal(u, 'connexion', '', '');
      return { jeton: jeton, moi: profil(u) };
    }

    function authentifier(jeton) {
      if (!jeton) throw erreur('Session expirée. Reconnecte-toi.');
      var s = env.sessions.get(jeton);
      if (!s || s.exp < now().getTime()) { if (s) env.sessions.remove(jeton); throw erreur('Session expirée. Reconnecte-toi.'); }
      var u = trouverUser(s.uid);
      if (!u) { env.sessions.remove(jeton); throw erreur('Compte désactivé.'); }
      return u;
    }

    function profil(u) {
      var droits = {};
      Object.keys(DROITS).forEach(function (d) { droits[d] = peut(u, d); });
      return { id: u.id, nom: u.nom, role: u.role, filiere: u.filiere || '', disciplines: u.disciplines || '', droits: droits };
    }

    function notifier(roles, sujet, corps, filiere) {
      if (!env.notify) return;
      actifs().forEach(function (u) {
        if (roles.indexOf(u.role) === -1 || !u.email) return;
        if (filiere && u.filiere && u.filiere !== filiere && u.role !== 'directeur') return;
        env.notify(u.email, sujet, corps);
      });
    }

    function sessionOuverte(userId) {
      return store.all('Sessions').filter(function (s) { return String(s.user_id) === String(userId) && s.statut === 'en_cours'; })[0] || null;
    }

    function heureBadge(data) {
      if (data && data.hors_ligne && data.client_time) {
        var d = new Date(data.client_time);
        if (!isNaN(d.getTime()) && d <= now() && now() - d < 3 * 86400000) return { date: d, source: 'hors_ligne' };
      }
      return { date: now(), source: 'badge' };
    }

    function heureLocale(dateStr, hhmm) {
      if (!ymd(dateStr) || !/^\d{1,2}:\d{2}$/.test(hhmm || '')) throw erreur('Date ou heure invalide.');
      return env.parseLocal(dateStr, hhmm);
    }

    function dureeMin(a, b) { return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000); }

    function article(id) { return store.get('Articles', id); }

    function mouvementStock(user, art, delta, motif, demandeId) {
      var q = nombre(art.quantite) || 0;
      var apres = arrondi(q + delta);
      if (apres < 0) throw erreur('Stock insuffisant : il reste ' + q + ' ' + (art.unite || '') + ' de « ' + art.designation + ' ».');
      store.update('Articles', art.id, { quantite: apres, maj_le: iso(now()), maj_par: user.nom });
      var m = {
        id: nouvelId('MV'), horodatage: iso(now()), article_id: art.id, designation: art.designation,
        delta: delta, quantite_apres: apres, motif: motif, demande_tp_id: demandeId || '', user_id: user.id, user_nom: user.nom
      };
      store.insert('Mouvements', m);
      var seuil = nombre(art.seuil);
      if (delta < 0 && isFinite(seuil) && apres <= seuil && q > seuil) {
        notifier(['technicienne', 'aide_laborantine', 'prof_referent'], '[Labo] Stock bas – ' + art.designation,
          'Il reste ' + apres + ' ' + (art.unite || '') + ' (seuil : ' + seuil + '). Pense à proposer une commande dans le suivi labo.', art.filiere);
      }
      return m;
    }

    // -------------------------------------------------------------------------
    var A = {};

    A.deconnexion = function (user, data, jeton) { env.sessions.remove(jeton); journal(user, 'deconnexion', '', ''); return true; };

    A.etat = function (user) {
      var auj = jour(now());
      var r = { moi: profil(user), config: CONFIG, aujourdhui: auj };
      var sessions = store.all('Sessions');
      var demandes = store.all('Demandes');
      var estProf = user.role === 'enseignant';

      r.presentes = sessions.filter(function (s) { return s.statut === 'en_cours'; })
        .map(function (s) { return { user_nom: s.user_nom, arrivee: s.arrivee, labo: s.labo, source: s.source }; });

      if (peut(user, 'badge')) {
        r.sessionOuverte = sessionOuverte(user.id);
        r.sessions = sessions.filter(function (s) { return String(s.user_id) === String(user.id); });
      }
      if (peut(user, 'voirEquipe')) r.sessions = sessions;

      r.demandes = estProf ? demandes.filter(function (d) { return String(d.prof_id) === String(user.id); }) : demandes;
      var ids = r.demandes.map(function (d) { return String(d.id); });
      r.messages = store.all('Messages').filter(function (m) { return ids.indexOf(String(m.demande_id)) !== -1; });

      var incidents = store.all('Incidents');
      r.incidents = estProf ? incidents.filter(function (i) { return String(i.user_id) === String(user.id) || i.statut !== 'resolu'; }) : incidents;
      if (!estProf) r.rangements = store.all('Rangements').slice(-150);

      r.articles = store.all('Articles').filter(function (a) { return String(a.actif).toLowerCase() !== 'non'; });
      r.mouvements = store.all('Mouvements').slice(-200);

      var commandes = store.all('Commandes');
      r.commandes = estProf ? commandes.filter(function (c) { return String(c.user_id) === String(user.id); }) : commandes;
      r.fournisseurs = store.all('Fournisseurs');

      var debut = env.format(new Date(now().getTime() - 14 * 86400000), 'yyyy-MM-dd');
      var fin = env.format(new Date(now().getTime() + 70 * 86400000), 'yyyy-MM-dd');
      r.programme = store.all('Programme').filter(function (p) {
        return (!p.fin || p.fin >= debut) && (!p.debut || p.debut <= fin) && (!estProf || !user.filiere || p.filiere === user.filiere);
      });

      if (peut(user, 'piloterTP') || peut(user, 'voirEquipe') || peut(user, 'approuverCommande')) {
        r.utilisateurs = actifs().map(function (u) {
          var o = { id: u.id, nom: u.nom, role: u.role, filiere: u.filiere || '' };
          if (peut(user, 'facturation')) o.taux_horaire = u.taux_horaire;
          return o;
        });
      }
      return r;
    };

    A.programme = function (user, data) {
      var f = texte(data.filiere, 10);
      return store.all('Programme').filter(function (p) { return !f || p.filiere === f; });
    };

    // --- Présence -------------------------------------------------------------
    A.arrivee = function (user, data) {
      exiger(user, 'badge');
      var o = sessionOuverte(user.id);
      if (o) throw erreur('Une présence est déjà ouverte depuis le ' + env.format(new Date(o.arrivee), 'dd/MM à HH:mm') + '. Déclare d\'abord ton départ.');
      var h = heureBadge(data);
      var s = {
        id: nouvelId('S'), user_id: user.id, user_nom: user.nom, date: jour(h.date), arrivee: iso(h.date),
        depart: '', duree_min: '', labo: texte(data.labo, 80), missions: '', demandes_ids: '', commentaire: '',
        source: h.source, corrections: '', statut: 'en_cours', valide_par: '', valide_le: '', motif_validation: ''
      };
      store.insert('Sessions', s);
      journal(user, 'arrivee', s.id, { source: h.source });
      return s;
    };

    A.depart = function (user, data) {
      exiger(user, 'badge');
      var s = sessionOuverte(user.id);
      if (!s) throw erreur('Aucune présence ouverte.');
      var missions = liste(data.missions);
      if (!missions.length) throw erreur('Coche au moins une mission réalisée.');
      var corr = '', fin;
      if (data.heure_depart) {
        fin = heureLocale(s.date, data.heure_depart);
        corr = 'Départ saisi à la main le ' + env.format(now(), 'dd/MM/yyyy HH:mm');
      } else {
        var h = heureBadge(data); fin = h.date;
        if (h.source === 'hors_ligne') corr = 'Départ enregistré hors connexion';
      }
      if (fin.getTime() <= new Date(s.arrivee).getTime()) throw erreur('L\'heure de départ doit suivre l\'arrivée.');
      if (fin > now()) throw erreur('L\'heure de départ ne peut pas être dans le futur.');
      var duree = dureeMin(s.arrivee, iso(fin));
      if (duree / 60 > CONFIG.alerteSessionHeures) corr = (corr ? corr + ' ; ' : '') + 'Durée supérieure à ' + CONFIG.alerteSessionHeures + ' h';
      var patch = {
        depart: iso(fin), duree_min: duree, missions: missions.join(' | '),
        demandes_ids: liste(data.demandes_ids).join(' | '), commentaire: texte(data.commentaire, 1000),
        corrections: corr, statut: 'a_valider'
      };
      store.update('Sessions', s.id, patch);
      journal(user, 'depart', s.id, patch);
      return Object.assign({}, s, patch);
    };

    A.saisieManuelle = function (user, data) {
      exiger(user, 'badge');
      var motif = texte(data.motif, 500);
      if (!motif) throw erreur('Indique pourquoi la présence n\'a pas été badgée.');
      var debut = heureLocale(data.date, data.debut), fin = heureLocale(data.date, data.fin);
      if (fin <= debut) throw erreur('L\'heure de fin doit suivre l\'heure de début.');
      if (fin > now()) throw erreur('Impossible de déclarer une présence future.');
      var missions = liste(data.missions);
      if (!missions.length) throw erreur('Coche au moins une mission réalisée.');
      var s = {
        id: nouvelId('S'), user_id: user.id, user_nom: user.nom, date: data.date, arrivee: iso(debut), depart: iso(fin),
        duree_min: dureeMin(iso(debut), iso(fin)), labo: texte(data.labo, 80), missions: missions.join(' | '),
        demandes_ids: liste(data.demandes_ids).join(' | '), commentaire: texte(data.commentaire, 1000),
        source: 'saisie_manuelle', corrections: 'Saisie a posteriori le ' + env.format(now(), 'dd/MM/yyyy HH:mm') + ' : ' + motif,
        statut: 'a_valider', valide_par: '', valide_le: '', motif_validation: ''
      };
      store.insert('Sessions', s);
      journal(user, 'saisie_manuelle', s.id, s);
      return s;
    };

    A.validerSession = function (user, data) {
      exiger(user, 'validerPresence');
      var s = store.get('Sessions', data.id);
      if (!s) throw erreur('Présence introuvable.');
      if (s.statut === 'en_cours') throw erreur('Présence encore ouverte.');
      var decision = data.decision === 'contestee' ? 'contestee' : 'validee';
      if (decision === 'contestee' && !texte(data.motif)) throw erreur('Un motif est nécessaire pour contester.');
      var patch = { statut: decision, valide_par: user.nom, valide_le: iso(now()), motif_validation: texte(data.motif, 500) };
      store.update('Sessions', s.id, patch);
      journal(user, 'validation_session', s.id, patch);
      return Object.assign({}, s, patch);
    };

    // Relevé mensuel. Les montants ne sortent que pour le directeur.
    A.releve = function (user, data) {
      var cible = data.user_id || user.id;
      var soi = String(cible) === String(user.id);
      if (!soi && !peut(user, 'voirEquipe')) throw erreur('Relevé réservé.');
      var mois = texte(data.mois);
      if (!/^\d{4}-\d{2}$/.test(mois)) throw erreur('Mois invalide.');
      var tech = store.all('Utilisateurs').filter(function (u) { return String(u.id) === String(cible); })[0];
      if (!tech) throw erreur('Personne introuvable.');
      var sessions = store.all('Sessions').filter(function (s) {
        return String(s.user_id) === String(cible) && String(s.date).slice(0, 7) === mois;
      }).sort(function (a, b) { return a.arrivee < b.arrivee ? -1 : 1; });
      var minutes = sessions.filter(function (s) { return s.statut === 'validee'; })
        .reduce(function (t, s) { return t + (Number(s.duree_min) || 0); }, 0);
      var demandes = store.all('Demandes');
      var prep = demandes.filter(function (d) { return String(d.prepa_id) === String(cible) && String(d.date_tp).slice(0, 7) === mois; })
        .map(function (d) { return { id: d.id, date_tp: d.date_tp, creneau: d.creneau, classe: d.classe, titre: d.titre, statut: d.statut }; });
      var r = {
        personne: { id: tech.id, nom: tech.nom, role: tech.role }, mois: mois, sessions: sessions,
        minutes_validees: minutes, heures_validees: arrondi(minutes / 60),
        non_validees: sessions.filter(function (s) { return s.statut !== 'validee'; }).length,
        preparations: prep, edite_le: iso(now())
      };
      if (peut(user, 'facturation')) {
        var taux = nombre(tech.taux_horaire);
        r.taux_horaire = isFinite(taux) ? taux : 0;
        r.montant_ht = arrondi(minutes / 60 * r.taux_horaire);
        journal(user, 'releve_facturation', tech.id, mois);
      }
      return r;
    };

    // --- Rangement -------------------------------------------------------------
    A.rangement = function (user, data) {
      exiger(user, 'rangement');
      var labo = texte(data.labo, 80);
      if (!labo) throw erreur('Choisis le labo contrôlé.');
      var controles = {}, nc = [];
      CONFIG.controlesRangement.forEach(function (c) {
        var v = data.controles && data.controles[c];
        v = (v === 'ok' || v === 'nc' || v === 'na') ? v : 'na';
        controles[c] = v;
        if (v === 'nc') nc.push(c);
      });
      var h = now();
      var r = {
        id: nouvelId('R'), horodatage: iso(h), date: jour(h), user_id: user.id, user_nom: user.nom, labo: labo,
        demande_id: texte(data.demande_id, 40), controles: JSON.stringify(controles), nb_non_conformes: nc.length,
        remarques: texte(data.remarques, 1000)
      };
      store.insert('Rangements', r);
      journal(user, 'rangement', r.id, { labo: labo, nc: nc });
      if (nc.length) {
        A.incident(user, { labo: labo, categorie: 'Rangement non conforme', gravite: 'Faible',
          description: 'Contrôle ' + r.id + ' : ' + nc.join(', ') + (r.remarques ? '. ' + r.remarques : '') });
      }
      return r;
    };

    // --- Incidents -------------------------------------------------------------
    A.incident = function (user, data) {
      var description = texte(data.description, 2000);
      if (!description) throw erreur('Décris le problème.');
      var h = now();
      var i = {
        id: nouvelId('I'), horodatage: iso(h), date: jour(h), user_id: user.id, user_nom: user.nom, role: user.role,
        labo: texte(data.labo, 80),
        categorie: CONFIG.categoriesIncident.indexOf(data.categorie) !== -1 ? data.categorie : 'Autre',
        gravite: CONFIG.gravites.indexOf(data.gravite) !== -1 ? data.gravite : 'Gênant',
        description: description, statut: 'ouvert', traite_par: '', resolution: '', resolu_le: ''
      };
      store.insert('Incidents', i);
      journal(user, 'incident', i.id, { categorie: i.categorie, gravite: i.gravite });
      if (i.gravite === 'Bloquant') {
        notifier(['prof_referent', 'directeur', 'technicienne'], '[Labo] Incident bloquant – ' + i.categorie + (i.labo ? ' – ' + i.labo : ''),
          user.nom + ' a signalé le ' + env.format(h, 'dd/MM/yyyy à HH:mm') + ' :\n\n' + description + '\n\nRéf. ' + i.id);
      }
      return i;
    };

    A.majIncident = function (user, data) {
      exiger(user, 'traiterIncident');
      var i = store.get('Incidents', data.id);
      if (!i) throw erreur('Incident introuvable.');
      var statut = ['ouvert', 'en_cours', 'resolu'].indexOf(data.statut) !== -1 ? data.statut : i.statut;
      if (statut === 'resolu' && !texte(data.resolution)) throw erreur('Indique ce qui a été fait.');
      var patch = { statut: statut, traite_par: user.nom, resolution: texte(data.resolution, 1000) || i.resolution };
      if (statut === 'resolu') patch.resolu_le = iso(now());
      store.update('Incidents', i.id, patch);
      journal(user, 'maj_incident', i.id, patch);
      return Object.assign({}, i, patch);
    };

    // --- Demandes de TP --------------------------------------------------------
    A.demande = function (user, data) {
      exiger(user, 'creerDemandeTP');
      if (!ymd(data.date_tp)) throw erreur('Date du TP invalide.');
      var titre = texte(data.titre, 300), besoin = texte(data.besoin, 3000);
      if (!titre || !besoin) throw erreur('Le titre du TP et le besoin matériel sont obligatoires.');
      var h = now(), classe = texte(data.classe, 40);
      var d = {
        id: nouvelId('D'), cree_le: iso(h), prof_id: user.id, prof_nom: user.nom, filiere: filiereDeClasse(classe) || user.filiere || '',
        date_tp: data.date_tp, creneau: texte(data.creneau, 40), labo: texte(data.labo, 80), classe: classe,
        discipline: texte(data.discipline, 80), competence: texte(data.competence, 200), sequence_id: texte(data.sequence_id, 40),
        titre: titre, besoin: besoin, effectif: texte(data.effectif, 10), delai_jours: joursEntre(jour(h), data.date_tp),
        prepa_id: '', prepa_nom: '', statut: 'demandee', maj_le: iso(h)
      };
      if (d.delai_jours < 0) throw erreur('La date du TP est passée.');
      store.insert('Demandes', d);
      journal(user, 'demande', d.id, { date_tp: d.date_tp, delai: d.delai_jours });
      var corps = user.nom + ' demande « ' + titre + ' » pour le ' + d.date_tp + ' (' + d.creneau + ', ' + d.labo + ', ' + d.classe + ').\n\nBesoin :\n' + besoin;
      notifier(['technicienne', 'aide_laborantine'], '[Labo] Nouvelle demande de TP – ' + d.classe + ' – ' + d.date_tp, corps);
      if (d.delai_jours < CONFIG.delaiPrepaJours) {
        notifier(['prof_referent'], '[Labo] Demande de TP hors délai (' + d.delai_jours + ' j) – ' + d.classe, corps, d.filiere);
      }
      return d;
    };

    A.majDemande = function (user, data) {
      var d = store.get('Demandes', data.id);
      if (!d) throw erreur('Demande introuvable.');
      var statut = data.statut, patch = {};
      if (statut && !STATUTS_DEMANDE[statut]) throw erreur('Statut inconnu.');

      if (peut(user, 'piloterTP')) {
        if (statut) patch.statut = statut;
        if (data.prepa_id !== undefined) {
          var p = data.prepa_id ? trouverUser(data.prepa_id) : null;
          if (p && !peut(p, 'preparerTP')) throw erreur('Cette personne ne prépare pas de TP.');
          patch.prepa_id = p ? p.id : ''; patch.prepa_nom = p ? p.nom : '';
          if (p && d.statut === 'demandee' && !statut) patch.statut = 'prise_en_charge';
        }
      } else if (peut(user, 'preparerTP')) {
        if (data.prendre) { patch.prepa_id = user.id; patch.prepa_nom = user.nom; if (d.statut === 'demandee') patch.statut = 'prise_en_charge'; }
        if (statut) {
          if (['prise_en_charge', 'prete'].indexOf(statut) === -1) throw erreur('Tu peux passer une demande en « prise en charge » ou « prête ».');
          patch.statut = statut;
          if (!d.prepa_id && !patch.prepa_id) { patch.prepa_id = user.id; patch.prepa_nom = user.nom; }
        }
      } else if (String(d.prof_id) === String(user.id)) {
        if (!statut || ['realisee', 'annulee'].indexOf(statut) === -1) throw erreur('Tu peux marquer ta demande « réalisée » ou « annulée ».');
        patch.statut = statut;
      } else {
        throw erreur('Action non autorisée pour ton rôle.');
      }
      if (!Object.keys(patch).length) throw erreur('Rien à modifier.');
      patch.maj_le = iso(now());
      store.update('Demandes', d.id, patch);
      journal(user, 'maj_demande', d.id, patch);
      if (patch.statut && patch.statut !== d.statut) {
        store.insert('Messages', { id: nouvelId('M'), horodatage: patch.maj_le, demande_id: d.id, user_id: user.id, user_nom: user.nom, role: 'systeme',
          texte: 'Statut : ' + STATUTS_DEMANDE[d.statut] + ' → ' + STATUTS_DEMANDE[patch.statut] + (patch.prepa_nom ? ' (préparation : ' + patch.prepa_nom + ')' : '') });
      }
      return Object.assign({}, d, patch);
    };

    A.message = function (user, data) {
      var d = store.get('Demandes', data.demande_id);
      if (!d) throw erreur('Demande introuvable.');
      if (user.role === 'enseignant' && String(d.prof_id) !== String(user.id)) throw erreur('Cette demande n\'est pas la tienne.');
      var t = texte(data.texte, 2000);
      if (!t) throw erreur('Message vide.');
      var m = { id: nouvelId('M'), horodatage: iso(now()), demande_id: d.id, user_id: user.id, user_nom: user.nom, role: user.role, texte: t };
      store.insert('Messages', m);
      journal(user, 'message', d.id, '');
      if (env.notify) {
        actifs().forEach(function (u) {
          if (String(u.id) === String(user.id) || !u.email) return;
          if (String(u.id) === String(d.prof_id) || String(u.id) === String(d.prepa_id)) {
            env.notify(u.email, '[Labo] Message sur « ' + d.titre + ' » (' + d.date_tp + ')', user.nom + ' :\n\n' + t);
          }
        });
      }
      return m;
    };

    // --- Inventaire ------------------------------------------------------------
    A.article = function (user, data) {
      exiger(user, 'gererInventaire');
      var designation = texte(data.designation, 200);
      if (!designation) throw erreur('Désignation obligatoire.');
      var champs = {
        filiere: ['BIOMED', 'BIOALC', 'Commun'].indexOf(data.filiere) !== -1 ? data.filiere : 'Commun',
        categorie: CONFIG.categoriesArticle.indexOf(data.categorie) !== -1 ? data.categorie : 'Consommable',
        designation: designation, reference: texte(data.reference, 80), fournisseur: texte(data.fournisseur, 80),
        unite: texte(data.unite, 30) || 'unité', seuil: isFinite(nombre(data.seuil)) ? nombre(data.seuil) : '',
        peremption: ymd(data.peremption), emplacement: texte(data.emplacement, 80), notes: texte(data.notes, 500),
        maj_le: iso(now()), maj_par: user.nom
      };
      if (data.id) {
        var a = article(data.id);
        if (!a) throw erreur('Article introuvable.');
        if (data.actif === 'non') champs.actif = 'non';
        store.update('Articles', a.id, champs);
        journal(user, 'maj_article', a.id, champs);
        return Object.assign({}, a, champs);
      }
      var q = nombre(data.quantite);
      champs.id = nouvelId('A');
      champs.quantite = isFinite(q) && q >= 0 ? q : 0;
      champs.actif = 'oui';
      store.insert('Articles', champs);
      journal(user, 'article', champs.id, champs);
      return champs;
    };

    A.mouvement = function (user, data) {
      var a = article(data.article_id);
      if (!a) throw erreur('Article introuvable.');
      var delta = nombre(data.delta);
      if (!isFinite(delta) || delta === 0) throw erreur('Quantité invalide.');
      var motif = CONFIG.motifsMouvement.indexOf(data.motif) !== -1 ? data.motif : 'Consommation TP';
      // Tout le monde déclare ce qu'il consomme ; les entrées et corrections sont réservées.
      if ((delta > 0 || motif !== 'Consommation TP') && !peut(user, 'gererInventaire')) throw erreur('Seule une consommation peut être déclarée avec ton rôle.');
      var m = mouvementStock(user, a, delta, motif, texte(data.demande_tp_id, 40));
      journal(user, 'mouvement', a.id, { delta: delta, motif: motif });
      return m;
    };

    // --- Commandes -------------------------------------------------------------
    A.commande = function (user, data) {
      exiger(user, 'proposerCommande');
      var designation = texte(data.designation, 300);
      var quantite = nombre(data.quantite), pu = nombre(data.prix_unitaire_ttc);
      if (!designation) throw erreur('Indique ce qu\'il faut commander.');
      if (!(quantite > 0)) throw erreur('Quantité invalide.');
      if (!(pu >= 0)) throw erreur('Prix unitaire TTC estimé obligatoire (0 si inconnu).');
      var justification = texte(data.justification, 1500);
      if (!justification) throw erreur('La justification pédagogique est obligatoire (TP, séquence, bloc visé).');
      var filiere = ['BIOMED', 'BIOALC'].indexOf(data.filiere) !== -1 ? data.filiere : (user.filiere || '');
      if (!filiere) throw erreur('Choisis la filière qui porte la dépense.');
      var total = arrondi(quantite * pu);
      var devis = (Array.isArray(data.devis) ? data.devis : []).map(function (d) {
        return { fournisseur: texte(d && d.fournisseur, 80), montant: nombre(d && d.montant), lien: texte(d && d.lien, 300) };
      }).filter(function (d) { return d.fournisseur && d.montant > 0; });
      if (total >= CONFIG.seuilTroisDevisTTC) {
        var noms = {};
        devis.forEach(function (d) { noms[d.fournisseur.toLowerCase()] = true; });
        if (Object.keys(noms).length < 3) {
          throw erreur('Montant estimé de ' + total + ' € TTC : au-delà de ' + CONFIG.seuilTroisDevisTTC + ' € TTC, joins trois devis de fournisseurs différents.');
        }
      }
      var h = now();
      var c = {
        id: nouvelId('C'), cree_le: iso(h), user_id: user.id, user_nom: user.nom, filiere: filiere, designation: designation,
        reference: texte(data.reference, 80), quantite: quantite, prix_unitaire_ttc: pu, total_ttc: total,
        fournisseur: texte(data.fournisseur, 80), lien: texte(data.lien, 500), justification: justification,
        demande_tp_id: texte(data.demande_tp_id, 40), sequence_id: texte(data.sequence_id, 40), article_id: texte(data.article_id, 40),
        devis: JSON.stringify(devis), statut: 'soumise', approuve_par: '', approuve_le: '', motif_refus: '', pilotage_id: '', maj_le: iso(h)
      };
      store.insert('Commandes', c);
      journal(user, 'commande', c.id, { total: total });
      notifier(['prof_referent'], '[Labo] Commande à approuver – ' + designation + ' (' + total + ' € TTC)',
        user.nom + ' propose : ' + quantite + ' × ' + designation + (c.fournisseur ? ' chez ' + c.fournisseur : '') + '.\n\nJustification : ' + justification, filiere);
      return c;
    };

    A.majCommande = function (user, data) {
      var c = store.get('Commandes', data.id);
      if (!c) throw erreur('Commande introuvable.');
      var cible = data.statut, patch = {};
      var transitions = {
        approuvee: { de: ['soumise'], droit: 'approuverCommande' },
        refusee: { de: ['soumise'], droit: 'approuverCommande' },
        commandee: { de: ['approuvee'], droit: 'suivreCommande' },
        livree: { de: ['commandee', 'approuvee'], droit: 'suivreCommande' },
        annulee: { de: ['soumise'], droit: null }
      };
      var t = transitions[cible];
      if (!t) throw erreur('Statut inconnu.');
      if (t.de.indexOf(c.statut) === -1) throw erreur('Impossible de passer de « ' + STATUTS_COMMANDE[c.statut] + ' » à « ' + STATUTS_COMMANDE[cible] + ' ».');
      if (t.droit) exiger(user, t.droit);
      else if (String(c.user_id) !== String(user.id)) throw erreur('Seul l\'auteur peut annuler sa demande.');
      if ((cible === 'approuvee' || cible === 'refusee') && String(c.user_id) === String(user.id) && user.role !== 'directeur') {
        throw erreur('Tu ne peux pas approuver ta propre demande : elle part au directeur.');
      }
      patch.statut = cible;
      patch.maj_le = iso(now());
      if (cible === 'refusee') {
        patch.motif_refus = texte(data.motif, 500);
        if (!patch.motif_refus) throw erreur('Indique le motif du refus.');
      }
      if (cible === 'approuvee') {
        patch.approuve_par = user.nom; patch.approuve_le = iso(now());
        if (env.pilotage) {
          try { patch.pilotage_id = env.pilotage.ajouter(Object.assign({}, c, patch), env.format(now(), 'dd/MM/yyyy')) || ''; }
          catch (e) { patch.pilotage_id = ''; journal(user, 'pilotage_erreur', c.id, e.message); }
        }
      }
      if ((cible === 'commandee' || cible === 'livree') && c.pilotage_id && env.pilotage) {
        try { env.pilotage.statut(c.filiere, c.pilotage_id, cible === 'commandee' ? 'Commandé' : 'Livré'); } catch (e) { journal(user, 'pilotage_erreur', c.id, e.message); }
      }
      store.update('Commandes', c.id, patch);
      journal(user, 'maj_commande', c.id, patch);
      if (cible === 'livree' && c.article_id) {
        var a = article(c.article_id);
        var q = nombre(data.quantite_recue);
        if (a) mouvementStock(user, a, q > 0 ? q : nombre(c.quantite), 'Réception de commande', '');
      }
      if (cible === 'approuvee' || cible === 'refusee') {
        var auteur = trouverUser(c.user_id);
        if (auteur && auteur.email && env.notify) {
          env.notify(auteur.email, '[Labo] Commande ' + STATUTS_COMMANDE[cible] + ' – ' + c.designation,
            user.nom + ' a ' + (cible === 'approuvee' ? 'approuvé' : 'refusé') + ' ta demande.' + (patch.motif_refus ? '\n\nMotif : ' + patch.motif_refus : ''));
        }
      }
      return Object.assign({}, c, patch);
    };

    // -------------------------------------------------------------------------
    var PUBLIQUES = { connexion: connexion };

    function handle(req) {
      try {
        var action = req && req.action;
        if (PUBLIQUES[action]) return { ok: true, data: PUBLIQUES[action](req.data || {}) };
        if (!A[action]) throw erreur('Action inconnue.');
        var user = authentifier(req.jeton);
        return { ok: true, data: A[action](user, req.data || {}, req.jeton) };
      } catch (e) {
        if (!e.metier && env.log) env.log(e);
        return { ok: false, error: e.metier ? e.message : 'Erreur serveur. Réessaie ou préviens le directeur.' };
      }
    }

    return { handle: handle };
  }

  return {
    create: create, CONFIG: CONFIG, TABLES: TABLES, DROITS: DROITS,
    STATUTS_DEMANDE: STATUTS_DEMANDE, STATUTS_COMMANDE: STATUTS_COMMANDE,
    joursEntre: joursEntre, filiereDeClasse: filiereDeClasse, peut: peut
  };
})();

if (typeof module !== 'undefined') module.exports = LaboCore;
