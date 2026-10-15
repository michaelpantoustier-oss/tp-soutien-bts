/*
 * Suivi labo Aurlom BTS+ — serveur Google Apps Script.
 *
 * Projet Apps Script lié au classeur Google Sheets de suivi (privé), avec :
 *  - Core.gs : copie intégrale de labo/core.js ;
 *  - Code.gs : ce fichier.
 * Procédure complète : labo/README.md.
 */

// L'identifiant du classeur « Pilotage dépenses » n'est pas écrit ici (ce code
// est public) : il se renseigne dans Paramètres du projet > Propriétés du
// script, clé PILOTAGE_ID (la partie entre /d/ et /edit de son adresse).
// Sans cette propriété, les commandes ne sont pas reportées.
var PILOTAGE_ID = PropertiesService.getScriptProperties().getProperty('PILOTAGE_ID') || '';
var ENVOYER_MAILS = true;

/* -------------------------------------------------------------------------- */
/* Points d'entrée                                                             */
/*                                                                            */
/* Déploiement : Application Web, « Exécuter en tant que : moi », « Accès :    */
/* tous les utilisateurs de aurlom.com ». Google impose la connexion avec un   */
/* compte de l'école avant tout affichage ; le script vérifie ensuite le       */
/* domaine puis la présence du compte dans la feuille Utilisateurs.            */
/* -------------------------------------------------------------------------- */
function proprietes_() { return PropertiesService.getScriptProperties(); }
function domaine_() { return (proprietes_().getProperty('DOMAINE') || 'aurlom.com').toLowerCase(); }

function emailVerifie_() {
  var email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!email || email.slice(-(domaine_().length + 1)) !== '@' + domaine_()) return '';
  return email;
}

function doGet() {
  var email = emailVerifie_();
  var sortie = email
    ? HtmlService.createHtmlOutputFromFile('Page')
    : HtmlService.createHtmlOutput('<p style="font-family:sans-serif;padding:24px">Accès réservé aux comptes Google de l\'école.</p>');
  // Mode d'intégration laissé à DEFAULT : Google refuse alors l'affichage de la
  // page dans un cadre d'un autre site (ALLOWALL l'autoriserait).
  return sortie.setTitle('Suivi labo TP')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Appelé par la page via google.script.run : l'identité vient de Google, pas du navigateur.
function appel(req) {
  var email = emailVerifie_();
  if (!email) return { ok: false, error: 'Accès réservé aux comptes Google de l\'école.' };
  if (limiteDepassee_(email)) return { ok: false, error: 'Trop de requêtes. Patiente une minute.' };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, error: 'Serveur occupé, réessaie.' };
  try {
    // Aller-retour JSON : google.script.run ne transporte que des données simples.
    return JSON.parse(JSON.stringify(LaboCore.create(sheetStore_(), env_()).handle(req || {}, { email: email })));
  } finally {
    lock.releaseLock();
  }
}

// Limite globale et par compte : protège contre l'aspiration en masse.
function limiteDepassee_(email) {
  var cache = CacheService.getScriptCache();
  var minute = Math.floor(Date.now() / 60000);
  var regles = [['rl:all:' + minute, 600], ['rl:' + hache_(email).slice(0, 20) + ':' + minute, 120]];
  for (var i = 0; i < regles.length; i++) {
    var n = Number(cache.get(regles[i][0]) || 0) + 1;
    cache.put(regles[i][0], String(n), 120);
    if (n > regles[i][1]) return true;
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* Environnement fourni au cœur                                                */
/* -------------------------------------------------------------------------- */
function hache_(s) {
  var octets = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return octets.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function env_() {
  var tz = LaboCore.CONFIG.fuseau;
  var cache = CacheService.getScriptCache();
  return {
    now: function () { return new Date(); },
    format: function (d, motif) { return Utilities.formatDate(d, tz, motif); },
    parseLocal: function (dateStr, hhmm) {
      var p = hhmm.split(':');
      var off = Utilities.formatDate(new Date(dateStr + 'T12:00:00Z'), tz, 'XXX');
      return new Date(dateStr + 'T' + ('0' + p[0]).slice(-2) + ':' + p[1] + ':00' + off);
    },
    random: function (n) { return Utilities.getUuid().replace(/-/g, '').slice(0, n).toUpperCase(); },
    cache: {
      get: function (k) { return cache.get(k); },
      put: function (k, v, s) { cache.put(k, v, s); },
      remove: function (k) { cache.remove(k); }
    },
    notify: ENVOYER_MAILS ? function (to, sujet, corps) {
      try { MailApp.sendEmail(to, sujet, corps + '\n\n— Suivi labo Aurlom BTS+ (ne pas répondre à ce message)'); } catch (err) { console.warn(err); }
    } : null,
    pilotage: PILOTAGE_ID ? pilotage_() : null,
    log: function (e) { console.error(e && e.stack ? e.stack : e); }
  };
}

/* -------------------------------------------------------------------------- */
/* Classeur « Pilotage dépenses » : une ligne par demande de commande,         */
/* dans l'onglet de la filière (BIOMED ou BIOALC), mêmes colonnes.             */
/* -------------------------------------------------------------------------- */
function pilotage_() {
  function onglet(filiere) {
    var sh = SpreadsheetApp.openById(PILOTAGE_ID).getSheetByName(filiere);
    if (!sh) throw new Error('Onglet ' + filiere + ' absent du classeur de pilotage.');
    return sh;
  }
  function premiereLigneVide(sh) {
    var col = sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), 1).getValues();
    for (var i = 0; i < col.length; i++) if (col[i][0] === '') return i + 2;
    sh.insertRowAfter(sh.getMaxRows());
    return sh.getMaxRows();
  }
  function prochainId(sh, filiere, date) {
    var annee = Number(Utilities.formatDate(date, LaboCore.CONFIG.fuseau, 'M')) >= 9
      ? Utilities.formatDate(date, LaboCore.CONFIG.fuseau, 'yyyy')
      : String(Number(Utilities.formatDate(date, LaboCore.CONFIG.fuseau, 'yyyy')) - 1);
    var prefixe = filiere + '-' + annee + '-';
    var max = 0;
    sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues().forEach(function (r) {
      var v = String(r[0]);
      if (v.indexOf(prefixe) === 0) max = Math.max(max, Number(v.slice(prefixe.length)) || 0);
    });
    return prefixe + ('00' + (max + 1)).slice(-3);
  }
  function sur(v) { // empêche l'interprétation d'une saisie comme formule
    return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v;
  }
  function ligneDe(sh, id) {
    var ids = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
    for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
    return 0;
  }
  return {
    // Une ligne par demande de commande, dès sa soumission.
    ajouter: function (c, statut, validePar) {
      var sh = onglet(c.filiere);
      var ligne = premiereLigneVide(sh);
      var id = prochainId(sh, c.filiere, new Date());
      var devis = [];
      try { devis = JSON.parse(c.devis || '[]'); } catch (e) { devis = []; }
      var justif = c.justification + (devis.length ? ' · Devis : ' + devis.map(function (d) { return d.fournisseur + ' ' + d.montant + ' €'; }).join(' / ') : '') + ' · Suivi labo ' + c.id;
      var valeurs = [id, Utilities.formatDate(new Date(c.cree_le), LaboCore.CONFIG.fuseau, 'dd/MM/yyyy'), c.user_nom,
        c.designation + (c.reference ? ' (réf. ' + c.reference + ')' : ''), justif, Number(c.quantite), Number(c.prix_unitaire_ttc),
        Number(c.total_ttc), c.fournisseur, c.lien, statut, validePar || ''];
      var formules = sh.getRange(ligne, 1, 1, valeurs.length).getFormulas()[0];
      valeurs.forEach(function (v, i) { if (!formules[i]) sh.getRange(ligne, i + 1).setValue(sur(v)); });
      return id;
    },
    maj: function (filiere, id, statut, validePar) {
      var sh = onglet(filiere);
      var ligne = ligneDe(sh, id);
      if (!ligne) throw new Error('Ligne ' + id + ' introuvable dans le classeur de pilotage.');
      sh.getRange(ligne, 11).setValue(statut);
      if (validePar) sh.getRange(ligne, 12).setValue(sur(validePar));
    }
  };
}

/* -------------------------------------------------------------------------- */
/* Stockage : une feuille par table, ligne 1 = noms de colonnes, cellules en   */
/* texte brut (pas de conversion de dates, pas de formule injectée).           */
/* -------------------------------------------------------------------------- */
function sheetStore_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cache = {};

  function feuille(table) {
    var cols = LaboCore.TABLES[table];
    if (!cols) throw new Error('Table inconnue : ' + table);
    var sh = ss.getSheetByName(table);
    if (!sh) {
      sh = ss.insertSheet(table);
      sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#111111').setFontColor('#ffffff');
      sh.setFrozenRows(1);
    }
    var entetes = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(String);
    var manquantes = cols.filter(function (c) { return entetes.indexOf(c) === -1; });
    if (manquantes.length) {
      var depart = entetes.filter(String).length + 1;
      sh.getRange(1, depart, 1, manquantes.length).setValues([manquantes]).setFontWeight('bold').setBackground('#111111').setFontColor('#ffffff');
    }
    return sh;
  }

  function enTexte(v) {
    if (v === undefined || v === null) return '';
    var s = String(v);
    return /^[=+\-@]/.test(s) ? "'" + s : s;
  }

  function lire(table) {
    if (cache[table]) return cache[table];
    var sh = feuille(table), cols = LaboCore.TABLES[table];
    var entetes = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    var n = sh.getLastRow() - 1, rows = [];
    if (n > 0) {
      var vals = sh.getRange(2, 1, n, entetes.length).getValues();
      for (var r = 0; r < vals.length; r++) {
        var o = { _ligne: r + 2 }, vide = true;
        for (var c = 0; c < cols.length; c++) {
          var idx = entetes.indexOf(cols[c]);
          var v = idx === -1 ? '' : vals[r][idx];
          if (v instanceof Date) v = Utilities.formatDate(v, LaboCore.CONFIG.fuseau, 'yyyy-MM-dd');
          if (v !== '') vide = false;
          o[cols[c]] = v;
        }
        if (!vide) rows.push(o);
      }
    }
    cache[table] = rows;
    return rows;
  }

  function nettoyer(o) { var c = {}; for (var k in o) if (k !== '_ligne') c[k] = o[k]; return c; }

  function ecrire(table, ligne, obj) {
    var sh = feuille(table);
    var entetes = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    var range = sh.getRange(ligne, 1, 1, entetes.length);
    range.setNumberFormat('@');
    range.setValues([entetes.map(function (k) { return enTexte(obj[k]); })]);
  }

  return {
    all: function (t) { return lire(t).map(nettoyer); },
    get: function (t, id) { var r = lire(t).filter(function (x) { return String(x.id) === String(id); })[0]; return r ? nettoyer(r) : null; },
    insert: function (t, obj) {
      var ligne = feuille(t).getLastRow() + 1;
      ecrire(t, ligne, obj);
      if (cache[t]) { var c = nettoyer(obj); c._ligne = ligne; cache[t].push(c); }
    },
    update: function (t, id, patch) {
      var r = lire(t).filter(function (x) { return String(x.id) === String(id); })[0];
      if (!r) throw new Error('Ligne introuvable : ' + id);
      for (var k in patch) r[k] = patch[k];
      ecrire(t, r._ligne, r);
    }
  };
}

/* -------------------------------------------------------------------------- */
/* Administration depuis le classeur                                           */
/* -------------------------------------------------------------------------- */
// À lancer une fois depuis l'éditeur : crée les feuilles et le compte directeur.
function installer() {
  var store = sheetStore_();
  Object.keys(LaboCore.TABLES).forEach(function (t) { store.all(t); });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(LaboCore.CONFIG.fuseau);
  ss.getSheetByName('Utilisateurs').getRange('A:H').setNumberFormat('@');
  if (!store.all('Utilisateurs').length) {
    store.insert('Utilisateurs', { id: 'DIR', nom: 'Directeur du campus', email: Session.getActiveUser().getEmail(), role: 'directeur', filiere: '', disciplines: '', taux_horaire: '', actif: 'oui' });
  }
  var feuille1 = ss.getSheetByName('Feuille 1') || ss.getSheetByName('Sheet1');
  if (feuille1 && feuille1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(feuille1);
}
