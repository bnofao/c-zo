import type { ApiKey, AuthRelations, CreateApiKeyInput, UpdateApiKeyInput } from '@czo/auth/types'
import type { apikeys } from '@czo/auth/schema'
import type { Database } from '@czo/kit/db'
import type { Awaitable } from 'better-auth'
import type { InferSelectModel } from 'drizzle-orm'
import type { Effect } from 'effect'
import { Context, Data } from 'effect'

// ─── Tagged errors (also serve as Pothos GraphQL errors via registerError) ───

export class InvalidApiKey extends Data.TaggedError('InvalidApiKey') {
  readonly code = 'INVALID_API_KEY'
  get message() { return 'Invalid API key' }
}

export class KeyDisabled extends Data.TaggedError('KeyDisabled') {
  readonly code = 'API_KEY_DISABLED'
  get message() { return 'API key is disabled' }
}

export class KeyExpired extends Data.TaggedError('KeyExpired')<{
  readonly keyId: number
}> {
  readonly code = 'API_KEY_EXPIRED'
  get message() { return `API key ${this.keyId} has expired` }
}

export class Unauthorized extends Data.TaggedError('Unauthorized') {
  readonly code = 'UNAUTHORIZED'
  get message() { return 'API key is not authorized for the requested permissions' }
}

export class RateLimited extends Data.TaggedError('RateLimited')<{
  readonly tryAgainIn: number
}> {
  readonly code = 'RATE_LIMITED'
  get message() { return `Rate limit exceeded — try again in ${this.tryAgainIn}ms` }
}

export class Misconfigured extends Data.TaggedError('Misconfigured')<{
  readonly reason: string
}> {
  readonly code = 'MISCONFIGURED'
  get message() { return `API key misconfigured: ${this.reason}` }
}

export class UsageExceeded extends Data.TaggedError('UsageExceeded') {
  readonly code = 'USAGE_EXCEEDED'
  get message() { return 'API key usage quota exceeded' }
}

export class Intrusion extends Data.TaggedError('Intrusion') {
  readonly code = 'INTRUSION'
  get message() { return 'Access denied: caller is not allowed to operate on this resource' }
}

export class ApiKeyNotFound extends Data.TaggedError('ApiKeyNotFound') {
  readonly code = 'API_KEY_NOT_FOUND'
  get message() { return 'API key not found' }
}

export class NoChanges extends Data.TaggedError('NoChanges') {
  readonly code = 'NO_CHANGES'
  get message() { return 'No changes provided' }
}

export class RefillPairRequired extends Data.TaggedError('RefillPairRequired') {
  readonly code = 'REFILL_PAIR_REQUIRED'
  get message() { return 'refillAmount and refillInterval must be provided together' }
}

export class DbFailed extends Data.TaggedError('DbFailed')<{
  readonly cause: unknown
}> {
  readonly code = 'DB_FAILED'
  get message() { return 'Database operation failed' }
}

export type ApiKeyError =
  | InvalidApiKey | KeyDisabled | KeyExpired | Unauthorized
  | RateLimited | Misconfigured | UsageExceeded
  | Intrusion | ApiKeyNotFound | NoChanges | RefillPairRequired | DbFailed

// ─── Types ───────────────────────────────────────────────────────────

export type ApiKeyRow = InferSelectModel<typeof apikeys>

export interface KeyGenerator {
  (options: { length: number, prefix: string | undefined }): Awaitable<string>
}

export interface KeyHasher {
  (key: string): Awaitable<string>
}

export interface CreateApiKeyOptions {
  /** Custom key generator. Defaults to a length-based random hex string. */
  keyGenerator?: KeyGenerator
  /** Custom hasher. Defaults to better-auth's `defaultKeyHasher` (sha256). */
  keyHasher?: KeyHasher
  rateLimit?: {
    maxRequests?: number
    timeWindow?: number
  }
  rateLimitMax?: number
  keyLength?: number
  reference?: string
  startCharsLength?: number
  session: {
    userId: number
  }
}

export interface FindOneOptions {
  session: {
    userId: number
  }
}

export interface FindManyOptions {
  session: {
    userId: number
  }
}

export interface UpdateApiKeyOptions {
  reference?: string
  referenceId?: number
  session: {
    userId: number
  }
}

export interface VerifyApiKeyOptions {
  /** Required permissions, e.g. `{ users: ['read', 'write'] }`. Subset check against `apiKey.permissions`. */
  permissions?: Record<string, string[]>
  /** Custom hasher for `verify` (plain → hashed). Defaults to better-auth's `defaultKeyHasher` (sha256). */
  keyHasher?: KeyHasher
}

export interface RemoveApiKeyOptions {
  reference?: string
  referenceId?: number
  session: {
    userId: number
  }
}

// ─── Service contract (Effect Tag) ───────────────────────────────────

type FindFirstConfig = Parameters<Database<AuthRelations>['query']['apikeys']['findFirst']>[0]
type FindManyConfig = Parameters<Database<AuthRelations>['query']['apikeys']['findMany']>[0]

export class ApiKeyService extends Context.Tag('@czo/auth/ApiKeyService')<
  ApiKeyService,
  {
    readonly findFirst: (
      opts: FindOneOptions,
      config?: FindFirstConfig,
    ) => Effect.Effect<ApiKey, ApiKeyNotFound | Intrusion | DbFailed>

    readonly findMany: (
      opts: FindManyOptions,
      config?: FindManyConfig,
    ) => Effect.Effect<readonly ApiKey[], Intrusion | DbFailed>

    readonly create: (
      input: CreateApiKeyInput,
      opts: CreateApiKeyOptions,
    ) => Effect.Effect<ApiKey, RefillPairRequired | Intrusion | DbFailed>

    readonly update: (
      id: number,
      input: UpdateApiKeyInput,
      opts: UpdateApiKeyOptions,
    ) => Effect.Effect<ApiKey, ApiKeyNotFound | NoChanges | RefillPairRequired | Intrusion | DbFailed>

    readonly validate: (
      hashedKey: string,
      opts?: VerifyApiKeyOptions,
    ) => Effect.Effect<
      ApiKey,
      InvalidApiKey | KeyDisabled | KeyExpired | Unauthorized
      | RateLimited | Misconfigured | UsageExceeded | DbFailed
    >

    readonly verify: (
      plainKey: string,
      opts?: VerifyApiKeyOptions,
    ) => Effect.Effect<
      ApiKey,
      InvalidApiKey | KeyDisabled | KeyExpired | Unauthorized
      | RateLimited | Misconfigured | UsageExceeded | DbFailed
    >

    readonly remove: (
      id: number,
      opts: RemoveApiKeyOptions,
    ) => Effect.Effect<boolean, ApiKeyNotFound | Intrusion | DbFailed>
  }
>() {}
