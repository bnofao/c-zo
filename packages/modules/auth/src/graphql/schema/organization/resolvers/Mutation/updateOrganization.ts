import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const updateOrganization: NonNullable<MutationResolvers['updateOrganization']> = async (_parent, _arg, _ctx) => {
  const result = await _ctx.auth.organizationService.update({
    data: {
      name: _arg.input.name ?? undefined,
      slug: _arg.input.slug ?? undefined,
      logo: _arg.input.logo ?? undefined,
      type: _arg.input.type ?? undefined,
    },
    organizationId: _arg.organizationId,
  }, _ctx.request.headers)
  if (!result)
    throw new Error('Organization not found')
  return result
}
