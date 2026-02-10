import { addPlugin, createResolver, defineNitroModule } from '@czo/kit'
import { czoConfigDefaults } from '../config'
import { addImportsSources } from '../nitro'

export default defineNitroModule({
  setup: (nitro) => {
    const resolver = createResolver(import.meta.url)

    // Inject czo config defaults into runtimeConfig so Nitro's
    // applyEnv() can map NITRO_CZO_* env vars automatically.
    // User values from nitro.config.ts take precedence over defaults.
    const existing = (nitro.options.runtimeConfig as any).czo ?? {}
    ;(nitro.options.runtimeConfig as any).czo = {
      ...czoConfigDefaults,
      ...existing,
      queue: {
        ...czoConfigDefaults.queue,
        ...existing.queue,
      },
    }

    addImportsSources({
      from: '@czo/kit/db',
      imports: ['useDatabase'],
    }, nitro)
    addImportsSources({
      from: '@czo/kit',
      imports: ['useContainer', 'useLogger'],
    }, nitro)
    addImportsSources({
      from: '@czo/kit/graphql',
      imports: ['registeredTypeDefs', 'registeredResolvers'],
    }, nitro)
    addPlugin(resolver.resolve('../plugin/index'), nitro)
  },
})
