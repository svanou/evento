# Evento

Newsletter gratuite de sorties locales, financée par un encart partenaire clairement identifié. Une édition commune par zone et par week-end, jusqu’à cinq sorties. Première zone : **Pays de Gex**. Les zones, sources et éditions se gèrent dans `/admin`.

**Aucun événement de démonstration n’est chargé par l’application.** Sans recherche configurée, la préparation échoue avec une erreur visible. Une recherche sans résultat fiable produit une édition vide, impossible à approuver et relançable après correction des sources. Les données artificielles existent uniquement dans les tests isolés.

## Lancer en local

Node.js **24** et npm sont requis.

```bash
npm ci
npm run db:init
npm run dev
```

Ouvrir `http://127.0.0.1:3000`. Dans un second terminal :

```bash
npm run worker # optionnel : traitements locaux automatiques
```

Copier `.env.example` vers `.env.local` si ce fichier n’existe pas déjà. Choisir `DEV_ADMIN_PASSWORD` pour l’administration locale (`ADMIN_AUTH_MODE=local`). Ce mode est refusé sur Vercel. Aucune valeur de mot de passe par défaut n’est fournie. L’accès local accepte l’email administrateur vide.

Sans fournisseur email activé, le formulaire indique que les inscriptions ne sont pas encore ouvertes. Aucun lien simulant une confirmation d’adresse n’est proposé. Sans clé de recherche, l’administration reste utilisable pour configurer zones et sources.

SQLite conserve les données dans `.data/evento.sqlite`. La clé `.data/session.key` et la base doivent être conservées entre redémarrages, hors Git. Le processus local optionnel partage ce stockage et la configuration du site. Sur Vercel, les tâches utilisent directement la même base PostgreSQL et le même `SESSION_SECRET` que le site. Ne pas modifier ce secret sans prévoir l’invalidation des sessions et la migration des empreintes d’emails.

## Ajouter une zone sans modifier le code

1. Dans **Zones**, créer son nom et son identifiant stable, son pays, sa devise, son fuseau et son jour/heure de diffusion. Elle commence en brouillon.
2. Sélectionner la zone puis ajouter ses agendas dans **Sources** : office de tourisme, mairies, associations, lieux culturels. L’activation d’une source autorise la recherche sur son domaine, sans garantir une couverture exhaustive.
3. Revenir dans **Zones** et ouvrir la zone. Une source active est obligatoire. La page `/agenda-identifiant` et le choix dans l’inscription deviennent accessibles automatiquement.
4. Dans **Newsletters**, lancer une préparation pour la zone et la semaine voulues. Relire les faits et les sources, modifier le texte, retirer ou réordonner les sorties. Ajouter éventuellement un seul encart « Publicité — partenaire local » séparé de la sélection.
5. Prévisualiser HTML/texte, approuver la version, puis programmer ou envoyer explicitement lorsque le fournisseur email a été activé. Chaque modification retire l’approbation et la programmation. Une édition dont la diffusion a commencé est verrouillée.

Un seul domaine avec `/agenda-pays-de-gex`, `/agenda-geneve`, etc. mutualise la marque et l’exploitation. L’achat ou la disponibilité de `evento.com` n’est pas établi. L’interface et les éditions restent en français ; pays, devise et fuseau sont propres à chaque zone. Mettre une zone en brouillon ferme sa page et ses nouvelles inscriptions et annule sa programmation.

## Recherche réelle et preuves

Le traitement de préparation utilise le SDK officiel OpenAI, **Responses avec `web_search`**, `OPENAI_API_KEY` et `OPENAI_MODEL`. Le modèle doit supporter cet outil et les sorties structurées. Le SDK et les exemples officiels Responses ont été consultés lors de l’intégration. L’appel réel reste à valider avec une clé et un modèle configurés.

La seule source initiale est celle fournie pour le Pays de Gex : https://www.paysdegex-montsjura.com/agenda-animations/tout-lagenda/. Aucun événement n’en a été importé automatiquement. Ajouter progressivement les sources municipales et associatives vérifiées ; aucun annuaire de sources supposées n’est prérempli.

Les domaines recherchés sont limités aux sources actives. Une URL de preuve doit apparaître parmi les URLs retournées par l’outil de recherche. Les candidats gardent URL, extrait, date de consultation, année de source et état de confirmation de l’occurrence. La sélection écarte les dates hors week-end, événements passés, doublons, contradictions et données signalées fictives. Les preuves anciennes ou occurrences non confirmées restent hors sélection. Horaires, tarifs et âges inconnus restent inconnus. Aucun trajet n’est calculé ou inventé.

Ces contrôles ne certifient pas la fidélité de chaque assertion du modèle : **la relecture des sources par l’éditeur reste nécessaire avant approbation**. Les pages et PDF sont traités comme des données non fiables, jamais des instructions. Aucun contournement de site inaccessible. Le projet ne télécharge pas lui-même des URLs arbitraires ; le contrôle des URLs n’est pas un mécanisme SSRF complet pour un futur crawler.

Une requête Responses par tentative, sortie limitée à 6 000 tokens, délai de 45 secondes par défaut (90 maximum), trois tentatives par défaut (cinq maximum). Le nombre de recherches internes à cette requête n’a pas de plafond contractuel dans cette intégration. Tokens et appels d’outil retournés sont conservés ; coûts mesurés et estimés restent « inconnus ». **Un plafond monétaire n’est pas implémenté** : définir un budget côté fournisseur avant l’activation payante.

## Emails et programmation

`EMAIL_MODE=disabled` par défaut, y compris pour les confirmations. Pour un essai contrôlé : configurer `RESEND_API_KEY`, un `EMAIL_FROM` autorisé par Resend, `EMAIL_MODE=test` et `EMAIL_TEST_ALLOWLIST` (emails séparés par des virgules). Chaque destinataire doit appartenir à cette liste. Une diffusion refuse de démarrer si un abonné éligible n’y figure pas. Les tests automatisés n’utilisent jamais Resend.

Après validation et activation explicite, `EMAIL_MODE=production` autorise les abonnés confirmés et non désinscrits. Les inscriptions demandent seulement email, zone et consentement. Les confirmations arrivent réellement par email ; aucun jeton de confirmation n’est exposé dans la réponse HTTP. Les liens sont temporaires, hachés en base et consommés par POST ; leur jeton reste dans le fragment URL.

Une seule livraison par édition et abonné. La clé d’idempotence et le contenu sont conservés après échec. La reprise est limitée à 23 heures après la première tentative, à l’intérieur de la fenêtre d’idempotence de 24 heures annoncée par Resend. Une livraison bloquée en `sending`, ou hors fenêtre de reprise, exige un rapprochement manuel auprès du fournisseur ; ne pas la réinitialiser aveuglément. Un arrêt pendant une diffusion peut laisser cette diffusion en `sending` : même précaution. Un email déjà transmis ne peut pas être rappelé.

`SCHEDULER_ENABLED=true` prépare les éditions à partir de 8 h la veille du jour prévu, avec rattrapage le jour même, dans le fuseau de la zone. Cela ne les approuve pas automatiquement. Le passage Vercel distribue également les éditions explicitement programmées. Une échéance sans email configuré devient `blocked` et nécessite une nouvelle action de l’administrateur. La préparation est indépendante du nombre d’abonnés, avec une tâche durable unique par zone/week-end, bail de 180 secondes et reprises bornées.

## Vercel et Supabase

Le projet est une application **Next.js**, pas un export statique. `vercel.json` déclare le framework et la commande de build. Dans Vercel, choisir le dossier contenant `package.json`, **Framework Preset: Next.js** et **retirer l’override Output Directory `public`**. Garder la sortie automatique Next.js. Un dossier `public` vide ne résout pas cette erreur.

Vercel nécessite `DATABASE_URL` vers PostgreSQL persistant : SQLite sur son système de fichiers éphémère est refusé.

Si les logs indiquent `DATABASE_URL_MISSING` ou « Configurer DATABASE_URL sur Vercel » : dans Supabase, ouvrir **Connect** et récupérer l’URI PostgreSQL avec le mot de passe de la base (pas la clé API publique). Dans **Vercel → Settings → Environment Variables**, ajouter `DATABASE_URL` pour l’environnement du déploiement concerné (**Production** ou **Preview**). Appliquer les migrations ci-dessous, puis lancer **Redeploy** : un déploiement existant ne reçoit pas rétroactivement les nouvelles variables. Ne pas publier cette URI dans Git ou dans les logs.

Tant que cette configuration manque, la page affiche une indisponibilité sans événement ni inscription, avec indexation désactivée. `/api/health` répond **503** avec le code `DATABASE_URL_MISSING`. Ce message d’attente ne remplace pas la connexion à la base.
 Appliquer, dans cet ordre, avec le rôle de migration :

1. `supabase/migrations/001_initial.sql` si elle n’a pas déjà été appliquée.
2. `supabase/migrations/002_zone_newsletters.sql`, si pas encore appliquée.
3. `supabase/migrations/003_vercel_tasks.sql` : état durable des traitements Vercel et reprise des diffusions. Cette migration est réexécutable.

La deuxième migration est additive : les anciens profils et éditions restent dans leurs tables, mais ne sont ni réinscrits ni affichés dans le nouveau produit. Les tables sont fermées aux accès directs `anon`/`authenticated` par privilèges et RLS. Les routes serveur contrôlent les sessions et l’administration avant d’utiliser PostgreSQL. La suppression d’un abonnement retire ses données liées, pas les éditions communes.

Configurer côté serveur : `DATABASE_URL`, `SESSION_SECRET` aléatoire (32 caractères minimum), `APP_URL` égal à l’origine exacte du site, `ADMIN_AUTH_MODE=supabase`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` et `ADMIN_USER_IDS` (UUID autorisés). Garder TLS vérifié ; `PGSSLROOTCERT` permet de fournir la CA si nécessaire. Ne jamais coller les secrets dans le chat ou les committer.

**Vercel + Supabase suffisent : aucun service Railway ni worker permanent nécessaire.** Après les migrations :

- Dans Vercel → Settings → Environment Variables → **Production**, configurer `OPENAI_API_KEY`, `OPENAI_MODEL`, et un `CRON_SECRET` aléatoire distinct d’au moins 32 caractères (génération locale possible : `openssl rand -hex 32`). Aucun de ces secrets ne doit porter le préfixe `NEXT_PUBLIC_`.
- Pour les emails : `RESEND_API_KEY`, `EMAIL_FROM`, et d’abord `EMAIL_MODE=test` avec `EMAIL_TEST_ALLOWLIST`. Passer explicitement à `production` après validation d’un envoi contrôlé et du domaine expéditeur. Le défaut reste `disabled`.
- `SCHEDULER_ENABLED=true` active la création automatique des brouillons ; sinon, utiliser **Préparer** dans `/admin`. La relecture et l’approbation restent manuelles.
- Activer **Fluid Compute** dans les réglages Functions de Vercel pour permettre les fonctions de 300 secondes utilisées ici. Redéployer après tout changement de variables ou réglages. Vérifier dans Vercel → Cron Jobs que `/api/cron/tasks` apparaît.

**Fonctionnement sur Hobby.** `vercel.json` programme un passage par jour (`0 8 * * *`, UTC). Vercel Hobby ne garantit pas la minute : prévoir la fenêtre 8–9 h UTC, soit 10–11 h à Paris en été et 9–10 h en hiver. Une heure de diffusion choisie dans l’administration est une échéance au plus tôt, traitée au prochain passage ; une programmation après cette fenêtre peut donc attendre le lendemain. Aucun email d’une édition périmée n’est envoyé après le début de son week-end.

Les boutons **Préparer**, **Relancer** et **Confirmer l’envoi réel** enregistrent le travail en base, puis déclenchent `after()` sur Vercel après la réponse HTTP. Fermer l’onglet n’annule pas ce traitement. Si un traitement est déjà en cours ou si Vercel l’interrompt, les tâches restantes attendent le prochain Cron ou **Traiter les tâches en attente** dans l’administration. Cette dernière action peut envoyer les éditions déjà programmées dont l’échéance est atteinte ou celles explicitement mises en diffusion ; elle n’approuve aucune édition.

Chaque exécution utilise un budget de 220 secondes, prépare au plus **une édition** et tente au plus **50 livraisons**. La limite peut être inférieure selon le temps consommé. Un bail global de 5 minutes évite deux traitements simultanés entre Cron et actions admin. L’état, les erreurs et les livraisons sont conservés dans Supabase ; les emails déjà envoyés ne sont pas renvoyés. Une livraison laissée en `sending` à l’interruption exige une vérification fournisseur avant reprise, tandis que les lignes encore `queued` restent traitables.

Ce rythme convient au lancement ; plusieurs zones ou plus de 50 destinataires nécessiteront plusieurs lancements manuels, ou une offre permettant des Cron plus fréquents. Sur une offre compatible, modifier la fréquence dans `vercel.json` (par exemple toutes les 5 minutes) et adapter l’indication de cadence dans l’administration. Les quotas Vercel, OpenAI et Resend s’appliquent séparément.

`/api/cron/tasks` refuse l’absence de secret ou un mauvais `Authorization: Bearer …`. Seul le Cron de production est programmé par Vercel. Le serveur local optionnel `npm run worker` utilise les mêmes baux et lots, mais n’est pas requis en production. La connexion Supabase, l’authentification distante, OpenAI et Resend doivent être vérifiés dans l’environnement configuré. Aucun envoi réel n’est effectué par les tests ci-dessous.

Avant l’ouverture publique, compléter les informations du responsable de traitement, les durées de conservation et la gestion des sauvegardes dans la page confidentialité. `SEARCH_INDEXING_ENABLED=true` ouvre l’indexation des pages de zones actives ; elle est désactivée par défaut. Pas de paiement lecteur ni d’intégration Stripe dans ce modèle gratuit.

## Vérifier

```bash
npm test
npm run build
npm run typecheck
npm run test:e2e
```

Les tests métier utilisent des bases temporaires et des fournisseurs injectés en mémoire. PGlite vérifie les trois migrations, la conservation de l’existant et la RLS sans projet distant. Playwright démarre son serveur sur le port 3100 avec une base distincte `.data/e2e-*`, sans worker ni fournisseur externe ; ses données de test n’entrent jamais dans la base du site. Chromium : `/usr/bin/chromium`, ou définir `PLAYWRIGHT_CHROMIUM_PATH`.

Principaux modules : `zones.ts` (zones dynamiques), `store.ts` (abonnements/éditions), `jobs.ts` (préparation), `openai-discovery.ts` (recherche), `pipeline.ts` (sélection), `automation.ts` (exécution Vercel), `dispatch.ts` (lots durables), `delivery.ts` (livraisons), `mail-transport.ts` (fournisseur interchangeable), `email.ts` (rendu), et `src/components/admin.tsx` (gestion éditoriale).
