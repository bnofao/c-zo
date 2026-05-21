import type { Relations } from '@czo/auth/relations'
import type { sessions, UserSchema } from '@czo/auth/schema'
import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { Effect } from 'effect'

import { Context, Data } from 'effect'

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

    readonly listSessions: (
      id: number,
    ) => Effect.Effect<readonly SessionRow[], UserDbFailed>

    readonly revokeSession: (
      token: string,
    ) => Effect.Effect<true, UserDbFailed>

    readonly revokeSessions: (
      id: number,
    ) => Effect.Effect<true, UserDbFailed>
  }
>()('@czo/auth/UserService') {}
