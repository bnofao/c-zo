import type { AuthOption } from '@czo/auth/config'
import {
  ADMIN_HIERARCHY,
  ADMIN_STATEMENTS,
  API_KEY_HIERARCHY,
  API_KEY_STATEMENTS,
  createAuth,
  ORGANIZATION_HIERARCHY,
  ORGANIZATION_STATEMENTS,
  useAccessService,
  useAuthActorService,
} from '@czo/auth/config'
import { registerAppConsumer, registerWebhookDispatcher } from '@czo/auth/listeners'
import { createApiKeyService, createAppService, createAuthService, createOrganizationService, createUserService } from '@czo/auth/services'
import { useLogger } from '@czo/kit'
import { useDatabase } from '@czo/kit/db'
import { useContainer } from '@czo/kit/ioc'
import { definePlugin } from 'nitro'
import { useRuntimeConfig } from 'nitro/runtime-config'
import { useStorage } from 'nitro/storage'
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

  nitroApp.hooks.hook('czo:init', async () => {
    const actorService = useAuthActorService()
    container.singleton('auth:actor', () => actorService)

    const accessService = useAccessService()
    container.singleton('auth:access', () => accessService)
  })

  nitroApp.hooks.hook('czo:register', async () => {
    logger.start('Registering auth domains...')

    const actorService = await container.make('auth:actor')
    const actorTypes = Object.keys(DEFAULT_ACTOR_RESTRICTIONS)
    for (const [actorType, config] of Object.entries(DEFAULT_ACTOR_RESTRICTIONS)) {
      actorService.registerActor(actorType, config)
    }
    logger.info(`Registered ${actorTypes.length} actor types: ${actorTypes.join(', ')}`)

    const accessService = await container.make('auth:access')
    const domains = ['organization', 'admin', 'api-key'] as const
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
    logger.info(`Registered ${domains.length} access domains: ${domains.join(', ')}`)

    logger.success('Auth domains registered')
  })

  nitroApp.hooks.hook('czo:boot', async () => {
    logger.start('Booting auth module...')

    const db = await useDatabase()
    const accessService = await container.make('auth:access')
    const { ac, roles } = accessService.buildRoles()
    const roleNames = Object.keys(roles)
    logger.info(`Built ${roleNames.length} roles: ${roleNames.join(', ') || '(none)'}`)

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
    logger.info('Auth instance created and bound to container')

    const userService = createUserService(auth)
    container.singleton('auth:users', () => userService)

    const authService = createAuthService(auth)
    container.singleton('auth:service', () => authService)

    const organizationService = createOrganizationService(auth)
    container.singleton('auth:organizations', () => organizationService)

    const apiKeyService = createApiKeyService(auth)
    container.singleton('auth:apikeys', () => apiKeyService)

    const subscribableEvents = authConfig.app?.subscribableEvents?.length
      ? new Set(authConfig.app.subscribableEvents)
      : new Set([])

    const appService = createAppService(db as any, apiKeyService, authService, subscribableEvents)
    container.singleton('auth:apps', () => appService)
    logger.info('Services bound: users, auth, organizations, apiKeys, apps')

    await registerAppConsumer()
    await registerWebhookDispatcher()

    const actorService = await container.make('auth:actor')
    actorService.freeze()
    accessService.freeze()
    logger.info('Actor and access registries frozen')

    // Register GraphQL schema, resolvers and context only when auth is properly configured
    await import('@czo/auth/graphql')
    logger.info('GraphQL schema, resolvers and directives registered')

    logger.success('Auth module booted')
  })
})
