import { beforeEach, describe, expect, it, vi } from 'vitest'

const MockHTTPError = vi.hoisted(() =>
  class extends Error {
    status: number
    statusText: string
    constructor(opts: { status: number, statusText: string }) {
      super(opts.statusText)
      this.status = opts.status
      this.statusText = opts.statusText
    }
  },
)

vi.mock('nitro/h3', () => ({
  defineHandler: (fn: (event: unknown) => Promise<unknown>) => fn,
  HTTPError: MockHTTPError,
}))

// eslint-disable-next-line import/first
import handler from './[...all]'

describe('auth catch-all route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should delegate to auth.handler with event.req', async () => {
    const mockResponse = new Response('ok')
    const mockAuthHandler = vi.fn().mockResolvedValue(mockResponse)
    const mockReq = new Request('http://localhost/api/auth/test')

    const event = {
      req: mockReq,
      context: {
        auth: { handler: mockAuthHandler },
      },
    }

    const result = await (handler as (event: unknown) => Promise<unknown>)(event)

    expect(mockAuthHandler).toHaveBeenCalledWith(mockReq)
    expect(result).toBe(mockResponse)
  })

  it('should throw HTTPError 500 if auth is not in context', async () => {
    const event = {
      req: new Request('http://localhost/api/auth/test'),
      context: {},
    }

    await expect((handler as (event: unknown) => Promise<unknown>)(event)).rejects.toThrow(
      'Auth instance not found',
    )
  })

  it('should throw HTTPError 500 if auth is null', async () => {
    const event = {
      req: new Request('http://localhost/api/auth/test'),
      context: { auth: null },
    }

    const err = await (handler as (event: unknown) => Promise<unknown>)(event).catch((e: unknown) => e) as InstanceType<typeof MockHTTPError>
    expect(err).toBeInstanceOf(MockHTTPError)
    expect(err.status).toBe(500)
  })
})
