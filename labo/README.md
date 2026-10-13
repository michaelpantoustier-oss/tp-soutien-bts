# Suivi labo TP

Application web pour les deux techniciennes de laboratoire en freelance, les enseignants de TP et la responsable des labos, pour les BTS Bioanalyses en laboratoire de contrôle (RNCP38884) et Biologie médicale (RNCP40027). Elle remplace les quatre classeurs Excel utilisés jusqu'en 2025-2026.

Démo en ligne une fois la branche publiée sur GitHub Pages : `…/labo/`. Sans configuration, la page tourne en **mode démonstration** avec des données fictives stockées dans le navigateur (PIN : techniciennes 1111 et 2222, enseignants 3333 et 4444, responsable 0000).

## Ce que l'application remplace

| Ancien fichier | Constat sur le fichier 2025-2026 | Dans l'application |
|---|---|---|
| Tableau de suivi des TP (onglet Hebdomadaire) | 199 TP saisis, dont 162 sans préparateur renseigné et 56 sans validation du besoin matériel. Aucun échange tracé entre enseignant et préparateur. | Onglet **Demandes de TP** : l'enseignant dépose sa demande, une technicienne la prend en charge, le fil d'échange est daté. Les demandes arrivées à moins de 15 jours sont signalées. |
| Feuille d'émargement rangement | Aucune date ni nom par ligne, seulement des initiales. Les problèmes relevés ne remontent nulle part. | Onglet **Rangement** : contrôle par labo, horodaté, au nom de la technicienne. Chaque point non conforme ouvre un incident. |
| Inventaire biochimie / immuno | La règle « délai de 15 jours pour préparer le TP » y figure. Au 13/10/2026, l'Exatrol-P est à 0 et l'acide urique (réf. 80351) est périmé depuis le 01/10/2026. | Le délai de 15 jours alimente les alertes. Les ruptures et péremptions passent par **Signaler** (catégories « Stock bas ou rupture » et « Réactif périmé »). L'inventaire lui-même n'est pas repris dans cette version. |
| Commandes labo | Suivi des commandes fournisseurs. | Non repris : les besoins de commande remontent comme incidents « Stock bas ». |
| (rien) | Les heures des prestataires n'étaient tracées nulle part. | Onglets **Présence**, **Mes heures** et **Heures et facturation** : déclaration d'arrivée et de départ, validation par la responsable, relevé mensuel imprimable et export CSV. |

Chiffres calculés le 13/10/2026 sur `Tableau_de_suivi_des_TP_-_BTS_ABM_BM_BIOALC_-_2025_2026.xlsx` et `INVENTAIRE_BIOCHIMIE_IMMUNO.xlsx`.

## Qui voit quoi

- **Technicienne** : déclare son arrivée et son départ (heure du serveur Google, pas du téléphone), coche les missions faites et les TP concernés, prend en charge les demandes, enregistre les contrôles de rangement, signale et suit les incidents, consulte son relevé mensuel.
- **Enseignant·e** : dépose ses demandes de préparation (date, créneau, labo, classe, bloc de compétences, besoin matériel), échange avec la technicienne, marque le TP réalisé ou annulé, signale un problème.
- **Responsable** : tableau de bord (présentes, présences à valider, incidents, TP sans préparatrice), validation ou contestation de chaque présence, relevé mensuel par prestataire avec montant HT, attribution des demandes.

Traçabilité : chaque écriture est copiée dans la feuille `Journal` (qui, quoi, quand). Une présence n'est jamais modifiée sans trace : un départ oublié, un badge hors connexion ou une saisie après coup sont marqués comme tels et passent en validation.

## Un point d'attention : le statut de freelance

L'outil sert à **attester le service fait** pour la facturation. Il ne doit pas devenir un outil de contrôle d'horaires imposés. La Cour de cassation définit le lien de subordination par le pouvoir de donner des ordres, d'en contrôler l'exécution et de sanctionner les manquements (Cass. soc., 13 novembre 1996, n° 94-13.187). En 2018, elle a requalifié en salariat la relation d'un coursier indépendant suivi par géolocalisation et soumis à des sanctions (Cass. soc., 28 novembre 2018, n° 17-20.079, Take Eat Easy). La présomption de non-salariat des indépendants immatriculés (article L8221-6 du Code du travail) tombe quand ce lien est établi.

Concrètement, l'application est construite pour que la prestataire **déclare** ses présences et ses missions, et que l'école **valide** la prestation. Évite d'y ajouter des retards sanctionnés, des horaires fixés unilatéralement ou des consignes détaillées sur la façon de travailler. Les demandes de TP décrivent un résultat attendu (une paillasse prête pour tel TP), pas une méthode. Fais relire le dispositif par votre juriste ou l'expert-comptable avant le lancement.

## Mise en service (30 minutes environ)

1. **Classeur.** Crée un Google Sheets vide nommé par exemple « Suivi labo 2026-2027 », dans un Drive de l'école.
2. **Apps Script.** Dans le classeur : Extensions > Apps Script.
   - Renomme `Code.gs` existant et colle le contenu de `labo/apps-script/Code.gs`.
   - Ajoute un fichier `Core.gs` et colle le contenu intégral de `labo/core.js`.
   - Paramètres du projet (roue dentée) : fuseau horaire `Europe/Paris`.
3. **Installation.** Dans l'éditeur, choisis la fonction `installer` et clique sur Exécuter. Accepte les autorisations (Sheets, e-mail). Les feuilles `Utilisateurs`, `Sessions`, `Rangements`, `Incidents`, `Demandes`, `Messages` et `Journal` sont créées, avec un compte `RESP1` (PIN `000000`).
4. **Comptes.** Dans la feuille `Utilisateurs`, une ligne par personne :
   - `id` : court et unique (T1, T2, P1…) ;
   - `role` : `technicienne`, `enseignant` ou `responsable` ;
   - `pin` : 4 à 6 chiffres, différent pour chacun. Mets la colonne au format Texte (Format > Nombre > Texte brut) avant de saisir, sinon un PIN commençant par 0 perd ce zéro ;
   - `email` : pour recevoir les alertes et les messages ;
   - `taux_horaire` : taux HT de la prestataire, tel que dans son devis ou contrat de prestation ;
   - `actif` : `oui` (mettre `non` pour désactiver un compte sans perdre son historique).
   Change le PIN de `RESP1`.
5. **Déploiement.** Déployer > Nouveau déploiement > type Application Web. Exécuter en tant que : moi. Accès : tout le monde. Copie l'URL qui se termine par `/exec`.
6. **Brancher la page.** Dans `labo/app.js`, colle cette URL dans `var API_URL = '';`, puis commite. Le bandeau « Démonstration » disparaît.
7. **Diffusion.** Envoie le lien `…/labo/` aux techniciennes et aux enseignants avec leur PIN. Sur téléphone, « Ajouter à l'écran d'accueil » donne un raccourci.

Après une modification de `core.js` ou `Code.gs` : recopie le fichier dans Apps Script, puis Déployer > Gérer les déploiements > modifier > Nouvelle version. L'URL ne change pas.

Pour couper les e-mails : `var ENVOYER_MAILS = false;` dans `Code.gs`.

## Ajuster les listes

Les labos, créneaux, classes, disciplines, missions, points de rangement, catégories d'incident et le délai de 15 jours sont dans l'objet `CONFIG` en tête de `core.js`. Les intitulés des blocs BTS BioAC viennent de la fiche France Compétences RNCP38884. Pour le BTS BM, seuls BC1 et BC2 sont saisis (arrêté du 27 novembre 2024) : ajoute les autres blocs si des TP s'y rattachent.

## Facturation, mois par mois

1. Chaque soir ou chaque semaine, la responsable valide les présences (Tableau de bord). Une présence contestée porte son motif, visible par la prestataire.
2. En fin de mois, onglet Heures et facturation : choisir la prestataire et le mois, puis « Imprimer le relevé » (PDF avec zones de signature) ou « Exporter en CSV ».
3. La prestataire joint le relevé à sa facture. Les heures facturées doivent correspondre au total validé.

## Limites connues

- Authentification par PIN : suffisant pour un usage interne, pas pour des données sensibles. Les PIN sont lisibles par qui a accès au classeur.
- Hors connexion, seuls l'arrivée et le départ sont mis en file d'attente sur le téléphone (avec l'heure du téléphone, signalée « hors connexion »).
- Les données d'un mode démonstration restent dans le navigateur et ne rejoignent jamais le classeur.
- Volume prévu : quelques milliers de lignes par an. Au-delà, archiver le classeur à chaque rentrée.

## Fichiers

- `index.html`, `style.css`, `app.js` : l'interface (charte interne Aurlom BTS+).
- `core.js` : les règles métier, communes au navigateur et à Apps Script.
- `demo.js` : stockage navigateur et données fictives du mode démonstration.
- `apps-script/Code.gs` : le serveur Google Apps Script.
