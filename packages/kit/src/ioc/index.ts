import type { NitroRuntimeConfig } from 'nitro/types'
import { Container } from '@adonisjs/fold'

export * from '@adonisjs/fold'

export interface ContainerBindings {
  config: NitroRuntimeConfig
}

export function useContainer(): Container<ContainerBindings> {
  return ((useContainer as any).__instance__ ??= new Container<ContainerBindings>())
}
