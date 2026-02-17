import type { AuthConfigOptions } from '../config/auth.config'
import { useContainer, useLogger } from '@czo/kit'
import { useDatabase } from '@czo/kit/db'
import { definePlugin } from 'nitro'
import { useRuntimeConfig } from 'nitro/runtime-config'
import { useStorage } from 'nitro/storage'
import { registerAuthStatements } from '../access/auth-statements'
import { useAccessStatementRegistry } from '../access/registry'
import { createAuth } from '../config/auth.config'
import { AuthEventsService } from '../events/auth-events'
import { useAuthRestrictionRegistry } from '../services/auth-restriction-registry'
import { ConsoleEmailService } from '../services/email.service'
import { createPermissionService } from '../services/permission.service'
import { createSecondaryStorage } from '../services/secondary-storage'
import { createUserService } from '../services/user.service'
import { DEFAULT_ACTOR_RESTRICTIONS } from './actor-config'
import '../graphql/typedefs'
import '../graphql/resolvers/resolvers'
import '../graphql/resolvers/user-resolvers'

export default definePlugin(async (nitroApp) => {
  const logger = useLogger('auth:plugin')
  const container = useContainer()
  const config = useRuntimeConfig()
  const db = useDatabase()

  const authConfig = (config as unknown as Record<string, unknown>).auth as
    | { secret: string, baseUrl: string }
    | undefined

  if (!authConfig?.secret) {
    logger.warn('Auth secret not configured — auth module will not initialize. Set NITRO_CZO_AUTH_SECRET.')
    return
  }

  if (authConfig.secret.length < 32) {
    logger.error('Auth secret must be at least 32 characters. Auth module will not initialize.')
    return
  }

  const emailService = new ConsoleEmailService()
  container.bind('auth:email', () => emailService)

  const authEvents = new AuthEventsService()
  container.bind('auth:events', () => authEvents)

  const restrictionRegistry = useAuthRestrictionRegistry()
  for (const [actorType, config] of Object.entries(DEFAULT_ACTOR_RESTRICTIONS)) {
    restrictionRegistry.registerActorType(actorType, config)
  }
  container.bind('auth:restrictions', () => restrictionRegistry)

  const accessRegistry = useAccessStatementRegistry()
  registerAuthStatements(accessRegistry)
  container.bind('auth:access', () => accessRegistry)

  const authOptions: AuthConfigOptions = {
    appName: (authConfig as Record<string, string>).appName || '',
    secret: authConfig.secret,
    baseUrl: authConfig.baseUrl || 'http://localhost:4000',
    emailService,
    events: authEvents,
    restrictionRegistry,
  }

  const oauthConfig = authConfig as Record<string, string>
  const oauth: AuthConfigOptions['oauth'] = {}
  if (oauthConfig.googleClientId && oauthConfig.googleClientSecret) {
    oauth.google = {
      clientId: oauthConfig.googleClientId,
      clientSecret: oauthConfig.googleClientSecret,
    }
    logger.info('Google OAuth configured')
  }
  if (oauthConfig.githubClientId && oauthConfig.githubClientSecret) {
    oauth.github = {
      clientId: oauthConfig.githubClientId,
      clientSecret: oauthConfig.githubClientSecret,
    }
    logger.info('GitHub OAuth configured')
  }
  if (Object.keys(oauth).length > 0) {
    authOptions.oauth = oauth
  }

  const authStorage = useStorage('auth')
  authOptions.redis = { storage: createSecondaryStorage(authStorage) }
  logger.info('Auth session cache initialized via useStorage("auth")')

  let auth: ReturnType<typeof createAuth> | undefined
  let permissionService: ReturnType<typeof createPermissionService> | undefined
  let userService: ReturnType<typeof createUserService> | undefined

  nitroApp.hooks.hook('request', (event: { context: Record<string, unknown> }) => {
    if (!auth)
      return
    event.context.auth = auth
    event.context.generateOpenAPISchema = () => auth!.api.generateOpenAPISchema()
    event.context.db = db
    event.context.authEvents = authEvents
    event.context.authSecret = authConfig.secret
    event.context.authRestrictions = restrictionRegistry
    if (permissionService) {
      event.context.permissionService = permissionService
    }
    if (userService) {
      event.context.userService = userService
    }
  })

  nitroApp.hooks.hook('czo:boot', () => {
    restrictionRegistry.freeze()
    accessRegistry.freeze()

    authOptions.accessRegistry = accessRegistry
    auth = createAuth(db, authOptions)
    container.bind('auth', () => auth)

    permissionService = createPermissionService(auth)
    container.bind('auth:permissions', () => permissionService)

    userService = createUserService(auth)
    container.bind('auth:users', () => userService)

    logger.info('Auth restriction registry frozen')
    logger.info('Access statement registry frozen — auth created with domain roles')
  })

  logger.info('Auth module initialized with better-auth (session-based)')
})
