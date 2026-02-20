import { addPlugin, addScanDir, createResolver, defineNitroModule } from '@czo/kit/author'
import { useContainer } from '@czo/kit/ioc'
import { useAccessService } from './config/access'
import { useAuthActorService } from './config/actor'
import { DEFAULT_ACTOR_RESTRICTIONS } from './plugins/actor-config'

export default defineNitroModule({
  setup: async (nitro) => {
    const container = useContainer()

    // Static config only — available before czo:boot so other modules can register their own actor types at setup time
    const actorService = useAuthActorService()
    container.singleton('auth:actor', () => actorService)

    const accessService = useAccessService()
    container.singleton('auth:access', () => accessService)

    const resolver = createResolver(import.meta.url)

    const existing = (nitro.options.runtimeConfig as Record<string, any>).czo ?? {}
    ;(nitro.options.runtimeConfig as Record<string, any>).czo = {
      ...existing,
      auth: {
        secret: '',
        baseUrl: '',
        jwtPrivateKey: '',
        jwtPublicKey: '',
        googleClientId: '',
        googleClientSecret: '',
        githubClientId: '',
        githubClientSecret: '',
        ...existing.auth,
      },
    }

    addScanDir(resolver.resolve('./'), nitro)
    addPlugin(resolver.resolve('./plugins/index'), nitro)
  },
})
