import type { BetterAuthOptions } from 'better-auth'
import type { ActorProviderFailed } from '../../services/actor'
import { runEffect, useRuntime } from '@czo/kit/effect'
import { Effect } from 'effect'
import { AuthActorService } from '../../services/actor'
import { ACTOR_TYPE_HEADER } from './actor'

export const SESSION_EXPIRY_SECONDS = 604800
export const SESSION_REFRESH_AGE = 86400

export function sessionConfig(option?: BetterAuthOptions['session']) {
  return {
    ...option,
    modelName: 'sessions',
    fields: {
      // expiresAt: 'expires_at',
      // createdAt: 'created_at',
      // updatedAt: 'updated_at',
      // ipAddress: 'ip_address',
      // userAgent: 'user_agent',
      // userId: 'user_id',
    },
    expiresIn: SESSION_EXPIRY_SECONDS,
    updateAge: SESSION_REFRESH_AGE,
    additionalFields: {
      actorType: { type: 'string' as const, defaultValue: 'customer', input: false, fieldName: 'actor_type' },
      organizationId: { type: 'string' as const, required: false, input: false, fieldName: 'organization_id' },
    },
    preserveSessionInDatabase: true,
    // storeSessionInDatabase: true,
  }
}

type SessionHooks = Exclude<BetterAuthOptions['databaseHooks'], undefined>['session']
type SessionCreateBefore = Exclude<Exclude<SessionHooks, undefined>['create'], undefined>['before']
type SessionCreateAfter = Exclude<Exclude<SessionHooks, undefined>['create'], undefined>['after']

/**
 * Resolve `hasActorType` against the boot Effect runtime.
 *
 * Returns `true`/`false` for a clean check, and rejects with `ActorProviderFailed`
 * when the registered provider throws — leaving the *policy* for a provider
 * failure to the caller (`before` hook below).
 */
async function checkActorType(userId: string, actorType: string): Promise<boolean> {
  return runEffect(
    useRuntime(),
    AuthActorService.pipe(Effect.flatMap(s => s.hasActorType(userId, actorType))),
  )
}

export function sessionHooks() {
  const before: SessionCreateBefore = async (session, authCtx) => {
    const actorType = authCtx?.getHeader(ACTOR_TYPE_HEADER) as string | undefined

    if (actorType) {
      let allowed: boolean
      try {
        allowed = await checkActorType(session.userId, actorType)
      }
      catch (cause) {
        // TODO(contribution): decide the policy when the actor provider itself
        // FAILS (network/DB error inside `provider.hasActorType` → surfaces
        // here as `ActorProviderFailed`). Today the original code would let the
        // exception bubble out of this hook (fail-closed, but with a raw error
        // and no audit trail). Options to consider:
        //   - fail closed cleanly: publish a denial event, `return false`
        //   - fail open: log + `return { data: { ...session, actorType, organizationId: null } }`
        //   - re-throw to keep better-auth's default error handling
        // Implement the chosen behaviour here. (`cause` is the ActorProviderFailed.)
        throw cause as ActorProviderFailed
      }

      if (!allowed) {
        // TODO(events): publish RestrictionDenied via SecurityEvents once the
        // domain bus exists.
        return false
      }
    }

    return {
      data: {
        ...session,
        actorType,
        organizationId: null,
      },
    }
  }

  const after: SessionCreateAfter = async (_session) => {
    // TODO(events): publish SessionCreated / NewDeviceLogin via SessionEvents
    // when the domain bus exists.
  }

  return {
    create: { before, after },
  }
}
