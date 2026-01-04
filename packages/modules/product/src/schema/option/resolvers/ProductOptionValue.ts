import type { ProductOptionValueResolvers } from './../../types.generated'
import { OptionService } from '@czo/product/services'

export const ProductOptionValue: ProductOptionValueResolvers = {
  option: async (parent, _args, ctx) => {
    const optionService = new OptionService(ctx.db)

    const optionValue = await ctx.db
      .selectFrom('p_option_values')
      .selectAll()
      .where('id', '=', parent.id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()

    if (!optionValue || !optionValue.option_id) {
      throw new Error('Option not found')
    }

    const option = await optionService.getOption(optionValue.option_id)

    if (!option) {
      throw new Error('Option not found')
    }

    return {
      id: option.id,
      title: option.title,
      metadata: option.metadata,
      createdAt: option.created_at,
      updatedAt: option.updated_at,
    }
  },

  variants: async (parent, _args, ctx) => {
    const variants = await ctx.db
      .selectFrom('p_variants_options')
      .innerJoin('p_variants', 'p_variants.id', 'p_variants_options.variant_id')
      .selectAll('p_variants')
      .where('p_variants_options.option_value_id', '=', parent.id)
      .where('p_variants.deleted_at', 'is', null)
      .execute()

    return variants.map(variant => ({
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
    }))
  },
}