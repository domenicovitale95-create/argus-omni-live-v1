# BRIDGE — migration à parité fonctionnelle

Projet Vercel dédié : `bridge` (`prj_e8BWAQOzjbo0DaDuC95YOJR5Esy7`), créé initialement sous `argus-immo` puis renommé. Aucun déploiement ni stockage n'est encore connecté.

## Règles
- BRIDGE est un produit **privé et autonome**, réservé au propriétaire. Le repreneur ARGUS SPORTS n'a aucun accès GitHub, Vercel, API ou Blob à BRIDGE.
- Ne jamais supprimer les routes IMMO du projet ARGUS OMNI avant validation fonctionnelle, sauvegarde et approbation.
- Ne jamais utiliser une branche du dépôt OMNI comme dépôt partagé avec un tiers. Créer un nouveau dépôt BRIDGE privé sans historique Git hérité.

## Parité fonctionnelle à vérifier
- `/immo-opportunities` : propositions, classement, prix, surfaces, unités reconnues, déduplication et rafraîchissement
- `/immo-maps` : marqueurs, agences, liens et filtres géographiques
- Fiches immobilières et analyses BRIDGE : offre, €/m², revente par lot, marges et alertes RU/PEB
- Sources Immoweb, Immovlan, Agimo et agences ; reconnaissance des immeubles cachés dans les annonces de maisons
- Documents, urbanisme, PEB, plans, baux, conformité, historique de contact et visites
- Contacts et recherches privées ; contrôle d'accès et sécurité
- Autres routes immobilières existantes : recenser et vérifier leur comportement avant toute exclusion

## Isolation du code
- Extraire uniquement les routes `immo*`, `immobilier*`, `strategic-brussels*`, API `immo-*`, `bridge-*` et leurs dépendances réelles.
- Ne pas emporter les pages, API, modèles, tests ou cron jobs sportifs, ni le module CAPITAL.
- Recréer les configurations `package.json`, `vercel.json`, middleware et scripts sans dépendances inutiles.
- Refaire les imports, liens, ressources et service worker puis tester chaque route.

## Isolation des données
- Inventorier les préfixes Vercel Blob et autres stockages ; sélectionner uniquement les données immobilières.
- Copier vers un **nouveau Blob store privé** lié exclusivement à BRIDGE. Ne pas réutiliser le `BLOB_STORE_ID` du projet OMNI.
- Produire un manifeste de sauvegarde avec SHA-256, dates, nombre d'objets et vérification de restauration.
- Générer des secrets indépendants ; ne pas copier les mots de passe ou jetons actuels en clair.
- Lancer les tâches planifiées immobilières uniquement après migration et vérification d'absence de double écriture.

## Conditions de basculement
- Les pages BRIDGE et cartes se chargent correctement, avec mêmes biens et mêmes filtres.
- Les analyses et historiques sont cohérents ; les données privées sont protégées.
- Les refresh catalogues et intégrations sont testés.
- Aucun accès BRIDGE n'est possible depuis le dépôt ou les ressources du repreneur SPORTS.
- Après approbation, supprimer les routes IMMO de la nouvelle distribution SPORTS et retirer progressivement les routes IMMO d'OMNI, en gardant une sauvegarde réversible.

**Statut** : nom Vercel BRIDGE confirmé ; migration non réalisée. Ce document n'est pas une attestation de parité.
