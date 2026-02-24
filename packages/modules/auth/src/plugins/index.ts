import type { AuthOption } from '../config/auth'
import { useLogger } from '@czo/kit'
import { useDatabase } from '@czo/kit/db'
import { useContainer } from '@czo/kit/ioc'
import { definePlugin } from 'nitro'
import { useRuntimeConfig } from 'nitro/runtime-config'
import { useStorage } from 'nitro/storage'
import {
  ADMIN_HIERARCHY,
  ADMIN_STATEMENTS,
  API_KEY_HIERARCHY,
  API_KEY_STATEMENTS,
  ORGANIZATION_HIERARCHY,
  ORGANIZATION_STATEMENTS,
} from '../config'
import { useAccessService } from '../config/access'
import { useAuthActorService } from '../config/actor'
import { createAuth } from '../config/auth'
import { createApiKeyService } from '../services/apiKey.service'
import { createAuthService } from '../services/auth.service'
import { createOrganizationService } from '../services/organization.service'
import { createUserService } from '../services/user.service'
import { DEFAULT_ACTOR_RESTRICTIONS } from './actor-config'

export default definePlugin(async (nitroApp) => {
  const logger = useLogger('auth:plugin')
  const container = useContainer()
  const config = useRuntimeConfig()

  const authConfig = config.auth

  if (!authConfig?.secret) {
    logger.warn('Auth secret not configured — auth module will not initialize. Set NITRO_CZO_AUTH_SECRET.')
    return
  }

  if (authConfig.secret.length < 32) {
    logger.error('Auth secret must be at least 32 characters. Auth module will not initialize.')
    return
  }

  nitroApp.hooks.hook('request', async (event: { context: Record<string, unknown> }) => {
    const auth = await container.make('auth')
    if (!auth) {
      throw new Error('Auth not initialized — ensure czo:boot hook has been called before handling requests')
    }
    event.context.generateOpenAPISchema = () => auth.api.generateOpenAPISchema()
  })

  nitroApp.hooks.hook('czo:init', async () => {
    const actorService = useAuthActorService()
    container.singleton('auth:actor', () => actorService)

    const accessService = useAccessService()
    container.singleton('auth:access', () => accessService)
  })

  nitroApp.hooks.hook('czo:register', async () => {
    logger.start('Begin registration...')

    // const restrictionRegistry = useAuthActorService()
    const actorService = await container.make('auth:actor')
    for (const [actorType, config] of Object.entries(DEFAULT_ACTOR_RESTRICTIONS)) {
      actorService.registerActor(actorType, config)
    }

    const accessService = await container.make('auth:access')
    accessService.register({
      name: 'organization',
      statements: ORGANIZATION_STATEMENTS,
      hierarchy: ORGANIZATION_HIERARCHY,
    })
    accessService.register({
      name: 'admin',
      statements: ADMIN_STATEMENTS,
      hierarchy: ADMIN_HIERARCHY,
    })
    accessService.register({
      name: 'api-key',
      statements: API_KEY_STATEMENTS,
      hierarchy: API_KEY_HIERARCHY,
    })
  })

  nitroApp.hooks.hook('czo:boot', async () => {
    const db = useDatabase()
    const accessService = await container.make('auth:access')
    const { ac, roles } = accessService.buildRoles()
    const authOption: AuthOption = {
      app: config.app,
      secret: authConfig.secret,
      baseUrl: config.baseUrl,
      socials: authConfig.socials,
      storage: useStorage('auth'),
      ac,
      roles,
    }

    const auth = createAuth(db, authOption)
    container.singleton('auth', () => auth)

    const userService = createUserService(auth)
    container.singleton('auth:users', () => userService)

    const authService = createAuthService(auth)
    container.singleton('auth:service', () => authService)

    const organizationService = createOrganizationService(auth)
    container.singleton('auth:organizations', () => organizationService)

    const apiKeyService = createApiKeyService(auth)
    container.singleton('auth:apikeys', () => apiKeyService)

    const actorService = await container.make('auth:actor')
    actorService.freeze()
    accessService.freeze()

    // Register GraphQL schema, resolvers and context only when auth is properly configured
    await import('../graphql/context-factory')
    await import('../graphql/typedefs')
    await import('../graphql/resolvers')
    await import('../graphql/directives')

    logger.success('Booted !')
    logger.info('Auth restriction registry frozen')
    logger.info('Access statement registry frozen — auth created with domain roles')
  })
})
