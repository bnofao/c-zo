import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const updateStockLocation: NonNullable<MutationResolvers['updateStockLocation']> = async (_parent, _arg, _ctx) => {
  const { input } = _arg

  const result = await _ctx.stockLocation.service.update(_arg.id, {
    name: input.name ?? undefined,
    handle: input.handle ?? undefined,
    metadata: input.metadata as Record<string, unknown> | undefined,
    address: input.address
      ? {
          addressLine1: input.address.addressLine1 ?? undefined,
          addressLine2: input.address.addressLine2,
          city: input.address.city ?? undefined,
          province: input.address.province,
          postalCode: input.address.postalCode,
          countryCode: input.address.countryCode ?? undefined,
          phone: input.address.phone,
        }
      : undefined,
  })

  return result
}
