import { czoConfigDefaults } from '../config-defaults'
import { defineNitroModule } from '../module'
import { addImportsSources, addPlugin } from '../nitro'
import { createResolver } from '../resolve'

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
      from: '@czo/kit/ioc',
      imports: ['useContainer'],
    }, nitro)
    addImportsSources({
      from: '@czo/kit',
      imports: ['useLogger'],
    }, nitro)
    addImportsSources({
      from: '@czo/kit/graphql',
      imports: ['registeredTypeDefs', 'registeredResolvers', 'buildGraphQLContext', 'registerContextFactory', 'registerDirective', 'registeredDirectiveTypeDefs', 'applyDirectives'],
    }, nitro)
    addPlugin(resolver.resolve('../plugin/index'), nitro)
  },
})
