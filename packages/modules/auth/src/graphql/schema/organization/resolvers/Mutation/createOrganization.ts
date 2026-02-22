import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const createOrganization: NonNullable<MutationResolvers['createOrganization']> = async (_parent, _arg, _ctx) => {
  const result = await _ctx.auth.organizationService.create(_ctx.request.headers, {
    name: _arg.input.name,
    slug: _arg.input.slug,
    logo: _arg.input.logo ?? undefined,
  })
  if (!result) throw new Error('Failed to create organization')
  return result
}
