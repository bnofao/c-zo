# SP3 — API Keys: native finalization — Design Spec

**Status:** Brainstormed, awaiting plan
**Date:** 2026-05-23
**Branch target:** `feat/sp1-auth` (continues the SP1 / SP-B / SP-A / SP2 sequence)

## Goal

Câbler les mutations/queries GraphQL `api-key` au `ApiKeyService` natif (Effect-TS, déjà construit) et éliminer la dépendance à better-auth pour les API keys. Pas de nouvelles features dans SP3 — features comme rotation, audit-log, last-used-at sont reportées à un sprint ultérieur.

## Background

L'état au début de SP3 :

- `packages/modules/auth/src/services/api-key.ts` est **Effect-native** (Tag, 11 erreurs taguées, helpers `KeyGenerator` / `KeyHasher`, 7 méthodes : `findFirst` / `findMany` / `create` / `update` / `validate` / `verify` / `remove`). ~550 lignes.
- Les mutations/queries GraphQL `api-key` **n'utilisent PAS** ce service — elles passent par `ctx.auth.apiKeyService`, qui est l'instance better-auth alimentée par `layers/better-auth/apikey.ts`.
- 4 imports de better-auth subsistent dans `services/api-key.ts` :
  - `defaultKeyHasher` (`@better-auth/api-key`)
  - `generateRandomString` (`better-auth/crypto`)
  - `Awaitable` (`better-auth`)
  - `role` (`better-auth/plugins`)
- `AccessService` (`services/access.ts`) reste better-auth-couplé via `createAccessControl` — c'est le substrat d'un sprint AC dédié plus tard, **hors scope SP3**.

## Architecture & scope

### Livrables SP3

1. Toutes les mutations/queries `api-key` passent par `ctx.runEffect(Effect.gen(... yield* ApiKeyService))`.
2. Mutations en pattern **Relay** (`builder.relayMutationField`) avec **authScope polymorphe en forme fonction** dispatchant sur le type d'owner (`USER` / `ORGANIZATION`).
3. `layers/better-auth/apikey.ts` supprimé ; sa wiring dans `layers/better-auth/index.ts` retirée ; `apiKeyService` retiré de `AuthContext`.
4. Les 4 imports better-auth dans `services/api-key.ts` remplacés :
   - `defaultKeyHasher` → `sha256Hex` (`./utils/crypto`)
   - `generateRandomString` → `randomString` (`./utils/crypto`)
   - `Awaitable` → alias local `T | Promise<T>`
   - `role(granted).authorize(req)` → nouvelle méthode `AccessService.authorize(granted, required, connector?)`
5. Nouvelle suite d'intégration `services/api-key.integration.test.ts` (pattern SP1 : `@effect/vitest` + Testcontainers) couvrant les flows reciblés. L'ancien `services/api-key.test.ts` reste cassé (legacy `@czo/kit/effect`), laissé out of scope.

### Hors scope SP3 (reportés)

- Rotation de clé, permissions attachées à la clé (au-delà du grant existant), last-used-at tracking, soft-delete + audit log.
- Fork complet de `createAccessControl` (sprint AC dédié).
- Restauration de `@czo/kit/effect` (dette tech transversale).
- Faille org-scoping résiduelle de `cancelInvitation` (SP2).
- User account flows / 2FA (sprints ultérieurs).

### Anti-objectifs

- Pas d'ajout de feature client-visible. SP3 ne change pas ce qu'un client peut faire — seulement par où ça passe et comment c'est autorisé.
- Pas de breaking change schema GraphQL non lié à la migration. (La conversion à Relay + le shape polymorphe SONT des breaking changes acceptés — c'est le périmètre.)

## Authorization model — polymorphe à deux acteurs

### Discriminateur

```graphql
enum ApiKeyOwnerType {
  USER
  ORGANIZATION
}

input ApiKeyOwnerInput {
  type: ApiKeyOwnerType!
  id: ID!
}
```

Deux acteurs aujourd'hui : USER, ORGANIZATION. Les "apps" comme acteur indépendant ne sont pas modélisées — une apikey d'app sera attribuée à l'utilisateur ou à l'organisation qui possède l'app. Le shape polymorphe se prête à un 3ᵉ acteur futur sans casser l'API (une branche de dispatch à ajouter).

### Dispatch table

| Op | authScope | Validation resolver |
|---|---|---|
| `createApiKey({ owner, ...fields })` | `USER` → `{ auth: true }` ; `ORGANIZATION` → `permission(api-key:create, organization: owner.id)` | si `USER`, assert `owner.id === ctx.auth.user.id` |
| `updateApiKey({ id, ...patch })` | **authScope async pre-fetch** : `findFirst({ where: { id } })` → dispatch sur `key.referenceType` ; `'user'` → `{ auth: true }` + assert ownership dans le resolver ; `'organization'` → `permission(api-key:update, organization: key.referenceId)` | resolver re-fetch (idempotent) + assertion finale |
| `removeApiKey({ id })` | idem update, action `delete` | idem |
| `apiKey({ id })` | `{ auth: true }` | resolver verifies ownership-OR-membership |
| `myApiKeys` | `{ auth: true }` | resolver filtre `userId = caller && referenceType = 'user'` |
| `organizationApiKeys({ organizationId })` | `permission(api-key:read, organization)` | resolver filtre `referenceId = orgId && referenceType = 'organization'` |

`organizationApiKeys` est inclus dans SP3 (symétrie avec `myApiKeys` ; un client a besoin de lister les clés d'org sans bricoler le filtre).

### Justification

- **CREATE** : le caller déclare son intention. Le discriminateur `owner` étant **requis** (pas optionnel), il n'y a pas de downgrade silencieux d'intention.
- **UPDATE/REMOVE** : la clé est la source de vérité pour sa portée ; le caller fournit juste l'`id`. L'authScope fait un pre-fetch (lookup PK indexé) pour appliquer la bonne politique. Pattern symétrique à Task 6 SP2 (lookup membership dans le scope).
- **Risque résiduel d'un user pas membre de l'org cible** : le `permission(api-key:*, organization)` scope vérifie déjà membership + permission (Task 6). Donc fermé.
- **Cas USER scope** : `auth: true` ne suffit pas seul à autoriser une mutation sur la clé d'un autre user. Le resolver assert `key.referenceId === ctx.auth.user.id`. C'est analogue au pattern `acceptInvitation` (scope = "logged in", domaine vérifié dans le resolver).

## Components & files

### Modified

- **`packages/modules/auth/src/services/api-key.ts`**
  - Remplacer les 4 imports better-auth.
  - Injecter `AccessService` dans `make` (`const access = yield* AccessService`).
  - Au site d'usage de `role(granted).authorize(opts.permissions)` (ligne ~329), remplacer par `yield* access.authorize(granted, opts.permissions)`.

- **`packages/modules/auth/src/services/access.ts`**
  - Ajouter `authorize(granted, required, connector?)` au contrat `AccessService` et à `makeLayer`. Implémentation : set-inclusion AND/OR forké littéralement de `role().authorize()` de better-auth (MIT — fork documenté en JSDoc). `createAccessControl` reste inchangé (out of scope).

- **`packages/modules/auth/src/graphql/schema/api-key/mutations.ts`** — réécriture complète des 3 mutations en `relayMutationField` polymorphe.
  - `createApiKey` : inputFields incluant `owner: ApiKeyOwnerInput!`, authScope dispatch sur `args.input.owner.type`, outputFields `{ apiKey, plain }`.
  - `updateApiKey` : inputFields `{ id, ...patch }`, authScope async pre-fetch + dispatch, outputFields `{ apiKey }`.
  - `removeApiKey` : inputFields `{ id }`, authScope async pre-fetch + dispatch, outputFields `{ success }`.
  - Renommage de `deleteApiKey` (nom courant) → `removeApiKey` pour aligner sur le service.

- **`packages/modules/auth/src/graphql/schema/api-key/queries.ts`**
  - Renommer `authScopes: { loggedIn: true }` (clé inexistante dans `BuilderAuthScopes`) → `authScopes: { auth: true }`.
  - `apiKey(id)` : ajouter guard `ownership-OR-membership` côté resolver.
  - `myApiKeys` : OK tel quel, juste authScope renommé.
  - Ajouter `organizationApiKeys({ organizationId })` avec authScope `permission(api-key:read, organization)`.

- **`packages/modules/auth/src/graphql/schema/api-key/inputs.ts`**
  - Ajouter l'enum `ApiKeyOwnerType` + l'input `ApiKeyOwnerInput` (réutilisable par `createApiKey` et `organizationApiKeys`).
  - Supprimer `CreateApiKeyInput` / `UpdateApiKeyInput` — remplacés par les `inputFields` inline du `relayMutationField` (cohérent avec le pattern des autres mutations org).

- **`packages/modules/auth/src/graphql/schema/api-key/types.ts`**
  - Exposer `referenceType` et `referenceId` sur le type GraphQL `ApiKey` pour que le client puisse afficher la portée.

- **`packages/modules/auth/src/layers/better-auth/index.ts`**
  - Retirer l'import et la wiring de `apiKeyConfig` / `apiKeyHooks` (de `./apikey`).

- **`packages/modules/auth/src/types.ts`** (legacy `AuthContext` avec `session/user: any`)
  - Retirer la propriété `apiKeyService` si présente (ce contexte est progressivement remplacé par `graphql/index.ts`'s `AuthContext`).

- **`packages/modules/auth/src/graphql/index.ts`** (GraphQL `AuthContext` — celui réellement utilisé par les resolvers via `ctx.auth?.user`)
  - Pas d'ajout — il ne référence pas `apiKeyService` et n'a pas à le faire.

- **`packages/modules/auth/src/module.ts`** — point critique
  - **À vérifier au début de SP3 :** `ApiKeyService.layer` (exporté à `services/api-key.ts:554`) **n'est apparemment pas câblé** au runtime via `registerEffectLayer` (grep `registerEffectLayer.*ApiKey` → 0 match). Si confirmé, il faut l'ajouter au hook `czo:boot` du module — sinon `yield* ApiKeyService` dans `ctx.runEffect` échouera à la résolution.

### Removed

- **`packages/modules/auth/src/layers/better-auth/apikey.ts`**

### New

- **`packages/modules/auth/src/services/utils/crypto.ts`** :
  ```ts
  /**
   * Crypto primitives for the auth module.
   *
   * RUNTIME ASSUMPTION: Node ≥18 (`node:crypto`). All Node-specific calls live
   * in this file alone — a runtime change (Bun, Deno, Workers, edge) only
   * requires swapping the bodies here for Web Crypto / @oslojs / etc.
   */
  import { createHash, randomBytes } from 'node:crypto'

  export function sha256Hex(plain: string): string {
    return createHash('sha256').update(plain).digest('hex')
  }

  export function randomString(length: number, alphabet?: string): string {
    const chars = alphabet ?? 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    const bytes = randomBytes(length)
    let out = ''
    for (let i = 0; i < length; i++) out += chars[bytes[i]! % chars.length]
    return out
  }
  ```

- **`packages/modules/auth/src/services/api-key.integration.test.ts`** — tests d'intégration SP1-pattern :
  - `@effect/vitest` + Testcontainers `AuthPostgresLayer` / `truncateAuth`.
  - Couverture : `create` (user + org), `update`, `remove`, `verify` (avec et sans permissions matching), assertions ownership / membership.
  - Le legacy `services/api-key.test.ts` est laissé cassé (out of scope).

## Substitution des 4 imports better-auth

### `defaultKeyHasher` → `sha256Hex` (utils/crypto)

```ts
// avant
import { defaultKeyHasher } from '@better-auth/api-key'

// après
import { sha256Hex } from './utils/crypto'
const defaultKeyHasher: KeyHasher = plain => sha256Hex(plain)
```

### `generateRandomString` → `randomString` (utils/crypto)

```ts
// avant
import { generateRandomString } from 'better-auth/crypto'
const keyValue = generateRandomString(length, alphabet)

// après
import { randomString } from './utils/crypto'
const keyValue = randomString(length, alphabet)
```

### `Awaitable<T>` → alias local

```ts
// avant
import type { Awaitable } from 'better-auth'

// après — alias local en haut de api-key.ts (un seul fichier l'utilise)
type Awaitable<T> = T | Promise<T>
```

### `role(granted).authorize(req)` → `AccessService.authorize(granted, req)`

Ajout au contrat `AccessService` :

```ts
/**
 * Ad-hoc role-permission check: does `granted` cover `required`?
 *
 * Implementation forked from better-auth's `role(granted).authorize(required, connector)`
 * (better-auth/plugins/access, MIT). Same set-inclusion algorithm — we own
 * the impl to drop the runtime dep and to allow future extensions (denials,
 * resource hierarchies, etc.) without coupling to better-auth.
 *
 * The registered roles/hierarchies surface (`role(name)`, `roles`,
 * `buildRoles`) still uses better-auth's `createAccessControl` — separate,
 * larger fork sprint.
 */
readonly authorize: (
  granted: RolePermissions<Statements> | null | undefined,
  required: RolePermissions<Statements>,
  connector?: 'AND' | 'OR',
) => Effect.Effect<boolean>
```

Impl dans `makeLayer` :

```ts
authorize: (granted, required, connector = 'AND') =>
  Effect.sync(() => {
    if (!granted) return false
    for (const [resource, actions] of Object.entries(required) as [string, string[]][]) {
      const grantedActions = (granted as Record<string, string[]>)[resource]
      if (!grantedActions) return false
      const hasAll = actions.every(a => grantedActions.includes(a))
      const hasAny = actions.some(a => grantedActions.includes(a))
      if (connector === 'AND' && !hasAll) return false
      if (connector === 'OR' && !hasAny) return false
    }
    return true
  }),
```

Site d'usage dans `services/api-key.ts` :

```ts
// avant
import { role } from 'better-auth/plugins'
...
const allowed = role(granted).authorize(opts.permissions).success

// après
// (rien à importer — AccessService est déjà yieldé en haut de `make`)
const allowed = yield* access.authorize(granted, opts.permissions)
```

Aucun import de better-auth ne subsiste dans `services/api-key.ts` après SP3.

## Tests strategy

- **Pattern :** `@effect/vitest` + Testcontainers Postgres (`AuthPostgresLayer` / `truncateAuth`).
- **Nouveau fichier :** `services/api-key.integration.test.ts`. Couvre :
  - `AccessService.authorize` : unit tests purs — `granted ⊇ required`, `granted ⊉ required`, `null granted`, AND vs OR.
  - `ApiKeyService.create` : USER + ORGANIZATION paths, validation du référent.
  - `ApiKeyService.update` / `remove` : ownership / membership assertions, NoChanges, soft cases.
  - `ApiKeyService.verify` : permissions matching via `AccessService.authorize` — vérifier qu'un grant insuffisant échoue avec le bon `_tag` (`Unauthorized`).
- **GraphQL mutation tests :** **même gap qu'en SP2** — pas de harness GraphQL d'exécution dans le module. Les tâches mutations rapporteront DONE_WITH_CONCERNS pour le step "mutation test".
- **Legacy `services/api-key.test.ts` :** laissé inchangé (cassé via `@czo/kit/effect`). Comme `organization.test.ts` en SP2.

## Risques flag

1. **`authScope` async pour update/remove** : confirmé possible avec `@pothos/plugin-scope-auth` (Task 6 SP2 a fait pareil avec un lookup async vers `findFirstMember`). Pas de blocker attendu.
2. **`services/api-key.ts` peut avoir des comportements subtils** non couverts par la suite d'intégration (rate-limit, refill, expiration). Si Task 4 découvre des trous, on les comble en ligne ou on les marque DONE_WITH_CONCERNS.
3. **Le pre-fetch dans l'authScope** ajoute un round-trip DB (PK indexée, négligeable). À surveiller si une mutation update/remove est appelée en hot path.
4. **Renommage `deleteApiKey` → `removeApiKey`** : breaking change pour les clients GraphQL existants. À assumer comme partie du shape Relay.
5. **`@czo/kit/effect`** reste cassé. SP3 ne le restaure pas. Le legacy `api-key.test.ts` reste non runnable.

## Spec coverage check

| Section spec | Tâche |
|---|---|
| Crypto utils (sha256, random) | Task 1 |
| `AccessService.authorize` | Task 2 |
| Substitution des 4 imports | Task 3 |
| Tests intégration service | Task 4 |
| GraphQL types (enum + input) | Task 5 |
| `createApiKey` mutation | Task 6 |
| `updateApiKey` mutation | Task 7 |
| `removeApiKey` mutation | Task 8 |
| Queries (renommage + guard) | Task 9 |
| Cleanup better-auth layer + AuthContext | Task 10 |
| Final verification | Task 11 |

## Conventions

- **TDD** pour Tasks 2 et 4. Refactor (Task 3, 10) sans nouveaux tests, juste check-types + suite existante verte. Tasks 6–9 reportent DONE_WITH_CONCERNS pour les mutation tests (pas de harness).
- **Pas de commit pendant l'exécution.** `git add` (stage) only — un seul review + commit après Task 11 (préférence projet, comme SP1/SP-B/SP-A/SP2).
- **check-types baseline** : capturé en Task 1, doit rester égal à la fin de chaque task.
- **Tests style** : SP1-pattern (`@effect/vitest` + Testcontainers), pas de `@czo/kit/effect`.
