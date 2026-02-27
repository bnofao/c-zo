import type Redis from 'ioredis'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('queue connection', () => {
  let registerQueueConnection: typeof import('./connection').registerQueueConnection
  let getQueueConnection: typeof import('./connection').getQueueConnection
  let resetQueueConnection: typeof import('./connection').resetQueueConnection
  let closeQueueConnection: typeof import('./connection').closeQueueConnection

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('./connection')
    registerQueueConnection = mod.registerQueueConnection
    getQueueConnection = mod.getQueueConnection
    resetQueueConnection = mod.resetQueueConnection
    closeQueueConnection = mod.closeQueueConnection
  })

  it('should store and return the registered connection', async () => {
    const mockRedis = { status: 'ready' } as unknown as Redis

    registerQueueConnection(mockRedis)

    expect(await getQueueConnection()).toBe(mockRedis)
  })

  it('should throw when getting connection before registration', async () => {
    await expect(getQueueConnection()).rejects.toThrow('Queue connection not registered')
  })

  it('should throw on double registration', () => {
    const mockRedis = { status: 'ready' } as unknown as Redis

    registerQueueConnection(mockRedis)

    expect(() => registerQueueConnection(mockRedis)).toThrow('Queue connection already registered')
  })

  it('should allow re-registration after reset', async () => {
    const redis1 = { status: 'ready', id: 1 } as unknown as Redis
    const redis2 = { status: 'ready', id: 2 } as unknown as Redis

    registerQueueConnection(redis1)
    resetQueueConnection()
    registerQueueConnection(redis2)

    expect(await getQueueConnection()).toBe(redis2)
  })

  it('should call disconnect and clear on close', async () => {
    const mockRedis = { status: 'ready', disconnect: vi.fn() } as unknown as Redis

    registerQueueConnection(mockRedis)
    await closeQueueConnection()

    expect(mockRedis.disconnect).toHaveBeenCalledOnce()
    await expect(getQueueConnection()).rejects.toThrow('Queue connection not registered')
  })

  it('should be a no-op when closing without a connection', async () => {
    await expect(closeQueueConnection()).resolves.toBeUndefined()
  })
})
