import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const verifyBackupCode: NonNullable<MutationResolvers['verifyBackupCode']> = async (_parent, _arg, _ctx) => {
  const result = await _ctx.auth.authService.verifyBackupCode({
    code: _arg.input.code,
    disableSession: _arg.input.disableSession ?? undefined,
    trustDevice: _arg.input.trustDevice ?? undefined,
  }, _ctx.request.headers)
  return { token: result.token ?? '' }
}
