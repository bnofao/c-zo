import type { EventBus } from './types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let lastRabbitBus: EventBus

vi.mock('./providers/rabbitmq', () => ({
  createRabbitMQEventBus: vi.fn().mockImplementation(() => {
    lastRabbitBus = {
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockReturnValue(() => {}),
      shutdown: vi.fn().mockResolvedValue(undefined),
    }
    return Promise.resolve(lastRabbitBus)
  }),
}))

const mockMake = vi.hoisted(() => vi.fn())

vi.mock('@czo/kit/ioc', () => ({
  useContainer: vi.fn(() => ({ make: mockMake })),
}))

describe('useMessageBroker', () => {
  let useMessageBroker: typeof import('./use-message-broker').useMessageBroker
  let resetMessageBroker: typeof import('./use-message-broker').resetMessageBroker
  let shutdownMessageBroker: typeof import('./use-message-broker').shutdownMessageBroker

  beforeEach(async () => {
    vi.clearAllMocks()
    mockMake.mockReset()

    vi.resetModules()
    const mod = await import('./use-message-broker')
    useMessageBroker = mod.useMessageBroker
    resetMessageBroker = mod.resetMessageBroker
    shutdownMessageBroker = mod.shutdownMessageBroker
    resetMessageBroker()
  })

  afterEach(() => {
    resetMessageBroker()
  })

  describe('config validation', () => {
    it('should throw when messageBroker config is missing', async () => {
      mockMake.mockResolvedValue({})
      await expect(useMessageBroker()).rejects.toThrow('messageBroker config with a valid url is required')
    })

    it('should throw when messageBroker url is empty', async () => {
      mockMake.mockResolvedValue({ rabbitmq: { url: '', source: 'monolith' } })
      vi.resetModules()

      const mod = await import('./use-message-broker')
      mod.resetMessageBroker()

      await expect(mod.useMessageBroker()).rejects.toThrow('messageBroker config with a valid url is required')
    })
  })

  describe('singleton behavior', () => {
    it('should return the same instance on subsequent calls', async () => {
      mockMake.mockResolvedValue({ rabbitmq: { url: 'amqp://localhost', source: 'monolith' } })
      vi.resetModules()

      const mod = await import('./use-message-broker')
      mod.resetMessageBroker()

      const bus1 = await mod.useMessageBroker()
      const bus2 = await mod.useMessageBroker()

      expect(bus1).toBe(bus2)
    })

    it('should create a new instance after reset', async () => {
      mockMake.mockResolvedValue({ rabbitmq: { url: 'amqp://localhost', source: 'monolith' } })
      vi.resetModules()

      const mod = await import('./use-message-broker')
      mod.resetMessageBroker()

      const bus1 = await mod.useMessageBroker()
      mod.resetMessageBroker()
      const bus2 = await mod.useMessageBroker()

      expect(bus1).not.toBe(bus2)
    })
  })

  describe('shutdownMessageBroker', () => {
    it('should shut down the active broker', async () => {
      mockMake.mockResolvedValue({ rabbitmq: { url: 'amqp://localhost', source: 'monolith' } })
      vi.resetModules()

      const mod = await import('./use-message-broker')
      mod.resetMessageBroker()

      await mod.useMessageBroker()
      await mod.shutdownMessageBroker()

      expect(lastRabbitBus.shutdown).toHaveBeenCalledOnce()
    })

    it('should be a no-op when no broker is active', async () => {
      await expect(shutdownMessageBroker()).resolves.toBeUndefined()
    })

    it('should allow re-creation after shutdown', async () => {
      mockMake.mockResolvedValue({ rabbitmq: { url: 'amqp://localhost', source: 'monolith' } })
      vi.resetModules()

      const mod = await import('./use-message-broker')
      mod.resetMessageBroker()

      const bus1 = await mod.useMessageBroker()
      await mod.shutdownMessageBroker()
      const bus2 = await mod.useMessageBroker()

      expect(bus1).not.toBe(bus2)
    })
  })
})
