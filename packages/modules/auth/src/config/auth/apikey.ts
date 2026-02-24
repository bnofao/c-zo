import type { GenericEndpointContext } from 'better-auth'
import type { ApiKey, ApiKeyOptions } from 'better-auth/plugins'
import { apiKey } from 'better-auth/plugins'
import { AUTH_EVENTS, publishAuthEvent } from '../../events'

export function apiKeyConfig(option?: ApiKeyOptions) {
  return apiKey({
    ...option,
    requireName: true,
    rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 100 },
    schema: {
      apikey: {
        modelName: 'apikeys',
        fields: {
          userId: 'user_id',
          refillInterval: 'refill_interval',
          refillAmount: 'refill_amount',
          lastRefillAt: 'last_refill_at',
          rateLimitEnabled: 'rate_limit_enabled',
          rateLimitTimeWindow: 'rate_limit_time_window',
          rateLimitMax: 'rate_limit_max',
          requestCount: 'request_count',
          lastRequest: 'last_request',
          expiresAt: 'expires_at',
          createdAt: 'created_at',
          updatedAt: 'updated_at',
        },
      },
    },
  })
}

export function apiKeyHooks() {
  return {
    create: {
      after: async (apikey: ApiKey & Record<string, unknown>, _ctx: GenericEndpointContext | null) => {
        void publishAuthEvent(AUTH_EVENTS.API_KEY_CREATED, {
          apiKeyId: apikey.id,
          userId: apikey.userId,
          name: apikey.name ?? null,
          prefix: apikey.prefix ?? null,
        })
      },
    },
  }
}
