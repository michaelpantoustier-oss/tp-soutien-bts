# Suivi labo TP

Application web des laboratoires de TP du campus pour le BTS Biologie médicale (BIOMED, RNCP40027) et le BTS Bioanalyses en laboratoire de contrôle (BIOALC, RNCP38884). Elle couvre la présence et la facturation des prestataires du labo, les demandes de préparation de TP, le programme des TP tiré des scénarios pédagogiques, l'inventaire, les commandes, le rangement et les incidents.

Sans configuration, la page tourne en **mode démonstration** : données fictives stockées dans le navigateur, un bouton par compte fictif sur l'écran de connexion.

Ce dépôt est public. Il ne contient **que du code** : aucune donnée de l'école (scénarios, inventaire, fournisseurs, comptes) n'y est versée. Les données vivent dans un classeur Google Sheets privé, lu par un script Google Apps Script qui contrôle chaque accès.

## Qui fait quoi

| Rôle | Ce qu'il voit et fait |
|---|---|
| Technicienne de laboratoire | Déclare sa présence (arrivée, départ, missions), prend en charge et prépare les TP, gère l'inventaire, propose des commandes, réceptionne les livraisons, contrôle le rangement, traite les incidents. Voit ses propres heures, sans montant. |
| Aide-laborantine | Mêmes droits que la technicienne. |
| Enseignant·e BIOMED ou BIOALC | Dépose ses demandes de TP et échange avec la préparatrice, consulte le programme de sa filière et le stock, déclare ce qu'il consomme, propose des commandes, signale un problème. Ne voit que ses propres demandes. |
| Prof référent | Tableau de bord, **approbation des commandes**, validation des présences, activité des techniciennes (heures, missions, TP préparés) **sans aucune donnée financière**, attribution des TP. Ne peut pas approuver sa propre commande : elle part au directeur. |
| Coordinateur pédagogique | Tableau de bord, activité des techniciennes sans montant, pilotage des demandes de TP, programme, inventaire, incidents. N'approuve pas les commandes et ne valide pas les présences. |
| Directeur du campus | Tout, plus **la facturation** : taux horaires, montants HT, relevés de prestations à joindre aux factures. Seul rôle à recevoir ces données du serveur. |

Le filtrage se fait côté serveur (`core.js`) : une donnée que le rôle n'a pas le droit de voir ne quitte jamais le classeur, même en inspectant le navigateur.

## Commandes : la règle des trois devis

- Toute demande d'achat porte une justification pédagogique (TP, séquence, bloc) et part au prof référent.
- Le formulaire rappelle toujours la règle d'achat. Au-delà de `seuilTroisDevisTTC` (1 000 € TTC par défaut, réglable dans `core.js`), trois devis de fournisseurs différents sont exigés, sinon la demande est refusée par le serveur.
- Une commande approuvée est recopiée dans le classeur « Pilotage dépenses » existant, onglet de la filière, avec un identifiant de la forme `BIOMED-2026-008`, le statut « Validé » et le nom de l'approbateur. Les colonnes calculées par formule ne sont pas touchées.
- « Commandée » puis « Livrée » mettent à jour le statut dans le Pilotage. La réception ajoute la quantité reçue au stock.

## Programme et recommandations

`outils/preparer_import.py` lit les deux scénarios pédagogiques et garde les séquences avec manipulation au labo (dates, tronc commun, renforcement du mercredi). Il repère le matériel cité dans chaque séquence à partir d'un dictionnaire d'environ 70 termes. L'onglet **Programme** rapproche ce matériel de l'inventaire :

- en stock, stock bas, péremption proche ou absent de l'inventaire ;
- « Préparer la demande de TP » préremplit la demande de l'enseignant à partir de la séquence ;
- « Proposer une commande » préremplit l'achat avec la justification de la séquence, et propose les fournisseurs déjà utilisés par l'école pour cette catégorie (feuille Fournisseurs, tirée de l'historique des commandes).

Le rapprochement se fait sur les mots de la désignation : c'est une aide à l'anticipation, pas une liste d'achat automatique.

## Sécurité

- **Connexion** par e-mail et code PIN de 6 chiffres minimum. Le PIN est remplacé dans le classeur par une empreinte SHA-256 salée dès sa saisie (le PIN en clair n'est jamais conservé).
- **Session** par jeton aléatoire de 7 jours, stocké haché côté serveur, révocable (« Se déconnecter », ou menu « Déconnecter tout le monde » dans le classeur).
- **Forçage bloqué** : 5 PIN erronés bloquent le compte 15 minutes ; messages identiques que l'e-mail existe ou non.
- **Aspiration bloquée** : aucune donnée sans jeton valide, aucune réponse en GET, limite de 120 requêtes par minute et par session, 30 tentatives de connexion par minute au total.
- **Page** : `noindex`, politique de sécurité du contenu stricte (aucun script tiers, connexions limitées à Google Apps Script), aucune donnée dans les fichiers publiés, échappement de tout contenu affiché.
- **Classeur** : cellules en texte brut, saisies commençant par `=`, `+`, `-` ou `@` neutralisées (pas d'injection de formule), exports CSV protégés de même.
- **Traçabilité** : chaque action et chaque connexion, réussie ou refusée, est écrite dans la feuille Journal.

À ta charge : garder le classeur de suivi et le classeur Pilotage **non partagés par lien**, et ne les partager qu'avec les comptes Google qui doivent les ouvrir.

## Le statut de freelance

L'outil sert à attester le service fait. Il ne doit pas devenir un contrôle d'horaires imposés : la Cour de cassation définit le lien de subordination par le pouvoir de donner des ordres, d'en contrôler l'exécution et de sanctionner (Cass. soc., 13 novembre 1996, n° 94-13.187), et a requalifié en salariat un indépendant suivi par géolocalisation et sanctionné (Cass. soc., 28 novembre 2018, n° 17-20.079). La prestataire déclare, l'école valide. Fais relire le dispositif par votre juriste ou l'expert-comptable.

## Mise en service

1. **Classeur.** Crée un Google Sheets vide, par exemple « Suivi labo 2026-2027 ». Ne le partage pas par lien.
2. **Script.** Extensions > Apps Script. Colle `apps-script/Code.gs` dans `Code.gs`, crée `Core.gs` et colles-y `core.js`. Paramètres du projet : fuseau `Europe/Paris`.
3. **Pilotage dépenses.** Dans `Code.gs`, renseigne `PILOTAGE_ID` avec l'identifiant du classeur Pilotage (la partie entre `/d/` et `/edit` de son adresse). Le compte qui déploie le script doit pouvoir modifier ce classeur.
4. **Installation.** Exécute la fonction `installer` et accepte les autorisations. Les feuilles sont créées, avec un compte `DIR` à ton adresse.
5. **Données de départ.** En local, avec Python et `openpyxl` :
   ```
   python3 outils/preparer_import.py --biomed BIOMED_SPG.xlsx --bioalc BIOALC_SPG.xlsx \
     --inventaire INVENTAIRE.xlsx --commandes COMMANDES_LABO.xlsx --sortie import
   ```
   Pour chaque CSV produit, ouvre la feuille du même nom puis Fichier > Importer > Importer > « Remplacer la feuille actuelle ». Ne mets pas ces CSV dans le dépôt.
6. **Comptes.** Feuille `Utilisateurs`, une ligne par personne : `id` court et unique, `nom`, `email`, `role` (`technicienne`, `aide_laborantine`, `enseignant`, `prof_referent`, `coordinateur`, `directeur`), `filiere` (`BIOMED` ou `BIOALC` pour les enseignants), `disciplines`, `taux_horaire` pour les prestataires, `actif` = `oui`. Tape le PIN (6 chiffres) dans la colonne `pin` : il est remplacé par son empreinte. Si ce n'est pas le cas, menu Suivi labo > « Sécuriser les codes PIN saisis ». Donne ton propre PIN à la ligne `DIR`.
7. **Déploiement.** Déployer > Nouveau déploiement > Application Web. Exécuter en tant que : moi. Accès : tout le monde. Copie l'adresse `/exec`.
8. **Brancher la page.** Colle cette adresse dans `var API_URL = '';` en tête de `app.js`, commite. Le mode démonstration disparaît.
9. **Diffusion.** Envoie le lien de la page et, séparément, à chacun son PIN.

Après une modification de `core.js` ou `Code.gs` : recopie dans Apps Script, puis Déployer > Gérer les déploiements > Modifier > Nouvelle version (l'adresse ne change pas).

## Réglages

Dans l'objet `CONFIG` de `core.js` : labos, créneaux, classes, disciplines et blocs par filière, missions, points de rangement, catégories, seuil des trois devis, délai de préparation (15 jours), alerte de péremption (30 jours), durée de session, nombre d'essais. Dans `Code.gs` : `PILOTAGE_ID`, `ENVOYER_MAILS`.

## Limites connues

- Le PIN est un secret partagé faible face à quelqu'un qui le voit taper : il protège contre les robots et les curieux, pas contre un collègue malveillant à côté.
- Hors connexion, seuls l'arrivée et le départ sont gardés sur le téléphone puis envoyés.
- Le rapprochement programme / inventaire repose sur des mots communs : un article nommé différemment n'est pas reconnu.
- Volume prévu : quelques milliers de lignes par an. Archiver le classeur à chaque rentrée.

## Fichiers

- `index.html`, `style.css`, `app.js` : interface (charte interne Aurlom BTS+).
- `core.js` : règles métier et droits, communs au navigateur et à Apps Script.
- `demo.js` : hôte navigateur et données fictives du mode démonstration.
- `apps-script/Code.gs` : serveur Google Apps Script.
- `outils/preparer_import.py` : préparation des CSV d'import à partir des fichiers Excel de l'école.
