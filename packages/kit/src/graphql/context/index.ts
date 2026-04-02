/**
 * GraphQL Context Registry
 *
 * Allows modules to declaratively register their context contributions,
 * similar to registerResolvers() and registerTypeDefs().
 *
 * Modules extend the GraphQLContextMap interface via declaration merging
 * to get end-to-end type safety.
 */

export interface GraphQLContextMap {
  request: Request
}

type ContextFactory = (
  serverContext: Record<string, unknown>,
) => Partial<GraphQLContextMap> | Promise<Partial<GraphQLContextMap>>

const factories: Array<{ name: string, factory: ContextFactory }> = []

export function registerContextFactory(
  name: string,
  factory: ContextFactory,
) {
  factories.push({ name, factory })
}

export function registeredContextFactories() {
  return factories
}

export async function buildGraphQLContext(
  serverContext: Record<string, unknown>,
  requestFactory: (serverContext: Record<string, unknown>) => Request | Promise<Request>,
): Promise<GraphQLContextMap> {
  const ctx = {
    request: await requestFactory(serverContext),
  }
  for (const { factory } of factories) {
    Object.assign(ctx, await factory(serverContext))
  }
  return ctx as GraphQLContextMap
}
