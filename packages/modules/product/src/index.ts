import { addPlugin, createResolver, defineNitroModule } from '@czo/kit'
// import { registerResolvers, registerTypeDefs } from '@czo/kit/graphql'
// import { getDatabase } from './database/connection'
// import { resolvers } from './schema/resolvers.generated'
// import { typeDefs } from './schema/typeDefs.generated'
// import { CategoryService } from './services/category.service'
// import { ProductService } from './services/product.service'
// import { VariantService } from './services/variant.service'

// export * from './database'
// export * from './services'
// export * from './utils'
// export * from './validators'

export default defineNitroModule({
  name: 'product',
  setup: (nitro) => {
    const resolver = createResolver(import.meta.url)

    // Initialize database and services
    // const db = getDatabase()
    // const productService = new ProductService(db)
    // const variantService = new VariantService(db)
    // const categoryService = new CategoryService(db)

    // // Register GraphQL schema and resolvers
    // registerTypeDefs(typeDefs, nitro)
    // registerResolvers(resolvers, nitro)

    // Make services available to GraphQL context
    // Note: This will need to be integrated with the main GraphQL context setup
    // nitro.options.runtimeConfig.productModule = {
    //   services: {
    //     product: productService,
    //     variant: variantService,
    //     category: categoryService,
    //   }
    // }

    // Register plugins
    addPlugin(resolver.resolve('./plugins/index'), nitro)
  }
})