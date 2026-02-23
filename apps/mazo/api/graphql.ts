import { NoSchemaIntrospectionCustomRule } from 'graphql'
import { createYoga } from 'graphql-yoga'
import { defineHandler } from 'nitro/h3'
import { mergeTypeDefs, mergeResolvers } from '@graphql-tools/merge'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { registeredTypeDefs, registeredResolvers, registeredDirectiveTypeDefs, applyDirectives, buildGraphQLContext } from '@czo/kit/graphql'

const isDev = process.env.NODE_ENV !== 'production'

let schema = makeExecutableSchema({
  typeDefs: mergeTypeDefs([...registeredDirectiveTypeDefs(), ...registeredTypeDefs()]),
  resolvers: mergeResolvers(registeredResolvers()),
})
schema = applyDirectives(schema)

const yoga = createYoga({
  schema,
  ...(!isDev && {
    validationRules: [NoSchemaIntrospectionCustomRule],
  }),
  context: initialContext =>
    buildGraphQLContext(initialContext as unknown as Record<string, unknown>, (initial) => initial.request as Request),
})

export default defineHandler(async (event) => {
  return yoga.fetch(event.req, {
    // ...event.context,
    request: event.req,
  })
})
