# Auth backlog — items déférés des SP1→SP6

**Date d'inventaire :** 2026-05-25 (après SP-C + lancement SP6).

Topics non traités identifiés en revue spec SP1→SP5 + follow-ups SP6. Ordre par criticité décroissante.

---

## Infrastructure — modules dépendants

### B1. `@czo/kit/effect` — restant en production (post-SP-C) — ⚠️ PÉRIMÉ / clos (2026-06-06)

**Réévaluation (2026-06-06) :** l'inventaire d'origine ci-dessous est faux depuis la migration `defineModule` de stock-location et la suppression du module `@czo/kit/effect`. État réel aujourd'hui :

- **`@czo/kit/effect` n'existe plus** comme module — `runEffect` / `useRuntime` vivent dans `@czo/kit/db`. Plus aucun import `@czo/kit/effect` dans le code (seul un *string* dans `app/build.config.ts` externals, inerte).
- **`@czo/stock-location` : déjà propre** — `plugins/index.ts` + `graphql/context-factory.ts` (les seuls sites cités) ont été supprimés à la migration `defineModule` ; zéro usage `useRuntime`/`registerEffectLayer`.
- **Seul reste : `@czo/app`** — module **orphelin** (importé par aucune app/manifest), **34 erreurs de types**, référence du code mort (`@czo/auth/types`, `@czo/auth/events`, supprimés au SP1) et une API Pothos pré-kit-v2. Ses 3 `runEffect(useRuntime(), DrizzleDb) as any` (`graphql/schema/app/queries.ts`) sont le dernier vestige kit/effect-era — mais le module entier prédate tous les patterns actuels.

**Décision (utilisateur, 2026-06-06) :** **laisser `@czo/app` tel quel** et clore B1 comme périmé. Ni restaurer un shim (le module est mort) ni réécrire `@czo/app` (réécriture complète, pas un swap kit/effect) tant que la feature « app/marketplace install » n'est pas au roadmap. `@czo/app` reste la baseline check-types (~34 err) jusqu'à un sprint marketplace dédié — voir B2.

<details><summary>Inventaire d'origine (2026-05-25, périmé)</summary>

Côté `@czo/auth` purgé (SP-C, commit `635d7a81`). Restait (à l'époque) en production dans :

- `packages/modules/app/src/listeners/webhook.listener.ts` — 4 sites `runEffect(useRuntime(), DrizzleDb)` *(fichier supprimé depuis)*
- `packages/modules/app/src/graphql/schema/app/queries.ts` — 3 sites *(seul reste réel)*
- `packages/modules/app/build.config.ts` — externals listing *(string inerte)*
- `packages/modules/stock-location/src/plugins/index.ts` — `registerEffectLayer` + `useRuntime` *(fichier supprimé)*
- `packages/modules/stock-location/src/graphql/context-factory.ts` — `useRuntime` *(fichier supprimé)*

Options envisagées : (a) restaurer `@czo/kit/effect` en thin shim ; (b) migrer `@czo/app` + `@czo/stock-location` au pattern Effect-native. → caduques : stock-location est déjà migré, `@czo/app` est orphelin.

</details>

### B2. Tests legacy de `@czo/app` et `@czo/stock-location`

Pas inventoriés. SP-C a nettoyé `@czo/auth` uniquement. Probablement même pattern de dette : mocks `@czo/kit/effect`, pré-Testcontainers, schema tests stale. À auditer en parallèle de B1.

---

## Auth — features déférées

### B3. Filtrer `users.deletedAt IS NULL` dans services existants (suivi SP6)

**État :** SP6 ajoute `users.deletedAt` (soft-delete) mais seul `AccountService` consulte ce champ. Le reste des services (`UserService.findFirst/findMany`, `OrganizationService.findFirstMember`, `SessionService.create`, etc.) ne filtrent pas — un soft-deleted user reste visible comme actif partout sauf via les flows SP6.

**Impact :**
- Admin `removeUser` (hard delete) sur user soft-deleted → fonctionne (mais redondant)
- `OrganizationService.listMembers` → soft-deleted apparaît dans la liste des membres
- `findFirst({where: {email}})` → soft-deleted email match (mais le pattern d'unique constraint le bloque déjà à l'insert)

**Travail :** Audit tous les call sites `findFirst({where: {id|email}})` et décider par site si filter `deletedAt IS NULL`. Probablement ajouter `excludeDeleted?: boolean` (default true) sur `UserService.findFirst`. ~10-15 sites.

**Priorité :** moyenne — bug seulement quand un user soft-deleted existe ET un autre flow le consulte. Cohérent à traiter en sprint dédié "soft-delete propagation" une fois SP6 stable.

### B4. `change-email` admin path

SP6 livre seulement le self path. Mutation admin `changeUserEmail` (par `userId`, sans confirmation token) à ajouter si besoin. Symétrique à `removeUser`.

### B5. Anonymization job (T+30j post-deleteAccount)

**État :** SP6 livre le grace period (30j) + `AccountUnrecoverable` error class, mais pas le cron qui rewrite `email = 'deleted-{id}@deleted.local'`, `name = 'Deleted user'`, `image = null` après expiration de la grace.

**Travail :** Sprint "scheduled jobs infra" — couvre aussi B8 (`purgeExpired` sessions). Job runner (probably bullmq via `@czo/kit/queue`), CRON scheduler, `AccountService.anonymizeExpired()` method.

**Priorité :** GDPR-driven — exposition PII bornée par la date de livraison.

### B6. 2FA / TOTP

Hors-scope SP1. Better-auth two-factor plugin probablement encore wiré (`/two-factor/*` paths dans `disabledPaths` mais aucune implémentation GraphQL). À porter au pattern `AccountService` si feature requise.

### B7. Social / OAuth flows

Hors-scope SP1. Better-auth gère encore Google/GitHub via `socialConfig`. Pas de port natif. Le sign-in/sign-up via OAuth reste sur better-auth tant qu'on n'a pas de remplaçant.

---

## Infrastructure — invalidation & scheduling

### B8. Cross-process L1 invalidation channel

**État :** SP1 §10 hors-scope, "revisit in SP4". SP4 a livré `Session.subscribersLayer` (ban / role-change) mais purement in-process. En multi-instance (HA), une invalidation L1 sur un node ne propage pas aux autres.

**Travail :** Pub/Sub Redis (ou équivalent) pour relayer les invalidations entre instances. Ajouter un `SessionService.invalidationsLive` Layer qui subscribe au channel + relaie sur le `PubSub` local.

**Priorité :** seulement si déploiement multi-instance imminent.

### B9. `purgeExpired` scheduling

**État :** SP1 livre la méthode `SessionService.purgeExpired()`. Aucun cron ne l'appelle aujourd'hui. Sessions expirées s'accumulent en DB (~1 ligne/user/7j sans nettoyage).

**Travail :** Sprint "scheduled jobs infra" (cf. B5).

**Priorité :** basse — rentes DB modérées avant 1 an.

---

## EmailService — transport réel

### B10. SMTP / SES drop-in pour `EmailService`

**État :** SP5 livre `@czo/kit/email` avec `loggingLayer` (dev/test seulement). `AuthModuleConfig.email.layer` accepte un override mais aucun impl SMTP/SES n'est livré.

**Travail :** Créer `@czo/kit/email/smtp` (nodemailer) + `@czo/kit/email/ses` (AWS SDK). 1 layer par transport.

**Priorité :** bloquant pour la prod auth.

---

## Améliorations différées (faible priorité)

### B11. `NoCredentialAccount` tagged error

**État :** `changePassword` (SP5) et `requestEmailChange`/`deleteAccount` (SP6) retournent `UserNotFound` (SP5) ou succès silencieux (SP6 hybride pwd policy) sur user OAuth-only. Confusant pour le front si l'UX veut un message dédié.

**Travail :** Nouveau tagged error `NoCredentialAccount { userId }` levé quand le user n'a pas de row `accounts(providerId='credential')`. Mutations correspondantes l'exposent.

**Priorité :** seulement si demande UX explicite.

### B12. GraphQL-wide rate-limit

**État :** SP5 risques : "sprint séparé". Cooldown 60s côté tokens (password-reset, email-verification, change-email) est insuffisant pour DoS générique (e.g. mutation `signIn` peut être bruteforced sans gate).

**Travail :** Intégrer `@graphql-yoga/plugin-rate-limit` ou équivalent custom basé sur le `EventBus` + Redis. Tagger les mutations sensibles.

**Priorité :** moyenne — bloquant si exposition publique sans WAF.

### B13. Anti-enum timing leak mitigation

`requestPasswordReset` / `requestEmailVerification` / `requestEmailChange` peuvent leak l'existence d'un compte via timing (lookup user ~10ms vs ~30ms si trouve + insert + publish). Acceptable SP5/SP6 ; si pen-test exige, ajouter `Effect.sleep(Random.next(50, 100))` côté happy path pour normaliser.

**Priorité :** seulement si threat model l'exige.

### B14. Rotation de token pour clients Bearer-only

**État :** Le contributeur de contexte (`graphql/session-context.ts`) accepte désormais le token de session via `Authorization: Bearer <token>` (méthode `SessionService.readBearerToken`, priorité sur le cookie). Mais la rotation — quand `resolve` walk-up d'un enfant d'impersonation expiré vers le parent et que `resolved.session.token !== token` — ne propage le nouveau token que via `ctx.setCookie` (Set-Cookie). Un client **purement Bearer** (pas de cookie : API, mobile) ignore le Set-Cookie et continuerait donc à présenter l'ancien token après un walk-up.

**Impact :** borné — la rotation ne survient qu'au terme d'une impersonation (flow surtout navigateur). Un client Bearer en cours d'impersonation après expiration de l'enfant garderait le token enfant jusqu'à ce qu'il en redemande un.

**Travail :** renvoyer le token tourné dans un header de réponse (p.ex. `X-Session-Token`) en plus du Set-Cookie quand la source était le header Authorization, et documenter côté client qu'il doit le ré-adopter. Décider si on expose toujours le header ou seulement quand la source d'entrée était Bearer.

**Priorité :** basse — seulement si un client non-navigateur consomme l'impersonation.

### B15. Tests E2E GraphQL pour `@czo/auth` et `@czo/stock-location`

**État :** le module `@czo/attribute` a désormais une suite E2E qui boote la vraie app (`[auth, attribute]`) sur Testcontainers via le harness `bootTestApp` (`@czo/kit/testing`) et tape le vrai handler fetch (`/api/auth/**` + `/graphql`), avec vraie autz — voir `packages/modules/attribute/src/e2e/` (`harness.ts` + `node-authz` / `queries` / `attribute-mutations` / `value-mutations`). `auth` et `stock-location` n'ont, eux, que des tests d'intégration **au niveau service** ; leur surface GraphQL (resolvers, décodage relay, enforcement des `authScopes`/node-guards, mapping erreur→union) n'est pas couverte E2E.

**Travail :**
- **`@czo/auth`** : suite E2E via `bootTestApp([auth])` (auth boote seul) — sign-up/in/out (REST `/api/auth/**`), puis mutations/queries org (createOrganization, invitations, membres/rôles), API keys, account flows (change-email, delete/restore), impersonation. Couvrir les paliers d'autz (permission org vs rôle global) et les refus.
- **`@czo/stock-location`** : suite E2E via `bootTestApp([auth, stock-location])` (dépend d'auth pour l'autz) — CRUD stock-location + scoping org + refus cross-org.
- Factoriser un harness par module sur le modèle de `attribute/src/e2e/harness.ts` (`signUp`, `gql`, `grantGlobalRole`, `createOrgWith…`), idéalement remonté dans `@czo/kit/testing` si la duplication le justifie.
- Réutiliser le `bootTestApp` existant ; rien à construire côté infra (le harness + le registre de node-guards sont en place).

**Priorité :** moyenne — comble le gap d'autz à l'exécution (les `authScopes`/node-guards d'auth et stock-location ne sont prouvés qu'au build SDL aujourd'hui).

### B16. Valider le typename des global IDs (`globalID({ for })`) dans `@czo/auth` et `@czo/stock-location` — ✅ FAIT (`feat/b16-globalid-validation`)

**Résolu :** migration de tous les sites `decodeGlobalID(x).id` vers `t.globalID({ for })` / `t.arg.globalID({ for })` — `@czo/auth` (user, organization, impersonation ; api-key fait via B17/#109) + `@czo/stock-location`. Helpers d'autz (`loadOrganizationId`) prennent désormais un id **numérique**. Fixe au passage 2 bugs latents : (1) `loadOrganizationId` double-décodait dans `stockLocation(id:)` (→ `it.fails` du test "reads it back" levé, maintenant vert) ; (2) `revokeSessions` faisait `Number(input.id)` sur un global id (→ `NaN`). Test de régression ajouté (`user(id:)` avec un id `Organization` → rejeté). auth 209/215 (6 api-key skip), stock-location 7/7, attribute 55/55, types + lint clean.

**État :** `@czo/attribute` a migré tous ses inputs/args d'id relay de `t.field({ type: 'ID' })` + `decodeGlobalID(x).id` vers `t.globalID({ for })` / `t.globalIDList` / `t.arg.globalID` → le **typename est validé au bord GraphQL** (un id de mauvais type → erreur de validation, plus silencieusement décodé), et les helpers d'autz prennent des ids **numériques**. Les autres modules ont encore l'ancien pattern :
- **`@czo/auth`** — ~50 sites `decodeGlobalID(...).id` sur 7 fichiers (`user`, `organization`, `api-key`, `impersonation` × queries+mutations). Ids tous **intra-module** (User, Organization, Session, ApiKey, Member, Invitation) → `for` résout sans couplage cross-module.
- **`@czo/stock-location`** — ~10 sites sur 2 fichiers (`authz.ts`, `mutations.ts`). Référence `StockLocation` (intra) + `Organization` (auth, **cross-module**) → comme attribute, son test de build de schéma isolé devra builder le schéma **combiné `[auth, stock-location]`** (mirror de `buildApp`).

**Caractérisation :** ce n'est **pas une élévation de privilège** (l'autz ré-autorise sur la ligne chargée ; le numérique est de toute façon contrôlé par le client ; le typename est ignoré, pas utilisé pour router) — **robustesse / défense en profondeur**. Même nature que le fix attribute.

**Travail :** appliquer le pattern attribute par module — migrer les input fields/args vers `globalID({ for })`, faire prendre des numériques aux helpers d'autz (drop du decode interne), résoudre `for: 'Organization'` (déjà enregistré par auth dans le schéma combiné). **Le patch plugin requis est déjà en place** (`patches/@pothos__plugin-relay@4.7.0.patch` — `globalID({ for })` avec un nom en string crashait sans lui, cf. `reference_pothos_relay_globalid_patch`). Faire stock-location d'abord (petit, 10 sites) puis auth (gros, 50 sites + ripple helpers, mérite sa propre revue).

**Priorité :** basse — défense en profondeur, pas d'exploit ; pattern + patch déjà prouvés sur attribute.

### B17. Compléter la surface GraphQL `api-key` (feature inachevée SP3) — ✅ FAIT (`feat/b17-api-key-graphql`)

**Résolu :** `ApiKeyService.create` retourne désormais `{ apiKey, plain }` (le secret one-time ; le hash reste en DB) ; le resolver `createApiKey` surface `plain` ; schéma ré-enregistré (`graphql/schema/index.ts`) ; imports normalisés en relatif. Suite E2E dé-skippée → 6/6 verte (auth 214/214, attribute 55/55, types + lint clean).

**État :** révélé par les E2E B15. La surface GraphQL api-key existe (`graphql/schema/api-key/{errors,types,inputs,queries,mutations}.ts` + scope `apiKeyOwner` dans `scopes.ts`) mais est **inachevée et désactivée** :
1. `registerApiKeySchema(builder)` est **commenté** dans `graphql/schema/index.ts` (depuis la migration Pothos #101) → aucune des mutations/queries api-key (`createApiKey`, `updateApiKey`, `removeApiKey`, `myApiKeys`, `apiKey`, `organizationApiKeys`) n'existe dans le schéma.
2. Même activé, `createApiKey` retourne `plain: null` (`api-key/mutations.ts`) car `ApiKeyService.create` **jette le plaintext généré** (retourne seulement la ligne `ApiKey` hashée) → les clés créées sont **inutilisables** (le client ne reçoit jamais le secret).
3. Les fichiers du schéma api-key importent leurs services via les **subpaths** `@czo/auth/services/*` (vs imports relatifs partout ailleurs) → cassent sous vitest.

**Travail :** changer `ApiKeyService.create` pour retourner `{ apiKey, plain }` (le plaintext one-time), threader dans le resolver ; ré-enregistrer le schéma ; normaliser les imports en relatif. La suite E2E est **déjà écrite + vérifiée** (`packages/modules/auth/src/e2e/api-key.e2e.test.ts`, `describe.skip`, 5/6 verts schéma activé) — un-skip une fois complété.

**Priorité :** moyenne — feature exposée mais non-fonctionnelle ; petit contrat de service à étendre.

### B18. Relay `StockLocation` : global id depuis les mutations + node-guard org-scopé

**État :** révélé par les E2E B15 (2 `it.fails` dans `stock-location.e2e.test.ts`). Deux trous relais :
1. `createStockLocation` retourne `stockLocation.id` en **entier brut** (ex. `1`) au lieu d'un global id relay → re-injecter cet id dans `stockLocation(id:)` / `node(id:)` échoue "Invalid global ID: 1". (`StockLocation` est pourtant un `drizzleNode` avec un `id` global ; le payload de mutation expose l'id brut.)
2. **Aucun node-guard** enregistré pour `StockLocation` (`graphql.nodeGuards`) → `node(id:)` n'est **pas scopé org** : un non-membre peut lire une stock-location d'un autre org via `node(id:)` (fuite cross-org). `attribute` enregistre des node-guards précisément pour ça (cf. `reference_kit_node_guards`).

**Travail :** (1) faire exposer le global id par le payload de mutation (vérifier le champ de sortie `stockLocation` / le comportement drizzleNode en contexte mutation) ; (2) enregistrer un node-guard `StockLocation` calqué sur attribute (résout l'org via la ligne, exige `stock-location:read` sur cet org). Flip les 2 `it.fails` en tests verts.

**Priorité :** moyenne — #2 est une fuite cross-org (sécurité) ; #1 rend les ids de mutation inutilisables côté client.

---

## Historique des items résolus

- **B0a. Tests legacy `@czo/auth`** — résolu SP-C, 6 deletes + 1 migrate, commit `635d7a81`.
- **B0b. `change-email` self flow** — résolu SP6 (plan en cours, commit pendant).
- **B0c. `delete-user` self flow** — résolu SP6 (plan en cours, commit pendant).
