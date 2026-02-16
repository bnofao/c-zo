import type { EventBus } from '@czo/kit/event-bus'
import type {
  Auth2FADisabledPayload,
  Auth2FAEnabledPayload,
  AuthApiKeyCreatedPayload,
  AuthApiKeyRevokedPayload,
  AuthImpersonationStartedPayload,
  AuthImpersonationStoppedPayload,
  AuthOrgCreatedPayload,
  AuthOrgMemberAddedPayload,
  AuthOrgMemberRemovedPayload,
  AuthOrgRoleChangedPayload,
  AuthRestrictionDeniedPayload,
  AuthSessionCreatedPayload,
  AuthSessionRevokedPayload,
  AuthUserBannedPayload,
  AuthUserRegisteredPayload,
  AuthUserUnbannedPayload,
  AuthUserUpdatedPayload,
} from './types'
import { useLogger } from '@czo/kit'
import { createDomainEvent, useEventBus } from '@czo/kit/event-bus'
import { AUTH_EVENTS } from './types'

export class AuthEventsService {
  private busPromise: Promise<EventBus> | undefined
  private readonly logger: ReturnType<typeof useLogger>

  constructor() {
    this.logger = useLogger('auth:events')
  }

  private getBus(): Promise<EventBus> {
    if (!this.busPromise) {
      this.busPromise = useEventBus().catch((err) => {
        this.busPromise = undefined
        throw err
      })
    }
    return this.busPromise
  }

  private async safePublish(type: string, payload: unknown): Promise<void> {
    try {
      const bus = await this.getBus()
      const event = createDomainEvent({
        type,
        payload,
        metadata: { source: 'auth' },
      })
      await bus.publish(event)
    }
    catch (err) {
      this.logger.warn(`Failed to publish ${type} event`, (err as Error).message)
    }
  }

  async userRegistered(payload: AuthUserRegisteredPayload): Promise<void> {
    await this.safePublish(AUTH_EVENTS.USER_REGISTERED, payload)
  }

  async userUpdated(payload: AuthUserUpdatedPayload): Promise<void> {
    await this.safePublish(AUTH_EVENTS.USER_UPDATED, payload)
  }

  async sessionCreated(payload: AuthSessionCreatedPayload): Promise<void> {
    await this.safePublish(AUTH_EVENTS.SESSION_CREATED, payload)
  }

  async sessionRevoked(payload: AuthSessionRevokedPayload): Promise<void> {
    await this.safePublish(AUTH_EVENTS.SESSION_REVOKED, payload)
  }

  async orgCreated(payload: AuthOrgCreatedPayload): Promise<void> {
    await this.safePublish(AUTH_EVENTS.ORG_CREATED, payload)
  }

  async orgMemberAdded(payload: AuthOrgMemberAddedPayload): Promise<void> {
    await this.safePublish(AUTH_EVENTS.ORG_MEMBER_ADDED, payload)
  }

  async orgMemberRemoved(payload: AuthOrgMemberRemovedPayload): Promise<void> {
    await this.safePublish(AUTH_EVENTS.ORG_MEMBER_REMOVED, payload)
  }

  async orgRoleChanged(payload: AuthOrgRoleChangedPayload): Promise<void> {
    await this.safePublish(AUTH_EVENTS.ORG_ROLE_CHANGED, payload)
  }

  async twoFactorEnabled(payload: Auth2FAEnabledPayload): Promise<void> {
    await this.safePublish(AUTH_EVENTS.TWO_FA_ENABLED, payload)
  }

  async twoFactorDisabled(payload: Auth2FADisabledPayload): Promise<void> {
    await this.safePublish(AUTH_EVENTS.TWO_FA_DISABLED, payload)
  }

  async apiKeyCreated(payload: AuthApiKeyCreatedPayload): Promise<void> {
    await this.safePublish(AUTH_EVENTS.API_KEY_CREATED, payload)
  }

  async apiKeyRevoked(payload: AuthApiKeyRevokedPayload): Promise<void> {
    await this.safePublish(AUTH_EVENTS.API_KEY_REVOKED, payload)
  }

  async restrictionDenied(payload: AuthRestrictionDeniedPayload): Promise<void> {
    await this.safePublish(AUTH_EVENTS.RESTRICTION_DENIED, payload)
  }

  async impersonationStarted(payload: AuthImpersonationStartedPayload): Promise<void> {
    await this.safePublish(AUTH_EVENTS.IMPERSONATION_STARTED, payload)
  }

  async impersonationStopped(payload: AuthImpersonationStoppedPayload): Promise<void> {
    await this.safePublish(AUTH_EVENTS.IMPERSONATION_STOPPED, payload)
  }

  async userBanned(payload: AuthUserBannedPayload): Promise<void> {
    await this.safePublish(AUTH_EVENTS.USER_BANNED, payload)
  }

  async userUnbanned(payload: AuthUserUnbannedPayload): Promise<void> {
    await this.safePublish(AUTH_EVENTS.USER_UNBANNED, payload)
  }
}
