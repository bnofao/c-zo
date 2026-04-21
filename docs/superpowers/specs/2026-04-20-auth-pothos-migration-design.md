# Design — Migration `@czo/auth` vers Pothos

**Date** : 2026-04-20
**Scope** : Module `@czo/auth` uniquement
**Dépendance d'ordre** : `@czo/kit` doit être migré **avant** ce module. `@czo/stock-location` migre **après** ce module (décision B).

---

## 1. Contexte & motivation

### État actuel

- **7 sous-schémas** GraphQL (`user`, `organization`, `account`, `api-key`, `two-factor`, `app`, `base`) — ~560 LoC de `.graphql`
- **5 services** existants (~2000 LoC + ~3000 LoC tests) :
  - `user.service.ts` (356 LoC) — `UserRepository extends Repository` + `hasPermission(userId, ...)` (check admin + roles). Le wrapping better-auth **a été supprimé** (lignes 83-316 commentées).
  - `organization.service.ts` (509 LoC) — `OrganizationRepository extends Repository` + `hasPermission(orgId, ...)` **complexe** : merge static roles (`orgOptions.roles`) + dynamic DB roles (table `organizationRole` via better-auth adapter), memory cache (`cacheOrgRoles`), creator role bypass (`allowCreatorAllPermissions`), multi-role dispatch (`role.split(',')`).
  - `auth.service.ts` (552 LoC) — `createAuthService` expose `account` (Repository CRUD), `session` (Repository read-only, writes exclus), `hasPermission` (dispatcher user/org), `getSession`, `accessControl`, `roles`.
  - `apiKey.service.ts` (121 LoC) — wrap better-auth.
  - `app.service.ts` (312 LoC) — CRUD pur, pas de better-auth.
- **14 fichiers** `config/auth/*` pour better-auth (admin, organization, apiKey, twoFactor, social, etc.)
- **Listeners** : `app-consumer`, `webhook-dispatcher`
- **better-auth** gère : sessions, password hashing, 2FA, OAuth, API keys, verifications

### Problèmes

1. **~20 erreurs TypeScript** bloquantes dans les resolvers GraphQL (méthodes `impersonate`, `setRole`, `stopImpersonating`, `getUser`, `listUsers`, etc. référencées mais absentes des services — drift schéma↔code). Cf. `middleware/index.ts:10-11` et `schema/user/resolvers/Mutation/*.ts`.
2. **Pattern incohérent services** : `user.service` = Repository, `auth.service.account` = Repository, `auth.service.session` = Repository read-only, `apiKey.service` = wrap better-auth, `app.service` = CRUD direct. Pas de règle claire pour quoi passe par quoi.
3. **552 LoC dans `auth.service`** mélangeant primitives partagées, CRUD accounts, sessions, 2FA — difficile à naviguer et à tester.
4. **Middlewares `graphql-middleware` arrays rejetés** par TypeScript (`IMiddlewareFieldMap` n'accepte pas les arrays pour un field).
5. **`Repository<T>`** générique de 935 LoC dans kit qu'on veut supprimer (décision B' du brainstorm).

### Objectif

Migrer `auth` vers Pothos + plugin-drizzle + plugin-relay + plugin-errors + plugin-scope-auth + plugin-zod + plugin-tracing, avec :

- Services réécrits en Drizzle direct (via les helpers `@czo/kit/db`), sauf flows qui doivent passer par better-auth (sessions write, password, 2FA, OAuth).
- Découpage de `auth.service.ts` en `account.service.ts`, `session.service.ts`, `twoFactor.service.ts`, et un `auth.service.ts` réduit aux primitives.
- 7 sous-modules Pothos mirrorés dans `graphql/schema/<sub>/{types,inputs,queries,mutations,errors}.ts`.
- Suppression complète du codegen, des middlewares, des directives, et des resolvers schema-first.

---

## 2. Décisions actées (brainstorm 2026-04-20)

Héritées des décisions kit + spécifiques à auth :

| # | Décision | Valeur |
|---|---|---|
| Scope | Plan de migration complet | **C** |
| Stratégie | Kit → **auth** → stock-location (sans commits) | **D** |
| Contrat API GraphQL | Liberté totale de breaking changes | **D** |
| Couche données | Repository supprimé, helpers micro-ciblés | **B'** |
| better-auth | Reste source de vérité runtime | **A** |
| Erreurs GraphQL | Typed errors via unions (`@pothos/plugin-errors`) | **B** |
| Ordre auth | Tout en bloc, pas de phases | **D** |
| Découpage services | `auth.service` scindé en `auth` + `account` + `session` + `twoFactor` | ✓ |
| Orientation migration | User CRUD = Drizzle direct (pas better-auth admin API) | ✓ |
| Old/ convention | Fichiers déplacés dans `old/` avant suppression/modification | ✓ |

---

## 3. Architecture

### 3.1 Sous-modules et leur rôle

| Sous-module | Mutations | Queries | Entités DB principales | better-auth dépendant |
|---|---|---|---|---|
| **user** | createUser, updateUser, banUser, unbanUser, setRole, setUserPassword, removeUser, impersonateUser, stopImpersonation, revokeSession, revokeSessions | user, users (connection), userSessions | users, sessions | ⚠️ partiel (session cascade, password hashing) |
| **organization** | createOrganization, updateOrganization, deleteOrganization, inviteMember, acceptInvitation, rejectInvitation, cancelInvitation, removeMember, updateMemberRole, setActiveOrganization, leaveOrganization | organization, organizations, checkSlug, members, invitation, invitations, myInvitations, activeMember, activeMemberRole | organizations, members, invitations | ❌ |
| **account** | changeEmail, changePassword, revokeMySession, revokeOtherSessions, unlinkAccount, updateProfile, deleteAccount | me, accountInfo, myAccounts, mySessions | accounts, sessions | ✅ (changeEmail flow, changePassword, unlink OAuth) |
| **api-key** | createApiKey, deleteApiKey, updateApiKey | apiKey, myApiKeys | apiKeys | ✅ |
| **two-factor** | enableTwoFactor, disableTwoFactor, verifyTotp, verifyOtp, sendOtp, verifyBackupCode, generateBackupCodes | totpUri | twoFactors | ✅ |
| **app** | installApp, uninstallApp, updateAppManifest, setAppStatus | app, apps, appBySlug | apps, webhookDeliveries | ❌ |
| **base** | — | node(id) | — | — |

~50 mutations, ~20 queries.

### 3.2 Layout de fichiers cible

```
packages/modules/auth/src/
├── config/                              # (inchangé — 14 fichiers better-auth)
├── database/                            # (inchangé — schema.ts, relations.ts)
├── listeners/                           # (inchangé — app-consumer, webhook-dispatcher)
├── services/
│   ├── user.service.ts                  # 🔄 REWRITE — Drizzle direct + auth.internal.hashPassword + session cascade
│   ├── organization.service.ts          # 🔄 REWRITE — Drizzle direct + members + invitations
│   ├── account.service.ts               # ✨ NEW — extrait du `auth.service.account` + wrappers better-auth
│   ├── session.service.ts               # ✨ NEW — extrait du `auth.service.session` (reads Drizzle, writes via auth.api)
│   ├── twoFactor.service.ts             # ✨ NEW — flows 2FA via auth.api
│   ├── apiKey.service.ts                # 🔄 adapté (wrap better-auth + mapAPIError)
│   ├── app.service.ts                   # 🔄 REWRITE — Drizzle direct + events
│   ├── auth.service.ts                  # 🔄 REDUIT (~150 LoC) — hasPermission dispatcher, getSession, accessControl, roles
│   └── index.ts                         # 🔄 exporte toutes les factories
├── graphql/
│   ├── index.ts                         # ✨ re-export registerAuthSchema
│   ├── context-factory.ts               # 🔄 REWRITE — buildAuthContext (nouvelle forme ctx.auth)
│   ├── schema/
│   │   ├── user/
│   │   │   ├── types.ts                 # ✨ User (drizzleNode), UserConnection, UserOrderField
│   │   │   ├── inputs.ts                # ✨ CreateUser/UpdateUser/BanUser inputs + zod
│   │   │   ├── queries.ts               # ✨ user, users, userSessions
│   │   │   ├── mutations.ts             # ✨ 11 mutations user
│   │   │   ├── errors.ts                # ✨ CannotBanSelfError, CannotDemoteSelfError, UserAlreadyBannedError
│   │   │   └── index.ts                 # ✨ registerUserSchema
│   │   ├── organization/                # mêmes 6 fichiers
│   │   ├── account/                     # mêmes 6 fichiers
│   │   ├── api-key/                     # mêmes 6 fichiers
│   │   ├── two-factor/                  # mêmes 6 fichiers
│   │   ├── app/                         # mêmes 6 fichiers
│   │   └── index.ts                     # ✨ registerAuthSchema + type AuthBuilder
│   ├── middleware/                      # ❌ DELETED (→ old/)
│   ├── resolvers.ts                     # ❌ DELETED (→ old/)
│   ├── typedefs.ts                      # ❌ DELETED (→ old/)
│   ├── schema.generated.graphqls        # ❌ DELETED (→ old/)
│   ├── schema/base/                     # ❌ DELETED (→ old/)
│   ├── schema/<sub>/schema.graphql      # ❌ DELETED (→ old/)
│   ├── schema/<sub>/resolvers/          # ❌ DELETED (→ old/)
│   ├── directives.ts                    # ❌ DELETED (→ old/)
│   └── __generated__/                   # ❌ DELETED (→ old/)
├── plugins/
│   └── index.ts                         # 🔄 remplace import side-effect + IoC bindings consolidés
├── module.ts                            # (inchangé — defineNitroModule)
└── types.ts                             # 🔄 REWRITE — nouvelle forme AuthContext
```

~40 fichiers créés, ~80 supprimés (→ old/), ~10 modifiés (→ copie dans old/ avant édition).

### 3.3 Découpage services post-migration

| Service | Responsabilité | ~LoC estimées |
|---|---|---|
| `auth.service.ts` | `hasPermission` (dispatcher), `getSession`, `accessControl`, `roles` | ~150 |
| `user.service.ts` | User CRUD Drizzle direct + password hashing better-auth + session cascade | ~250 |
| `organization.service.ts` | Org CRUD + members + invitations Drizzle direct + `hasPermission(orgId, ...)` | ~350 |
| `account.service.ts` | My-account flows — reads Drizzle, writes via better-auth (changeEmail, changePassword, unlinkAccount) | ~200 |
| `session.service.ts` | Reads Drizzle (`listByUser`, `find`), writes via `auth.api` (revoke, revokeAll) | ~100 |
| `twoFactor.service.ts` | Flows 2FA via `auth.api.*` + `mapAPIError` | ~180 |
| `apiKey.service.ts` | Wrap better-auth apiKey + `mapAPIError` | ~120 |
| `app.service.ts` | App CRUD + manifest + webhooks (pas de better-auth) | ~250 |
| **Total** | | **~1600 LoC** (vs 2000 aujourd'hui, -20%) |

---

## 4. Stratégie services — patterns

### 4.1 Principe

| Opération | Implémentation |
|---|---|
| User/Org/App CRUD (create, update, ban, setRole, remove) | **Drizzle direct** via services |
| Password hashing, reset, email verification | **better-auth** (`auth.internal.hashPassword`, `auth.api.changeEmail`) |
| Session create, revoke, list, impersonate | **better-auth** (session state) |
| 2FA setup, TOTP, OTP, backup codes | **better-auth** |
| OAuth link, unlink, social flows | **better-auth** |
| API key generation, revocation | **better-auth** (gère la table `apiKeys`) |
| Permissions (`hasPermission`) | **auth.service** wrappant access-control de better-auth |

### 4.2 Helper `mapAPIError` — kit-local

```ts
// packages/modules/auth/src/services/_internal/map-error.ts
import { APIError } from 'better-auth'
import { ValidationError, NotFoundError, ConflictError, ForbiddenError, UnauthenticatedError } from '@czo/kit/graphql'

export function mapAPIError(err: unknown, resource: string): never {
  if (err instanceof APIError) {
    switch (err.status) {
      case 'BAD_REQUEST':
        throw new ValidationError(
          [{ path: 'root', message: err.message, code: err.body?.code ?? 'BAD_REQUEST' }],
          err.message,
        )
      case 'NOT_FOUND':
        throw new NotFoundError(resource, err.body?.id ?? 'unknown')
      case 'UNAUTHORIZED':
        throw new UnauthenticatedError(err.message)
      case 'FORBIDDEN':
        throw new ForbiddenError(err.body?.required ?? resource)
      case 'CONFLICT':
        throw new ConflictError(resource, err.body?.field ?? 'unknown', err.message)
    }
  }
  throw err
}
```

Appelé **dans chaque méthode** qui wrap `auth.api.*` (pas un middleware global — explicite pour la lisibilité).

### 4.3 Exemple `user.service.ts`

```ts
import type { Auth } from '../config'
import type { Database } from '@czo/kit/db'
import { and, eq, sql } from 'drizzle-orm'
import { notDeleted, optimisticUpdate, toDatabaseError } from '@czo/kit/db'
import { users, sessions } from '../database/schema'
import { publishAuthEvent } from '../events/auth-events'
import { AUTH_EVENTS } from '../events/types'
import { mapAPIError } from './_internal/map-error'

export interface CreateUserInput {
  email: string
  name: string
  password?: string
  role?: string | string[]
}

export interface BanUserInput {
  userId: number
  version: number
  banReason?: string
  banExpiresIn?: number
}

export function createUserService(db: Database, auth: Auth) {
  return {
    // ── Reads — Drizzle direct ──

    async find(opts: { id: number }) {
      const [row] = await db.select().from(users)
        .where(notDeleted(users, eq(users.id, opts.id))).limit(1)
      return row ?? null
    },

    async exists(opts: { where: { id?: number; email?: string } }) {
      const conditions = []
      if (opts.where.id !== undefined) conditions.push(eq(users.id, opts.where.id))
      if (opts.where.email !== undefined) conditions.push(eq(users.email, opts.where.email))
      const [row] = await db.select({ id: users.id }).from(users)
        .where(notDeleted(users, conditions.length > 0 ? and(...conditions) : undefined))
        .limit(1)
      return !!row
    },

    hasPermission(opts: {
      auth: Auth
      userId: string | number
      permissions: Record<string, string[]>
      role?: string
      connector?: 'AND' | 'OR'
    }) {
      // Logique existante — préservée identique (AdminOptions check, role dispatch)
      const { auth, userId, permissions, role, connector = 'AND' } = opts
      const adminOptions = auth.options.plugins.find(
        (p: { id: string }) => p.id === 'admin',
      )?.options as AdminOptions | undefined

      if (adminOptions?.adminUserIds?.includes(String(userId))) return true
      if (!permissions) return false

      const roles = (role || adminOptions?.defaultRole || 'user').split(',')
      const acRoles = adminOptions?.roles || {}
      for (const r of roles) {
        const acRole = acRoles[r as keyof typeof acRoles]
        const result = acRole?.authorize(permissions, connector)
        if (result?.success) return true
      }
      return false
    },

    // ── Writes Drizzle direct (CRUD métier) ──

    async create(input: CreateUserInput, actorId: number) {
      return db.transaction(async (tx) => {
        try {
          const hashedPassword = input.password
            ? await auth.internal.hashPassword(input.password)
            : undefined

          const [user] = await tx.insert(users).values({
            email: input.email.toLowerCase(),
            name: input.name.trim(),
            password: hashedPassword,
            role: Array.isArray(input.role) ? input.role.join(',') : input.role ?? 'user',
          }).returning()

          await publishAuthEvent(AUTH_EVENTS.USER_CREATED, {
            userId: String(user.id),
            createdBy: String(actorId),
          })
          return user
        }
        catch (err) { throw toDatabaseError(err) }
      })
    },

    async update(userId: number, expectedVersion: number, input: Partial<Pick<typeof users.$inferInsert, 'name' | 'email'>>) {
      const updated = await optimisticUpdate({
        db, table: users, id: userId, expectedVersion,
        values: {
          ...(input.name !== undefined && { name: input.name.trim() }),
          ...(input.email !== undefined && { email: input.email.toLowerCase() }),
        },
      })
      await publishAuthEvent(AUTH_EVENTS.USER_UPDATED, {
        userId: String(userId),
        changes: Object.keys(input),
      })
      return updated
    },

    async ban(input: BanUserInput, actorId: number) {
      const updated = await optimisticUpdate({
        db, table: users, id: input.userId, expectedVersion: input.version,
        values: {
          banned: true,
          banReason: input.banReason ?? 'No reason',
          banExpires: input.banExpiresIn ? new Date(Date.now() + input.banExpiresIn * 1000) : null,
        },
      })
      // Side-effect: révoquer toutes les sessions via better-auth
      try {
        await auth.api.revokeUserSessions({ body: { userId: String(input.userId) } })
      }
      catch (err) { mapAPIError(err, 'Session') }

      await publishAuthEvent(AUTH_EVENTS.USER_BANNED, {
        userId: String(input.userId),
        bannedBy: String(actorId),
        reason: input.banReason ?? null,
        expiresIn: input.banExpiresIn ?? null,
      })
      return updated
    },

    async unban(userId: number, expectedVersion: number, actorId: number) {
      const updated = await optimisticUpdate({
        db, table: users, id: userId, expectedVersion,
        values: { banned: false, banReason: null, banExpires: null },
      })
      await publishAuthEvent(AUTH_EVENTS.USER_UNBANNED, {
        userId: String(userId),
        unbannedBy: String(actorId),
      })
      return updated
    },

    async setRole(userId: number, expectedVersion: number, role: string | string[]) {
      const roleStr = Array.isArray(role) ? role.join(',') : role
      return optimisticUpdate({
        db, table: users, id: userId, expectedVersion,
        values: { role: roleStr },
      })
    },

    async setPassword(userId: number, expectedVersion: number, newPassword: string) {
      const hashed = await auth.internal.hashPassword(newPassword)
      return optimisticUpdate({
        db, table: users, id: userId, expectedVersion,
        values: { password: hashed },
      })
    },

    async remove(userId: number, expectedVersion: number) {
      return optimisticUpdate({
        db, table: users, id: userId, expectedVersion,
        values: { deletedAt: sql`NOW()` as any },
      })
    },

    // ── Sessions & impersonation — better-auth ──

    async impersonate(userId: number, headers?: Headers) {
      try {
        return await auth.api.impersonateUser({ body: { userId: String(userId) }, headers })
      }
      catch (err) { mapAPIError(err, 'User') }
    },

    async stopImpersonating(headers: Headers) {
      try {
        return await auth.api.stopImpersonating({ headers })
      }
      catch (err) { mapAPIError(err, 'Session') }
    },
  }
}

export type UserService = ReturnType<typeof createUserService>
```

### 4.4 Autres services — patterns identiques

- `organization.service` — Drizzle direct + events (org.created, member.added, invitation.sent, etc.) + `hasPermission(orgId, ...)` **préservé à l'identique** (dynamicAccessControl, cacheOrgRoles, creatorRole bypass, multi-role — voir §8 risques)
- `account.service` — Reads Drizzle (me, accountInfo), writes via `auth.api.*` (changeEmail, changePassword)
- `session.service` — Reads Drizzle (find, listByUser), writes via `auth.api.*` (revoke, revokeAll)
- `twoFactor.service` — Entièrement wrappé `auth.api.*` + mapAPIError
- `apiKey.service` — Entièrement wrappé `auth.api.*` + mapAPIError
- `app.service` — Drizzle direct + events (installed, uninstalled, manifestUpdated, statusChanged)
- `auth.service` — Dispatcher hasPermission + primitives

---

## 5. Conventions cross-cutting

### 5.1 Context factory — forme de `ctx.auth`

```ts
// types.ts
export interface AuthContext {
  // 8 services
  userService: UserService
  organizationService: OrganizationService
  accountService: AccountService
  sessionService: SessionService
  twoFactorService: TwoFactorService
  apiKeyService: ApiKeyService
  appService: AppService
  authService: AuthService

  // Identité résolue
  session: Session | null
  user: User | null
}

export interface GraphQLContext {
  request: Request
  auth: AuthContext
}
```

### 5.2 `context-factory.ts` — hydratation

```ts
import { useContainer } from '@czo/kit/ioc'
import type { GraphQLContext, AuthContext } from '../types'

export async function buildAuthContext(request: Request): Promise<AuthContext> {
  const container = useContainer()
  const [
    userService, organizationService, accountService, sessionService,
    twoFactorService, apiKeyService, appService, authService,
  ] = await Promise.all([
    container.make('auth:users'),
    container.make('auth:organizations'),
    container.make('auth:accounts'),
    container.make('auth:sessions'),
    container.make('auth:twoFactor'),
    container.make('auth:apikeys'),
    container.make('auth:apps'),
    container.make('auth:service'),
  ])

  const session = await authService.getSession(request.headers)
  return {
    userService, organizationService, accountService, sessionService,
    twoFactorService, apiKeyService, appService, authService,
    session,
    user: session?.user ?? null,
  }
}
```

### 5.3 Template `drizzleNode` — `User` (exemple)

```ts
builder.drizzleNode('users', {
  name: 'User',
  id: { column: (u) => u.id },
  fields: (t) => ({
    email: t.exposeString('email'),
    name: t.exposeString('name'),
    emailVerified: t.exposeBoolean('emailVerified'),
    role: t.string({ resolve: (u) => u.role ?? 'user' }),
    banned: t.exposeBoolean('banned', { nullable: true }),
    banReason: t.exposeString('banReason', { nullable: true }),
    banExpires: t.expose('banExpires', { type: 'DateTime', nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    version: t.exposeInt('version'),

    sessions: t.relatedConnection('sessions'),
    accounts: t.relation('accounts'),

    activeSessionCount: t.int({
      select: {
        extras: {
          activeSessionCount: (user, { sql }) =>
            sql<number>`(SELECT count(*) FROM sessions WHERE user_id = ${user.id} AND revoked_at IS NULL)`.as('active_session_count'),
        },
      },
      resolve: (u: any) => u.activeSessionCount,
    }),
  }),
})
```

### 5.4 Template mutation — `banUser` (exemple)

```ts
builder.mutationField('banUser', (t) =>
  t.field({
    type: 'User',
    errors: { types: [NotFoundError, OptimisticLockError, ForbiddenError, CannotBanSelfError] },
    args: {
      id: t.arg.globalID({ required: true, for: ['User'] }),
      version: t.arg.int({ required: true }),
      reason: t.arg.string(),
      expiresIn: t.arg.int(),
    },
    authScopes: { permission: { resource: 'user', actions: ['ban'] } },
    resolve: async (_r, { id, version, reason, expiresIn }, ctx) => {
      const userId = Number(id.id)
      if (ctx.auth.user?.id === String(userId)) {
        throw new CannotBanSelfError()
      }
      const existing = await ctx.auth.userService.find({ id: userId })
      if (!existing) throw new NotFoundError('User', userId)
      return ctx.auth.userService.ban({
        userId, version,
        banReason: reason ?? undefined,
        banExpiresIn: expiresIn ?? undefined,
      }, Number(ctx.auth.user!.id))
    },
  }),
)
```

### 5.5 Classes d'erreur domain-specific

Par sous-module (vivent dans `graphql/schema/<sub>/errors.ts`) :

| Sous-module | Classes d'erreur |
|---|---|
| **user** | `CannotBanSelfError`, `CannotDemoteSelfError`, `UserAlreadyBannedError` |
| **organization** | `CannotLeaveAsLastOwnerError`, `InvitationExpiredError`, `MembershipAlreadyExistsError`, `SlugAlreadyTakenError` |
| **account** | `PasswordMismatchError`, `AccountAlreadyLinkedError`, `CannotUnlinkLastAccountError` |
| **api-key** | `ApiKeyExpiredError`, `ApiKeyRevokedError` |
| **two-factor** | `TotpVerificationFailedError`, `BackupCodeInvalidError`, `TwoFactorNotEnabledError` |
| **app** | `AppHandleTakenError`, `AppManifestInvalidError`, `AppNotInstalledError` |

Chacune étend `BaseGraphQLError` de kit, est enregistrée dans un `registerXxxErrors(builder)` appelé en premier dans le `register<Sub>Schema(builder)`.

### 5.6 Events

Publiés **dans les services** (une seule source pour les side-effects). Les resolvers ne font plus d'appel `publishAuthEvent` — ils déléguent tout au service. Les events `auth.*` existants (`USER_CREATED`, `USER_BANNED`, `USER_UPDATED`, etc.) restent inchangés dans leur type.

### 5.7 Orchestration — `registerAuthSchema`

```ts
// graphql/schema/index.ts
import type { CZOBuilder } from '@czo/kit/graphql'
import type { Database } from '@czo/kit/db'
import type { Relations } from '../../relations'
import type { GraphQLContext } from '../../types'

import { registerUserSchema } from './user'
import { registerOrganizationSchema } from './organization'
import { registerAccountSchema } from './account'
import { registerApiKeySchema } from './api-key'
import { registerTwoFactorSchema } from './two-factor'
import { registerAppSchema } from './app'

export type AuthBuilder = CZOBuilder<Database, Relations, GraphQLContext>

export function registerAuthSchema(builder: AuthBuilder) {
  registerUserSchema(builder)
  registerOrganizationSchema(builder)
  registerAccountSchema(builder)
  registerApiKeySchema(builder)
  registerTwoFactorSchema(builder)
  registerAppSchema(builder)
}
```

Chaque sous-module suit le même pattern :

```ts
// graphql/schema/user/index.ts
export function registerUserSchema(builder: AuthBuilder) {
  registerUserErrors(builder)     // d'abord — utilisé par mutations
  registerUserTypes(builder)
  registerUserInputs(builder)
  registerUserQueries(builder)
  registerUserMutations(builder)
}
```

### 5.8 Plugin runtime — `plugins/index.ts` mis à jour

```ts
nitroApp.hooks.hook('czo:boot', async () => {
  // ... (existant : better-auth init, access service, actor service)

  const container = useContainer()
  const auth = await container.make('auth')
  const db = await useDatabase()

  // Services — 8 factories
  const userService = createUserService(db, auth)
  const organizationService = createOrganizationService(db, auth)
  const accountService = createAccountService(db, auth)
  const sessionService = createSessionService(db, auth)
  const twoFactorService = createTwoFactorService(auth)
  const apiKeyService = createApiKeyService(auth)
  const appService = createAppService(db)
  const authService = createAuthService(db, auth, userService, organizationService)

  container.singleton('auth:users', () => userService)
  container.singleton('auth:organizations', () => organizationService)
  container.singleton('auth:accounts', () => accountService)
  container.singleton('auth:sessions', () => sessionService)
  container.singleton('auth:twoFactor', () => twoFactorService)
  container.singleton('auth:apikeys', () => apiKeyService)
  container.singleton('auth:apps', () => appService)
  container.singleton('auth:service', () => authService)

  // ✨ Nouveau — remplace `await import('@czo/auth/graphql')`
  registerSchema(registerAuthSchema)
})
```

---

## 6. Stratégie de tests

### 6.1 Matrice

| Cible | Type | DB | Fichier |
|---|---|---|---|
| `userService.find/exists/hasPermission` | Unit (SQL gen) | ❌ | `services/user.service.test.ts` |
| `userService.create/update/ban/unban/setRole/setPassword/remove` — transactions, optimistic lock, cascade | **Intégration** | ✅ | idem |
| `userService.impersonate/stopImpersonating` (wrap better-auth) | Unit (mock `auth.api`) | ❌ | idem |
| `organizationService.*` — hasPermission(orgId), members, invitations | **Intégration** | ✅ | `services/organization.service.test.ts` |
| `accountService.changeEmail/changePassword` (wrap better-auth) | Unit (mock) | ❌ | `services/account.service.test.ts` |
| `sessionService.listByUser/find` | **Intégration** | ✅ | `services/session.service.test.ts` |
| `sessionService.revoke/revokeAll` (wrap better-auth) | Unit | ❌ | idem |
| `twoFactorService.*` — flows 2FA | Unit (mock better-auth) | ❌ | `services/twoFactor.service.test.ts` |
| `apiKeyService.*` | Unit (mock) | ❌ | `services/apiKey.service.test.ts` |
| `appService.*` | **Intégration** | ✅ | `services/app.service.test.ts` |
| `authService.hasPermission` dispatcher | Unit (mock user/org services) | ❌ | `services/auth.service.test.ts` |
| Resolvers mutations (errors, authScopes, validation) | **Intégration GraphQL** | ✅ | `graphql/schema/<sub>/mutations.test.ts` |
| Resolvers queries (filters, connection, cross-module ref `Organization`) | **Intégration GraphQL** | ✅ | `graphql/schema/<sub>/queries.test.ts` |

**Ratio** : ~45% unit, ~55% intégration.

### 6.2 Réécriture des tests existants

Les 5 fichiers `*.service.test.ts` actuels (~3000 LoC) sont réécrits **de zéro** :

- Ancien : `createMockApi()` + `vi.fn()` pour chaque méthode better-auth
- Nouveau : `createTestDb()` de `@czo/kit/testing` + mocks ciblés de `auth.api.*` uniquement pour les méthodes wrappées

Pas de rétroportage — le pattern a trop changé. Gain net : les tests deviennent plus représentatifs de la production (vraies requêtes Drizzle contre vraie DB).

---

## 7. Checklist de migration

### 7.1 Convention `old/` — safety net

Tous les fichiers à **supprimer** ou **modifier** sont d'abord copiés/déplacés dans `packages/modules/auth/old/<path>` (miroir de la structure originelle). Le dossier `old/` est supprimé en **dernière étape**.

### 7.2 Pre-refactor — préservation `old/`

- [ ] `mkdir -p packages/modules/auth/old/{graphql/{middleware,schema},services,plugins}`
- [ ] Copier les fichiers à **modifier** vers `old/` :
  - `services/user.service.ts` → `old/services/user.service.ts`
  - `services/organization.service.ts` → `old/services/organization.service.ts`
  - `services/auth.service.ts` → `old/services/auth.service.ts`
  - `services/apiKey.service.ts` → `old/services/apiKey.service.ts`
  - `services/app.service.ts` → `old/services/app.service.ts`
  - `services/user.service.test.ts` → `old/services/user.service.test.ts`
  - `services/organization.service.test.ts` → `old/services/organization.service.test.ts`
  - `services/auth.service.test.ts` → `old/services/auth.service.test.ts`
  - `services/apiKey.service.test.ts` → `old/services/apiKey.service.test.ts`
  - `services/app.service.test.ts` → `old/services/app.service.test.ts`
  - `services/index.ts` → `old/services/index.ts`
  - `plugins/index.ts` → `old/plugins/index.ts`
  - `types.ts` → `old/types.ts`
  - `graphql/context-factory.ts` → `old/graphql/context-factory.ts`
  - `graphql/index.ts` → `old/graphql/index.ts`
  - `package.json` → `old/package.json`
- [ ] Déplacer les fichiers à **supprimer** vers `old/` :
  - `graphql/middleware/*` → `old/graphql/middleware/*`
  - `graphql/resolvers.ts` → `old/graphql/resolvers.ts`
  - `graphql/typedefs.ts` → `old/graphql/typedefs.ts`
  - `graphql/schema.generated.graphqls` → `old/graphql/schema.generated.graphqls`
  - `graphql/directives.ts` → `old/graphql/directives.ts`
  - `graphql/__generated__/*` → `old/graphql/__generated__/*`
  - `graphql/schema/base/*` → `old/graphql/schema/base/*`
  - `graphql/schema/<sub>/schema.graphql` → `old/graphql/schema/<sub>/schema.graphql` (7 fichiers)
  - `graphql/schema/<sub>/resolvers/*` → `old/graphql/schema/<sub>/resolvers/*` (7 dossiers, ~60+ fichiers)
  - `codegen.ts` → `old/codegen.ts`

### 7.3 Création — services

- [ ] `services/user.service.ts` réécrit
- [ ] `services/organization.service.ts` réécrit
- [ ] `services/account.service.ts` créé
- [ ] `services/session.service.ts` créé
- [ ] `services/twoFactor.service.ts` créé
- [ ] `services/apiKey.service.ts` adapté (map-error)
- [ ] `services/app.service.ts` réécrit
- [ ] `services/auth.service.ts` réduit
- [ ] `services/_internal/map-error.ts` créé
- [ ] `services/index.ts` mis à jour

### 7.4 Création — GraphQL (6 sous-modules)

Pour chaque sous-module `user`, `organization`, `account`, `api-key`, `two-factor`, `app` :

- [ ] `graphql/schema/<sub>/types.ts`
- [ ] `graphql/schema/<sub>/inputs.ts`
- [ ] `graphql/schema/<sub>/queries.ts`
- [ ] `graphql/schema/<sub>/mutations.ts`
- [ ] `graphql/schema/<sub>/errors.ts`
- [ ] `graphql/schema/<sub>/index.ts`

Puis :

- [ ] `graphql/schema/index.ts` (`registerAuthSchema`, `AuthBuilder`)
- [ ] `graphql/index.ts` (re-export)
- [ ] `graphql/context-factory.ts` (`buildAuthContext`)

### 7.5 Modification

- [ ] `plugins/index.ts` : 8 IoC bindings + `registerSchema(registerAuthSchema)`
- [ ] `types.ts` : nouveau `AuthContext` interface
- [ ] `package.json` :
  - Retirer `@graphql-codegen/*`, `@eddeee888/gcg-typescript-resolver-files`, `graphql-middleware`, `@envelop/graphql-middleware`
  - Script `generate` supprimé

### 7.6 Tests

- [ ] 8 fichiers `*.service.test.ts` réécrits (unit + intégration)
- [ ] 6 × 2 fichiers `<sub>/mutations.test.ts` + `<sub>/queries.test.ts`
- [ ] `pnpm test` passe
- [ ] `pnpm check-types` passe
- [ ] `pnpm lint` passe

### 7.7 Post-refactor — cleanup `old/`

- [ ] **Dernière étape** : `rm -rf packages/modules/auth/old`
- [ ] Vérifier `pnpm build && pnpm test` passent toujours
- [ ] Commit séparé du cleanup

---

## 8. Risques

| Risque | Probabilité | Mitigation |
|---|---|---|
| Régression `organizationService.hasPermission` — logique complexe (dynamicAccessControl DB lookup, cacheOrgRoles mémoire, creatorRole bypass, multi-role) | **Élevée** | Migration 1:1 de la méthode sans refactor — préserver la signature exacte et le comportement. Tests d'intégration dédiés couvrant les 4 chemins : static-only, static+dynamic, cache hit, creator bypass |
| Régression `userService.hasPermission` (plus simple — admin + roles) | Moyenne | Tests unitaires sur les cas connus (`adminUserIds`, multi-role CSV) |
| Régression `authService.hasPermission` dispatcher (délègue user/org selon `organizationId`) | Élevée | Tests d'intégration **avant** de toucher les resolvers — c'est le point de montée pour `plugin-scope-auth` |
| better-auth API signature changes (`revokeUserSessions`, `listUserSessions`) | Moyenne | Vérifier doc de la version utilisée ; test de fumée par wrap |
| `auth.internal.hashPassword` non exposé publiquement | Moyenne | Vérifier l'API better-auth ; fallback via `auth.context.password.hash()` si nécessaire |
| `ctx.auth.user!.id` string vs Drizzle `users.id` number | Certaine | Convention : `Number(ctx.auth.user!.id)` partout ; cast explicite dans les resolvers |
| N+1 sur `User → sessions` | Moyenne | Test de perf sur `users { sessions { ... } }` — expect 2 queries max |
| Réécriture ~3000 LoC de tests services | Certaine | Migrer test-par-test, pas tout d'un coup ; respecter la matrice §6.1 |
| `organizationService.hasPermission` avec `allowCreatorAllPermissions` (bypass créateur) | Moyenne | Préserver la logique identique, tests dédiés |
| Events double-émission (resolvers + services) | Moyenne | Delete + create ensemble — pas de cohabitation |
| `ctx.auth.session?.activeOrganizationId` absent si better-auth-orgs plugin mal configuré | Faible | Confirmer avec doc better-auth org plugin |
| Cross-module ref `'Organization'` utilisé par stock-location après auth | Faible | Auth migre avant, donc type disponible au buildSchema de stock-location |

---

## 9. Dépendances de l'ordre d'implémentation

**Prérequis** :

1. ✅ `@czo/kit` migré (spec `2026-04-20-kit-pothos-migration-design.md`)
2. ⏳ `@czo/auth` migré (ce spec)
3. ⏳ `@czo/stock-location` migré (spec `2026-04-20-stock-location-pothos-migration-design.md`)

---

## 10. Hors scope

- **Pas de changement de schéma DB** — toutes les tables (`users`, `sessions`, `accounts`, `organizations`, `members`, `invitations`, `apps`, `apiKeys`, `twoFactors`, `verifications`, `webhookDeliveries`) restent intactes
- **Pas de refactor de `config/auth/*` (better-auth config)** — les 14 fichiers restent identiques
- **Pas de changement des listeners** (`app-consumer`, `webhook-dispatcher`)
- **Pas de refactor `config/access.ts`** — `ADMIN_STATEMENTS`, `ORGANIZATION_STATEMENTS`, etc. inchangés
- **`better-auth` version pinnée** — pas de montée de version dans cette migration
- **Frontend `apps/paiya`** — non impacté (décision D : pas de consommateur strict)
- **`generateHandle` partagé** — promotion dans kit comme refactor séparé après la migration
- **Tests e2e GraphQL cross-module** (auth + stock-location ensemble) — phase ultérieure
