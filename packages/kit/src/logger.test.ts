import { describe, expect, it, vi } from 'vitest'

vi.mock('consola', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withTag: vi.fn(),
    create: vi.fn(),
  }
  // withTag returns a new mock logger
  mockLogger.withTag.mockReturnValue({ ...mockLogger, _tag: true })
  // create returns an object with withTag
  const createdLogger = {
    withTag: vi.fn().mockReturnValue({ _tagged: true }),
  }
  mockLogger.create.mockReturnValue(createdLogger)

  return { consola: mockLogger }
})

describe('useLogger', () => {
  it('should return the base consola logger when called without arguments', async () => {
    const { useLogger, logger } = await import('./logger')
    const result = useLogger()
    expect(result).toBe(logger)
  })

  it('should return a tagged logger when called with a tag', async () => {
    const { useLogger } = await import('./logger')
    const result = useLogger('my-module')
    expect(result).toHaveProperty('_tagged', true)
  })

  it('should pass options to create() when tag is provided', async () => {
    const { useLogger, logger } = await import('./logger')
    const opts = { level: 3 }
    useLogger('tag', opts as any)
    expect(logger.create).toHaveBeenCalledWith(opts)
  })
})
