import { Duration } from 'effect'

/**
 * Session lifetime — the ONE source for both the cookie `maxAge`
 * (`services/cookie.ts`) and the DB session `expiresAt` (`services/session.ts`).
 * A single constant guarantees the two can never drift. Typed as an Effect
 * `Duration` (consistent with the cache TTLs in `session.ts`); callers convert
 * at the boundary — `Duration.toMillis` for the DB `Date`, `Duration.toSeconds`
 * for the cookie `Max-Age`.
 */
export const SESSION_DURATION: Duration.Duration = Duration.days(7)

/**
 * Lifetime of a pending organization invitation. Drives the `invitations`
 * row `expiresAt` (`now + INVITATION_DURATION`). Convert at the boundary
 * with `Duration.toMillis`.
 */
export const INVITATION_DURATION: Duration.Duration = Duration.days(7)

/**
 * Impersonation session TTL defaults. `IMPERSONATION_DEFAULT_TTL` is the
 * fallback when an admin doesn't request an explicit duration;
 * `IMPERSONATION_MAX_TTL` is the upper bound enforced by `AuthService`.
 * Host apps can override via `AuthModuleConfig.impersonation`.
 */
export const IMPERSONATION_DEFAULT_TTL: Duration.Duration = Duration.hours(1)
export const IMPERSONATION_MAX_TTL: Duration.Duration = Duration.hours(4)
