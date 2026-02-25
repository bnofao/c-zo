import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Captured callbacks ───────────────────────────────────────────────

let subscriberCallback: ((event: unknown) => Promise<void>) | undefined
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
    if (pattern === 'auth.app.installed')
      subscriberCallback = handler
    return () => {}
  }),
  shutdown: vi.fn(),
}))

vi.mock('@czo/kit/event-bus', () => ({
  useEventBus: vi.fn(() => Promise.resolve(mockBus)),
}))

// ─── Mock @czo/kit/ioc ───────────────────────────────────────────────

const mockAppService = vi.hoisted(() => ({
  setStatus: vi.fn().mockResolvedValue({}),
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

// ─── Helpers ─────────────────────────────────────────────────────────

const BASE_PAYLOAD = {
  appId: 'my-app',
  registerUrl: 'https://example.com/install',
  apiKey: 'app_abc123',
  installedBy: 'user-1',
}

function makeEvent(payload = BASE_PAYLOAD) {
  return {
    id: 'evt-1',
    type: 'auth.app.installed',
    timestamp: new Date().toISOString(),
    payload,
    metadata: { source: 'auth', version: 1 },
  }
}

function makeJob(data = BASE_PAYLOAD, attemptsMade = 5) {
  return { data, attemptsMade }
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('registerAppConsumer', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    subscriberCallback = undefined
    workerProcessor = undefined
    workerFailedHandler = undefined

    const { registerAppConsumer } = await import('./app-register.consumer')
    await registerAppConsumer()
  })

  // ─── Setup ──────────────────────────────────────────────────────

  it('should register a BullMQ worker for auth:app-register', () => {
    expect(mockUseWorker).toHaveBeenCalledWith('auth:app-register', expect.any(Function))
  })

  it('should subscribe to auth.app.installed on the event bus', () => {
    expect(mockBus.subscribe).toHaveBeenCalledWith('auth.app.installed', expect.any(Function))
  })

  // ─── Subscriber ─────────────────────────────────────────────────

  it('should enqueue a BullMQ job when auth.app.installed is received', async () => {
    await subscriberCallback!(makeEvent())

    expect(mockQueue.add).toHaveBeenCalledWith(
      'register',
      BASE_PAYLOAD,
      expect.objectContaining({ attempts: 5, backoff: { type: 'exponential', delay: 2000 } }),
    )
  })

  // ─── Worker processor ────────────────────────────────────────────

  it('should POST to register endpoint with appId and apiKey', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mockFetch)

    await workerProcessor!(makeJob())

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/install',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ appId: 'my-app', apiKey: 'app_abc123' }),
      }),
    )
  })

  it('should set status to active on successful register', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

    await workerProcessor!(makeJob())

    expect(mockAppService.setStatus).toHaveBeenCalledWith('my-app', 'active')
  })

  it('should throw when register endpoint returns HTTP error (triggers BullMQ retry)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))

    await expect(workerProcessor!(makeJob())).rejects.toThrow('503')
  })

  it('should throw on network error (triggers BullMQ retry)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

    await expect(workerProcessor!(makeJob())).rejects.toThrow('ECONNREFUSED')
  })

  // ─── Worker failed handler ───────────────────────────────────────

  it('should set status to error when all retries are exhausted', async () => {
    await workerFailedHandler!(makeJob(), new Error('ECONNREFUSED'))

    expect(mockAppService.setStatus).toHaveBeenCalledWith('my-app', 'error')
  })

  it('should not throw when job is undefined in failed handler', async () => {
    await expect(workerFailedHandler!(undefined, new Error('unknown'))).resolves.not.toThrow()
  })
})
