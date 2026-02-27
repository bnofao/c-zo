import type { AppService } from './app.service'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppService } from './app.service'

const TEST_SUBSCRIBABLE_EVENTS: ReadonlySet<string> = new Set([
  'auth.app.installed',
  'auth.app.uninstalled',
  'auth.app.manifest-updated',
  'auth.app.status-changed',
])

const mockPublishAuthEvent = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('@czo/auth/events', () => ({
  publishAuthEvent: mockPublishAuthEvent,
  AUTH_EVENTS: {
    APP_INSTALLED: 'auth.app.installed',
    APP_UNINSTALLED: 'auth.app.uninstalled',
    APP_MANIFEST_UPDATED: 'auth.app.manifest-updated',
    APP_STATUS_CHANGED: 'auth.app.status-changed',
  },
}))

// ─── Mock Drizzle DB (Repository-compatible) ─────────────────────────

let queryFirstResult: unknown | null = null
let queryManyResult: unknown[] = []
let insertResult: unknown[] = []
let updateResult: unknown[] = []
let deleteResult: unknown[] = []

function createThenableChain(getResult: () => unknown[]) {
  const chain: Record<string, unknown> = {
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) => {
      return Promise.resolve(getResult()).then(resolve, reject)
    },
  }
  return chain
}

function createMockDb() {
  const mockQueryBuilder = {
    findFirst: vi.fn().mockImplementation(async () => queryFirstResult),
    findMany: vi.fn().mockImplementation(async () => [...queryManyResult]),
  }

  const schema = {
    appsRelations: {
      config: vi.fn().mockReturnValue({}),
    },
  }

  return {
    query: {
      apps: mockQueryBuilder,
    },
    _: { schema },
    insert: vi.fn().mockImplementation(() => createThenableChain(() => insertResult)),
    update: vi.fn().mockImplementation(() => createThenableChain(() => updateResult)),
    delete: vi.fn().mockImplementation(() => createThenableChain(() => deleteResult)),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      }),
    }),
  } as any
}

// ─── Mock ApiKeyService ──────────────────────────────────────────────

function createMockApiKeyService() {
  return {
    create: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    list: vi.fn(),
  }
}

// ─── Mock AuthService ────────────────────────────────────────────────

function createMockAuthService() {
  return {
    hasPermission: vi.fn().mockResolvedValue(true),
    getSession: vi.fn(),
  }
}

// ─── Fixtures ────────────────────────────────────────────────────────

const VALID_MANIFEST = {
  id: 'my-app',
  name: 'My App',
  version: '1.0.0',
  appUrl: 'https://example.com',
  register: 'https://example.com/install',
  author: { name: 'Acme Corp', url: 'https://acme.com' },
  scope: 'organization' as const,
  permissions: { products: ['read', 'write'] },
  webhooks: [{ event: 'products.created', targetUrl: 'https://example.com/hook' }],
}

const APP_ROW = {
  id: 'uuid-1',
  appId: 'my-app',
  manifest: VALID_MANIFEST,
  status: 'active',
  installedBy: 'user-1',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
}

const MOCK_UUID = '00000000-0000-0000-0000-000000000001'

// ─── Tests ───────────────────────────────────────────────────────────

describe('appService', () => {
  let db: ReturnType<typeof createMockDb>
  let apiKeyService: ReturnType<typeof createMockApiKeyService>
  let authService: ReturnType<typeof createMockAuthService>
  let service: AppService

  beforeEach(() => {
    queryFirstResult = null
    queryManyResult = []
    insertResult = []
    updateResult = []
    deleteResult = []

    db = createMockDb()
    apiKeyService = createMockApiKeyService()
    authService = createMockAuthService()
    service = createAppService(db, apiKeyService as any, authService as any, TEST_SUBSCRIBABLE_EVENTS)

    vi.stubGlobal('crypto', { randomUUID: () => MOCK_UUID })
  })

  // ─── install ─────────────────────────────────────────────────────

  describe('install', () => {
    it('should insert an app and return it with an API key', async () => {
      queryFirstResult = null
      insertResult = [{ ...APP_ROW, id: MOCK_UUID }]
      apiKeyService.create.mockResolvedValue({ id: 'key-1', key: 'app_abc123' })

      const result = await service.install({
        manifest: VALID_MANIFEST,
        installedBy: 'user-1',
        organizationId: 'org-1',
      })

      expect(result.appId).toBe('my-app')
      expect(result.apiKey).toEqual({ id: 'key-1' })
    })

    it('should use crypto.randomUUID for the primary key', async () => {
      queryFirstResult = null
      insertResult = [{ ...APP_ROW, id: MOCK_UUID }]
      apiKeyService.create.mockResolvedValue({ id: 'key-1', key: 'app_x' })

      const result = await service.install({
        manifest: VALID_MANIFEST,
        installedBy: 'user-1',
        organizationId: 'org-1',
      })

      expect(result.id).toBe(MOCK_UUID)
    })

    it('should map manifest permissions to apiKeyService.create format', async () => {
      queryFirstResult = null
      insertResult = [{ ...APP_ROW, id: MOCK_UUID }]
      apiKeyService.create.mockResolvedValue({ id: 'key-1', key: 'app_x' })

      await service.install({
        manifest: VALID_MANIFEST,
        installedBy: 'user-1',
        organizationId: 'org-1',
      })

      expect(apiKeyService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          prefix: 'app_',
          permissions: { products: ['read', 'write'] },
        }),
      )
    })

    it('should create API key with app: prefix in name', async () => {
      queryFirstResult = null
      insertResult = [{ ...APP_ROW, id: MOCK_UUID }]
      apiKeyService.create.mockResolvedValue({ id: 'key-1', key: 'app_x' })

      await service.install({
        manifest: VALID_MANIFEST,
        installedBy: 'user-1',
        organizationId: 'org-1',
      })

      expect(apiKeyService.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'app:my-app' }),
      )
    })

    it('should throw on invalid manifest (missing required fields)', async () => {
      const invalid = { id: 'bad-app' } as any

      await expect(
        service.install({ manifest: invalid, installedBy: 'user-1' }),
      ).rejects.toThrow()
    })

    it('should allow webhook events matching a declared permission key', async () => {
      queryFirstResult = null
      insertResult = [{ ...APP_ROW, id: MOCK_UUID }]
      apiKeyService.create.mockResolvedValue({ id: 'key-1', key: 'app_x' })

      const manifest = { ...VALID_MANIFEST, webhooks: [{ event: 'products.updated', targetUrl: 'https://example.com/hook' }] }

      await expect(
        service.install({ manifest, installedBy: 'user-1', organizationId: 'org-1' }),
      ).resolves.not.toThrow()
    })

    it('should allow base subscribable events regardless of permissions', async () => {
      queryFirstResult = null
      insertResult = [{ ...APP_ROW, id: MOCK_UUID }]
      apiKeyService.create.mockResolvedValue({ id: 'key-1', key: 'app_x' })

      const manifest = { ...VALID_MANIFEST, webhooks: [{ event: 'auth.app.status-changed', targetUrl: 'https://example.com/hook' }] }

      await expect(
        service.install({ manifest, installedBy: 'user-1', organizationId: 'org-1' }),
      ).resolves.not.toThrow()
    })

    it('should allow custom base events injected via createAppService parameter', async () => {
      const customService = createAppService(db, apiKeyService as any, authService as any, new Set(['custom.event']))
      const manifest = { ...VALID_MANIFEST, webhooks: [{ event: 'custom.event', targetUrl: 'https://example.com/hook' }] }
      queryFirstResult = null
      insertResult = [{ ...APP_ROW, id: MOCK_UUID, manifest }]
      apiKeyService.create.mockResolvedValue({ id: 'key-1', key: 'app_x' })

      await expect(
        customService.install({ manifest, installedBy: 'user-1', organizationId: 'org-1' }),
      ).resolves.not.toThrow()
    })

    it('should throw when webhook event is not covered by permissions or base allowlist', async () => {
      const manifest = {
        ...VALID_MANIFEST,
        webhooks: [{ event: 'auth.security.password-changed', targetUrl: 'https://example.com/hook' }],
      }

      await expect(
        service.install({ manifest, installedBy: 'user-1', organizationId: 'org-1' }),
      ).rejects.toThrow('not allowed')
    })

    it('should throw on invalid appUrl', async () => {
      const invalid = { ...VALID_MANIFEST, appUrl: 'not-a-url' }

      await expect(
        service.install({ manifest: invalid, installedBy: 'user-1' }),
      ).rejects.toThrow()
    })

    it('should throw when appId already exists', async () => {
      queryFirstResult = { id: 'existing-id', appId: 'my-app' }

      await expect(
        service.install({ manifest: VALID_MANIFEST, installedBy: 'user-1', organizationId: 'org-1' }),
      ).rejects.toThrow('already installed')
    })

    it('should link apiKey to installed app via installedAppId', async () => {
      queryFirstResult = null
      insertResult = [{ ...APP_ROW, id: MOCK_UUID }]
      apiKeyService.create.mockResolvedValue({ id: 'key-1', key: 'app_x' })

      await service.install({
        manifest: VALID_MANIFEST,
        installedBy: 'user-1',
        organizationId: 'org-1',
      })

      // The service calls db.update(apikeys).set({ installedAppId }).where(...)
      expect(db.update).toHaveBeenCalled()
    })

    it('should call hasPermission with the manifest permissions', async () => {
      queryFirstResult = null
      insertResult = [{ ...APP_ROW, id: MOCK_UUID }]
      apiKeyService.create.mockResolvedValue({ id: 'key-1', key: 'app_x' })

      await service.install({
        manifest: VALID_MANIFEST,
        installedBy: 'user-1',
        installerRole: 'admin',
        organizationId: 'org-1',
      })

      expect(authService.hasPermission).toHaveBeenCalledWith(
        { userId: 'user-1', organizationId: 'org-1' },
        { products: ['read', 'write'] },
        'admin',
      )
    })

    it('should throw when installer does not have required permissions', async () => {
      authService.hasPermission.mockResolvedValue(false)

      await expect(
        service.install({ manifest: VALID_MANIFEST, installedBy: 'user-1', organizationId: 'org-1' }),
      ).rejects.toThrow('does not have the required permissions')
    })

    it('should throw when scope is organization but no organizationId provided', async () => {
      await expect(
        service.install({ manifest: VALID_MANIFEST, installedBy: 'user-1' }),
      ).rejects.toThrow('requires an organization context')
    })

    it('should skip permission check when manifest has no permissions', async () => {
      const noPermManifest = { ...VALID_MANIFEST, permissions: {}, webhooks: [] }
      queryFirstResult = null
      insertResult = [{ ...APP_ROW, id: MOCK_UUID, manifest: noPermManifest }]
      apiKeyService.create.mockResolvedValue({ id: 'key-1', key: 'app_x' })

      await service.install({ manifest: noPermManifest, installedBy: 'user-1', organizationId: 'org-1' })

      expect(authService.hasPermission).not.toHaveBeenCalled()
    })

    it('should accept a webhook with a valid subscription query', async () => {
      queryFirstResult = null
      insertResult = [{ ...APP_ROW, id: MOCK_UUID }]
      apiKeyService.create.mockResolvedValue({ id: 'key-1', key: 'app_x' })

      const manifest = {
        ...VALID_MANIFEST,
        webhooks: [{ event: 'products.created', targetUrl: 'https://example.com/hook', query: 'subscription { event { id } }' }],
      }

      await expect(
        service.install({ manifest, installedBy: 'user-1', organizationId: 'org-1' }),
      ).resolves.not.toThrow()
    })

    it('should reject a webhook with invalid GraphQL syntax in query', async () => {
      const manifest = {
        ...VALID_MANIFEST,
        webhooks: [{ event: 'products.created', targetUrl: 'https://example.com/hook', query: 'subscription { event {' }],
      }

      await expect(
        service.install({ manifest, installedBy: 'user-1', organizationId: 'org-1' }),
      ).rejects.toThrow('invalid GraphQL syntax')
    })

    it('should reject a webhook query that is not a subscription operation', async () => {
      const manifest = {
        ...VALID_MANIFEST,
        webhooks: [{ event: 'products.created', targetUrl: 'https://example.com/hook', query: 'query { users { id } }' }],
      }

      await expect(
        service.install({ manifest, installedBy: 'user-1', organizationId: 'org-1' }),
      ).rejects.toThrow('must be a subscription')
    })

    it('should publish auth.app.installed event after installation', async () => {
      queryFirstResult = null
      insertResult = [{ ...APP_ROW, id: MOCK_UUID }]
      apiKeyService.create.mockResolvedValue({ id: 'key-1', key: 'app_abc123' })

      await service.install({ manifest: VALID_MANIFEST, installedBy: 'user-1', organizationId: 'org-1' })

      expect(mockPublishAuthEvent).toHaveBeenCalledWith(
        'auth.app.installed',
        expect.objectContaining({
          appId: 'my-app',
          registerUrl: 'https://example.com/install',
          apiKey: 'app_abc123',
          installedBy: 'user-1',
        }),
      )
    })

    it('should generate a webhookSecret and include it in the insert', async () => {
      queryFirstResult = null
      insertResult = [{ ...APP_ROW, id: MOCK_UUID, webhookSecret: MOCK_UUID }]
      apiKeyService.create.mockResolvedValue({ id: 'key-1', key: 'app_x' })

      await service.install({ manifest: VALID_MANIFEST, installedBy: 'user-1', organizationId: 'org-1' })

      const insertChain = db.insert.mock.results[0]!.value
      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ webhookSecret: MOCK_UUID }),
      )
    })

    it('should include webhookSecret in the APP_INSTALLED event payload', async () => {
      queryFirstResult = null
      insertResult = [{ ...APP_ROW, id: MOCK_UUID, webhookSecret: MOCK_UUID }]
      apiKeyService.create.mockResolvedValue({ id: 'key-1', key: 'app_abc123' })

      await service.install({ manifest: VALID_MANIFEST, installedBy: 'user-1', organizationId: 'org-1' })

      expect(mockPublishAuthEvent).toHaveBeenCalledWith(
        'auth.app.installed',
        expect.objectContaining({ webhookSecret: MOCK_UUID }),
      )
    })
  })

  // ─── installFromUrl ──────────────────────────────────────────────

  describe('installFromUrl', () => {
    it('should fetch manifest and delegate to install', async () => {
      queryFirstResult = null
      insertResult = [{ ...APP_ROW, id: MOCK_UUID }]
      apiKeyService.create.mockResolvedValue({ id: 'key-1', key: 'app_x' })

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(VALID_MANIFEST),
      }))

      const result = await service.installFromUrl('https://example.com/manifest.json', 'user-1', 'org-1')

      expect(result.appId).toBe('my-app')
    })

    it('should throw when HTTP response is not ok', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      }))

      await expect(
        service.installFromUrl('https://example.com/manifest.json', 'user-1'),
      ).rejects.toThrow('Failed to fetch manifest')
    })

    it('should throw on invalid manifest from URL', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ invalid: true }),
      }))

      await expect(
        service.installFromUrl('https://example.com/manifest.json', 'user-1'),
      ).rejects.toThrow()
    })

    it('should throw on network error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

      await expect(
        service.installFromUrl('https://example.com/manifest.json', 'user-1'),
      ).rejects.toThrow('Network error')
    })
  })

  // ─── uninstall ───────────────────────────────────────────────────

  describe('uninstall', () => {
    it('should delete the app by appId', async () => {
      queryManyResult = [APP_ROW]
      deleteResult = [APP_ROW]

      await service.uninstall('my-app')

      expect(db.delete).toHaveBeenCalled()
    })

    it('should throw when app not found', async () => {
      queryManyResult = []
      deleteResult = []

      await expect(service.uninstall('unknown-app')).rejects.toThrow('not found')
    })

    it('should use the correct where clause on appId', async () => {
      queryManyResult = [APP_ROW]
      deleteResult = [APP_ROW]

      await service.uninstall('my-app')

      const deleteChain = db.delete.mock.results[0]!.value
      expect(deleteChain.where).toHaveBeenCalled()
    })

    it('should publish auth.app.uninstalled event after deletion', async () => {
      queryManyResult = [APP_ROW]
      deleteResult = [APP_ROW]

      await service.uninstall('my-app')

      expect(mockPublishAuthEvent).toHaveBeenCalledWith('auth.app.uninstalled', { appId: 'my-app' })
    })
  })

  // ─── getApp ──────────────────────────────────────────────────────

  describe('getApp', () => {
    it('should return the app when found', async () => {
      queryFirstResult = APP_ROW

      const result = await service.getApp('my-app')

      expect(result).toEqual(APP_ROW)
    })

    it('should return null when not found', async () => {
      queryFirstResult = null

      const result = await service.getApp('unknown')

      expect(result).toBeNull()
    })

    it('should query via the repository findFirst', async () => {
      queryFirstResult = APP_ROW

      await service.getApp('my-app')

      expect(db.query.apps.findFirst).toHaveBeenCalled()
    })
  })

  // ─── listApps ────────────────────────────────────────────────────

  describe('listApps', () => {
    it('should return active apps', async () => {
      queryManyResult = [APP_ROW]

      const result = await service.listApps()

      expect(result).toHaveLength(1)
      expect(result[0]!.status).toBe('active')
    })

    it('should return empty array when none found', async () => {
      queryManyResult = []

      const result = await service.listApps()

      expect(result).toEqual([])
    })

    it('should query via the repository findMany', async () => {
      queryManyResult = [APP_ROW]

      await service.listApps()

      expect(db.query.apps.findMany).toHaveBeenCalled()
    })
  })

  // ─── updateManifest ──────────────────────────────────────────────

  describe('updateManifest', () => {
    it('should update the manifest and return updated row', async () => {
      const updatedManifest = { ...VALID_MANIFEST, version: '2.0.0' }
      updateResult = [{ ...APP_ROW, manifest: updatedManifest }]

      const result = await service.updateManifest('my-app', updatedManifest)

      expect(result.manifest).toEqual(updatedManifest)
    })

    it('should call db.update with new manifest', async () => {
      updateResult = [{ ...APP_ROW, updatedAt: new Date() }]

      await service.updateManifest('my-app', VALID_MANIFEST)

      expect(db.update).toHaveBeenCalled()
    })

    it('should throw when app not found', async () => {
      updateResult = []

      await expect(
        service.updateManifest('unknown', VALID_MANIFEST),
      ).rejects.toThrow('not found')
    })

    it('should throw on invalid manifest', async () => {
      const invalid = { id: 'bad' } as any

      await expect(
        service.updateManifest('my-app', invalid),
      ).rejects.toThrow()
    })

    it('should throw when updated manifest has a webhook event not covered by permissions', async () => {
      const manifest = {
        ...VALID_MANIFEST,
        webhooks: [{ event: 'auth.security.password-changed', targetUrl: 'https://example.com/hook' }],
      }

      await expect(
        service.updateManifest('my-app', manifest),
      ).rejects.toThrow('not allowed')
    })

    it('should publish auth.app.manifest-updated event after update', async () => {
      const updatedManifest = { ...VALID_MANIFEST, version: '2.0.0' }
      updateResult = [{ ...APP_ROW, manifest: updatedManifest }]

      await service.updateManifest('my-app', updatedManifest)

      expect(mockPublishAuthEvent).toHaveBeenCalledWith('auth.app.manifest-updated', {
        appId: 'my-app',
        version: '2.0.0',
      })
    })
  })

  // ─── setStatus ───────────────────────────────────────────────────

  describe('setStatus', () => {
    it('should set status to disabled', async () => {
      updateResult = [{ ...APP_ROW, status: 'disabled' }]

      const result = await service.setStatus('my-app', 'disabled')

      expect(result.status).toBe('disabled')
    })

    it('should set status to error', async () => {
      updateResult = [{ ...APP_ROW, status: 'error' }]

      const result = await service.setStatus('my-app', 'error')

      expect(result.status).toBe('error')
    })

    it('should throw when app not found', async () => {
      updateResult = []

      await expect(
        service.setStatus('unknown', 'disabled'),
      ).rejects.toThrow('not found')
    })

    it('should publish auth.app.status-changed event after status update', async () => {
      updateResult = [{ ...APP_ROW, status: 'disabled' }]

      await service.setStatus('my-app', 'disabled')

      expect(mockPublishAuthEvent).toHaveBeenCalledWith('auth.app.status-changed', {
        appId: 'my-app',
        status: 'disabled',
      })
    })
  })

  // ─── getActiveAppsByEvent ─────────────────────────────────────────

  describe('getActiveAppsByEvent', () => {
    it('should return apps whose manifest webhooks contain the matching event', async () => {
      queryManyResult = [APP_ROW]

      const result = await service.getActiveAppsByEvent('products.created')

      expect(result).toHaveLength(1)
      expect(result[0]!.appId).toBe('my-app')
    })

    it('should return empty array when no apps match the event', async () => {
      queryManyResult = [APP_ROW]

      const result = await service.getActiveAppsByEvent('orders.created')

      expect(result).toEqual([])
    })

    it('should return empty array when there are no active apps', async () => {
      queryManyResult = []

      const result = await service.getActiveAppsByEvent('products.created')

      expect(result).toEqual([])
    })

    it('should return multiple apps when they all subscribe to the same event', async () => {
      const app2 = {
        ...APP_ROW,
        id: 'uuid-2',
        appId: 'app-two',
        manifest: {
          ...VALID_MANIFEST,
          id: 'app-two',
          webhooks: [{ event: 'products.created', targetUrl: 'https://other.com/hook' }],
        },
      }
      queryManyResult = [APP_ROW, app2]

      const result = await service.getActiveAppsByEvent('products.created')

      expect(result).toHaveLength(2)
    })
  })
})
