import { createTwoFactorVerifyHandler } from './_verify-handler'

export default createTwoFactorVerifyHandler({
  betterAuthPath: '/two-factor/verify-backup-code',
})
