import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Captured callbacks ───────────────────────────────────────────────

let subscriberCallback: ((event: unknown) => Promise<void>) | undefined
let onPublishCallback: ((event: unknown) => Promise<unknown>) | undefined
let workerProcessor: ((job: unknown) => Promise<void>) | undefined
let workerFailedHandler: ((job: unknown, err: Error) => Promise<void>) | undefined

// ─── Mock @czo/kit/queue ─────────────────────────────────────────────

const mockQueue = vi.hoisted(() => ({
  add: vi.fn().mockResolvedValue({ id: 'job-1' }),
}))

const mockWorker = vi.hoisted(() => ({
  on: vi.fn((event: string, handler: (job: unknown, err: Error) => Promise<void>) => {
    if (event === 'failed')
      workerFailedHandler = handler
    return mockWorker
  }),
}))

const mockUseQueue = vi.hoisted(() => vi.fn(() => mockQueue))
const mockUseWorker = vi.hoisted(() => vi.fn((_name: string, processor: (job: unknown) => Promise<void>) => {
  workerProcessor = processor
  return mockWorker
}))

vi.mock('@czo/kit/queue', () => ({
  useQueue: mockUseQueue,
  useWorker: mockUseWorker,
}))

// ─── Mock @czo/kit/event-bus ─────────────────────────────────────────

const mockBus = vi.hoisted(() => ({
  publish: vi.fn(),
  subscribe: vi.fn((pattern: string, handler: (event: unknown) => Promise<void>) => {
    if (pattern === '#')
      subscriberCallback = handler
    return () => {}
  }),
  shutdown: vi.fn(),
  onPublish: vi.fn((hook: (event: unknown) => Promise<unknown>) => {
    onPublishCallback = hook
  }),
}))

vi.mock('@czo/kit/event-bus', () => ({
  useHookable: vi.fn(() => Promise.resolve(mockBus)),
}))

// ─── Mock @czo/kit/ioc ───────────────────────────────────────────────

const mockAppService = vi.hoisted(() => ({
  getActiveAppsByEvent: vi.fn().mockResolvedValue([]),
}))

vi.mock('@czo/kit/ioc', () => ({
  useContainer: () => ({
    make: vi.fn(async (name: string) => name === 'auth:apps' ? mockAppService : undefined),
  }),
}))

// ─── Mock @czo/kit ───────────────────────────────────────────────────

vi.mock('@czo/kit', () => ({
  useLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}))

// ─── Mock @czo/kit/db ───────────────────────────────────────────────

const mockDbChain = vi.hoisted(() => ({
  set: vi.fn().mockReturnThis(),
  where: vi.fn().mockResolvedValue([]),
  values: vi.fn().mockResolvedValue([]),
}))

const mockDb = vi.hoisted(() => ({
  update: vi.fn(() => mockDbChain),
  insert: vi.fn(() => mockDbChain),
}))

vi.mock('@czo/kit/db', () => ({
  useDatabase: () => mockDb,
}))

// ─── Mock drizzle-orm ───────────────────────────────────────────────

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>()
  return {
    ...actual,
    eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
  }
})

// ─── Helpers ─────────────────────────────────────────────────────────

const APP_ROW = {
  id: 'db-uuid-1',
  appId: 'my-app',
  webhookSecret: 'secret-123',
  manifest: {
    id: 'my-app',
    name: 'My App',
    version: '1.0.0',
    appUrl: 'https://example.com',
    register: 'https://example.com/install',
    scope: 'organization',
    permissions: { products: ['read'] },
    webhooks: [{ event: 'products.created', targetUrl: 'https://example.com/hook' }],
  },
  status: 'active',
  installedBy: 'user-1',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
}

const SYNC_APP_ROW = {
  ...APP_ROW,
  id: 'db-uuid-sync',
  appId: 'sync-app',
  manifest: {
    ...APP_ROW.manifest,
    id: 'sync-app',
    webhooks: [{ event: 'products.created', targetUrl: 'https://example.com/sync-hook', asyncEvents: false }],
  },
}

const MOCK_UUID = '00000000-0000-0000-0000-000000000099'

function makeDomainEvent(type = 'products.created', payload = { id: 'prod-1' }) {
  return {
    id: 'evt-1',
    type,
    timestamp: new Date().toISOString(),
    payload,
    metadata: { source: 'product', version: 1 },
  }
}

function makeDeliveryJob(overrides = {}) {
  return {
    data: {
      deliveryId: MOCK_UUID,
      appId: 'my-app',
      webhookSecret: 'secret-123',
      targetUrl: 'https://example.com/hook',
      event: 'products.created',
      payload: '{"id":"prod-1"}',
      ...overrides,
    },
    attemptsMade: 1,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('registerWebhookDispatcher', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    subscriberCallback = undefined
    onPublishCallback = undefined
    workerProcessor = undefined
    workerFailedHandler = undefined
    mockAppService.getActiveAppsByEvent.mockResolvedValue([])
    vi.stubGlobal('crypto', { randomUUID: () => MOCK_UUID })

    const { registerWebhookDispatcher } = await import('./webhook.listener')
    await registerWebhookDispatcher()
  })

  // ─── Setup ──────────────────────────────────────────────────────

  it('should register a BullMQ worker for auth.webhook-deliver', () => {
    expect(mockUseWorker).toHaveBeenCalledWith('auth.webhook-deliver', expect.any(Function))
  })

  it('should subscribe to wildcard "#" on the event bus', () => {
    expect(mockBus.subscribe).toHaveBeenCalledWith('#', expect.any(Function))
  })

  it('should register an onPublish hook on the event bus', () => {
    expect(mockBus.onPublish).toHaveBeenCalledWith(expect.any(Function))
    expect(onPublishCallback).toBeTypeOf('function')
  })

  // ─── Subscriber (async only) ──────────────────────────────────────

  it('should enqueue delivery jobs for async apps', async () => {
    mockAppService.getActiveAppsByEvent.mockResolvedValue([APP_ROW])

    await subscriberCallback!(makeDomainEvent())

    expect(mockQueue.add).toHaveBeenCalledWith(
      'deliver',
      expect.objectContaining({
        deliveryId: MOCK_UUID,
        appId: 'my-app',
        webhookSecret: 'secret-123',
        targetUrl: 'https://example.com/hook',
        event: 'products.created',
      }),
      expect.objectContaining({ attempts: 3, backoff: { type: 'exponential', delay: 1000 } }),
    )
  })

  it('should insert a webhook_deliveries record before enqueuing', async () => {
    mockAppService.getActiveAppsByEvent.mockResolvedValue([APP_ROW])

    await subscriberCallback!(makeDomainEvent())

    expect(mockDb.insert).toHaveBeenCalled()
    expect(mockDbChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: MOCK_UUID,
        appId: 'db-uuid-1',
        event: 'products.created',
        status: 'pending',
        attempts: 0,
      }),
    )
  })

  it('should skip when no apps match the event', async () => {
    mockAppService.getActiveAppsByEvent.mockResolvedValue([])

    await subscriberCallback!(makeDomainEvent())

    expect(mockQueue.add).not.toHaveBeenCalled()
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it('should enqueue multiple jobs when multiple async apps match', async () => {
    const app2 = {
      ...APP_ROW,
      id: 'db-uuid-2',
      appId: 'app-two',
      webhookSecret: 'secret-456',
      manifest: {
        ...APP_ROW.manifest,
        id: 'app-two',
        webhooks: [{ event: 'products.created', targetUrl: 'https://other.com/hook' }],
      },
    }
    mockAppService.getActiveAppsByEvent.mockResolvedValue([APP_ROW, app2])

    await subscriberCallback!(makeDomainEvent())

    expect(mockQueue.add).toHaveBeenCalledTimes(2)
  })

  it('should skip sync webhooks in the event bus subscriber', async () => {
    mockAppService.getActiveAppsByEvent.mockResolvedValue([SYNC_APP_ROW])

    await subscriberCallback!(makeDomainEvent())

    expect(mockQueue.add).not.toHaveBeenCalled()
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it('should filter payload using subscription query when webhook has a query', async () => {
    const appWithQuery = {
      ...APP_ROW,
      manifest: {
        ...APP_ROW.manifest,
        webhooks: [{
          event: 'products.created',
          targetUrl: 'https://example.com/hook',
          query: 'subscription { event { id } }',
        }],
      },
    }
    mockAppService.getActiveAppsByEvent.mockResolvedValue([appWithQuery])

    await subscriberCallback!(makeDomainEvent('products.created', { id: 'prod-1', secret: 'hidden', price: 99 }))

    expect(mockQueue.add).toHaveBeenCalledWith(
      'deliver',
      expect.objectContaining({
        payload: JSON.stringify({ id: 'prod-1' }),
      }),
      expect.anything(),
    )
  })

  it('should send full payload when webhook has no query', async () => {
    mockAppService.getActiveAppsByEvent.mockResolvedValue([APP_ROW])

    const fullPayload = { id: 'prod-1', secret: 'visible', price: 99 }
    await subscriberCallback!(makeDomainEvent('products.created', fullPayload))

    expect(mockQueue.add).toHaveBeenCalledWith(
      'deliver',
      expect.objectContaining({
        payload: JSON.stringify(fullPayload),
      }),
      expect.anything(),
    )
  })

  it('should default to async when asyncEvents is undefined', async () => {
    mockAppService.getActiveAppsByEvent.mockResolvedValue([APP_ROW])

    await subscriberCallback!(makeDomainEvent())

    expect(mockQueue.add).toHaveBeenCalled()
  })

  // ─── onPublish hook (sync webhooks) ─────────────────────────────────

  describe('onPublish hook', () => {
    it('should POST to sync webhook and return parsed response', async () => {
      mockAppService.getActiveAppsByEvent.mockResolvedValue([SYNC_APP_ROW])
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{"tax":12.50}'),
      }))

      const results = await onPublishCallback!(makeDomainEvent()) as any[]

      expect(results).toHaveLength(1)
      expect(results[0]).toEqual(expect.objectContaining({
        appId: 'sync-app',
        ok: true,
        status: 200,
        data: { tax: 12.50 },
      }))
    })

    it('should insert a webhook_deliveries record', async () => {
      mockAppService.getActiveAppsByEvent.mockResolvedValue([SYNC_APP_ROW])
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{}'),
      }))

      await onPublishCallback!(makeDomainEvent())

      expect(mockDb.insert).toHaveBeenCalled()
      expect(mockDbChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          appId: 'db-uuid-sync',
          event: 'products.created',
          status: 'pending',
        }),
      )
    })

    it('should update delivery record on success', async () => {
      mockAppService.getActiveAppsByEvent.mockResolvedValue([SYNC_APP_ROW])
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{"ok":true}'),
      }))

      await onPublishCallback!(makeDomainEvent())

      expect(mockDbChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'delivered', responseCode: 200 }),
      )
    })

    it('should return failed response on HTTP error', async () => {
      mockAppService.getActiveAppsByEvent.mockResolvedValue([SYNC_APP_ROW])
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        text: () => Promise.resolve('{"error":"invalid"}'),
      }))

      const results = await onPublishCallback!(makeDomainEvent()) as any[]

      expect(results[0]).toEqual(expect.objectContaining({
        ok: false,
        status: 422,
        data: { error: 'invalid' },
      }))
    })

    it('should mark delivery as failed on HTTP error', async () => {
      mockAppService.getActiveAppsByEvent.mockResolvedValue([SYNC_APP_ROW])
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Server Error'),
      }))

      await onPublishCallback!(makeDomainEvent())

      expect(mockDbChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed', responseCode: 500 }),
      )
    })

    it('should return failed response on network error', async () => {
      mockAppService.getActiveAppsByEvent.mockResolvedValue([SYNC_APP_ROW])
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

      const results = await onPublishCallback!(makeDomainEvent()) as any[]

      expect(results[0]).toEqual(expect.objectContaining({
        ok: false,
        status: 0,
        data: null,
      }))
    })

    it('should return empty array when no sync webhooks match', async () => {
      // APP_ROW has no asyncEvents: false, so no sync webhooks
      mockAppService.getActiveAppsByEvent.mockResolvedValue([APP_ROW])

      const results = await onPublishCallback!(makeDomainEvent()) as any[]

      expect(results).toEqual([])
    })

    it('should return responses from multiple sync apps', async () => {
      const syncApp2 = {
        ...SYNC_APP_ROW,
        id: 'db-uuid-sync-2',
        appId: 'sync-app-2',
        webhookSecret: 'secret-789',
        manifest: {
          ...SYNC_APP_ROW.manifest,
          id: 'sync-app-2',
          webhooks: [{ event: 'products.created', targetUrl: 'https://other.com/sync', asyncEvents: false }],
        },
      }
      mockAppService.getActiveAppsByEvent.mockResolvedValue([SYNC_APP_ROW, syncApp2])
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{"ok":true}'),
      }))

      const results = await onPublishCallback!(makeDomainEvent()) as any[]

      expect(results).toHaveLength(2)
      expect(results[0]!.appId).toBe('sync-app')
      expect(results[1]!.appId).toBe('sync-app-2')
    })

    it('should sign the request with HMAC-SHA256', async () => {
      mockAppService.getActiveAppsByEvent.mockResolvedValue([SYNC_APP_ROW])
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{}'),
      })
      vi.stubGlobal('fetch', mockFetch)

      await onPublishCallback!(makeDomainEvent())

      const expectedPayload = JSON.stringify({ id: 'prod-1' })
      const expectedSig = createHmac('sha256', SYNC_APP_ROW.webhookSecret)
        .update(expectedPayload)
        .digest('hex')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/sync-hook',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-CZO-Signature': expectedSig,
          }),
        }),
      )
    })

    it('should handle non-JSON response bodies gracefully', async () => {
      mockAppService.getActiveAppsByEvent.mockResolvedValue([SYNC_APP_ROW])
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('plain text response'),
      }))

      const results = await onPublishCallback!(makeDomainEvent()) as any[]

      expect(results[0]!.data).toBe('plain text response')
    })
  })

  // ─── Worker processor ────────────────────────────────────────────

  it('should POST with correct HMAC signature headers', async () => {
    const job = makeDeliveryJob()
    const expectedSignature = createHmac('sha256', 'secret-123')
      .update('{"id":"prod-1"}')
      .digest('hex')

    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('OK') })
    vi.stubGlobal('fetch', mockFetch)

    await workerProcessor!(job)

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/hook',
      expect.objectContaining({
        method: 'POST',
        body: '{"id":"prod-1"}',
        headers: expect.objectContaining({
          'X-CZO-Signature': expectedSignature,
          'X-CZO-Event': 'products.created',
          'X-CZO-Delivery': MOCK_UUID,
          'Content-Type': 'application/json',
        }),
      }),
    )
  })

  it('should produce a deterministic HMAC signature', async () => {
    const payload = '{"test":"value"}'
    const secret = 'my-secret'
    const sig1 = createHmac('sha256', secret).update(payload).digest('hex')
    const sig2 = createHmac('sha256', secret).update(payload).digest('hex')

    expect(sig1).toBe(sig2)
    expect(sig1).toHaveLength(64)
  })

  it('should update delivery record on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('OK') }))

    await workerProcessor!(makeDeliveryJob())

    expect(mockDb.update).toHaveBeenCalled()
    expect(mockDbChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'delivered',
        responseCode: 200,
      }),
    )
  })

  it('should throw on HTTP error (triggers BullMQ retry)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, text: () => Promise.resolve('Service Unavailable') }))

    await expect(workerProcessor!(makeDeliveryJob())).rejects.toThrow('503')
  })

  it('should update delivery record even on HTTP error before throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502, text: () => Promise.resolve('Bad Gateway') }))

    await expect(workerProcessor!(makeDeliveryJob())).rejects.toThrow()

    expect(mockDbChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'pending',
        responseCode: 502,
      }),
    )
  })

  // ─── Worker failed handler ───────────────────────────────────────

  it('should mark delivery as failed when all retries are exhausted', async () => {
    await workerFailedHandler!(
      { data: { deliveryId: MOCK_UUID, appId: 'my-app' }, attemptsMade: 3 },
      new Error('ECONNREFUSED'),
    )

    expect(mockDb.update).toHaveBeenCalled()
    expect(mockDbChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', attempts: 3 }),
    )
  })

  it('should not throw when job is undefined in failed handler', async () => {
    await expect(workerFailedHandler!(undefined, new Error('unknown'))).resolves.not.toThrow()
  })
})
