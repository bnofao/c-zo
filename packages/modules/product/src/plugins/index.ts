import { registerResolvers, registerTypeDefs } from '@czo/kit/graphql'
import { resolvers } from '@czo/product/schema/resolvers.generated'
import { typeDefs } from '@czo/product/schema/typeDefs.generated'
import { CategoryService } from '@czo/product/services'
import { definePlugin } from 'nitro'

export default definePlugin(async (nitroApp) => {
  useContainer().singleton('categoryService', () => new CategoryService(useDatabase()))

  // register type definitions and resolvers
  registerTypeDefs(typeDefs)
  registerResolvers(resolvers)
})