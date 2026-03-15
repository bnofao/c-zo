import type { BackupCodesResultResolvers } from './../../../__generated__/types.generated'

export const BackupCodesResult: BackupCodesResultResolvers = {
  status: parent => parent.status,
  backupCodes: parent => parent.backupCodes,
}
