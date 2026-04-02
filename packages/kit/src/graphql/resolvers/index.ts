import { resolveNode } from '../relay'

type Resolver<T> = {
  [K in keyof T]: Resolver<T[K]>
}

const resolvers: Array<Resolver<unknown>> = [
  {
    Query: {
      _empty: async () => null,
      node: (_parent: unknown, args: { id: string }, ctx: unknown): any =>
        resolveNode(args.id, ctx as any),
    },
    Mutation: { _empty: async () => null },
  },
]

export function registerResolvers<T extends Resolver<unknown>>(resolver: T) {
  resolvers.push(resolver)
}

export function registeredResolvers() {
  return resolvers
}
