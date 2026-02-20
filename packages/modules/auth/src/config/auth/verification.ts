import type { BetterAuthOptions } from 'better-auth'

export function verificationConfig(option?: BetterAuthOptions['verification']): BetterAuthOptions['verification'] {
  return {
    ...option,
    modelName: 'verifications',
    fields: {
      expiresAt: 'expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
}
