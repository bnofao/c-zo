import { NoSchemaIntrospectionCustomRule } from 'graphql'
import { createYoga } from 'graphql-yoga'
import { defineHandler } from 'nitro/h3'
import { mergeTypeDefs, mergeResolvers } from '@graphql-tools/merge'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { registeredTypeDefs, registeredResolvers } from '@czo/kit/graphql'
import { validateGraphQLAuth, isIntrospectionQuery } from '@czo/auth/graphql-auth'

const isDev = process.env.NODE_ENV !== 'production'

const schema = makeExecutableSchema({
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

  if (isDev && event.req.method === 'POST') {
    try {
      const body = await event.req.clone().json()
      if (isIntrospectionQuery(body)) {
        return yoga.fetch(event.req, { auth: null })
      }
    }
    catch {
      // Fall through to normal auth flow
    }
  }

  const authContext = await validateGraphQLAuth({
    auth: auth as Parameters<typeof validateGraphQLAuth>[0]['auth'],
    request: event.req,
    cookiePrefix: 'czo',
  })

  return yoga.fetch(event.req, {
    auth: authContext,
    authInstance: event.context.auth,
    authRestrictions: event.context.authRestrictions,
    authEvents: event.context.authEvents,
    request: event.req,
  })
})
