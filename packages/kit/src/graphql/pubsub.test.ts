import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('graphql/pubsub', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('should return a singleton instance', async () => {
    const { usePubSub } = await import('./pubsub')

    const a = usePubSub()
    const b = usePubSub()

    expect(a).toBe(b)
  })

  it('should deliver published payloads to subscribers', async () => {
    const { usePubSub } = await import('./pubsub')
    const pubSub = usePubSub()

    const received: unknown[] = []
    const iterator = pubSub.subscribe('test-channel')

    const consuming = (async () => {
      for await (const data of iterator) {
        received.push(data)
        if (received.length === 2)
          break
      }
    })()

    // Allow the async iterator to start listening
    await new Promise(resolve => setTimeout(resolve, 10))

    pubSub.publish('test-channel', { id: 1 })
    pubSub.publish('test-channel', { id: 2 })

    await consuming

    expect(received).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('should isolate channels', async () => {
    const { usePubSub } = await import('./pubsub')
    const pubSub = usePubSub()

    const received: unknown[] = []
    const iterator = pubSub.subscribe('channel-a')

    const consuming = (async () => {
      for await (const data of iterator) {
        received.push(data)
        if (received.length === 1)
          break
      }
    })()

    await new Promise(resolve => setTimeout(resolve, 10))

    pubSub.publish('channel-b', { wrong: true })
    pubSub.publish('channel-a', { right: true })

    await consuming

    expect(received).toEqual([{ right: true }])
  })

  it('should expose publish and subscribe methods', async () => {
    const { usePubSub } = await import('./pubsub')
    const pubSub = usePubSub()

    expect(typeof pubSub.publish).toBe('function')
    expect(typeof pubSub.subscribe).toBe('function')
  })
})
