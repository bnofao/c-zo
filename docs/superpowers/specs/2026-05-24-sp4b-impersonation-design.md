# SP4b — Impersonation: native finalization — Design Spec

**Status:** Brainstormed, awaiting plan
**Date:** 2026-05-24
**Branch target:** `feat/sp1-auth` (continues SP1 → SP-B → SP-A → SP2 → SP3 → SP4)

## Goal

Ajouter le flow d'impersonation natif (un admin agit temporairement comme un autre utilisateur via une session dérivée) et finaliser le drop du plugin `better-auth/plugins.admin()` — dernière trace de `better-auth/plugins` côté admin. Pas de feature client-visible au-delà des 2 nouvelles mutations GraphQL.

Les **account flows** (password reset, email verification, change password) restent en **SP5**.

## Background

État au début de SP4b (post-SP4 commit `c5f17f1`) :

- Colonne `sessions.impersonated_by` existe (`text`, nullable) — schema-prepared depuis SP1, jamais écrite.
- `SessionService.create({ userId, actorType?, expiresIn? })` — pas de support `parentToken`/`impersonatedBy`.
- `GraphQL Session.impersonatedBy` exposé en lecture (`user/types.ts:26`).
- `ActorService.allowImpersonation?: boolean` flag dans le registry per actor type — jamais lu (ne joue pas dans SP4b ; reste un flag stocké pour usage futur côté actor restrictions).
- `layers/better-auth/admin.ts` monte `better-auth/plugins.admin()` qui expose `/api/auth/admin/impersonate-user` et `/stop-impersonating`. Aucun consumer dans `apps/` ne hit ces endpoints (vérifié via grep). Le plugin reste actif uniquement pour son chemin impersonate ; ban/setRole/listSessions/etc. sont déjà natifs SP1/SP4.
- SP1 design doc ligne 183 : "SP4 (ban/impersonate) will revisit whether [the session] needs a shorter TTL" — answered ici.

## Architecture & scope

### Modèle de session : session dérivée

Quand un admin (token `X`, `userId=adminId`) démarre une impersonation sur `target` :

1. Nouvelle row `sessions { token=Y, userId=targetId, impersonatedBy=adminId, parentToken=X, expiresAt=now+ttl }`.
2. Cookie client overwritten : `Set-Cookie: czo.session=Y`.
3. Token `X` reste en DB mais `resolve(X)` refuse tant qu'un child `parent_token=X` existe (mécanisme "suspended-while-child").

Quand l'admin stoppe l'impersonation (caller fournit le token courant `Y`) :

1. Lookup `parent_token` → récupère `X`.
2. Revoke `Y` (DELETE).
3. `resolve(X)` redevient servable (plus de child existant).
4. Cookie restauré : `Set-Cookie: czo.session=X`.

Cascade FK gère les cas accidentels :

- **Admin revoke / ban / logout** → parent `X` supprimé → `parent_token CASCADE` → child `Y` supprimé automatiquement. La FK garantit qu'un admin banni ne conserve pas son pouvoir d'impersonation.
- **Target banné** → `revokeAllForUser(targetId)` supprime `Y` (qui a `userId=targetId`) → parent `X` auto-restauré (plus de child).

### Invariants

- `parent_token IS NOT NULL ⟺ impersonated_by IS NOT NULL` (vérifié au service, pas au CHECK DB).
- Session avec child actif est non-résolvable (vérifié dans `resolve`, single query avec `NOT EXISTS` clause).
- Impersonation non-chainable : `CannotChainImpersonation` si `currentSession.impersonatedBy IS NOT NULL` au start.

### Livrables SP4b

1. **Migration** : colonne `parent_token text REFERENCES sessions(token) ON DELETE CASCADE` + partial index sur `parent_token IS NOT NULL` + ajout du statement `user:impersonate` à `ADMIN_STATEMENTS`/`ADMIN_HIERARCHY`.
2. **`SessionService` extension** : `create` accepte `parentToken` + `impersonatedBy` ; `resolve` ajoute le filter `NOT EXISTS` (single query, raw SQL template Drizzle).
3. **Nouveau `ImpersonationService`** (`services/impersonation.ts`) : `start(input)` et `stop(currentToken)` avec 6 guards + telemetry via `Effect.fn` + events sur `AuthEvents`.
4. **`ImpersonationConfig` Tag** + extension `AuthConfig.impersonation?` : `defaultTtl` (default 1h), `maxTtl` (default 4h), `allowImpersonateAdmin` (default false).
5. **`AuthEvents` extension** : 2 events `ImpersonationStarted` / `ImpersonationStopped`.
6. **GraphQL mutations** : `startImpersonation(input)` + `stopImpersonation` en `relayMutationField`, payload `{ session, user }`, authScope `permission({ resource: 'user', actions: ['impersonate'] })`.
7. **Drop `layers/better-auth/admin.ts`** + remove `adminConfig` from `layers/better-auth/index.ts` plugins array. Dernière trace de `'better-auth/plugins'` admin-side disparaît.

### Hors scope SP4b

- **Account flows** (password reset, email verification, change password) — SP5.
- Native rewrite de `OrganizationService.hasPermission` (sprint AC org dédié, hors thématique).
- `cacheOrgRoles` LRU/TTL bounding (carry-over legacy).
- Restauration de `@czo/kit/effect` (dette tech transversale).
- Dedicated audit log table (telemetry + AuthEvents subscribers suffisent pour l'usage actuel).
- Auto-cleanup serveur des impersonation sessions abandonnées (TTL court + `purgeExpired` existant suffit).

### Anti-objectifs

- Pas de nouvelle surface REST. Les anciens `/api/auth/admin/*` endpoints disparaissent ; aucun client ne les appelait.
- Pas de breaking change schema (ajout colonne nullable, additive).
- Pas de cascade explicite côté service — la FK `ON DELETE CASCADE` fait le travail, le service ne court pas après.

## Migration & schema

### Migration SQL (`migrations/NNNN_sp4b_impersonation.sql`)

```sql
ALTER TABLE sessions
  ADD COLUMN parent_token text REFERENCES sessions(token) ON DELETE CASCADE;

CREATE INDEX idx_sessions_parent_token
  ON sessions(parent_token)
  WHERE parent_token IS NOT NULL;
```

Additive, NULL pour toutes les rows existantes — pas de data migration nécessaire.

### Schema Drizzle

```ts
export const sessions = pgTable('sessions', t => ({
  // ... existing
  impersonatedBy: text('impersonated_by'),
  parentToken: text('parent_token').references((): AnyPgColumn => sessions.token, { onDelete: 'cascade' }),
  // ... rest
}), table => [
  // ... existing indexes
  index('idx_sessions_parent_token')
    .on(table.parentToken)
    .where(sql`${table.parentToken} IS NOT NULL`),
])
```

Self-reference nécessite le forward-declaration pattern Drizzle `(): AnyPgColumn => sessions.token`.

### AccessControl statement

`packages/modules/auth/src/plugins/access.ts` :

```ts
export const ADMIN_STATEMENTS = {
  user: ['create', 'read', 'update', 'ban', 'set-role', 'set-password', 'remove', 'impersonate'],
  // ... existing
} as const

export const ADMIN_HIERARCHY: HierarchyLevel<typeof ADMIN_STATEMENTS>[] = [
  // ... user level unchanged
  {
    name: 'admin',
    permissions: {
      user: ['create', 'update', 'ban', 'set-role', 'set-password', 'remove', 'impersonate'],
      // ... rest
    },
  },
]
```

`AccessService.buildRoles` au boot re-matérialise le rôle admin avec la nouvelle permission. Pas de migration explicite.

## `SessionService` extension

### `CreateSessionInput` (additive)

```ts
export interface CreateSessionInput {
  readonly userId: number
  readonly actorType?: string
  readonly expiresIn?: Duration.Duration
  // ── new SP4b ──
  readonly impersonatedBy?: number
  readonly parentToken?: string
}
```

Invariant `impersonatedBy ⟺ parentToken` enforced à l'entrée de `create` (fail-fast `InvalidImpersonationInput` — jamais surfacé GraphQL, mésusage interne uniquement).

### `resolve` filter (suspended-while-child)

Retourne `null` (cache miss) tant qu'un child existe. Single query avec `NOT EXISTS` :

```ts
const row = yield* Effect.tryPromise({
  try: () => db.execute(sql`
    SELECT s.* FROM sessions s
    WHERE s.token = ${token}
      AND s.expires_at > now()
      AND NOT EXISTS (SELECT 1 FROM sessions WHERE parent_token = s.token)
    LIMIT 1
  `),
  catch: cause => new SessionStoreFailed({ cause }),
})
```

Drizzle raw `sql` template (RQBv2 ne supporte pas trivialement `NOT EXISTS`). Single round-trip, partial index garantit la lookup O(log n).

### Cache discipline

`ImpersonationService.start` et `stop` doivent appeler `sessions.invalidateCacheForToken(parentToken)` aux deux moments :

- **start** : évacuer l'ancien "active" cached pour `X` (sinon `resolve(X)` next-hit servirait la version pré-impersonation).
- **stop** : évacuer le "null suspended" cached pour `X` (sinon `resolve(X)` next-hit servirait null malgré le child supprimé).

Sans ces deux invalidations, le cache servirait stale data.

## `ImpersonationConfig`

```ts
export class ImpersonationConfig extends Context.Service<
  ImpersonationConfig,
  {
    readonly defaultTtl: Duration.Duration
    readonly maxTtl: Duration.Duration
    readonly allowImpersonateAdmin: boolean
  }
>()('@czo/auth/ImpersonationConfig') {}

export const makeImpersonationConfigLayer = (
  config?: AuthConfig['impersonation'],
): Layer.Layer<ImpersonationConfig> =>
  Layer.succeed(ImpersonationConfig, {
    defaultTtl: config?.defaultTtl ?? IMPERSONATION_DEFAULT_TTL,    // 1h
    maxTtl: config?.maxTtl ?? IMPERSONATION_MAX_TTL,                // 4h
    allowImpersonateAdmin: config?.allowImpersonateAdmin ?? false,
  })
```

Constantes dans `constants.ts` :

```ts
export const IMPERSONATION_DEFAULT_TTL = Duration.hours(1)
export const IMPERSONATION_MAX_TTL = Duration.hours(4)
```

`AuthConfig` extension :

```ts
interface AuthConfig {
  // ... existing
  impersonation?: {
    defaultTtl?: Duration.Duration
    maxTtl?: Duration.Duration
    allowImpersonateAdmin?: boolean
  }
}
```

## `ImpersonationService`

### Contract

```ts
export interface StartImpersonationInput {
  readonly adminId: number
  readonly adminToken: string
  readonly targetUserId: number
  readonly ttl?: Duration.Duration
  readonly reason?: string
}

export interface ImpersonationResult {
  readonly session: SessionRow
  readonly user: User
}

export class ImpersonationService extends Context.Service<
  ImpersonationService,
  {
    readonly start: (input: StartImpersonationInput) => Effect.Effect<
      ImpersonationResult,
      | UserNotFound | CannotImpersonateSelf | CannotImpersonateAdmin
      | CannotImpersonateBannedUser | CannotChainImpersonation
      | ImpersonationTtlTooLong | SessionStoreFailed | UserDbFailed
    >
    readonly stop: (currentToken: string) => Effect.Effect<
      ImpersonationResult,
      ImpersonationNotActive | SessionStoreFailed | UserDbFailed
    >
  }
>()('@czo/auth/ImpersonationService') {}
```

### Tagged errors

Tous registrés Pothos via `registerError` :

- `CannotImpersonateSelf({ userId })`
- `CannotImpersonateAdmin({ targetUserId })`
- `CannotImpersonateBannedUser({ targetUserId })`
- `CannotChainImpersonation({ currentToken })`
- `ImpersonationTtlTooLong({ requestedMs, maxMs })`
- `ImpersonationNotActive({ token })`

### `start` impl

```ts
start: ({ adminId, adminToken, targetUserId, ttl, reason }) =>
  Effect.gen(function* () {
    const users = yield* UserService
    const sessions = yield* SessionService
    const config = yield* ImpersonationConfig
    const events = yield* AuthEvents

    // Guard 1: not self
    if (adminId === targetUserId)
      return yield* Effect.fail(new CannotImpersonateSelf({ userId: adminId }))

    // Guard 2: TTL cap
    const effectiveTtl = ttl ?? config.defaultTtl
    if (Duration.toMillis(effectiveTtl) > Duration.toMillis(config.maxTtl))
      return yield* Effect.fail(new ImpersonationTtlTooLong({
        requestedMs: Duration.toMillis(effectiveTtl),
        maxMs: Duration.toMillis(config.maxTtl),
      }))

    // Guard 3: caller not already impersonating
    const currentResolved = yield* sessions.resolve(adminToken)
    if (currentResolved?.session.impersonatedBy != null)
      return yield* Effect.fail(new CannotChainImpersonation({ currentToken: adminToken }))

    // Guard 4 + 5 + 6: target exists, not banned, not admin (unless allowed)
    const target = yield* users.findFirst({ where: { id: targetUserId } })
    if (!target) return yield* Effect.fail(new UserNotFound({ id: targetUserId }))
    if (target.banned)
      return yield* Effect.fail(new CannotImpersonateBannedUser({ targetUserId }))
    if (!config.allowImpersonateAdmin && (target.role ?? '').split(',').includes('admin'))
      return yield* Effect.fail(new CannotImpersonateAdmin({ targetUserId }))

    // Create child session
    const child = yield* sessions.create({
      userId: targetUserId,
      actorType: 'user',
      expiresIn: effectiveTtl,
      impersonatedBy: adminId,
      parentToken: adminToken,
    })

    // Cache discipline: parent must re-resolve as suspended next time
    yield* sessions.invalidateCacheForToken(adminToken)

    // Telemetry + event
    yield* Effect.forkDetach(events.publish({
      _tag: 'ImpersonationStarted',
      adminId,
      targetUserId,
      sessionToken: child.token,
      reason: reason ?? null,
      expiresAt: child.expiresAt,
    }))

    return { session: child, user: target }
  })
```

Wrapper outer-level : `Effect.fn('impersonation.start')` pour span OTel.

### `stop` impl

```ts
stop: (currentToken) =>
  Effect.gen(function* () {
    const sessions = yield* SessionService
    const events = yield* AuthEvents

    const current = yield* sessions.resolve(currentToken)
    if (!current || current.session.impersonatedBy == null || current.session.parentToken == null)
      return yield* Effect.fail(new ImpersonationNotActive({ token: currentToken }))

    const parentToken = current.session.parentToken
    const adminId = current.session.impersonatedBy

    yield* sessions.revoke(currentToken)
    yield* sessions.invalidateCacheForToken(parentToken)

    const restored = yield* sessions.resolve(parentToken)
    if (!restored)
      return yield* Effect.fail(new ImpersonationNotActive({ token: currentToken }))

    yield* Effect.forkDetach(events.publish({
      _tag: 'ImpersonationStopped',
      adminId,
      targetUserId: current.session.userId,
      sessionToken: currentToken,
    }))

    return { session: restored.session, user: restored.user }
  })
```

### `AuthEvents` extension

```ts
export type AuthEvent
  = | { readonly _tag: 'ImpersonationStarted'
        readonly adminId: number
        readonly targetUserId: number
        readonly sessionToken: string
        readonly reason: string | null
        readonly expiresAt: Date }
    | { readonly _tag: 'ImpersonationStopped'
        readonly adminId: number
        readonly targetUserId: number
        readonly sessionToken: string }
    // | ... existing variants
```

## GraphQL mutations

`packages/modules/auth/src/graphql/schema/impersonation/mutations.ts` (nouveau fichier) :

```ts
builder.relayMutationField(
  'startImpersonation',
  { inputFields: t => ({
      targetUserId: t.id({ required: true }),
      ttl: t.int(),
      reason: t.string(),
  }) },
  {
    errors: { types: [UserNotFound, CannotImpersonateSelf, CannotImpersonateAdmin,
                      CannotImpersonateBannedUser, CannotChainImpersonation,
                      ImpersonationTtlTooLong] },
    authScopes: { permission: { resource: 'user', actions: ['impersonate'] } },
    resolve: async (_root, { input }, ctx) => {
      const adminId = Number(ctx.auth.user!.id)
      const adminToken = ctx.auth.sessionToken!
      const { id: targetIdRaw } = decodeGlobalID(input.targetUserId)
      const targetUserId = Number(targetIdRaw)

      const result = await ctx.runEffect(Effect.gen(function* () {
        const svc = yield* ImpersonationService
        return yield* svc.start({
          adminId, adminToken, targetUserId,
          ttl: input.ttl != null ? Duration.seconds(input.ttl) : undefined,
          reason: input.reason ?? undefined,
        })
      }))

      // Set cookie via Nitro h3 (pattern from SP1 login/signup)
      const cookie = (yield* SessionService).setCookie(result.session.token)
      setCookie(ctx.event, cookie.name, cookie.value, cookie.attributes)

      return result
    },
  },
  { outputFields: t => ({
      session: t.field({ type: 'Session', resolve: p => p.session }),
      user: t.field({ type: 'User', resolve: p => p.user }),
  }) },
)

builder.relayMutationField(
  'stopImpersonation',
  { inputFields: () => ({}) },
  {
    errors: { types: [ImpersonationNotActive] },
    authScopes: { auth: true },
    resolve: async (_root, _input, ctx) => {
      const currentToken = ctx.auth.sessionToken!
      const result = await ctx.runEffect(Effect.gen(function* () {
        const svc = yield* ImpersonationService
        return yield* svc.stop(currentToken)
      }))

      const cookie = (yield* SessionService).setCookie(result.session.token)
      setCookie(ctx.event, cookie.name, cookie.value, cookie.attributes)

      return result
    },
  },
  { outputFields: t => ({
      session: t.field({ type: 'Session', resolve: p => p.session }),
      user: t.field({ type: 'User', resolve: p => p.user }),
  }) },
)
```

Note : le pattern cookie-set via `setCookie(ctx.event, ...)` est à confirmer en réplication exacte de SP1's login/signup/signOut callsites.

## `module.ts` wiring

```ts
const ImpersonationConfigLive = makeImpersonationConfigLayer(config.impersonation)

const AuthModuleLive = Layer.mergeAll(
  ApiKey.layer.pipe(...),
  UserServiceLive,
  AuthActorServiceLive,
  Password.layer,
  AuthEvents.layer,
  sessionLayer,
  Session.subscribersLayer,
  Impersonation.layer,                          // new
).pipe(
  Layer.provideMerge(BetterAuthLive),
  Layer.provideMerge(AccessServiceLive),
  Layer.provideMerge(UserEvents.layer),
  Layer.provideMerge(ImpersonationConfigLive),  // new
)
```

## Drop better-auth admin plugin

Fichiers :

1. **Delete** `packages/modules/auth/src/layers/better-auth/admin.ts` (mirror vers `old/` per convention).
2. **Modify** `packages/modules/auth/src/layers/better-auth/index.ts` :
   - Drop `import { adminConfig } from './admin'`.
   - Drop `adminConfig({ ac: option.ac, roles: option.roles })` du `plugins:` array.
   - Si `option.ac` / `option.roles` ne sont consommés par aucun autre plugin du tableau, retirer aussi de la signature `AuthOption`.

**Verification** : `grep -rn "from 'better-auth/plugins'\|AdminOptions\b" packages/modules/auth/src` → 0 results. Dernière trace admin-side disparaît.

**Risque consumer** : zéro. Vérifié pendant brainstorm (`grep -rn "/admin/\|authClient\.admin\."` dans `apps/` et `packages/` non-auth → 0 hits).

## Tests

### Suite intégration `services/impersonation.test.ts`

Pattern SP1 : `@effect/vitest` (`it.layer`/`it.effect`) + `AuthPostgresLayer` Testcontainers + `truncateAuth`.

| # | Cas | Method |
|---|---|---|
| 1 | start — happy path | `start()` returns child with correct fields |
| 2 | start — guard self | `CannotImpersonateSelf` |
| 3 | start — guard banned target | `CannotImpersonateBannedUser` |
| 4 | start — guard admin (default deny) | `CannotImpersonateAdmin` |
| 5 | start — guard admin (allowed via config) | success |
| 6 | start — guard chain | `CannotChainImpersonation` |
| 7 | start — TTL cap exceeded | `ImpersonationTtlTooLong` |
| 8 | start — TTL default applied | child.expiresAt ≈ now+defaultTtl |
| 9 | stop — happy path | parent restored, return |
| 10 | stop — guard not-active | `ImpersonationNotActive` |
| 11 | resolve — suspended parent | `resolve(adminToken) === null` while child exists |
| 12 | resolve — restored parent | `resolve(adminToken)` works after stop |
| 13 | cascade — admin revoke | child auto-deleted on `sessions.revoke(adminToken)` |
| 14 | cascade — admin banned via event | child auto-deleted via subscriber chain |
| 15 | target banned | child deleted directly, parent restored |
| 16 | events — start + stop publish on AuthEvents | observable via test subscriber |

~16 tests, ~250 lignes test prod.

### GraphQL mutation tests

Hors-périmètre exécution actuelle (pas de harness GraphQL execution dans le module, accepté en SP2/SP3). Type-check + `check-types` suffisent comme gate.

## Récap & effort

| # | Chantier | Fichiers principaux | LoC prod | LoC tests |
|---|---|---|---|---|
| 1 | Migration + schema + statement `user:impersonate` | `migrations/`, `database/schema.ts`, `plugins/access.ts` | +30 | — |
| 2 | `SessionService` extension (`create` impersonate fields, `resolve` NOT EXISTS) | `services/session.ts` | +25 | +30 |
| 3 | `ImpersonationService` + `ImpersonationConfig` + events + constants | `services/impersonation.ts` (new), `services/events/auth.ts`, `constants.ts`, `types.ts` | +200 | +250 |
| 4 | GraphQL mutations + barrel + errors | `graphql/schema/impersonation/` (new), `graphql/index.ts`, `module.ts` | +100 | — |
| 5 | Drop better-auth admin plugin | `layers/better-auth/admin.ts` (delete), `layers/better-auth/index.ts` | −30 | — |

**Net** : ~325 lignes prod, −30 supprimées, ~280 tests. 1 migration additive, 0 data migration. 0 endpoint REST cassé (aucun consumer).

## Risques & mitigations

| Risque | Mitigation |
|---|---|
| `resolve` NOT EXISTS coûteux sur high-traffic | Partial index `WHERE parent_token IS NOT NULL` ; cache L1/L2 absorbe le trafic |
| Cache stale après stop (parent reste "suspended" en cache) | `invalidateCacheForToken(parentToken)` au start ET stop, test 12 couvre |
| Admin ferme l'onglet sans stop → child orphan jusqu'à TTL | TTL court (1h default, 4h max cap) ; `purgeExpired` cleanup périodique existant |
| 2 admins start sur même target simultanément | Pas un problème — chaque admin crée son child indépendamment, target a 2 sessions concurrentes ; pas d'invariant violé |
| Race start-then-stop | Effets séquentiels dans `Effect.gen` ; invalidations synchrones ; pas de race |
| FK cascade trop agressive (logout admin = kill impersonation) | Intentionnel (Q10 acté) ; UI doit recommander `stop` avant `signOut` — documenter |
| Migration sur DB avec sessions actives | Additive, NULL par défaut ; aucun row violé |
| Permission `user:impersonate` invisible aux roles existants | `AccessService.buildRoles` au boot re-matérialise admin avec la nouvelle perm ; test couvre |
| Drop admin plugin casse consumer inconnu | Vérifié 0 hits côté `apps/` et autres packages au brainstorm ; risque résiduel = REST clients externes non auditables (acceptable car aucune doc publique de ces endpoints) |

## Ordre d'exécution suggéré

1. **Migration + schema + statement** — additive, isolated.
2. **SessionService extension** — precondition for ImpersonationService.
3. **ImpersonationService + config + events** — core logic, TDD.
4. **GraphQL mutations** — user-facing surface.
5. **Drop better-auth admin plugin** — final cleanup, après que tout le flow natif soit testé et stable.

Ordre alternatif : 5 avant 4 si on veut isoler le risque drop sur un commit séparé ; décision au plan exécutable.
