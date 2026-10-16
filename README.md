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
npm run worker
```

Copier `.env.example` vers `.env.local` si ce fichier n’existe pas déjà. Choisir `DEV_ADMIN_PASSWORD` pour l’administration locale (`ADMIN_AUTH_MODE=local`). Ce mode est refusé sur Vercel. Aucune valeur de mot de passe par défaut n’est fournie. L’accès local accepte l’email administrateur vide.

Sans fournisseur email activé, le formulaire indique que les inscriptions ne sont pas encore ouvertes. Aucun lien simulant une confirmation d’adresse n’est proposé. Sans clé de recherche, l’administration reste utilisable pour configurer zones et sources.

SQLite conserve les données dans `.data/evento.sqlite`. La clé `.data/session.key` et la base doivent être conservées entre redémarrages, hors Git. Le site et le worker doivent partager le même stockage, la même configuration et le même `SESSION_SECRET` en hébergement. Ne pas modifier ce secret sans prévoir l’invalidation des sessions et la migration des empreintes d’emails.

## Ajouter une zone sans modifier le code

1. Dans **Zones**, créer son nom et son identifiant stable, son pays, sa devise, son fuseau et son jour/heure de diffusion. Elle commence en brouillon.
2. Sélectionner la zone puis ajouter ses agendas dans **Sources** : office de tourisme, mairies, associations, lieux culturels. L’activation d’une source autorise la recherche sur son domaine, sans garantir une couverture exhaustive.
3. Revenir dans **Zones** et ouvrir la zone. Une source active est obligatoire. La page `/agenda-identifiant` et le choix dans l’inscription deviennent accessibles automatiquement.
4. Dans **Newsletters**, lancer une préparation pour la zone et la semaine voulues. Relire les faits et les sources, modifier le texte, retirer ou réordonner les sorties. Ajouter éventuellement un seul encart « Publicité — partenaire local » séparé de la sélection.
5. Prévisualiser HTML/texte, approuver la version, puis programmer ou envoyer explicitement lorsque le fournisseur email a été activé. Chaque modification retire l’approbation et la programmation. Une édition dont la diffusion a commencé est verrouillée.

Un seul domaine avec `/agenda-pays-de-gex`, `/agenda-geneve`, etc. mutualise la marque et l’exploitation. L’achat ou la disponibilité de `evento.com` n’est pas établi. L’interface et les éditions restent en français ; pays, devise et fuseau sont propres à chaque zone. Mettre une zone en brouillon ferme sa page et ses nouvelles inscriptions et annule sa programmation.

## Recherche réelle et preuves

Le worker utilise le SDK officiel OpenAI, **Responses avec `web_search`**, `OPENAI_API_KEY` et `OPENAI_MODEL`. Le modèle doit supporter cet outil et les sorties structurées. Le SDK et les exemples officiels Responses ont été consultés lors de l’intégration. L’appel réel reste à valider avec une clé et un modèle configurés.

La seule source initiale est celle fournie pour le Pays de Gex : https://www.paysdegex-montsjura.com/agenda-animations/tout-lagenda/. Aucun événement n’en a été importé automatiquement. Ajouter progressivement les sources municipales et associatives vérifiées ; aucun annuaire de sources supposées n’est prérempli.

Les domaines recherchés sont limités aux sources actives. Une URL de preuve doit apparaître parmi les URLs retournées par l’outil de recherche. Les candidats gardent URL, extrait, date de consultation, année de source et état de confirmation de l’occurrence. La sélection écarte les dates hors week-end, événements passés, doublons, contradictions et données signalées fictives. Les preuves anciennes ou occurrences non confirmées restent hors sélection. Horaires, tarifs et âges inconnus restent inconnus. Aucun trajet n’est calculé ou inventé.

Ces contrôles ne certifient pas la fidélité de chaque assertion du modèle : **la relecture des sources par l’éditeur reste nécessaire avant approbation**. Les pages et PDF sont traités comme des données non fiables, jamais des instructions. Aucun contournement de site inaccessible. Le projet ne télécharge pas lui-même des URLs arbitraires ; le contrôle des URLs n’est pas un mécanisme SSRF complet pour un futur crawler.

Une requête Responses par tentative, sortie limitée à 6 000 tokens, délai de 45 secondes par défaut (90 maximum), trois tentatives par défaut (cinq maximum). Le nombre de recherches internes à cette requête n’a pas de plafond contractuel dans cette intégration. Tokens et appels d’outil retournés sont conservés ; coûts mesurés et estimés restent « inconnus ». **Un plafond monétaire n’est pas implémenté** : définir un budget côté fournisseur avant l’activation payante.

## Emails et programmation

`EMAIL_MODE=disabled` par défaut, y compris pour les confirmations. Pour un essai contrôlé : configurer `RESEND_API_KEY`, un `EMAIL_FROM` autorisé par Resend, `EMAIL_MODE=test` et `EMAIL_TEST_ALLOWLIST` (emails séparés par des virgules). Chaque destinataire doit appartenir à cette liste. Une diffusion refuse de démarrer si un abonné éligible n’y figure pas. Les tests automatisés n’utilisent jamais Resend.

Après validation et activation explicite, `EMAIL_MODE=production` autorise les abonnés confirmés et non désinscrits. Les inscriptions demandent seulement email, zone et consentement. Les confirmations arrivent réellement par email ; aucun jeton de confirmation n’est exposé dans la réponse HTTP. Les liens sont temporaires, hachés en base et consommés par POST ; leur jeton reste dans le fragment URL.

Une seule livraison par édition et abonné. La clé d’idempotence et le contenu sont conservés après échec. La reprise est limitée à 23 heures après la première tentative, à l’intérieur de la fenêtre d’idempotence de 24 heures annoncée par Resend. Une livraison bloquée en `sending`, ou hors fenêtre de reprise, exige un rapprochement manuel auprès du fournisseur ; ne pas la réinitialiser aveuglément. Un arrêt pendant une diffusion peut laisser cette diffusion en `sending` : même précaution. Un email déjà transmis ne peut pas être rappelé.

`SCHEDULER_ENABLED=true` prépare les éditions à partir de 8 h la veille du jour prévu, avec rattrapage le jour même, dans le fuseau de la zone. Cela ne les approuve pas automatiquement. Le worker distribue également les éditions explicitement programmées. Une échéance sans email configuré devient `blocked` et nécessite une nouvelle action de l’administrateur. La préparation est indépendante du nombre d’abonnés, avec une tâche durable unique par zone/week-end, bail de 120 secondes et reprises bornées.

## Vercel et Supabase

Le projet est une application **Next.js**, pas un export statique. `vercel.json` déclare le framework et la commande de build. Dans Vercel, choisir le dossier contenant `package.json`, **Framework Preset: Next.js** et **retirer l’override Output Directory `public`**. Garder la sortie automatique Next.js. Un dossier `public` vide ne résout pas cette erreur.

Vercel nécessite `DATABASE_URL` vers PostgreSQL persistant : SQLite sur son système de fichiers éphémère est refusé. Appliquer, dans cet ordre, avec le rôle de migration :

1. `supabase/migrations/001_initial.sql` si elle n’a pas déjà été appliquée.
2. `supabase/migrations/002_zone_newsletters.sql`.

La deuxième migration est additive : les anciens profils et éditions restent dans leurs tables, mais ne sont ni réinscrits ni affichés dans le nouveau produit. Les tables sont fermées aux accès directs `anon`/`authenticated` par privilèges et RLS. Les routes serveur contrôlent les sessions et l’administration avant d’utiliser PostgreSQL. La suppression d’un abonnement retire ses données liées, pas les éditions communes.

Configurer côté serveur : `DATABASE_URL`, `SESSION_SECRET` aléatoire (32 caractères minimum), `APP_URL` égal à l’origine exacte du site, `ADMIN_AUTH_MODE=supabase`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` et `ADMIN_USER_IDS` (UUID autorisés). Garder TLS vérifié ; `PGSSLROOTCERT` permet de fournir la CA si nécessaire. Ne jamais coller les secrets dans le chat ou les committer.

**Le worker doit être hébergé séparément**, comme processus persistant avec la même base. Une fonction Vercel ne lance pas automatiquement `npm run worker`. La connexion Supabase, l’authentification distante, OpenAI et Resend doivent être vérifiés dans l’environnement configuré. Aucun déploiement ni envoi réel n’est effectué par les commandes de validation ci-dessous.

Avant l’ouverture publique, compléter les informations du responsable de traitement, les durées de conservation et la gestion des sauvegardes dans la page confidentialité. `SEARCH_INDEXING_ENABLED=true` ouvre l’indexation des pages de zones actives ; elle est désactivée par défaut. Pas de paiement lecteur ni d’intégration Stripe dans ce modèle gratuit.

## Vérifier

```bash
npm test
npm run build
npm run typecheck
npm run test:e2e
```

Les tests métier utilisent des bases temporaires et des fournisseurs injectés en mémoire. PGlite vérifie les deux migrations, la conservation de l’existant et la RLS sans projet distant. Playwright démarre son serveur sur le port 3100 avec une base distincte `.data/e2e-*`, sans worker ni fournisseur externe ; ses données de test n’entrent jamais dans la base du site. Chromium : `/usr/bin/chromium`, ou définir `PLAYWRIGHT_CHROMIUM_PATH`.

Principaux modules : `zones.ts` (zones dynamiques), `store.ts` (abonnements/éditions), `jobs.ts` (préparation), `openai-discovery.ts` (recherche), `pipeline.ts` (sélection), `delivery.ts` (diffusion), `mail-transport.ts` (fournisseur interchangeable), `email.ts` (rendu), et `src/components/admin.tsx` (gestion éditoriale).
