import type { Auth } from '@czo/auth/config'
import type { ApiKey, AuthRelations, CreateApiKeyInput, UpdateApiKeyInput } from '@czo/auth/types'
import type { Database } from '@czo/kit/db'
// import type { ApiKey, ApiKeyOptions } from '@better-auth/api-key'
import type { Awaitable } from 'better-auth'
import type { InferSelectModel } from 'drizzle-orm'
import type { OrganizationService } from './organization.service'
import { defaultKeyHasher } from '@better-auth/api-key'
import { apikeys } from '@czo/auth/schema'
import { generateRandomString } from 'better-auth/crypto'
import { role } from 'better-auth/plugins'
import { and, eq, sql } from 'drizzle-orm'

// ─── Types ───────────────────────────────────────────────────────────

export type ApiKeyRow = InferSelectModel<typeof apikeys>

interface KeyGenerator {
  (options: { length: number, prefix: string | undefined }): Awaitable<string>
}

interface KeyHasher {
  (key: string): Awaitable<string>
}

interface CreateApiKeyOptions {
  /** Custom key generator. Defaults to a length-based random hex string. */
  keyGenerator?: KeyGenerator
  /** Custom hasher. Defaults to better-auth's `defaultKeyHasher` (sha256). */
  keyHasher?: KeyHasher
  // ── error callbacks (return-style, like user.service / organization.service)
  onFailed?: () => Promise<void>
  onIntrusion?: () => Promise<void>
  onRefillPairRequired?: () => Promise<void>
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

interface FindOneOptions {
  onNotFound?: () => Promise<void>
  onIntrusion?: () => Promise<void>
  session: {
    userId: number
  }
}

interface FindManyOptions {
  onIntrusion?: () => Promise<void>
  session: {
    userId: number
  }
}

interface ScopedQueryOptions {
  reference: string
  referenceId?: number
  userId: number
  onIntrusion?: () => Promise<void>
}

interface UpdateApiKeyOptions {
  onNotFound?: () => Promise<void>
  onIntrusion?: () => Promise<void>
  onFailed?: () => Promise<void>
  onNoChanges?: () => Promise<void>
  onRefillPairRequired?: () => Promise<void>
  reference?: string
  referenceId?: number
  session: {
    userId: number
  }
}

interface VerifyApiKeyOptions {
  /** Required permissions, e.g. `{ users: ['read', 'write'] }`. Subset check against `apiKey.permissions`. */
  permissions?: Record<string, string[]>
  /** Custom hasher for `verify` (plain → hashed). Defaults to better-auth's `defaultKeyHasher` (sha256). */
  keyHasher?: KeyHasher
  // ── error callbacks
  onInvalidKey?: () => Promise<void>
  onKeyDisabled?: () => Promise<void>
  onKeyExpired?: () => Promise<void>
  onUnauthorized?: () => Promise<void>
  onRateLimited?: (info: { tryAgainIn: number }) => Promise<void>
  /** Fired when the key has rate-limit enabled but `rateLimitTimeWindow`/`rateLimitMax` are non-positive (set-but-invalid). Callers should treat this as a config bug, not a normal rate limit. */
  onMisconfigured?: (info: { reason: string }) => Promise<void>
  onFailed?: () => Promise<void>
}

interface RemoveApiKeyOptions {
  onNotFound?: () => Promise<void>
  onIntrusion?: () => Promise<void>
  onFailed?: () => Promise<void>
  reference?: string
  referenceId?: number
  session: {
    userId: number
  }
}

export type ApiKeyService = ReturnType<typeof createApiKeyService>

// ─── Helpers ─────────────────────────────────────────────────────────

const defaultKeyGenerator: KeyGenerator = ({ length, prefix }) => {
  const hex = generateRandomString(length, 'a-z', 'A-Z')
  return prefix ? `${prefix}_${hex}` : hex
}

// ─── Factory ─────────────────────────────────────────────────────────

export function createApiKeyService(db: Database<AuthRelations>, auth: Auth, organizationService: OrganizationService) {
  /**
   * Verify the session caller is allowed to access keys belonging to (reference, referenceId).
   * - `user`: caller must BE the referenced user.
   * - `organization`: caller must be a member of the referenced organization.
   */
  const assertScopeAllowed = async (scope: ScopedQueryOptions): Promise<boolean> => {
    if (scope.reference === 'organization') {
      if (scope.referenceId === undefined) {
        await scope.onIntrusion?.()
        return false
      }
      const isMember = await organizationService.checkMembership(scope.referenceId, scope.userId)

      if (!isMember) {
        await scope.onIntrusion?.()
        return false
      }

      return true
    }

    if (scope.reference === 'user') {
      const { referenceId = scope.userId } = scope
      if (scope.userId !== referenceId) {
        await scope.onIntrusion?.()
        return false
      }

      return true
    }

    await scope.onIntrusion?.()

    return false
  }

  /**
   * Fetch a single API key, scoped to the caller's allowed (reference, referenceId).
   * The `where` is built by the service — callers cannot bypass scoping.
   */
  const findFirst = async (opts: FindOneOptions, config?: Parameters<typeof db.query.apikeys.findFirst>[0]): Promise<ApiKey | null> => {
    const { where } = config ?? {}
    const reference = where?.reference ?? 'user'
    const referenceId = where?.referenceId ?? opts.session.userId

    if (!(await assertScopeAllowed({
      reference: reference as string,
      referenceId: referenceId as number,
      userId: opts.session.userId,
      onIntrusion: opts.onIntrusion,
    }))) {
      return null
    }

    const data = await db.query.apikeys.findFirst({
      ...config,
      where: {
        ...where,
        reference,
        referenceId,
      },
    })

    if (!data) {
      await opts.onNotFound?.()
      return null
    }

    return data
  }

  /**
   * Validate a hashed API key — runs the full pipeline (lookup, enabled, expiry,
   * permissions, remaining/refill, rate-limit) and persists the updated row
   * (`remaining`, `lastRefillAt`, `requestCount`, `lastRequest`, `updatedAt`).
   *
   * Returns the updated row on success, `null` on any failure (callbacks signal which).
   *
   * Both the `remaining` decrement (and refill) and the `requestCount`
   * increment (and reset) are performed in a single atomic UPDATE — concurrent
   * requests cannot drive `remaining` below zero or under-count requests.
   * The rate-limit cap check is JS-side (best-effort signaling for
   * `onRateLimited`); under perfect concurrency it can be transiently
   * exceeded by N racing callers, but the count itself stays correct.
   */
  const validate = async (hashedKey: string, opts?: VerifyApiKeyOptions): Promise<ApiKey | null> => {
    const apiKey = await db.query.apikeys.findFirst({
      where: { key: hashedKey },
    })
    if (!apiKey) {
      await opts?.onInvalidKey?.()
      return null
    }

    if (!apiKey.enabled) {
      await opts?.onKeyDisabled?.()
      return null
    }

    const nowDate = new Date()
    const nowMs = nowDate.getTime()

    if (apiKey.expiresAt && apiKey.expiresAt.getTime() < nowMs) {
      await opts?.onKeyExpired?.()
      return null
    }

    if (opts?.permissions) {
      const granted = apiKey.permissions ?? {}
      const allowed = role(granted).authorize(opts.permissions)
      if (!allowed.success) {
        await opts.onUnauthorized?.()
        return null
      }
    }

    // Rate-limit cap check (best-effort, JS-side). The actual `requestCount`
    // increment is performed atomically in the UPDATE below, so concurrent
    // calls cannot under-count. The cap may be exceeded transiently by N
    // racing callers, but subsequent requests will see the correct count
    // and start blocking. Mirrors `better-auth/api-key/rate-limit.ts`.
    if (apiKey.rateLimitEnabled) {
      const windowMs = apiKey.rateLimitTimeWindow
      const max = apiKey.rateLimitMax
      // null = "not configured" → rate-limit disabled (matches better-auth).
      if (windowMs !== null && max !== null) {
        if (windowMs <= 0 || max <= 0) {
          await opts?.onMisconfigured?.({
            reason: 'rateLimitTimeWindow and rateLimitMax must be > 0 when rateLimitEnabled is true',
          })
          return null
        }
        const elapsed = nowMs - (apiKey.lastRequest?.getTime() ?? 0)
        const inWindow = apiKey.lastRequest !== null && elapsed < windowMs
        const currentCount = apiKey.requestCount ?? 0
        if (inWindow && currentCount >= max) {
          await opts?.onRateLimited?.({ tryAgainIn: Math.ceil(windowMs - elapsed) })
          return null
        }
      }
    }

    // Atomic decrement-or-refill: the CASE expressions and WHERE precondition
    // evaluate against the row's current state in DB, so concurrent calls
    // cannot both decrement past zero. Zero rows updated ⇒ quota exhausted.
    const refillDue = sql`(
      ${apikeys.refillInterval} IS NOT NULL
      AND ${apikeys.refillAmount} IS NOT NULL
      AND EXTRACT(EPOCH FROM (${nowDate}::timestamptz - COALESCE(${apikeys.lastRefillAt}, ${apikeys.createdAt}))) * 1000 > ${apikeys.refillInterval}
    )`

    let updated: ApiKey | undefined
    try {
      ;[updated] = await db.update(apikeys)
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
          // Atomic increment / reset / passthrough — race-free under
          // concurrent calls. Branches mirror the JS pre-check above.
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
        .returning()
    }
    catch {
      await opts?.onFailed?.()
      return null
    }

    if (!updated) {
      await opts?.onFailed?.()
      return null
    }

    return updated
  }

  return {
    findFirst,

    /**
     * List API keys for (reference, referenceId), gated on caller membership/ownership.
     * Returns `[]` on intrusion (callback fired), `[]` when no keys match.
     */
    async findMany(opts: FindManyOptions, config?: Parameters<typeof db.query.apikeys.findMany>[0]): Promise<ApiKey[]> {
      const { where } = config ?? {}
      const reference = where?.reference ?? 'user'
      const referenceId = where?.referenceId ?? opts.session.userId

      if (!(await assertScopeAllowed({
        reference: reference as string,
        referenceId: referenceId as number,
        userId: opts.session.userId,
      }))) {
        return []
      }

      return db.query.apikeys.findMany({
        ...config,
        where: {
          ...where,
          reference,
          referenceId,
        },
      })
    },

    /**
     * Create an API key — direct Drizzle implementation (replaces `auth.api.createApiKey`).
     * Mirrors the validation pipeline of better-auth's `create-api-key.ts` route.
     * Returns the inserted row plus the plain `key` (only available at creation time).
     */
    async create(input: CreateApiKeyInput, opts: CreateApiKeyOptions): Promise<(ApiKey) | null> {
      const {
        reference = 'user',
        keyLength = 64,
        startCharsLength = 6,
        rateLimit = {
          maxRequests: 10,
          timeWindow: 1000 * 60 * 60 * 24,
        },
      } = opts

      if (reference === 'organization') {
        const isMember = await organizationService.checkMembership(input.referenceId, opts.session.userId)
        if (!isMember) {
          await opts.onIntrusion?.()
          return null
        }
      }
      else if (reference === 'user' && opts.session.userId !== input.referenceId) {
        await opts.onIntrusion?.()
        return null
      }

      if ((input.refillAmount && !input.refillInterval) || (input.refillInterval && !input.refillAmount)) {
        await opts.onRefillPairRequired?.()
        return null
      }

      const generator = opts.keyGenerator ?? defaultKeyGenerator
      const hasher = opts.keyHasher ?? defaultKeyHasher
      const key = await generator({ length: keyLength, prefix: input.prefix })
      const hashedKey = await hasher(key)
      const start = key.substring(0, startCharsLength)

      const expiresAt = input.expiresIn
        ? new Date(Date.now() + input.expiresIn * 1000)
        : null
      const remaining = input.remaining ?? input.refillAmount ?? null

      const now = new Date()

      let apiKey: ApiKey | undefined
      try {
        ;[apiKey] = await db.insert(apikeys).values({
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
        }).returning()
      }
      catch {
        await opts.onFailed?.()
        return null
      }

      if (!apiKey) {
        await opts.onFailed?.()
        return null
      }

      return { ...apiKey, key }
    },

    /**
     * Update an API key — direct Drizzle implementation (replaces `auth.api.updateApiKey`).
     * Mirrors the validation pipeline of better-auth's `update-api-key.ts` route.
     * Returns the updated row, or `null` on intrusion / not-found / no-changes / failure
     * (caller signaled via callbacks).
     */
    async update(id: number, input: UpdateApiKeyInput, opts: UpdateApiKeyOptions): Promise<ApiKey | null> {
      const { reference = 'user' } = opts
      const referenceId = opts.referenceId ?? (reference === 'user' ? opts.session.userId : undefined)

      if (!(await assertScopeAllowed({
        reference,
        referenceId,
        userId: opts.session.userId,
        onIntrusion: opts.onIntrusion,
      }))) {
        return null
      }

      if ((input.refillAmount !== undefined && input.refillInterval === undefined)
        || (input.refillInterval !== undefined && input.refillAmount === undefined)) {
        await opts.onRefillPairRequired?.()
        return null
      }

      const { expiresIn, ...rest } = input
      const patch: Partial<typeof apikeys.$inferInsert> = { ...rest }

      if (expiresIn !== undefined) {
        patch.expiresAt = expiresIn === null
          ? null
          : new Date(Date.now() + expiresIn * 1000)
      }

      const hasChanges = Object.values(patch).some(v => v !== undefined)
      if (!hasChanges) {
        await opts.onNoChanges?.()
        return null
      }

      patch.updatedAt = new Date()

      let updated: ApiKey | undefined
      try {
        ;[updated] = await db.update(apikeys)
          .set(patch)
          .where(and(
            eq(apikeys.id, id),
            eq(apikeys.reference, reference),
            eq(apikeys.referenceId, referenceId!),
          ))
          .returning()
      }
      catch {
        await opts.onFailed?.()
        return null
      }

      if (!updated) {
        await opts.onNotFound?.()
        return null
      }

      return updated
    },

    validate,

    /**
     * Verify a plain API key — hashes the input then delegates to `validate`.
     * Use this from request-handling code that holds the user-supplied key.
     */
    async verify(plainKey: string, opts?: VerifyApiKeyOptions): Promise<ApiKey | null> {
      if (!plainKey) {
        await opts?.onInvalidKey?.()
        return null
      }
      const hasher = opts?.keyHasher ?? defaultKeyHasher
      const hashed = await hasher(plainKey)
      return validate(hashed, opts)
    },

    /**
     * Delete an API key — direct Drizzle implementation (replaces `auth.api.deleteApiKey`).
     * Mirrors the ownership pipeline of better-auth's `delete-api-key.ts` route.
     * Returns `true` on success, `null` on any failure (caller signaled via callbacks).
     */
    async remove(id: number, opts: RemoveApiKeyOptions): Promise<boolean> {
      const { reference = 'user' } = opts
      const referenceId = opts.referenceId ?? (reference === 'user' ? opts.session.userId : undefined)

      if (!(await assertScopeAllowed({
        reference,
        referenceId,
        userId: opts.session.userId,
        onIntrusion: opts.onIntrusion,
      }))) {
        return false
      }

      try {
        const [deleted] = await db.delete(apikeys)
          .where(and(
            eq(apikeys.id, id),
            eq(apikeys.reference, reference),
            eq(apikeys.referenceId, referenceId!),
          ))
          .returning({ id: apikeys.id })

        if (!deleted) {
          await opts.onNotFound?.()

          return false
        }
      }
      catch {
        await opts.onFailed?.()
        return false
      }

      return true
    },
  }
}
