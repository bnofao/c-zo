import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('nitro/h3', () => ({
  defineHandler: (input: unknown) => {
    if (typeof input === 'function')
      return input
    const { handler } = input as { handler: (event: unknown) => unknown }
    return (event: unknown) => handler(event)
  },
}))

// eslint-disable-next-line import/first
import handler from './[...all]'

describe('auth catch-all route', () => {
  const mockHandler = vi.fn()

  function createEvent(path = '/sign-in/email') {
    return {
      req: new Request(`http://localhost/api/auth${path}`, {
        method: 'POST',
      }),
      context: {
        auth: { handler: mockHandler },
      } as Record<string, unknown>,
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('delegation', () => {
    it('should pass event.req to auth.handler', async () => {
      mockHandler.mockResolvedValue(new Response('{}', { status: 200 }))
      const event = createEvent()

      await (handler as (event: unknown) => Promise<unknown>)(event)

      expect(mockHandler).toHaveBeenCalledOnce()
      expect(mockHandler).toHaveBeenCalledWith(event.req)
    })

    it('should handle various auth paths', async () => {
      mockHandler.mockResolvedValue(new Response('{}', { status: 200 }))
      const paths = ['/sign-in/email', '/sign-up/email', '/two-factor/enable', '/two-factor/disable']

      for (const path of paths) {
        vi.clearAllMocks()
        const event = createEvent(path)

        await (handler as (event: unknown) => Promise<unknown>)(event)

        expect(mockHandler).toHaveBeenCalledWith(event.req)
      }
    })
  })

  describe('response passthrough', () => {
    it('should return auth.handler response directly', async () => {
      const originalResponse = new Response('{}', { status: 200 })
      mockHandler.mockResolvedValue(originalResponse)

      const event = createEvent()
      const result = await (handler as (event: unknown) => Promise<unknown>)(event)

      expect(result).toBe(originalResponse)
    })

    it('should return error responses unchanged', async () => {
      const errorResponse = new Response('{"error":"bad"}', { status: 401 })
      mockHandler.mockResolvedValue(errorResponse)

      const event = createEvent()
      const result = await (handler as (event: unknown) => Promise<unknown>)(event)

      expect(result).toBe(errorResponse)
    })
  })
})
