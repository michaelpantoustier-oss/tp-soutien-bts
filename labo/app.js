/* Suivi labo Aurlom BTS+ — interface. */
(function () {
  'use strict';

  // URL « /exec » du déploiement Apps Script (voir README). Vide = mode démonstration.
  var API_URL = '';

  var DEMO = !API_URL;
  var CLE_AUTH = 'labo-auth';
  var CLE_FILE = 'labo-file-attente';
  var demoCore = null;
  if (DEMO) {
    demoCore = LaboCore.create(LaboNav.store(), LaboNav.env);
    LaboNav.amorcer(demoCore);
  }

  var S = { auth: lire(CLE_AUTH), etat: null, onglet: null, annuaire: null, releve: null, filtreDemandes: 'avenir', filtreIncidents: 'ouverts', occupe: false };
  var app = document.getElementById('app');

  // ---------------------------------------------------------------------------
  // Utilitaires
  // ---------------------------------------------------------------------------
  function lire(cle) { try { return JSON.parse(localStorage.getItem(cle)); } catch (e) { return null; } }
  function ecrire(cle, v) { try { if (v === null) localStorage.removeItem(cle); else localStorage.setItem(cle, JSON.stringify(v)); } catch (e) { /* stockage bloqué */ } }

  function esc(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(iso, motif) { return iso ? LaboNav.format(new Date(iso), motif) : ''; }
  var JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  function jourLisible(ymd) {
    if (!ymd) return '';
    var d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)));
    return JOURS[d.getUTCDay()] + ' ' + ymd.slice(8, 10) + '/' + ymd.slice(5, 7) + '/' + ymd.slice(0, 4);
  }
  function duree(min) {
    min = Number(min) || 0;
    var h = Math.floor(min / 60), m = min % 60;
    return h + ' h ' + (m < 10 ? '0' : '') + m;
  }
  var nf = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function nombre(n) { return nf.format(Number(n) || 0); }
  function aujourdhui() { return LaboNav.format(new Date(), 'yyyy-MM-dd'); }
  function moisCourant() { return LaboNav.format(new Date(), 'yyyy-MM'); }
  function options(liste, choisi, vide) {
    return (vide ? '<option value="">' + esc(vide) + '</option>' : '') + liste.map(function (x) {
      var v = typeof x === 'string' ? x : x.v, l = typeof x === 'string' ? x : x.l;
      return '<option value="' + esc(v) + '"' + (String(v) === String(choisi) ? ' selected' : '') + '>' + esc(l) + '</option>';
    }).join('');
  }
  function C() { return S.etat.config; }
  function role() { return S.auth && S.auth.role; }

  var toastTimer;
  function toast(msg, erreur) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast' + (erreur ? ' erreur' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast cache'; }, erreur ? 6000 : 3500);
  }

  // ---------------------------------------------------------------------------
  // Appels serveur (ou cœur local en démo) et file d'attente hors connexion
  // ---------------------------------------------------------------------------
  function envoyer(req) {
    if (DEMO) return Promise.resolve(demoCore.handle(JSON.parse(JSON.stringify(req))));
    return fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(req) })
      .then(function (r) { return r.json(); });
  }

  function api(action, data) {
    var req = { action: action, auth: S.auth ? { id: S.auth.id, pin: S.auth.pin } : null, data: data || {} };
    return envoyer(req).catch(function (e) {
      if (action === 'arrivee' || action === 'depart') {
        var file = lire(CLE_FILE) || [];
        req.data.hors_ligne = true;
        req.data.client_time = new Date().toISOString();
        file.push(req);
        ecrire(CLE_FILE, file);
        return { ok: true, enAttente: true };
      }
      return { ok: false, error: 'Connexion impossible. Réessaie dans un instant.' };
    });
  }

  function viderFile() {
    var file = lire(CLE_FILE) || [];
    if (!file.length || DEMO) return Promise.resolve();
    var reste = [];
    return file.reduce(function (p, req) {
      return p.then(function () {
        return envoyer(req).then(function (r) {
          if (!r.ok) toast('Badge hors connexion refusé : ' + r.error, true);
        }).catch(function () { reste.push(req); });
      });
    }, Promise.resolve()).then(function () {
      ecrire(CLE_FILE, reste.length ? reste : null);
      if (file.length > reste.length) toast((file.length - reste.length) + ' badge(s) hors connexion envoyé(s).');
    });
  }

  function charger() {
    return viderFile().then(function () { return api('etat'); }).then(function (r) {
      if (!r.ok) {
        if (/PIN|Identifiant/.test(r.error)) { ecrire(CLE_AUTH, null); S.auth = null; }
        toast(r.error, true);
        S.etat = null;
      } else {
        S.etat = r.data;
      }
      rendre();
    });
  }

  function agir(action, data, msgOk) {
    if (S.occupe) return Promise.resolve();
    S.occupe = true;
    return api(action, data).then(function (r) {
      S.occupe = false;
      if (!r.ok) { toast(r.error, true); return null; }
      if (r.enAttente) toast('Pas de réseau : badge enregistré sur ce téléphone avec son heure, envoi automatique au retour du réseau.');
      else if (msgOk) toast(msgOk);
      return charger().then(function () { return r.data; });
    });
  }

  // ---------------------------------------------------------------------------
  // Structure
  // ---------------------------------------------------------------------------
  var ONGLETS = {
    technicienne: [['presence', 'Présence'], ['demandes', 'Demandes de TP'], ['rangement', 'Rangement'], ['incidents', 'Signaler'], ['heures', 'Mes heures']],
    enseignant: [['demandes', 'Mes demandes de TP'], ['incidents', 'Signaler']],
    responsable: [['tableau', 'Tableau de bord'], ['heures', 'Heures et facturation'], ['demandes', 'Demandes de TP'], ['incidents', 'Incidents'], ['rangement', 'Rangements']]
  };
  var ROLE_LIB = { technicienne: 'Technicienne de laboratoire', enseignant: 'Enseignant·e', responsable: 'Responsable' };

  function rendre() {
    if (!S.auth) return rendreConnexion();
    if (!S.etat) { app.innerHTML = '<p class="vide">Chargement…</p>'; return; }
    var ongl = ONGLETS[role()] || [];
    if (!S.onglet || !ongl.some(function (o) { return o[0] === S.onglet; })) S.onglet = ongl[0][0];
    var compte = compteurs();
    var h = '<header class="entete"><p class="sur">aurlom BTS+ · Suivi labo</p>' +
      '<div class="qui"><b>' + esc(S.etat.moi.nom) + '</b> · ' + esc(ROLE_LIB[role()]) +
      ' · <button class="btn lien" data-act="deconnexion">Changer d\'utilisateur</button></div></header>';
    if (DEMO) {
      h += '<div class="demo"><span><b>Démonstration.</b> Données fictives stockées dans ce navigateur. PIN : Technicienne A 1111, Technicienne B 2222, enseignants 3333 et 4444, responsable 0000.</span>' +
        '<button class="btn petit" data-act="reinit">Réinitialiser la démo</button></div>';
    }
    h += '<nav class="onglets" role="tablist">' + ongl.map(function (o) {
      return '<button role="tab" data-onglet="' + o[0] + '" aria-selected="' + (S.onglet === o[0]) + '">' + esc(o[1]) +
        (compte[o[0]] ? '<span class="compte">' + compte[o[0]] + '</span>' : '') + '</button>';
    }).join('') + '</nav>';
    var vues = { presence: vuePresence, demandes: vueDemandes, rangement: vueRangement, incidents: vueIncidents, heures: vueHeures, tableau: vueTableau };
    h += '<section role="tabpanel">' + vues[S.onglet]() + '</section>';
    app.innerHTML = h;
    apresRendu();
  }

  function compteurs() {
    var e = S.etat, c = {}, auj = aujourdhui();
    var ouverts = (e.incidents || []).filter(function (i) { return i.statut !== 'resolu'; }).length;
    if (role() !== 'enseignant' && ouverts) c.incidents = ouverts;
    if (role() === 'technicienne') {
      c.demandes = (e.demandes || []).filter(function (d) { return d.statut === 'demandee' && d.date_tp >= auj; }).length;
    }
    if (role() === 'responsable') {
      c.heures = (e.sessions || []).filter(function (s) { return s.statut === 'a_valider'; }).length;
      c.demandes = (e.demandes || []).filter(function (d) { return d.statut === 'demandee' && d.date_tp >= auj; }).length;
    }
    return c;
  }

  function titre(sur, t, lead) {
    return '<p class="sur" style="margin-top:24px">' + esc(sur) + '</p><h1>' + esc(t) + '<span class="point">.</span></h1>' +
      (lead ? '<p class="lead">' + lead + '</p>' : '');
  }

  // ---------------------------------------------------------------------------
  // Connexion
  // ---------------------------------------------------------------------------
  function rendreConnexion() {
    if (!S.annuaire) {
      app.innerHTML = '<p class="vide">Chargement…</p>';
      api('annuaire').then(function (r) {
        S.annuaire = r.ok ? r.data : [];
        if (!r.ok) toast(r.error, true);
        rendreConnexion();
      });
      return;
    }
    app.innerHTML = '<div class="connexion">' + titre('aurlom BTS+ · Suivi labo', 'Qui es-tu', 'Choisis ton nom et saisis ton code PIN personnel.') +
      (DEMO ? '<div class="encart ambre">Démonstration : PIN 1111 et 2222 (techniciennes), 3333 et 4444 (enseignants), 0000 (responsable).</div>' : '') +
      '<form data-form="connexion" class="grille" style="grid-template-columns:1fr">' +
      '<label class="champ"><span>Nom</span><select name="id" required>' +
      options(S.annuaire.map(function (u) { return { v: u.id, l: u.nom + ' · ' + (ROLE_LIB[u.role] || u.role) }; }), '', 'Choisir…') + '</select></label>' +
      '<label class="champ"><span>Code PIN</span><input name="pin" type="password" inputmode="numeric" autocomplete="current-password" required></label>' +
      '<button class="btn plein" type="submit">Se connecter</button></form></div>';
  }

  // ---------------------------------------------------------------------------
  // Présence (technicienne)
  // ---------------------------------------------------------------------------
  function vuePresence() {
    var e = S.etat, s = e.sessionOuverte, auj = aujourdhui();
    var file = (lire(CLE_FILE) || []);
    var h = titre(jourLisible(auj), s ? 'Tu es au labo' : 'Déclarer ta présence',
      'L\'heure retenue est celle du serveur au moment où tu appuies, pas celle saisie à la main. Chaque présence est ensuite validée par la responsable : c\'est la base de ta facture.');
    if (file.length) {
      h += '<div class="encart ambre"><b>' + file.length + ' badge(s) en attente d\'envoi</b> (pas de réseau) : ' +
        file.map(function (r) { return (r.action === 'arrivee' ? 'arrivée' : 'départ') + ' à ' + fmt(r.data.client_time, 'HH:mm'); }).join(', ') +
        '. Ils partiront seuls au retour du réseau. <button class="btn lien" data-act="recharger">Réessayer maintenant</button></div>';
    }
    if (!s) {
      h += '<div class="panneau"><p class="label">Il est</p><div class="heure"><span id="horloge">' + LaboNav.format(new Date(), 'HH:mm') + '</span><span class="point">.</span></div>' +
        '<form data-form="arrivee" class="grille" style="grid-template-columns:1fr">' +
        '<label class="champ"><span class="label">Labo</span><select name="labo" required>' + options(C().labos, '', 'Choisir le labo…') + '</select></label>' +
        '<button class="btn badge" type="submit">Je déclare mon arrivée</button></form></div>';
    } else {
      var duJour = (e.demandes || []).filter(function (d) { return d.date_tp === s.date && d.statut !== 'annulee'; });
      h += '<div class="panneau"><p class="label">Arrivée ' + esc(s.source === 'hors_ligne' ? '(hors connexion) ' : '') + '· ' + esc(s.labo) + '</p>' +
        '<div class="heure">' + fmt(s.arrivee, 'HH:mm') + '<span class="point">.</span></div>' +
        '<p class="sourd">Depuis <span id="duree" data-depuis="' + esc(s.arrivee) + '">' + duree(Math.round((Date.now() - new Date(s.arrivee)) / 60000)) + '</span>' +
        (s.date !== auj ? ' · <b>présence ouverte le ' + jourLisible(s.date) + ' : saisis l\'heure réelle de départ ci-dessous</b>' : '') + '</p></div>';
      h += '<form data-form="depart"><h2>Ce que tu as fait</h2><div class="cases">' +
        C().missions.map(function (m) { return '<label class="case"><input type="checkbox" name="missions" value="' + esc(m) + '"><span>' + esc(m) + '</span></label>'; }).join('') + '</div>';
      if (duJour.length) {
        h += '<h2>TP concernés</h2><div class="cases">' + duJour.map(function (d) {
          return '<label class="case"><input type="checkbox" name="demandes_ids" value="' + esc(d.id) + '"><span><b>' + esc(d.creneau) + '</b> · ' + esc(d.classe) + ' · ' + esc(d.titre) + '</span></label>';
        }).join('') + '</div>';
      }
      h += '<div class="grille" style="margin-top:16px"><label class="champ large"><span>Commentaire (facultatif)</span><textarea name="commentaire" placeholder="Ex. : TP décalé de 30 min, préparation des milieux pour jeudi"></textarea></label>' +
        '<label class="champ"><span>Départ oublié ? Heure réelle</span><input type="time" name="heure_depart"' + (s.date !== auj ? ' required' : '') + '></label></div>' +
        '<p class="petit sourd">Laisse l\'heure vide si tu pars maintenant. Une heure saisie à la main est signalée à la validation.</p>' +
        '<div class="actions"><button class="btn plein" type="submit" style="min-height:56px;flex:1">Je déclare mon départ</button></div></form>';
    }
    // Présentes
    var pres = (e.presentes || []);
    h += '<h2>Au labo en ce moment</h2>' + (pres.length ? '<div class="tableau-wrap"><table><thead><tr><th>Qui</th><th>Depuis</th><th>Labo</th></tr></thead><tbody>' +
      pres.map(function (p) { return '<tr><td>' + esc(p.user_nom) + '</td><td class="mono">' + fmt(p.arrivee, 'dd/MM HH:mm') + '</td><td>' + esc(p.labo) + '</td></tr>'; }).join('') +
      '</tbody></table></div>' : '<p class="vide">Personne n\'a déclaré sa présence.</p>');
    // Oubli
    h += '<details class="carte" style="margin-top:24px"><summary><h3 style="margin:0">Présence non badgée : la déclarer après coup</h3><p class="meta">Pour un jour où tu as oublié de badger. Elle part en validation avec ton motif.</p></summary>' +
      '<form data-form="saisieManuelle" style="margin-top:16px"><div class="grille">' +
      '<label class="champ"><span>Date</span><input type="date" name="date" max="' + auj + '" required></label>' +
      '<label class="champ"><span>Début</span><input type="time" name="debut" required></label>' +
      '<label class="champ"><span>Fin</span><input type="time" name="fin" required></label>' +
      '<label class="champ"><span>Labo</span><select name="labo" required>' + options(C().labos, '', 'Choisir…') + '</select></label>' +
      '<label class="champ large"><span>Motif</span><input name="motif" required placeholder="Ex. : téléphone déchargé"></label></div>' +
      '<p class="label" style="margin:16px 0 8px">Missions</p><div class="cases">' +
      C().missions.map(function (m) { return '<label class="case"><input type="checkbox" name="missions" value="' + esc(m) + '"><span>' + esc(m) + '</span></label>'; }).join('') + '</div>' +
      '<label class="champ" style="margin-top:12px"><span>Commentaire</span><textarea name="commentaire"></textarea></label>' +
      '<div class="actions"><button class="btn" type="submit">Envoyer en validation</button></div></form></details>';
    return h;
  }

  // ---------------------------------------------------------------------------
  // Demandes de TP
  // ---------------------------------------------------------------------------
  var STATUTS = {
    demandee: ['Demandée', 'ambre'], prise_en_charge: ['Prise en charge', 'violet'], prete: ['Prête', 'vert'],
    realisee: ['Réalisée', ''], annulee: ['Annulée', '']
  };
  function badgeStatut(s) { var x = STATUTS[s] || [s, '']; return '<span class="badge ' + x[1] + '">' + esc(x[0]) + '</span>'; }

  function classesOptions() {
    var f = C().formations, l = [];
    Object.keys(f).forEach(function (k) { f[k].classes.forEach(function (c) { l.push({ v: c, l: c + ' · ' + f[k].libelle }); }); });
    return l;
  }
  function blocsOptions() {
    var f = C().formations, b = C().blocs;
    return Object.keys(b).map(function (k) {
      return '<optgroup label="' + esc(f[k].libelle + ' (' + f[k].rncp + ')') + '">' + options(b[k].map(function (x) { return { v: f[k].rncp + ' ' + x, l: x }; })) + '</optgroup>';
    }).join('') + '<option value="Autre">Autre (préciser dans le titre)</option>';
  }

  function formDemande() {
    var auj = aujourdhui();
    return '<details class="carte"' + ((S.etat.demandes || []).length ? '' : ' open') + '><summary><h3 style="margin:0">Nouvelle demande de préparation</h3>' +
      '<p class="meta">À envoyer au moins ' + C().delaiPrepaJours + ' jours avant le TP. En dessous, la responsable est alertée.</p></summary>' +
      '<form data-form="demande" style="margin-top:16px"><div class="grille">' +
      '<label class="champ"><span>Date du TP</span><input type="date" name="date_tp" min="' + auj + '" required></label>' +
      '<label class="champ"><span>Créneau</span><select name="creneau" required>' + options(C().creneaux, '', 'Choisir…') + '</select></label>' +
      '<label class="champ"><span>Labo</span><select name="labo" required>' + options(C().labos, '', 'Choisir…') + '</select></label>' +
      '<label class="champ"><span>Classe</span><select name="classe" required>' + options(classesOptions(), '', 'Choisir…') + '</select></label>' +
      '<label class="champ"><span>Discipline</span><select name="discipline" required>' + options(C().disciplines, '', 'Choisir…') + '</select></label>' +
      '<label class="champ"><span>Effectif</span><input type="number" name="effectif" min="1" max="60"></label>' +
      '<label class="champ large"><span>Bloc de compétences visé</span><select name="competence">' + '<option value="">Choisir…</option>' + blocsOptions() + '</select></label>' +
      '<label class="champ large"><span>Titre du TP (verbe d\'action)</span><input name="titre" required placeholder="Ex. : Mesurer la glycémie par spectrophotométrie et valider via CQI"></label>' +
      '<label class="champ large"><span>Besoin matériel et réactifs</span><textarea name="besoin" required placeholder="Réactifs avec référence, quantités par binôme, appareils, consommables"></textarea></label>' +
      '</div><div class="actions"><button class="btn plein" type="submit">Envoyer la demande</button></div></form></details>';
  }

  function vueDemandes() {
    var e = S.etat, auj = aujourdhui(), r = role();
    var lead = r === 'enseignant'
      ? 'Tu décris ton TP ici, la technicienne qui le prend en charge te répond dans le fil de la demande. Plus de demandes perdues dans un tableau partagé.'
      : 'Toutes les demandes des enseignants, avec leur fil d\'échange. Prends en charge, pose tes questions, passe en « prête » quand la paillasse est montée.';
    var h = titre('Préparation des TP', r === 'enseignant' ? 'Mes demandes de TP' : 'Demandes de TP', lead);
    if (r !== 'technicienne') h += formDemande();
    var f = S.filtreDemandes;
    h += '<div class="actions" style="margin:16px 0">' + [['avenir', 'À venir'], ['passees', 'Passées'], ['toutes', 'Toutes']].map(function (x) {
      return '<button class="btn petit' + (f === x[0] ? ' plein' : '') + '" data-act="filtreDemandes" data-v="' + x[0] + '">' + x[1] + '</button>';
    }).join('') + '</div>';
    var liste = (e.demandes || []).filter(function (d) {
      if (f === 'avenir') return d.date_tp >= auj && d.statut !== 'annulee';
      if (f === 'passees') return d.date_tp < auj;
      return true;
    }).sort(function (a, b) { return (a.date_tp + a.creneau).localeCompare(b.date_tp + b.creneau) * (f === 'passees' ? -1 : 1); });
    h += liste.length ? liste.map(carteDemande).join('') : '<p class="vide">Aucune demande.</p>';
    return h;
  }

  function carteDemande(d) {
    var e = S.etat, r = role(), auj = aujourdhui();
    var j = LaboCore.joursEntre(auj, d.date_tp);
    var form = C().formations[d.formation];
    var hors = Number(d.delai_jours) < C().delaiPrepaJours;
    var msgs = (e.messages || []).filter(function (m) { return m.demande_id === d.id; });
    var h = '<article class="carte" id="' + esc(d.id) + '"><div class="tete"><div><p class="label" style="color:var(--violet-profond)">' + esc(jourLisible(d.date_tp)) + ' · ' + esc(d.creneau) + '</p>' +
      '<h3 style="margin-top:4px">' + esc(d.titre) + '</h3></div><div>' + badgeStatut(d.statut) +
      (d.date_tp >= auj && d.statut !== 'annulee' ? ' <span class="badge' + (j <= 2 ? ' encre' : '') + '">' + (j === 0 ? 'Aujourd\'hui' : 'J-' + j) + '</span>' : '') +
      (hors ? ' <span class="badge urgent">Demandée à J-' + esc(d.delai_jours) + '</span>' : '') + '</div></div>' +
      '<p class="meta">' + esc(d.classe) + (form ? ' · ' + esc(form.libelle) : '') + ' · ' + esc(d.labo) + ' · ' + esc(d.discipline) + (d.effectif ? ' · ' + esc(d.effectif) + ' élèves' : '') + '</p>' +
      (d.competence ? '<p class="petit sourd">' + esc(d.competence) + '</p>' : '') +
      '<div class="encart" style="white-space:pre-wrap"><span class="label" style="display:block">Besoin</span>' + esc(d.besoin) + '</div>' +
      '<p class="petit">Enseignant·e : <b>' + esc(d.prof_nom) + '</b> · Préparation : ' + (d.prepa_nom ? '<b>' + esc(d.prepa_nom) + '</b>' : '<span class="badge ambre">Non attribuée</span>') +
      ' · <span class="mono sourd">' + esc(d.id) + '</span></p>';
    var a = [];
    if (r === 'technicienne' && d.statut !== 'annulee' && d.statut !== 'realisee') {
      if (String(d.prepa_id) !== String(S.auth.id)) a.push('<button class="btn petit" data-act="prendre" data-id="' + esc(d.id) + '">Je prends en charge</button>');
      if (d.statut !== 'prete') a.push('<button class="btn petit plein" data-act="statutDemande" data-v="prete" data-id="' + esc(d.id) + '">Marquer prête</button>');
    }
    if (r === 'enseignant' && ['realisee', 'annulee'].indexOf(d.statut) === -1) {
      if (d.date_tp <= auj) a.push('<button class="btn petit plein" data-act="statutDemande" data-v="realisee" data-id="' + esc(d.id) + '">TP réalisé</button>');
      a.push('<button class="btn petit" data-act="statutDemande" data-v="annulee" data-id="' + esc(d.id) + '">Annuler</button>');
    }
    if (r === 'responsable') {
      var techs = (e.utilisateurs || []).filter(function (u) { return u.role === 'technicienne'; });
      a.push('<label class="champ" style="min-width:200px"><span>Attribuer à</span><select data-change="attribuer" data-id="' + esc(d.id) + '">' +
        options(techs.map(function (u) { return { v: u.id, l: u.nom }; }), d.prepa_id, 'Personne') + '</select></label>');
      a.push('<label class="champ" style="min-width:180px"><span>Statut</span><select data-change="statutDemande" data-id="' + esc(d.id) + '">' +
        options(Object.keys(STATUTS).map(function (k) { return { v: k, l: STATUTS[k][0] }; }), d.statut) + '</select></label>');
    }
    if (a.length) h += '<div class="actions" style="align-items:flex-end">' + a.join('') + '</div>';
    h += '<div class="fil"><p class="label" style="margin:0">Échanges (' + msgs.filter(function (m) { return m.role !== 'systeme'; }).length + ')</p>' +
      msgs.map(function (m) {
        return '<div class="msg' + (m.role === 'systeme' ? ' systeme' : '') + '"><span class="mono sourd">' + fmt(m.horodatage, 'dd/MM HH:mm') + '</span> ' +
          (m.role === 'systeme' ? esc(m.user_nom) + ' · ' + esc(m.texte) : '<span class="de">' + esc(m.user_nom) + '</span> : ' + esc(m.texte)) + '</div>';
      }).join('') +
      '<form data-form="message" data-id="' + esc(d.id) + '"><input name="texte" placeholder="Écrire un message…" required aria-label="Message"><button class="btn petit" type="submit">Envoyer</button></form></div></article>';
    return h;
  }

  // ---------------------------------------------------------------------------
  // Rangement
  // ---------------------------------------------------------------------------
  function vueRangement() {
    var e = S.etat, auj = aujourdhui(), r = role();
    var h = titre('Contrôle de fin de TP', r === 'responsable' ? 'Rangements contrôlés' : 'Contrôler le rangement',
      'La feuille d\'émargement papier, poste par poste, devient un contrôle par labo daté et signé. Chaque point non conforme ouvre un incident.');
    if (r === 'technicienne') {
      var duJour = (e.demandes || []).filter(function (d) { return d.date_tp === auj && d.statut !== 'annulee'; });
      h += '<form data-form="rangement" class="carte"><div class="grille">' +
        '<label class="champ"><span>Labo</span><select name="labo" required>' + options(C().labos, (e.sessionOuverte || {}).labo, 'Choisir…') + '</select></label>' +
        '<label class="champ"><span>TP concerné</span><select name="demande_id">' + options(duJour.map(function (d) { return { v: d.id, l: d.creneau + ' · ' + d.classe + ' · ' + d.titre }; }), '', 'Aucun / hors TP') + '</select></label></div>' +
        '<div class="actions" style="justify-content:space-between;align-items:center"><p class="label" style="margin:0">Points de contrôle</p><button type="button" class="btn petit" data-act="toutOk">Tout conforme</button></div>' +
        C().controlesRangement.map(function (c, i) {
          return '<div class="controle"><span>' + esc(c) + '</span><div class="seg" role="radiogroup" aria-label="' + esc(c) + '">' +
            [['ok', 'OK'], ['nc', 'NC'], ['na', 'N/A']].map(function (o) {
              return '<label><input type="radio" name="c' + i + '" value="' + o[0] + '"><span class="' + o[0] + '">' + o[1] + '</span></label>';
            }).join('') + '</div></div>';
        }).join('') +
        '<label class="champ" style="margin-top:16px"><span>Remarques</span><textarea name="remarques" placeholder="Ex. : poste 7, bécher cassé ; DASRI plein"></textarea></label>' +
        '<div class="actions"><button class="btn plein" type="submit">Enregistrer le contrôle</button></div></form>';
    }
    var liste = (e.rangements || []).slice().reverse();
    h += '<h2>Derniers contrôles</h2>' + (liste.length ? '<div class="tableau-wrap"><table><thead><tr><th>Date</th><th>Labo</th><th>Par</th><th>Non conformes</th><th>Remarques</th></tr></thead><tbody>' +
      liste.slice(0, 80).map(function (x) {
        var c = {}; try { c = JSON.parse(x.controles); } catch (err) { /* ligne ancienne */ }
        var nc = Object.keys(c).filter(function (k) { return c[k] === 'nc'; });
        return '<tr><td class="mono">' + fmt(x.horodatage, 'dd/MM/yyyy HH:mm') + '</td><td>' + esc(x.labo) + '</td><td>' + esc(x.user_nom) + '</td><td>' +
          (nc.length ? '<span class="badge urgent">' + nc.length + ' NC</span> ' + esc(nc.join(', ')) : '<span class="badge vert">Conforme</span>') + '</td><td>' + esc(x.remarques) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="vide">Aucun contrôle enregistré.</p>');
    return h;
  }

  // ---------------------------------------------------------------------------
  // Incidents
  // ---------------------------------------------------------------------------
  var GRAV = { Faible: '', 'Gênant': 'ambre', Bloquant: 'urgent' };
  var ST_INC = { ouvert: ['Ouvert', 'ambre'], en_cours: ['En cours', 'violet'], resolu: ['Résolu', 'vert'] };

  function vueIncidents() {
    var e = S.etat, r = role();
    var h = titre('Problèmes au labo', r === 'responsable' ? 'Incidents' : 'Signaler un problème',
      'Panne, casse, rupture de stock, réactif périmé, souci d\'hygiène : un signalement daté remplace le message oral oublié. Un incident « bloquant » part aussi par e-mail à la responsable.');
    h += '<form data-form="incident" class="carte"><div class="grille">' +
      '<label class="champ"><span>Labo</span><select name="labo">' + options(C().labos, '', 'Général / hors labo') + '</select></label>' +
      '<label class="champ"><span>Catégorie</span><select name="categorie" required>' + options(C().categoriesIncident, '', 'Choisir…') + '</select></label>' +
      '<label class="champ"><span>Gravité</span><select name="gravite">' + options(C().gravites, 'Gênant') + '</select></label>' +
      '<label class="champ large"><span>Description</span><textarea name="description" required placeholder="Quoi, où, depuis quand, référence du réactif ou n° de l\'appareil"></textarea></label>' +
      '</div><div class="actions"><button class="btn plein" type="submit">Signaler</button></div></form>';
    var f = S.filtreIncidents;
    h += '<h2>Suivi</h2><div class="actions" style="margin-bottom:12px">' + [['ouverts', 'Non résolus'], ['tous', 'Tous']].map(function (x) {
      return '<button class="btn petit' + (f === x[0] ? ' plein' : '') + '" data-act="filtreIncidents" data-v="' + x[0] + '">' + x[1] + '</button>';
    }).join('') + '</div>';
    var ordre = { Bloquant: 0, 'Gênant': 1, Faible: 2 };
    var liste = (e.incidents || []).filter(function (i) { return f === 'tous' || i.statut !== 'resolu'; })
      .sort(function (a, b) { return (ordre[a.gravite] - ordre[b.gravite]) || (a.horodatage < b.horodatage ? 1 : -1); });
    h += liste.length ? liste.map(function (i) {
      var st = ST_INC[i.statut] || [i.statut, ''];
      var x = '<article class="carte"><div class="tete"><div><p class="label">' + esc(i.categorie) + (i.labo ? ' · ' + esc(i.labo) : '') + '</p>' +
        '<p style="margin:4px 0 0;white-space:pre-wrap">' + esc(i.description) + '</p></div><div><span class="badge ' + GRAV[i.gravite] + '">' + esc(i.gravite) + '</span> <span class="badge ' + st[1] + '">' + st[0] + '</span></div></div>' +
        '<p class="meta">' + esc(i.user_nom) + ' · <span class="mono">' + fmt(i.horodatage, 'dd/MM/yyyy HH:mm') + '</span> · <span class="mono">' + esc(i.id) + '</span>' +
        (i.traite_par ? ' · suivi par ' + esc(i.traite_par) : '') + '</p>' +
        (i.resolution ? '<div class="encart vert"><b>Résolution' + (i.resolu_le ? ' du ' + fmt(i.resolu_le, 'dd/MM/yyyy') : '') + ' :</b> ' + esc(i.resolution) + '</div>' : '');
      if (r !== 'enseignant' && i.statut !== 'resolu') {
        x += '<form data-form="majIncident" data-id="' + esc(i.id) + '" class="actions" style="align-items:flex-end">' +
          '<label class="champ" style="flex:1;min-width:220px"><span>Ce qui a été fait</span><input name="resolution" placeholder="Ex. : lampe changée, commande passée chez Sordalab"></label>' +
          (i.statut === 'ouvert' ? '<button class="btn petit" type="submit" name="statut" value="en_cours">Je m\'en occupe</button>' : '') +
          '<button class="btn petit plein" type="submit" name="statut" value="resolu">Résolu</button></form>';
      }
      return x + '</article>';
    }).join('') : '<p class="vide">Aucun incident.</p>';
    return h;
  }

  // ---------------------------------------------------------------------------
  // Heures et facturation
  // ---------------------------------------------------------------------------
  var ST_SES = { en_cours: ['En cours', 'violet'], a_valider: ['À valider', 'ambre'], validee: ['Validée', 'vert'], contestee: ['Contestée', 'urgent'] };
  var SOURCES = { badge: 'Badge', hors_ligne: 'Badge hors connexion', saisie_manuelle: 'Saisie après coup' };

  function vueHeures() {
    var r = role(), e = S.etat;
    var techs = (e.utilisateurs || []).filter(function (u) { return u.role === 'technicienne'; });
    var rel = S.releve;
    var h = titre('Relevé mensuel', r === 'responsable' ? 'Heures et facturation' : 'Mes heures',
      r === 'responsable'
        ? 'Seules les présences validées entrent dans le relevé. Imprime-le ou exporte-le pour le rapprocher de la facture de la prestataire.'
        : 'Ce relevé reprend tes présences du mois. Les heures <b>validées</b> sont celles à facturer ; tu peux joindre le relevé imprimé à ta facture.');
    h += '<form data-form="releve" class="actions" style="align-items:flex-end">' +
      (r === 'responsable' ? '<label class="champ" style="min-width:220px"><span>Prestataire</span><select name="user_id" required>' +
        options(techs.map(function (u) { return { v: u.id, l: u.nom }; }), rel ? rel.prestataire.id : (techs[0] || {}).id) + '</select></label>' : '') +
      '<label class="champ"><span>Mois</span><input type="month" name="mois" value="' + esc(rel ? rel.mois : moisCourant()) + '" required></label>' +
      '<button class="btn plein" type="submit">Afficher</button></form>';
    if (!rel) return h + '<p class="vide">Chargement du relevé…</p>';
    h += '<div class="chiffres">' +
      '<div class="chiffre accent"><b>' + nombre(rel.heures_validees) + '</b><span>heures validées · ' + esc(rel.prestataire.nom) + '</span></div>' +
      (rel.prestataire.taux_horaire ? '<div class="chiffre"><b>' + nombre(rel.montant_ht) + ' €</b><span>HT au taux de ' + nombre(rel.prestataire.taux_horaire) + ' €/h (feuille Utilisateurs)</span></div>' : '') +
      '<div class="chiffre"><b>' + rel.non_validees + '</b><span>présence(s) non validée(s) ce mois</span></div></div>';
    if (rel.non_validees) h += '<div class="encart ambre">' + rel.non_validees + ' présence(s) ne sont pas encore validées : elles ne comptent pas dans le total.</div>';
    h += rel.sessions.length ? '<div class="tableau-wrap"><table><thead><tr><th>Date</th><th>Arrivée</th><th>Départ</th><th class="num">Durée</th><th>Labo</th><th>Missions</th><th>Origine</th><th>Statut</th>' + (r === 'responsable' ? '<th></th>' : '') + '</tr></thead><tbody>' +
      rel.sessions.map(function (s) {
        var st = ST_SES[s.statut] || [s.statut, ''];
        return '<tr><td>' + esc(jourLisible(s.date)) + '</td><td class="mono">' + fmt(s.arrivee, 'HH:mm') + '</td><td class="mono">' + fmt(s.depart, 'HH:mm') + '</td>' +
          '<td class="num">' + (s.depart ? duree(s.duree_min) : '') + '</td><td>' + esc(s.labo) + '</td><td class="petit">' + esc(String(s.missions).split(' | ').join(', ')) +
          (s.commentaire ? '<br><span class="sourd">' + esc(s.commentaire) + '</span>' : '') + '</td>' +
          '<td class="petit">' + esc(SOURCES[s.source] || s.source) + (s.corrections ? '<br><span class="sourd">' + esc(s.corrections) + '</span>' : '') + '</td>' +
          '<td><span class="badge ' + st[1] + '">' + st[0] + '</span>' + (s.motif_validation ? '<br><span class="petit sourd">' + esc(s.motif_validation) + '</span>' : '') + '</td>' +
          (r === 'responsable' ? '<td>' + boutonsValidation(s) + '</td>' : '') + '</tr>';
      }).join('') + '</tbody><tfoot><tr><td colspan="3">Total validé</td><td class="num">' + duree(rel.minutes_validees) + '</td><td colspan="' + (r === 'responsable' ? 5 : 4) + '"></td></tr></tfoot></table></div>' +
      '<div class="actions"><button class="btn" data-act="csv">Exporter en CSV</button><button class="btn" data-act="imprimer">Imprimer le relevé</button></div>'
      : '<p class="vide">Aucune présence ce mois-ci.</p>';
    return h;
  }

  function boutonsValidation(s) {
    if (s.statut === 'en_cours') return '';
    var b = '';
    if (s.statut !== 'validee') b += '<button class="btn petit plein" data-act="valider" data-id="' + esc(s.id) + '">Valider</button> ';
    if (s.statut !== 'contestee') b += '<button class="btn petit" data-act="contester" data-id="' + esc(s.id) + '">Contester</button>';
    return '<div class="actions" style="margin:0;flex-wrap:nowrap">' + b + '</div>';
  }

  function chargerReleve(userId, mois) {
    var data = { mois: mois || (S.releve ? S.releve.mois : moisCourant()) };
    if (role() === 'responsable') {
      var techs = (S.etat.utilisateurs || []).filter(function (u) { return u.role === 'technicienne'; });
      data.user_id = userId || (S.releve ? S.releve.prestataire.id : (techs[0] || {}).id);
      if (!data.user_id) { toast('Aucune technicienne dans la feuille Utilisateurs.', true); return; }
    }
    S.releveEnCours = true;
    api('releve', data).then(function (r) {
      S.releveEnCours = false;
      if (!r.ok) return toast(r.error, true);
      S.releve = r.data;
      rendre();
    });
  }

  function csv() {
    var rel = S.releve;
    var lignes = [['Prestataire', 'Date', 'Arrivée', 'Départ', 'Durée (h)', 'Labo', 'Missions', 'Origine', 'Corrections', 'Statut', 'Validé par', 'Référence']];
    rel.sessions.forEach(function (s) {
      lignes.push([rel.prestataire.nom, s.date, fmt(s.arrivee, 'HH:mm'), fmt(s.depart, 'HH:mm'),
        String(Math.round((Number(s.duree_min) || 0) / 60 * 100) / 100).replace('.', ','), s.labo, s.missions, SOURCES[s.source] || s.source,
        s.corrections, (ST_SES[s.statut] || [s.statut])[0], s.valide_par, s.id]);
    });
    var txt = '﻿' + lignes.map(function (l) { return l.map(function (c) { return '"' + String(c || '').replace(/"/g, '""') + '"'; }).join(';'); }).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
    a.download = 'releve-' + rel.mois + '-' + rel.prestataire.nom.replace(/\W+/g, '-') + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  function imprimer() {
    var rel = S.releve;
    var val = rel.sessions.filter(function (s) { return s.statut === 'validee'; });
    var moisLib = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(+rel.mois.slice(0, 4), +rel.mois.slice(5, 7) - 1, 1)));
    document.getElementById('imprimable').innerHTML =
      '<p class="sur">aurlom BTS+ · Laboratoires de TP · BTS BioAC (RNCP38884) et BTS BM (RNCP40027)</p>' +
      '<h1>Relevé de prestations<span class="point">.</span></h1>' +
      '<p><b>Prestataire :</b> ' + esc(rel.prestataire.nom) + ' · <b>Période :</b> ' + esc(moisLib) + '</p>' +
      '<table><thead><tr><th>Date</th><th>Arrivée</th><th>Départ</th><th class="num">Durée</th><th>Labo</th><th>Missions</th><th>Réf.</th></tr></thead><tbody>' +
      val.map(function (s) {
        return '<tr><td>' + esc(jourLisible(s.date)) + '</td><td>' + fmt(s.arrivee, 'HH:mm') + '</td><td>' + fmt(s.depart, 'HH:mm') + '</td><td class="num">' + duree(s.duree_min) + '</td><td>' + esc(s.labo) + '</td><td>' + esc(String(s.missions).split(' | ').join(', ')) + '</td><td class="mono">' + esc(s.id) + '</td></tr>';
      }).join('') + '</tbody><tfoot><tr><td colspan="3">Total</td><td class="num">' + duree(rel.minutes_validees) + '</td><td colspan="3">' +
      nombre(rel.heures_validees) + ' h' + (rel.prestataire.taux_horaire ? ' × ' + nombre(rel.prestataire.taux_horaire) + ' €/h = ' + nombre(rel.montant_ht) + ' € HT' : '') + '</td></tr></tfoot></table>' +
      (rel.non_validees ? '<p>' + rel.non_validees + ' présence(s) du mois non validée(s) à la date d\'édition, non incluses.</p>' : '') +
      '<div class="signatures"><div>Pour Aurlom BTS+, service fait<br>Nom, date, signature</div><div>La prestataire<br>Nom, date, signature</div></div>' +
      '<div class="pied"><span>Édité le ' + fmt(rel.edite_le, 'dd/MM/yyyy à HH:mm') + ' depuis le suivi labo · horodatages serveur</span><span class="mono">' + esc(rel.mois) + '</span></div>';
    window.print();
  }

  // ---------------------------------------------------------------------------
  // Tableau de bord (responsable)
  // ---------------------------------------------------------------------------
  function vueTableau() {
    var e = S.etat, auj = aujourdhui();
    var aValider = (e.sessions || []).filter(function (s) { return s.statut === 'a_valider'; });
    var incOuverts = (e.incidents || []).filter(function (i) { return i.statut !== 'resolu'; });
    var bloquants = incOuverts.filter(function (i) { return i.gravite === 'Bloquant'; });
    var avenir = (e.demandes || []).filter(function (d) { return d.date_tp >= auj && ['annulee', 'realisee'].indexOf(d.statut) === -1; });
    var sansPrepa = avenir.filter(function (d) { return !d.prepa_id && LaboCore.joursEntre(auj, d.date_tp) <= 7; });
    var horsDelai = avenir.filter(function (d) { return Number(d.delai_jours) < C().delaiPrepaJours; });
    var h = titre(jourLisible(auj), 'Où en est le labo', 'Ce qui demande ton attention aujourd\'hui. Les chiffres se mettent à jour à chaque ouverture de l\'onglet.');
    h += '<div class="chiffres">' +
      '<div class="chiffre"><b>' + (e.presentes || []).length + '</b><span>technicienne(s) présente(s)</span></div>' +
      '<div class="chiffre' + (aValider.length ? ' accent' : '') + '"><b>' + aValider.length + '</b><span>présence(s) à valider</span></div>' +
      '<div class="chiffre"><b>' + incOuverts.length + '</b><span>incident(s) non résolu(s), dont ' + bloquants.length + ' bloquant(s)</span></div>' +
      '<div class="chiffre"><b>' + sansPrepa.length + '</b><span>TP dans les 7 jours sans préparatrice</span></div></div>';

    h += '<h2>Présentes en ce moment</h2>' + ((e.presentes || []).length ? '<div class="tableau-wrap"><table><thead><tr><th>Qui</th><th>Arrivée</th><th>Labo</th><th>Origine</th></tr></thead><tbody>' +
      e.presentes.map(function (s) { return '<tr><td>' + esc(s.user_nom) + '</td><td class="mono">' + fmt(s.arrivee, 'dd/MM HH:mm') + '</td><td>' + esc(s.labo) + '</td><td>' + esc(SOURCES[s.source] || '') + '</td></tr>'; }).join('') +
      '</tbody></table></div>' : '<p class="vide">Personne au labo.</p>');

    h += '<h2>Présences à valider</h2>' + (aValider.length ? '<div class="tableau-wrap"><table><thead><tr><th>Qui</th><th>Date</th><th>Horaires</th><th class="num">Durée</th><th>Missions</th><th>À vérifier</th><th></th></tr></thead><tbody>' +
      aValider.sort(function (a, b) { return a.arrivee < b.arrivee ? -1 : 1; }).map(function (s) {
        return '<tr><td>' + esc(s.user_nom) + '</td><td>' + esc(jourLisible(s.date)) + '</td><td class="mono">' + fmt(s.arrivee, 'HH:mm') + '–' + fmt(s.depart, 'HH:mm') + '</td><td class="num">' + duree(s.duree_min) + '</td>' +
          '<td class="petit">' + esc(String(s.missions).split(' | ').join(', ')) + (s.commentaire ? '<br><span class="sourd">' + esc(s.commentaire) + '</span>' : '') + '</td>' +
          '<td class="petit">' + (s.source !== 'badge' ? '<span class="badge ambre">' + esc(SOURCES[s.source]) + '</span> ' : '') + esc(s.corrections) + '</td><td>' + boutonsValidation(s) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="vide">Rien à valider.</p>');

    if (bloquants.length) {
      h += '<h2>Incidents bloquants</h2>' + bloquants.map(function (i) {
        return '<div class="encart urgent"><b>' + esc(i.categorie) + ' · ' + esc(i.labo) + '</b> (' + esc(i.user_nom) + ', ' + fmt(i.horodatage, 'dd/MM HH:mm') + ') : ' + esc(i.description) + '</div>';
      }).join('');
    }
    if (sansPrepa.length || horsDelai.length) {
      h += '<h2>Demandes de TP à surveiller</h2><div class="tableau-wrap"><table><thead><tr><th>TP</th><th>Date</th><th>Classe</th><th>Enseignant·e</th><th>Alerte</th></tr></thead><tbody>' +
        avenir.filter(function (d) { return sansPrepa.indexOf(d) !== -1 || horsDelai.indexOf(d) !== -1; }).map(function (d) {
          return '<tr><td>' + esc(d.titre) + '</td><td>' + esc(jourLisible(d.date_tp)) + '<br><span class="petit sourd">' + esc(d.creneau) + '</span></td><td>' + esc(d.classe) + '</td><td>' + esc(d.prof_nom) + '</td><td>' +
            (sansPrepa.indexOf(d) !== -1 ? '<span class="badge ambre">Sans préparatrice</span> ' : '') +
            (horsDelai.indexOf(d) !== -1 ? '<span class="badge urgent">Demandée à J-' + esc(d.delai_jours) + '</span>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    return h;
  }

  // ---------------------------------------------------------------------------
  // Événements
  // ---------------------------------------------------------------------------
  function valeurs(form) {
    var o = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.disabled || el.type === 'submit') return;
      if (el.type === 'checkbox') { if (!o[el.name]) o[el.name] = []; if (el.checked) o[el.name].push(el.value); return; }
      if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; return; }
      o[el.name] = el.value;
    });
    return o;
  }

  app.addEventListener('submit', function (ev) {
    var form = ev.target, type = form.getAttribute('data-form');
    if (!type) return;
    ev.preventDefault();
    var v = valeurs(form);
    if (ev.submitter && ev.submitter.name) v[ev.submitter.name] = ev.submitter.value;
    switch (type) {
      case 'connexion':
        S.auth = { id: v.id, pin: v.pin };
        api('connexion').then(function (r) {
          if (!r.ok) { S.auth = null; return toast(r.error, true); }
          S.auth.nom = r.data.moi.nom; S.auth.role = r.data.moi.role;
          ecrire(CLE_AUTH, S.auth);
          S.onglet = null; S.releve = null;
          charger();
        });
        break;
      case 'arrivee': agir('arrivee', v, 'Arrivée enregistrée.'); break;
      case 'depart':
        if (v.heure_depart && !confirm('Départ à ' + v.heure_depart + ' saisi à la main : il sera signalé à la validation. Confirmer ?')) return;
        agir('depart', v, 'Départ enregistré. Bonne fin de journée.');
        break;
      case 'saisieManuelle': agir('saisieManuelle', v, 'Présence envoyée en validation.'); break;
      case 'demande': agir('demande', v, 'Demande envoyée.'); break;
      case 'message': agir('message', { demande_id: form.getAttribute('data-id'), texte: v.texte }); break;
      case 'incident': agir('incident', v, 'Signalement enregistré.'); break;
      case 'majIncident': agir('majIncident', { id: form.getAttribute('data-id'), statut: v.statut, resolution: v.resolution }, 'Incident mis à jour.'); break;
      case 'releve': chargerReleve(v.user_id, v.mois); break;
      case 'rangement':
        var controles = {};
        C().controlesRangement.forEach(function (c, i) { if (v['c' + i]) controles[c] = v['c' + i]; });
        var manquants = C().controlesRangement.length - Object.keys(controles).length;
        if (manquants && !confirm(manquants + ' point(s) sans réponse seront notés « N/A ». Continuer ?')) return;
        agir('rangement', { labo: v.labo, demande_id: v.demande_id, controles: controles, remarques: v.remarques }, 'Contrôle enregistré.');
        break;
    }
  });

  app.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-act],[data-onglet]');
    if (!t) return;
    if (t.hasAttribute('data-onglet')) {
      S.onglet = t.getAttribute('data-onglet');
      return charger();
    }
    var id = t.getAttribute('data-id'), v = t.getAttribute('data-v');
    switch (t.getAttribute('data-act')) {
      case 'deconnexion': ecrire(CLE_AUTH, null); S.auth = null; S.etat = null; S.releve = null; S.annuaire = null; rendre(); break;
      case 'reinit':
        if (confirm('Effacer les données de démonstration et repartir des exemples ?')) {
          LaboNav.reinitialiser(); demoCore = LaboCore.create(LaboNav.store(), LaboNav.env); LaboNav.amorcer(demoCore);
          S.releve = null; charger();
        }
        break;
      case 'recharger': charger(); break;
      case 'filtreDemandes': S.filtreDemandes = v; rendre(); break;
      case 'filtreIncidents': S.filtreIncidents = v; rendre(); break;
      case 'prendre': agir('majDemande', { id: id, prendre: true }, 'Demande prise en charge.'); break;
      case 'statutDemande':
        if (v === 'annulee' && !confirm('Annuler cette demande ?')) return;
        agir('majDemande', { id: id, statut: v }, 'Statut mis à jour.');
        break;
      case 'toutOk': Array.prototype.forEach.call(app.querySelectorAll('.seg input[value="ok"]'), function (i) { i.checked = true; }); break;
      case 'valider': agir('validerSession', { id: id, decision: 'validee' }, 'Présence validée.').then(function () { if (S.releve) chargerReleve(); }); break;
      case 'contester':
        var motif = prompt('Motif de la contestation (visible par la prestataire) :');
        if (motif) agir('validerSession', { id: id, decision: 'contestee', motif: motif }, 'Présence contestée.').then(function () { if (S.releve) chargerReleve(); });
        break;
      case 'csv': csv(); break;
      case 'imprimer': imprimer(); break;
    }
  });

  app.addEventListener('change', function (ev) {
    var t = ev.target, act = t.getAttribute('data-change');
    if (act === 'attribuer') agir('majDemande', { id: t.getAttribute('data-id'), prepa_id: t.value }, 'Demande attribuée.');
    if (act === 'statutDemande') agir('majDemande', { id: t.getAttribute('data-id'), statut: t.value }, 'Statut mis à jour.');
  });

  function apresRendu() {
    if (S.onglet === 'heures' && !S.releve && !S.releveEnCours) chargerReleve();
  }

  // Horloge et durée en direct
  setInterval(function () {
    var h = document.getElementById('horloge');
    if (h) h.textContent = LaboNav.format(new Date(), 'HH:mm');
    var d = document.getElementById('duree');
    if (d) d.textContent = duree(Math.round((Date.now() - new Date(d.getAttribute('data-depuis'))) / 60000));
  }, 15000);

  // Rafraîchissement discret (messages, présences) quand aucun champ n'est en cours de saisie
  setInterval(function () {
    if (!S.auth || document.hidden || S.occupe) return;
    var a = document.activeElement;
    if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
    if (app.querySelector('details[open]')) return;
    charger();
  }, 90000);

  window.addEventListener('online', function () { if (S.auth) charger(); });

  if (S.auth) charger(); else rendre();
})();
