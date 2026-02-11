import { AsyncLocalStorage } from 'node:async_hooks'

export interface SessionContextData {
  actorType: string
  authMethod: string
  organizationId?: string
}

const storage = new AsyncLocalStorage<SessionContextData>()

export function runWithSessionContext<T>(data: SessionContextData, fn: () => T): T {
  return storage.run(data, fn)
}

export function getSessionContext(): SessionContextData | undefined {
  return storage.getStore()
}
