import type { GraphQLContextMap } from '../context'
import { fromGlobalId } from './global-id'

type NodeResolver = (id: string, ctx: GraphQLContextMap) => Promise<unknown>

export function createNodeRegistry() {
  const resolvers = new Map<string, NodeResolver>()

  return {
    register(type: string, resolver: NodeResolver) {
      resolvers.set(type, resolver)
    },

    async resolve(globalId: string, ctx: GraphQLContextMap): Promise<unknown> {
      const { type, id } = fromGlobalId(globalId)

      const resolver = resolvers.get(type)
      if (!resolver) {
        throw new Error(`No node resolver registered for type "${type}"`)
      }

      const result = await resolver(id, ctx)
      if (result == null) {
        return null
      }

      return { ...(result as Record<string, unknown>), __typename: type }
    },
  }
}

export type NodeRegistry = ReturnType<typeof createNodeRegistry>
