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
