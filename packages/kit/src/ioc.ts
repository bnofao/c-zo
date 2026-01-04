import { Container } from '@adonisjs/fold'

export * from '@adonisjs/fold'

// eslint-disable-next-line react-hooks-extra/no-unnecessary-use-prefix
export function useContainer<KnownBindings extends Record<any, any>>(): Container<KnownBindings> {
  return ((useContainer as any).__instance__ ??= new Container<KnownBindings>())
}
