import type { EnableTwoFactorResultResolvers } from './../../../__generated__/types.generated'

export const EnableTwoFactorResult: EnableTwoFactorResultResolvers = {
  totpURI: parent => parent.totpURI,
  backupCodes: parent => parent.backupCodes,
}
