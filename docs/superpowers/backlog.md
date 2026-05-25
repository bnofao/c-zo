# Auth backlog — items déférés des SP1→SP6

**Date d'inventaire :** 2026-05-25 (après SP-C + lancement SP6).

Topics non traités identifiés en revue spec SP1→SP5 + follow-ups SP6. Ordre par criticité décroissante.

---

## Infrastructure — modules dépendants

### B1. `@czo/kit/effect` — restant en production (post-SP-C)

**État :** Côté `@czo/auth` purgé (SP-C, commit `635d7a81`). Reste en production dans :

- `packages/modules/app/src/listeners/webhook.listener.ts` — 4 sites `runEffect(useRuntime(), DrizzleDb)`
- `packages/modules/app/src/graphql/schema/app/queries.ts` — 3 sites
- `packages/modules/app/build.config.ts` — externals listing
- `packages/modules/stock-location/src/plugins/index.ts` — `registerEffectLayer` + `useRuntime`
- `packages/modules/stock-location/src/graphql/context-factory.ts` — `useRuntime` dans le contexte GraphQL

**Options :**
- (a) **Restaurer** `@czo/kit/effect` comme thin shim autour de `ManagedRuntime` (~50 LOC, retire le rouge import). Solution la plus rapide.
- (b) **Migrer** `@czo/app` et `@czo/stock-location` au pattern Effect-native (`ctx.runEffect` + `Layer.mergeAll` au boot). Aligne sur `@czo/auth` SP1+, mais sprint dédié.

**Recommandation :** (a) maintenant, (b) au prochain sprint feature touchant ces modules.

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

---

## Historique des items résolus

- **B0a. Tests legacy `@czo/auth`** — résolu SP-C, 6 deletes + 1 migrate, commit `635d7a81`.
- **B0b. `change-email` self flow** — résolu SP6 (plan en cours, commit pendant).
- **B0c. `delete-user` self flow** — résolu SP6 (plan en cours, commit pendant).
