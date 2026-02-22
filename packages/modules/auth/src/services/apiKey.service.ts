import type { Auth } from '../config/auth'
import { APIError } from 'better-auth'

// ─── Types ───────────────────────────────────────────────────────────

export interface CreateApiKeyInput {
  name: string
  expiresIn?: number
  userId?: string
  prefix?: string
  remaining?: number
  metadata?: Record<string, any>
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
  metadata?: Record<string, any>
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
  async function create(input: CreateApiKeyInput, headers?: Headers) {
    try {
      return await auth.api.createApiKey({
        headers,
        body: input,
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to create API key: ${e.message}`)
      }
      throw e
    }
  }

  async function get(keyId: string, headers?: Headers) {
    try {
      return await auth.api.getApiKey({
        headers,
        query: { id: keyId },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`API key not found: ${e.message}`)
      }
      throw e
    }
  }

  async function update(input: UpdateApiKeyInput, headers?: Headers) {
    try {
      return await auth.api.updateApiKey({
        headers,
        body: input,
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to update API key: ${e.message}`)
      }
      throw e
    }
  }

  async function remove(keyId: string, headers?: Headers) {
    try {
      return await auth.api.deleteApiKey({
        headers,
        body: { keyId },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to delete API key: ${e.message}`)
      }
      throw e
    }
  }

  async function list(headers?: Headers) {
    try {
      return await auth.api.listApiKeys({ headers })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to list API keys: ${e.message}`)
      }
      throw e
    }
  }

  return {
    create,
    get,
    update,
    remove,
    list,
  }
}
