import type { EventBus } from '@czo/kit/event-bus'
import type {
  AuthSessionCreatedPayload,
  AuthSessionRevokedPayload,
  AuthUserRegisteredPayload,
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
}
