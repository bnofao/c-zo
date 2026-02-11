import { NoSchemaIntrospectionCustomRule } from 'graphql'
import { createYoga, createSchema } from 'graphql-yoga'
import { defineHandler } from 'nitro/h3'
import { mergeTypeDefs, mergeResolvers } from '@graphql-tools/merge'
import { validateGraphQLAuth } from '@czo/auth/graphql-auth'

const isDev = process.env.NODE_ENV !== 'production'

const schema = createSchema({
  typeDefs: mergeTypeDefs(registeredTypeDefs()),
  resolvers: mergeResolvers(registeredResolvers()),
})

const yoga = createYoga({
  schema,
  ...(!isDev && {
    validationRules: [NoSchemaIntrospectionCustomRule],
  }),
})

export default defineHandler(async (event) => {
  const auth = event.context.auth
  if (!auth) {
    return new Response(
      JSON.stringify({ errors: [{ message: 'Auth not initialized' }] }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    )
  }

  const authContext = await validateGraphQLAuth({
    auth: auth as Parameters<typeof validateGraphQLAuth>[0]['auth'],
    request: event.req,
    cookiePrefix: 'czo',
  })

  return yoga.fetch(event.req, { auth: authContext })
})
