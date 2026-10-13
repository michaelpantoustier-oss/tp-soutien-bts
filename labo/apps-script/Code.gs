/*
 * Suivi labo Aurlom BTS+ — serveur Google Apps Script.
 *
 * Projet Apps Script lié au classeur Google Sheets de suivi, avec deux fichiers :
 *  - Core.gs : copie intégrale de labo/core.js ;
 *  - Code.gs : ce fichier.
 * Déploiement : Déployer > Nouveau déploiement > Application Web,
 * « Exécuter en tant que : moi », « Accès : tout le monde ».
 * Voir labo/README.md pour la procédure complète.
 */

var ENVOYER_MAILS = true; // false pour couper les alertes e-mail

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'Requête illisible.' });
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var core = LaboCore.create(sheetStore_(), env_());
    return json_(core.handle(req));
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return json_({ ok: true, data: 'Suivi labo : service actif.' });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function env_() {
  var tz = LaboCore.CONFIG.fuseau;
  return {
    now: function () { return new Date(); },
    format: function (d, motif) { return Utilities.formatDate(d, tz, motif); },
    parseLocal: function (dateStr, hhmm) {
      var p = hhmm.split(':');
      var hh = ('0' + p[0]).slice(-2);
      // Décalage du fuseau à cette date (gère l'heure d'été).
      var midi = new Date(dateStr + 'T12:00:00Z');
      var off = Utilities.formatDate(midi, tz, 'XXX'); // ex. +02:00
      return new Date(dateStr + 'T' + hh + ':' + p[1] + ':00' + off);
    },
    notify: ENVOYER_MAILS ? function (to, sujet, corps) {
      try { MailApp.sendEmail(to, sujet, corps + '\n\n— Suivi labo Aurlom BTS+'); } catch (err) { console.warn(err); }
    } : null
  };
}

/* -------------------------------------------------------------------------- */
/* Stockage : une feuille par table, ligne 1 = noms de colonnes.               */
/* Toutes les cellules sont au format texte pour que Sheets ne convertisse     */
/* pas les dates et les identifiants.                                          */
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
      sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold')
        .setBackground('#111111').setFontColor('#ffffff');
      sh.setFrozenRows(1);
    }
    return sh;
  }

  function lire(table) {
    if (cache[table]) return cache[table];
    var sh = feuille(table);
    var cols = LaboCore.TABLES[table];
    var n = sh.getLastRow() - 1;
    var rows = [];
    if (n > 0) {
      var vals = sh.getRange(2, 1, n, cols.length).getValues();
      for (var r = 0; r < vals.length; r++) {
        var o = { _ligne: r + 2 };
        var vide = true;
        for (var c = 0; c < cols.length; c++) {
          var v = vals[r][c];
          if (v instanceof Date) v = v.toISOString();
          if (v !== '') vide = false;
          o[cols[c]] = v;
        }
        if (!vide) rows.push(o);
      }
    }
    cache[table] = rows;
    return rows;
  }

  function nettoyer(o) {
    var c = {};
    for (var k in o) if (k !== '_ligne') c[k] = o[k];
    return c;
  }

  return {
    all: function (table) { return lire(table).map(nettoyer); },
    get: function (table, id) {
      var r = lire(table).filter(function (x) { return String(x.id) === String(id); })[0];
      return r ? nettoyer(r) : null;
    },
    insert: function (table, obj) {
      var sh = feuille(table);
      var cols = LaboCore.TABLES[table];
      var ligne = sh.getLastRow() + 1;
      var range = sh.getRange(ligne, 1, 1, cols.length);
      range.setNumberFormat('@');
      range.setValues([cols.map(function (k) { return obj[k] === undefined || obj[k] === null ? '' : String(obj[k]); })]);
      if (cache[table]) { var copie = nettoyer(obj); copie._ligne = ligne; cache[table].push(copie); }
    },
    update: function (table, id, patch) {
      var rows = lire(table);
      var r = rows.filter(function (x) { return String(x.id) === String(id); })[0];
      if (!r) throw new Error('Ligne introuvable : ' + id);
      var sh = feuille(table);
      var cols = LaboCore.TABLES[table];
      for (var k in patch) r[k] = patch[k];
      var range = sh.getRange(r._ligne, 1, 1, cols.length);
      range.setNumberFormat('@');
      range.setValues([cols.map(function (k) { return r[k] === undefined || r[k] === null ? '' : String(r[k]); })]);
    }
  };
}

/* -------------------------------------------------------------------------- */
/* À lancer une fois depuis l'éditeur : crée les feuilles et un compte         */
/* responsable à compléter dans la feuille Utilisateurs.                       */
/* -------------------------------------------------------------------------- */
function installer() {
  var store = sheetStore_();
  Object.keys(LaboCore.TABLES).forEach(function (t) { store.all(t); });
  if (!store.all('Utilisateurs').length) {
    store.insert('Utilisateurs', { id: 'RESP1', nom: 'Responsable labo', role: 'responsable', pin: '000000', email: Session.getActiveUser().getEmail(), taux_horaire: '', actif: 'oui' });
  }
  SpreadsheetApp.getActiveSpreadsheet().setSpreadsheetTimeZone(LaboCore.CONFIG.fuseau);
}
