/* Suivi labo Aurlom BTS+ — interface. */
(function () {
  'use strict';

  // Mode normal : page servie par Google Apps Script (comptes de l'école uniquement),
  // les appels passent par google.script.run. API_URL ne sert qu'à l'ancien mode
  // par PIN, fermé par défaut côté serveur. Ni l'un ni l'autre : démonstration.
  var API_URL = '';

  var GOOGLE = typeof google !== 'undefined' && google.script && google.script.run ? true : false;
  var DEMO = !GOOGLE && !API_URL;
  var CLE_SESSION = 'labo-session-v2';
  var CLE_FILE = 'labo-file-attente';
  var demoCore = null;
  if (DEMO) { demoCore = LaboCore.create(LaboNav.store(), LaboNav.env); LaboNav.amorcer(demoCore); }

  var S = {
    session: GOOGLE ? { jeton: 'google' } : lire(CLE_SESSION), etat: null, erreurAcces: '', onglet: null, releve: null, releveEnCours: false,
    filtres: { demandes: 'avenir', incidents: 'ouverts', inventaire: '', invFiliere: '', invAlerte: false, commandes: 'actives', progFiliere: '', progTout: false },
    programmeComplet: null, preDemande: null, preCommande: null, occupe: false
  };
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
  function jourLisible(d) {
    if (!d) return '';
    var x = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)));
    return JOURS[x.getUTCDay()] + ' ' + d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4);
  }
  function dateCourte(d) { return d ? d.slice(8, 10) + '/' + d.slice(5, 7) : ''; }
  function duree(min) { min = Number(min) || 0; var h = Math.floor(min / 60), m = min % 60; return h + ' h ' + (m < 10 ? '0' : '') + m; }
  var nf2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
  function euros(n) { return nf2.format(Number(n) || 0) + ' €'; }
  function num(n) { return nf.format(Number(n) || 0); }
  function aujourdhui() { return LaboNav.format(new Date(), 'yyyy-MM-dd'); }
  function moisCourant() { return LaboNav.format(new Date(), 'yyyy-MM'); }
  function plusJours(n) { return LaboNav.format(new Date(Date.now() + n * 86400000), 'yyyy-MM-dd'); }
  function options(l, choisi, vide) {
    return (vide !== undefined ? '<option value="">' + esc(vide) + '</option>' : '') + l.map(function (x) {
      var v = typeof x === 'string' ? x : x.v, t = typeof x === 'string' ? x : x.l;
      return '<option value="' + esc(v) + '"' + (String(v) === String(choisi) ? ' selected' : '') + '>' + esc(t) + '</option>';
    }).join('');
  }
  function C() { return S.etat.config; }
  function moi() { return S.etat.moi; }
  function peut(d) { return !!(S.etat && S.etat.moi.droits[d]); }
  function filLib(f) { return f && C().filieres[f] ? C().filieres[f].court : (f || 'Commun'); }
  // Logo officiel (design system) : fichier à côté de la page, ou image intégrée dans Page.html.
  var LOGO = typeof LOGO_DATA !== 'undefined' ? LOGO_DATA : 'logo-aurlom.png';
  function logo(h) { return '<img class="logo" src="' + LOGO + '" alt="aurlom" height="' + (h || 28) + '">'; }
  // Étiquette de filière : BIOMED violet nuit, BIOALC encre, Commun pierre.
  function tagFiliere(f) {
    var l = LaboCore.filieresDe({ filiere: f });
    if (!l.length) return '<span class="filiere f-commun">Commun</span>';
    return l.map(function (x) { return '<span class="filiere f-' + x.toLowerCase() + '">' + x + '</span>'; }).join(' ');
  }
  // Code couleur d'une carte : filet gauche de 3 px dans la couleur de son état.
  function carte(etat, attrs) { return '<article class="carte' + (etat ? ' etat-' + etat : '') + '"' + (attrs || '') + '>'; }
  function badge(t, cls) { return '<span class="badge ' + (cls || '') + '">' + esc(t) + '</span>'; }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  // Boîte de dialogue intégrée à la page (les fenêtres natives peuvent être bloquées
  // dans la page servie par Google). Renvoie une promesse : true / texte / null.
  function boite(message, o) {
    o = o || {};
    return new Promise(function (fin) {
      var d = document.createElement('dialog');
      d.className = 'boite';
      d.setAttribute('aria-label', message);
      var champ = '';
      if (o.saisie) champ = '<label class="champ"><span>' + esc(o.saisie) + '</span><input id="boite-v" ' + (o.nombre ? 'type="number" step="any" inputmode="decimal"' : '') + ' value="' + esc(o.defaut === undefined ? '' : o.defaut) + '"></label>';
      if (o.choix) champ = '<div class="cases" style="grid-template-columns:1fr">' + o.choix.map(function (c, i) { return '<label class="case"><input type="radio" name="boite-c" value="' + esc(c) + '"' + (i === 0 ? ' checked' : '') + '><span>' + esc(c) + '</span></label>'; }).join('') + '</div>';
      d.innerHTML = '<p>' + esc(message) + '</p>' + champ + '<p class="petit" id="boite-err" style="color:var(--violet-profond)"></p>' +
        '<div class="actions"><button type="button" class="btn" data-r="non">Annuler</button><button type="button" class="btn plein" data-r="oui">' + esc(o.ok || 'Confirmer') + '</button></div>';
      document.body.appendChild(d);
      function fermer(oui) {
        var v = null;
        if (oui) {
          if (o.saisie) {
            v = d.querySelector('#boite-v').value.trim();
            if (o.requis && !v) { d.querySelector('#boite-err').textContent = 'Ce champ est obligatoire.'; return; }
          } else if (o.choix) v = d.querySelector('input[name="boite-c"]:checked').value;
          else v = true;
        }
        d.close(); d.remove(); fin(v);
      }
      d.addEventListener('click', function (e) { var b = e.target.closest('[data-r]'); if (b) fermer(b.getAttribute('data-r') === 'oui'); });
      d.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'radio') { e.preventDefault(); fermer(true); } });
      d.addEventListener('cancel', function (e) { e.preventDefault(); fermer(false); });
      d.showModal();
      var f = d.querySelector('input'); if (f) f.focus();
    });
  }

  var toastTimer;
  function toast(msg, err) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast' + (err ? ' erreur' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast cache'; }, err ? 6500 : 3500);
  }

  // ---------------------------------------------------------------------------
  // Serveur
  // ---------------------------------------------------------------------------
  function envoyer(req) {
    if (DEMO) return Promise.resolve(demoCore.handle(JSON.parse(JSON.stringify(req))));
    if (GOOGLE) {
      return new Promise(function (ok, ko) {
        google.script.run.withSuccessHandler(ok).withFailureHandler(ko).appel({ action: req.action, data: req.data });
      });
    }
    return fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(req), credentials: 'omit', referrerPolicy: 'no-referrer' })
      .then(function (r) { return r.json(); });
  }

  function api(action, data) {
    var req = { action: action, jeton: S.session ? S.session.jeton : null, data: data || {} };
    return envoyer(req).then(function (r) {
      if (!r.ok && /Session expirée|Compte désactivé|n'est pas autorisé|Accès réservé|non identifié/.test(r.error)) {
        if (GOOGLE) { S.erreurAcces = r.error; S.etat = null; } else finSession();
      }
      return r;
    }).catch(function () {
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

  function finSession() { if (GOOGLE) return; ecrire(CLE_SESSION, null); S.session = null; S.etat = null; S.releve = null; rendre(); }

  function viderFile() {
    var file = lire(CLE_FILE) || [];
    if (!file.length || DEMO || !S.session) return Promise.resolve();
    var reste = [];
    return file.reduce(function (p, req) {
      return p.then(function () {
        req.jeton = S.session.jeton;
        return envoyer(req).then(function (r) { if (!r.ok) toast('Badge hors connexion refusé : ' + r.error, true); })
          .catch(function () { reste.push(req); });
      });
    }, Promise.resolve()).then(function () {
      ecrire(CLE_FILE, reste.length ? reste : null);
      if (file.length > reste.length) toast((file.length - reste.length) + ' badge(s) hors connexion envoyé(s).');
    });
  }

  function charger() {
    return viderFile().then(function () { return api('etat'); }).then(function (r) {
      if (r.ok) S.etat = r.data;
      else if (S.session) toast(r.error, true);
      rendre();
    });
  }

  function agir(action, data, msgOk) {
    if (S.occupe) return Promise.resolve(null);
    S.occupe = true;
    return api(action, data).then(function (r) {
      S.occupe = false;
      if (!r.ok) { toast(r.error, true); return null; }
      if (r.enAttente) toast('Pas de réseau : badge gardé sur ce téléphone avec son heure, envoi automatique au retour du réseau.');
      else if (msgOk) toast(msgOk);
      return charger().then(function () { return r.data || true; });
    });
  }

  // ---------------------------------------------------------------------------
  // Structure
  // ---------------------------------------------------------------------------
  function onglets() {
    var o = [];
    if (peut('voirEquipe')) o.push(['tableau', 'Tableau de bord']);
    if (peut('badge')) o.push(['presence', 'Présence']);
    o.push(['demandes', moi().role === 'enseignant' ? 'Mes demandes de TP' : 'Demandes de TP']);
    o.push(['programme', 'Programme']);
    o.push(['inventaire', 'Inventaire']);
    o.push(['commandes', 'Commandes']);
    if (peut('rangement') || peut('voirEquipe')) o.push(['rangement', 'Rangement']);
    o.push(['incidents', peut('traiterIncident') ? 'Incidents' : 'Signaler']);
    if (peut('badge')) o.push(['heures', 'Mes heures']);
    if (peut('voirEquipe')) o.push(['heures', peut('facturation') ? 'Heures et facturation' : 'Activité des techniciennes']);
    return o;
  }

  function compteurs() {
    var e = S.etat, c = {}, auj = aujourdhui();
    var inc = (e.incidents || []).filter(function (i) { return i.statut !== 'resolu'; }).length;
    if (inc && peut('traiterIncident')) c.incidents = inc;
    if (peut('preparerTP') || peut('piloterTP')) c.demandes = (e.demandes || []).filter(function (d) { return d.statut === 'demandee' && d.date_tp >= auj; }).length;
    if (peut('validerPresence')) c.heures = (e.sessions || []).filter(function (s) { return s.statut === 'a_valider'; }).length;
    if (peut('approuverCommande')) c.commandes = (e.commandes || []).filter(function (x) { return x.statut === 'soumise' && (String(x.user_id) !== String(moi().id) || moi().role === 'directeur'); }).length;
    else if (peut('suivreCommande')) c.commandes = (e.commandes || []).filter(function (x) { return x.statut === 'approuvee'; }).length;
    c.inventaire = alertesStock().length;
    return c;
  }

  function rendre() {
    if (S.erreurAcces) { app.innerHTML = '<div class="connexion">' + titre('aurlom BTS+ · Suivi labo', 'Accès refusé', '') + '<div class="encart urgent">' + esc(S.erreurAcces) + '</div></div>'; return; }
    if (!S.session) return rendreConnexion();
    if (!S.etat) { app.innerHTML = '<p class="vide">Chargement…</p>'; return; }
    var ongl = onglets();
    if (!S.onglet || !ongl.some(function (o) { return o[0] === S.onglet; })) S.onglet = ongl[0][0];
    var cpt = compteurs();
    var h = '<header class="entete"><div class="marque">' + logo() + '<p class="sur">BTS+ · Suivi labo</p></div>' +
      '<div class="qui"><b>' + esc(moi().nom) + '</b> · ' + esc(C().roles[moi().role]) + (moi().filiere ? ' ' + esc(LaboCore.filieresDe(moi()).join(' et ')) : '') +
      (GOOGLE ? '' : ' · <button class="btn lien" data-act="deconnexion">Se déconnecter</button>') + '</div></header>';
    if (DEMO) h += '<div class="demo"><span><b>Démonstration.</b> Données fictives, stockées dans ce navigateur.</span><button class="btn petit" data-act="reinit">Réinitialiser la démo</button></div>';
    h += '<nav class="onglets" role="tablist">' + ongl.map(function (o) {
      return '<button role="tab" data-onglet="' + o[0] + '" aria-selected="' + (S.onglet === o[0]) + '">' + esc(o[1]) +
        (cpt[o[0]] ? '<span class="compte">' + cpt[o[0]] + '</span>' : '') + '</button>';
    }).join('') + '</nav>';
    var vues = { tableau: vueTableau, presence: vuePresence, demandes: vueDemandes, programme: vueProgramme, inventaire: vueInventaire, commandes: vueCommandes, rangement: vueRangement, incidents: vueIncidents, heures: vueHeures };
    h += '<section role="tabpanel">' + vues[S.onglet]() + '</section>' + piedDePage();
    app.innerHTML = h;
    if (S.onglet === 'heures' && !S.releve && !S.releveEnCours) chargerReleve();
    majTotalCommande();
  }

  function piedDePage() {
    return '<footer class="pied"><details class="legende"><summary class="label">Codes couleurs</summary><div class="legende-grille">' +
      '<p>' + badge('Fait', 'vert') + ' Validé, prêt, livré, résolu, en stock.</p>' +
      '<p>' + badge('À faire', 'ambre') + ' Attend une action : à valider, à approuver, stock bas, non attribué.</p>' +
      '<p>' + badge('Urgent', 'urgent') + ' Bloquant, rupture, périmé, refusé, demandé hors délai.</p>' +
      '<p>' + badge('En cours', 'violet') + ' Pris en charge, approuvé, commandé, séquence en cours.</p>' +
      '<p>' + badge('Éteint', '') + ' Annulé, réalisé, passé.</p>' +
      '<p>' + badge('J-2', 'encre') + ' Échéance imminente.</p>' +
      '<p>' + tagFiliere('BIOMED') + ' ' + tagFiliere('BIOALC') + ' ' + tagFiliere('') + ' Filière concernée.</p>' +
      '<p class="petit sourd">Sur chaque carte, le filet de gauche reprend la couleur de son état.</p></div></details>' +
      '<div class="pied-ligne"><span>Suivi labo · Aurlom BTS+ · Campus Picpus</span><span class="pied-num">' + esc(LaboNav.format(new Date(), 'dd/MM/yyyy')) + '</span></div></footer>';
  }

  function titre(sur, t, lead) {
    return '<p class="sur" style="margin-top:24px">' + esc(sur) + '</p><h1>' + esc(t) + '<span class="point">.</span></h1>' + (lead ? '<p class="lead">' + lead + '</p>' : '');
  }

  // ---------------------------------------------------------------------------
  // Connexion
  // ---------------------------------------------------------------------------
  function rendreConnexion() {
    var demo = '';
    if (DEMO) {
      demo = '<div class="encart ambre"><b>Démonstration.</b> Choisis un compte fictif :<div class="actions">' +
        LaboNav.comptes.map(function (c) { return '<button type="button" class="btn petit" data-act="demoCompte" data-email="' + esc(c[2]) + '" data-pin="' + esc(c[6]) + '">' + esc(c[1]) + '</button>'; }).join('') + '</div></div>';
    }
    app.innerHTML = '<div class="connexion">' + logo(32) + titre('aurlom BTS+ · Suivi labo', 'Connexion', 'Ton adresse e-mail et ton code PIN personnel (6 chiffres).') + demo +
      '<form data-form="connexion" class="grille" style="grid-template-columns:1fr" autocomplete="on">' +
      '<label class="champ"><span>E-mail</span><input name="email" type="email" autocomplete="username" required></label>' +
      '<label class="champ"><span>Code PIN</span><input name="pin" type="password" inputmode="numeric" pattern="[0-9]*" minlength="4" autocomplete="current-password" required></label>' +
      '<button class="btn plein" type="submit">Se connecter</button></form>' +
      '<p class="petit sourd">PIN oublié : demande au directeur de t\'en attribuer un nouveau. Après 5 essais erronés, le compte est bloqué 15 minutes.</p></div>';
  }

  // ---------------------------------------------------------------------------
  // Tableau de bord (prof référent, coordinateur, directeur)
  // ---------------------------------------------------------------------------
  function alertesStock() {
    var lim = plusJours(C().alertePeremptionJours), auj = aujourdhui();
    return (S.etat.articles || []).filter(function (a) {
      var q = Number(a.quantite) || 0, s = a.seuil === '' ? NaN : Number(a.seuil);
      return (isFinite(s) && q <= s) || (a.peremption && a.peremption <= lim) || q === 0 || (a.peremption && a.peremption < auj);
    });
  }

  function vueTableau() {
    var e = S.etat, auj = aujourdhui();
    var aValider = (e.sessions || []).filter(function (s) { return s.statut === 'a_valider'; });
    var incOuverts = (e.incidents || []).filter(function (i) { return i.statut !== 'resolu'; });
    var bloquants = incOuverts.filter(function (i) { return i.gravite === 'Bloquant'; });
    var avenir = (e.demandes || []).filter(function (d) { return d.date_tp >= auj && ['annulee', 'realisee'].indexOf(d.statut) === -1; });
    var sansPrepa = avenir.filter(function (d) { return !d.prepa_id && LaboCore.joursEntre(auj, d.date_tp) <= 7; });
    var horsDelai = avenir.filter(function (d) { return Number(d.delai_jours) < C().delaiPrepaJours; });
    var aApprouver = (e.commandes || []).filter(function (c) { return c.statut === 'soumise'; });
    var stock = alertesStock();
    var h = titre(jourLisible(auj), 'État du labo', 'Ce qui demande ton attention aujourd\'hui.');
    h += '<div class="chiffres">' +
      '<div class="chiffre"><b>' + (e.presentes || []).length + '</b><span>personne(s) au labo</span></div>' +
      (peut('validerPresence') ? '<div class="chiffre' + (aValider.length ? ' accent' : '') + '"><b>' + aValider.length + '</b><span>présence(s) à valider</span></div>' : '') +
      '<div class="chiffre' + (aApprouver.length && peut('approuverCommande') && !(peut('validerPresence') && aValider.length) ? ' accent' : '') + '"><b>' + aApprouver.length + '</b><span>commande(s) en attente d\'approbation</span></div>' +
      '<div class="chiffre"><b>' + incOuverts.length + '</b><span>incident(s) non résolu(s), dont ' + bloquants.length + ' bloquant(s)</span></div>' +
      '<div class="chiffre"><b>' + sansPrepa.length + '</b><span>TP dans les 7 jours sans préparatrice</span></div>' +
      '<div class="chiffre"><b>' + stock.length + '</b><span>article(s) en alerte de stock ou de péremption</span></div></div>';

    h += '<h2>Au labo en ce moment</h2>' + tablePresentes(e.presentes);

    if (peut('validerPresence')) {
      h += '<h2>Présences à valider</h2>' + (aValider.length ? '<div class="tableau-wrap"><table><thead><tr><th>Qui</th><th>Date</th><th>Horaires</th><th class="num">Durée</th><th>Missions</th><th>À vérifier</th><th></th></tr></thead><tbody>' +
        aValider.sort(function (a, b) { return a.arrivee < b.arrivee ? -1 : 1; }).map(function (s) {
          return '<tr><td>' + esc(s.user_nom) + '</td><td>' + esc(jourLisible(s.date)) + '</td><td class="mono">' + fmt(s.arrivee, 'HH:mm') + '–' + fmt(s.depart, 'HH:mm') + '</td><td class="num">' + duree(s.duree_min) + '</td>' +
            '<td class="petit">' + esc(String(s.missions).split(' | ').join(', ')) + (s.commentaire ? '<br><span class="sourd">' + esc(s.commentaire) + '</span>' : '') + '</td>' +
            '<td class="petit">' + (s.source !== 'badge' ? badge(SOURCES[s.source], 'ambre') + ' ' : '') + esc(s.corrections) + '</td><td>' + boutonsValidation(s) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="vide">Rien à valider.</p>');
    }
    if (aApprouver.length) {
      h += '<h2>Commandes en attente</h2>' + aApprouver.map(carteCommande).join('');
    }
    if (bloquants.length) {
      h += '<h2>Incidents bloquants</h2>' + bloquants.map(function (i) {
        return '<div class="encart urgent"><b>' + esc(i.categorie) + (i.labo ? ' · ' + esc(i.labo) : '') + '</b> (' + esc(i.user_nom) + ', ' + fmt(i.horodatage, 'dd/MM HH:mm') + ') : ' + esc(i.description) + '</div>';
      }).join('');
    }
    if (sansPrepa.length || horsDelai.length) {
      h += '<h2>Demandes de TP à surveiller</h2><div class="tableau-wrap"><table><thead><tr><th>TP</th><th>Date</th><th>Classe</th><th>Enseignant·e</th><th>Alerte</th></tr></thead><tbody>' +
        avenir.filter(function (d) { return sansPrepa.indexOf(d) !== -1 || horsDelai.indexOf(d) !== -1; }).map(function (d) {
          return '<tr><td>' + esc(d.titre) + '</td><td>' + esc(jourLisible(d.date_tp)) + '<br><span class="petit sourd">' + esc(d.creneau) + '</span></td><td>' + esc(d.classe) + '</td><td>' + esc(d.prof_nom) + '</td><td>' +
            (sansPrepa.indexOf(d) !== -1 ? badge('Sans préparatrice', 'ambre') + ' ' : '') + (horsDelai.indexOf(d) !== -1 ? badge('Demandée à J-' + d.delai_jours, 'urgent') : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    if (stock.length) h += '<h2>Stock à surveiller</h2>' + tableArticles(stock);
    return h;
  }

  function tablePresentes(p) {
    p = p || [];
    return p.length ? '<div class="tableau-wrap"><table><thead><tr><th>Qui</th><th>Depuis</th><th>Labo</th></tr></thead><tbody>' +
      p.map(function (x) { return '<tr><td>' + esc(x.user_nom) + '</td><td class="mono">' + fmt(x.arrivee, 'dd/MM HH:mm') + '</td><td>' + esc(x.labo) + '</td></tr>'; }).join('') +
      '</tbody></table></div>' : '<p class="vide">Personne n\'a déclaré sa présence.</p>';
  }

  // ---------------------------------------------------------------------------
  // Présence (technicienne, aide-laborantine)
  // ---------------------------------------------------------------------------
  function casesMissions() {
    return '<div class="cases">' + C().missions.map(function (m) { return '<label class="case"><input type="checkbox" name="missions" value="' + esc(m) + '"><span>' + esc(m) + '</span></label>'; }).join('') + '</div>';
  }

  function vuePresence() {
    var e = S.etat, s = e.sessionOuverte, auj = aujourdhui(), file = lire(CLE_FILE) || [];
    var h = titre(jourLisible(auj), s ? 'Tu es au labo' : 'Déclarer ta présence',
      'L\'heure retenue est celle du serveur au moment où tu appuies. Chaque présence est ensuite validée : c\'est la base de ta facture.');
    if (file.length) {
      h += '<div class="encart ambre"><b>' + file.length + ' badge(s) en attente d\'envoi</b> : ' +
        file.map(function (r) { return (r.action === 'arrivee' ? 'arrivée' : 'départ') + ' à ' + fmt(r.data.client_time, 'HH:mm'); }).join(', ') +
        '. <button class="btn lien" data-act="recharger">Réessayer maintenant</button></div>';
    }
    if (!s) {
      h += '<div class="panneau"><p class="label">Il est</p><div class="heure"><span id="horloge">' + LaboNav.format(new Date(), 'HH:mm') + '</span><span class="point">.</span></div>' +
        '<form data-form="arrivee" class="grille" style="grid-template-columns:1fr"><label class="champ"><span class="label">Labo</span><select name="labo" required>' + options(C().labos, '', 'Choisir le labo…') + '</select></label>' +
        '<button class="btn badge" type="submit">Je déclare mon arrivée</button></form></div>';
    } else {
      var duJour = (e.demandes || []).filter(function (d) { return d.date_tp === s.date && d.statut !== 'annulee'; });
      h += '<div class="panneau"><p class="label">Arrivée ' + (s.source === 'hors_ligne' ? '(hors connexion) ' : '') + '· ' + esc(s.labo) + '</p>' +
        '<div class="heure">' + fmt(s.arrivee, 'HH:mm') + '<span class="point">.</span></div>' +
        '<p class="sourd">Depuis <span id="duree" data-depuis="' + esc(s.arrivee) + '">' + duree(Math.round((Date.now() - new Date(s.arrivee)) / 60000)) + '</span>' +
        (s.date !== auj ? ' · <b>présence ouverte le ' + jourLisible(s.date) + ' : saisis l\'heure réelle de départ</b>' : '') + '</p></div>';
      h += '<form data-form="depart"><h2>Ce que tu as fait</h2>' + casesMissions();
      if (duJour.length) {
        h += '<h2>TP concernés</h2><div class="cases">' + duJour.map(function (d) {
          return '<label class="case"><input type="checkbox" name="demandes_ids" value="' + esc(d.id) + '"><span><b>' + esc(d.creneau) + '</b> · ' + esc(d.classe) + ' · ' + esc(d.titre) + '</span></label>';
        }).join('') + '</div>';
      }
      h += '<div class="grille" style="margin-top:16px"><label class="champ large"><span>Commentaire (facultatif)</span><textarea name="commentaire" placeholder="Ex. : milieux coulés pour jeudi, TP décalé de 30 min"></textarea></label>' +
        '<label class="champ"><span>Départ oublié ? Heure réelle</span><input type="time" name="heure_depart"' + (s.date !== auj ? ' required' : '') + '></label></div>' +
        '<p class="petit sourd">Laisse l\'heure vide si tu pars maintenant. Une heure saisie à la main est signalée à la validation.</p>' +
        '<div class="actions"><button class="btn plein" type="submit" style="min-height:56px;flex:1">Je déclare mon départ</button></div></form>';
    }
    h += '<h2>Au labo en ce moment</h2>' + tablePresentes(e.presentes);
    h += '<details class="carte" style="margin-top:24px"><summary><h3 style="margin:0">Présence non badgée : la déclarer après coup</h3><p class="meta">Elle part en validation avec ton motif.</p></summary>' +
      '<form data-form="saisieManuelle" style="margin-top:16px"><div class="grille">' +
      '<label class="champ"><span>Date</span><input type="date" name="date" max="' + auj + '" required></label>' +
      '<label class="champ"><span>Début</span><input type="time" name="debut" required></label>' +
      '<label class="champ"><span>Fin</span><input type="time" name="fin" required></label>' +
      '<label class="champ"><span>Labo</span><select name="labo" required>' + options(C().labos, '', 'Choisir…') + '</select></label>' +
      '<label class="champ large"><span>Motif</span><input name="motif" required placeholder="Ex. : téléphone déchargé"></label></div>' +
      '<p class="label" style="margin:16px 0 8px">Missions</p>' + casesMissions() +
      '<label class="champ" style="margin-top:12px"><span>Commentaire</span><textarea name="commentaire"></textarea></label>' +
      '<div class="actions"><button class="btn" type="submit">Envoyer en validation</button></div></form></details>';
    return h;
  }

  // ---------------------------------------------------------------------------
  // Demandes de TP
  // ---------------------------------------------------------------------------
  var ST_DEM = { demandee: ['Demandée', 'ambre'], prise_en_charge: ['Prise en charge', 'violet'], prete: ['Prête', 'vert'], realisee: ['Réalisée', ''], annulee: ['Annulée', ''] };

  function classesOptions() {
    var l = [], f = C().filieres;
    Object.keys(f).forEach(function (k) { f[k].classes.forEach(function (c) { l.push({ v: c, l: c + ' · ' + f[k].libelle }); }); });
    return l;
  }
  function disciplinesOptions() {
    var l = [], f = C().filieres;
    Object.keys(f).forEach(function (k) { f[k].disciplines.forEach(function (d) { if (l.indexOf(d) === -1) l.push(d); }); });
    return l;
  }
  function blocsOptions(choisi) {
    var f = C().filieres;
    return Object.keys(f).map(function (k) {
      return '<optgroup label="' + esc(f[k].libelle + ' (' + f[k].rncp + ')') + '">' + options(f[k].blocs.map(function (b) { return { v: f[k].rncp + ' ' + b, l: b }; }), choisi) + '</optgroup>';
    }).join('');
  }

  function optionsTP(choisi) {
    var o = '<option value="">Aucun / autre TP</option>';
    Object.keys(LaboReferentiel).forEach(function (f) {
      var mes = LaboCore.filieresDe(moi());
      if (moi().role === 'enseignant' && mes.length && mes.indexOf(f) === -1) return;
      LaboReferentiel[f].domaines.forEach(function (d) {
        o += '<optgroup label="' + esc(f + ' · ' + d.nom) + '">' + options(d.tps.map(function (t) { return { v: t.id, l: t.intitule + ' (' + t.codes + ')' }; }), choisi) + '</optgroup>';
      });
    });
    return o;
  }

  function formDemande() {
    var p = S.preDemande || {}, auj = aujourdhui();
    var classeDefaut = p.classe || '';
    return '<details class="carte" id="form-demande"' + (S.preDemande || !(S.etat.demandes || []).length ? ' open' : '') + '><summary><h3 style="margin:0">Nouvelle demande de préparation</h3>' +
      '<p class="meta">Au moins ' + C().delaiPrepaJours + ' jours avant le TP. En dessous, le prof référent est alerté.</p></summary>' +
      (p.origine ? '<div class="encart">Préremplie depuis <b>' + esc(p.origine) + '</b>. Ajuste le besoin matériel, les quantités et la date.</div>' : '') +
      '<form data-form="demande" style="margin-top:16px"><input type="hidden" name="sequence_id" value="' + esc(p.sequence_id || '') + '"><div class="grille">' +
      '<label class="champ large"><span>TP incontournable de référence</span><select name="tp_ref">' + optionsTP(p.tp_ref) + '</select></label>' +
      '<label class="champ"><span>Date du TP</span><input type="date" name="date_tp" min="' + auj + '" required></label>' +
      '<label class="champ"><span>Créneau</span><select name="creneau" required>' + options(C().creneaux, '', 'Choisir…') + '</select></label>' +
      '<label class="champ"><span>Labo</span><select name="labo" required>' + options(C().labos, '', 'Choisir…') + '</select></label>' +
      '<label class="champ"><span>Classe</span><select name="classe" required>' + options(classesOptions(), classeDefaut, 'Choisir…') + '</select></label>' +
      '<label class="champ"><span>Discipline</span><select name="discipline" required>' + options(disciplinesOptions(), p.discipline || (moi().disciplines || '').split(',')[0], 'Choisir…') + '</select></label>' +
      '<label class="champ"><span>Effectif</span><input type="number" name="effectif" min="1" max="60"></label>' +
      '<label class="champ large"><span>Bloc de compétences visé</span><select name="competence"><option value="">Choisir…</option>' + blocsOptions(p.competence) + '</select></label>' +
      '<label class="champ large"><span>Titre du TP (verbe d\'action)</span><input name="titre" required value="' + esc(p.titre || '') + '"></label>' +
      '<label class="champ large"><span>Besoin matériel et réactifs</span><textarea name="besoin" required placeholder="Réactifs avec référence, quantités par binôme, appareils, consommables">' + esc(p.besoin || '') + '</textarea></label>' +
      '</div><div class="actions"><button class="btn plein" type="submit">Envoyer la demande</button>' + (S.preDemande ? '<button type="button" class="btn" data-act="viderPre" data-v="preDemande">Effacer le préremplissage</button>' : '') + '</div></form></details>';
  }

  function vueDemandes() {
    var e = S.etat, auj = aujourdhui();
    var lead = moi().role === 'enseignant'
      ? 'Décris ton TP ici. La technicienne qui le prend en charge te répond dans le fil de la demande.'
      : 'Toutes les demandes des enseignants, avec leur fil d\'échange.';
    var h = titre('Préparation des TP', moi().role === 'enseignant' ? 'Mes demandes de TP' : 'Demandes de TP', lead);
    if (peut('creerDemandeTP')) h += formDemande();
    h += filtreBoutons('demandes', [['avenir', 'À venir'], ['passees', 'Passées'], ['toutes', 'Toutes']]);
    var f = S.filtres.demandes;
    var l = (e.demandes || []).filter(function (d) {
      if (f === 'avenir') return d.date_tp >= auj && d.statut !== 'annulee';
      if (f === 'passees') return d.date_tp < auj;
      return true;
    }).sort(function (a, b) { return (a.date_tp + a.creneau).localeCompare(b.date_tp + b.creneau) * (f === 'passees' ? -1 : 1); });
    return h + (l.length ? l.map(carteDemande).join('') : '<p class="vide">Aucune demande.</p>');
  }

  function filtreBoutons(cle, choix) {
    return '<div class="actions" style="margin:16px 0">' + choix.map(function (x) {
      return '<button class="btn petit' + (S.filtres[cle] === x[0] ? ' plein' : '') + '" data-act="filtre" data-cle="' + cle + '" data-v="' + x[0] + '">' + x[1] + '</button>';
    }).join('') + '</div>';
  }

  function carteDemande(d) {
    var e = S.etat, auj = aujourdhui(), j = LaboCore.joursEntre(auj, d.date_tp);
    var hors = Number(d.delai_jours) < C().delaiPrepaJours;
    var msgs = (e.messages || []).filter(function (m) { return m.demande_id === d.id; });
    var st = ST_DEM[d.statut] || [d.statut, ''];
    var etatD = { demandee: 'ambre', prise_en_charge: 'violet', prete: 'vert', realisee: 'eteint', annulee: 'eteint' }[d.statut] || '';
    if (d.statut === 'demandee' && (hors || j <= 2) && d.date_tp >= auj) etatD = 'urgent';
    var h = carte(etatD, ' id="' + esc(d.id) + '"') + '<div class="tete"><div><p class="label">' + tagFiliere(d.filiere) + ' <span style="color:var(--violet-profond)">' + esc(jourLisible(d.date_tp)) + ' · ' + esc(d.creneau) + '</span></p>' +
      '<h3 style="margin-top:4px">' + esc(d.titre) + '</h3></div><div>' + badge(st[0], st[1]) +
      (d.date_tp >= auj && d.statut !== 'annulee' ? ' ' + badge(j === 0 ? 'Aujourd\'hui' : 'J-' + j, j <= 2 ? 'encre' : '') : '') +
      (hors ? ' ' + badge('Demandée à J-' + d.delai_jours, 'urgent') : '') + '</div></div>' +
      '<p class="meta">' + esc(d.classe) + ' · ' + esc(d.labo) + ' · ' + esc(d.discipline) + (d.effectif ? ' · ' + esc(d.effectif) + ' élèves' : '') + '</p>' +
      (d.competence ? '<p class="petit sourd">' + esc(d.competence) + '</p>' : '') +
      (tpRef(d.tp_ref) ? '<p class="petit"><b>TP de référence :</b> ' + esc(tpRef(d.tp_ref).intitule) + ' <span class="mono sourd">' + esc(tpRef(d.tp_ref).codes) + '</span></p>' : '') +
      '<div class="encart" style="white-space:pre-wrap"><span class="label" style="display:block">Besoin</span>' + esc(d.besoin) + '</div>' +
      (peut('preparerTP') && ['annulee', 'realisee'].indexOf(d.statut) === -1 ? '<details><summary class="petit" style="cursor:pointer;color:var(--violet-profond);font-weight:700">Vérifier le stock pour ce TP</summary>' +
        listeMateriel(String(d.besoin).split(/\n|;|,(?![^(]*\))/).map(function (x) { return x.trim(); }).filter(function (x) { return x.length > 2; }).slice(0, 25), { act: 'commanderDemandeItem', id: d.id }) + '</details>' : '') +
      '<p class="petit">Enseignant·e : <b>' + esc(d.prof_nom) + '</b> · Préparation : ' + (d.prepa_nom ? '<b>' + esc(d.prepa_nom) + '</b>' : badge('Non attribuée', 'ambre')) + ' · <span class="mono sourd">' + esc(d.id) + '</span></p>';
    var a = [];
    var actif = ['annulee', 'realisee'].indexOf(d.statut) === -1;
    if (peut('preparerTP') && actif) {
      if (String(d.prepa_id) !== String(moi().id)) a.push('<button class="btn petit" data-act="prendre" data-id="' + esc(d.id) + '">Je prends en charge</button>');
      if (d.statut !== 'prete') a.push('<button class="btn petit plein" data-act="statutDemande" data-v="prete" data-id="' + esc(d.id) + '">Marquer prête</button>');
    }
    if (!peut('piloterTP') && String(d.prof_id) === String(moi().id) && actif) {
      if (d.date_tp <= auj) a.push('<button class="btn petit plein" data-act="statutDemande" data-v="realisee" data-id="' + esc(d.id) + '">TP réalisé</button>');
      a.push('<button class="btn petit" data-act="statutDemande" data-v="annulee" data-id="' + esc(d.id) + '">Annuler</button>');
    }
    if (peut('piloterTP')) {
      var preps = (e.utilisateurs || []).filter(function (u) { return u.role === 'technicienne' || u.role === 'aide_laborantine'; });
      a.push('<label class="champ" style="min-width:200px"><span>Attribuer à</span><select data-change="attribuer" data-id="' + esc(d.id) + '">' + options(preps.map(function (u) { return { v: u.id, l: u.nom }; }), d.prepa_id, 'Personne') + '</select></label>');
      a.push('<label class="champ" style="min-width:180px"><span>Statut</span><select data-change="statutDemande" data-id="' + esc(d.id) + '">' + options(Object.keys(ST_DEM).map(function (k) { return { v: k, l: ST_DEM[k][0] }; }), d.statut) + '</select></label>');
    }
    if (peut('proposerCommande') && actif) a.push('<button class="btn petit" data-act="commanderPour" data-id="' + esc(d.id) + '">Commander pour ce TP</button>');
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
  // Programme : TP prévus aux scénarios pédagogiques, rapprochés du stock
  // ---------------------------------------------------------------------------
  function correspondances(item) {
    var mots = norm(item).split(/[^a-z0-9]+/).filter(function (w) { return w.length >= 4 && ['coffret', 'kit', 'reactif', 'reactifs', 'deux', 'niveaux', 'pour', 'avec', 'cites', 'dans', 'sequence'].indexOf(w) === -1; });
    if (!mots.length) return [];
    return (S.etat.articles || []).filter(function (a) {
      var d = norm(a.designation + ' ' + a.reference);
      return mots.some(function (w) { return d.indexOf(w) !== -1; });
    });
  }

  function etatMateriel(item) {
    var arts = correspondances(item);
    if (!arts.length && categorieDe(item) === 'Équipement') return { cls: '', txt: 'Équipement : vérifier la disponibilité', manque: false };
    if (!arts.length) return { cls: '', txt: 'Absent de l\'inventaire', manque: true };
    var lim = plusJours(C().alertePeremptionJours);
    var bas = arts.some(function (a) { var q = Number(a.quantite) || 0, s = Number(a.seuil); return q === 0 || (isFinite(s) && a.seuil !== '' && q <= s); });
    var perime = arts.some(function (a) { return a.peremption && a.peremption <= lim; });
    var total = arts.reduce(function (t, a) { return t + (Number(a.quantite) || 0); }, 0);
    if (bas) return { cls: 'ambre', txt: 'Stock bas (' + num(total) + ')', manque: true };
    if (perime) return { cls: 'ambre', txt: 'Péremption proche', manque: true };
    return { cls: 'vert', txt: 'En stock (' + num(total) + ')', manque: false };
  }

  // --- Catalogue des TP incontournables (referentiel.js) ---
  function catalogue(filiere) {
    var l = [];
    Object.keys(LaboReferentiel).forEach(function (f) {
      if (filiere && f !== filiere) return;
      LaboReferentiel[f].domaines.forEach(function (d) { d.tps.forEach(function (t) { l.push(Object.assign({ filiere: f, domaine: d.nom }, t)); }); });
    });
    return l;
  }
  function tpRef(id) { return catalogue().filter(function (t) { return t.id === id; })[0] || null; }
  function tpsDeSequence(p) {
    var txt = (p.titre + ' ' + p.tp + ' ' + p.renforcement).toLowerCase();
    return catalogue(p.filiere).filter(function (t) { try { return new RegExp(t.motsCles, 'i').test(txt); } catch (e) { return false; } });
  }
  function listeMateriel(items, ctx) {
    return '<ul class="materiel">' + items.map(function (it) {
      var st = etatMateriel(it);
      return '<li>' + esc(it) + ' ' + badge(st.txt, st.cls) +
        (st.manque && peut('proposerCommande') ? ' <button class="btn lien petit" data-act="' + ctx.act + '" data-id="' + esc(ctx.id) + '" data-item="' + esc(it) + '">Proposer une commande</button>' : '') + '</li>';
    }).join('') + '</ul>';
  }
  function preDemandeDepuis(t, seq) {
    var fl = C().filieres[t ? t.filiere : seq.filiere];
    var items = [];
    (seq ? String(seq.materiel || '').split(' | ') : []).concat(t ? t.materiel : []).forEach(function (x) { if (x && items.indexOf(x) === -1) items.push(x); });
    var bloc = '';
    var num = seq && seq.bloc ? (String(seq.bloc).match(/BC0?(\d)/) || [])[1] : '';
    if (fl && num) bloc = fl.blocs.filter(function (b) { return (b.match(/^BC0?(\d)/) || [])[1] === num; })[0] || '';
    return {
      tp_ref: t ? t.id : '', sequence_id: seq ? seq.id : '',
      titre: seq ? seq.titre : t.intitule, besoin: items.join('\n'),
      classe: fl ? fl.classes[seq && seq.annee === '2A' ? 1 : 0] : '',
      competence: bloc ? fl.rncp + ' ' + bloc : '', origine: t ? t.intitule + ' (' + t.codes + ')' : seq.titre
    };
  }

  function vueCatalogue(ff) {
    var auj = aujourdhui(), prog = S.programmeComplet || [];
    var demandes = S.etat.demandes || [];
    var h = DEMO ? '<div class="encart ambre">Démonstration : le scénario fictif ne compte que 6 séquences, d\'où une couverture faible. Avec les scénarios importés, la couverture réelle s\'affiche ici.</div>' : '';
    var filieres = Object.keys(LaboReferentiel).filter(function (f) { return !ff || f === ff; });
    filieres.forEach(function (f) {
      var tps = catalogue(f);
      var couverture = {};
      prog.filter(function (p) { return p.filiere === f; }).forEach(function (p) {
        tpsDeSequence(p).forEach(function (t) { (couverture[t.id] = couverture[t.id] || []).push(p); });
      });
      var absents = tps.filter(function (t) { return !couverture[t.id]; });
      h += '<h2>' + esc(C().filieres[f].libelle) + '</h2><p class="petit sourd">' + esc(LaboReferentiel[f].intro) + '</p>';
      h += '<div class="chiffres"><div class="chiffre"><b>' + (tps.length - absents.length) + ' / ' + tps.length + '</b><span>TP incontournables repérés dans le scénario</span></div>' +
        '<div class="chiffre' + (absents.length ? ' accent' : '') + '"><b>' + absents.length + '</b><span>non repérés : à vérifier ou à intégrer au SPG</span></div></div>';
      LaboReferentiel[f].domaines.forEach(function (d) {
        h += '<h3 style="margin-top:24px">' + esc(d.nom) + '</h3>';
        d.tps.forEach(function (t0) {
          var t = Object.assign({ filiere: f }, t0);
          var seqs = (couverture[t.id] || []).slice().sort(function (a, b) { return (a.debut || '').localeCompare(b.debut || ''); });
          var prochaine = seqs.filter(function (p) { return p.fin >= auj; })[0];
          var nbDem = demandes.filter(function (x) { return x.tp_ref === t.id; }).length;
          h += '<details class="carte etat-' + (seqs.length ? (prochaine ? 'violet' : 'eteint') : 'ambre') + '"><summary><div class="tete"><div><p class="label">' + tagFiliere(f) + ' ' + esc(t.codes) + '</p><h3 style="margin:4px 0 0">' + esc(t.intitule) + '</h3></div><div>' +
            (seqs.length ? badge(prochaine ? 'Prochaine : ' + dateCourte(prochaine.debut) + ' – ' + dateCourte(prochaine.fin) : 'Passé pour ce cycle', prochaine ? 'violet' : '') : badge('Non repéré dans le SPG', 'ambre')) +
            (nbDem ? ' ' + badge(nbDem + ' demande(s)', 'vert') : '') + '</div></div></summary>' +
            '<p class="petit">' + esc(t.description) + '</p>' +
            (seqs.length ? '<p class="label" style="margin:12px 0 4px">Séquences du scénario</p><ul class="petit">' + seqs.map(function (p) {
              return '<li>' + esc(p.annee) + ' · ' + esc(p.matiere) + ' · ' + esc(p.semaines) + ' (' + dateCourte(p.debut) + ' – ' + dateCourte(p.fin) + ') : ' + esc(p.titre) + '</li>';
            }).join('') + '</ul>' : '<div class="encart ambre">Aucune séquence du scénario ne correspond aux mots-clés de ce TP. Vérifie s\'il est traité sous un autre intitulé, sinon il manque au SPG.</div>') +
            '<p class="label" style="margin:12px 0 4px">Matériel type</p>' + listeMateriel(t.materiel, { act: 'commanderTP', id: t.id }) +
            (peut('creerDemandeTP') ? '<div class="actions"><button class="btn petit plein" data-act="preparerTP" data-id="' + esc(t.id) + '"' + (prochaine ? ' data-seq="' + esc(prochaine.id) + '"' : '') + '>Préparer ce TP</button></div>' : '') +
            '</details>';
        });
      });
    });
    return h;
  }

  function vueProgramme() {
    var e = S.etat, auj = aujourdhui();
    var src = S.filtres.progTout && S.programmeComplet ? S.programmeComplet : (e.programme || []);
    var mesF = LaboCore.filieresDe(moi());
    var ff = S.filtres.progFiliere || (moi().role === 'enseignant' && mesF.length === 1 ? mesF[0] : '');
    var l = src.filter(function (p) { return !ff || p.filiere === ff; }).sort(function (a, b) { return (a.debut || '').localeCompare(b.debut || ''); });
    var cat = S.filtres.progVue === 'catalogue';
    var h = titre('Scénarios pédagogiques 2026-2028', cat ? 'TP incontournables' : 'Les TP à venir',
      cat ? 'Le catalogue des TP attendus par le référentiel, relié aux séquences des scénarios (SPG). Un TP « non repéré » signale un manque possible dans le SPG.'
        : 'Les séquences avec manipulation au labo, tirées des scénarios BIOMED et BIOALC, rapprochées de l\'inventaire. Anticipe : une préparation demande ' + C().delaiPrepaJours + ' jours.');
    h += '<div class="actions">' + [['sequences', 'Séquences à venir'], ['catalogue', 'TP incontournables']].map(function (x) {
      return '<button class="btn petit' + ((S.filtres.progVue || 'sequences') === x[0] ? ' plein' : '') + '" data-act="progVue" data-v="' + x[0] + '">' + x[1] + '</button>';
    }).join('') + '</div>';
    h += '<div class="actions" style="align-items:flex-end;margin-bottom:16px"><label class="champ"><span>Filière</span><select data-change="progFiliere">' +
      options(Object.keys(C().filieres).map(function (k) { return { v: k, l: C().filieres[k].libelle }; }), ff, 'Toutes') + '</select></label>' +
      (cat ? '' : '<button class="btn petit' + (S.filtres.progTout ? ' plein' : '') + '" data-act="progTout">' + (S.filtres.progTout ? 'Voir les 10 prochaines semaines' : 'Voir tout le cycle') + '</button>') + '</div>';
    if (cat) return h + (S.programmeComplet ? vueCatalogue(ff) : '<p class="vide">Chargement du scénario complet…</p>');
    if (!src.length) return h + '<div class="encart ambre">Aucune séquence chargée. Le directeur importe le programme dans la feuille Programme (voir README).</div>';
    var manques = {};
    var cartes = l.map(function (p) {
      var enCours = p.debut <= auj && p.fin >= auj;
      var items = String(p.materiel || '').split(' | ').filter(Boolean);
      var chips = items.map(function (it) {
        var st = etatMateriel(it);
        if (st.manque && p.fin >= auj) (manques[it] = manques[it] || []).push(p);
        return '<li>' + esc(it) + ' ' + badge(st.txt, st.cls) +
          (st.manque && peut('proposerCommande') ? ' <button class="btn lien petit" data-act="commanderSeq" data-id="' + esc(p.id) + '" data-item="' + esc(it) + '">Proposer une commande</button>' : '') + '</li>';
      }).join('');
      return carte(enCours ? 'violet' : (p.fin < auj ? 'eteint' : '')) + '<div class="tete"><div><p class="label">' + tagFiliere(p.filiere) + ' <span style="color:var(--violet-profond)">' + esc(p.annee) + ' · ' + esc(p.matiere) + ' · ' + esc(p.semaines) + '</span></p>' +
        '<h3 style="margin-top:4px">' + esc(p.titre) + '</h3></div><div>' + (enCours ? badge('En cours', 'violet') : badge('Du ' + dateCourte(p.debut) + ' au ' + dateCourte(p.fin))) + '</div></div>' +
        (p.tp ? '<p class="petit"><b>Tronc commun :</b> ' + esc(p.tp) + '</p>' : '') +
        (p.renforcement ? '<p class="petit sourd"><b>Renforcement :</b> ' + esc(p.renforcement) + '</p>' : '') +
        (function () { var r = tpsDeSequence(p); return r.length ? '<p class="petit"><b>TP de référence :</b> ' + r.map(function (t) { return esc(t.intitule) + ' <span class="mono sourd">' + esc(t.codes) + '</span>'; }).join(' · ') + '</p>' : ''; })() +
        '<p class="label" style="margin:12px 0 4px">Matériel repéré dans la séquence</p><ul class="materiel">' + chips + '</ul>' +
        (peut('creerDemandeTP') ? '<div class="actions"><button class="btn petit" data-act="demanderSeq" data-id="' + esc(p.id) + '">Préparer la demande de TP</button></div>' : '') + '</article>';
    }).join('');
    var nbManques = Object.keys(manques).length;
    if (nbManques) {
      h += '<div class="encart ambre"><b>Achats à anticiper : ' + nbManques + ' article(s)</b> cité(s) dans les séquences à venir sont absents de l\'inventaire, en stock bas ou proches de la péremption. ' +
        'Le rapprochement se fait sur les mots de la désignation : vérifie avant de commander.</div>';
    }
    return h + (l.length ? cartes : '<p class="vide">Aucune séquence sur cette période.</p>');
  }

  // ---------------------------------------------------------------------------
  // Inventaire
  // ---------------------------------------------------------------------------
  function tableArticles(l) {
    var auj = aujourdhui(), lim = plusJours(C().alertePeremptionJours);
    return '<div class="tableau-wrap"><table><thead><tr><th>Article</th><th>Filière</th><th class="num">Stock</th><th class="num">Seuil</th><th>Péremption</th><th>Emplacement</th><th></th></tr></thead><tbody>' +
      l.map(function (a) {
        var q = Number(a.quantite) || 0, s = a.seuil === '' ? NaN : Number(a.seuil);
        var etat = q === 0 ? badge('Rupture', 'urgent') : (isFinite(s) && q <= s ? badge('Stock bas', 'ambre') : '');
        var per = a.peremption ? (a.peremption < auj ? badge('Périmé ' + dateCourte(a.peremption) + '/' + a.peremption.slice(2, 4), 'urgent') : (a.peremption <= lim ? badge(jourLisible(a.peremption), 'ambre') : esc(jourLisible(a.peremption)))) : '<span class="sourd">' + esc(a.notes || '—') + '</span>';
        var act = '<button class="btn petit" data-act="consommer" data-id="' + esc(a.id) + '">Consommer</button>';
        if (peut('gererInventaire')) act += ' <button class="btn petit" data-act="entree" data-id="' + esc(a.id) + '">Entrée / correction</button> <button class="btn petit" data-act="editerArticle" data-id="' + esc(a.id) + '">Modifier</button>';
        if (peut('proposerCommande') && (etat || a.peremption && a.peremption <= lim)) act += ' <button class="btn petit plein" data-act="commanderArticle" data-id="' + esc(a.id) + '">Commander</button>';
        var etatA = (q === 0 || (a.peremption && a.peremption < auj)) ? 'urgent' : ((isFinite(s) && q <= s) || (a.peremption && a.peremption <= lim) ? 'ambre' : '');
        return '<tr class="' + (etatA ? 'etat-' + etatA : '') + '"><td>' + esc(a.designation) + '<br><span class="petit sourd">' + esc(a.categorie) + (a.reference ? ' · réf. <span class="mono">' + esc(a.reference) + '</span>' : '') + (a.fournisseur ? ' · ' + esc(a.fournisseur) : '') + '</span></td>' +
          '<td>' + tagFiliere(a.filiere === 'Commun' ? '' : a.filiere) + '</td><td class="num">' + num(q) + ' <span class="sourd">' + esc(a.unite) + '</span> ' + etat + '</td><td class="num">' + (isFinite(s) ? num(s) : '') + '</td>' +
          '<td>' + per + '</td><td>' + esc(a.emplacement) + '</td><td><div class="actions" style="margin:0">' + act + '</div></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function formArticle(a) {
    a = a || {};
    return '<form data-form="article" class="carte" id="form-article"><h3>' + (a.id ? 'Modifier « ' + esc(a.designation) + ' »' : 'Ajouter un article') + '</h3>' +
      '<input type="hidden" name="id" value="' + esc(a.id || '') + '"><div class="grille">' +
      '<label class="champ large"><span>Désignation</span><input name="designation" required value="' + esc(a.designation || '') + '"></label>' +
      '<label class="champ"><span>Catégorie</span><select name="categorie">' + options(C().categoriesArticle, a.categorie) + '</select></label>' +
      '<label class="champ"><span>Filière</span><select name="filiere">' + options([{ v: 'Commun', l: 'Commun' }, { v: 'BIOMED', l: 'BIOMED' }, { v: 'BIOALC', l: 'BIOALC' }], a.filiere) + '</select></label>' +
      '<label class="champ"><span>Référence</span><input name="reference" value="' + esc(a.reference || '') + '"></label>' +
      '<label class="champ"><span>Fournisseur</span><input name="fournisseur" list="liste-fournisseurs" value="' + esc(a.fournisseur || '') + '"></label>' +
      (a.id ? '' : '<label class="champ"><span>Quantité en stock</span><input type="number" step="any" min="0" name="quantite" value="0"></label>') +
      '<label class="champ"><span>Unité</span><input name="unite" value="' + esc(a.unite || '') + '" placeholder="coffret, flacon, boîte…"></label>' +
      '<label class="champ"><span>Seuil d\'alerte</span><input type="number" step="any" min="0" name="seuil" value="' + esc(a.seuil === undefined ? '' : a.seuil) + '"></label>' +
      '<label class="champ"><span>Péremption</span><input type="date" name="peremption" value="' + esc(a.peremption || '') + '"></label>' +
      '<label class="champ"><span>Emplacement</span><input name="emplacement" value="' + esc(a.emplacement || '') + '" placeholder="Labo, armoire, frigo"></label>' +
      '<label class="champ large"><span>Notes</span><input name="notes" value="' + esc(a.notes || '') + '"></label></div>' +
      '<div class="actions"><button class="btn plein" type="submit">Enregistrer</button>' + (a.id ? '<button type="button" class="btn" data-act="annulerEdition">Annuler</button><button type="button" class="btn" data-act="retirerArticle" data-id="' + esc(a.id) + '">Retirer de l\'inventaire</button>' : '') + '</div></form>';
  }

  function datalistFournisseurs() {
    return '<datalist id="liste-fournisseurs">' + (S.etat.fournisseurs || []).map(function (f) { return '<option value="' + esc(f.nom) + '">'; }).join('') + '</datalist>';
  }

  function vueInventaire() {
    var e = S.etat, f = S.filtres;
    var h = titre('Stock en temps réel', 'Inventaire',
      'Toute personne qui utilise un kit ou un réactif le déclare ici (« Consommer »). Les commandes partent de ce stock : plus il est juste, moins on manque.');
    var alertes = alertesStock();
    if (alertes.length) h += '<div class="encart ambre"><b>' + alertes.length + ' article(s) en alerte</b> : rupture, stock sous le seuil ou péremption dans moins de ' + C().alertePeremptionJours + ' jours. <button class="btn lien" data-act="invAlerte">' + (f.invAlerte ? 'Voir tout' : 'Afficher seulement ceux-là') + '</button></div>';
    h += '<div class="actions" style="align-items:flex-end;margin-bottom:12px"><label class="champ" style="flex:1;min-width:200px"><span>Rechercher</span><input data-input="inventaire" value="' + esc(f.inventaire) + '" placeholder="Nom, référence, fournisseur"></label>' +
      '<label class="champ"><span>Filière</span><select data-change="invFiliere">' + options([{ v: 'BIOMED', l: 'BIOMED' }, { v: 'BIOALC', l: 'BIOALC' }, { v: 'Commun', l: 'Commun' }], f.invFiliere, 'Toutes') + '</select></label></div>';
    var q = norm(f.inventaire);
    var l = (f.invAlerte ? alertes : (e.articles || [])).filter(function (a) {
      return (!f.invFiliere || a.filiere === f.invFiliere) && (!q || norm(a.designation + ' ' + a.reference + ' ' + a.fournisseur).indexOf(q) !== -1);
    }).sort(function (a, b) { return a.designation.localeCompare(b.designation); });
    h += '<div id="table-inventaire">' + (l.length ? tableArticles(l) : '<p class="vide">Aucun article.</p>') + '</div>';
    if (peut('gererInventaire')) h += '<div id="zone-article">' + (S.edition ? formArticle(S.edition) : '<details class="carte"><summary><h3 style="margin:0">Ajouter un article</h3></summary>' + formArticle().replace('<form data-form="article" class="carte" id="form-article"><h3>Ajouter un article</h3>', '<form data-form="article" id="form-article" style="margin-top:12px">') + '</details>') + '</div>';
    var mv = (e.mouvements || []).slice().reverse().slice(0, 40);
    h += '<h2>Derniers mouvements</h2>' + (mv.length ? '<div class="tableau-wrap"><table><thead><tr><th>Quand</th><th>Article</th><th class="num">Mouvement</th><th class="num">Reste</th><th>Motif</th><th>Qui</th></tr></thead><tbody>' +
      mv.map(function (m) { return '<tr><td class="mono">' + fmt(m.horodatage, 'dd/MM HH:mm') + '</td><td>' + esc(m.designation) + '</td><td class="num">' + (Number(m.delta) > 0 ? '+' : '') + num(m.delta) + '</td><td class="num">' + num(m.quantite_apres) + '</td><td>' + esc(m.motif) + '</td><td>' + esc(m.user_nom) + '</td></tr>'; }).join('') +
      '</tbody></table></div>' : '<p class="vide">Aucun mouvement.</p>');
    return h + datalistFournisseurs();
  }

  // ---------------------------------------------------------------------------
  // Commandes
  // ---------------------------------------------------------------------------
  var ST_CMD = { soumise: ['À approuver', 'ambre'], approuvee: ['Approuvée', 'violet'], refusee: ['Refusée', 'urgent'], commandee: ['Commandée', 'violet'], livree: ['Livrée', 'vert'], annulee: ['Annulée', ''] };

  function fournisseursPour(categorie) {
    var c = norm(categorie);
    return (S.etat.fournisseurs || []).filter(function (f) { return c && norm(f.categories).indexOf(c) !== -1; });
  }

  function formCommande() {
    var p = S.preCommande || {}, e = S.etat, seuil = C().seuilTroisDevisTTC;
    var demandes = (e.demandes || []).filter(function (d) { return d.date_tp >= aujourdhui() && d.statut !== 'annulee'; });
    var sugg = fournisseursPour(p.categorie);
    return '<form data-form="commande" class="carte" id="form-commande"><h3>Proposer une commande</h3>' +
      '<div class="encart ambre"><b>Règle d\'achat.</b> Au-delà de ' + euros(seuil) + ' TTC, joindre <b>trois devis de fournisseurs différents</b> est obligatoire. En dessous, compare quand même au moins deux prix dès que le montant est significatif. Le prof référent approuve avant tout achat.</div>' +
      (p.contexte ? '<div class="encart">' + esc(p.contexte) + '</div>' : '') +
      '<input type="hidden" name="sequence_id" value="' + esc(p.sequence_id || '') + '"><div class="grille">' +
      '<label class="champ large"><span>Article à commander</span><input name="designation" required value="' + esc(p.designation || '') + '"></label>' +
      '<label class="champ"><span>Filière qui porte la dépense</span><select name="filiere" required>' + options([{ v: 'BIOMED', l: 'BIOMED' }, { v: 'BIOALC', l: 'BIOALC' }], p.filiere || (LaboCore.filieresDe(moi()).length === 1 ? LaboCore.filieresDe(moi())[0] : ''), 'Choisir…') + '</select></label>' +
      '<label class="champ"><span>Catégorie</span><select name="categorie" data-change="categorieCommande">' + options(C().categoriesArticle, p.categorie, 'Choisir…') + '</select></label>' +
      '<label class="champ"><span>Référence fournisseur</span><input name="reference" value="' + esc(p.reference || '') + '"></label>' +
      '<label class="champ"><span>Quantité</span><input type="number" name="quantite" min="1" step="any" required value="' + esc(p.quantite || 1) + '" data-total></label>' +
      '<label class="champ"><span>Prix unitaire TTC estimé (€)</span><input type="number" name="prix_unitaire_ttc" min="0" step="0.01" required data-total></label>' +
      '<div class="champ"><span>Total TTC estimé</span><p id="total-commande" class="mono" style="margin:10px 0 0;font-size:16px">0,00 €</p></div>' +
      '<label class="champ"><span>Fournisseur pressenti</span><input name="fournisseur" list="liste-fournisseurs" value="' + esc(p.fournisseur || '') + '"></label>' +
      '<label class="champ large"><span>Lien vers l\'article</span><input name="lien" type="url" placeholder="https://"></label>' +
      '<div class="champ large" id="sugg-fournisseurs">' + suggestionsHtml(sugg) + '</div>' +
      '<label class="champ"><span>TP concerné</span><select name="demande_tp_id">' + options(demandes.map(function (d) { return { v: d.id, l: dateCourte(d.date_tp) + ' · ' + d.classe + ' · ' + d.titre }; }), p.demande_tp_id, 'Aucun') + '</select></label>' +
      '<label class="champ"><span>Article de l\'inventaire à réapprovisionner</span><select name="article_id">' + options((e.articles || []).map(function (a) { return { v: a.id, l: a.designation }; }), p.article_id, 'Aucun / nouvel article') + '</select></label>' +
      '<label class="champ large"><span>Justification pédagogique</span><textarea name="justification" required placeholder="TP, séquence, classe, bloc de compétences : pourquoi cet achat, pour quand">' + esc(p.justification || '') + '</textarea></label></div>' +
      '<fieldset class="devis" id="bloc-devis"><legend class="label">Devis concurrents <span id="devis-oblig"></span></legend>' +
      [1, 2, 3].map(function (i) {
        return '<div class="grille devis-ligne"><label class="champ"><span>Fournisseur ' + i + '</span><input name="devis_f' + i + '" list="liste-fournisseurs"></label>' +
          '<label class="champ"><span>Montant TTC (€)</span><input type="number" min="0" step="0.01" name="devis_m' + i + '"></label>' +
          '<label class="champ"><span>Lien ou n° de devis</span><input name="devis_l' + i + '"></label></div>';
      }).join('') + '</fieldset>' +
      '<div class="actions"><button class="btn plein" type="submit">Envoyer pour approbation</button>' + (S.preCommande ? '<button type="button" class="btn" data-act="viderPre" data-v="preCommande">Effacer le préremplissage</button>' : '') + '</div></form>' + datalistFournisseurs();
  }

  function suggestionsHtml(l) {
    if (!l.length) return '<span class="petit sourd">Choisis une catégorie pour voir les fournisseurs déjà utilisés par l\'école.</span>';
    return '<span class="label">Déjà utilisés pour cette catégorie</span><p class="petit" style="margin:4px 0 0">' + l.slice(0, 6).map(function (f) {
      return '<button type="button" class="btn lien" data-act="choisirFournisseur" data-v="' + esc(f.nom) + '">' + esc(f.nom) + '</button>';
    }).join(' · ') + '</p>';
  }

  function majTotalCommande() {
    var f = document.getElementById('form-commande');
    if (!f) return;
    var t = (Number(f.quantite.value) || 0) * (Number(f.prix_unitaire_ttc.value) || 0);
    document.getElementById('total-commande').textContent = euros(t);
    var oblig = t >= C().seuilTroisDevisTTC;
    document.getElementById('devis-oblig').innerHTML = oblig ? badge('Obligatoires : ' + euros(t) + ' TTC', 'urgent') : '<span class="petit sourd">(facultatifs sous ' + euros(C().seuilTroisDevisTTC) + ' TTC)</span>';
    [1, 2, 3].forEach(function (i) { f['devis_f' + i].required = oblig; f['devis_m' + i].required = oblig; });
  }

  function carteCommande(c) {
    var st = ST_CMD[c.statut] || [c.statut, ''];
    var devis = []; try { devis = JSON.parse(c.devis || '[]'); } catch (e) { devis = []; }
    var mien = String(c.user_id) === String(moi().id);
    var etatC = { soumise: 'ambre', approuvee: 'violet', commandee: 'violet', livree: 'vert', refusee: 'urgent', annulee: 'eteint' }[c.statut] || '';
    var h = carte(etatC) + '<div class="tete"><div><p class="label">' + tagFiliere(c.filiere) + ' · ' + fmt(c.cree_le, 'dd/MM/yyyy') + ' · ' + esc(c.user_nom) + '</p>' +
      '<h3 style="margin-top:4px">' + esc(num(c.quantite)) + ' × ' + esc(c.designation) + '</h3></div><div>' + badge(st[0], st[1]) + (Number(c.total_ttc) >= C().seuilTroisDevisTTC ? ' ' + badge('3 devis', 'encre') : '') + '</div></div>' +
      '<p class="meta"><span class="mono">' + euros(c.total_ttc) + '</span> TTC estimés (' + euros(c.prix_unitaire_ttc) + ' l\'unité)' + (c.fournisseur ? ' · ' + esc(c.fournisseur) : '') + (c.reference ? ' · réf. <span class="mono">' + esc(c.reference) + '</span>' : '') +
      (c.lien && /^https?:\/\//.test(c.lien) ? ' · <a href="' + esc(c.lien) + '" target="_blank" rel="noopener noreferrer">lien</a>' : '') + '</p>' +
      '<p class="petit">' + esc(c.justification) + '</p>' +
      (devis.length ? '<p class="petit sourd">Devis : ' + devis.map(function (d) { return esc(d.fournisseur) + ' ' + euros(d.montant); }).join(' · ') + '</p>' : '') +
      (c.approuve_par ? '<p class="petit">Approuvée par <b>' + esc(c.approuve_par) + '</b> le ' + fmt(c.approuve_le, 'dd/MM/yyyy') + (c.pilotage_id ? ' · reportée dans Pilotage dépenses sous <span class="mono">' + esc(c.pilotage_id) + '</span>' : '') + '</p>' : '') +
      (c.motif_refus ? '<div class="encart urgent">Refus : ' + esc(c.motif_refus) + '</div>' : '');
    var a = [];
    if (c.statut === 'soumise' && peut('approuverCommande') && (!mien || moi().role === 'directeur')) {
      a.push('<button class="btn petit plein" data-act="cmd" data-v="approuvee" data-id="' + esc(c.id) + '">Approuver</button>');
      a.push('<button class="btn petit" data-act="cmd" data-v="refusee" data-id="' + esc(c.id) + '">Refuser</button>');
    }
    if (c.statut === 'soumise' && mien) a.push('<button class="btn petit" data-act="cmd" data-v="annulee" data-id="' + esc(c.id) + '">Annuler ma demande</button>');
    if (peut('suivreCommande')) {
      if (c.statut === 'approuvee') a.push('<button class="btn petit" data-act="cmd" data-v="commandee" data-id="' + esc(c.id) + '">Marquer commandée</button>');
      if (c.statut === 'approuvee' || c.statut === 'commandee') a.push('<button class="btn petit plein" data-act="cmd" data-v="livree" data-id="' + esc(c.id) + '">Réceptionner</button>');
    }
    if (a.length) h += '<div class="actions">' + a.join('') + '</div>';
    return h + '</article>';
  }

  function vueCommandes() {
    var e = S.etat, f = S.filtres.commandes;
    var h = titre('Achats du labo', 'Commandes',
      'Une demande d\'achat part au prof référent. Une fois approuvée, elle est recopiée dans le classeur Pilotage dépenses de la filière, puis suivie jusqu\'à la réception, qui remet le stock à jour.');
    if (peut('proposerCommande')) h += S.preCommande ? formCommande() : '<details class="carte"><summary><h3 style="margin:0">Proposer une commande</h3><p class="meta">Au-delà de ' + euros(C().seuilTroisDevisTTC) + ' TTC : trois devis concurrents obligatoires.</p></summary>' + formCommande().replace('class="carte" id="form-commande"><h3>Proposer une commande</h3>', 'id="form-commande" style="margin-top:12px">') + '</details>';
    h += filtreBoutons('commandes', [['actives', 'En cours'], ['toutes', 'Toutes']]);
    var l = (e.commandes || []).filter(function (c) { return f === 'toutes' || ['soumise', 'approuvee', 'commandee'].indexOf(c.statut) !== -1; })
      .sort(function (a, b) { var o = { soumise: 0, approuvee: 1, commandee: 2 }; return ((o[a.statut] === undefined ? 3 : o[a.statut]) - (o[b.statut] === undefined ? 3 : o[b.statut])) || (a.cree_le < b.cree_le ? 1 : -1); });
    return h + (l.length ? l.map(carteCommande).join('') : '<p class="vide">Aucune commande.</p>');
  }

  // ---------------------------------------------------------------------------
  // Rangement
  // ---------------------------------------------------------------------------
  function vueRangement() {
    var e = S.etat, auj = aujourdhui();
    var h = titre('Contrôle de fin de TP', 'Rangement', 'Contrôle par labo, daté et signé. Chaque point non conforme ouvre un incident.');
    if (peut('rangement')) {
      var duJour = (e.demandes || []).filter(function (d) { return d.date_tp === auj && d.statut !== 'annulee'; });
      h += '<form data-form="rangement" class="carte"><div class="grille">' +
        '<label class="champ"><span>Labo</span><select name="labo" required>' + options(C().labos, (e.sessionOuverte || {}).labo, 'Choisir…') + '</select></label>' +
        '<label class="champ"><span>TP concerné</span><select name="demande_id">' + options(duJour.map(function (d) { return { v: d.id, l: d.creneau + ' · ' + d.classe + ' · ' + d.titre }; }), '', 'Aucun / hors TP') + '</select></label></div>' +
        '<div class="actions" style="justify-content:space-between;align-items:center"><p class="label" style="margin:0">Points de contrôle</p><button type="button" class="btn petit" data-act="toutOk">Tout conforme</button></div>' +
        C().controlesRangement.map(function (c, i) {
          return '<div class="controle"><span>' + esc(c) + '</span><div class="seg" role="radiogroup" aria-label="' + esc(c) + '">' +
            [['ok', 'OK'], ['nc', 'NC'], ['na', 'N/A']].map(function (o) { return '<label><input type="radio" name="c' + i + '" value="' + o[0] + '"><span class="' + o[0] + '">' + o[1] + '</span></label>'; }).join('') + '</div></div>';
        }).join('') +
        '<label class="champ" style="margin-top:16px"><span>Remarques</span><textarea name="remarques" placeholder="Ex. : poste 7, bécher cassé ; DASRI plein"></textarea></label>' +
        '<div class="actions"><button class="btn plein" type="submit">Enregistrer le contrôle</button></div></form>';
    }
    var l = (e.rangements || []).slice().reverse();
    h += '<h2>Derniers contrôles</h2>' + (l.length ? '<div class="tableau-wrap"><table><thead><tr><th>Date</th><th>Labo</th><th>Par</th><th>Non conformes</th><th>Remarques</th></tr></thead><tbody>' +
      l.slice(0, 80).map(function (x) {
        var c = {}; try { c = JSON.parse(x.controles); } catch (err) { /* ligne ancienne */ }
        var nc = Object.keys(c).filter(function (k) { return c[k] === 'nc'; });
        return '<tr><td class="mono">' + fmt(x.horodatage, 'dd/MM/yyyy HH:mm') + '</td><td>' + esc(x.labo) + '</td><td>' + esc(x.user_nom) + '</td><td>' + (nc.length ? badge(nc.length + ' NC', 'urgent') + ' ' + esc(nc.join(', ')) : badge('Conforme', 'vert')) + '</td><td>' + esc(x.remarques) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="vide">Aucun contrôle enregistré.</p>');
    return h;
  }

  // ---------------------------------------------------------------------------
  // Incidents
  // ---------------------------------------------------------------------------
  var GRAV = { Faible: '', 'Gênant': 'ambre', Bloquant: 'urgent' };
  var ST_INC = { ouvert: ['Ouvert', 'ambre'], en_cours: ['En cours', 'violet'], resolu: ['Résolu', 'vert'] };

  function vueIncidents() {
    var e = S.etat;
    var h = titre('Problèmes au labo', peut('traiterIncident') ? 'Incidents' : 'Signaler un problème',
      'Panne, casse, rupture, réactif périmé, souci d\'hygiène : un signalement daté remplace le message oral oublié. Un incident « bloquant » part aussi par e-mail.');
    h += '<form data-form="incident" class="carte"><div class="grille">' +
      '<label class="champ"><span>Labo</span><select name="labo">' + options(C().labos, '', 'Général / hors labo') + '</select></label>' +
      '<label class="champ"><span>Catégorie</span><select name="categorie" required>' + options(C().categoriesIncident, '', 'Choisir…') + '</select></label>' +
      '<label class="champ"><span>Gravité</span><select name="gravite">' + options(C().gravites, 'Gênant') + '</select></label>' +
      '<label class="champ large"><span>Description</span><textarea name="description" required placeholder="Quoi, où, depuis quand, référence du réactif ou n° de l\'appareil"></textarea></label>' +
      '</div><div class="actions"><button class="btn plein" type="submit">Signaler</button></div></form>';
    h += '<h2>Suivi</h2>' + filtreBoutons('incidents', [['ouverts', 'Non résolus'], ['tous', 'Tous']]);
    var ordre = { Bloquant: 0, 'Gênant': 1, Faible: 2 };
    var l = (e.incidents || []).filter(function (i) { return S.filtres.incidents === 'tous' || i.statut !== 'resolu'; })
      .sort(function (a, b) { return (ordre[a.gravite] - ordre[b.gravite]) || (a.horodatage < b.horodatage ? 1 : -1); });
    return h + (l.length ? l.map(function (i) {
      var st = ST_INC[i.statut] || [i.statut, ''];
      var etatI = i.statut === 'resolu' ? 'vert' : (i.gravite === 'Bloquant' ? 'urgent' : (i.gravite === 'Gênant' ? 'ambre' : (i.statut === 'en_cours' ? 'violet' : '')));
      var x = carte(etatI) + '<div class="tete"><div><p class="label">' + esc(i.categorie) + (i.labo ? ' · ' + esc(i.labo) : '') + '</p>' +
        '<p style="margin:4px 0 0;white-space:pre-wrap">' + esc(i.description) + '</p></div><div>' + badge(i.gravite, GRAV[i.gravite]) + ' ' + badge(st[0], st[1]) + '</div></div>' +
        '<p class="meta">' + esc(i.user_nom) + ' · <span class="mono">' + fmt(i.horodatage, 'dd/MM/yyyy HH:mm') + '</span>' + (i.traite_par ? ' · suivi par ' + esc(i.traite_par) : '') + '</p>' +
        (i.resolution ? '<div class="encart vert"><b>Résolution' + (i.resolu_le ? ' du ' + fmt(i.resolu_le, 'dd/MM/yyyy') : '') + ' :</b> ' + esc(i.resolution) + '</div>' : '');
      if (peut('traiterIncident') && i.statut !== 'resolu') {
        x += '<form data-form="majIncident" data-id="' + esc(i.id) + '" class="actions" style="align-items:flex-end">' +
          '<label class="champ" style="flex:1;min-width:220px"><span>Ce qui a été fait</span><input name="resolution" placeholder="Ex. : lampe changée, commande proposée"></label>' +
          (i.statut === 'ouvert' ? '<button class="btn petit" type="submit" name="statut" value="en_cours">Je m\'en occupe</button>' : '') +
          '<button class="btn petit plein" type="submit" name="statut" value="resolu">Résolu</button></form>';
      }
      return x + '</article>';
    }).join('') : '<p class="vide">Aucun incident.</p>');
  }

  // ---------------------------------------------------------------------------
  // Heures : relevé personnel, activité de l'équipe, facturation (directeur)
  // ---------------------------------------------------------------------------
  var ST_SES = { en_cours: ['En cours', 'violet'], a_valider: ['À valider', 'ambre'], validee: ['Validée', 'vert'], contestee: ['Contestée', 'urgent'] };
  var SOURCES = { badge: 'Badge', hors_ligne: 'Badge hors connexion', saisie_manuelle: 'Saisie après coup' };

  function equipeLabo() { return (S.etat.utilisateurs || []).filter(function (u) { return u.role === 'technicienne' || u.role === 'aide_laborantine'; }); }

  function vueHeures() {
    var rel = S.releve, equipe = peut('voirEquipe'), fact = peut('facturation');
    var h = titre('Relevé mensuel', fact ? 'Heures et facturation' : (equipe ? 'Activité des techniciennes' : 'Mes heures'),
      fact ? 'Seules les présences validées entrent dans le relevé, moins une heure de pause déjeuner par journée qui couvre 12 h – 14 h. Imprime-le pour le rapprocher de la facture de la prestataire.'
        : (equipe ? 'Heures passées au labo, missions et TP préparés. Les montants facturés ne sont visibles que par le directeur.'
          : 'Tes présences du mois. Les heures facturables sont les heures validées, moins une heure de pause déjeuner par journée qui couvre 12 h – 14 h.'));
    h += '<form data-form="releve" class="actions" style="align-items:flex-end">' +
      (equipe ? '<label class="champ" style="min-width:220px"><span>Personne</span><select name="user_id" required>' + options(equipeLabo().map(function (u) { return { v: u.id, l: u.nom + ' · ' + C().roles[u.role] }; }), rel ? rel.personne.id : (equipeLabo()[0] || {}).id) + '</select></label>' : '') +
      '<label class="champ"><span>Mois</span><input type="month" name="mois" value="' + esc(rel ? rel.mois : moisCourant()) + '" required></label>' +
      '<button class="btn plein" type="submit">Afficher</button></form>';
    if (!rel) return h + '<p class="vide">Chargement du relevé…</p>';
    h += '<div class="chiffres"><div class="chiffre accent"><b>' + num(rel.heures_validees) + '</b><span>heures facturables · ' + esc(rel.personne.nom) + '</span></div>' +
      '<div class="chiffre"><b>' + duree(rel.minutes_pause) + '</b><span>de pause déjeuner déduite (' + duree(rel.minutes_brutes) + ' de présence validée)</span></div>' +
      (rel.montant_ht !== undefined ? '<div class="chiffre"><b>' + euros(rel.montant_ht) + '</b><span>HT au taux de ' + euros(rel.taux_horaire) + '/h</span></div>' : '') +
      '<div class="chiffre"><b>' + rel.non_validees + '</b><span>présence(s) non validée(s)</span></div>' +
      '<div class="chiffre"><b>' + rel.preparations.length + '</b><span>TP préparé(s) ce mois</span></div></div>';
    if (rel.non_validees) h += '<div class="encart ambre">' + rel.non_validees + ' présence(s) pas encore validée(s) : elles ne comptent pas dans le total.</div>';
    h += rel.sessions.length ? '<div class="tableau-wrap"><table><thead><tr><th>Date</th><th>Arrivée</th><th>Départ</th><th class="num">Durée</th><th>Labo</th><th>Missions</th><th>Origine</th><th>Statut</th>' + (peut('validerPresence') ? '<th></th>' : '') + '</tr></thead><tbody>' +
      rel.sessions.map(function (s) {
        var st = ST_SES[s.statut] || [s.statut, ''];
        return '<tr><td>' + esc(jourLisible(s.date)) + '</td><td class="mono">' + fmt(s.arrivee, 'HH:mm') + '</td><td class="mono">' + fmt(s.depart, 'HH:mm') + '</td><td class="num">' + (s.depart ? duree(s.duree_min) : '') + '</td><td>' + esc(s.labo) + '</td>' +
          '<td class="petit">' + esc(String(s.missions).split(' | ').join(', ')) + (s.commentaire ? '<br><span class="sourd">' + esc(s.commentaire) + '</span>' : '') + '</td>' +
          '<td class="petit">' + esc(SOURCES[s.source] || s.source) + (s.corrections ? '<br><span class="sourd">' + esc(s.corrections) + '</span>' : '') + '</td>' +
          '<td>' + badge(st[0], st[1]) + (s.motif_validation ? '<br><span class="petit sourd">' + esc(s.motif_validation) + '</span>' : '') + '</td>' +
          (peut('validerPresence') ? '<td>' + boutonsValidation(s) + '</td>' : '') + '</tr>';
      }).join('') + '</tbody><tfoot><tr><td colspan="3">Présence validée</td><td class="num">' + duree(rel.minutes_brutes) + '</td><td colspan="' + (peut('validerPresence') ? 5 : 4) + '"></td></tr>' +
      '<tr><td colspan="3">Pause déjeuner déduite</td><td class="num">− ' + duree(rel.minutes_pause) + '</td><td colspan="' + (peut('validerPresence') ? 5 : 4) + '"></td></tr>' +
      '<tr><td colspan="3">Total facturable</td><td class="num">' + duree(rel.minutes_validees) + '</td><td colspan="' + (peut('validerPresence') ? 5 : 4) + '"></td></tr></tfoot></table></div>'
      : '<p class="vide">Aucune présence ce mois-ci.</p>';
    if (rel.jours.length) h += '<h2>Par journée</h2>' + tableJours(rel);
    if (rel.preparations.length) {
      h += '<h2>TP préparés</h2><div class="tableau-wrap"><table><thead><tr><th>Date</th><th>Créneau</th><th>Classe</th><th>TP</th><th>Statut</th></tr></thead><tbody>' +
        rel.preparations.map(function (d) { var st = ST_DEM[d.statut] || [d.statut, '']; return '<tr><td>' + esc(jourLisible(d.date_tp)) + '</td><td>' + esc(d.creneau) + '</td><td>' + esc(d.classe) + '</td><td>' + esc(d.titre) + '</td><td>' + badge(st[0], st[1]) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    }
    if (rel.sessions.length) h += '<div class="actions"><button class="btn" data-act="csv">Exporter en CSV</button><button class="btn" data-act="imprimer">Imprimer le relevé</button></div>';
    return h;
  }

  function tableJours(rel) {
    return '<div class="tableau-wrap"><table><thead><tr><th>Journée</th><th class="num">Présence validée</th><th class="num">Pause déjeuner</th><th class="num">Facturable</th></tr></thead><tbody>' +
      rel.jours.map(function (j) {
        return '<tr><td>' + esc(jourLisible(j.date)) + '</td><td class="num">' + duree(j.minutes_brutes) + '</td><td class="num">' + (j.pause_min ? '− ' + duree(j.pause_min) : '—') + '</td><td class="num">' + duree(j.minutes_facturables) + '</td></tr>';
      }).join('') + '</tbody><tfoot><tr><td>Total</td><td class="num">' + duree(rel.minutes_brutes) + '</td><td class="num">− ' + duree(rel.minutes_pause) + '</td><td class="num">' + duree(rel.minutes_validees) + '</td></tr></tfoot></table></div>';
  }

  function boutonsValidation(s) {
    if (s.statut === 'en_cours' || !peut('validerPresence')) return '';
    var b = '';
    if (s.statut !== 'validee') b += '<button class="btn petit plein" data-act="valider" data-id="' + esc(s.id) + '">Valider</button> ';
    if (s.statut !== 'contestee') b += '<button class="btn petit" data-act="contester" data-id="' + esc(s.id) + '">Contester</button>';
    return '<div class="actions" style="margin:0;flex-wrap:nowrap">' + b + '</div>';
  }

  function chargerReleve(userId, mois) {
    var data = { mois: mois || (S.releve ? S.releve.mois : moisCourant()) };
    if (peut('voirEquipe')) {
      data.user_id = userId || (S.releve ? S.releve.personne.id : (equipeLabo()[0] || {}).id);
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

  function csvCellule(c) {
    var s = String(c === undefined || c === null ? '' : c);
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function csv() {
    var rel = S.releve;
    var l = [['Personne', 'Date', 'Arrivée', 'Départ', 'Durée (h)', 'Labo', 'Missions', 'Origine', 'Corrections', 'Statut', 'Validé par', 'Référence']];
    rel.sessions.forEach(function (s) {
      l.push([rel.personne.nom, s.date, fmt(s.arrivee, 'HH:mm'), fmt(s.depart, 'HH:mm'), String(Math.round((Number(s.duree_min) || 0) / 60 * 100) / 100).replace('.', ','),
        s.labo, s.missions, SOURCES[s.source] || s.source, s.corrections, (ST_SES[s.statut] || [s.statut])[0], s.valide_par, s.id]);
    });
    function h(min) { return String(Math.round(min / 60 * 100) / 100).replace('.', ','); }
    rel.jours.forEach(function (j) {
      if (j.pause_min) l.push([rel.personne.nom, j.date, '', '', '-' + h(j.pause_min), '', 'Pause déjeuner déduite', '', '', '', '', '']);
    });
    l.push([rel.personne.nom, rel.mois, '', '', h(rel.minutes_validees), '', 'Total facturable (présences validées moins pauses déjeuner)', '', '', '', '', '']);
    var txt = '﻿' + l.map(function (r) { return r.map(csvCellule).join(';'); }).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
    a.download = 'releve-' + rel.mois + '-' + rel.personne.nom.replace(/\W+/g, '-') + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  function imprimer() {
    var rel = S.releve, fact = rel.montant_ht !== undefined;
    var val = rel.sessions.filter(function (s) { return s.statut === 'validee'; });
    var moisLib = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(+rel.mois.slice(0, 4), +rel.mois.slice(5, 7) - 1, 1)));
    document.getElementById('imprimable').innerHTML = logo(32) +
      '<p class="sur" style="margin-top:4mm">aurlom BTS+ · Laboratoires de TP · BTS BIOMED (RNCP40027) et BIOALC (RNCP38884)</p>' +
      '<h1>' + (fact ? 'Relevé de prestations' : 'Relevé d\'activité') + '<span class="point">.</span></h1>' +
      '<p><b>' + esc(C().roles[rel.personne.role] || '') + ' :</b> ' + esc(rel.personne.nom) + ' · <b>Période :</b> ' + esc(moisLib) + '</p>' +
      '<table><thead><tr><th>Date</th><th>Arrivée</th><th>Départ</th><th class="num">Durée</th><th>Labo</th><th>Missions</th><th>Réf.</th></tr></thead><tbody>' +
      val.map(function (s) { return '<tr><td>' + esc(jourLisible(s.date)) + '</td><td>' + fmt(s.arrivee, 'HH:mm') + '</td><td>' + fmt(s.depart, 'HH:mm') + '</td><td class="num">' + duree(s.duree_min) + '</td><td>' + esc(s.labo) + '</td><td>' + esc(String(s.missions).split(' | ').join(', ')) + '</td><td class="mono">' + esc(s.id) + '</td></tr>'; }).join('') +
      '</tbody></table>' +
      '<h2 style="font-size:12pt;margin:6mm 0 2mm">Récapitulatif par journée</h2>' + tableJours(rel) +
      '<p style="margin-top:4mm"><b>Total facturable : ' + duree(rel.minutes_validees) + ' (' + num(rel.heures_validees) + ' h)</b>, après déduction d\'une heure de pause déjeuner par journée couvrant 12 h – 14 h' +
      (fact ? ' · ' + num(rel.heures_validees) + ' h × ' + euros(rel.taux_horaire) + '/h = <b>' + euros(rel.montant_ht) + ' HT</b>' : '') + '.</p>' +
      (rel.non_validees ? '<p>' + rel.non_validees + ' présence(s) non validée(s) à la date d\'édition, non incluses.</p>' : '') +
      '<div class="signatures"><div>Pour Aurlom BTS+, service fait<br>Nom, date, signature</div><div>La prestataire<br>Nom, date, signature</div></div>' +
      '<div class="pied"><span>Édité le ' + fmt(rel.edite_le, 'dd/MM/yyyy à HH:mm') + ' depuis le suivi labo · horodatages serveur</span><span class="mono">' + esc(rel.mois) + '</span></div>';
    window.print();
  }

  // ---------------------------------------------------------------------------
  // Préremplissages
  // ---------------------------------------------------------------------------
  function sequence(id) {
    return (S.etat.programme || []).concat(S.programmeComplet || []).filter(function (p) { return p.id === id; })[0];
  }
  function categorieDe(item) {
    var n = norm(item);
    if (/gelose|milieu|bouillon|culture cellulaire/.test(n)) return 'Milieu de culture';
    if (/souche|echantillon|parasit|paillette|lait|eau/.test(n)) return 'Souche / échantillon pédagogique';
    if (/spectrophotometre|microscope|centrifug|etuve|autoclave|ph-metre|conductimetre|balance|bain-marie|automate|poste de securite|rampe/.test(n)) return 'Équipement';
    if (/verrerie|burette|fiole/.test(n)) return 'Verrerie';
    if (/epi|dasri|desinfect/.test(n)) return 'EPI / hygiène';
    if (/lames|cones|boites|tubes|bandelettes|flacons|cuves|huile/.test(n)) return 'Consommable';
    if (/micropipette|anses|cellules de numeration|chromatographie/.test(n)) return 'Petit matériel';
    return 'Réactif / coffret';
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

  function connecter(email, pin) {
    api('connexion', { email: email, pin: pin }).then(function (r) {
      if (!r.ok) return toast(r.error, true);
      S.session = { jeton: r.data.jeton };
      ecrire(CLE_SESSION, S.session);
      S.onglet = null; S.releve = null; S.preDemande = null; S.preCommande = null;
      charger();
    });
  }

  app.addEventListener('submit', function (ev) {
    var form = ev.target, type = form.getAttribute('data-form');
    if (!type) return;
    ev.preventDefault();
    var v = valeurs(form);
    if (ev.submitter && ev.submitter.name) v[ev.submitter.name] = ev.submitter.value;
    switch (type) {
      case 'connexion': connecter(v.email, v.pin); break;
      case 'arrivee': agir('arrivee', v, 'Arrivée enregistrée.'); break;
      case 'depart':
        (v.heure_depart ? boite('Départ à ' + v.heure_depart + ' saisi à la main : il sera signalé à la validation.') : Promise.resolve(true))
          .then(function (ok) { if (ok) agir('depart', v, 'Départ enregistré.'); });
        break;
      case 'saisieManuelle': agir('saisieManuelle', v, 'Présence envoyée en validation.'); break;
      case 'demande': agir('demande', v, 'Demande envoyée.').then(function (r) { if (r) S.preDemande = null; rendre(); }); break;
      case 'message': agir('message', { demande_id: form.getAttribute('data-id'), texte: v.texte }); break;
      case 'incident': agir('incident', v, 'Signalement enregistré.'); break;
      case 'majIncident': agir('majIncident', { id: form.getAttribute('data-id'), statut: v.statut, resolution: v.resolution }, 'Incident mis à jour.'); break;
      case 'releve': chargerReleve(v.user_id, v.mois); break;
      case 'article': agir('article', v, 'Inventaire mis à jour.').then(function (r) { if (r) { S.edition = null; rendre(); } }); break;
      case 'commande':
        v.devis = [1, 2, 3].map(function (i) { return { fournisseur: v['devis_f' + i], montant: v['devis_m' + i], lien: v['devis_l' + i] }; });
        agir('commande', v, 'Demande envoyée au prof référent.').then(function (r) { if (r) { S.preCommande = null; rendre(); } });
        break;
      case 'rangement':
        var controles = {};
        C().controlesRangement.forEach(function (c, i) { if (v['c' + i]) controles[c] = v['c' + i]; });
        var manq = C().controlesRangement.length - Object.keys(controles).length;
        (manq ? boite(manq + ' point(s) sans réponse seront notés « N/A ».', { ok: 'Continuer' }) : Promise.resolve(true)).then(function (ok) {
          if (ok) agir('rangement', { labo: v.labo, demande_id: v.demande_id, controles: controles, remarques: v.remarques }, 'Contrôle enregistré.');
        });
        break;
    }
  });

  app.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-act],[data-onglet]');
    if (!t) return;
    if (t.hasAttribute('data-onglet')) { S.onglet = t.getAttribute('data-onglet'); S.edition = null; window.scrollTo(0, 0); return charger(); }
    var id = t.getAttribute('data-id'), v = t.getAttribute('data-v');
    var art = id ? (S.etat && (S.etat.articles || []).filter(function (a) { return a.id === id; })[0]) : null;
    switch (t.getAttribute('data-act')) {
      case 'demoCompte': connecter(t.getAttribute('data-email'), t.getAttribute('data-pin')); break;
      case 'deconnexion': api('deconnexion').then(finSession); break;
      case 'reinit':
        boite('Effacer les données de démonstration et repartir des exemples ?').then(function (ok) {
          if (ok) { LaboNav.reinitialiser(); demoCore = LaboCore.create(LaboNav.store(), LaboNav.env); LaboNav.amorcer(demoCore); finSession(); }
        });
        break;
      case 'recharger': charger(); break;
      case 'filtre': S.filtres[t.getAttribute('data-cle')] = v; rendre(); break;
      case 'prendre': agir('majDemande', { id: id, prendre: true }, 'Demande prise en charge.'); break;
      case 'statutDemande':
        (v === 'annulee' ? boite('Annuler cette demande de TP ?', { ok: 'Annuler la demande' }) : Promise.resolve(true))
          .then(function (ok) { if (ok) agir('majDemande', { id: id, statut: v }, 'Statut mis à jour.'); });
        break;
      case 'toutOk': Array.prototype.forEach.call(app.querySelectorAll('.seg input[value="ok"]'), function (i) { i.checked = true; }); break;
      case 'valider': agir('validerSession', { id: id, decision: 'validee' }, 'Présence validée.').then(function () { if (S.releve) chargerReleve(); }); break;
      case 'contester':
        boite('Contester cette présence', { saisie: 'Motif (visible par la prestataire)', requis: true, ok: 'Contester' }).then(function (motif) {
          if (motif) agir('validerSession', { id: id, decision: 'contestee', motif: motif }, 'Présence contestée.').then(function () { if (S.releve) chargerReleve(); });
        });
        break;
      case 'csv': csv(); break;
      case 'imprimer': imprimer(); break;
      case 'viderPre': S[v] = null; rendre(); break;
      case 'progTout':
        S.filtres.progTout = !S.filtres.progTout;
        if (S.filtres.progTout && !S.programmeComplet) {
          api('programme', {}).then(function (r) { if (r.ok) S.programmeComplet = r.data; else toast(r.error, true); rendre(); });
        } else rendre();
        break;
      case 'demanderSeq':
        var p = sequence(id);
        S.preDemande = preDemandeDepuis(tpsDeSequence(p)[0] || null, p);
        S.onglet = 'demandes'; rendre(); window.scrollTo(0, 0);
        break;
      case 'preparerTP':
        var tref = tpRef(id), sq0 = t.getAttribute('data-seq') ? sequence(t.getAttribute('data-seq')) : null;
        S.preDemande = preDemandeDepuis(tref, sq0);
        S.onglet = 'demandes'; rendre(); window.scrollTo(0, 0);
        break;
      case 'commanderDemandeItem':
        var dd = (S.etat.demandes || []).filter(function (x) { return x.id === id; })[0], itd = t.getAttribute('data-item');
        S.preCommande = { designation: itd, filiere: dd.filiere, demande_tp_id: dd.id, categorie: categorieDe(itd), contexte: 'Pour le TP « ' + dd.titre + ' » du ' + jourLisible(dd.date_tp) + ' (' + dd.classe + ').',
          justification: 'TP « ' + dd.titre + ' », ' + dd.classe + ', ' + jourLisible(dd.date_tp) + '.' };
        S.onglet = 'commandes'; rendre(); window.scrollTo(0, 0);
        break;
      case 'commanderTP':
        var tc = tpRef(id), itc = t.getAttribute('data-item');
        S.preCommande = { designation: itc, filiere: tc.filiere, categorie: categorieDe(itc), contexte: 'Matériel type du TP incontournable « ' + tc.intitule + ' » (' + tc.codes + ').',
          justification: filLib(tc.filiere) + ' · TP incontournable « ' + tc.intitule + ' » (' + tc.codes + ').' };
        S.onglet = 'commandes'; rendre(); window.scrollTo(0, 0);
        break;
      case 'progVue':
        S.filtres.progVue = v;
        if (v === 'catalogue' && !S.programmeComplet) api('programme', {}).then(function (r) { if (r.ok) S.programmeComplet = r.data; else toast(r.error, true); rendre(); });
        else rendre();
        break;
      case 'commanderSeq':
        var sq = sequence(id), item = t.getAttribute('data-item');
        S.preCommande = { designation: item, filiere: sq.filiere, sequence_id: sq.id, categorie: categorieDe(item),
          contexte: 'Pour la séquence « ' + sq.titre + ' » (' + filLib(sq.filiere) + ' ' + sq.annee + ', du ' + dateCourte(sq.debut) + ' au ' + dateCourte(sq.fin) + ').',
          justification: filLib(sq.filiere) + ' ' + sq.annee + ' · ' + sq.matiere + ' · séquence « ' + sq.titre + ' » (' + sq.semaines + ', du ' + dateCourte(sq.debut) + ' au ' + dateCourte(sq.fin) + ').' };
        S.onglet = 'commandes'; rendre(); window.scrollTo(0, 0);
        break;
      case 'commanderPour':
        var d = (S.etat.demandes || []).filter(function (x) { return x.id === id; })[0];
        S.preCommande = { filiere: d.filiere, demande_tp_id: d.id, contexte: 'Pour le TP « ' + d.titre + ' » du ' + jourLisible(d.date_tp) + ' (' + d.classe + ').',
          justification: 'TP « ' + d.titre + ' », ' + d.classe + ', ' + jourLisible(d.date_tp) + ' (' + d.creneau + ').' };
        S.onglet = 'commandes'; rendre(); window.scrollTo(0, 0);
        break;
      case 'commanderArticle':
        S.preCommande = { designation: art.designation, reference: art.reference, fournisseur: art.fournisseur, article_id: art.id, categorie: art.categorie,
          filiere: art.filiere === 'Commun' ? '' : art.filiere, contexte: 'Réapprovisionnement : il reste ' + num(art.quantite) + ' ' + art.unite + '.', justification: 'Réapprovisionnement de « ' + art.designation + ' » (stock : ' + num(art.quantite) + ' ' + art.unite + '). TP concernés : ' };
        S.onglet = 'commandes'; rendre(); window.scrollTo(0, 0);
        break;
      case 'choisirFournisseur': var fo = document.querySelector('#form-commande [name=fournisseur]'); if (fo) fo.value = v; break;
      case 'consommer':
        boite('Consommer « ' + art.designation + ' »', { saisie: 'Quantité utilisée (' + art.unite + ')', nombre: true, defaut: 1, requis: true, ok: 'Enregistrer' }).then(function (qc) {
          if (qc) agir('mouvement', { article_id: art.id, delta: -Math.abs(Number(String(qc).replace(',', '.'))), motif: 'Consommation TP' }, 'Consommation enregistrée.');
        });
        break;
      case 'entree':
        boite('Mouvement de stock : « ' + art.designation + ' »', { saisie: 'Quantité (positive = entrée, négative = sortie)', nombre: true, requis: true, ok: 'Suivant' }).then(function (qe) {
          if (!qe) return;
          var dq = Number(String(qe).replace(',', '.'));
          var motifs = dq > 0 ? ['Réception de commande', 'Correction d\'inventaire'] : ['Correction d\'inventaire', 'Casse / perte', 'Péremption (mise au rebut)'];
          boite('Motif du mouvement', { choix: motifs, ok: 'Enregistrer' }).then(function (mot) {
            if (mot) agir('mouvement', { article_id: art.id, delta: dq, motif: mot }, 'Stock mis à jour.');
          });
        });
        break;
      case 'editerArticle': S.edition = art; rendre(); var z = document.getElementById('zone-article'); if (z) z.scrollIntoView(); break;
      case 'annulerEdition': S.edition = null; rendre(); break;
      case 'retirerArticle':
        boite('Retirer cet article de l\'inventaire ? Son historique reste dans le classeur.', { ok: 'Retirer' }).then(function (ok) {
          if (ok) { var a2 = S.edition; agir('article', Object.assign({}, a2, { actif: 'non' }), 'Article retiré.').then(function () { S.edition = null; rendre(); }); }
        });
        break;
      case 'invAlerte': S.filtres.invAlerte = !S.filtres.invAlerte; rendre(); break;
      case 'cmd':
        var cm = (S.etat.commandes || []).filter(function (x) { return x.id === id; })[0];
        var etape;
        if (v === 'refusee') etape = boite('Refuser « ' + cm.designation + ' »', { saisie: 'Motif (envoyé au demandeur)', requis: true, ok: 'Refuser' }).then(function (m) { return m ? { motif: m } : null; });
        else if (v === 'annulee') etape = boite('Annuler cette demande d\'achat ?', { ok: 'Annuler la demande' }).then(function (ok) { return ok ? {} : null; });
        else if (v === 'approuvee') etape = boite('Approuver l\'achat de ' + cm.designation + ' pour ' + euros(cm.total_ttc) + ' TTC ? La ligne passe à « Validé » dans le classeur Pilotage dépenses.', { ok: 'Approuver' }).then(function (ok) { return ok ? {} : null; });
        else if (v === 'livree' && cm.article_id) etape = boite('Réception de « ' + cm.designation + ' »', { saisie: 'Quantité reçue (ajoutée au stock)', nombre: true, defaut: cm.quantite, requis: true, ok: 'Réceptionner' }).then(function (q) { return q ? { quantite_recue: q } : null; });
        else etape = Promise.resolve({});
        etape.then(function (extra) { if (extra) agir('majCommande', Object.assign({ id: id, statut: v }, extra), 'Commande mise à jour.'); });
        break;
    }
  });

  app.addEventListener('change', function (ev) {
    var t = ev.target, act = t.getAttribute('data-change');
    if (act === 'attribuer') agir('majDemande', { id: t.getAttribute('data-id'), prepa_id: t.value }, 'Demande attribuée.');
    if (act === 'statutDemande') agir('majDemande', { id: t.getAttribute('data-id'), statut: t.value }, 'Statut mis à jour.');
    if (act === 'progFiliere') { S.filtres.progFiliere = t.value; rendre(); }
    if (act === 'invFiliere') { S.filtres.invFiliere = t.value; rendre(); }
    if (act === 'categorieCommande') document.getElementById('sugg-fournisseurs').innerHTML = suggestionsHtml(fournisseursPour(t.value));
  });

  app.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t.hasAttribute('data-total')) majTotalCommande();
    if (t.getAttribute('data-input') === 'inventaire') {
      S.filtres.inventaire = t.value;
      var pos = t.selectionStart;
      rendre();
      var n = app.querySelector('[data-input="inventaire"]');
      if (n) { n.focus(); n.setSelectionRange(pos, pos); }
    }
  });

  setInterval(function () {
    var h = document.getElementById('horloge');
    if (h) h.textContent = LaboNav.format(new Date(), 'HH:mm');
    var d = document.getElementById('duree');
    if (d) d.textContent = duree(Math.round((Date.now() - new Date(d.getAttribute('data-depuis'))) / 60000));
  }, 15000);

  // Rafraîchissement discret quand rien n'est en cours de saisie.
  setInterval(function () {
    if (!S.session || document.hidden || S.occupe) return;
    var a = document.activeElement;
    if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
    if (app.querySelector('details[open]') || S.edition || S.preCommande || S.preDemande) return;
    charger();
  }, 90000);

  window.addEventListener('online', function () { if (S.session) charger(); });

  if (S.session) charger(); else rendre();
})();
