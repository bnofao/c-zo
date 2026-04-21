import type { Auth } from '@czo/auth/config'
import { mapAPIError } from './_internal/map-error'

// ─── Types ───────────────────────────────────────────────────────────

export interface CreateApiKeyInput {
  name: string
  expiresIn?: number
  userId?: string
  prefix?: string
  remaining?: number
  metadata?: Record<string, unknown>
  permissions?: Record<string, string[]>
  refillAmount?: number
  refillInterval?: number
  rateLimitEnabled?: boolean
  rateLimitTimeWindow?: number
  rateLimitMax?: number
}

export interface UpdateApiKeyInput {
  keyId: string
  userId?: string
  name?: string
  enabled?: boolean
  remaining?: number
  metadata?: Record<string, unknown>
  expiresIn?: number
  permissions?: Record<string, string[]>
  refillAmount?: number
  refillInterval?: number
  rateLimitEnabled?: boolean
  rateLimitTimeWindow?: number
  rateLimitMax?: number
}

export type ApiKeyService = ReturnType<typeof createApiKeyService>

// ─── Factory ─────────────────────────────────────────────────────────

export function createApiKeyService(auth: Auth) {
  return {
    async create(input: CreateApiKeyInput, headers?: Headers) {
      try {
        return await auth.api.createApiKey({ headers, body: input })
      }
      catch (err) { mapAPIError(err, 'ApiKey') }
    },

    async get(keyId: string, headers?: Headers) {
      try {
        return await auth.api.getApiKey({ headers, query: { id: keyId } })
      }
      catch (err) { mapAPIError(err, 'ApiKey') }
    },

    async update(input: UpdateApiKeyInput, headers?: Headers) {
      try {
        return await auth.api.updateApiKey({ headers, body: input })
      }
      catch (err) { mapAPIError(err, 'ApiKey') }
    },

    async remove(keyId: string, headers?: Headers) {
      try {
        return await auth.api.deleteApiKey({ headers, body: { keyId } })
      }
      catch (err) { mapAPIError(err, 'ApiKey') }
    },

    async list(headers?: Headers) {
      try {
        return await auth.api.listApiKeys({ headers })
      }
      catch (err) { mapAPIError(err, 'ApiKey') }
    },
  }
}
