# ARGUS SPORTS — protocole de remise sans accès à ARGUS IMMO

**RÈGLE ABSOLUE : NE JAMAIS INVITER LE REPRENEUR SUR CE DÉPÔT, Y COMPRIS SUR UNE BRANCHE.**

Le dépôt source contient des éléments ARGUS IMMO et CAPITAL. Les branches Git ne constituent pas une frontière de confidentialité : les commits et historiques restent accessibles à toute personne ayant accès au dépôt.

## Distribution sécurisée requise
1. Construire un **nouveau dépôt sans historique Git hérité**, à partir d'une liste blanche des seuls fichiers sportifs. Ne pas utiliser un fork ou un miroir du dépôt ARGUS OMNI.
2. Exclure tous les chemins `immo*`, `api/immo-*`, `api/bridge-*`, `data/immo-*`, `data/strategic-*`, `strategic-*`, `lib/strategic-*`, `src/immo-*`, `capital*`, `api/capital-*`, `luce*`, les workflows immobiliers/capital et tous les fichiers de données privées. Les exclusions seules ne suffisent PAS : utiliser une liste blanche.
3. Analyser les imports JavaScript, routes HTML, scripts de build, service worker, manifest, redirections, références de domaines, URL de stockage et variables d'environnement ; retirer toute référence IMMO/CAPITAL. Tester que les dépendances sportives restent résolues.
4. Reconstruire `vercel.json` depuis zéro : n'inclure QUE les routes sportives ; désactiver tous les cron jobs lors du premier déploiement.
5. Ne transmettre aucune variable ou valeur secrète issue de Vercel. Fournir uniquement un fichier `.env.example` sans valeur réelle.
6. Ne pas inclure de jetons, de credentials, de données personnelles, de fichiers immobiliers, de données financières ou d'historique Git source.
7. Exporter les données sportives depuis leur stockage de production vers une archive distincte, après vérification des licences. Inventorier tous les préfixes sportifs et autres systèmes de stockage, pas seulement `argus/ledger/`, `argus/reports/` et `argus/shadow/`.
8. Fournir un manifeste de l'archive avec hashes SHA-256 et nombres d'enregistrements. Ne pas envoyer de lien public non protégé vers l'archive.
9. Restaurer sur un stockage entièrement nouveau appartenant au repreneur ; reconfigurer les clés API sportives à son nom.
10. Vérifier les historiques, la prédiction, le settlement, l'entraînement et les tâches automatiques ; activer les cron jobs seulement après validation et prévention des doublons.

## Contrôles de non-divulgation avant remise
- Aucune occurrence de `immo`, `bridge`, `capital`, `strategic-brussels`, `argus-omni-live`, URL privée ou nom de stockage source dans le package (examiner les faux positifs).
- Aucun fichier immobilier ou financier, même caché dans des assets, des fichiers JSON ou des anciens commits.
- Aucun historique Git, sous-module ou lien de provenance donnant accès au dépôt source.
- Aucun secret, jeton, mot de passe, identifiant d'accès ou lien de partage permanent.
- Aucun appel réseau du package vers les endpoints, domaines, Blob stores ou API du propriétaire initial.
- Les fonctionnalités sportives restent testées et identiques avant la remise.

## Statut réel
Ce document est un protocole, **pas** une archive exportée ni une preuve de séparation. Aucun compte du repreneur n'est connecté. Les données Blob de production ne sont pas encore sauvegardées ni restaurées. Ne pas déclarer le transfert achevé avant validation.
