import type { QueryResolvers } from './../../../../__generated__/types.generated'

export const members: NonNullable<QueryResolvers['members']> = async (_parent, _arg, _ctx) => {
  const result = await _ctx.auth.organizationService.listMembers(_ctx.request.headers, {
    organizationId: _arg.organizationId ?? undefined,
    organizationSlug: _arg.organizationSlug ?? undefined,
  })
  return result.members
}
