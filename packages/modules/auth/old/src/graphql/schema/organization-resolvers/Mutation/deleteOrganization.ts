import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const deleteOrganization: NonNullable<MutationResolvers['deleteOrganization']> = async (_parent, _arg, _ctx) => {
  await _ctx.auth.organizationService.remove(_arg.organizationId, _ctx.request.headers)
  return true
}
