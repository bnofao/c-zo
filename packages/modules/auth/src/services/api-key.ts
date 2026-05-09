import type { apikeys } from '@czo/auth/schema'
import type { Awaitable } from 'better-auth'
import type { InferSelectModel } from 'drizzle-orm'
import type { createApiKeyService } from '../layers/api-key'

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

export interface FindOneOptions {
  onNotFound?: () => Promise<void>
  onIntrusion?: () => Promise<void>
  session: {
    userId: number
  }
}

export interface FindManyOptions {
  onIntrusion?: () => Promise<void>
  session: {
    userId: number
  }
}

export interface ScopedQueryOptions {
  reference: string
  referenceId?: number
  userId: number
  onIntrusion?: () => Promise<void>
}

export interface UpdateApiKeyOptions {
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

export interface VerifyApiKeyOptions {
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

export interface RemoveApiKeyOptions {
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

// Re-export the factory from the impl side so existing call sites that import
// from '@czo/auth/services' keep working until PR3 introduces the Effect Tag.
export { createApiKeyService } from '../layers/api-key'
