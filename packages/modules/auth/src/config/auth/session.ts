import type { BetterAuthOptions } from 'better-auth'
import type { AuthMethod } from '../actor'
import { useContainer } from '@czo/kit/ioc'
import { AUTH_EVENTS, publishAuthEvent } from '../../events'

export const SESSION_EXPIRY_SECONDS = 604800
export const SESSION_REFRESH_AGE = 86400

export function sessionConfig(option?: BetterAuthOptions['session']) {
  return {
    ...option,
    modelName: 'sessions',
    fields: {
      expiresAt: 'expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      ipAddress: 'ip_address',
      userAgent: 'user_agent',
      userId: 'user_id',
    },
    expiresIn: SESSION_EXPIRY_SECONDS,
    updateAge: SESSION_REFRESH_AGE,
    additionalFields: {
      actorType: { type: 'string' as const, defaultValue: 'customer', input: false, fieldName: 'actor_type' },
      authMethod: { type: 'string' as const, defaultValue: 'email', input: false, fieldName: 'auth_method' },
      organizationId: { type: 'string' as const, required: false, input: false, fieldName: 'organization_id' },
    },
    preserveSessionInDatabase: true,
  }
}

type SessionHooks = Exclude<BetterAuthOptions['databaseHooks'], undefined>['session']
type SessionCreateBefore = Exclude<Exclude<SessionHooks, undefined>['create'], undefined>['before']
type SessionCreateAfter = Exclude<Exclude<SessionHooks, undefined>['create'], undefined>['after']

export function sessionHooks() {
  const before: SessionCreateBefore = async (session, authCtx) => {
    const actorService = await useContainer().make('auth:actor')
    const actorType = authCtx?.context?.actorType as string | undefined
    const authMethod = authCtx?.context?.authMethod as string | undefined

    if (actorType && authMethod && !actorService.isMethodAllowedForActor(actorType, authMethod as AuthMethod)) {
      const reason = `Auth method "${authMethod}" is not allowed for actor type "${actorType}". User: ${session.userId}`
      void publishAuthEvent(AUTH_EVENTS.RESTRICTION_DENIED, { actorType, authMethod, userId: session.userId, reason })
      return false
    }

    return {
      data: {
        ...session,
        actorType,
        authMethod,
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
  }

  return {
    create: { before, after },
  }
}
