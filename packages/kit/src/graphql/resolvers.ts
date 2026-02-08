type Resolver<T> = {
  [K in keyof T]: Resolver<T[K]>
}

const resolvers: Array<Resolver<unknown>> = []

export function registerResolvers<T extends Resolver<unknown>>(resolver: T) {
  resolvers.push(resolver)
}

export function registeredResolvers() {
  return resolvers
}
