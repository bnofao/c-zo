# SP4 — Admin & Access Control: native finalization — Design Spec

**Status:** Brainstormed, awaiting plan
**Date:** 2026-05-24
**Branch target:** `feat/sp1-auth` (continues SP1 / SP-B / SP-A / SP2 / SP3)

## Goal

Libérer `@czo/auth` des dernières dépendances better-auth côté **admin & access control user-scope**, et fermer le gap session-revoke sur ban + cache-invalidation sur changement de rôle. Pas de nouvelles features client-visibles — SP4 est un sprint d'infrastructure et de sécurité.

L'**impersonation** est reportée à un sprint dédié (**SP4b**) : c'est une vraie nouvelle feature avec un design model à part entière (session dérivée, audit, stop flow), qui mérite son propre cycle spec → plan.

Les **account flows** (password reset, email verification, change password) sont en **SP5**.

## Background

État au début de SP4 (post-SP3, commit `394606e1`) :

- `services/access.ts` est **majoritairement Effect-native** mais importe encore `createAccessControl` et `Role`/`Subset` de `better-auth/plugins/access` pour la matérialisation des roles/hierarchies. La méthode `AccessService.authorize` a été forkée en SP3 (`role().authorize()` set-inclusion), mais `createAccessControl` et `Role` objet restent better-auth.
- `services/user.ts` expose `ban` / `unban` / `setRole` **en natif Effect** (depuis SP1) — `UserService` publie les events `UserBanned`, `UserUnbanned`, `UserRoleChanged` via `UserEvents` (PubSub Effect-native).
- `services/user.ts:434–462` : `listSessions` / `revokeSession` / `revokeSessions` passent encore par `auth.$context.internalAdapter.{listSessions,deleteSessions}` (better-auth). Read-model et write-model session-admin sont couplés à better-auth.
- `services/session.ts` (SP1) expose déjà `revoke(token)` et `revokeAllForUser(userId)` natifs avec cache L1/L2. **Pas de `listForUser`**.
- `layers/auth.ts` : `AuthService.hasPermission` lit `auth.options.plugins.find(p=>p.id==='admin').options as AdminOptions` pour récupérer `adminUserIds` (escape hatch), `defaultRole`, et `roles`. Couplé à la config better-auth admin plugin.
- `services/auth.ts` : `AuthService` n'a qu'une seule méthode (`hasPermission`) — sa raison d'être tient à la dispatch user/org.
- **Aucune invalidation de session au ban** : un utilisateur banni reste connecté jusqu'à expiration du token. Idem pour tout changement de rôle (n'importe quelle direction) — `ResolvedSession` cache L1/L2 garde l'ancien `user.role`, les guards admin lisent stale data.
- **`adminUserIds`** : escape hatch better-auth pour forcer le rôle admin sur certains userIds, jamais persisté.

## Architecture & scope

### Livrables SP4

1. **Fork `createAccessControl`** (drop-in) dans `services/access.ts` — drop des imports `better-auth/plugins/access`.
2. **`SessionService.listForUser(userId)`** + suppression de la façade `UserService.listSessions/revokeSession/revokeSessions` — les resolvers admin appellent directement `SessionService`.
3. **Suppression du `AuthService`** — `hasPermission` éclate en `UserService.hasPermission` (user-scope, basé sur `AccessService`) et `OrganizationService.hasPermission` (org-scope, conserve le path better-auth-coupled actuel). Drop `adminUserIds` escape hatch et `AdminOptions` import.
4. **`Session.subscribersLayer`** : layer scoped qui fork un `Stream.runForEach` sur `UserEvents`. `UserBanned` → `revokeAllForUser` (full revoke + cache invalidation, l'utilisateur est déloggé). `UserRoleChanged` → nouvelle méthode `SessionService.invalidateCacheForUser` (drop L1/L2 cache uniquement, DB rows kept, la session reste vivante et la prochaine `resolve` re-fetch l'utilisateur avec le nouveau rôle). Pas de filtre direction — toute mutation de rôle invalide le cache.

### Hors scope SP4 (reportés)

- **Impersonation** (start/stop, session dérivée, `impersonatedBy` write path) — SP4b.
- **Port `checkOrgPermission`** (drop `OrganizationOptions`/`OrganizationRole` de better-auth, port du dynamic AC org-scope) — sprint AC org dédié.
- **`listUsers` admin GraphQL** — query CRUD basique, hors thématique sécurité.
- **Audit log dédié** (table, retention, queries) — délégué à OpenTelemetry via `Effect.fn` naming sur les handlers subscribers ; vraie table audit dans un sprint à part si besoin compliance.
- **Account flows** (password reset, email verification, change password) — SP5.
- **Restauration de `@czo/kit/effect`** (dette tech transversale).

### Anti-objectifs

- Pas d'ajout ni de retrait de feature client-visible. La surface GraphQL externe (queries/mutations admin) ne change pas — seules les méthodes internes du contract `UserService` changent.
- Pas de migration DB.
- Pas de port de la branche org de `hasPermission` (reportée).

## Chantier 1 — Fork `createAccessControl`

**Localisation** : `services/access.ts` (co-localisation fork ↔ service, pas de nouveau fichier).

### Surface forkée (drop-in)

```ts
export interface Role<S extends Statements = Statements> {
  readonly statements: RolePermissions<S>
  readonly authorize: (
    required: RolePermissions<S>,
    connector?: 'AND' | 'OR',
  ) => { success: boolean, error: string | null }
}

export interface AccessControl<S extends Statements> {
  readonly statements: S
  readonly newRole: (permissions: RolePermissions<S>) => Role<S>
}

export function createAccessControl<const S extends Statements>(
  statements: S,
): AccessControl<S> {
  return {
    statements,
    newRole: permissions => ({
      statements: permissions,
      authorize: (required, connector = 'AND') =>
        authorizePermissions(permissions, required, connector),
    }),
  }
}
```

### Helper pur partagé

```ts
export function authorizePermissions<S extends Statements>(
  granted: RolePermissions<S> | null | undefined,
  required: RolePermissions<S>,
  connector: 'AND' | 'OR',
): { success: boolean, error: string | null } {
  if (!granted) return { success: false, error: 'No permissions granted' }
  for (const [resource, actions] of Object.entries(required) as [string, string[]][]) {
    const grantedActions = (granted as Record<string, string[]>)[resource]
    if (!grantedActions) return { success: false, error: `Missing resource: ${resource}` }
    const hasAll = actions.every(a => grantedActions.includes(a))
    const hasAny = actions.some(a => grantedActions.includes(a))
    if (connector === 'AND' && !hasAll) return { success: false, error: `Missing actions on ${resource}` }
    if (connector === 'OR' && !hasAny) return { success: false, error: `No matching action on ${resource}` }
  }
  return { success: true, error: null }
}
```

`AccessService.authorize` (existant, retourne `boolean`) délègue à ce helper : `authorizePermissions(...).success`. Plus de duplication.

### Suppressions

```diff
- import type { Role, Subset } from 'better-auth/plugins/access'
- import { createAccessControl } from 'better-auth/plugins/access'
```

Le cast `as unknown as AccessRole<S>` (access.ts:80) disparaît : `newRole` retourne directement le bon type forké. `Subset<keyof S, S>` est structurellement équivalent à `RolePermissions<S>` qu'on a déjà.

### Re-exports inchangés

```ts
export type AccessRole<S extends Statements = Statements> = Role<S>   // alias local
// BuiltRoles.ac: AccessControl<Statements>   ← type local
```

→ callers (`module.ts`, `services/user.ts` après chantier 3, tout consommateur de `AccessService`) ne changent pas.

### Tests

- `services/access.test.ts` étendu : 4–5 cas purs sur `createAccessControl` forké (AND/OR success, missing resource, missing action, granted=null).
- Cas existants `AccessService.authorize` : pas de régression (toujours `boolean`).
- 0 changement aux tests de modules consommateurs.

### Vérification

Après ce chantier : `grep -rn "from 'better-auth/plugins/access'" packages/modules/auth/src` doit retourner 0. La dep `better-auth` reste dans `package.json` (autres layers : cookie/session/social/account/verification l'utilisent).

## Chantier 2 — `SessionService.listForUser` & drop façade `UserService`

### Ajout au contract `SessionService`

```ts
readonly listForUser: (userId: number) => Effect.Effect<
  readonly SessionRow[],
  SessionStoreFailed
>
```

Implémentation : query Drizzle directe sur `session`, filtre `userId = ? AND expiresAt > now()`, ordre `createdAt DESC`. Pas de cache (read-model admin, fréquence faible, données fraîches obligatoires).

```ts
listForUser: userId =>
  Effect.tryPromise({
    try: () => db.query.session.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    }),
    catch: cause => new SessionStoreFailed({ cause }),
  })
```

### Suppression de la façade `UserService`

Les 3 méthodes `listSessions` / `revokeSession` / `revokeSessions` sont **supprimées du contract `UserService`** :
- YAGNI : elles ne faisaient que re-mapper `SessionStoreFailed → UserDbFailed`.
- L'erreur `UserDbFailed` mentait : c'est une erreur session-store.
- Cohérence : les resolvers session-admin appellent leur service propriétaire (`SessionService`), comme les resolvers org/api-key appellent les leurs.

### Resolvers admin

Les resolvers GraphQL admin qui appellent aujourd'hui `User.UserService.{listSessions,revokeSession,revokeSessions}` basculent vers `SessionService.{listForUser,revoke,revokeAllForUser}`. La surface GraphQL externe est inchangée.

### Suppressions cascade

- `services/user.ts:434–462` : 3 blocs `Effect.tryPromise` (~30 lignes).
- Import et usage de `parseSessionOutput` (better-auth helper).
- 3 méthodes du contract `UserService`.
- 3 erreurs `UserDbFailed` correspondantes (si plus utilisées ailleurs — à vérifier).

### Tests

- `services/session.test.ts` : ajouter `listForUser` (1 user 2 sessions, filtre expired, ordre desc, user sans session → tableau vide).
- Tests `user.test.ts` pour `listSessions/revoke*` : déplacés ou supprimés.
- Tests d'intégration GraphQL : inchangés sur le contrat externe.

## Chantier 3 — Port `checkUserPermission` & suppression de `AuthService`

### Découverte

"Drop `AdminOptions`" implique de porter **toute** `checkUserPermission`, pas juste l'escape hatch `adminUserIds`. La fonction lit aussi `defaultRole` et `roles` depuis better-auth admin plugin options. Heureusement `AccessService` est déjà la source pour ça : `module.ts:130` enregistre `{ name: 'admin', statements: ADMIN_STATEMENTS, hierarchy: ADMIN_HIERARCHY }` au boot, et `buildRoles` matérialise les rôles.

### Refactor `checkUserPermission`

```ts
function checkUserPermission(
  access: typeof AccessService.Service,
  input: { permissions: Record<string, string[]>, role?: string, connector?: 'AND' | 'OR' },
): Effect.Effect<boolean> {
  return Effect.gen(function* () {
    const { permissions, role, connector = 'AND' } = input
    if (!permissions) return false

    // Multi-role support: 'admin,user' → ['admin', 'user'] ; success = any role authorizes.
    const roleNames = (role || 'user').split(',')
    for (const r of roleNames) {
      const acRole = yield* access.role(r)
      if (!acRole) continue
      const result = authorizePermissions(acRole.statements, permissions, connector)
      if (result.success) return true
    }
    return false
  })
}
```

### Suppressions

- `adminOptions?.adminUserIds?.includes(userId)` shortcut → **drop pur**. Les premiers admins se créent via seed/CLI (option B confirmée pendant brainstorm).
- `adminOptions?.defaultRole` → littéral `'user'` (cf. `module.ts:72` : enum global `['admin', 'user']`).
- `adminOptions?.roles` → `AccessService.role(name)` (matérialisé au boot).
- `userId` param de `UserPermissionInput` → supprimé (n'était utilisé que pour l'escape hatch).
- `import type { AdminOptions } from 'better-auth/plugins'` → supprimé.

### Suppression de `AuthService`

`AuthService` n'a qu'une seule méthode (`hasPermission`). En portant `checkUserPermission` au service user, et en gardant `checkOrgPermission` au service org, **`AuthService` n'a plus de raison d'être**.

#### Nouveau câblage

- `UserService.hasPermission({ role, permissions, connector? })` — branche user, dep `AccessService` uniquement.
- `OrganizationService.hasPermission({ orgId, role, permissions, connector?, allowCreatorAllPermissions?, useMemoryCache? })` — branche org, conserve la dep `BetterAuth` actuelle (port org reporté).

#### Dispatch au callsite

Le `permission` authScope dans `graphql/scopes.ts` (l'unique consommateur "dispatch") inspecte `input.organization` et choisit le service :

```ts
permission: async ({ resource, actions, organization, connector }) => {
  const role = ctx.auth.user?.role ?? undefined
  return ctx.runEffect(Effect.gen(function* () {
    if (organization) {
      const org = yield* OrganizationService
      return yield* org.hasPermission({
        orgId: organization,
        role: role ?? '',
        permissions: { [resource]: actions },
        connector,
      })
    }
    const user = yield* UserService
    return yield* user.hasPermission({
      role,
      permissions: { [resource]: actions },
      connector,
    })
  }))
}
```

Les autres callsites sont **déjà domain-scoped** :
- `graphql/schema/user/mutations.ts:72` (setRole canSetRole check) — user-scope, appelle directement `UserService.hasPermission`.

### Suppressions cascade

- `services/auth.ts` → **fichier supprimé**.
- `layers/auth.ts` → **éclaté** : `checkUserPermission` co-localisé dans `services/user.ts` (avec `UserService.hasPermission`), `checkOrgPermission` dans `services/organization.ts` (avec `OrganizationService.hasPermission`). Cohérence ownership maximale, plus de fichier intermédiaire `layers/auth.ts`.
- `services/index.ts` perd l'export `AuthService`.
- `module.ts` perd `AuthServiceLive` du `Layer.mergeAll` ; ajoute la nouvelle dep `AccessService` au layer `UserService` si pas déjà présente.

### Ordre de boot

`AccessService.buildRoles` doit avoir été appelé **avant** que `UserService.hasPermission` soit invoqué. Aujourd'hui `module.ts` enregistre les statements et appelle `buildRoles` dans le `czo:boot` hook — l'ordre est garanti. À documenter via commentaire dans le layer.

### Tests

- `services/user.test.ts` : nouvelle suite `UserService.hasPermission` (rôle inconnu, success/failure, multi-rôle).
- `services/organization.test.ts` : tests existants de `checkOrgPermission` portés à `OrganizationService.hasPermission` (signature inchangée, juste re-localisation).
- `layers/auth.test.ts` (si existant) : supprimé.
- Tests d'intégration `permission` authScope : vérifient que le dispatch fonctionne (org + user).

## Chantier 4 — Subscribers layer auto-revoke

### Localisation

`services/session.ts`, en-dessous du `layer` principal. Co-localisation contract ↔ wiring mais **séparé du Tag** (pas dans `Context.Service` — c'est du boot, pas une API publique).

### Implementation

```ts
// services/session.ts (append)

import { Stream } from 'effect'
import { UserEvents, type UserEvent } from './events/user'

const onUserBanned = Effect.fn('sessions.subscribers.user-banned')(
  function* (e: Extract<UserEvent, { _tag: 'UserBanned' }>) {
    const sessions = yield* SessionService
    yield* sessions.revokeAllForUser(e.userId)
  },
)

const onUserRoleChanged = Effect.fn('sessions.subscribers.user-role-changed')(
  function* (e: Extract<UserEvent, { _tag: 'UserRoleChanged' }>) {
    const sessions = yield* SessionService
    yield* sessions.invalidateCacheForUser(e.userId)
  },
)

export const subscribersLayer = Layer.scopedDiscard(
  Effect.gen(function* () {
    const events = yield* UserEvents
    yield* Effect.forkScoped(
      Stream.runForEach(events.subscribe, e =>
        e._tag === 'UserBanned' ? onUserBanned(e)
          : e._tag === 'UserRoleChanged' ? onUserRoleChanged(e)
          : Effect.void,
      ),
    )
  }),
)
```

### Points de design

- **`Layer.scopedDiscard` + `Effect.forkScoped`** : le fiber est rattaché au Scope du Layer. Au `ManagedRuntime.dispose()` (shutdown Nitro), la souscription est annulée proprement — pas de leak. Choix critique vs `forkDetach` qui survivrait au dispose.
- **Single stream, dispatch interne** : un seul `Stream.runForEach` qui dispatch via `e._tag`, plutôt que deux forks parallèles. Plus simple, garantit l'ordre, un seul consumer PubSub.
- **`Effect.fn(name)`** : nomme les spans. OTel wired → traces visibles ; non wired → no-op. Audit délégué à la telemetry existante.
- **Pas de filtre direction** : tout `UserRoleChanged` invalide le cache, qu'il s'agisse d'un downgrade (admin → user) ou d'un upgrade (user → admin) ou d'un sideways. Raison : le `ResolvedSession.user.role` cached est stale dans **tous** les cas. Filtrer ne changerait que la fréquence d'invalidation, pas la correctness. Et un upgrade non-invalidé laisserait l'utilisateur attendre l'expiration du cache avant de pouvoir utiliser ses nouveaux pouvoirs — UX dégradée pour aucun bénéfice.
- **Pas de handler `UserUnbanned`** : pas de session à invalider, l'utilisateur sign-in à nouveau.
- **Pas de handler `UserDeleted`** : `UserService.delete` doit gérer le cleanup cascade (à vérifier au moment de l'impl ; si gap, ajouter — sinon hors scope).

### Branchement `module.ts`

```ts
Layer.mergeAll(
  // ... existing
  Session.layer,
  Session.subscribersLayer,   // ← nouveau
)
```

### Tests

1. **`listForUser`** (chantier 2) : 1 user 2 sessions → 2 ordonnées desc ; session expirée → exclue ; user sans session → tableau vide.
2. **`invalidateCacheForUser`** (chantier 2) : warm cache via `resolve`, appel `invalidateCacheForUser`, vérifier que DB rows kept (`listForUser` retourne toujours la session) et que `resolve` continue de fonctionner (re-fetch fresh). No-op sur user sans session.
3. **`subscribersLayer` × ban** : publish `UserBanned({ userId: 42 })`, assert `revokeAllForUser(42)` invoqué (vérifie via `listForUser` après).
4. **`subscribersLayer` × role-changed** : publish `UserRoleChanged({ userId, previousRole: 'admin', newRole: 'user' })`, assert session **toujours présente** (`listForUser` retourne 1) — `invalidateCacheForUser` ne supprime pas la DB row. Pareil en upgrade (`'user' → 'admin'`). Pareil en sideways (`'user' → 'user'` — handler s'exécute mais c'est un no-op effectif).
5. **Lifecycle** : `Scope.close` → fiber annulé, plus de revoke sur events postérieurs (smoke test cleanup).

Cas (2)–(3) en intégration avec un `UserEvents` réel (PubSub) + `SessionService` réel sur testcontainers Postgres — pattern SP1/SP3.

## Recap & effort

| # | Chantier | Fichier(s) principaux | LoC prod | LoC tests |
|---|---|---|---|---|
| 1 | Fork `createAccessControl` | `services/access.ts` | +50 / −10 | +60 |
| 2 | `SessionService.listForUser` + `invalidateCacheForUser` + drop façade | `services/session.ts`, `services/user.ts`, resolvers admin | +50 / −50 | +60 |
| 3 | Port `checkUserPermission` à `AccessService` + suppression de `AuthService` | `services/auth.ts` (delete), `layers/auth.ts` (split), `services/user.ts`, `services/organization.ts`, `graphql/scopes.ts`, `user/mutations.ts`, `module.ts`, `services/index.ts` | +80 / −120 | +30 |
| 4 | Subscribers layer (ban full revoke + role-change cache invalidation) | `services/session.ts`, `module.ts` | +50 | +80 |

**Net** : ~230 lignes prod ajoutées, ~180 supprimées, ~280 lignes de tests. Pas de migration DB. Aucune surface GraphQL externe modifiée. 0 import `better-auth/plugins/access` après chantier 1, 0 import `AdminOptions` après chantier 3.

## Risques & mitigations

| Risque | Mitigation |
|---|---|
| Fork `createAccessControl` introduit une divergence subtile avec better-auth | Tests unitaires purs sur les 5 cas standards (AND/OR, missing res, missing action, success, granted null) ; surface API strictement identique (drop-in) |
| `SessionService.listForUser` retourne une shape différente de `parseSessionOutput` | Type `SessionRow` (Drizzle natif) déjà utilisé partout depuis SP1 ; aucun caller ne lit la shape transformée better-auth |
| Suppression `AuthService` casse un callsite oublié | `grep -rn AuthService packages/modules/auth/src` après refactor — doit retourner 0 hors histoire git |
| Subscribers leak un fiber au shutdown | `Effect.forkScoped` au lieu de `forkDetach` (choix de design explicite) ; test lifecycle dédié |
| Race condition entre ban UPDATE et subscriber revoke | Acceptable : fenêtre courte (publish synchrone après UPDATE), pas de "stale auth" exploitable car la session L1/L2 sera invalidée dans la milliseconde suivante. Si pas acceptable plus tard, on bascule sur appel direct sync dans `UserService.ban` |
| `checkUserPermission` lookup `access.role(r)` sur rôle inconnu | Retourne `undefined`, boucle continue, fallback `return false`. Cas testé. |

## Ordre d'exécution suggéré

1. Chantier 1 (fork AC) — autonome, plus petit, pas de dépendance.
2. Chantier 4 (subscribers) — autonome, design greenfield, peut être testé seul.
3. Chantier 2 (listForUser + drop façade) — autonome, touche 2 services.
4. Chantier 3 (port + drop AuthService) — touche le plus de fichiers, à faire en dernier sur une base stable.

Ordre alternatif : 1 → 3 → 2 → 4 si on veut consolider tout le coupling-drop-better-auth d'abord. Décision finale au plan exécutable.
