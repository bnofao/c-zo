# Effect-TS DI & Services — Pilote sur `auth/apiKey`

**Date** : 2026-05-09
**Branche** : `feat/kit-pothos-migration`
**Scope** : Pilote uniquement — migration de `auth/apiKey` (service complet + GraphQL apiKey) vers Effect-TS. Les autres modules restent inchangés.
**Statut** : Design validé — prêt pour planification d'implémentation.

## 1. Contexte & motivation

c-zo utilise actuellement `@adonisjs/fold` comme conteneur IoC, exposé via `useContainer()` dans `@czo/kit/ioc`. Les services suivent un pattern factory `createXService(...deps)` retournant un objet de méthodes async, avec signalisation d'erreur par callbacks (`onInvalidKey`, `onKeyDisabled`, etc.).

L'objectif est de migrer vers Effect-TS pour bénéficier :
- d'erreurs typées (chaque cas d'échec discriminé via tagged class)
- d'un système DI explicite (Layers composables, Tags)
- d'une concurrence/cancellation native via Fiber
- d'une intégration test plus simple (Layer.succeed pour mocks)

**Schéma** : Zod est conservé. Pas de migration vers `@effect/schema`.

## 2. Décisions architecturales

### 2.1 Profondeur de migration : Full Effect (sauf schema)

Tout le pipeline d'`auth/apiKey` passe à Effect : DI, signatures de service, erreurs, retry/timeout potentiels. Les inputs restent validés par Zod (déjà en place via `@pothos/plugin-validation`).

### 2.2 Drizzle : Layer custom autour de `node-postgres`

`@effect/sql-drizzle/Pg` n'est **pas adopté** car :
- il utilise `drizzle-orm/pg-proxy` (pas `node-postgres`)
- son `DrizzleConfig<TSchema>` ne thread pas le second générique `TRelations`, perdant l'inférence RQBv2 actuelle (`db.query.X.findFirst({with: {...}})`)
- changement de driver Postgres = risque infra hors scope du pilote

À la place, un Layer custom enveloppe le `useDatabase()` existant :

```ts
// packages/kit/src/db/effect.ts
import { Context, Effect, Layer } from 'effect'
import type { Database } from './manager'
import { useDatabase } from './manager'

export class DrizzleDb extends Context.Tag('@czo/kit/DrizzleDb')<
  DrizzleDb,
  Database
>() {}

export const DrizzleDbLive = Layer.effect(
  DrizzleDb,
  Effect.promise(() => useDatabase()),
)
```

Conséquences :
- typage `Database<AuthRelations>` préservé
- `withReplicas` et le routing master/replica inchangés
- pas de `SqlError` ni transactions Effect natives — les services wrappent eux-mêmes via `Effect.tryPromise({try, catch: cause => new DbFailed({cause})})`

### 2.3 Modèle d'erreur : tagged classes par cas d'échec

Chaque callback `onXxx` actuel devient une `Data.TaggedError` distincte. Le service rend `Effect<A, ApiKeyError>` où `ApiKeyError` est l'union des cas pertinents pour la méthode appelée.

**Ces tagged errors servent aussi d'erreurs GraphQL** (voir 2.7). Une seule classe par cas, à la fois yieldable dans Effect et enregistrable via `registerError(builder, ...)`.

### 2.4 Structure de fichiers : `services/` (contrats) + `layers/` (impls)

```
packages/modules/auth/src/
  services/
    api-key.ts        # Context.Tag + interface + tagged errors + types d'inputs
    organization.ts   # stub minimal pour le pilote
    index.ts          # re-exports des Tags
  layers/
    api-key.ts        # Layer.effect(ApiKeyService, …) + tests
    api-key.test.ts
    organization.ts   # Layer stub minimal
    index.ts          # re-exports des Layers
```

Bénéfices :
- frontière physique entre contrat et impl — un module qui dépend d'`ApiKeyService` n'importe que `services/api-key.ts`, ne tire ni Drizzle ni better-auth
- chaque service vit dans **un fichier par couche** (flat) — recherche rapide, pas de sous-dossier par feature

### 2.5 Tag + Layer.effect manuels (pas `Effect.Service`)

`Effect.Service` est du sucre qui couple Tag et Layer dans une même classe. Pour un projet modulaire, on préfère :
- `Context.Tag` dans `services/api-key.ts` (le contrat seul)
- `Layer.effect(Tag, …)` dans `layers/api-key.ts` (l'impl)

Permet plusieurs Layers pour un même Tag (Live, Stub de test, alternatives futures) sans collusion.

### 2.6 Runtime singleton via `useRuntime()`

Une `ManagedRuntime` est construite **une fois** au boot Nitro (hook `czo:init`), exposée via un singleton module-level `useRuntime()` dans `@czo/kit/effect`. Cohérent avec le pattern existant (`useDatabase`, `useContainer`).

```ts
// Construction au boot
const runtime = ManagedRuntime.make(
  Layer.mergeAll(ApiKeyServiceLive, OrganizationServiceStub).pipe(
    Layer.provide(DrizzleDbLive),
  ),
)
setRuntime(runtime)
nitroApp.hooks.hook('close', () => runtime.dispose())
```

Le runtime est attaché à `ctx.runtime` dans `buildAuthContext` pour testabilité (un test peut injecter un runtime alternatif).

### 2.7 Mapping erreurs → GraphQL : tagged errors **sont** les erreurs GraphQL

Pothos `registerError` n'exige que `new (...args: any[]) => Error`. `Data.TaggedError` retourne une classe qui étend `Error`. Donc une tagged error EST directement enregistrable.

```ts
export class KeyExpiredError extends Data.TaggedError('KeyExpired')<{
  readonly keyId: number
}> {
  readonly code = 'API_KEY_EXPIRED'
  override get message() { return `API key '${this.keyId}' has expired` }
}
```

Côté GraphQL :
```ts
registerError(builder, KeyExpiredError, {
  name: 'KeyExpiredError',
  fields: t => ({ keyId: t.exposeID('keyId') }),
})
```

Côté resolver Pothos :
```ts
builder.queryField('verifyApiKey', t => t.field({
  type: ApiKeyType,
  errors: { types: [InvalidApiKey, KeyExpiredError, RateLimitedError, /* … */] },
  args: { key: t.arg.string({ required: true }) },
  resolve: (_, { key }, ctx) =>
    runEffect(ctx.runtime,
      Effect.gen(function* () {
        const service = yield* ApiKeyService
        return yield* service.verify(key)
      }),
    ),
}))
```

Le helper `runEffect(rt, eff)` déballe le `Cause` d'Effect et **rejette la Promise avec l'erreur originale** (pas un `FiberFailure`), pour que `errors: { types: […] }` de Pothos puisse faire son `instanceof`.

```ts
// packages/kit/src/effect/runtime.ts
export async function runEffect<A, E>(
  rt: ManagedRuntime.ManagedRuntime<never, never>,
  effect: Effect.Effect<A, E>,
): Promise<A> {
  const exit = await rt.runPromiseExit(effect)
  if (Exit.isSuccess(exit)) return exit.value
  const failure = Cause.failureOption(exit.cause)
  if (failure._tag === 'Some') throw failure.value as Error
  throw Cause.squash(exit.cause) // defects → 500
}
```

### 2.8 BaseGraphQLError : duck-typing pour le pilote

`BaseGraphQLError` n'est jamais utilisé via `instanceof` dans le code — c'est un marker de cohésion via `extends`. Pour le pilote, les tagged errors **n'étendent pas** `BaseGraphQLError` : elles ont juste le même shape (`code: string`, `message: string`, étend `Error` via TaggedError). Pothos s'en moque.

État transitoire documenté : *"BaseGraphQLError reste pour les modules non-Effect-isés. Migration vers interface structurelle prévue après pilote."*

## 3. Tagged errors d'`ApiKeyService`

Dérivées des callbacks actuels :

| Tag | Champs | Cause actuelle (callback) |
|---|---|---|
| `InvalidApiKey` | `{}` | `onInvalidKey` |
| `KeyDisabled` | `{}` | `onKeyDisabled` |
| `KeyExpired` | `{ keyId: number }` | `onKeyExpired` |
| `Unauthorized` | `{}` | `onUnauthorized` |
| `RateLimited` | `{ tryAgainIn: number }` | `onRateLimited` |
| `Misconfigured` | `{ reason: string }` | `onMisconfigured` |
| `UsageExceeded` | `{}` | `onFailed` post-UPDATE 0-rows (côté usage) |
| `Intrusion` | `{}` | `onIntrusion` |
| `NotFound` | `{}` | `onNotFound` |
| `NoChanges` | `{}` | `onNoChanges` |
| `RefillPairRequired` | `{}` | `onRefillPairRequired` |
| `DbFailed` | `{ cause: unknown }` | `onFailed` (catch SQL) |

Chaque classe expose un `code: string` (ex. `'API_KEY_EXPIRED'`) compatible avec le contrat duck-typé `BaseGraphQLError`.

## 4. Signatures `ApiKeyService` (avant/après)

### Avant
```ts
async verify(plainKey: string, opts?: VerifyApiKeyOptions): Promise<ApiKey | null>
```
`VerifyApiKeyOptions` contient des callbacks `onInvalidKey?`, `onKeyDisabled?`, etc. Le retour `null` signale l'échec, le caller doit savoir quel callback a été déclenché.

### Après
```ts
interface ApiKeyService {
  readonly verify: (plainKey: string, opts?: VerifyOptions) => Effect.Effect<
    ApiKey,
    InvalidApiKey | KeyDisabled | KeyExpired | Unauthorized
    | RateLimited | Misconfigured | UsageExceeded | DbFailed
  >
  // … idem pour validate/findFirst/findMany/create/update/remove
}

export const ApiKeyService = Context.GenericTag<ApiKeyService>('@czo/auth/ApiKeyService')
```

`VerifyOptions` ne contient plus que les **vraies** options (`permissions?: Record<string, string[]>`, `keyHasher?: KeyHasher`). Tous les `on*` sont supprimés.

`findFirst` change de `Promise<ApiKey | null>` à `Effect<ApiKey, NotFound | Intrusion | DbFailed>` — élimine la branche null à chaque call site.

## 5. Plan d'implémentation (séquence de PRs)

### Phase 1 — Infra Effect dans `@czo/kit` (PR fondation)

- `pnpm add effect` dans `packages/kit`
- `packages/kit/src/effect/runtime.ts` — `useRuntime()`, `setRuntime()`, `runEffect(rt, eff)`
- `packages/kit/src/effect/test.ts` — `expectFailure(eff, Tag)`, `expectSuccess(eff)`
- `packages/kit/src/db/effect.ts` — `DrizzleDb` Tag + `DrizzleDbLive` Layer
- `packages/kit/src/effect/index.ts` — re-exports

Aucun changement modules existants. Infra dormante.

### Phase 2 — Refactor structure auth (PR préparation)

- Créer `packages/modules/auth/src/services/` et `packages/modules/auth/src/layers/`
- `services/api-key.ts` reçoit l'interface `ApiKeyService` actuelle (signatures inchangées, pas encore Effect) + types d'inputs
- `layers/api-key.ts` reçoit `createApiKeyService(...)` actuel renommé `ApiKeyServiceLive` (toujours factory async)
- Plugin Nitro pointe vers les nouveaux paths

Aucun changement de comportement.

### Phase 3 — apiKey en Effect (LE pilote)

1. Tagged errors dans `services/api-key.ts` (~12 classes)
2. Interface `ApiKeyService` reécrite (signatures Effect, suppression callbacks `onXxx`)
3. `ApiKeyServiceLive` reécrite dans `layers/api-key.ts` :
   - logique actuelle préservée (UPDATE atomique avec CASE SQL conservé tel quel)
   - `db.query.X` et `db.update().set()` enveloppés dans `Effect.tryPromise`
   - `?.()` de callbacks remplacés par `yield* new TaggedError(...)`
4. `OrganizationServiceStub` minimaliste (Layer avec `checkMembership` uniquement — la vraie migration de `organization.service.ts` arrivera dans une PR ultérieure)
5. Ancien `apiKey.service.ts` supprimé

### Phase 4 — Boot Nitro + GraphQL apiKey

1. Plugin Nitro construit `ManagedRuntime` au `czo:init` et `setRuntime(rt)` ; dispose au hook `close`
2. `context-factory.ts` attache `runtime` au contexte GraphQL
3. Tagged errors apiKey **remplacent** les anciennes (`ApiKeyExpiredError`, `ApiKeyRevokedError` dans `graphql/schema/api-key/errors.ts`) — désormais elles vivent dans `services/api-key.ts`. Le fichier `graphql/schema/api-key/errors.ts` se résume à `registerError(...)` qui pointent vers les classes du service.
4. Resolvers apiKey passent à `runEffect(ctx.runtime, Effect.gen(...))`

### Phase 5 — Tests

`layers/api-key.test.ts` couvre :
- `verify('')` → `InvalidApiKey`
- `verify(unknownHash)` → `InvalidApiKey`
- clé désactivée → `KeyDisabled`
- clé expirée → `KeyExpired`
- permissions insuffisantes → `Unauthorized`
- rate limit dépassé → `RateLimited({tryAgainIn})`
- rate limit misconfig (`windowMs <= 0`) → `Misconfigured`
- quota exhausted → `UsageExceeded`
- succès simple → décrément de `remaining`
- succès avec refill → `remaining` revient à `refillAmount - 1`
- concurrence : deux `verify` parallèles sur clé avec `remaining = 1` → un seul succès

Tests via vitest avec `TEST_DATABASE_URL` (pas de Docker, stack actuel préservé). Pas de migration vers `@effect/vitest` dans le pilote.

### Phase 6 — Documentation

- `CLAUDE.md` racine : section sur le pattern Effect + layout `services/`/`layers/`
- Note transitoire dans `kit/src/graphql/errors/index.ts`

### Découpage PR final

- **PR 1** : Phase 1 (infra kit)
- **PR 2** : Phase 2 (refactor structure auth, sans Effect)
- **PR 3** : Phases 3 + 4 + 5 + 6 (le pilote complet en bloc)

## 6. Risques & mitigations

| Risque | Mitigation |
|---|---|
| `Data.TaggedError` + champ `code` non-readonly à l'instance | Test explicite `new InvalidApiKey()._tag === 'InvalidApiKey'` et `.code === 'INVALID_API_KEY'` dans la première itération |
| `runPromiseExit` rejette via Cause au lieu de l'erreur originale → Pothos ne route pas | Helper `runEffect` extrait la failure originale avant le throw — vérifier avec un test resolver de bout en bout |
| Tree-shaking des Layers casse au build Nitro | Vérifier `pnpm build:mazo` après Phase 4 — si un Layer est supprimé à tort, ajouter `// @__PURE__` ou re-export explicite |
| `useRuntime()` appelé avant `czo:init` | Throw clair (« did the auth plugin run? ») + tester le cas où le secret n'est pas configuré (auth plugin skip = pas de runtime → resolver 500 explicite) |
| `OrganizationServiceStub` masque un bug d'autorisation cross-module | Le stub renvoie `Effect.succeed(true)` par défaut ; tests d'intégration doivent forcer le `false` pour les cas `Intrusion` |
| Régression silencieuse sur la logique métier (UPDATE atomique, refill, rate limit) | Tests Phase 5 reprennent **exactement** les cas du fix précédent (commit `614b631a`) ; concurrence testée explicitement |

## 7. Ce qui n'est PAS dans ce pilote

- Migration des autres services (user, organization, auth, account, session, twoFactor, app, stock-location)
- Migration de `@effect/schema` (Zod conservé)
- Migration vers `@effect/sql-pg` ou `@effect/sql-drizzle` (driver `node-postgres` conservé)
- Migration de `@effect/vitest`
- Conversion de `BaseGraphQLError` en interface (refactor kit, prévu post-pilote)
- Suppression de `useContainer()` (`config`, `useStorage`, etc. y restent)
- Effect Logger / Effect Telemetry (`useLogger`, `useTelemetry` actuels conservés)

Ces sujets sont **explicitement reportés** et feront chacun l'objet de leur propre design + PR.

## 8. Critères de succès

Le pilote est considéré réussi si :

1. **Comportement fonctionnel identique** : tous les cas de test du fix précédent (`614b631a`) passent avec la nouvelle impl.
2. **Aucun callback `onXxx`** ne subsiste dans `ApiKeyService`. Les erreurs sont toutes typées via tagged classes.
3. **`pnpm typecheck` propre** sur `@czo/kit`, `@czo/auth`, `apps/mazo` — aucune erreur introduite.
4. **`pnpm test` passant** dans `packages/modules/auth`.
5. **Resolver `verifyApiKey` retourne le bon variant d'union** quand la clé est invalide/expirée/etc., vérifié par un test de bout en bout (de la mutation GraphQL jusqu'à la response).
6. **Hot-reload Nitro stable** : modifier `layers/api-key.ts` en dev rebuild sans crash du runtime singleton.
