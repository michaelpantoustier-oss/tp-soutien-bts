/*
 * Suivi labo Aurlom BTS+ — serveur Google Apps Script.
 *
 * Projet Apps Script lié au classeur Google Sheets de suivi (privé), avec :
 *  - Core.gs : copie intégrale de labo/core.js ;
 *  - Code.gs : ce fichier.
 * Procédure complète : labo/README.md.
 */

// Identifiant du classeur « Pilotage dépenses » (la partie entre /d/ et /edit
// de son adresse). Vide = les commandes approuvées n'y sont pas recopiées.
var PILOTAGE_ID = '';
var ENVOYER_MAILS = true;

/* -------------------------------------------------------------------------- */
/* Point d'entrée web                                                          */
/* -------------------------------------------------------------------------- */
function doPost(e) {
  var req;
  try {
    if (!e || !e.postData || e.postData.contents.length > 100000) throw new Error('taille');
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'Requête refusée.' });
  }
  if (limiteDepassee_(req)) return json_({ ok: false, error: 'Trop de requêtes. Patiente une minute.' });
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return json_({ ok: false, error: 'Serveur occupé, réessaie.' });
  try {
    return json_(LaboCore.create(sheetStore_(), env_()).handle(req));
  } finally {
    lock.releaseLock();
  }
}

// Aucune donnée en GET : un robot qui appelle l'adresse ne reçoit rien.
function doGet() {
  return ContentService.createTextOutput('').setMimeType(ContentService.MimeType.TEXT);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Limite globale et par session : protège contre l'aspiration et le forçage.
function limiteDepassee_(req) {
  var cache = CacheService.getScriptCache();
  var minute = Math.floor(Date.now() / 60000);
  var cles = ['rl:all:' + minute];
  if (req && req.jeton) cles.push('rl:' + hache_(String(req.jeton)).slice(0, 20) + ':' + minute);
  if (req && req.action === 'connexion') cles.push('rl:cx:' + minute);
  var plafonds = [600, 120, 30];
  for (var i = 0; i < cles.length; i++) {
    var n = Number(cache.get(cles[i]) || 0) + 1;
    cache.put(cles[i], String(n), 120);
    var plafond = cles[i].indexOf('rl:cx:') === 0 ? plafonds[2] : (i === 0 ? plafonds[0] : plafonds[1]);
    if (n > plafond) return true;
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* Environnement fourni au cœur                                                */
/* -------------------------------------------------------------------------- */
function poivre_() {
  var p = PropertiesService.getScriptProperties();
  var v = p.getProperty('POIVRE');
  if (!v) { v = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('POIVRE', v); }
  return v;
}

function hache_(s) {
  var octets = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return octets.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function hashPin_(id, pin) { return hache_(poivre_() + '|' + id + '|' + pin); }

function env_() {
  var tz = LaboCore.CONFIG.fuseau;
  var props = PropertiesService.getScriptProperties();
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
    randomToken: function () { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); },
    hashPin: hashPin_,
    cache: {
      get: function (k) { return cache.get(k); },
      put: function (k, v, s) { cache.put(k, v, s); },
      remove: function (k) { cache.remove(k); }
    },
    // Les jetons ne sont stockés que hachés.
    sessions: {
      put: function (jeton, obj) { nettoyerSessions_(); props.setProperty('jeton:' + hache_(jeton), JSON.stringify(obj)); },
      get: function (jeton) { var v = props.getProperty('jeton:' + hache_(jeton)); return v ? JSON.parse(v) : null; },
      remove: function (jeton) { props.deleteProperty('jeton:' + hache_(jeton)); }
    },
    notify: ENVOYER_MAILS ? function (to, sujet, corps) {
      try { MailApp.sendEmail(to, sujet, corps + '\n\n— Suivi labo Aurlom BTS+ (ne pas répondre à ce message)'); } catch (err) { console.warn(err); }
    } : null,
    pilotage: PILOTAGE_ID ? pilotage_() : null,
    log: function (e) { console.error(e && e.stack ? e.stack : e); }
  };
}

function nettoyerSessions_() {
  var p = PropertiesService.getScriptProperties();
  var tout = p.getProperties();
  var t = Date.now();
  Object.keys(tout).forEach(function (k) {
    if (k.indexOf('jeton:') !== 0) return;
    try { if (JSON.parse(tout[k]).exp < t) p.deleteProperty(k); } catch (e) { p.deleteProperty(k); }
  });
}

/* -------------------------------------------------------------------------- */
/* Classeur « Pilotage dépenses » : une ligne par commande approuvée,          */
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
  return {
    ajouter: function (c, dateValidation) {
      var sh = onglet(c.filiere);
      var ligne = premiereLigneVide(sh);
      var id = prochainId(sh, c.filiere, new Date());
      var devis = [];
      try { devis = JSON.parse(c.devis || '[]'); } catch (e) { devis = []; }
      var justif = c.justification + (devis.length ? ' · Devis : ' + devis.map(function (d) { return d.fournisseur + ' ' + d.montant + ' €'; }).join(' / ') : '') + ' · Suivi labo ' + c.id;
      var valeurs = [id, Utilities.formatDate(new Date(c.cree_le), LaboCore.CONFIG.fuseau, 'dd/MM/yyyy'), c.user_nom,
        c.designation + (c.reference ? ' (réf. ' + c.reference + ')' : ''), justif, Number(c.quantite), Number(c.prix_unitaire_ttc),
        Number(c.total_ttc), c.fournisseur, c.lien, 'Validé', c.approuve_par + ' – ' + dateValidation];
      var cellules = sh.getRange(ligne, 1, 1, valeurs.length);
      var formules = cellules.getFormulas()[0];
      valeurs.forEach(function (v, i) { if (!formules[i]) sh.getRange(ligne, i + 1).setValue(sur(v)); });
      return id;
    },
    statut: function (filiere, id, statut) {
      var sh = onglet(filiere);
      var ids = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
      for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) { sh.getRange(i + 2, 11).setValue(statut); return; }
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
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Suivi labo')
    .addItem('Sécuriser les codes PIN saisis', 'securiserPins')
    .addItem('Déconnecter tout le monde', 'deconnecterTout')
    .addToUi();
}

// Un PIN tapé dans la colonne « pin » est remplacé par son empreinte dès la saisie.
function onEdit(e) {
  try {
    var sh = e.range.getSheet();
    if (sh.getName() !== 'Utilisateurs') return;
    var entetes = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    if (e.range.getColumn() === entetes.indexOf('pin') + 1) securiserPins();
  } catch (err) { /* le menu reste disponible */ }
}

function securiserPins() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Utilisateurs');
  var entetes = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  var cId = entetes.indexOf('id'), cPin = entetes.indexOf('pin'), cHash = entetes.indexOf('pin_hash');
  var n = sh.getLastRow() - 1;
  if (n < 1) return;
  var vals = sh.getRange(2, 1, n, entetes.length).getDisplayValues();
  for (var i = 0; i < vals.length; i++) {
    var pin = String(vals[i][cPin]).trim();
    if (!pin) continue;
    if (!/^\d{6,}$/.test(pin)) {
      sh.getRange(i + 2, cPin + 1).setValue('').setNote('PIN refusé : 6 chiffres minimum.');
      continue;
    }
    sh.getRange(i + 2, cHash + 1).setNumberFormat('@').setValue(hashPin_(vals[i][cId], pin));
    sh.getRange(i + 2, cPin + 1).setValue('').setNote('PIN enregistré le ' + Utilities.formatDate(new Date(), LaboCore.CONFIG.fuseau, 'dd/MM/yyyy HH:mm'));
  }
}

function deconnecterTout() {
  var p = PropertiesService.getScriptProperties();
  Object.keys(p.getProperties()).forEach(function (k) { if (k.indexOf('jeton:') === 0) p.deleteProperty(k); });
}

// À lancer une fois depuis l'éditeur : crée les feuilles et le compte directeur.
function installer() {
  var store = sheetStore_();
  Object.keys(LaboCore.TABLES).forEach(function (t) { store.all(t); });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(LaboCore.CONFIG.fuseau);
  ss.getSheetByName('Utilisateurs').getRange('A:J').setNumberFormat('@');
  if (!store.all('Utilisateurs').length) {
    store.insert('Utilisateurs', { id: 'DIR', nom: 'Directeur du campus', email: Session.getActiveUser().getEmail(), role: 'directeur', filiere: '', disciplines: '', pin: '', pin_hash: '', taux_horaire: '', actif: 'oui' });
  }
  poivre_();
  var feuille1 = ss.getSheetByName('Feuille 1') || ss.getSheetByName('Sheet1');
  if (feuille1 && feuille1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(feuille1);
}
