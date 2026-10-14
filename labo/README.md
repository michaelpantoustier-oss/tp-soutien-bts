# Suivi labo TP

Application web des laboratoires de TP du campus pour le BTS Biologie médicale (BIOMED, RNCP40027) et le BTS Bioanalyses en laboratoire de contrôle (BIOALC, RNCP38884). Elle couvre la présence et la facturation des prestataires du labo, les demandes de préparation de TP, le programme des TP tiré des scénarios pédagogiques, l'inventaire, les commandes, le rangement et les incidents.

En production, l'application est servie par Google Apps Script et réservée aux comptes Google de l'école. La page publiée sur GitHub n'est qu'une **démonstration** : données fictives stockées dans le navigateur, un bouton par compte fictif.

Ce dépôt est public. Il ne contient **que du code** : aucune donnée de l'école (scénarios, inventaire, fournisseurs, comptes) n'y est versée. Les données vivent dans un classeur Google Sheets privé, lu par un script Google Apps Script qui contrôle chaque accès.

## Qui fait quoi

| Rôle | Ce qu'il voit et fait |
|---|---|
| Technicienne de laboratoire | Déclare sa présence (arrivée, départ, missions), prend en charge et prépare les TP, gère l'inventaire, propose des commandes, réceptionne les livraisons, contrôle le rangement, traite les incidents. Voit ses propres heures, sans montant. |
| Aide-laborantine | Mêmes droits que la technicienne. |
| Enseignant·e BIOMED ou BIOALC | Dépose ses demandes de TP et échange avec la préparatrice, consulte le programme de sa filière et le stock, déclare ce qu'il consomme, propose des commandes, signale un problème. Ne voit que ses propres demandes. |
| Prof référent | Tableau de bord, **approbation des commandes**, validation des présences, activité des techniciennes (heures, missions, TP préparés) **sans aucune donnée financière**, attribution des TP. Ne peut pas approuver sa propre commande : elle part au directeur. |
| Coordination pédagogique et administrative | Tableau de bord, activité des techniciennes sans montant, pilotage des demandes de TP, programme, inventaire, incidents. N'approuve pas les commandes et ne valide pas les présences. |
| Directeur du campus | Tout, plus **la facturation** : taux horaires, montants HT, relevés de prestations à joindre aux factures. Seul rôle à recevoir ces données du serveur. |

Le filtrage se fait côté serveur (`core.js`) : une donnée que le rôle n'a pas le droit de voir ne quitte jamais le classeur, même en inspectant le navigateur.

## Commandes et classeur Pilotage dépenses

- Toute demande d'achat porte une justification pédagogique (TP, séquence, bloc) et part au prof référent.
- Le formulaire rappelle toujours la règle d'achat. Au-delà de `seuilTroisDevisTTC` (1 000 € TTC par défaut, réglable dans `core.js`), trois devis de fournisseurs différents sont exigés, sinon le serveur refuse la demande.
- **Dès sa soumission**, la demande est écrite dans le classeur « Pilotage dépenses », onglet de la filière (BIOMED ou BIOALC), mêmes colonnes, identifiant de la forme `BIOMED-2026-009`, statut « Soumis ». Les colonnes calculées par formule ne sont pas touchées.
- La suite met à jour la même ligne : « Validé » ou « Refusé » (avec nom, date et motif dans « Validé par / date »), puis « Commandé » et « Livré ». Une demande annulée par son auteur passe à « Refusé » avec la mention « Annulée par le demandeur ».
- La réception ajoute la quantité reçue au stock.

## TP incontournables et programme

`referentiel.js` contient le catalogue des TP incontournables établi par la direction : 21 TP en BIOMED (microbiologie REMIC / CA-SFM, hématologie et hémostase, immunologie, biochimie, biologie moléculaire, ACP et gamètes, prélèvements simulés), 16 en BIOALC (microbiologie, biochimie analytique et physico-chimie, biologie moléculaire, biologie cellulaire, métrologie). Chaque TP porte ses codes (SF, T, C), un matériel type et des mots-clés.

`outils/preparer_import.py` extrait des scénarios pédagogiques les séquences avec manipulation au labo. L'onglet **Programme** propose deux vues :

- **Séquences à venir** : chaque séquence avec son TP de référence et son matériel, rapproché de l'inventaire.
- **TP incontournables** : pour chaque TP du catalogue, les séquences du SPG qui le couvrent, la prochaine date, les demandes déjà faites, le matériel type avec l'état du stock. Un TP « non repéré dans le SPG » signale un manque possible du scénario.

« Préparer ce TP » préremplit la demande de l'enseignant (TP de référence, titre, matériel, bloc, classe). Sur chaque demande, la technicienne peut « Vérifier le stock pour ce TP » et proposer une commande pour ce qui manque.

## Sécurité

L'application est servie par Google Apps Script, déployée avec l'accès **« Utilisateurs de aurlom.com »**.

- **Aucun accès hors école** : Google exige la connexion avec un compte de l'école avant d'afficher quoi que ce soit. Un robot ou une personne extérieure ne reçoit ni la page ni une donnée.
- **Double vérification** : le script contrôle à nouveau le domaine de l'adresse, puis sa présence dans la feuille Utilisateurs. Un compte de l'école non inscrit est refusé et l'essai est journalisé.
- **Données privées** : le script lit le classeur en ton nom (« Exécuter en tant que : moi »). Personne d'autre n'a besoin d'un accès au classeur, qui reste partagé avec toi seul.
- **Droits côté serveur** : chaque rôle ne reçoit que ses données (aucun montant hors directeur, un enseignant ne voit que ses demandes).
- **Anti-aspiration** : 120 requêtes par minute et par compte au plus.
- **Intégrité** : cellules en texte brut, saisies commençant par `=`, `+`, `-` ou `@` neutralisées, exports CSV protégés, tout contenu affiché échappé, page non intégrable dans un autre site.
- **Traçabilité** : chaque action, et chaque accès refusé, est écrit dans la feuille Journal.
- **Pas de secret dans le dépôt** : l'identifiant du classeur Pilotage est une propriété du script, pas une ligne de code.

L'ancien accès par code PIN depuis une page hébergée hors Google reste dans le code mais est **fermé** : il ne s'ouvre que si la propriété `MODE_PIN` vaut `oui`.

À ta charge, dans la console d'administration Google Workspace : imposer la validation en deux étapes aux comptes de l'école. Pour les prestataires sans compte @aurlom.com, il faut leur en créer un.

## Le statut de freelance

L'outil sert à attester le service fait. Il ne doit pas devenir un contrôle d'horaires imposés : la Cour de cassation définit le lien de subordination par le pouvoir de donner des ordres, d'en contrôler l'exécution et de sanctionner (Cass. soc., 13 novembre 1996, n° 94-13.187), et a requalifié en salariat un indépendant suivi par géolocalisation et sanctionné (Cass. soc., 28 novembre 2018, n° 17-20.079). La prestataire déclare, l'école valide. Fais relire le dispositif par votre juriste ou l'expert-comptable.

## Mise en service

1. **Classeur.** Crée un Google Sheets vide, par exemple « Suivi labo 2026-2027 », avec ton compte @aurlom.com. Ne le partage avec personne.
2. **Script.** Extensions > Apps Script. Trois fichiers :
   - `Code.gs` : contenu de `apps-script/Code.gs` ;
   - `Core.gs` : contenu de `core.js` ;
   - `Page.html` (Fichier > Nouveau > HTML) : contenu de `apps-script/Page.html`.
   Paramètres du projet : fuseau `Europe/Paris`.
3. **Propriétés du script** (Paramètres du projet > Propriétés du script) :
   - `PILOTAGE_ID` : identifiant du classeur Pilotage dépenses (la partie entre `/d/` et `/edit` de son adresse) ;
   - `DOMAINE` : `aurlom.com` (valeur par défaut si absente).
4. **Installation.** Exécute la fonction `installer` et accepte les autorisations. Les feuilles sont créées, avec un compte `DIR` à ton adresse.
5. **Données de départ.** En local, avec Python et `openpyxl` :
   ```
   python3 outils/preparer_import.py --biomed BIOMED_SPG.xlsx --bioalc BIOALC_SPG.xlsx \
     --inventaire INVENTAIRE.xlsx --commandes COMMANDES_LABO.xlsx --sortie import
   ```
   Pour chaque CSV, ouvre la feuille du même nom puis Fichier > Importer > « Remplacer la feuille actuelle ». Ne mets pas ces CSV dans le dépôt.
6. **Comptes.** Importe `Utilisateurs.csv` (préparé hors du dépôt) dans la feuille `Utilisateurs`, ou saisis une ligne par personne : `id` court et unique, `nom`, `email` (adresse @aurlom.com), `role` (`technicienne`, `aide_laborantine`, `enseignant`, `prof_referent`, `coordinateur`, `directeur`), `filiere` (`BIOMED` ou `BIOALC` pour les enseignants), `disciplines`, `taux_horaire` pour les prestataires, `actif` = `oui`. Les colonnes `pin` et `pin_hash` restent vides.
7. **Déploiement.** Déployer > Nouveau déploiement > Application Web. Exécuter en tant que : **moi**. Accès : **utilisateurs de aurlom.com**. Copie l'adresse `/exec` : c'est le lien de l'application.
8. **Diffusion.** Envoie ce lien aux personnes inscrites. Elles se connectent avec leur compte Google de l'école.

Après une modification du code : `python3 outils/construire_page.py` régénère `Page.html`, recopie les fichiers modifiés dans Apps Script, puis Déployer > Gérer les déploiements > Modifier > Nouvelle version (l'adresse ne change pas).

La page GitHub (`labo/index.html`) ne sert que de démonstration avec des données fictives.

## Réglages

Dans l'objet `CONFIG` de `core.js` : labos, créneaux, classes, disciplines et blocs par filière, missions, points de rangement, catégories, seuil des trois devis, délai de préparation (15 jours), alerte de péremption (30 jours), durée de session, nombre d'essais. Propriétés du script : `PILOTAGE_ID`, `DOMAINE`, `MODE_PIN`. Dans `Code.gs` : `ENVOYER_MAILS`. Catalogue des TP : `referentiel.js`.

## Limites connues

- La sécurité repose sur les comptes Google de l'école : un compte compromis donne accès aux données de son rôle. D'où la validation en deux étapes à imposer.
- Hors connexion, seuls l'arrivée et le départ sont gardés sur le téléphone (page déjà ouverte), avec leur heure, puis envoyés au retour du réseau et signalés à la validation.
- Le rapprochement programme / inventaire repose sur des mots communs : un article nommé différemment n'est pas reconnu.
- Volume prévu : quelques milliers de lignes par an. Archiver le classeur à chaque rentrée.

## Fichiers

- `index.html`, `style.css`, `app.js` : interface (charte interne Aurlom BTS+).
- `core.js` : règles métier et droits, communs au navigateur et à Apps Script.
- `demo.js` : hôte navigateur et données fictives du mode démonstration.
- `referentiel.js` : catalogue des TP incontournables par filière.
- `apps-script/Code.gs` : serveur Google Apps Script.
- `apps-script/Page.html` : page servie par Apps Script, générée par `outils/construire_page.py`.
- `outils/preparer_import.py` : préparation des CSV d'import à partir des fichiers Excel de l'école.
