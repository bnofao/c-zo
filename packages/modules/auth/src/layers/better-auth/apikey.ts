import type { ApiKey, ApiKeyConfigurationOptions, ApiKeyOptions } from '@better-auth/api-key'
import type { GenericEndpointContext } from 'better-auth'
import { apiKey } from '@better-auth/api-key'

export function apiKeyConfig(
  config?: (ApiKeyConfigurationOptions & ApiKeyOptions) | ApiKeyConfigurationOptions[],
  option?: ApiKeyOptions,
) {
  return apiKey({
    ...config,
    requireName: true,
    rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 100 },
    schema: {
      apikey: {
        modelName: 'apikeys',
        fields: {
          // userId: 'user_id',
          // refillInterval: 'refill_interval',
          // refillAmount: 'refill_amount',
          // lastRefillAt: 'last_refill_at',
          // rateLimitEnabled: 'rate_limit_enabled',
          // rateLimitTimeWindow: 'rate_limit_time_window',
          // rateLimitMax: 'rate_limit_max',
          // requestCount: 'request_count',
          // lastRequest: 'last_request',
          // expiresAt: 'expires_at',
          // createdAt: 'created_at',
          // updatedAt: 'updated_at',
        },
      },
    },
  }, option)
}

export function apiKeyHooks() {
  return {
    create: {
      after: async (_apikey: ApiKey & Record<string, unknown>, _ctx: GenericEndpointContext | null) => {
        // TODO(events): publish ApiKeyCreated via ApiKeyEvents.
      },
    },
  }
}
