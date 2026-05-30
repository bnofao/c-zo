import type { Relations } from '@czo/auth/relations'
import type { sessions, UserSchema } from '@czo/auth/schema'
import type { Database } from '@czo/kit/db/effect'
import type { InferSelectModel } from 'drizzle-orm'
import { users } from '@czo/auth/schema'
import { DrizzleDb } from '@czo/kit/db/effect'
import { eq } from 'drizzle-orm'
import { Context, Data, Effect, Layer } from 'effect'
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

type FindFirstConfig = Parameters<Database<Relations>['query']['users']['findFirst']>[0]
type FindManyConfig = Parameters<Database<Relations>['query']['users']['findMany']>[0]

export class UserService extends Context.Service<
  UserService,
  {
    readonly findMany: (
      config?: FindManyConfig,
    ) => Effect.Effect<readonly User[], UserDbFailed>

    readonly findFirst: (
      config?: FindFirstConfig,
    ) => Effect.Effect<User, UserNotFound | UserDbFailed>

    readonly create: (
      input: CreateUserInput,
    ) => Effect.Effect<User, UserAlreadyExists | InvalidRole | CredentialLinkFailed | PasswordHashFailed | UserDbFailed>

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

const make = Effect.gen(function* () {
  const db = (yield* DrizzleDb) as Database<Relations>
  const passwords = yield* PasswordService
  const access = yield* AccessService
  const { roles } = yield* access.buildRoles
  const events = yield* UserEvents

  const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(Effect.mapError(cause => new UserDbFailed({ cause })))

  const findById = (id: number) =>
    Effect.gen(function* () {
      const row = yield* dbErr(db.query.users.findFirst({ where: { id } }))
      if (!row)
        return yield* Effect.fail(new UserNotFound())
      return row
    })

  const ensureValidRole = (role: string | string[]) =>
    Effect.gen(function* () {
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
      dbErr(db.query.users.findMany(config)).pipe(
        Effect.map(rows => rows),
      ),

    findFirst: (config?) =>
      Effect.gen(function* () {
        const row = yield* dbErr(db.query.users.findFirst(config))
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

        let role: string | undefined = input.role as string | undefined
        if (input.role) {
          role = yield* ensureValidRole(input.role)
        }

        const [user] = yield* dbErr(
          db.insert(users).values({
            ...input,
            role: role ?? 'user',
            createdAt: new Date(),
            updatedAt: new Date(),
          }).returning(),
        )
        if (!user)
          return yield* Effect.fail(new UserDbFailed({ cause: 'insert returned no row' }))

        // Link credential if a password was provided. Native impl via the
        // shared `insertCredential` helper (same row shape as `http/credential.ts`
        // signUp). Failure is wrapped in `CredentialLinkFailed` — callers must
        // decide whether to compensate; we don't silently leave a credential-
        // less user any more.
        if (input.password) {
          const hashed = yield* passwords.hash(input.password).pipe(
            Effect.mapError(cause => new CredentialLinkFailed({ cause })),
          )
          yield* insertCredential(db, user.id, hashed).pipe(
            Effect.mapError(cause => new CredentialLinkFailed({ cause })),
          )
        }

        yield* Effect.forkDetach(events.publish({ _tag: 'UserCreated', userId: user.id, email: user.email }))
        return user
      }),

    update: (id, input) =>
      Effect.gen(function* () {
        yield* findById(id)

        if (Object.keys(input).length === 0)
          return yield* Effect.fail(new UserNoChanges())

        let role: string | undefined = input.role as string | undefined
        if (input.role) {
          role = yield* ensureValidRole(input.role)
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
        const validRole = yield* ensureValidRole(role)

        if (actorId !== undefined && existing.id === actorId)
          return yield* Effect.fail(new CannotDemoteSelf())

        const row = yield* updateUserRow(id, { role: validRole })
        yield* Effect.forkDetach(events.publish({
          _tag: 'UserRoleChanged',
          userId: id,
          previousRole: existing.role,
          newRole: validRole,
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
      Effect.gen(function* () {
        const { permissions, role, connector = 'AND' } = input
        if (!permissions)
          return false
        const roleNames = (role || 'user').split(',')
        for (const r of roleNames) {
          const acRole = yield* access.role(r)
          if (!acRole)
            continue
          const ok = yield* access.authorize(acRole.statements, permissions, connector)
          if (ok)
            return true
        }
        return false
      }),
  })
})

/** Live layer — depends on DrizzleDb, BetterAuth, AccessService, UserEvents. */
export const layer = Layer.effect(UserService, make)
