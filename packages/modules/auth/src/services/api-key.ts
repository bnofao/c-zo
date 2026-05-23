import type { Relations } from '@czo/auth/relations'
import type { ApiKeySchema } from '@czo/auth/schema'
import type { Database } from '@czo/kit/db/effect'
import type { InferSelectModel } from 'drizzle-orm'
import { apikeys } from '@czo/auth/schema'
import { DrizzleDb } from '@czo/kit/db/effect'
import { and, eq, sql } from 'drizzle-orm'
import { Context, Data, Effect, Layer } from 'effect'
import { AccessService } from './access'
import { randomString, sha256Hex } from './utils/crypto'

type Awaitable<T> = T | Promise<T>

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

export type ApiKeyError
  = | InvalidApiKey | KeyDisabled | KeyExpired | Unauthorized
    | RateLimited | Misconfigured | UsageExceeded
    | ApiKeyNotFound | NoChanges | RefillPairRequired | DbFailed

// ─── Types ───────────────────────────────────────────────────────────
interface CreateApiKeyInput {
  name: string
  group: string
  prefix: string
  referenceId: number
  expiresIn?: number | null
  remaining?: number | null
  metadata?: any
  refillAmount?: number
  refillInterval?: number
  rateLimitTimeWindow?: number
  rateLimitMax?: number
  rateLimitEnabled?: boolean
  permissions?: Record<string, string[]>
}

interface UpdateApiKeyInput {
  name?: string | null
  enabled?: boolean | null
  remaining?: number | null
  metadata?: any
  expiresIn?: number | null
  permissions?: Record<string, string[]> | null
  refillAmount?: number | null
  refillInterval?: number | null
  rateLimitEnabled?: boolean | null
  rateLimitTimeWindow?: number | null
  rateLimitMax?: number | null
}

export type ApiKey = InferSelectModel<ApiKeySchema>

export interface KeyGenerator {
  (options: { length: number, prefix: string }): Awaitable<string>
}

export interface KeyHasher {
  (key: string): Awaitable<string>
}

export interface CreateApiKeyOptions {
  /** Custom key generator. Defaults to a length-based random alphanumeric string. */
  keyGenerator?: KeyGenerator
  /** Custom hasher. Defaults to `sha256Hex` from `./utils/crypto`. */
  keyHasher?: KeyHasher
  rateLimit?: {
    maxRequests?: number
    timeWindow?: number
  }
  rateLimitMax?: number
  keyLength?: number
  reference?: string
  startCharsLength?: number
}

export interface VerifyApiKeyOptions {
  /** Required permissions, e.g. `{ users: ['read', 'write'] }`. Subset check against `apiKey.permissions`. */
  permissions?: Record<string, string[]>
  /** Custom hasher for `verify` (plain → hashed). Defaults to `sha256Hex` from `./utils/crypto`. */
  keyHasher?: KeyHasher
}

// ─── Service contract (Effect Tag) ───────────────────────────────────

type FindFirstConfig = Parameters<Database<Relations>['query']['apikeys']['findFirst']>[0]
type FindManyConfig = Parameters<Database<Relations>['query']['apikeys']['findMany']>[0]

export class ApiKeyService extends Context.Service<
  ApiKeyService,
  {
    readonly findFirst: (
      config?: FindFirstConfig,
    ) => Effect.Effect<ApiKey, ApiKeyNotFound | DbFailed>

    readonly findMany: (
      config?: FindManyConfig,
    ) => Effect.Effect<readonly ApiKey[], DbFailed>

    readonly create: (
      input: CreateApiKeyInput,
      opts: CreateApiKeyOptions,
    ) => Effect.Effect<ApiKey, RefillPairRequired | DbFailed>

    readonly update: (
      id: number,
      input: UpdateApiKeyInput,
    ) => Effect.Effect<ApiKey, ApiKeyNotFound | NoChanges | RefillPairRequired | DbFailed>

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
    ) => Effect.Effect<boolean, ApiKeyNotFound | DbFailed>
  }
>()('@czo/auth/ApiKeyService') {}

// ─── Helpers ─────────────────────────────────────────────────────────

const defaultKeyGenerator: KeyGenerator = ({ length, prefix }) => {
  const hex = randomString(length, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ')
  return prefix ? `${prefix}_${hex}` : hex
}

const defaultKeyHasher: KeyHasher = (key: string) => sha256Hex(key)

// ─── Layer ───────────────────────────────────────────────────────────

type ApiKeyServiceImpl = Context.Service.Shape<typeof ApiKeyService>

const make = Effect.gen(function* () {
  // The kit's DrizzleDb Tag exposes the bare `Database` type. We narrow to
  // `Database<Relations>` here so RQBv2 query inference (`db.query.apikeys.…`)
  // matches the auth schema. The runtime client is the same — only the static
  // type changes.
  const db = (yield* DrizzleDb) as Database<Relations>
  const access = yield* AccessService

  const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(Effect.mapError(cause => new DbFailed({ cause })))

  // `validate` is a closure const so `verify` can call it. Typed once via
  // `ApiKeyServiceImpl['validate']`; the other methods get contextual typing
  // from the `ApiKeyService.of({ ... })` literal below.
  const validate: ApiKeyServiceImpl['validate'] = (hashedKey, opts) =>
    Effect.gen(function* () {
      const apiKey = yield* dbErr(db.query.apikeys.findFirst({ where: { key: hashedKey } }))
      if (!apiKey)
        return yield* Effect.fail(new InvalidApiKey())

      if (!apiKey.enabled)
        return yield* Effect.fail(new KeyDisabled())

      const nowDate = new Date()
      const nowMs = nowDate.getTime()

      if (apiKey.expiresAt && apiKey.expiresAt.getTime() < nowMs)
        return yield* Effect.fail(new KeyExpired({ keyId: apiKey.id }))

      if (opts?.permissions) {
        const granted = (apiKey.permissions ?? {}) as Record<string, string[]>
        const allowed = yield* access.authorize(granted, opts.permissions)
        if (!allowed)
          return yield* Effect.fail(new Unauthorized())
      }

      if (apiKey.rateLimitEnabled) {
        const windowMs = apiKey.rateLimitTimeWindow
        const max = apiKey.rateLimitMax
        if (windowMs !== null && max !== null) {
          if (windowMs <= 0 || max <= 0) {
            return yield* Effect.fail(new Misconfigured({
              reason: 'rateLimitTimeWindow and rateLimitMax must be > 0 when rateLimitEnabled is true',
            }))
          }
          const elapsed = nowMs - (apiKey.lastRequest?.getTime() ?? 0)
          const inWindow = apiKey.lastRequest !== null && elapsed < windowMs
          const currentCount = apiKey.requestCount ?? 0
          if (inWindow && currentCount >= max)
            return yield* Effect.fail(new RateLimited({ tryAgainIn: Math.ceil(windowMs - elapsed) }))
        }
      }

      const refillDue = sql`(
        ${apikeys.refillInterval} IS NOT NULL
        AND ${apikeys.refillAmount} IS NOT NULL
        AND EXTRACT(EPOCH FROM (${nowDate}::timestamptz - COALESCE(${apikeys.lastRefillAt}, ${apikeys.createdAt}))) * 1000 > ${apikeys.refillInterval}
      )`

      const [updated] = yield* dbErr(db.update(apikeys)
        .set({
          remaining: sql`CASE
            WHEN ${apikeys.remaining} IS NULL THEN NULL
            WHEN ${refillDue} THEN ${apikeys.refillAmount} - 1
            ELSE ${apikeys.remaining} - 1
          END`,
          lastRefillAt: sql`CASE
            WHEN ${refillDue} THEN ${nowDate}::timestamptz
            ELSE ${apikeys.lastRefillAt}
          END`,
          lastRequest: nowDate,
          requestCount: sql`CASE
            WHEN ${apikeys.rateLimitEnabled} IS NOT TRUE
              OR ${apikeys.rateLimitTimeWindow} IS NULL
              OR ${apikeys.rateLimitMax} IS NULL
              THEN COALESCE(${apikeys.requestCount}, 0)
            WHEN ${apikeys.lastRequest} IS NULL
              OR EXTRACT(EPOCH FROM (${nowDate}::timestamptz - ${apikeys.lastRequest})) * 1000 > ${apikeys.rateLimitTimeWindow}
              THEN 1
            ELSE COALESCE(${apikeys.requestCount}, 0) + 1
          END`,
          updatedAt: nowDate,
        })
        .where(and(
          eq(apikeys.id, apiKey.id),
          sql`(
            ${apikeys.remaining} IS NULL
            OR ${apikeys.remaining} > 0
            OR (${refillDue} AND ${apikeys.refillAmount} > 0)
          )`,
        ))
        .returning())

      if (!updated)
        return yield* Effect.fail(new UsageExceeded())
      return updated
    })

  return ApiKeyService.of({
    findFirst: (config) =>
      Effect.gen(function* () {
        const data = yield* dbErr(db.query.apikeys.findFirst(config))
        if (!data)
          return yield* Effect.fail(new ApiKeyNotFound())
        return data
      }),

    findMany: (config) =>
      Effect.gen(function* () {
        const rows = yield* dbErr(db.query.apikeys.findMany(config))
        return rows
      }),

    create: (input, opts) =>
      Effect.gen(function* () {
        const reference = opts.reference ?? 'user'
        const keyLength = opts.keyLength ?? 64
        const startCharsLength = opts.startCharsLength ?? 6
        const rateLimit = opts.rateLimit ?? {
          maxRequests: 10,
          timeWindow: 1000 * 60 * 60 * 24,
        }

        if ((input.refillAmount && !input.refillInterval) || (input.refillInterval && !input.refillAmount))
          return yield* Effect.fail(new RefillPairRequired())

        const generator = opts.keyGenerator ?? defaultKeyGenerator
        const hasher = opts.keyHasher ?? defaultKeyHasher
        const key = yield* Effect.promise(async () =>
          generator({ length: keyLength, prefix: input.prefix }))
        const hashedKey = yield* Effect.promise(async () => hasher(key))
        const start = key.substring(0, startCharsLength)
        const expiresAt = input.expiresIn ? new Date(Date.now() + input.expiresIn * 1000) : null
        const remaining = input.remaining ?? input.refillAmount ?? null
        const now = new Date()

        const [row] = yield* dbErr(db.insert(apikeys).values({
          configId: input.group,
          name: input.name,
          prefix: input.prefix,
          start,
          key: hashedKey,
          referenceId: input.referenceId,
          reference,
          rateLimitEnabled: input.rateLimitEnabled ?? true,
          rateLimitTimeWindow: input.rateLimitTimeWindow ?? rateLimit.timeWindow,
          rateLimitMax: input.rateLimitMax ?? rateLimit.maxRequests,
          remaining,
          refillAmount: input.refillAmount,
          refillInterval: input.refillInterval,
          expiresAt,
          permissions: input.permissions,
          metadata: input.metadata,
          createdAt: now,
          updatedAt: now,
        }).returning())

        if (!row)
          return yield* Effect.fail(new DbFailed({ cause: 'insert returned no row' }))

        return { ...row, key }
      }),

    update: (id, input) =>
      Effect.gen(function* () {
        // Fetch key first to derive reference/referenceId for the DB-level
        // integrity .where clause below — not an auth check.
        const existing = yield* dbErr(db.query.apikeys.findFirst({ where: { id } }))
        if (!existing)
          return yield* Effect.fail(new ApiKeyNotFound())
        const reference = existing.reference
        const referenceId = existing.referenceId

        if ((input.refillAmount !== undefined && input.refillInterval === undefined)
          || (input.refillInterval !== undefined && input.refillAmount === undefined)) {
          return yield* Effect.fail(new RefillPairRequired())
        }

        const { expiresIn, ...rest } = input
        const patch: Record<string, unknown> = { ...rest }
        if (expiresIn !== undefined) {
          patch.expiresAt = expiresIn === null
            ? null
            : new Date(Date.now() + expiresIn * 1000)
        }

        const hasChanges = Object.values(patch).some(v => v !== undefined)
        if (!hasChanges)
          return yield* Effect.fail(new NoChanges())

        patch.updatedAt = new Date()

        const [updated] = yield* dbErr(db.update(apikeys)
          .set(patch as Partial<typeof apikeys.$inferInsert>)
          .where(and(
            eq(apikeys.id, id),
            eq(apikeys.reference, reference),
            eq(apikeys.referenceId, referenceId),
          ))
          .returning())

        if (!updated)
          return yield* Effect.fail(new ApiKeyNotFound())
        return updated
      }),

    validate,

    verify: (plainKey, opts) =>
      Effect.gen(function* () {
        if (!plainKey)
          return yield* Effect.fail(new InvalidApiKey())
        const hasher = opts?.keyHasher ?? defaultKeyHasher
        const hashed = yield* Effect.promise(async () => hasher(plainKey))
        return yield* validate(hashed, opts)
      }),

    remove: (id) =>
      Effect.gen(function* () {
        // Fetch key first to derive reference/referenceId for the DB-level
        // integrity .where clause below — not an auth check.
        const existing = yield* dbErr(db.query.apikeys.findFirst({ where: { id } }))
        if (!existing)
          return yield* Effect.fail(new ApiKeyNotFound())
        const reference = existing.reference
        const referenceId = existing.referenceId

        const [deleted] = yield* dbErr(db.delete(apikeys)
          .where(and(
            eq(apikeys.id, id),
            eq(apikeys.reference, reference),
            eq(apikeys.referenceId, referenceId),
          ))
          .returning({ id: apikeys.id }))

        if (!deleted)
          return yield* Effect.fail(new ApiKeyNotFound())
        return true
      }),
  })
})

/** Live layer. */
export const layer = Layer.effect(ApiKeyService, make)
