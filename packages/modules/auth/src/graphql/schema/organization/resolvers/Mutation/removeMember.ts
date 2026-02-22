import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const removeMember: NonNullable<MutationResolvers['removeMember']> = async (_parent, _arg, _ctx) => {
  await _ctx.auth.organizationService.removeMember(
    _ctx.request.headers,
    _arg.memberIdOrEmail,
    _arg.organizationId ?? undefined,
  )
  return true
}
