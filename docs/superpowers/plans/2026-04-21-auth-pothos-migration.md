# Auth Pothos Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrer `@czo/auth` vers Pothos en consommant `@czo/kit` (déjà migré sur cette même branche). Livrer 8 services réécrits (Drizzle direct + better-auth wrappers), 6 sous-modules GraphQL Pothos, et remplacer l'import side-effect dans `plugins/index.ts` par `registerSchema(registerAuthSchema)`.

**Architecture:** Chaque sous-module GraphQL suit le template `types/inputs/queries/mutations/errors/index.ts`. Services factory-style prennent `(db, auth)` et retournent un objet avec méthodes. Writes Drizzle direct via `optimisticUpdate` + `notDeleted`, writes sensibles (sessions, password, 2FA, OAuth) via `auth.api.*` + `mapAPIError`.

**Tech Stack:** Pothos v4 avec les 6 plugins de kit, Drizzle RQBv2, better-auth (inchangé), vitest (unit + intégration Postgres), zod pour validation.

**Spec de référence:** `docs/superpowers/specs/2026-04-20-auth-pothos-migration-design.md` — contient les templates de code pour services, types, mutations. **Ce plan opère comme un step-by-step référençant le spec** : les code blocks exacts vivent dans le spec (§4, §5), le plan liste l'ordre d'exécution + commits.

**Prérequis:** kit migré (commits `7b04bb7..a958dbf` déjà sur cette branche). Le worktree est à `/workspace/c-zo/.worktrees/kit-pothos`, branche `feat/kit-pothos-migration`.

**Ordre de sortie:** auth en premier, stock-location ensuite (décision B du brainstorm).

---

## Phase 0 — Préservation `old/` du module auth

### Task 0.1: Créer `packages/modules/auth/old/` et déplacer/copier les fichiers

**Files:**
- Create: `packages/modules/auth/old/` (miroir)
- Move: fichiers à supprimer (listés dans spec §7.2)
- Copy: fichiers à modifier (pré-édition)

- [ ] **Step 1: Créer l'arborescence miroir**

```bash
cd /workspace/c-zo/.worktrees/kit-pothos
mkdir -p packages/modules/auth/old/src/graphql/{middleware,schema}
mkdir -p packages/modules/auth/old/src/services
mkdir -p packages/modules/auth/old/src/plugins
```

- [ ] **Step 2: Copier les fichiers à modifier (pré-édition) via `cp`**

```bash
cp packages/modules/auth/src/services/user.service.ts packages/modules/auth/old/src/services/user.service.ts
cp packages/modules/auth/src/services/organization.service.ts packages/modules/auth/old/src/services/organization.service.ts
cp packages/modules/auth/src/services/auth.service.ts packages/modules/auth/old/src/services/auth.service.ts
cp packages/modules/auth/src/services/apiKey.service.ts packages/modules/auth/old/src/services/apiKey.service.ts
cp packages/modules/auth/src/services/app.service.ts packages/modules/auth/old/src/services/app.service.ts
cp packages/modules/auth/src/services/user.service.test.ts packages/modules/auth/old/src/services/user.service.test.ts
cp packages/modules/auth/src/services/organization.service.test.ts packages/modules/auth/old/src/services/organization.service.test.ts
cp packages/modules/auth/src/services/auth.service.test.ts packages/modules/auth/old/src/services/auth.service.test.ts
cp packages/modules/auth/src/services/apiKey.service.test.ts packages/modules/auth/old/src/services/apiKey.service.test.ts
cp packages/modules/auth/src/services/app.service.test.ts packages/modules/auth/old/src/services/app.service.test.ts
cp packages/modules/auth/src/services/index.ts packages/modules/auth/old/src/services/index.ts
cp packages/modules/auth/src/plugins/index.ts packages/modules/auth/old/src/plugins/index.ts
cp packages/modules/auth/src/types.ts packages/modules/auth/old/src/types.ts
cp packages/modules/auth/src/graphql/context-factory.ts packages/modules/auth/old/src/graphql/context-factory.ts
cp packages/modules/auth/src/graphql/index.ts packages/modules/auth/old/src/graphql/index.ts
cp packages/modules/auth/package.json packages/modules/auth/old/package.json
```

- [ ] **Step 3: Déplacer les fichiers à supprimer via `git mv`**

```bash
git mv packages/modules/auth/src/graphql/middleware packages/modules/auth/old/src/graphql/middleware
git mv packages/modules/auth/src/graphql/resolvers.ts packages/modules/auth/old/src/graphql/resolvers.ts
git mv packages/modules/auth/src/graphql/typedefs.ts packages/modules/auth/old/src/graphql/typedefs.ts
git mv packages/modules/auth/src/graphql/schema.generated.graphqls packages/modules/auth/old/src/graphql/schema.generated.graphqls
git mv packages/modules/auth/src/graphql/directives.ts packages/modules/auth/old/src/graphql/directives.ts
git mv packages/modules/auth/src/graphql/__generated__ packages/modules/auth/old/src/graphql/__generated__
git mv packages/modules/auth/src/graphql/schema/base packages/modules/auth/old/src/graphql/schema/base
# Per sub-module schema.graphql + resolvers/ folder
for sub in user organization account api-key two-factor app; do
  git mv packages/modules/auth/src/graphql/schema/$sub/schema.graphql packages/modules/auth/old/src/graphql/schema/$sub-schema.graphql
  git mv packages/modules/auth/src/graphql/schema/$sub/resolvers packages/modules/auth/old/src/graphql/schema/$sub-resolvers
done
```

Si `codegen.ts` existe à la racine du module : `git mv packages/modules/auth/codegen.ts packages/modules/auth/old/codegen.ts`.

- [ ] **Step 4: Ajouter `old` à l'exclude tsconfig du module auth**

Edit `packages/modules/auth/tsconfig.json`, add `"old"` to the `exclude` array (create the array if missing).

- [ ] **Step 5: Vérifier que le typecheck ne tombe pas sur `old/`**

```bash
pnpm --filter @czo/auth check-types 2>&1 | head -20
```

Attendu : typecheck échoue toujours (car src/ référence encore l'ancienne API kit) **mais sans erreur sur old/**. Si des erreurs pointent vers `old/...`, ajuster le tsconfig.

- [ ] **Step 6: Commit**

```bash
git add -A packages/modules/auth
git commit -m "chore(auth): preserve pre-migration files in old/"
```

---

## Phase 1 — Services

### Task 1.1: `_internal/map-error.ts` — mapping APIError → GraphQL errors

**Files:**
- Create: `packages/modules/auth/src/services/_internal/map-error.ts`

- [ ] **Step 1: Écrire l'implémentation**

Copier le code du spec §4.2 dans `packages/modules/auth/src/services/_internal/map-error.ts`. Le module importe :

```ts
import { APIError } from 'better-auth'
import { ValidationError, NotFoundError, ConflictError, ForbiddenError, UnauthenticatedError } from '@czo/kit/graphql'
```

Signature : `export function mapAPIError(err: unknown, resource: string): never`.

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @czo/auth check-types 2>&1 | grep -E "map-error|services/_internal" | head -5
```

Attendu : pas d'erreur sur ce nouveau fichier (les erreurs pré-existantes ailleurs restent).

- [ ] **Step 3: Commit**

```bash
git add packages/modules/auth/src/services/_internal
git commit -m "feat(auth/services): add mapAPIError helper for better-auth integration"
```

### Task 1.2: `user.service.ts` — rewrite complet

**Files:**
- Rewrite: `packages/modules/auth/src/services/user.service.ts`

- [ ] **Step 1: Écrire le service**

Remplacer le contenu de `packages/modules/auth/src/services/user.service.ts` par le code du spec §4.3.

Exports attendus :
- `export interface CreateUserInput { ... }`
- `export interface BanUserInput { ... }`
- `export function createUserService(db: Database, auth: Auth)`
- `export type UserService = ReturnType<typeof createUserService>`

Méthodes : `find`, `exists`, `hasPermission`, `create`, `update`, `ban`, `unban`, `setRole`, `setPassword`, `remove`, `impersonate`, `stopImpersonating`, `listSessions` (déléguée à auth.api — optionnelle si toujours consommée), `revokeAllSessions`.

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @czo/auth check-types 2>&1 | grep "user.service.ts" | head -10
```

Attendu : pas d'erreurs dans `user.service.ts` lui-même (les erreurs restantes sont dans les resolvers qui sont encore dans leur ancien état — OK pour l'instant).

- [ ] **Step 3: Commit**

```bash
git add packages/modules/auth/src/services/user.service.ts
git commit -m "feat(auth/services): rewrite user.service on Drizzle + better-auth primitives"
```

### Task 1.3: `organization.service.ts` — rewrite

**Files:**
- Rewrite: `packages/modules/auth/src/services/organization.service.ts`

- [ ] **Step 1: Écrire le service**

Suivre le même pattern que user.service. Exports :
- `CreateOrganizationInput`, `UpdateOrganizationInput`, `InviteMemberInput` (types)
- `createOrganizationService(db, auth)` factory
- `OrganizationService` type

Méthodes CRUD sur `organizations`, `members`, `invitations` via Drizzle direct + events. **Préserver `hasPermission(orgId, ...)` à l'identique** — la méthode complexe (dynamicAccessControl, cacheOrgRoles, creatorRole bypass, multi-role) doit être copiée-collée depuis l'ancien `OrganizationRepository.hasPermission`, adaptée à la nouvelle forme (plus de `this.db` — utiliser `db` du closure).

Référence : spec §1 Contexte pour la complexité de `hasPermission`, §4.4 pour le pattern général.

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @czo/auth check-types 2>&1 | grep "organization.service.ts" | head -10
```

- [ ] **Step 3: Commit**

```bash
git add packages/modules/auth/src/services/organization.service.ts
git commit -m "feat(auth/services): rewrite organization.service on Drizzle + preserve hasPermission logic"
```

### Task 1.4: `account.service.ts` — nouveau

**Files:**
- Create: `packages/modules/auth/src/services/account.service.ts`

- [ ] **Step 1: Écrire le service**

Extraire du old/auth.service.ts :
- `account` Repository CRUD → méthodes Drizzle direct sur `accounts`
- changeEmail, changePassword, unlinkAccount → wrappers `auth.api.*` + `mapAPIError`

Factory `createAccountService(db, auth)` retournant :
- `find(id)`, `findByUser(userId)`, `listByUser(userId)` — Drizzle direct + `notDeleted`
- `changeEmail(input, headers)` — wrap `auth.api.changeEmail` + mapAPIError
- `changePassword(input, headers)` — wrap `auth.api.changePassword` + mapAPIError
- `unlinkAccount(accountId, headers)` — wrap `auth.api.unlinkAccount` + mapAPIError
- `updateProfile(userId, version, input)` — `optimisticUpdate` sur `users`
- `deleteAccount(userId, headers)` — wrap `auth.api.deleteUser` + cascade

- [ ] **Step 2: Ajouter l'export dans `services/index.ts`** (temporaire — réorganisé en Task 1.9)

- [ ] **Step 3: Commit**

```bash
git add packages/modules/auth/src/services/account.service.ts packages/modules/auth/src/services/index.ts
git commit -m "feat(auth/services): add account.service for profile + credential flows"
```

### Task 1.5: `session.service.ts` — nouveau

**Files:**
- Create: `packages/modules/auth/src/services/session.service.ts`

- [ ] **Step 1: Écrire le service**

Factory `createSessionService(db, auth)` :
- **Reads Drizzle direct** : `find(id)`, `listByUser(userId)`, `listActive(userId)` avec `notDeleted`
- **Writes via better-auth** : `revoke(sessionToken, headers)` → `auth.api.revokeUserSession`, `revokeAll(userId, headers)` → `auth.api.revokeUserSessions`

Pas de `create/update/delete` exposés — better-auth les gère en cascade via signIn, ban, etc.

- [ ] **Step 2: Commit**

```bash
git add packages/modules/auth/src/services/session.service.ts
git commit -m "feat(auth/services): add session.service — reads Drizzle, writes via better-auth"
```

### Task 1.6: `twoFactor.service.ts` — nouveau

**Files:**
- Create: `packages/modules/auth/src/services/twoFactor.service.ts`

- [ ] **Step 1: Écrire le service**

Factory `createTwoFactorService(auth)` — tout en wrappers `auth.api.*` + `mapAPIError`. Aucune interaction Drizzle (les tables 2FA sont gérées par better-auth entièrement) :

- `enable(input, headers)` → `auth.api.enableTwoFactor`
- `disable(input, headers)` → `auth.api.disableTwoFactor`
- `verifyTotp(code, headers)` → `auth.api.verifyTOTP`
- `verifyOtp(code, headers)` → `auth.api.verifyOTP`
- `sendOtp(method, headers)` → `auth.api.sendVerificationOTP`
- `verifyBackupCode(code, headers)` → `auth.api.verifyBackupCode`
- `generateBackupCodes(headers)` → `auth.api.generateBackupCodes`
- `getTotpUri(headers)` → `auth.api.getTotpUri`

- [ ] **Step 2: Commit**

```bash
git add packages/modules/auth/src/services/twoFactor.service.ts
git commit -m "feat(auth/services): add twoFactor.service — better-auth wrappers"
```

### Task 1.7: `apiKey.service.ts` — adapter (léger refactor)

**Files:**
- Rewrite: `packages/modules/auth/src/services/apiKey.service.ts`

- [ ] **Step 1: Adapter le service existant**

Le service actuel wrap déjà `auth.api.*` (cf. spec §1). Adapter pour :
- Utiliser `mapAPIError` au lieu du `new Error(...)` actuel
- Factory `createApiKeyService(auth)` (pas de `db` en argument — purement better-auth)

Méthodes : `create`, `delete`, `update`, `get`, `list`, `verify`.

- [ ] **Step 2: Commit**

```bash
git add packages/modules/auth/src/services/apiKey.service.ts
git commit -m "refactor(auth/services): adapt apiKey.service to mapAPIError pattern"
```

### Task 1.8: `app.service.ts` — rewrite complet

**Files:**
- Rewrite: `packages/modules/auth/src/services/app.service.ts`

- [ ] **Step 1: Écrire le service**

Factory `createAppService(db, subscribableEvents?)` — **100% Drizzle direct, aucun better-auth**.

Méthodes :
- `find(id)`, `findBySlug(slug)`, `findByAppId(appId)`, `list()` — reads avec `notDeleted`
- `install(input)` — insert dans `apps` + publish event
- `uninstall(id, version)` — `optimisticUpdate` avec `deletedAt` + publish event (AND delete related apikeys?)
- `updateManifest(id, version, manifest)` — `optimisticUpdate` + publish event + **validate manifest against subscribableEvents** (préserver la logique existante)
- `setStatus(id, version, status)` — `optimisticUpdate` + publish event

Events : préserver le pattern `publishAppEvent` existant (si existe) — sinon adapter selon `listeners/app-consumer`.

- [ ] **Step 2: Commit**

```bash
git add packages/modules/auth/src/services/app.service.ts
git commit -m "feat(auth/services): rewrite app.service on Drizzle direct + events"
```

### Task 1.9: `auth.service.ts` — réduction + `services/index.ts` final

**Files:**
- Rewrite: `packages/modules/auth/src/services/auth.service.ts`
- Rewrite: `packages/modules/auth/src/services/index.ts`

- [ ] **Step 1: Réduire `auth.service.ts`**

Nouveau contenu (cf. spec §5.7 + §3.3) : factory `createAuthService(db, auth, userService, organizationService)` qui expose uniquement :
- `hasPermission(opts)` — dispatcher user/org selon `opts.ctx.organizationId` (logique existante préservée)
- `getSession(headers)` — wrap `auth.api.getSession`
- `accessControl` — getter vers `auth.options.ac`
- `roles` — getter vers `auth.options.roles`

Plus d'`account` ni `session` — déplacés vers `account.service`/`session.service` en Tasks 1.4/1.5.

- [ ] **Step 2: Mettre à jour `services/index.ts`**

```ts
export * from './user.service'
export * from './organization.service'
export * from './account.service'
export * from './session.service'
export * from './twoFactor.service'
export * from './apiKey.service'
export * from './app.service'
export * from './auth.service'
```

- [ ] **Step 3: Typecheck (attendu échouer — resolvers pas encore migrés)**

```bash
pnpm --filter @czo/auth check-types 2>&1 | grep -E "service\.ts" | head -10
```

Les erreurs doivent disparaître sur les 8 fichiers services. Les erreurs subsistent sur `graphql/schema/*/resolvers/*` — c'est Phases 2-3.

- [ ] **Step 4: Commit**

```bash
git add packages/modules/auth/src/services
git commit -m "refactor(auth/services): shrink auth.service to primitives, update index exports"
```

---

## Phase 2 — GraphQL types + inputs + errors (6 sous-modules)

### Task 2.1: `graphql/schema/user/` — types + inputs + errors

**Files:**
- Create: `packages/modules/auth/src/graphql/schema/user/types.ts`
- Create: `packages/modules/auth/src/graphql/schema/user/inputs.ts`
- Create: `packages/modules/auth/src/graphql/schema/user/errors.ts`

- [ ] **Step 1: Créer `errors.ts`**

Classes domain-specific (spec §5.5) : `CannotBanSelfError`, `CannotDemoteSelfError`, `UserAlreadyBannedError` + `registerUserErrors(builder)` qui les enregistre avec l'interface `Error` de kit.

- [ ] **Step 2: Créer `types.ts`**

`registerUserTypes(builder)` utilisant `builder.drizzleNode('users', {...})`. Template spec §5.3. Exposer : email, name, emailVerified, role, banned, banReason, banExpires, createdAt, updatedAt, version. Relations : `sessions` (relatedConnection), `accounts` (relation). Computed : `activeSessionCount` (SQL extras).

- [ ] **Step 3: Créer `inputs.ts`**

Zod schemas + `registerUserInputs(builder)` — CreateUserInput, UpdateUserInput, BanUserInput, SetRoleInput, UsersFilterInput, UserOrderByInput.

- [ ] **Step 4: Commit**

```bash
git add packages/modules/auth/src/graphql/schema/user/types.ts packages/modules/auth/src/graphql/schema/user/inputs.ts packages/modules/auth/src/graphql/schema/user/errors.ts
git commit -m "feat(auth/graphql/user): add Pothos types, inputs, and domain-specific errors"
```

### Task 2.2 — 2.6: Mêmes 3 fichiers pour `organization`, `account`, `api-key`, `two-factor`, `app`

Pour chaque sous-module, suivre exactement le même pattern que Task 2.1 :

- [ ] **Task 2.2**: `graphql/schema/organization/{types,inputs,errors}.ts` — types `Organization`, `Member`, `Invitation` (drizzleNode). Errors : `CannotLeaveAsLastOwnerError`, `InvitationExpiredError`, `MembershipAlreadyExistsError`, `SlugAlreadyTakenError`. Inputs : CreateOrganizationInput, UpdateOrganizationInput, InviteMemberInput, UpdateMemberRoleInput.
  
  Commit: `feat(auth/graphql/organization): add Pothos types, inputs, and errors`

- [ ] **Task 2.3**: `graphql/schema/account/{types,inputs,errors}.ts` — types `Account`, `Session` (potentiellement partagé avec user). Errors : `PasswordMismatchError`, `AccountAlreadyLinkedError`, `CannotUnlinkLastAccountError`. Inputs : ChangeEmailInput, ChangePasswordInput, UpdateProfileInput.
  
  Commit: `feat(auth/graphql/account): add Pothos types, inputs, and errors`

- [ ] **Task 2.4**: `graphql/schema/api-key/{types,inputs,errors}.ts` — type `ApiKey`. Errors : `ApiKeyExpiredError`, `ApiKeyRevokedError`. Inputs : CreateApiKeyInput, UpdateApiKeyInput.
  
  Commit: `feat(auth/graphql/api-key): add Pothos types, inputs, and errors`

- [ ] **Task 2.5**: `graphql/schema/two-factor/{types,inputs,errors}.ts` — pas de drizzleNode (les tables 2FA ne sont pas exposées directement). Errors : `TotpVerificationFailedError`, `BackupCodeInvalidError`, `TwoFactorNotEnabledError`. Inputs : EnableTwoFactorInput, VerifyTotpInput, VerifyOtpInput, VerifyBackupCodeInput.
  
  Commit: `feat(auth/graphql/two-factor): add Pothos inputs and errors`

- [ ] **Task 2.6**: `graphql/schema/app/{types,inputs,errors}.ts` — types `App`, `AppManifest`, `AppOrderField` (enum). Errors : `AppHandleTakenError`, `AppManifestInvalidError`, `AppNotInstalledError`. Inputs : InstallAppInput, UpdateAppManifestInput, SetAppStatusInput.
  
  Commit: `feat(auth/graphql/app): add Pothos types, inputs, and errors`

---

## Phase 3 — GraphQL queries + mutations (6 sous-modules)

### Task 3.1: `graphql/schema/user/queries.ts` + `mutations.ts`

**Files:**
- Create: `packages/modules/auth/src/graphql/schema/user/queries.ts`
- Create: `packages/modules/auth/src/graphql/schema/user/mutations.ts`
- Create: `packages/modules/auth/src/graphql/schema/user/index.ts`

- [ ] **Step 1: `queries.ts`** — `user(id)`, `users(connection, search, role, orderBy)`, `userSessions(userId)`. Use `drizzleField` / `drizzleConnection` + `withNotDeleted()` helper from kit.

- [ ] **Step 2: `mutations.ts`** — 11 mutations (createUser, updateUser, banUser, unbanUser, setRole, setUserPassword, removeUser, impersonateUser, stopImpersonation, revokeSession, revokeSessions). Each with `errors.types`, `authScopes: { permission: { ... } }`, zod validation. Template : spec §5.4.

- [ ] **Step 3: `index.ts`** — orchestration :

```ts
import type { SchemaBuilder } from '@czo/kit/graphql'
import { registerUserErrors } from './errors'
import { registerUserTypes } from './types'
import { registerUserInputs } from './inputs'
import { registerUserQueries } from './queries'
import { registerUserMutations } from './mutations'

export function registerUserSchema(builder: SchemaBuilder) {
  registerUserErrors(builder)
  registerUserTypes(builder)
  registerUserInputs(builder)
  registerUserQueries(builder)
  registerUserMutations(builder)
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/modules/auth/src/graphql/schema/user
git commit -m "feat(auth/graphql/user): add Pothos queries, mutations, and sub-module index"
```

### Task 3.2 — 3.6: Queries + mutations + index pour les 5 autres sous-modules

Suivre exactement le pattern de Task 3.1.

- [ ] **Task 3.2**: `organization/` — 9 queries + 11 mutations. Commit: `feat(auth/graphql/organization): add queries, mutations, index`
- [ ] **Task 3.3**: `account/` — 4 queries + 7 mutations. Commit: `feat(auth/graphql/account): add queries, mutations, index`
- [ ] **Task 3.4**: `api-key/` — 2 queries + 3 mutations. Commit: `feat(auth/graphql/api-key): add queries, mutations, index`
- [ ] **Task 3.5**: `two-factor/` — 1 query (totpUri) + 7 mutations. Commit: `feat(auth/graphql/two-factor): add queries, mutations, index`
- [ ] **Task 3.6**: `app/` — 3 queries + 4 mutations. Commit: `feat(auth/graphql/app): add queries, mutations, index`

---

## Phase 4 — Orchestration + wiring

### Task 4.1: `graphql/schema/index.ts` — `registerAuthSchema`

**Files:**
- Create: `packages/modules/auth/src/graphql/schema/index.ts`

- [ ] **Step 1: Écrire l'orchestration**

Spec §5.7 :
```ts
import type { SchemaBuilder } from '@czo/kit/graphql'
import { registerUserSchema } from './user'
// ... 5 other sub-modules

export function registerAuthSchema(builder: SchemaBuilder) {
  registerUserSchema(builder)
  registerOrganizationSchema(builder)
  registerAccountSchema(builder)
  registerApiKeySchema(builder)
  registerTwoFactorSchema(builder)
  registerAppSchema(builder)
}
```

Exporter aussi un type alias : `export type AuthBuilder = SchemaBuilder<AuthDb, AuthRelations, GraphQLContext>` (phantom generics, aligné sur kit).

- [ ] **Step 2: Mettre à jour `graphql/index.ts`** pour re-exporter `registerAuthSchema`.

- [ ] **Step 3: Commit**

```bash
git add packages/modules/auth/src/graphql/schema/index.ts packages/modules/auth/src/graphql/index.ts
git commit -m "feat(auth/graphql): add registerAuthSchema orchestration"
```

### Task 4.2: `graphql/context-factory.ts` — new `buildAuthContext`

**Files:**
- Rewrite: `packages/modules/auth/src/graphql/context-factory.ts`

- [ ] **Step 1: Réécrire selon spec §5.2**

Fonction `buildAuthContext(request)` qui résout les 8 services via `useContainer().make(...)` + `authService.getSession(request.headers)`. Retourne un `AuthContext` conforme à `types.ts`.

- [ ] **Step 2: Commit**

```bash
git add packages/modules/auth/src/graphql/context-factory.ts
git commit -m "refactor(auth/graphql): rewrite buildAuthContext for new service shape"
```

### Task 4.3: `types.ts` — nouveau `AuthContext`

**Files:**
- Rewrite: `packages/modules/auth/src/types.ts`

- [ ] **Step 1: Réécrire selon spec §5.1**

Interface `AuthContext` avec les 8 services + `session` + `user`. Retirer les types dérivés de Repository.

- [ ] **Step 2: Commit**

```bash
git add packages/modules/auth/src/types.ts
git commit -m "refactor(auth): new AuthContext shape with 8 services"
```

### Task 4.4: `plugins/index.ts` — wiring IoC + `registerSchema`

**Files:**
- Rewrite: `packages/modules/auth/src/plugins/index.ts`

- [ ] **Step 1: Mettre à jour le hook `czo:boot`**

Dans le hook `czo:boot` existant :
1. Créer les 8 services avec leurs factories
2. Les bind au container : `auth:users`, `auth:organizations`, `auth:accounts`, `auth:sessions`, `auth:twoFactor`, `auth:apikeys`, `auth:apps`, `auth:service`
3. Remplacer `await import('@czo/auth/graphql')` par `registerSchema(registerAuthSchema)` (import depuis `@czo/kit/graphql`)
4. Retirer le `registerNodeResolver('App', ...)` — plugin-drizzle gère la résolution Node automatiquement

Template : spec §5.8.

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @czo/auth check-types 2>&1 | head -20
```

À ce stade, typecheck du module doit être **propre** (ou très proche). S'il y a des erreurs résiduelles, les lister.

- [ ] **Step 3: Commit**

```bash
git add packages/modules/auth/src/plugins/index.ts
git commit -m "refactor(auth/plugins): wire 8 services + registerSchema(registerAuthSchema)"
```

### Task 4.5: `package.json` — cleanup codegen deps

**Files:**
- Modify: `packages/modules/auth/package.json`

- [ ] **Step 1: Retirer les deps obsolètes**

Retirer (si présentes) : `@graphql-codegen/*`, `@eddeee888/gcg-typescript-resolver-files`, `graphql-middleware`, `@envelop/graphql-middleware`.

Retirer le script `generate` (GraphQL codegen).

- [ ] **Step 2: `pnpm install`**

- [ ] **Step 3: Commit**

```bash
git add packages/modules/auth/package.json pnpm-lock.yaml
git commit -m "chore(auth): drop codegen + graphql-middleware deps"
```

---

## Phase 5 — Tests

**Stratégie** : réécrire les 5 fichiers `*.service.test.ts` (old versions préservées dans old/). Pattern : mix unit + intégration par la matrice spec §6.1.

### Task 5.1: `services/user.service.test.ts`

**Files:**
- Rewrite: `packages/modules/auth/src/services/user.service.test.ts`

- [ ] **Step 1: Réécrire de zéro**

Pattern TDD avec vitest :
- **Unit** (mock better-auth via `vi.fn()`) : `find`, `exists`, `hasPermission`, wrappers `impersonate/stopImpersonating`
- **Intégration** (DB réelle via `@czo/kit/testing`) : `create`, `update`, `ban` (transaction + cascade), `unban`, `setRole`, `setPassword`, `remove`

Utiliser `TEST_DATABASE_URL` env var.

Note : Les migrations DB du module auth doivent être appliquées sur le test DB AVANT de lancer les tests. Ajouter si besoin un `beforeAll` qui exécute `pnpm migrate:latest` ou équivalent. Alternative : créer les tables ad-hoc en début de test suite (moins propre mais rapide à mettre en place).

- [ ] **Step 2: Lancer les tests**

```bash
export TEST_DATABASE_URL='...'
pnpm --filter @czo/auth test src/services/user.service.test.ts 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add packages/modules/auth/src/services/user.service.test.ts
git commit -m "test(auth/services): rewrite user.service tests for new API"
```

### Task 5.2 — 5.5: Tests services pour `organization`, `account`, `apiKey`, `app`

Même pattern que 5.1.

- [ ] **Task 5.2**: `organization.service.test.ts` — inclure tests spécifiques pour `hasPermission` (4 chemins : static-only, static+dynamic, cache hit, creator bypass). Commit: `test(auth/services): rewrite organization.service tests including hasPermission paths`
- [ ] **Task 5.3**: `account.service.test.ts` — mocks better-auth pour changeEmail/changePassword. Commit: `test(auth/services): rewrite account.service tests`
- [ ] **Task 5.4**: `apiKey.service.test.ts` — unit only (100% better-auth wrap). Commit: `test(auth/services): rewrite apiKey.service tests`
- [ ] **Task 5.5**: `app.service.test.ts` — intégration DB pour installApp, updateManifest, etc. Commit: `test(auth/services): rewrite app.service tests`

### Task 5.6: `services/auth.service.test.ts`

**Files:**
- Rewrite: `packages/modules/auth/src/services/auth.service.test.ts`

- [ ] **Step 1: Réécrire les tests**

- Unit : `hasPermission` dispatcher (mocks userService + organizationService)
- Unit : `getSession` (mock auth.api.getSession)
- Unit : `accessControl` et `roles` getters

- [ ] **Step 2: Commit**

```bash
git add packages/modules/auth/src/services/auth.service.test.ts
git commit -m "test(auth/services): rewrite auth.service tests for reduced primitives"
```

### Task 5.7: `services/session.service.test.ts` + `services/twoFactor.service.test.ts` — new files

**Files:**
- Create: `packages/modules/auth/src/services/session.service.test.ts`
- Create: `packages/modules/auth/src/services/twoFactor.service.test.ts`

- [ ] **Step 1: Écrire les tests**

- `session.service.test.ts` : intégration reads (`find`, `listByUser`, `listActive`) + unit writes (`revoke`, `revokeAll` mock better-auth)
- `twoFactor.service.test.ts` : unit only (100% better-auth wrap) — 8 méthodes

- [ ] **Step 2: Commit**

```bash
git add packages/modules/auth/src/services/session.service.test.ts packages/modules/auth/src/services/twoFactor.service.test.ts
git commit -m "test(auth/services): add session.service + twoFactor.service tests"
```

### Task 5.8: Tests GraphQL — queries + mutations intégration

**Files:**
- Create: `packages/modules/auth/src/graphql/schema/<sub>/queries.test.ts` (×6)
- Create: `packages/modules/auth/src/graphql/schema/<sub>/mutations.test.ts` (×6)

Note : ces tests sont nombreux mais uniformes (chaque sub-module suit le même pattern). Les écrire en batch via sous-agent avec une référence à la matrice spec §6.1.

- [ ] **Step 1: Pattern de test mutation**

Template (reprendre de stock-location spec §5.2) :
- Setup : `registerSchema(registerAuthSchema)` + `initBuilder` + `buildSchema`
- Test : `graphql(schema, source, contextValue: mockContext({ permissions }))`
- Assertions sur `result.data.mutation.__typename` + variants

- [ ] **Step 2: Helper `mockContext`** — créer `packages/modules/auth/src/graphql/__testing/mock-context.ts` pour construction réutilisable du GraphQLContext.

- [ ] **Step 3: Écrire les 12 fichiers de tests**

Priorité : 
1. `user/mutations.test.ts` — couvrir banUser (self-ban blocked), createUser (conflict), setRole (permission)
2. `organization/mutations.test.ts` — createOrg, inviteMember, updateMemberRole (hasPermission with orgId)
3. `user/queries.test.ts` — users connection avec filtres
4. Les 9 autres selon disponibilité.

- [ ] **Step 4: Commit par sous-module** (6 commits de tests queries + 6 commits de tests mutations = 12 commits) OR groupé en 2 commits bulk : `test(auth/graphql): add queries tests for all sub-modules` + `test(auth/graphql): add mutations tests for all sub-modules`.

Préférer le groupage pour ce plan — sinon explosion du nombre de commits.

---

## Phase 6 — Validation

### Task 6.1: `pnpm --filter @czo/auth build`

- [ ] **Step 1: Lancer le build** — fix ce qui apparaît.
- [ ] **Step 2: Commit (si fixes)** : `fix(auth): resolve build errors after Pothos migration`

### Task 6.2: `pnpm --filter @czo/auth check-types`

- [ ] **Step 1: Lancer le typecheck** — doit être clean.
- [ ] **Step 2: Commit (si fixes)** : `fix(auth): resolve typecheck errors`

### Task 6.3: `pnpm --filter @czo/auth lint` (+ `lint:fix`)

- [ ] **Step 1: Lancer le lint** — autofix via `pnpm --filter @czo/auth lint:fix`.
- [ ] **Step 2: Fixes manuels résiduels**
- [ ] **Step 3: Commit** : `chore(auth): apply lint auto-fixes`

### Task 6.4: `pnpm --filter @czo/auth test` — suite complète

- [ ] **Step 1: `export TEST_DATABASE_URL=...`**
- [ ] **Step 2: Lancer tous les tests**

```bash
pnpm --filter @czo/auth test 2>&1 | tail -30
```

Compter les tests green. Cible : tous les nouveaux tests passent. Pré-existants non liés peuvent rester rouges.

- [ ] **Step 3: Document les résultats** dans le commit message si fixes nécessaires.

### Task 6.5: Validation globale workspace

- [ ] **Step 1: `pnpm check-types`** (root — tous les modules)

À ce stade, **kit + auth** sont propres. `stock-location` reste rouge (son propre plan à venir). Documenter les erreurs `stock-location` comme attendues.

---

## Phase 7 — Cleanup `old/`

### Task 7.1: Vérifier que `src/` n'importe rien depuis `old/`

- [ ] **Step 1: Grep**

```bash
grep -rn "from.*['\"].*auth/old" packages/modules/auth/src 2>/dev/null
grep -rn "from.*['\"]\.\./\.\./old" packages/modules/auth/src 2>/dev/null
```

Attendu : aucun résultat.

### Task 7.2: Supprimer `packages/modules/auth/old/`

- [ ] **Step 1: `rm -rf packages/modules/auth/old`**

- [ ] **Step 2: Re-validation** — build + test + typecheck passent.

- [ ] **Step 3: Commit**

```bash
git add -A packages/modules/auth
git commit -m "chore(auth): cleanup old/ after successful migration"
```

---

## Récapitulatif commits estimés

~40-50 commits sur `feat/kit-pothos-migration` (en plus des 24+ commits kit existants). Ventilation :

- Phase 0 : 1 commit
- Phase 1 : 9 commits (1 helper + 8 services)
- Phase 2 : 6 commits (types/inputs/errors par sous-module)
- Phase 3 : 6 commits (queries/mutations par sous-module)
- Phase 4 : 5 commits (schema index + context-factory + types + plugins + package.json)
- Phase 5 : 8 commits (5 services tests + 2 new services tests + 1 grouped graphql tests)
- Phase 6 : 0-3 commits (fixes si nécessaires)
- Phase 7 : 1 commit (cleanup old/)

Total : **~36 nouveaux commits auth** + le reste déjà là (kit).

---

## Points de vigilance (reprise du spec)

- **`hasPermission` dispatcher** user/org — migration 1:1, zéro refactor, tests dédiés (cf. spec §8)
- **`organizationService.hasPermission`** complexe (dynamicAccessControl, cacheOrgRoles, creatorRole bypass) — copier-coller depuis l'ancien `OrganizationRepository.hasPermission`
- **`ctx.auth.user!.id` string vs `users.id` number** — convention `Number(ctx.auth.user!.id)` partout
- **Events** — publier **dans les services**, plus dans les resolvers (supprimer les `publishAuthEvent` des resolvers Mutation existants)
- **`TEST_DATABASE_URL`** — requis pour les intégrations services (user, organization, app). Exporter dans le shell du subagent.
- **Tests e2e via graphql()** — helper `mockContext` à écrire en utility, réutilisé par les 12 fichiers de tests GraphQL.
- **better-auth API** — vérifier la signature de chaque méthode appelée (`auth.api.createUser`, `auth.api.banUser`, etc.) — si l'API a changé par rapport à ce qui était commenté dans old/, adapter.
