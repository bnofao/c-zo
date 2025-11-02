import { registerResolvers, registerTypeDefs } from '@czo/kit/graphql'
import { defineNitroPlugin } from 'nitro/runtime'
import { resolvers } from '../schema/resolvers.generated'
import { typeDefs } from '../schema/typeDefs.generated'

export default defineNitroPlugin(async (nitroApp) => {
  // register type definitions and resolvers
  registerTypeDefs(typeDefs)
  registerResolvers(resolvers)
})