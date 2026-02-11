import { addPlugin, addScanDir, createResolver, defineNitroModule } from '@czo/kit/author'

export default defineNitroModule({
  setup: (nitro) => {
    const resolver = createResolver(import.meta.url)

    const existing = (nitro.options.runtimeConfig as Record<string, any>).czo ?? {}
    ;(nitro.options.runtimeConfig as Record<string, any>).czo = {
      ...existing,
      auth: {
        secret: '',
        baseUrl: '',
        ...existing.auth,
      },
    }

    addScanDir(resolver.resolve('./'), nitro)
    addPlugin(resolver.resolve('./plugins/index'), nitro)
  },
})
