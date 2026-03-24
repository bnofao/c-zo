import type { BetterAuthOptions } from 'better-auth'
import type { AuthActorService } from '../actor'
import { AUTH_EVENTS, publishAuthEvent } from '../../events'
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
  }
}

type SessionHooks = Exclude<BetterAuthOptions['databaseHooks'], undefined>['session']
type SessionCreateBefore = Exclude<Exclude<SessionHooks, undefined>['create'], undefined>['before']
type SessionCreateAfter = Exclude<Exclude<SessionHooks, undefined>['create'], undefined>['after']

export function sessionHooks(actorService: AuthActorService) {
  const before: SessionCreateBefore = async (session, authCtx) => {
    const actorType = authCtx?.getHeader(ACTOR_TYPE_HEADER) as string | undefined

    if (actorType && !(await actorService.hasActorType(session.userId, actorType))) {
      const reason = `User ${session.userId} does not have actor type "${actorType}"`
      void publishAuthEvent(AUTH_EVENTS.RESTRICTION_DENIED, { actorType, userId: session.userId, reason })
      return false
    }

    return {
      data: {
        ...session,
        actorType,
        organizationId: null,
      },
    }
  }

  const after: SessionCreateAfter = async (session) => {
    void publishAuthEvent(AUTH_EVENTS.SESSION_CREATED, {
      sessionId: session.id,
      userId: session.userId,
      actorType: session.actorType as string | undefined,
      authMethod: session.authMethod as string | undefined,
    })

    void publishAuthEvent(AUTH_EVENTS.NEW_DEVICE_LOGIN, {
      userId: session.userId,
      sessionId: session.id,
      ipAddress: (session.ipAddress as string | null) ?? null,
      userAgent: (session.userAgent as string | null) ?? null,
    })
  }

  return {
    create: { before, after },
  }
}
