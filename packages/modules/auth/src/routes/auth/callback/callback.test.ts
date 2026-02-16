import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('nitro/h3', () => ({
  defineHandler: (fn: (event: unknown) => Promise<unknown>) => fn,
}))

// eslint-disable-next-line import/first
import handler from './[provider].get'

describe('oauth callback route', () => {
  const mockHandler = vi.fn()

  function createEvent(provider = 'google') {
    const req = new Request(`http://localhost/api/auth/callback/${provider}?code=abc&state=xyz`)
    return {
      req,
      context: {
        auth: { handler: mockHandler },
      },
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should delegate to auth.handler with event.req', async () => {
    const mockResponse = new Response('redirect', { status: 302 })
    mockHandler.mockResolvedValue(mockResponse)
    const event = createEvent()

    const result = await (handler as (event: unknown) => Promise<unknown>)(event)

    expect(mockHandler).toHaveBeenCalledWith(event.req)
    expect(result).toBe(mockResponse)
  })

  it('should pass through for any provider', async () => {
    const mockResponse = new Response('redirect', { status: 302 })
    mockHandler.mockResolvedValue(mockResponse)
    const event = createEvent('github')

    const result = await (handler as (event: unknown) => Promise<unknown>)(event)

    expect(mockHandler).toHaveBeenCalledWith(event.req)
    expect(result).toBe(mockResponse)
  })
})
