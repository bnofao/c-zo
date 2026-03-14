import { addImportsSources, addPlugin, createResolver, defineNitroModule } from '@czo/kit/nitro'

export default defineNitroModule({
  setup: (nitro) => {
    const resolver = createResolver(import.meta.url)

    // addTemplate({
    //   id: '#czo/kit/config',
    //   getContents() {
    //     return `import { runtimeConfig } from "#nitro/virtual/runtime-config";
    //     import { useContainer } from "@czo/kit/ioc";

    //     console.log('OKOKOKOKOK');

    //     useContainer().bindValue('config', useRuntimeConfig())`
    //   },
    // }, nitro)

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
    // addScanDir(resolver.resolve('../'), nitro)
    addPlugin(resolver.resolve('../plugins/index'), nitro)
  },
})
