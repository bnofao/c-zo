import type { NitroHooks } from 'nitro/types'
import type { EventEmitter } from './events/types'
import type { Container } from './ioc'

export * from './commands'
export * from './ioc'
export { logger, useLogger } from './logger'
export * from './module'
export { addDevHandler, addHandler, addImports, addImportsDir, addPlugin, addScanDir } from './nitro'
export type { ResolvePathOptions, Resolver } from './resolve'
export { createResolver, directoryToURL, findPath, resolveAlias, resolveFiles, resolvePath } from './resolve'
export * from './types'

declare module 'nitro/types' {
  interface NitroApp {
    container: Container<Record<any, any>>
    events: EventEmitter
  }
  interface NitroRuntimeHooks {
    // 'czo:register': <T extends Record<any, any>>(container: Container<T>) => void
    'czo:boot': <T extends Record<any, any>>(container: Container<T>) => void
  }
  interface NitroModule {
    hooks?: Partial<NitroHooks>
  }
}
