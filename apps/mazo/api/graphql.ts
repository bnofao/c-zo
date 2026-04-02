import { NoSchemaIntrospectionCustomRule } from 'graphql'
import { createYoga } from 'graphql-yoga'
import { fromNodeHandler } from 'nitro/h3'
import { mergeTypeDefs, mergeResolvers } from '@graphql-tools/merge'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { useGraphQLMiddleware } from '@envelop/graphql-middleware'
import { registeredTypeDefs, registeredResolvers, registeredDirectiveTypeDefs, applyDirectives, registeredMiddlewares, buildGraphQLContext } from '@czo/kit/graphql'

const isDev = process.env.NODE_ENV !== 'production'

let schema = makeExecutableSchema({
  typeDefs: mergeTypeDefs([...registeredDirectiveTypeDefs(), ...registeredTypeDefs()]),
  resolvers: mergeResolvers(registeredResolvers()),
})
schema = applyDirectives(schema)

const yoga = createYoga({
  schema,
  plugins: [
    useGraphQLMiddleware(registeredMiddlewares()),
  ],
  ...(!isDev && {
    validationRules: [NoSchemaIntrospectionCustomRule],
  }),
  context: initialContext =>
    buildGraphQLContext(initialContext as unknown as Record<string, unknown>, (initial) => initial.request as Request),
})

export default fromNodeHandler(yoga)
