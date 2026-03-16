import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const updateStockLocationAddress: NonNullable<MutationResolvers['updateStockLocationAddress']> = async (_parent, _arg, _ctx) => {
  const { input } = _arg

  const result = await _ctx.stockLocation.service.updateAddress(_arg.stockLocationId, {
    addressLine1: input.addressLine1 ?? undefined,
    // Nullable fields: preserve null (explicit clear) vs undefined (not provided)
    addressLine2: input.addressLine2,
    city: input.city ?? undefined,
    province: input.province,
    postalCode: input.postalCode,
    countryCode: input.countryCode ?? undefined,
    phone: input.phone,
  })

  return result
}
