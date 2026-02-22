import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const setActiveOrganization: NonNullable<MutationResolvers['setActiveOrganization']> = async (_parent, _arg, _ctx) =>
  _ctx.auth.organizationService.setActive(
    _arg.organizationId ?? undefined,
    _ctx.request.headers,
    _arg.organizationSlug ?? undefined,
  )
