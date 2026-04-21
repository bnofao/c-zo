import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const removeMember: NonNullable<MutationResolvers['removeMember']> = async (_parent, _arg, _ctx) => {
  await _ctx.auth.organizationService.removeMember({
    memberIdOrEmail: _arg.memberIdOrEmail,
    organizationId: _arg.organizationId ?? undefined,
  }, _ctx.request.headers)
  return true
}
