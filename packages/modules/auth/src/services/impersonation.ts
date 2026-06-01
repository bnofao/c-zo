import type { SessionStoreFailed } from './session'
import type { SessionRow, User, UserDbFailed, UserNotFound } from './user'
import { Context, Data, Duration, Effect, Layer } from 'effect'
import { IMPERSONATION_DEFAULT_TTL, IMPERSONATION_MAX_TTL } from '../constants'
import { AuthEvents } from './events/auth'
import { SessionService } from './session'
import { UserService } from './user'

// ─── Tagged errors ──────────────────────────────────────────────────────

export class CannotImpersonateSelf extends Data.TaggedError('CannotImpersonateSelf')<{
  readonly userId: number
}> {
  readonly code = 'CANNOT_IMPERSONATE_SELF'
  get message() { return 'You cannot impersonate yourself' }
}

export class CannotImpersonateAdmin extends Data.TaggedError('CannotImpersonateAdmin')<{
  readonly targetUserId: number
}> {
  readonly code = 'CANNOT_IMPERSONATE_ADMIN'
  get message() { return 'Cannot impersonate another admin' }
}

export class CannotImpersonateBannedUser extends Data.TaggedError('CannotImpersonateBannedUser')<{
  readonly targetUserId: number
}> {
  readonly code = 'CANNOT_IMPERSONATE_BANNED_USER'
  get message() { return 'Cannot impersonate a banned user' }
}

export class CannotChainImpersonation extends Data.TaggedError('CannotChainImpersonation')<{
  readonly currentToken: string
}> {
  readonly code = 'CANNOT_CHAIN_IMPERSONATION'
  get message() { return 'Cannot start impersonation from an impersonation session' }
}

export class ImpersonationTtlTooLong extends Data.TaggedError('ImpersonationTtlTooLong')<{
  readonly requestedMs: number
  readonly maxMs: number
}> {
  readonly code = 'IMPERSONATION_TTL_TOO_LONG'
  get message() { return `Requested TTL exceeds max (${this.maxMs}ms)` }
}

export class ImpersonationNotActive extends Data.TaggedError('ImpersonationNotActive')<{
  readonly token: string
}> {
  readonly code = 'IMPERSONATION_NOT_ACTIVE'
  get message() { return 'Current session is not an impersonation' }
}

// ─── Config Tag ─────────────────────────────────────────────────────────

export class ImpersonationConfig extends Context.Service<
  ImpersonationConfig,
  {
    readonly defaultTtl: Duration.Duration
    readonly maxTtl: Duration.Duration
    readonly allowImpersonateAdmin: boolean
  }
>()('@czo/auth/ImpersonationConfig') {}

export interface ImpersonationOptions {
  readonly defaultTtl?: Duration.Duration
  readonly maxTtl?: Duration.Duration
  readonly allowImpersonateAdmin?: boolean
}

export function makeImpersonationConfigLayer(config?: ImpersonationOptions): Layer.Layer<ImpersonationConfig> {
  return Layer.succeed(ImpersonationConfig, {
    defaultTtl: config?.defaultTtl ?? IMPERSONATION_DEFAULT_TTL,
    maxTtl: config?.maxTtl ?? IMPERSONATION_MAX_TTL,
    allowImpersonateAdmin: config?.allowImpersonateAdmin ?? false,
  })
}

// ─── Service contract ───────────────────────────────────────────────────

export interface StartImpersonationInput {
  readonly adminId: number
  readonly adminToken: string
  readonly targetUserId: number
  readonly ttl?: Duration.Duration
  readonly reason?: string
}

export interface ImpersonationResult {
  readonly session: SessionRow
  readonly user: User
}

export type StartImpersonationError
  = | UserNotFound
    | UserDbFailed
    | CannotImpersonateSelf
    | CannotImpersonateAdmin
    | CannotImpersonateBannedUser
    | CannotChainImpersonation
    | ImpersonationTtlTooLong
    | SessionStoreFailed

export type StopImpersonationError
  = | ImpersonationNotActive
    | SessionStoreFailed

export class ImpersonationService extends Context.Service<
  ImpersonationService,
  {
    readonly start: (input: StartImpersonationInput) => Effect.Effect<ImpersonationResult, StartImpersonationError>
    readonly stop: (currentToken: string) => Effect.Effect<ImpersonationResult, StopImpersonationError>
  }
>()('@czo/auth/ImpersonationService') {}

// ─── Live layer ─────────────────────────────────────────────────────────

/**
 * Heuristic: a role is admin-like if any comma-separated token contains 'admin'.
 *
 * Matches the project's actual admin role names (`admin`, `admin:viewer`,
 * `admin:manager`) registered in `ADMIN_HIERARCHY`. False-positives are
 * possible on custom role names that happen to contain the substring (e.g.
 * `badminton`) — none exist in the project today.
 *
 * TODO: tighten to exact match against `AccessService` registered admin role
 * names once that surface exposes role metadata.
 */
function isAdminRole(role: string | null | undefined): boolean {
  if (!role)
    return false
  return role.split(',').some(r => r.trim().toLowerCase().includes('admin'))
}

const make = Effect.gen(function* () {
  const sessions = yield* SessionService
  const users = yield* UserService
  const events = yield* AuthEvents
  const config = yield* ImpersonationConfig

  const start = Effect.fn('impersonation.start')(
    function* (input: StartImpersonationInput) {
      const { adminId, adminToken, targetUserId, ttl, reason } = input

      // Guard 1: self
      if (adminId === targetUserId)
        return yield* Effect.fail(new CannotImpersonateSelf({ userId: adminId }))

      // Guard 2: ttl cap
      const effectiveTtl = ttl ?? config.defaultTtl
      const requestedMs = Duration.toMillis(effectiveTtl)
      const maxMs = Duration.toMillis(config.maxTtl)
      if (requestedMs > maxMs)
        return yield* Effect.fail(new ImpersonationTtlTooLong({ requestedMs, maxMs }))

      // Guard 3: chain check — admin's current session must not itself be an
      // impersonation. We resolve the token; if the session row has
      // `impersonatedBy` set, it's a child session.
      // NOTE: while a child session exists, `resolve` returns null for the
      // parent (admin) session due to the NOT EXISTS subquery; for the
      // chain-check call path the admin's own session is NOT yet a parent of
      // anything, so it resolves normally.
      const adminResolved = yield* sessions.resolve(adminToken)
      if (adminResolved && adminResolved.session.impersonatedBy != null)
        return yield* Effect.fail(new CannotChainImpersonation({ currentToken: adminToken }))

      // Guard 4: target exists
      const target = yield* users.findFirst({ where: { id: targetUserId } })

      // Guard 5: target not banned
      if (target.banned)
        return yield* Effect.fail(new CannotImpersonateBannedUser({ targetUserId }))

      // Guard 6: target not admin (unless allowed)
      if (!config.allowImpersonateAdmin && isAdminRole(target.role))
        return yield* Effect.fail(new CannotImpersonateAdmin({ targetUserId }))

      // Create the child session linked to the admin's parent token.
      const { session: child } = yield* sessions.create({
        userId: targetUserId,
        actorType: 'user',
        impersonatedBy: adminId,
        parentToken: adminToken,
        expiresIn: effectiveTtl,
      })

      yield* Effect.forkDetach(events.publish({
        _tag: 'ImpersonationStarted',
        adminId,
        targetUserId,
        sessionToken: child.token,
        reason: reason ?? null,
        expiresAt: child.expiresAt,
      }))

      return { session: child, user: target } satisfies ImpersonationResult
    },
  )

  const stop = Effect.fn('impersonation.stop')(
    function* (currentToken: string) {
      // Resolve the child to obtain its parentToken + impersonatedBy fields.
      // Distinct from the auto walk-up in `SessionService.lookup`: an explicit
      // stop must verify the caller is *actually* on a child session before
      // mutating anything.
      const childResolved = yield* sessions.resolve(currentToken)
      if (!childResolved || childResolved.session.impersonatedBy == null || childResolved.session.parentToken == null)
        return yield* Effect.fail(new ImpersonationNotActive({ token: currentToken }))

      const adminId = Number(childResolved.session.impersonatedBy)
      const targetUserId = childResolved.session.userId
      const parentToken = childResolved.session.parentToken

      yield* sessions.revoke(currentToken)

      const restored = yield* sessions.resolve(parentToken)
      if (!restored)
        return yield* Effect.fail(new ImpersonationNotActive({ token: currentToken }))

      yield* Effect.forkDetach(events.publish({
        _tag: 'ImpersonationStopped',
        adminId,
        targetUserId,
        sessionToken: currentToken,
        reason: 'explicit',
      }))

      return { session: restored.session, user: restored.user } satisfies ImpersonationResult
    },
  )

  return ImpersonationService.of({ start, stop })
})

export const layer = Layer.effect(ImpersonationService, make)
