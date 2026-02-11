import { useContainer, useLogger } from '@czo/kit'
import { useCzoConfig } from '@czo/kit/config'
import { useDatabase } from '@czo/kit/db'
import { definePlugin } from 'nitro'
import { createAuth } from '../config/auth.config'

export default definePlugin(async (nitroApp) => {
  const logger = useLogger('auth:plugin')
  const container = useContainer()
  const config = useCzoConfig()
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

  const auth = createAuth(db, {
    secret: authConfig.secret,
    baseUrl: authConfig.baseUrl || 'http://localhost:4000',
  })

  container.bind('auth', () => auth)

  nitroApp.hooks.hook('request', (event: { context: Record<string, unknown> }) => {
    event.context.auth = auth
  })

  logger.info('Auth module initialized with better-auth + JWT (ES256)')
})
