import { addPlugin, createResolver, defineNitroModule } from '@czo/kit'
import { addImportsSources } from '../nitro'

export const iocModule = defineNitroModule({
  setup: (nitro) => {
    const resolver = createResolver(import.meta.url)
    addImportsSources({
      from: '@czo/kit',
      imports: ['useContainer', 'useLogger'],
    }, nitro)
    addPlugin(resolver.resolve('../plugins/ioc'), nitro)
  },
})
