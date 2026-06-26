import type { Relations } from '@czo/auth/relations'
import type { sessions, UserSchema } from '@czo/auth/schema'
import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import { users } from '@czo/auth/schema'
import { DrizzleDb } from '@czo/kit/db'
import { and, eq, isNull, not, sql } from 'drizzle-orm'
import { Config, Context, Data, Effect, Layer } from 'effect'
import { AccessService } from './access'
import { UserEvents } from './events/user'
import { PasswordService } from './password'
import { insertCredential, updateCredentialPassword } from './utils/credential-account'
import { validateRole } from './utils/validate-roles'

// ─── Tagged errors (also serve as Pothos GraphQL errors via registerError) ───

export class UserNotFound extends Data.TaggedError('UserNotFound') {
  readonly code = 'USER_NOT_FOUND'
  readonly message = 'User not found'
}

export class UserAlreadyExists extends Data.TaggedError('UserAlreadyExists')<{
  readonly user: User
}> {
  readonly code = 'USER_ALREADY_EXISTS'
  get message() {
    return `User with email ${this.user.email} already exists`
  }
}

export class InvalidRole extends Data.TaggedError('InvalidRole')<{
  readonly role: string
}> {
  readonly code = 'INVALID_ROLE'
  get message() {
    return `Invalid role: '${this.role}'`
  }
}

export class CannotBanSelf extends Data.TaggedError('CannotBanSelf') {
  readonly code = 'CANNOT_BAN_SELF'
  get message() { return 'You cannot ban yourself' }
}

export class CannotDemoteSelf extends Data.TaggedError('CannotDemoteSelf') {
  readonly code = 'CANNOT_DEMOTE_SELF'
  get message() { return 'You cannot demote yourself' }
}

export class CannotRemoveSelf extends Data.TaggedError('CannotRemoveSelf') {
  readonly code = 'CANNOT_REMOVE_SELF'
  get message() { return 'You cannot remove yourself' }
}

export class UserAlreadyBanned extends Data.TaggedError('UserAlreadyBanned') {
  readonly code = 'USER_ALREADY_BANNED'
  get message() { return 'User is already banned' }
}

export class UserNotBanned extends Data.TaggedError('UserNotBanned') {
  readonly code = 'USER_NOT_BANNED'
  get message() { return 'User is not banned' }
}

export class UserNoChanges extends Data.TaggedError('UserNoChanges') {
  readonly code = 'USER_NO_CHANGES'
  get message() { return 'No changes provided' }
}

export class PasswordHashFailed extends Data.TaggedError('PasswordHashFailed')<{
  readonly cause: unknown
}> {
  readonly code = 'PASSWORD_HASH_FAILED'
  get message() { return 'Failed to hash or update password' }
}

export class CredentialLinkFailed extends Data.TaggedError('CredentialLinkFailed')<{
  readonly cause: unknown
}> {
  readonly code = 'CREDENTIAL_LINK_FAILED'
  get message() { return 'Failed to link credential to user account' }
}

export class UserDbFailed extends Data.TaggedError('UserDbFailed')<{
  readonly cause: unknown
}> {
  readonly code = 'USER_DB_FAILED'
  get message() { return 'Database operation failed' }
}

export type UserError
  = | UserNotFound
    | UserAlreadyExists
    | InvalidRole
    | CannotBanSelf
    | CannotDemoteSelf
    | CannotRemoveSelf
    | UserAlreadyBanned
    | UserNotBanned
    | UserNoChanges
    | PasswordHashFailed
    | CredentialLinkFailed
    | UserDbFailed

// ─── Default-role helpers ─────────────────────────────────────────────

/** Parse a CSV role list: split on `,`, trim, drop empties. */
export function parseCsvRoles(raw: string): string[] {
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

/** Deduped union of provided + default roles (provided first). */
export function mergeRoles(provided: ReadonlyArray<string>, defaults: ReadonlyArray<string>): string[] {
  return [...new Set([...provided, ...defaults])]
}

/**
 * Shared reader for the default platform roles assigned to a user at creation.
 * Unset ⇒ `[]` (no default role). Used by `authConfig` (to build the layer) and
 * by the boot-time validation in the module's `onStarted`.
 */
export const DefaultUserRolesConfig = Effect.gen(function* () {
  const raw = yield* Config.string('AUTH_DEFAULT_USER_ROLES').pipe(Config.withDefault(''))
  return parseCsvRoles(raw) as ReadonlyArray<string>
})

/** Raised at boot when a configured default role is not in the access registry. */
export class InvalidDefaultUserRoles extends Data.TaggedError('InvalidDefaultUserRoles')<{
  readonly roles: ReadonlyArray<string>
}> {
  readonly code = 'INVALID_DEFAULT_USER_ROLES'
  get message() {
    return `AUTH_DEFAULT_USER_ROLES contains unregistered role(s): ${this.roles.join(', ')}`
  }
}

/**
 * Fail-fast check: every configured default role must exist in the registry.
 *  Reuses `validateRole` (already imported in this file) instead of hand-rolled
 *  membership checks — `validateRole(r, registered)` returns `false` for an
 *  unregistered role.
 */
export function assertDefaultUserRolesValid(
  defaultUserRoles: ReadonlyArray<string>,
  registered: Record<string, unknown>,
): Effect.Effect<void, InvalidDefaultUserRoles> {
  return Effect.gen(function* () {
    const invalid = defaultUserRoles.filter(
      r => validateRole(r, registered as Parameters<typeof validateRole>[1]) === false,
    )
    if (invalid.length > 0)
      return yield* Effect.fail(new InvalidDefaultUserRoles({ roles: invalid }))
  })
}

// ─── Types ───────────────────────────────────────────────────────────

export type SessionRow = InferSelectModel<typeof sessions>
export type User = InferSelectModel<UserSchema>
export interface UpdateUserInput {
  name?: string | undefined
  role?: string | string[] | null | undefined
}
export interface CreateUserInput {
  name: string
  email: string
  role?: string | string[] | null
  password?: string | null
  emailVerified?: boolean
}

export interface BanUserInput {
  reason?: string | null | undefined
  expiresIn?: number | null | undefined
}

export interface ListUsersParams {
  searchValue?: string
  searchField?: 'email' | 'name'
  searchOperator?: 'contains' | 'starts_with' | 'ends_with'
  limit?: number | string
  offset?: number | string
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
  filterField?: string
  filterValue?: string | number | boolean
  filterOperator?: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte' | 'contains'
}

export interface SetRoleInput {
  userId: string
  role: string | string[]
}

export interface SetUserPasswordInput {
  userId: string
  newPassword: string
}

// ─── Service contract (Effect Tag) ───────────────────────────────────

type FindFirstConfig = NonNullable<Parameters<Database<Relations>['query']['users']['findFirst']>[0]> & { excludeDeleted?: boolean }
type FindManyConfig = NonNullable<Parameters<Database<Relations>['query']['users']['findMany']>[0]> & { excludeDeleted?: boolean }

/** Live-user totals per admin filter bucket (excludes soft-deleted rows). */
export interface UserCounts {
  readonly all: number
  readonly admins: number
  readonly unverified: number
  readonly banned: number
}

/**
 * Strip the non-Drizzle `excludeDeleted` flag and, unless it's explicitly
 * `false`, AND-merge `deletedAt: { isNull: true }` into the `where`. RQBv2's
 * object-where ANDs sibling keys, so this is safe even when `where` carries a
 * top-level `OR`. The `excludeDeleted` key MUST NOT reach `db.query`.
 */
function withDeletedFilter<C extends { where?: object, excludeDeleted?: boolean }>(config?: C) {
  const { excludeDeleted, ...rest } = config ?? ({} as C)
  return excludeDeleted === false
    ? rest
    : { ...rest, where: { ...(rest as { where?: object }).where, deletedAt: { isNull: true } } }
}

export class UserService extends Context.Service<
  UserService,
  {
    readonly findMany: (
      config?: FindManyConfig,
    ) => Effect.Effect<readonly User[], UserDbFailed>

    readonly counts: () => Effect.Effect<UserCounts, UserDbFailed>

    readonly findFirst: (
      config?: FindFirstConfig,
    ) => Effect.Effect<User, UserNotFound | UserDbFailed>

    readonly create: (
      input: CreateUserInput,
    ) => Effect.Effect<User, UserAlreadyExists | InvalidRole | CredentialLinkFailed | UserDbFailed>

    readonly update: (
      id: number,
      input: UpdateUserInput,
    ) => Effect.Effect<User, UserNotFound | UserNoChanges | InvalidRole | UserDbFailed>

    readonly ban: (
      id: number,
      input: BanUserInput,
      actorId?: number,
    ) => Effect.Effect<User, UserNotFound | UserAlreadyBanned | CannotBanSelf | UserDbFailed>

    readonly unban: (
      id: number,
      actorId?: number,
    ) => Effect.Effect<User, UserNotFound | UserNotBanned | UserDbFailed>

    readonly setRole: (
      id: number,
      role: string | string[],
      actorId?: number,
    ) => Effect.Effect<User, UserNotFound | InvalidRole | CannotDemoteSelf | UserDbFailed>

    readonly setPassword: (
      id: number,
      password: string,
    ) => Effect.Effect<true, UserNotFound | PasswordHashFailed | UserDbFailed>

    readonly remove: (
      id: number,
      actorId?: number,
    ) => Effect.Effect<true, UserNotFound | CannotRemoveSelf | UserDbFailed>

    readonly hasPermission: (input: {
      role?: string
      permissions: Record<string, string[]>
      connector?: 'AND' | 'OR'
    }) => Effect.Effect<boolean>
  }
>()('@czo/auth/UserService') {}

// ─── Layer ───────────────────────────────────────────────────────────────

function makeService(defaultUserRoles: ReadonlyArray<string>) {
  return Effect.gen(function* () {
    const db = (yield* DrizzleDb) as Database<Relations>
    const passwords = yield* PasswordService
    const access = yield* AccessService
    const events = yield* UserEvents

    const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
      eff.pipe(Effect.mapError(cause => new UserDbFailed({ cause })))

    const findById = (id: number) =>
      Effect.gen(function* () {
        const row = yield* dbErr(db.query.users.findFirst({ where: { id, deletedAt: { isNull: true } } }))
        if (!row)
          return yield* Effect.fail(new UserNotFound())
        return row
      })

    const ensureValidRole = (role: string | string[]) =>
      Effect.gen(function* () {
      // Read the live role set at request time — the registry is fully
      // populated only after every module's `onStart` (e.g. stock-location),
      // which runs after this service is constructed.
        const roles = yield* access.roles
        const valid = validateRole(role, roles)
        if (!valid)
          return yield* Effect.fail(new InvalidRole({ role: Array.isArray(role) ? role.join(',') : role }))
        return valid
      })

    const updateUserRow = (id: number, patch: Record<string, unknown>) =>
      Effect.gen(function* () {
        const [row] = yield* dbErr(
          db.update(users).set({ ...patch, updatedAt: new Date() }).where(eq(users.id, id)).returning(),
        )
        if (!row)
          return yield* Effect.fail(new UserDbFailed({ cause: 'update returned no row' }))
        return row
      })

    return UserService.of({
      findMany: (config?) =>
        dbErr(db.query.users.findMany(withDeletedFilter(config))).pipe(
          Effect.map(rows => rows),
        ),

      counts: () => {
      // Global per-bucket totals over live (non-deleted) users; `admins`,
      // `unverified`, `banned` mirror the admin UI's filter tabs. Counted in
      // parallel — independent `$count` queries, no ordering dependency.
        const live = isNull(users.deletedAt)
        // CSV-aware admin membership ('admin' as one role element), coalescing a
        // null role to '' so roleless users are non-admins. Used positively for
        // `admins` and negated for `all` — so the two buckets partition live
        // users and stay in sync with the `users(admin:)` list filter (the
        // count/list divergence this guards against).
        const isAdmin = sql`'admin' = ANY(string_to_array(coalesce(${users.role}, ''), ','))`
        return Effect.all({
          all: dbErr(db.$count(users, and(live, not(isAdmin)))),
          admins: dbErr(db.$count(users, and(live, isAdmin))),
          unverified: dbErr(db.$count(users, and(live, eq(users.emailVerified, false)))),
          banned: dbErr(db.$count(users, and(live, eq(users.banned, true)))),
        }, { concurrency: 'unbounded' })
      },

      findFirst: (config?) =>
        Effect.gen(function* () {
          const row = yield* dbErr(db.query.users.findFirst(withDeletedFilter(config)))
          if (!row)
            return yield* Effect.fail(new UserNotFound())
          return row
        }),

      create: input =>
        Effect.gen(function* () {
          const existing = yield* dbErr(
            db.query.users.findFirst({ where: { email: input.email } }),
          )
          if (existing)
            return yield* Effect.fail(new UserAlreadyExists({ user: existing }))

          // Stored role = deduped union of any provided role(s) (validated) and
          // the configured defaults (boot-validated); null when both are empty.
          const provided = input.role ? parseCsvRoles(yield* ensureValidRole(input.role)) : []
          const merged = mergeRoles(provided, defaultUserRoles)
          const role = merged.length > 0 ? merged.join(',') : null

          // Hash before opening the transaction to keep the tx short. Hash failure
          // surfaces as CredentialLinkFailed (no user row written yet).
          const hashed = input.password
            ? yield* passwords.hash(input.password).pipe(
              Effect.mapError(cause => new CredentialLinkFailed({ cause })),
            )
            : undefined

          const now = new Date()
          // user + credential in ONE transaction → no orphan user if the
          // credential insert fails (it rolls back).
          const user = yield* db.transaction(tx =>
            Effect.gen(function* () {
              const [u] = yield* dbErr(
                tx.insert(users).values({
                  ...input,
                  role,
                  emailVerified: input.emailVerified ?? false,
                  createdAt: now,
                  updatedAt: now,
                }).returning(),
              )
              if (!u)
                return yield* Effect.fail(new UserDbFailed({ cause: 'insert returned no row' }))
              if (hashed !== undefined) {
                yield* insertCredential(tx, u.id, hashed, now).pipe(
                  Effect.mapError(cause => new CredentialLinkFailed({ cause })),
                )
              }
              return u
            }),
          ).pipe(
            Effect.mapError(e =>
              e instanceof UserDbFailed || e instanceof CredentialLinkFailed
                ? e
                : new UserDbFailed({ cause: e }),
            ),
          )

          // Post-commit, fire-and-forget. `UserCreated` currently has no
          // subscriber; kept for parity with the domain-event surface.
          yield* Effect.forkDetach(events.publish({ _tag: 'UserCreated', userId: user.id, email: user.email }))
          return user
        }),

      update: (id, input) =>
        Effect.gen(function* () {
          yield* findById(id)

          if (Object.keys(input).length === 0)
            return yield* Effect.fail(new UserNoChanges())

          let role: string | null | undefined
          if (input.role) {
            const provided = parseCsvRoles(yield* ensureValidRole(input.role))
            const merged = mergeRoles(provided, defaultUserRoles)
            role = merged.length > 0 ? merged.join(',') : null
          }

          const row = yield* updateUserRow(id, { ...input, role })
          yield* Effect.forkDetach(events.publish({ _tag: 'UserUpdated', userId: id, changes: input as Record<string, unknown> }))
          return row
        }),

      ban: (id, input, actorId) =>
        Effect.gen(function* () {
          const existing = yield* findById(id)

          if (actorId !== undefined && existing.id === actorId)
            return yield* Effect.fail(new CannotBanSelf())

          if (existing.banned)
            return yield* Effect.fail(new UserAlreadyBanned())

          const row = yield* updateUserRow(id, {
            banned: true,
            banReason: input.reason ?? 'No reason provided',
            banExpires: typeof input.expiresIn === 'number'
              ? new Date(Date.now() + input.expiresIn * 1000)
              : null,
          })
          yield* Effect.forkDetach(events.publish({
            _tag: 'UserBanned',
            userId: id,
            bannedBy: actorId ?? null,
            reason: row.banReason,
            expires: row.banExpires,
          }))
          return row
        }),

      unban: (id, actorId) =>
        Effect.gen(function* () {
          const existing = yield* findById(id)
          if (!existing.banned)
            return yield* Effect.fail(new UserNotBanned())

          const row = yield* updateUserRow(id, {
            banned: false,
            banReason: null,
            banExpires: null,
          })
          yield* Effect.forkDetach(events.publish({ _tag: 'UserUnbanned', userId: id, unbannedBy: actorId ?? null }))
          return row
        }),

      setRole: (id, role, actorId) =>
        Effect.gen(function* () {
          const existing = yield* findById(id)
          const provided = parseCsvRoles(yield* ensureValidRole(role))
          const newRole = mergeRoles(provided, defaultUserRoles).join(',')

          if (actorId !== undefined && existing.id === actorId)
            return yield* Effect.fail(new CannotDemoteSelf())

          const row = yield* updateUserRow(id, { role: newRole })
          yield* Effect.forkDetach(events.publish({
            _tag: 'UserRoleChanged',
            userId: id,
            previousRole: existing.role,
            newRole,
            changedBy: actorId ?? null,
          }))
          return row
        }),

      setPassword: (id, password) =>
        Effect.gen(function* () {
          yield* findById(id)
          const hashed = yield* passwords.hash(password)
          yield* dbErr(updateCredentialPassword(db, id, hashed))
          return true as const
        }),

      remove: (id, actorId) =>
        Effect.gen(function* () {
          const existing = yield* findById(id)

          if (actorId !== undefined && existing.id === actorId)
            return yield* Effect.fail(new CannotRemoveSelf())

          // Hard delete. FKs to users.id are all `ON DELETE CASCADE` (sessions,
          // accounts, members, invitations, api_keys) so the row removal
          // cascades exactly the way `better-auth.internalAdapter.deleteUser`
          // did, without the better-auth runtime dependency.
          yield* dbErr(db.delete(users).where(eq(users.id, id)))
          yield* Effect.forkDetach(events.publish({ _tag: 'UserDeleted', userId: id, email: existing.email }))
          return true as const
        }),

      hasPermission: input =>
        access.checkPermission(
          input.role || 'user',
          input.permissions,
          role => access.role(role),
          input.connector ?? 'AND',
        ),
    })
  })
}

/**
 * Live layer — depends on DrizzleDb, AccessService, UserEvents.
 *  `defaultUserRoles` are assigned (CSV) to users created without an explicit
 *  role; they must be registry-valid (checked at boot via assertDefaultUserRolesValid).
 */
export function makeLayer(defaultUserRoles: ReadonlyArray<string> = []) {
  return Layer.effect(UserService, makeService(defaultUserRoles))
}

/** Back-compat no-arg layer (no default roles). */
export const layer = makeLayer()
