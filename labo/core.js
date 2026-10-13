/*
 * Suivi labo Aurlom BTS+ — logique métier commune.
 *
 * Ce fichier tourne à deux endroits sans modification :
 *  - dans le navigateur (mode démo, données en localStorage) ;
 *  - dans Google Apps Script (fichier Core.gs, données dans Google Sheets).
 * Il ne dépend que de l'objet `store` (lecture/écriture des tables) et de
 * l'objet `env` (heure, formatage, envoi de mail) fournis par l'hôte.
 */
var LaboCore = (function () {

  // ---------------------------------------------------------------------------
  // Référentiels. À ajuster ici, puis recopier dans Core.gs.
  // ---------------------------------------------------------------------------
  var CONFIG = {
    fuseau: 'Europe/Paris',
    delaiPrepaJours: 15, // règle reprise de INVENTAIRE_BIOCHIMIE_IMMUNO.xlsx
    alerteSessionHeures: 11, // au-delà, la session est signalée « à vérifier »
    labos: ['Labo Fleming', 'Labo Robert Koch', 'Labo Gerty Cori', 'Labo Marie Curie'],
    creneaux: ['8h30 – 10h00', '10h15 – 11h45', '12h00 – 13h30', '14h30 – 16h00', '16h15 – 17h45'],
    disciplines: ['Biochimie', 'Microbiologie', 'Hématologie / Immunologie', 'Qualité / Métrologie', 'Biologie moléculaire', 'Biologie cellulaire'],
    formations: {
      BIOAC: { libelle: 'BTS Bioanalyses en laboratoire de contrôle', rncp: 'RNCP38884', classes: ['BIOALC1', 'BIOALC2'] },
      BM: { libelle: 'BTS Biologie médicale', rncp: 'RNCP40027', classes: ['BM1', 'BM2'] }
    },
    // Intitulés : fiche France Compétences RNCP38884 ; RNCP40027 (BC1, BC2) d'après
    // l'arrêté du 27 novembre 2024. Compléter BM si d'autres blocs servent en TP.
    blocs: {
      BIOAC: [
        'BC01 – Gestion opérationnelle et documentaire du laboratoire',
        'BC02 – Réalisation des analyses dans le cadre d\'un contrôle qualité',
        'BC03 – Expertise pour l\'optimisation de méthodes de bioanalyse',
        'BC04 – Relation professionnelle au laboratoire'
      ],
      BM: [
        'BC1 – Démarche qualité et organisation opérationnelle du laboratoire',
        'BC2 – Analyses médicales les plus courantes'
      ]
    },
    missions: [
      'Préparation de TP',
      'Assistance pendant le TP',
      'Rangement et nettoyage',
      'Inventaire / réception de commande',
      'Préparation de milieux / réactifs',
      'Autre (préciser en commentaire)'
    ],
    // Reprise de FEUILLE_EMARGEMENT_RANGEMENT_SALLE_TP.xlsx
    controlesRangement: [
      'Pipettes verre', 'Becs Bunsen', 'Écouvillons', 'Tubes', 'Pinces / öses', 'Lames',
      'Microscopes', 'DASRI', 'Verres à pied remplis', 'Portoirs remplis', 'Cuves',
      'Béchers / fioles jaugées', 'Paillasses désinfectées'
    ],
    categoriesIncident: [
      'Équipement en panne', 'Casse / matériel manquant', 'Stock bas ou rupture',
      'Réactif périmé', 'Hygiène / sécurité', 'Rangement non conforme', 'Autre'
    ],
    gravites: ['Faible', 'Gênant', 'Bloquant']
  };

  var TABLES = {
    Utilisateurs: ['id', 'nom', 'role', 'pin', 'email', 'taux_horaire', 'actif'],
    Sessions: ['id', 'user_id', 'user_nom', 'date', 'arrivee', 'depart', 'duree_min', 'labo',
      'missions', 'demandes_ids', 'commentaire', 'source', 'corrections', 'statut',
      'valide_par', 'valide_le', 'motif_validation'],
    Rangements: ['id', 'horodatage', 'date', 'user_id', 'user_nom', 'labo', 'demande_id',
      'controles', 'nb_non_conformes', 'remarques'],
    Incidents: ['id', 'horodatage', 'date', 'user_id', 'user_nom', 'role', 'labo', 'categorie',
      'gravite', 'description', 'statut', 'traite_par', 'resolution', 'resolu_le'],
    Demandes: ['id', 'cree_le', 'prof_id', 'prof_nom', 'date_tp', 'creneau', 'labo', 'classe',
      'formation', 'discipline', 'competence', 'titre', 'besoin', 'effectif', 'delai_jours',
      'prepa_id', 'prepa_nom', 'statut', 'maj_le'],
    Messages: ['id', 'horodatage', 'demande_id', 'user_id', 'user_nom', 'role', 'texte'],
    Journal: ['horodatage', 'user_id', 'user_nom', 'action', 'cible', 'detail']
  };

  var ROLES = { TECH: 'technicienne', PROF: 'enseignant', RESP: 'responsable' };

  var STATUTS_DEMANDE = ['demandee', 'prise_en_charge', 'prete', 'realisee', 'annulee'];
  var LIBELLES_DEMANDE = { demandee: 'demandée', prise_en_charge: 'prise en charge', prete: 'prête', realisee: 'réalisée', annulee: 'annulée' };

  function erreur(msg) { var e = new Error(msg); e.metier = true; return e; }

  function formationDeClasse(classe) {
    for (var k in CONFIG.formations) {
      if (CONFIG.formations[k].classes.indexOf(classe) !== -1) return k;
    }
    return '';
  }

  function joursEntre(dateA, dateB) { // 'yyyy-MM-dd'
    var a = Date.UTC(+dateA.slice(0, 4), +dateA.slice(5, 7) - 1, +dateA.slice(8, 10));
    var b = Date.UTC(+dateB.slice(0, 4), +dateB.slice(5, 7) - 1, +dateB.slice(8, 10));
    return Math.round((b - a) / 86400000);
  }

  function texte(v, max) {
    var s = (v === undefined || v === null) ? '' : String(v).trim();
    return max ? s.slice(0, max) : s;
  }

  function liste(v) { return Array.isArray(v) ? v.map(function (x) { return texte(x, 200); }).filter(Boolean) : []; }

  function create(store, env) {

    function now() { return env.now(); }
    function iso(d) { return d.toISOString(); }
    function jour(d) { return env.format(d, 'yyyy-MM-dd'); }
    function nouvelId(prefixe) {
      return prefixe + '-' + now().getTime().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
    }

    function journal(user, action, cible, detail) {
      store.insert('Journal', {
        horodatage: iso(now()), user_id: user ? user.id : '', user_nom: user ? user.nom : '',
        action: action, cible: cible || '', detail: typeof detail === 'string' ? detail : JSON.stringify(detail || {})
      });
    }

    function utilisateurs() {
      return store.all('Utilisateurs').filter(function (u) { return String(u.actif).toLowerCase() !== 'non' && String(u.actif) !== 'false'; });
    }

    function authentifier(auth) {
      if (!auth || !auth.id) throw erreur('Identifiant manquant.');
      var u = utilisateurs().filter(function (x) { return String(x.id) === String(auth.id); })[0];
      if (!u || String(u.pin) !== String(auth.pin)) throw erreur('Identifiant ou code PIN incorrect.');
      return u;
    }

    function exiger(user, roles) {
      if (roles.indexOf(user.role) === -1) throw erreur('Action réservée : ' + roles.join(', ') + '.');
    }

    function publicUser(u) { return { id: u.id, nom: u.nom, role: u.role }; }

    function sessionOuverte(userId) {
      return store.all('Sessions').filter(function (s) { return String(s.user_id) === String(userId) && s.statut === 'en_cours'; })[0] || null;
    }

    function notifierResponsables(sujet, corps) {
      if (!env.notify) return;
      utilisateurs().forEach(function (u) {
        if (u.role === ROLES.RESP && u.email) env.notify(u.email, sujet, corps);
      });
    }

    // Horodatage : par défaut l'heure du serveur. Une heure envoyée par le
    // téléphone n'est acceptée que pour un badge enregistré hors connexion, et
    // la session est alors marquée comme telle pour la validation.
    function heureBadge(data) {
      if (data && data.hors_ligne && data.client_time) {
        var d = new Date(data.client_time);
        if (!isNaN(d.getTime()) && d <= now()) return { date: d, source: 'hors_ligne' };
      }
      return { date: now(), source: 'badge' };
    }

    function heureLocale(dateStr, hhmm) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '') || !/^\d{1,2}:\d{2}$/.test(hhmm || '')) throw erreur('Date ou heure invalide.');
      return env.parseLocal(dateStr, hhmm);
    }

    function dureeMin(debutIso, finIso) {
      return Math.round((new Date(finIso).getTime() - new Date(debutIso).getTime()) / 60000);
    }

    // -------------------------------------------------------------------------
    var actions = {

      annuaire: function () {
        return utilisateurs().map(publicUser).sort(function (a, b) { return a.nom.localeCompare(b.nom); });
      },

      connexion: function (user) {
        journal(user, 'connexion', '', '');
        return { moi: publicUser(user), config: CONFIG };
      },

      etat: function (user) {
        var r = { moi: publicUser(user), config: CONFIG, aujourdhui: jour(now()) };
        var sessions = store.all('Sessions');
        var demandes = store.all('Demandes');
        var incidents = store.all('Incidents');
        var messages = store.all('Messages');
        var rangements = store.all('Rangements');

        if (user.role === ROLES.TECH) {
          r.sessionOuverte = sessionOuverte(user.id);
          r.sessions = sessions.filter(function (s) { return String(s.user_id) === String(user.id); });
          r.demandes = demandes;
          r.incidents = incidents;
          r.rangements = rangements.slice(-60);
          r.messages = messages;
          r.presentes = sessions.filter(function (s) { return s.statut === 'en_cours'; })
            .map(function (s) { return { user_nom: s.user_nom, arrivee: s.arrivee, labo: s.labo }; });
        } else if (user.role === ROLES.PROF) {
          r.demandes = demandes.filter(function (d) { return String(d.prof_id) === String(user.id); });
          var ids = r.demandes.map(function (d) { return String(d.id); });
          r.messages = messages.filter(function (m) { return ids.indexOf(String(m.demande_id)) !== -1; });
          r.incidents = incidents.filter(function (i) { return String(i.user_id) === String(user.id) || i.statut !== 'resolu'; });
          r.presentes = sessions.filter(function (s) { return s.statut === 'en_cours'; })
            .map(function (s) { return { user_nom: s.user_nom, arrivee: s.arrivee, labo: s.labo }; });
        } else {
          r.sessions = sessions;
          r.demandes = demandes;
          r.incidents = incidents;
          r.messages = messages;
          r.rangements = rangements;
          r.utilisateurs = utilisateurs().map(function (u) {
            return { id: u.id, nom: u.nom, role: u.role, email: u.email, taux_horaire: u.taux_horaire };
          });
          r.presentes = sessions.filter(function (s) { return s.statut === 'en_cours'; });
        }
        return r;
      },

      // --- Présence -----------------------------------------------------------
      arrivee: function (user, data) {
        exiger(user, [ROLES.TECH]);
        var ouverte = sessionOuverte(user.id);
        if (ouverte) throw erreur('Une présence est déjà ouverte depuis le ' + env.format(new Date(ouverte.arrivee), 'dd/MM à HH:mm') + '. Déclare d\'abord ton départ.');
        var h = heureBadge(data);
        var s = {
          id: nouvelId('S'), user_id: user.id, user_nom: user.nom, date: jour(h.date),
          arrivee: iso(h.date), depart: '', duree_min: '', labo: texte(data.labo, 80),
          missions: '', demandes_ids: '', commentaire: '', source: h.source, corrections: '',
          statut: 'en_cours', valide_par: '', valide_le: '', motif_validation: ''
        };
        store.insert('Sessions', s);
        journal(user, 'arrivee', s.id, { source: h.source, heure: s.arrivee });
        return s;
      },

      depart: function (user, data) {
        exiger(user, [ROLES.TECH]);
        var s = sessionOuverte(user.id);
        if (!s) throw erreur('Aucune présence ouverte.');
        var missions = liste(data.missions);
        if (!missions.length) throw erreur('Coche au moins une mission réalisée.');
        var corrections = '';
        var fin;
        if (data.heure_depart) { // départ oublié : heure saisie, à valider
          fin = heureLocale(s.date, data.heure_depart);
          corrections = 'Départ saisi à la main le ' + env.format(now(), 'dd/MM/yyyy HH:mm') + ' (badge oublié)';
        } else {
          var h = heureBadge(data);
          fin = h.date;
          if (h.source === 'hors_ligne') corrections = 'Départ enregistré hors connexion';
        }
        if (fin.getTime() <= new Date(s.arrivee).getTime()) throw erreur('L\'heure de départ doit suivre l\'arrivée.');
        var duree = dureeMin(s.arrivee, iso(fin));
        if (duree / 60 > CONFIG.alerteSessionHeures) {
          corrections = (corrections ? corrections + ' ; ' : '') + 'Durée supérieure à ' + CONFIG.alerteSessionHeures + ' h';
        }
        var patch = {
          depart: iso(fin), duree_min: duree, missions: missions.join(' | '),
          demandes_ids: liste(data.demandes_ids).join(' | '), commentaire: texte(data.commentaire, 1000),
          corrections: corrections, statut: 'a_valider'
        };
        store.update('Sessions', s.id, patch);
        journal(user, 'depart', s.id, patch);
        return Object.assign({}, s, patch);
      },

      saisieManuelle: function (user, data) {
        exiger(user, [ROLES.TECH]);
        var motif = texte(data.motif, 500);
        if (!motif) throw erreur('Indique pourquoi la présence n\'a pas été badgée.');
        var debut = heureLocale(data.date, data.debut);
        var fin = heureLocale(data.date, data.fin);
        if (fin <= debut) throw erreur('L\'heure de fin doit suivre l\'heure de début.');
        if (debut > now()) throw erreur('Impossible de déclarer une présence future.');
        var missions = liste(data.missions);
        if (!missions.length) throw erreur('Coche au moins une mission réalisée.');
        var s = {
          id: nouvelId('S'), user_id: user.id, user_nom: user.nom, date: data.date,
          arrivee: iso(debut), depart: iso(fin), duree_min: dureeMin(iso(debut), iso(fin)), labo: texte(data.labo, 80),
          missions: missions.join(' | '), demandes_ids: liste(data.demandes_ids).join(' | '),
          commentaire: texte(data.commentaire, 1000), source: 'saisie_manuelle',
          corrections: 'Saisie a posteriori le ' + env.format(now(), 'dd/MM/yyyy HH:mm') + ' : ' + motif,
          statut: 'a_valider', valide_par: '', valide_le: '', motif_validation: ''
        };
        store.insert('Sessions', s);
        journal(user, 'saisie_manuelle', s.id, s);
        return s;
      },

      validerSession: function (user, data) {
        exiger(user, [ROLES.RESP]);
        var s = store.get('Sessions', data.id);
        if (!s) throw erreur('Session introuvable.');
        if (s.statut === 'en_cours') throw erreur('Session encore ouverte.');
        var decision = data.decision === 'contestee' ? 'contestee' : 'validee';
        if (decision === 'contestee' && !texte(data.motif)) throw erreur('Un motif est nécessaire pour contester.');
        var patch = { statut: decision, valide_par: user.nom, valide_le: iso(now()), motif_validation: texte(data.motif, 500) };
        store.update('Sessions', s.id, patch);
        journal(user, 'validation_session', s.id, patch);
        return Object.assign({}, s, patch);
      },

      releve: function (user, data) {
        var cible = data.user_id || user.id;
        if (user.role !== ROLES.RESP && String(cible) !== String(user.id)) throw erreur('Relevé réservé.');
        var mois = texte(data.mois);
        if (!/^\d{4}-\d{2}$/.test(mois)) throw erreur('Mois invalide (aaaa-mm).');
        var tech = store.all('Utilisateurs').filter(function (u) { return String(u.id) === String(cible); })[0];
        if (!tech) throw erreur('Prestataire introuvable.');
        var sessions = store.all('Sessions').filter(function (s) {
          return String(s.user_id) === String(cible) && String(s.date).slice(0, 7) === mois;
        }).sort(function (a, b) { return a.arrivee < b.arrivee ? -1 : 1; });
        var valides = sessions.filter(function (s) { return s.statut === 'validee'; });
        var minutes = valides.reduce(function (t, s) { return t + Number(s.duree_min || 0); }, 0);
        var taux = Number(String(tech.taux_horaire || '0').replace(',', '.')) || 0;
        return {
          prestataire: { id: tech.id, nom: tech.nom, taux_horaire: taux },
          mois: mois, sessions: sessions, minutes_validees: minutes,
          heures_validees: Math.round(minutes / 60 * 100) / 100,
          montant_ht: Math.round(minutes / 60 * taux * 100) / 100,
          non_validees: sessions.filter(function (s) { return s.statut !== 'validee'; }).length,
          edite_le: iso(now())
        };
      },

      // --- Rangement ----------------------------------------------------------
      rangement: function (user, data) {
        exiger(user, [ROLES.TECH, ROLES.RESP]);
        var labo = texte(data.labo, 80);
        if (!labo) throw erreur('Choisis le labo contrôlé.');
        var controles = {};
        var nc = [];
        CONFIG.controlesRangement.forEach(function (c) {
          var v = data.controles && data.controles[c];
          v = (v === 'ok' || v === 'nc' || v === 'na') ? v : 'na';
          controles[c] = v;
          if (v === 'nc') nc.push(c);
        });
        var h = now();
        var r = {
          id: nouvelId('R'), horodatage: iso(h), date: jour(h), user_id: user.id, user_nom: user.nom,
          labo: labo, demande_id: texte(data.demande_id, 40), controles: JSON.stringify(controles),
          nb_non_conformes: nc.length, remarques: texte(data.remarques, 1000)
        };
        store.insert('Rangements', r);
        journal(user, 'rangement', r.id, { labo: labo, nc: nc });
        if (nc.length) {
          actions.incident(user, {
            labo: labo, categorie: 'Rangement non conforme', gravite: 'Faible',
            description: 'Contrôle ' + r.id + ' : ' + nc.join(', ') + (r.remarques ? '. ' + r.remarques : '')
          });
        }
        return r;
      },

      // --- Incidents ----------------------------------------------------------
      incident: function (user, data) {
        var description = texte(data.description, 2000);
        if (!description) throw erreur('Décris le problème.');
        var categorie = CONFIG.categoriesIncident.indexOf(data.categorie) !== -1 ? data.categorie : 'Autre';
        var gravite = CONFIG.gravites.indexOf(data.gravite) !== -1 ? data.gravite : 'Gênant';
        var h = now();
        var i = {
          id: nouvelId('I'), horodatage: iso(h), date: jour(h), user_id: user.id, user_nom: user.nom, role: user.role,
          labo: texte(data.labo, 80), categorie: categorie, gravite: gravite, description: description,
          statut: 'ouvert', traite_par: '', resolution: '', resolu_le: ''
        };
        store.insert('Incidents', i);
        journal(user, 'incident', i.id, { categorie: categorie, gravite: gravite });
        if (gravite === 'Bloquant') {
          notifierResponsables('[Labo] Incident bloquant – ' + categorie + ' – ' + i.labo,
            user.nom + ' a signalé le ' + env.format(h, 'dd/MM/yyyy à HH:mm') + ' :\n\n' + description + '\n\nRéférence : ' + i.id);
        }
        return i;
      },

      majIncident: function (user, data) {
        exiger(user, [ROLES.TECH, ROLES.RESP]);
        var i = store.get('Incidents', data.id);
        if (!i) throw erreur('Incident introuvable.');
        var statut = ['ouvert', 'en_cours', 'resolu'].indexOf(data.statut) !== -1 ? data.statut : i.statut;
        if (statut === 'resolu' && !texte(data.resolution)) throw erreur('Indique ce qui a été fait.');
        var patch = { statut: statut, traite_par: user.nom, resolution: texte(data.resolution, 1000) || i.resolution };
        if (statut === 'resolu') patch.resolu_le = iso(now());
        store.update('Incidents', i.id, patch);
        journal(user, 'maj_incident', i.id, patch);
        return Object.assign({}, i, patch);
      },

      // --- Demandes de TP -----------------------------------------------------
      demande: function (user, data) {
        exiger(user, [ROLES.PROF, ROLES.RESP]);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date_tp || '')) throw erreur('Date du TP invalide.');
        var titre = texte(data.titre, 300);
        var besoin = texte(data.besoin, 3000);
        if (!titre || !besoin) throw erreur('Le titre du TP et le besoin matériel sont obligatoires.');
        var h = now();
        var classe = texte(data.classe, 40);
        var d = {
          id: nouvelId('D'), cree_le: iso(h), prof_id: user.id, prof_nom: user.nom,
          date_tp: data.date_tp, creneau: texte(data.creneau, 40), labo: texte(data.labo, 80),
          classe: classe, formation: formationDeClasse(classe), discipline: texte(data.discipline, 80),
          competence: texte(data.competence, 200), titre: titre, besoin: besoin,
          effectif: texte(data.effectif, 10), delai_jours: joursEntre(jour(h), data.date_tp),
          prepa_id: '', prepa_nom: '', statut: 'demandee', maj_le: iso(h)
        };
        if (d.delai_jours < 0) throw erreur('La date du TP est passée.');
        store.insert('Demandes', d);
        journal(user, 'demande', d.id, { date_tp: d.date_tp, delai: d.delai_jours });
        if (d.delai_jours < CONFIG.delaiPrepaJours) {
          notifierResponsables('[Labo] Demande de TP hors délai (' + d.delai_jours + ' j) – ' + d.classe,
            user.nom + ' demande « ' + titre + ' » pour le ' + d.date_tp + ' (' + d.creneau + ', ' + d.labo + ').\n\nBesoin :\n' + besoin);
        }
        return d;
      },

      majDemande: function (user, data) {
        var d = store.get('Demandes', data.id);
        if (!d) throw erreur('Demande introuvable.');
        var patch = {};
        var statut = data.statut;
        if (statut && STATUTS_DEMANDE.indexOf(statut) === -1) throw erreur('Statut inconnu.');

        if (user.role === ROLES.TECH) {
          if (data.prendre) { patch.prepa_id = user.id; patch.prepa_nom = user.nom; patch.statut = d.statut === 'demandee' ? 'prise_en_charge' : d.statut; }
          if (statut) {
            if (['prise_en_charge', 'prete'].indexOf(statut) === -1) throw erreur('Une technicienne passe une demande en « prise en charge » ou « prête ».');
            patch.statut = statut;
            if (!d.prepa_id && !patch.prepa_id) { patch.prepa_id = user.id; patch.prepa_nom = user.nom; }
          }
        } else if (user.role === ROLES.PROF) {
          if (String(d.prof_id) !== String(user.id)) throw erreur('Cette demande n\'est pas la tienne.');
          if (statut && ['realisee', 'annulee'].indexOf(statut) === -1) throw erreur('Un enseignant marque une demande « réalisée » ou « annulée ».');
          if (statut) patch.statut = statut;
        } else {
          if (statut) patch.statut = statut;
          if (data.prepa_id !== undefined) {
            var p = utilisateurs().filter(function (u) { return String(u.id) === String(data.prepa_id); })[0];
            patch.prepa_id = p ? p.id : '';
            patch.prepa_nom = p ? p.nom : '';
            if (p && d.statut === 'demandee' && !statut) patch.statut = 'prise_en_charge';
          }
        }
        if (!Object.keys(patch).length) throw erreur('Rien à modifier.');
        patch.maj_le = iso(now());
        store.update('Demandes', d.id, patch);
        journal(user, 'maj_demande', d.id, patch);
        if (patch.statut && patch.statut !== d.statut) {
          store.insert('Messages', {
            id: nouvelId('M'), horodatage: patch.maj_le, demande_id: d.id, user_id: user.id,
            user_nom: user.nom, role: 'systeme', texte: 'Statut : ' + LIBELLES_DEMANDE[d.statut] + ' → ' + LIBELLES_DEMANDE[patch.statut] + (patch.prepa_nom ? ' (préparation : ' + patch.prepa_nom + ')' : '')
          });
        }
        return Object.assign({}, d, patch);
      },

      message: function (user, data) {
        var d = store.get('Demandes', data.demande_id);
        if (!d) throw erreur('Demande introuvable.');
        if (user.role === ROLES.PROF && String(d.prof_id) !== String(user.id)) throw erreur('Cette demande n\'est pas la tienne.');
        var t = texte(data.texte, 2000);
        if (!t) throw erreur('Message vide.');
        var m = { id: nouvelId('M'), horodatage: iso(now()), demande_id: d.id, user_id: user.id, user_nom: user.nom, role: user.role, texte: t };
        store.insert('Messages', m);
        journal(user, 'message', d.id, '');
        if (env.notify) {
          var dest = [];
          utilisateurs().forEach(function (u) {
            if (String(u.id) === String(user.id) || !u.email) return;
            if (String(u.id) === String(d.prof_id) || String(u.id) === String(d.prepa_id)) dest.push(u.email);
          });
          dest.forEach(function (e) {
            env.notify(e, '[Labo] Message sur « ' + d.titre + ' » (' + d.date_tp + ')', user.nom + ' :\n\n' + t);
          });
        }
        return m;
      }
    };

    var PUBLIQUES = { annuaire: true };

    function handle(req) {
      try {
        var action = req && req.action;
        if (!actions[action]) throw erreur('Action inconnue : ' + action);
        if (PUBLIQUES[action]) return { ok: true, data: actions[action]() };
        var user = authentifier(req.auth);
        return { ok: true, data: actions[action](user, req.data || {}) };
      } catch (e) {
        return { ok: false, error: e.metier ? e.message : 'Erreur serveur : ' + e.message };
      }
    }

    return { handle: handle };
  }

  return { create: create, CONFIG: CONFIG, TABLES: TABLES, ROLES: ROLES, joursEntre: joursEntre, formationDeClasse: formationDeClasse };
})();

if (typeof module !== 'undefined') module.exports = LaboCore;
