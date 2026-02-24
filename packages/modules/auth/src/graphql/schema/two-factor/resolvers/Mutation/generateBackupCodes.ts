import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const generateBackupCodes: NonNullable<MutationResolvers['generateBackupCodes']> = async (_parent, _arg, _ctx) =>
  _ctx.auth.authService.generateBackupCodes(_arg.password, _ctx.request.headers)
