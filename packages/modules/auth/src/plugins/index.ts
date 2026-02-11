import type { AuthConfigOptions } from '../config/auth.config'
import { randomUUID } from 'node:crypto'
import { useContainer, useLogger } from '@czo/kit'
import { useCzoConfig } from '@czo/kit/config'
import { useDatabase } from '@czo/kit/db'
import { definePlugin } from 'nitro'
import { createAuth } from '../config/auth.config'
import { jwks as jwksTable } from '../database/schema'
import { ConsoleEmailService } from '../services/email.service'
import { createJwtBlocklist } from '../services/jwt-blocklist'
import { useAuthRedis } from '../services/redis'
import { createRedisStorage } from '../services/secondary-storage'
import { createTokenRotationService } from '../services/token-rotation'

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

  const emailService = new ConsoleEmailService()
  container.bind('auth:email', () => emailService)

  const authOptions: AuthConfigOptions = {
    secret: authConfig.secret,
    baseUrl: authConfig.baseUrl || 'http://localhost:4000',
    emailService,
  }

  let blocklist: ReturnType<typeof createJwtBlocklist> | undefined
  let rotation: ReturnType<typeof createTokenRotationService> | undefined

  try {
    const redis = useAuthRedis()
    blocklist = createJwtBlocklist(redis)
    container.bind('auth:blocklist', () => blocklist)

    rotation = createTokenRotationService(redis)
    container.bind('auth:rotation', () => rotation)

    authOptions.redis = { storage: createRedisStorage(redis) }

    logger.info('Auth Redis services initialized (blocklist + rotation + session cache)')
  }
  catch (err) {
    logger.warn('Redis unavailable — JWT blocklist and token rotation disabled.', (err as Error).message)
  }

  const auth = createAuth(db, authOptions)

  container.bind('auth', () => auth)

  // Seed JWKS table from environment variables if provided and table is empty
  const jwtPrivateKey = (authConfig as Record<string, string>).jwtPrivateKey
  const jwtPublicKey = (authConfig as Record<string, string>).jwtPublicKey
  if (jwtPrivateKey && jwtPublicKey) {
    try {
      const existing = await (db as any).select().from(jwksTable).limit(1)
      if (existing.length === 0) {
        await (db as any).insert(jwksTable).values({
          id: randomUUID(),
          publicKey: jwtPublicKey,
          privateKey: jwtPrivateKey,
          createdAt: new Date(),
        })
        logger.info('JWT keys seeded from environment variables')
      }
    }
    catch (err) {
      logger.warn('Failed to seed JWKS table from environment variables', (err as Error).message)
    }
  }

  nitroApp.hooks.hook('request', (event: { context: Record<string, unknown> }) => {
    event.context.auth = auth
    event.context.db = db
    if (blocklist)
      event.context.blocklist = blocklist
    if (rotation)
      event.context.rotation = rotation
  })

  logger.info('Auth module initialized with better-auth + JWT (ES256)')
})
