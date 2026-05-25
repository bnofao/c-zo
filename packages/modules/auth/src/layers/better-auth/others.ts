import type { BetterAuthAdvancedOptions, BetterAuthOptions, BetterAuthRateLimitOptions } from 'better-auth'
import type { useStorage } from 'nitro/storage'
// import { validatePasswordStrength } from '../utils'

export type Storage = ReturnType<typeof useStorage>

type EmailAndPasswordOption = Exclude<BetterAuthOptions['emailAndPassword'], undefined>

export function emailAndPasswordConfig(option?: EmailAndPasswordOption, requireEmailVerification = false) {
  return {
    ...option,
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    password: {
      hash: async (password: string) => {
        const { hashPassword } = await import('better-auth/crypto')
        return hashPassword(password)
      },
      verify: async ({ hash, password }: { hash: string, password: string }) => {
        const { verifyPassword } = await import('better-auth/crypto')
        return verifyPassword({ hash, password })
      },
    },
    requireEmailVerification,
  }
}

export function rateLimitConfig(option?: BetterAuthRateLimitOptions, storage?: Storage): BetterAuthRateLimitOptions {
  return {
    enabled: true,
    window: 60,
    max: 30,
    storage: storage ? 'secondary-storage' : 'memory',
    customRules: {
      '/sign-in/email': { window: 900, max: 15 },
      '/sign-up/email': { window: 3600, max: 3 },
      '/forget-password': { window: 3600, max: 3 },
      '/reset-password': { window: 3600, max: 3 },
      '/two-factor/verify-totp': { window: 900, max: 5 },
      '/two-factor/verify-otp': { window: 900, max: 5 },
      '/two-factor/verify-backup-code': { window: 900, max: 5 },
      '/get-session': { window: 10, max: 60 },
    },
    ...option,
  }
}

export function advancedConfig(option?: BetterAuthAdvancedOptions) {
  return {
    ...option,
    // cookiePrefix,
    // useSecureCookies: options.baseUrl.startsWith('https'),
    defaultCookieAttributes: {
      ...option?.defaultCookieAttributes,
      httpOnly: true,
      sameSite: 'lax' as const,
    },
    database: {
      generateId: 'serial' as const,
    },
  }
}

export function secondaryStorageConfig(storage?: Storage) {
  if (storage) {
    return {
      async get(key: string): Promise<string | null> {
        return await storage.getItem<string>(key) ?? null
      },

      async set(key: string, value: string, ttl?: number): Promise<void> {
        if (ttl) {
          await storage.setItem(key, value, { ttl })
        }
        else {
          await storage.setItem(key, value)
        }
      },

      async delete(key: string): Promise<void> {
        await storage.removeItem(key)
      },
    }
  }
}
