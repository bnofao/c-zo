import type { Relations } from '@czo/auth/relations'
import type { Database } from '@czo/kit/db/effect'
import type { SessionRow, User } from './user'
import { randomBytes } from 'node:crypto'
import { DrizzleDb } from '@czo/kit/db/effect'
import { eq, lt } from 'drizzle-orm'
import { createSelectSchema } from 'drizzle-orm/effect-schema'
import { Context, Data, Duration, Effect, Layer, Schema } from 'effect'
import { Persistable, PersistedCache } from 'effect/unstable/persistence'
import { SESSION_DURATION } from '../constants'
import { sessions, users } from '../database/schema'
import * as Cookie from './cookie'

/**
 * The canonical session lifetime now lives in `../constants` (a `Duration`,
 * shared with `services/cookie.ts`, which pins the cookie `maxAge` to the same
 * value). Re-exported here so the `Session` namespace still surfaces it.
 */
export { SESSION_DURATION }
const L1_TTL = Duration.seconds(30)
const NEGATIVE_TTL = Duration.seconds(30)

/** `{ session, user }` — the resolved-session shape. */
export interface ResolvedSession {
  readonly session: SessionRow
  readonly user: User
}

export interface CreateSessionInput {
  readonly userId: number
  /** Defaults to `'user'` — `sessions.actorType` is `NOT NULL`, so `create` fills it. */
  readonly actorType?: string
  readonly ipAddress?: string
  readonly userAgent?: string
  /** Override the 7-day default — tests only (a negative `Duration` → already-expired). */
  readonly expiresIn?: Duration.Duration
}

/** Single tagged error for ANY session-store infrastructure failure (L2/L3). */
export class SessionStoreFailed extends Data.TaggedError('SessionStoreFailed')<{
  readonly cause: unknown
}> {
  readonly code = 'SESSION_STORE_FAILED'
  get message() { return 'Session store operation failed' }
}

export class SessionService extends Context.Service<SessionService, {
  readonly create: (input: CreateSessionInput) => Effect.Effect<
    { token: string, session: SessionRow },
    SessionStoreFailed
  >
  readonly resolve: (token: string) => Effect.Effect<ResolvedSession | null, SessionStoreFailed>
  readonly revoke: (token: string) => Effect.Effect<void, SessionStoreFailed>
  readonly revokeAllForUser: (userId: number) => Effect.Effect<void, SessionStoreFailed>
  readonly purgeExpired: () => Effect.Effect<number, SessionStoreFailed>
  readonly setCookie: (token: string) => Cookie.Cookie
  readonly readSessionToken: (cookieHeader: string) => string | null
}>()('@czo/auth/SessionService') {}

// ─── Cache value schema + key (Persistable) ──────────────────────────────

/**
 * `PersistedCache` value schema — derived from the Drizzle tables via
 * `drizzle-orm/effect-schema`'s `createSelectSchema`, so it cannot drift from
 * the real `sessions` / `users` columns. Requires `drizzle-orm@1.0.0-rc.3` +
 * `effect@4.0.0-beta.70` — older pairings crash `createSelectSchema` at module
 * load (`members.map is not a function`).
 */
const ResolvedSessionSchema = Schema.NullOr(Schema.Struct({
  session: createSelectSchema(sessions),
  user: createSelectSchema(users),
}))

/** `PersistedCache` key — one cache entry per session token. */
class SessionKey extends Persistable.Class<{ payload: { token: string } }>()(
  '@czo/auth/SessionKey',
  {
    primaryKey: p => p.token,
    success: ResolvedSessionSchema,
    error: Schema.Never,
  },
) {}

// ─── Layer ───────────────────────────────────────────────────────────────

const make = Effect.gen(function* () {
  const db = (yield* DrizzleDb) as Database<Relations>
  const cookies = yield* Cookie.CookieService

  const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(Effect.mapError(cause => new SessionStoreFailed({ cause })))

  /**
   * L3 — source of truth: read `sessions ⋈ users` via a SQL join, honour
   * expiry. The `sessions` table has no Drizzle relation to `users` defined in
   * `database/relations.ts`, so `db.query.sessions.findFirst({ with: { user:
   * true } })` is not available — use an explicit `innerJoin` instead.
   *
   * `lookup`'s typed `E` must be `never` (constraint from `PersistedCache`). DB
   * errors are made defects via `Effect.orDie`; they propagate as cache failures
   * → caught by `cache.get` error → mapped to `SessionStoreFailed` in `resolve`.
   */
  const lookup = (key: SessionKey): Effect.Effect<ResolvedSession | null> =>
    Effect.gen(function* () {
      const rows = yield* db
        .select()
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(eq(sessions.token, key.token))
        .limit(1)
        .pipe(Effect.orDie)

      const row = rows[0]
      if (!row)
        return null

      const session = row.sessions
      const user = row.users

      if (session.expiresAt.getTime() <= Date.now()) {
        yield* db.delete(sessions).where(eq(sessions.token, key.token)).pipe(Effect.orDie)
        return null
      }

      return { session: session as SessionRow, user: user as User }
    })

  const cache = yield* PersistedCache.make(lookup, {
    storeId: '@czo/auth/session',
    // L2 TTL is the session's REAL remaining lifetime — not a flat 7 days —
    // so an expired (or bulk-revoked) session can't be served stale from L2.
    // TimeToLiveFn signature: (exit, _request) => Duration.Input
    timeToLive: (exit, _request) => {
      if (exit._tag !== 'Success' || exit.value === null)
        return NEGATIVE_TTL
      const remainingMs = exit.value.session.expiresAt.getTime() - Date.now()
      return remainingMs > 0 ? Duration.millis(remainingMs) : NEGATIVE_TTL
    },
    // L1 in-memory TTL — short fixed window to bound staleness.
    // Second parameter (_request) is unused but required by TimeToLiveFn type.
    inMemoryTTL: (_exit, _request) => L1_TTL,
    inMemoryCapacity: 10_000,
  })

  return SessionService.of({
    create: input =>
      Effect.gen(function* () {
        const token = randomBytes(32).toString('base64url')
        const now = new Date()
        const ttl = input.expiresIn ?? SESSION_DURATION
        const [session] = yield* dbErr(
          db.insert(sessions).values({
            userId: input.userId,
            token,
            ipAddress: input.ipAddress ?? null,
            userAgent: input.userAgent ?? null,
            actorType: input.actorType ?? 'user',
            expiresAt: new Date(now.getTime() + Duration.toMillis(ttl)),
            createdAt: now,
            updatedAt: now,
          }).returning(),
        )
        if (!session)
          return yield* Effect.fail(new SessionStoreFailed({ cause: 'insert returned no row' }))
        return { token, session: session as SessionRow }
      }),
    resolve: token =>
      cache.get(new SessionKey({ token })).pipe(
        Effect.mapError(cause => new SessionStoreFailed({ cause })),
      ),
    revoke: token =>
      dbErr(db.delete(sessions).where(eq(sessions.token, token))).pipe(
        Effect.andThen(
          cache.invalidate(new SessionKey({ token })).pipe(
            Effect.mapError(cause => new SessionStoreFailed({ cause })),
          ),
        ),
      ),
    revokeAllForUser: userId =>
      // Delete every session row AND invalidate its cache entry — otherwise
      // bulk-revoked sessions keep resolving as valid from L1/L2 until TTL.
      dbErr(
        db.delete(sessions).where(eq(sessions.userId, userId)).returning({ token: sessions.token }),
      ).pipe(
        Effect.flatMap(rows =>
          Effect.forEach(
            rows,
            ({ token }) =>
              cache.invalidate(new SessionKey({ token })).pipe(
                Effect.mapError(cause => new SessionStoreFailed({ cause })),
              ),
            { discard: true, concurrency: 'unbounded' },
          ),
        ),
      ),
    purgeExpired: () =>
      dbErr(
        db.delete(sessions)
          .where(lt(sessions.expiresAt, new Date()))
          .returning({ id: sessions.id }),
      ).pipe(Effect.map(deleted => deleted.length)),
    setCookie: token => cookies.create(token),
    readSessionToken: header => cookies.parse(header)[cookies.name] ?? null,
  })
})

/**
 * Layer — uses `Layer.effect` which in Effect 4 beta strips `Scope` from R
 * (replacing Effect 3's `Layer.scoped`). The `PersistedCache` is acquired
 * inside the scope provided by the layer's own Scope.
 */
export const layer = Layer.effect(SessionService, make)
