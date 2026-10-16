# Evento

**Première tranche fonctionnelle : onboarding → profil persistant → préparation simulée par un worker → sélection personnalisée → aperçu HTML et texte de l’email.**

L’interface est en français. Tous les événements, preuves et itinéraires de cette tranche sont **fictifs et signalés comme tels**. Il n’y a ni recherche web réelle, ni envoi externe, ni paiement actif. Pays de Gex / Genève est la zone du scénario de démonstration, **pas une couverture réelle validée**.

## Démarrer en trois commandes

Prérequis : **Node.js 24** et npm. Aucune clé externe, base distante ou Docker nécessaire.

```bash
cd /workspace/evento # ou le chemin de votre clone
npm ci
npm run dev
```

Dans un **second terminal**, depuis le même dossier :

```bash
npm run worker
```

Ouvrir l’adresse `http://127.0.0.1:3000` indiquée par le serveur. Les processus doivent rester actifs. Le worker n’est pas exécuté dans une requête du navigateur. En cas de fermeture du site, la file continue de fonctionner.

La configuration par défaut suffit. Pour la personnaliser, copier `.env.example` vers `.env.local` **sans écraser un fichier existant**. Le site et le worker lisent tous deux ce fichier. Si vous changez l’origine ou le port, mettre `APP_URL` à la même valeur (la protection CSRF compare l’origine exacte).

1. Choisir **Trouver mes prochaines sorties**, puis **Remplir un profil fictif**.
2. Parcourir les quatre étapes et enregistrer. Les profils de démonstration utilisent `example.test`.
3. La sélection apparaît dès que le worker termine. Ouvrir **Prévisualiser mon email**, en HTML ou en texte.
4. Obtenir le lien de confirmation dans l’espace utilisateur et le valider. La confirmation est **simulée** : elle ne prouve pas la possession d’une boîte réelle.
5. Donner un retour, modifier les préférences, se désinscrire ou supprimer le profil.
6. Ouvrir `/admin`. Mot de passe **local de démonstration** : `evento-demo-local`, sauf surcharge de `DEMO_ADMIN_PASSWORD`. L’email administrateur reste vide en démo. Consulter les motifs de rejet, retirer des propositions et approuver. **Approuver n’envoie rien.**

Pour un calendrier de démonstration reproductible, ajouter `DEMO_REFERENCE_DATE=2026-10-09T06:00:00Z` dans `.env.local` et redémarrer les deux processus. Cela fige le week-end fictif, jamais les expirations de sessions ou les baux du worker. Sans cette variable, le calendrier réel est utilisé ; un dimanche soir peut donc ne plus contenir de sortie à venir.

## Vérifier

```bash
npm test             # moteur, stockage, worker, garde-fous email, migration PostgreSQL/RLS
npm run build        # compilation et vérification TypeScript Next.js
npm run typecheck
npm run test:e2e     # Chromium : parcours complet, deux utilisateurs, admin, mobile
```

Les tests navigateur lancent automatiquement leur site sur le port **3100** et leur worker, avec un calendrier fixe et une base séparée `.data/e2e`. Ils utilisent Chromium installé à `/usr/bin/chromium` dans cet environnement. Ailleurs, renseigner `PLAYWRIGHT_CHROMIUM_PATH` avec le chemin de Chromium installé. Ne pas lancer deux suites navigateur simultanément sur le même port.

Les tests métier utilisent une base temporaire isolée, jamais `DATABASE_URL`. Le test SQL utilise un moteur PostgreSQL embarqué PGlite et vérifie la migration, les permissions et les politiques RLS ; il ne se connecte pas à un projet Supabase. Les tests d’envoi emploient uniquement un fournisseur en mémoire.

Pour vérifier le build en fonctionnement :

```bash
npm run build
npm run start
# Dans un autre terminal : npm run worker
```

## Structure

```text
src/app/                 Pages et routes HTTP Next.js
src/components/          Interface française responsive
src/lib/domain.ts        Schémas, dates et modèles
src/lib/store.ts         Profils, consentement, éditions et approbation
src/lib/db.ts            SQLite local / PostgreSQL côté serveur
src/lib/jobs.ts          File persistante, baux, reprises et planification
src/lib/pipeline.ts      Contraintes, doublons et sélection
src/lib/providers.ts     Interfaces recherche / itinéraire / email ; implémentations fictives
src/lib/security.ts      Jetons, sessions admin, expiration et limitations de débit
src/lib/email.ts          Rendu HTML/texte à partir des données validées
src/lib/delivery.ts       Garde-fous et idempotence, testés sans transport externe
scripts/worker.ts        Processus durable indépendant du site
supabase/migrations/     Migration PostgreSQL avec RLS
tests/                   Tests métier, SQL et navigateur
```

Les préférences et états d’essai sont stockés avec le profil. Les consentements, tâches, tentatives, candidats avec preuves, éditions, retours et tentatives d’envoi ont des tables distinctes. La première tranche conserve les documents structurés en JSON sérialisé dans des colonnes texte, commun aux deux moteurs.

## Persistance, reprise et contraintes

- `.data/evento.sqlite`, son journal WAL et `.data/session.key` sont locaux, ignorés par Git et conservés entre redémarrages. Ne pas supprimer la clé de session lors d’une mise à jour : elle sert aussi à la pseudonymisation des emails. Supprimer un profil par l’interface efface ses données liées dans la base active.
- Une édition par profil, week-end et version de préférences. Une tâche par édition. Une revendication atomique et un bail de 120 secondes empêchent deux workers de produire simultanément la même édition. Un bail expiré est repris, dans la limite de trois tentatives par défaut.
- Délai de préparation borné (45 secondes par défaut, 90 maximum), appels limités, temporisation exponentielle, historique d’erreurs. Les fournisseurs reçoivent un signal d’annulation, et un délai externe protège aussi contre un fournisseur qui l’ignore. Un futur fournisseur doit réellement annuler ses requêtes pour éviter des coûts après expiration.
- Cache de six heures, uniquement pour la zone, le week-end et le scénario. **Aucun profil ni préférence dans le cache partagé.**
- Informations inconnues conservées comme inconnues. Tarif non renseigné, conversion de devise non disponible, accès obligatoire inconnu ou trajet non vérifié : alternative hors sélection principale. Pas de conversion distance → durée. Pas de certification implicite d’un itinéraire vélo pour enfants.
- Budget calculé pour le groupe selon la base de tarif indiquée ; ni conversion de devise, ni réduction enfant supposée. Les trajets de démonstration sont des valeurs fictives fixes, jamais des estimations géographiques.
- Âge organisateur affiché séparément de la pertinence calculée à partir des intérêts explicites. Année des preuves, occurrences, dates passées, doublons et contradictions contrôlés. Aucun besoin de remplir cinq places.
- Les retours « trop loin » et « pas pour moi » invitent à modifier explicitement les préférences. « Déjà connu » exclut l’activité des nouvelles préparations. Une sélection déjà préparée n’est pas réécrite en arrière-plan.
- Coûts et tokens non disponibles : **inconnus**, jamais zéro. La tranche de démonstration n’effectue aucun appel payant. L’application d’un plafond monétaire avant appels réels fera partie du lot de recherche.

## Accès et données

Les utilisateurs ont une session HTTP-only, SameSite=Lax. Les liens de confirmation/gestion/désinscription emploient des jetons aléatoires, hachés en base, limités dans le temps et à usage unique. Le jeton de lien est dans le fragment URL pour ne pas apparaître dans les journaux HTTP ; une action explicite par POST le consomme. Les sessions sont révoquées avec la suppression du profil. Hors démo, HTTPS impose le cookie Secure.

Les routes utilisateur déterminent l’identité depuis la session, jamais depuis un ID de profil fourni par le client. Les tests HTTP vérifient qu’un utilisateur ne peut ni lire les emails d’un autre, ni répondre pour lui, ni accéder aux données admin. Les écritures vérifient l’origine. Les données et liens privés ne sont pas mis en cache.

En démo locale, l’administration utilise un mot de passe de test et une session signée. Le serveur écoute sur `127.0.0.1`. Ne pas exposer cette configuration comme un service réel. Un chemin Supabase Auth est fourni pour l’administrateur hors démo ; il exige une liste explicite d’UUID autorisés et n’a pas été validé contre un projet distant.

## Préparer Supabase (facultatif pour cette tranche)

1. Appliquer **une seule fois** `supabase/migrations/001_initial.sql` avec le rôle privilégié de migration, via l’éditeur SQL Supabase ou votre outil de migration habituel.
2. Renseigner `DATABASE_URL` **côté serveur uniquement**, depuis les paramètres de connexion du projet. Garder la vérification TLS ; `PGSSLROOTCERT` permet de fournir la CA du projet si nécessaire. Ne jamais utiliser `rejectUnauthorized=false`.
3. Renseigner un `SESSION_SECRET` aléatoire d’au moins 32 caractères. Ne jamais committer les valeurs ou les coller dans une conversation.
4. Pour l’administrateur Supabase Auth : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, puis `ADMIN_USER_IDS` avec les UUID des administrateurs autorisés. La clé publique n’accorde **aucun accès direct** aux tables applicatives.

**RLS fermée par défaut** sur toutes les tables : les rôles `anon` et `authenticated` n’ont ni privilèges ni politique autorisant l’accès direct. L’autorisation utilisateur et admin se fait dans les routes Next.js, avant les requêtes serveur privilégiées. Ce choix évite deux systèmes d’identité utilisateur concurrents dans le premier lot (sessions par lien et Supabase Auth réservé à l’admin). Aucun secret Supabase de service n’est envoyé au navigateur.

Le pilote PostgreSQL est implémenté et la migration testée dans PostgreSQL embarqué. **La connexion réseau à Supabase et son Auth restent à valider avec un projet configuré.** Passer `APP_MODE` hors démo ne simule jamais silencieusement des données réelles : inscriptions et préparations sont bloquées tant que les fournisseurs réels ne sont pas branchés.

## Emails, essai et planification

`EMAIL_MODE=disabled` est le défaut. Aucun transport externe ni endpoint d’envoi n’est branché. Changer cette variable seul ne permet pas d’envoyer. Le service d’envoi de test est couvert par un fournisseur simulé : il exige une adresse confirmée, un profil actif, une approbation humaine, une liste autorisée et un essai/abonnement valide.

Une seule ligne d’envoi par profil/week-end, revendiquée atomiquement ; la même clé d’idempotence **et le même contenu** sont conservés après un échec. Un état `sending` laissé par un arrêt brutal doit être rapproché du fournisseur avant toute reprise. Le futur fournisseur devra garantir l’idempotence sur une durée documentée. Un envoi déjà transmis au fournisseur ne peut pas être rappelé par une désinscription ; la vérification a lieu immédiatement avant l’appel.

Les quatre éditions gratuites et les états `trial`, `active`, `expired` sont prévus. Les envois de test ne consomment pas l’essai. Aucun abonnement réel ni checkout Stripe n’existe dans cette tranche.

`SCHEDULER_ENABLED=true` active dans le worker une vérification par minute, à partir de 8 h le vendredi dans le fuseau de chaque profil confirmé. La création est idempotente. **Cela prépare seulement des sélections**, soumises à revue humaine ; aucun envoi programmé. Le rattrapage après une panne couvrant tout le vendredi et l’hébergement du worker restent à définir avant la production.

## Suite du MVP — pas encore branchée

1. Vérifier la documentation officielle OpenAI au moment de l’intégration, puis brancher Responses avec l’outil web supporté et `OPENAI_MODEL` configurable. Ajouter le schéma de sortie, les citations/proofs, les recherches complémentaires par profil, les plafonds de coût et des tests sur des sources réelles Gex/Genève. Aucune automatisation de ChatGPT.
2. Brancher un fournisseur d’itinéraires datés (notamment transports publics transfrontaliers), avec départ, arrivée et statut de vérification. Les événements ne passent en conformité réelle qu’après vérification.
3. Brancher les confirmations et un transport d’email en **mode test avec liste autorisée**, avec rapprochement des envois ambigus. Aucun envoi réel sans activation explicite.
4. Valider les premières éditions réelles avec revue humaine, puis l’automatisation de livraison et le décompte de l’essai. Ajouter Stripe **uniquement en mode test**, après validation du parcours.

Les extensions Jura/Les Rousses, Annecy et vallée de l’Arve, la recherche réelle depuis des quartiers/arrêts non reconnus, les traductions des éditions et la vérification approfondie des PDF ne sont pas réalisées dans ce premier lot. Aucun téléchargement serveur de page ou PDF n’est effectué : le contrôle des URLs affichées ne constitue pas un dispositif SSRF pour un futur récupérateur. Celui-ci devra revalider DNS et redirections et traiter le contenu récupéré comme des données non fiables.
