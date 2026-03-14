import type { useStorage } from 'nitro/storage'
import type { NitroRuntimeConfig } from 'nitro/types'
import { Container } from '@adonisjs/fold'

export * from '@adonisjs/fold'

export interface ContainerBindings {
  config: NitroRuntimeConfig
  useStorage: typeof useStorage
}

export function useContainer(): Container<ContainerBindings> {
  return ((useContainer as any).__instance__ ??= new Container<ContainerBindings>())
}
