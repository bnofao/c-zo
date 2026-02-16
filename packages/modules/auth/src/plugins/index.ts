import type { AuthConfigOptions } from '../config/auth.config'
import { useContainer, useLogger } from '@czo/kit'
import { useDatabase } from '@czo/kit/db'
import { definePlugin } from 'nitro'
import { useRuntimeConfig } from 'nitro/runtime-config'
import { createAuth } from '../config/auth.config'
import { AuthEventsService } from '../events/auth-events'
import { ConsoleEmailService } from '../services/email.service'
import { useAuthRedis } from '../services/redis'
import { createRedisStorage } from '../services/secondary-storage'
import '../graphql/typedefs'
import '../graphql/resolvers'

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

  const authOptions: AuthConfigOptions = {
    secret: authConfig.secret,
    baseUrl: authConfig.baseUrl || 'http://localhost:4000',
    emailService,
    events: authEvents,
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

  try {
    const redis = useAuthRedis()
    authOptions.redis = { storage: createRedisStorage(redis) }
    logger.info('Auth Redis session cache initialized')
  }
  catch (err) {
    logger.warn('Redis unavailable — session cache disabled.', (err as Error).message)
  }

  const auth = createAuth(db, authOptions)

  container.bind('auth', () => auth)

  nitroApp.hooks.hook('request', (event: { context: Record<string, unknown> }) => {
    event.context.auth = auth
    event.context.generateOpenAPISchema = () => auth.api.generateOpenAPISchema()
    event.context.db = db
    event.context.authEvents = authEvents
    event.context.authSecret = authConfig.secret
  })

  logger.info('Auth module initialized with better-auth (session-based)')
})
