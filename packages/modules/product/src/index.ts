import { addPlugin, createResolver, defineNitroModule } from '@czo/kit'
// import { registerResolvers, registerTypeDefs } from '@czo/kit/graphql'
// import { resolvers } from './schema/resolvers.generated'
// import { typeDefs } from './schema/typeDefs.generated'


export default defineNitroModule({
  name: 'product',
  setup: (nitro) => {
    const resolver = createResolver(import.meta.url)

    // register plugins
    addPlugin(resolver.resolve('./plugins/index'), nitro)
  }
})