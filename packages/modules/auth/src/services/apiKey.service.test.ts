import type { ApiKeyService } from './apiKey.service'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiKeyService } from './apiKey.service'

function createMockApi() {
  return {
    createApiKey: vi.fn(),
    getApiKey: vi.fn(),
    updateApiKey: vi.fn(),
    deleteApiKey: vi.fn(),
    listApiKeys: vi.fn(),
  }
}

function createMockAuth() {
  return { api: createMockApi() } as unknown as Parameters<typeof createApiKeyService>[0]
}

function api(auth: ReturnType<typeof createMockAuth>) {
  return (auth as unknown as { api: ReturnType<typeof createMockApi> }).api
}

const headers = new Headers({ authorization: 'Bearer test-token' })

const mockApiKey = {
  id: 'key-1',
  name: 'My API Key',
  prefix: 'czo_',
  key: 'czo_abc123xyz',
  userId: 'u1',
  enabled: true,
  remaining: null,
  metadata: null,
  permissions: null,
  expiresAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
}

describe('apiKeyService', () => {
  let auth: ReturnType<typeof createMockAuth>
  let service: ApiKeyService

  beforeEach(() => {
    auth = createMockAuth()
    service = createApiKeyService(auth)
  })

  // ─── Create ─────────────────────────────────────────────────────

  describe('create', () => {
    it('should call createApiKey with headers when provided', async () => {
      api(auth).createApiKey.mockResolvedValue(mockApiKey)

      const result = await service.create({ name: 'My API Key' }, headers)

      expect(api(auth).createApiKey).toHaveBeenCalledWith({
        headers,
        body: { name: 'My API Key' },
      })
      expect(result.id).toBe('key-1')
    })

    it('should call createApiKey without headers for server-side usage', async () => {
      api(auth).createApiKey.mockResolvedValue(mockApiKey)

      await service.create({
        name: 'My API Key',
        userId: 'u1',
        remaining: 1000,
        permissions: { products: ['read', 'write'] },
        refillAmount: 100,
        refillInterval: 3600000,
        rateLimitEnabled: true,
        rateLimitMax: 50,
        rateLimitTimeWindow: 60000,
      })

      expect(api(auth).createApiKey).toHaveBeenCalledWith({
        headers: undefined,
        body: {
          name: 'My API Key',
          userId: 'u1',
          remaining: 1000,
          permissions: { products: ['read', 'write'] },
          refillAmount: 100,
          refillInterval: 3600000,
          rateLimitEnabled: true,
          rateLimitMax: 50,
          rateLimitTimeWindow: 60000,
        },
      })
    })

    it('should pass optional fields when provided', async () => {
      api(auth).createApiKey.mockResolvedValue(mockApiKey)

      await service.create({
        name: 'My API Key',
        expiresIn: 86400,
        prefix: 'test_',
        metadata: { env: 'staging' },
      }, headers)

      expect(api(auth).createApiKey).toHaveBeenCalledWith({
        headers,
        body: {
          name: 'My API Key',
          expiresIn: 86400,
          prefix: 'test_',
          metadata: { env: 'staging' },
        },
      })
    })

    it('should wrap APIError with contextual message', async () => {
      const { APIError } = await import('better-auth')
      api(auth).createApiKey.mockRejectedValue(new APIError('UNAUTHORIZED', { message: 'Not allowed' }))

      await expect(service.create({ name: 'Test' }, headers)).rejects.toThrow('Failed to create API key')
    })

    it('should propagate non-APIError', async () => {
      api(auth).createApiKey.mockRejectedValue(new Error('Network failure'))

      await expect(service.create({ name: 'Test' }, headers)).rejects.toThrow('Network failure')
    })
  })

  // ─── Get ────────────────────────────────────────────────────────

  describe('get', () => {
    it('should call getApiKey with id as query', async () => {
      api(auth).getApiKey.mockResolvedValue(mockApiKey)

      const result = await service.get('key-1', headers)

      expect(api(auth).getApiKey).toHaveBeenCalledWith({
        headers,
        query: { id: 'key-1' },
      })
      expect(result.name).toBe('My API Key')
    })

    it('should call getApiKey without headers for server-side usage', async () => {
      api(auth).getApiKey.mockResolvedValue(mockApiKey)

      await service.get('key-1')

      expect(api(auth).getApiKey).toHaveBeenCalledWith({
        headers: undefined,
        query: { id: 'key-1' },
      })
    })

    it('should return null when not found', async () => {
      api(auth).getApiKey.mockResolvedValue(null)

      const result = await service.get('unknown', headers)

      expect(result).toBeNull()
    })

    it('should wrap APIError with contextual message', async () => {
      const { APIError } = await import('better-auth')
      api(auth).getApiKey.mockRejectedValue(new APIError('NOT_FOUND', { message: 'Key not found' }))

      await expect(service.get('key-x', headers)).rejects.toThrow('API key not found')
    })

    it('should propagate non-APIError', async () => {
      api(auth).getApiKey.mockRejectedValue(new Error('Connection reset'))

      await expect(service.get('key-1', headers)).rejects.toThrow('Connection reset')
    })
  })

  // ─── Update ─────────────────────────────────────────────────────

  describe('update', () => {
    it('should call updateApiKey with keyId and fields', async () => {
      const updated = { ...mockApiKey, name: 'Renamed Key' }
      api(auth).updateApiKey.mockResolvedValue(updated)

      const result = await service.update({
        keyId: 'key-1',
        name: 'Renamed Key',
      }, headers)

      expect(api(auth).updateApiKey).toHaveBeenCalledWith({
        headers,
        body: { keyId: 'key-1', name: 'Renamed Key' },
      })
      expect(result.name).toBe('Renamed Key')
    })

    it('should call updateApiKey without headers for server-side usage', async () => {
      api(auth).updateApiKey.mockResolvedValue({ ...mockApiKey, enabled: false })

      await service.update({
        keyId: 'key-1',
        enabled: false,
        remaining: 500,
        permissions: { orders: ['read'] },
        rateLimitEnabled: true,
        rateLimitMax: 100,
        rateLimitTimeWindow: 60000,
      })

      expect(api(auth).updateApiKey).toHaveBeenCalledWith({
        headers: undefined,
        body: {
          keyId: 'key-1',
          enabled: false,
          remaining: 500,
          permissions: { orders: ['read'] },
          rateLimitEnabled: true,
          rateLimitMax: 100,
          rateLimitTimeWindow: 60000,
        },
      })
    })

    it('should pass all optional fields when provided', async () => {
      api(auth).updateApiKey.mockResolvedValue({ ...mockApiKey, enabled: false })

      await service.update({
        keyId: 'key-1',
        name: 'Updated',
        enabled: false,
        metadata: { env: 'prod' },
        expiresIn: 3600,
      }, headers)

      expect(api(auth).updateApiKey).toHaveBeenCalledWith({
        headers,
        body: {
          keyId: 'key-1',
          name: 'Updated',
          enabled: false,
          metadata: { env: 'prod' },
          expiresIn: 3600,
        },
      })
    })

    it('should wrap APIError with contextual message', async () => {
      const { APIError } = await import('better-auth')
      api(auth).updateApiKey.mockRejectedValue(new APIError('FORBIDDEN', { message: 'Denied' }))

      await expect(service.update({ keyId: 'key-1' }, headers)).rejects.toThrow('Failed to update API key')
    })

    it('should propagate non-APIError', async () => {
      api(auth).updateApiKey.mockRejectedValue(new Error('Timeout'))

      await expect(service.update({ keyId: 'key-1' }, headers)).rejects.toThrow('Timeout')
    })
  })

  // ─── Remove ─────────────────────────────────────────────────────

  describe('remove', () => {
    it('should call deleteApiKey with keyId in body', async () => {
      api(auth).deleteApiKey.mockResolvedValue({ success: true })

      const result = await service.remove('key-1', headers)

      expect(api(auth).deleteApiKey).toHaveBeenCalledWith({
        headers,
        body: { keyId: 'key-1' },
      })
      expect(result.success).toBe(true)
    })

    it('should call deleteApiKey without headers for server-side usage', async () => {
      api(auth).deleteApiKey.mockResolvedValue({ success: true })

      await service.remove('key-1')

      expect(api(auth).deleteApiKey).toHaveBeenCalledWith({
        headers: undefined,
        body: { keyId: 'key-1' },
      })
    })

    it('should wrap APIError with contextual message', async () => {
      const { APIError } = await import('better-auth')
      api(auth).deleteApiKey.mockRejectedValue(new APIError('NOT_FOUND', { message: 'Not found' }))

      await expect(service.remove('key-x', headers)).rejects.toThrow('Failed to delete API key')
    })

    it('should propagate non-APIError', async () => {
      api(auth).deleteApiKey.mockRejectedValue(new Error('DB connection lost'))

      await expect(service.remove('key-1', headers)).rejects.toThrow('DB connection lost')
    })
  })

  // ─── List ───────────────────────────────────────────────────────

  describe('list', () => {
    it('should call listApiKeys and return array', async () => {
      api(auth).listApiKeys.mockResolvedValue([mockApiKey])

      const result = await service.list(headers)

      expect(api(auth).listApiKeys).toHaveBeenCalledWith({ headers })
      expect(result).toHaveLength(1)
      expect(result[0]!.id).toBe('key-1')
    })

    it('should call listApiKeys without headers for server-side usage', async () => {
      api(auth).listApiKeys.mockResolvedValue([])

      const result = await service.list()

      expect(api(auth).listApiKeys).toHaveBeenCalledWith({ headers: undefined })
      expect(result).toEqual([])
    })

    it('should wrap APIError with contextual message', async () => {
      const { APIError } = await import('better-auth')
      api(auth).listApiKeys.mockRejectedValue(new APIError('UNAUTHORIZED', { message: 'No session' }))

      await expect(service.list(headers)).rejects.toThrow('Failed to list API keys')
    })

    it('should propagate non-APIError', async () => {
      api(auth).listApiKeys.mockRejectedValue(new Error('API failure'))

      await expect(service.list(headers)).rejects.toThrow('API failure')
    })
  })
})
