import { addPlugin, createResolver, defineNitroModule } from '@czo/kit'
import { addImportsSources } from '../nitro'

export default defineNitroModule({
  setup: (nitro) => {
    const resolver = createResolver(import.meta.url)
    addImportsSources({
      from: '@czo/kit',
      imports: ['useContainer', 'useLogger', 'useDatabase', 'closeDatabase'],
    }, nitro)
    addImportsSources({
      from: '@czo/kit/graphql',
      imports: ['registeredTypeDefs', 'registeredResolvers'],
    }, nitro)
    // addPlugin(resolver.resolve('../plugin/index'), nitro)
  },
})
