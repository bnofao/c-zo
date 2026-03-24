import { addHandler, addPlugin, createResolver, defineNitroModule } from '@czo/kit/nitro'
import './types'

export default defineNitroModule({
  setup: async (nitro) => {
    const resolver = createResolver(import.meta.url)

    addHandler({
      route: '/api/auth/**',
      handler: resolver.resolve('./routes/auth/[...all]'),
    }, nitro)

    // addScanDir(resolver.resolve('./'), nitro)
    addPlugin(resolver.resolve('./plugins/index'), nitro)
  },
})
