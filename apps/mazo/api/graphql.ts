import { NoSchemaIntrospectionCustomRule } from 'graphql'
import { createYoga } from 'graphql-yoga'
import { fromNodeHandler } from 'nitro/h3'
import { buildGraphQLContext, buildSchema, initBuilder } from '@czo/kit/graphql'
import { registeredRelations, useDatabase } from '@czo/kit/db'

const isDev = process.env.NODE_ENV !== 'production'

const db = await useDatabase()
const builder = initBuilder({ db, relations: registeredRelations() })
const schema = buildSchema(builder)

const yoga = createYoga({
  schema,
  ...(!isDev && {
    validationRules: [NoSchemaIntrospectionCustomRule],
  }),
  context: initialContext =>
    buildGraphQLContext(initialContext as unknown as Record<string, unknown>, initial => initial.request as Request),
})

export default fromNodeHandler(yoga)
