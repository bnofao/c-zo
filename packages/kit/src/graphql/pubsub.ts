import { EventEmitter, on } from 'node:events'

export interface PubSub {
  publish: <T>(channel: string, payload: T) => void
  subscribe: <T>(channel: string) => AsyncIterableIterator<T>
}

let instance: PubSub | undefined

export function usePubSub(): PubSub {
  if (!instance) {
    const emitter = new EventEmitter()
    emitter.setMaxListeners(0)

    instance = {
      publish(channel, payload) {
        emitter.emit(channel, payload)
      },
      async* subscribe(channel) {
        for await (const [data] of on(emitter, channel)) {
          yield data
        }
      },
    }
  }
  return instance
}
