import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('amqplib', () => ({
  default: {
    connect: vi.fn(),
  },
}))

describe('checkRabbitMQHealth', () => {
  let checkRabbitMQHealth: typeof import('./health').checkRabbitMQHealth
  let amqplibMod: typeof import('amqplib')

  beforeAll(async () => {
    amqplibMod = await import('amqplib')
    const mod = await import('./health')
    checkRabbitMQHealth = mod.checkRabbitMQHealth
  })

  it('should return ok when connection succeeds', async () => {
    const mockClose = vi.fn().mockResolvedValue(undefined)
    vi.mocked(amqplibMod.default.connect).mockResolvedValue({ close: mockClose } as any)

    const result = await checkRabbitMQHealth('amqp://localhost:5672')

    expect(result.status).toBe('ok')
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    expect(result.error).toBeUndefined()
    expect(mockClose).toHaveBeenCalledOnce()
  })

  it('should return error when connection fails', async () => {
    vi.mocked(amqplibMod.default.connect).mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await checkRabbitMQHealth('amqp://localhost:5672')

    expect(result.status).toBe('error')
    expect(result.error).toBe('ECONNREFUSED')
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })
})
