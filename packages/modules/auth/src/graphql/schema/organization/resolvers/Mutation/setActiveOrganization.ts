import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const setActiveOrganization: NonNullable<MutationResolvers['setActiveOrganization']> = async (_parent, _arg, _ctx) =>
  _ctx.auth.organizationService.setActive(
    _ctx.request.headers,
    _arg.organizationId ?? undefined,
    _arg.organizationSlug ?? undefined,
  )
