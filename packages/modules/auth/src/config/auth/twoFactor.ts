import type { TwoFactorOptions } from 'better-auth/plugins'
import { twoFactor } from 'better-auth/plugins'

export function twoFactorConfig(option?: TwoFactorOptions) {
  return twoFactor({
    ...option,
    schema: {
      twoFactor: {
        modelName: 'two_factors',
        fields: {
          backupCodes: 'backup_codes',
          userId: 'user_id',
        },
      },
      user: {
        fields: {
          twoFactorEnabled: 'two_factor_enabled',
        },
      },
    },
  })
}
