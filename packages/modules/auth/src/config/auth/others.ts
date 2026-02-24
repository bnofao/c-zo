import type { BetterAuthAdvancedOptions, BetterAuthOptions, BetterAuthRateLimitOptions } from 'better-auth'
import type { useStorage } from 'nitro/storage'
import { AUTH_EVENTS, publishAuthEvent } from '../../events'
import { validatePasswordStrength } from '../utils'

export type Storage = ReturnType<typeof useStorage>

type EmailAndPasswordOption = Exclude<BetterAuthOptions['emailAndPassword'], undefined>

export function emailAndPasswordConfig(option?: EmailAndPasswordOption) {
  return {
    ...option,
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    password: {
      hash: async (password: string) => {
        const result = validatePasswordStrength(password)
        if (!result.valid) {
          throw new Error(`Password too weak: ${result.errors.join(', ')}`)
        }
        const { hashPassword } = await import('better-auth/crypto')
        return hashPassword(password)
      },
      verify: async ({ hash, password }: { hash: string, password: string }) => {
        const { verifyPassword } = await import('better-auth/crypto')
        return verifyPassword({ hash, password })
      },
    },
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url, token }: Parameters<Exclude<EmailAndPasswordOption['sendResetPassword'], undefined>>[0]) => {
      void publishAuthEvent(AUTH_EVENTS.PASSWORD_RESET_REQUESTED, {
        email: user.email,
        userName: user.name,
        url,
        token,
      })
    },
    resetPasswordTokenExpiresIn: 3600,
  }
}

type EmailVerificationOption = Exclude<BetterAuthOptions['emailVerification'], undefined>

export function emailVerificationConfig(option?: EmailVerificationOption) {
  return {
    ...option,
    sendVerificationEmail: async ({ user, url, token }: Parameters<Exclude<EmailVerificationOption['sendVerificationEmail'], undefined>>[0]) => {
      void publishAuthEvent(AUTH_EVENTS.VERIFICATION_EMAIL_REQUESTED, {
        email: user.email,
        userName: user.name,
        url,
        token,
      })
    },
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 3600,
  }
}

export function rateLimitConfig(option?: BetterAuthRateLimitOptions, storage?: Storage): BetterAuthRateLimitOptions {
  return {
    enabled: true,
    window: 60,
    max: 30,
    storage: storage ? 'secondary-storage' : 'memory',
    customRules: {
      '/sign-in/email': { window: 900, max: 5 },
      '/sign-up/email': { window: 3600, max: 3 },
      '/forget-password': { window: 3600, max: 3 },
      '/reset-password': { window: 3600, max: 3 },
      '/two-factor/verify-totp': { window: 900, max: 5 },
      '/two-factor/verify-otp': { window: 900, max: 5 },
      '/two-factor/verify-backup-code': { window: 900, max: 5 },
      '/get-session': { window: 10, max: 60 },
    },
    ...option
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
