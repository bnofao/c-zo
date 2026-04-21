import type { GraphQLContextMap } from '../context'
import { fromGlobalId } from './global-id'

type NodeResolver = (id: string, ctx: GraphQLContextMap) => Promise<unknown>

const resolvers = new Map<string, NodeResolver>()

export function registerNodeResolver(type: string, resolver: NodeResolver) {
  resolvers.set(type, resolver)
}

export async function resolveNode(globalId: string, ctx: GraphQLContextMap): Promise<unknown> {
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
}
