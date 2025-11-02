import { Container } from '@adonisjs/fold'

export * from '@adonisjs/fold'

// const container = new Container()

export function useContainer<KnownBindings extends Record<any, any>>(): Container<KnownBindings> {
  return ((useContainer as any).__instance__ ??= new Container<KnownBindings>())
}