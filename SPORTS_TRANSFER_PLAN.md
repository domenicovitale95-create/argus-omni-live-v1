# ARGUS SPORTS — dossier de transfert indépendant (préparation)

Statut : PRÉPARATION UNIQUEMENT. Aucun transfert de données ni basculement de production n'a été effectué.

## Objectif
Remettre au repreneur une copie fonctionnellement identique d'ARGUS SPORTS, avec historique des prédictions, résultats, paris virtuels, données d'entraînement et calibrations, mais sans dépendance durable au GitHub, Vercel, stockage ou API du propriétaire actuel.

## Source gelée
La branche `argus-sports-isolation` a été créée depuis `main` du dépôt `domenicovitale95-create/argus-omni-live-v1`. Elle est un point de départ, PAS une application isolée. Ne pas lui donner accès au stockage de production et ne pas la déployer avec les cron jobs d'origine.

## Constats vérifiés dans le code
- `api/_prediction-ledger-store.js` lit le registre canonique dans le stockage Blob sous `argus/ledger/`.
- `api/training-memory.js` lit les rapports sous `argus/reports/` et les données shadow sous `argus/shadow/`.
- `vercel.json` configure des cron jobs sportifs ET immobiliers : ne jamais le réutiliser tel quel pour le transfert.
- `scripts/vercel-ignore-build.cjs` ignore les builds Vercel sur les branches autres que `main`.
- La production actuelle dispose notamment de `API_FOOTBALL_KEY`, `BLOB_STORE_ID` et `CRON_SECRET`. Ne jamais exporter les valeurs des secrets dans le dépôt ou les transmettre au repreneur.

## Inventaire de sauvegarde à compléter
1. Énumérer tous les chemins et collections Blob sportifs, au-delà des trois préfixes vérifiés ci-dessus.
2. Exporter une copie cohérente à un instant T des blobs et éventuels autres stockages (base de données, KV, fichiers, autres services).
3. Enregistrer un manifeste : chemin, taille, hash SHA-256, date de capture et nombre d'enregistrements.
4. Valider l'exhaustivité des prédictions, settlements, historique, calibrations, bankroll virtuelle, training, shadow et caches nécessaires.
5. Examiner les licences des données sportives avant remise à un tiers.
6. Conserver les sauvegardes hors du dépôt GitHub public et sans secrets.

## Isolement requis
- Dépôt GitHub distinct appartenant au repreneur ; aucun droit sur le dépôt source.
- Projet Vercel distinct appartenant au repreneur ; aucun accès au projet d'origine.
- Nouveau stockage et nouvelles variables d'environnement ; ne pas partager les jetons, identifiants ou secrets.
- Nouvel abonnement/API football du repreneur.
- Retirer les routes, fichiers, imports, tests, cron jobs et ressources propres à IMMO et CAPITAL sans casser les dépendances sportives.
- Neutraliser TOUS les cron jobs en environnement de test ; les réactiver seulement après validation des données et de l'absence de double écriture.

## Critères d'acceptation avant arrêt de l'ancienne version
- Déploiement indépendant opérationnel sur le compte du repreneur.
- Aucune variable, connexion, webhook, domaine, cron ou stockage ne dépend du compte source.
- Parité des comptes d'enregistrements, des hashes de sauvegarde et des métriques de prédiction et entraînement.
- Tests de lecture, d'écriture, de prédiction, de settlement et de recalibration réussis.
- Aucun appel non autorisé aux services d'origine.
- Accord explicite du propriétaire pour désactiver l'ancienne version sportive ; ARGUS IMMO et CAPITAL restent actifs.

## Interdictions pendant la préparation
Ne pas modifier `main`, ne pas effacer de données, ne pas déplacer de domaine, ne pas activer de cron sur une copie, ne pas révoquer de clé API existante, ne pas arrêter ARGUS SPORTS avant validation.
