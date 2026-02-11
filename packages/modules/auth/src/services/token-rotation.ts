import type Redis from 'ioredis'
import { createHash, randomBytes } from 'node:crypto'

const KEY_PREFIX = 'czo:rotated:'
const REUSE_DETECTION_TTL = 60

export interface TokenRotationService {
  recordRotation: (sessionId: string, oldTokenHash: string) => Promise<void>
  wasAlreadyRotated: (sessionId: string, tokenHash: string) => Promise<boolean>
  generateToken: () => string
  hashToken: (token: string) => string
}

export function createTokenRotationService(redis: Redis): TokenRotationService {
  return {
    async recordRotation(sessionId: string, oldTokenHash: string): Promise<void> {
      const key = `${KEY_PREFIX}${sessionId}:${oldTokenHash}`
      await redis.setex(key, REUSE_DETECTION_TTL, '1')
    },

    async wasAlreadyRotated(sessionId: string, tokenHash: string): Promise<boolean> {
      const key = `${KEY_PREFIX}${sessionId}:${tokenHash}`
      const result = await redis.exists(key)
      return result === 1
    },

    generateToken(): string {
      return randomBytes(32).toString('base64url')
    },

    hashToken(token: string): string {
      return createHash('sha256').update(token).digest('hex')
    },
  }
}
