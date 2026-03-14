import { addPlugin, createResolver, defineNitroModule } from '@czo/kit/nitro'
import './types'

export default defineNitroModule({
  setup: async (nitro) => {
    const resolver = createResolver(import.meta.url)

    // addScanDir(resolver.resolve('./'), nitro)
    addPlugin(resolver.resolve('./plugins/index'), nitro)
  },
})
