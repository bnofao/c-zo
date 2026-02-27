import { addPlugin, addScanDir, createResolver, defineNitroModule } from '@czo/kit/nitro'
import './types'

export default defineNitroModule({
  setup: async (nitro) => {
    const resolver = createResolver(import.meta.url)

    // const existing = (nitro.options.runtimeConfig as Record<string, any>).czo ?? {}
    // ;(nitro.options.runtimeConfig as Record<string, any>).czo = {
    //   ...existing,
    //   auth: {
    //     secret: '',
    //     baseUrl: '',
    //     jwtPrivateKey: '',
    //     jwtPublicKey: '',
    //     googleClientId: '',
    //     googleClientSecret: '',
    //     githubClientId: '',
    //     githubClientSecret: '',
    //     ...existing.auth,
    //   },
    // }

    addScanDir(resolver.resolve('./'), nitro)
    addPlugin(resolver.resolve('./plugins/index'), nitro)
  },
})
