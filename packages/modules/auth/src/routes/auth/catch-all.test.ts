import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockToWebRequest = vi.hoisted(() => vi.fn(() => new Request('http://localhost/api/auth/test')))
const mockCreateError = vi.hoisted(() => vi.fn((opts: { statusCode: number, statusMessage: string }) => {
  const err = new Error(opts.statusMessage) as Error & { statusCode: number }
  err.statusCode = opts.statusCode
  return err
}))

vi.mock('nitro/h3', () => ({
  defineHandler: (fn: (event: unknown) => Promise<unknown>) => fn,
  toWebRequest: mockToWebRequest,
  createError: mockCreateError,
}))

// eslint-disable-next-line import/first
import handler from './[...all]'

describe('auth catch-all route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should delegate to auth.handler with web request', async () => {
    const mockResponse = new Response('ok')
    const mockAuthHandler = vi.fn().mockResolvedValue(mockResponse)

    const event = {
      context: {
        auth: { handler: mockAuthHandler },
      },
    }

    const result = await (handler as (event: unknown) => Promise<unknown>)(event)

    expect(mockToWebRequest).toHaveBeenCalledWith(event)
    expect(mockAuthHandler).toHaveBeenCalled()
    expect(result).toBe(mockResponse)
  })

  it('should throw 500 error if auth is not in context', async () => {
    const event = {
      context: {},
    }

    await expect((handler as (event: unknown) => Promise<unknown>)(event)).rejects.toThrow(
      'Auth instance not found',
    )
    expect(mockCreateError).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })

  it('should throw 500 error if auth is null', async () => {
    const event = {
      context: { auth: null },
    }

    await expect((handler as (event: unknown) => Promise<unknown>)(event)).rejects.toThrow(
      'Auth instance not found',
    )
  })
})
