import { RateLimiter } from '@czo/kit/ratelimit'
import { Effect } from 'effect'

/** Per-action credential rate-limit policy (fixed-window, seconds). */
export interface CredentialLimits {
  readonly ipLimit: number
  readonly emailLimit: number
  readonly windowSeconds: number
}

export const SIGNIN_LIMITS: CredentialLimits = { ipLimit: 20, emailLimit: 5, windowSeconds: 60 }
export const SIGNUP_LIMITS: CredentialLimits = { ipLimit: 10, emailLimit: 3, windowSeconds: 60 }

/**
 * Two fixed-window gates per attempt: a broad per-IP cap (stops single-source
 * brute-force / DoS) AND a strict per-email cap (stops credential-stuffing one
 * account from many IPs). Either breach fails the effect with the Effect
 * `RateLimiterError`, which the handler maps to HTTP 429. Consumes on every
 * attempt (success or failure) — simplest safe DoS posture.
 */
export function rateLimitCredentials(action: 'signin' | 'signup', ip: string, email: string, limits: CredentialLimits): Effect.Effect<void, RateLimiter.RateLimiterError, RateLimiter.RateLimiter> {
  return Effect.gen(function* () {
    const rl = yield* RateLimiter.RateLimiter
    const window = `${limits.windowSeconds} seconds` as const
    yield* rl.consume({ key: `auth:${action}:ip:${ip}`, limit: limits.ipLimit, window, algorithm: 'fixed-window', onExceeded: 'fail' })
    yield* rl.consume({ key: `auth:${action}:email:${email.toLowerCase()}`, limit: limits.emailLimit, window, algorithm: 'fixed-window', onExceeded: 'fail' })
  })
}
