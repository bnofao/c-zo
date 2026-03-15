import { addPlugin, createResolver, defineNitroModule } from '@czo/kit/nitro'
import './types'

export default defineNitroModule({
  name: 'stock-location',
  setup: async (nitro) => {
    const resolver = createResolver(import.meta.url)
    addPlugin(resolver.resolve('./plugins/index'), nitro)
  },
})
