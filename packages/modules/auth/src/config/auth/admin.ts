import type { AdminOptions } from 'better-auth/plugins'
import { admin } from 'better-auth/plugins'

export function adminConfig(option?: AdminOptions) {
  return admin({
    ...option,
    schema: {
      user: {
        modelName: 'users',
        fields: {
          role: 'role',
          banned: 'banned',
          banReason: 'ban_reason',
          banExpires: 'ban_expires',
        },
      },
      session: {
        modelName: 'sessions',
        fields: {
          impersonatedBy: 'impersonated_by',
        },
      },
    },
  })
}
