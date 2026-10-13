/*
 * Hôte navigateur de LaboCore : stockage localStorage et formatage des dates.
 * Sert au mode démonstration (API_URL vide dans app.js) et à l'affichage.
 */
var LaboNav = (function () {
  var TZ = 'Europe/Paris';
  var CLE = 'labo-demo-v1';

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

  var env = { now: function () { return new Date(); }, format: format, parseLocal: parseLocal, notify: null };

  function charger() {
    try { return JSON.parse(localStorage.getItem(CLE)) || null; } catch (e) { return null; }
  }
  function sauver(db) {
    try { localStorage.setItem(CLE, JSON.stringify(db)); } catch (e) { /* stockage indisponible : la démo reste en mémoire */ }
  }

  var memoire = null;

  function store() {
    if (!memoire) memoire = charger() || {};
    Object.keys(LaboCore.TABLES).forEach(function (t) { if (!memoire[t]) memoire[t] = []; });
    function copie(o) { return JSON.parse(JSON.stringify(o)); }
    return {
      all: function (t) { return copie(memoire[t]); },
      get: function (t, id) {
        var r = memoire[t].filter(function (x) { return String(x.id) === String(id); })[0];
        return r ? copie(r) : null;
      },
      insert: function (t, o) { memoire[t].push(copie(o)); sauver(memoire); },
      update: function (t, id, patch) {
        var r = memoire[t].filter(function (x) { return String(x.id) === String(id); })[0];
        if (!r) throw new Error('Ligne introuvable');
        Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
        sauver(memoire);
      }
    };
  }

  function decaler(jours) {
    var d = new Date(Date.now() + jours * 86400000);
    return format(d, 'yyyy-MM-dd');
  }

  // Données fictives de démonstration.
  function amorcer(core) {
    var s = store();
    if (s.all('Utilisateurs').length) return;
    [
      { id: 'T1', nom: 'Technicienne A', role: 'technicienne', pin: '1111', email: '', taux_horaire: '30', actif: 'oui' },
      { id: 'T2', nom: 'Technicienne B', role: 'technicienne', pin: '2222', email: '', taux_horaire: '30', actif: 'oui' },
      { id: 'P1', nom: 'Enseignant biochimie', role: 'enseignant', pin: '3333', email: '', taux_horaire: '', actif: 'oui' },
      { id: 'P2', nom: 'Enseignante microbiologie', role: 'enseignant', pin: '4444', email: '', taux_horaire: '', actif: 'oui' },
      { id: 'R1', nom: 'Responsable labo', role: 'responsable', pin: '0000', email: '', taux_horaire: '', actif: 'oui' }
    ].forEach(function (u) { s.insert('Utilisateurs', u); });

    var T1 = { id: 'T1', pin: '1111' }, T2 = { id: 'T2', pin: '2222' };
    var P1 = { id: 'P1', pin: '3333' }, P2 = { id: 'P2', pin: '4444' }, R1 = { id: 'R1', pin: '0000' };
    function q(auth, action, data) { return core.handle({ action: action, auth: auth, data: data }); }

    var d1 = q(P1, 'demande', {
      date_tp: decaler(2), creneau: '10h15 – 11h45', labo: 'Labo Robert Koch', classe: 'BM1', discipline: 'Biochimie',
      competence: LaboCore.CONFIG.blocs.BM[1], titre: 'Doser les transaminases ALAT et ASAT', effectif: '16',
      besoin: '1 coffret ALAT + 1 coffret ASAT, Exatrol N et P, spectrophotomètre, cuves, micropipettes P1000 et P200'
    }).data;
    var d2 = q(P2, 'demande', {
      date_tp: decaler(18), creneau: '14h30 – 16h00', labo: 'Labo Gerty Cori', classe: 'BIOALC1', discipline: 'Microbiologie',
      competence: LaboCore.CONFIG.blocs.BIOAC[1], titre: 'Couler des milieux de culture en conditions stériles', effectif: '14',
      besoin: 'Becs Bunsen, gélose Drigalski et EMB en poudre, boîtes de Petri stériles, alcool'
    }).data;
    q(P2, 'demande', {
      date_tp: decaler(0), creneau: '16h15 – 17h45', labo: 'Labo Marie Curie', classe: 'BM1', discipline: 'Hématologie / Immunologie',
      competence: LaboCore.CONFIG.blocs.BM[1], titre: 'Reconnaître les globules blancs sur frottis', effectif: '12',
      besoin: 'Frottis sanguins colorés, microscopes, huile à immersion'
    });
    q(T1, 'majDemande', { id: d1.id, prendre: true });
    q(T1, 'message', { demande_id: d1.id, texte: 'Exatrol P à 0 dans l\'inventaire : je passe commande ou on travaille avec N seul ?' });
    q(P1, 'message', { demande_id: d1.id, texte: 'N seul suffira pour ce TP.' });
    q(T2, 'majDemande', { id: d2.id, prendre: true });

    // Présences du mois passé, saisies puis validées.
    var missions = LaboCore.CONFIG.missions;
    [[-9, '08:00', '12:30', T1], [-8, '13:30', '18:00', T1], [-7, '08:15', '12:00', T2], [-3, '09:00', '17:30', T2], [-2, '08:00', '11:45', T1]]
      .forEach(function (x, i) {
        var r = q(x[3], 'saisieManuelle', {
          date: decaler(x[0]), debut: x[1], fin: x[2], labo: LaboCore.CONFIG.labos[i % 4],
          missions: [missions[i % 2], missions[2]], motif: 'Reprise de l\'émargement papier (démo)'
        }).data;
        if (i < 3) q(R1, 'validerSession', { id: r.id, decision: 'validee' });
      });

    q(T2, 'rangement', {
      labo: 'Labo Gerty Cori', controles: { 'Pipettes verre': 'ok', 'Becs Bunsen': 'ok', 'DASRI': 'nc', 'Microscopes': 'ok' },
      remarques: 'Collecteur DASRI plein, pas de collecteur de rechange.'
    });
    q(T1, 'incident', { labo: 'Labo Robert Koch', categorie: 'Équipement en panne', gravite: 'Bloquant', description: 'Spectrophotomètre n° 2 : lampe qui ne s\'allume plus.' });
    q(T1, 'incident', { labo: 'Labo Fleming', categorie: 'Réactif périmé', gravite: 'Gênant', description: 'Kit acide urique (réf. 80351) périmé depuis le 01/10/2026 selon l\'inventaire.' });
  }

  function reinitialiser() {
    memoire = null;
    try { localStorage.removeItem(CLE); } catch (e) { /* rien */ }
  }

  return { env: env, store: store, amorcer: amorcer, reinitialiser: reinitialiser, format: format };
})();
