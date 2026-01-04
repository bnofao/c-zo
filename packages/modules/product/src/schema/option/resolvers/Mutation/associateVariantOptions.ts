import type { MutationResolvers } from './../../../types.generated'
import { OptionService, VariantService } from '@czo/product/services'

export const associateVariantOptions: NonNullable<MutationResolvers['associateVariantOptions']> = async (
  _parent,
  { variantId, optionValueIds },
  ctx,
) => {
  try {
    const optionService = new OptionService(ctx.db)
    const variantService = new VariantService(ctx.db)

    // Associate option values to variant
    await optionService.assignOptionsToVariant(variantId, optionValueIds)

    // Fetch the updated variant
    const variant = await variantService.getVariant(variantId)

    if (!variant) {
      return {
        errors: [
          {
            code: 'NOT_FOUND',
            message: 'Variant not found',
          },
        ],
      }
    }

    return {
      variant: {
        id: variant.id,
        title: variant.title,
        sku: variant.sku,
        barcode: variant.barcode,
        ean: variant.ean,
        upc: variant.upc,
        allowBackorder: variant.allow_backorder,
        manageInventory: variant.manage_inventory,
        hsCode: variant.hs_code,
        originCountry: variant.origin_country,
        material: variant.material,
        weight: variant.weight,
        length: variant.length,
        height: variant.height,
        width: variant.width,
        metadata: variant.metadata,
        variantRank: variant.variant_rank,
        createdAt: variant.created_at,
        updatedAt: variant.updated_at,
      },
    }
  }
  catch (error) {
    return {
      errors: [
        {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to associate variant options',
        },
      ],
    }
  }
}
