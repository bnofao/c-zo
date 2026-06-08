import type { SchemaRegistryShape } from '@czo/kit/db'
import { defineRelationsPart } from 'drizzle-orm'
// Side-effect import: bring auth's registry augmentation into scope so
// `organizations` resolves in the Pick AND when auth's own relations.ts
// compiles as part of this module's type graph. Mirrors inventory/channel.
import '@czo/auth/schema'

type PriceSchema = Pick<
  SchemaRegistryShape,
  'priceSets' | 'priceLists' | 'prices' | 'priceRules' | 'priceListRules' | 'organizations'
>

export function priceRelations(schema: PriceSchema) {
  const { priceSets, priceLists, prices, priceRules, priceListRules, organizations } = schema

  return defineRelationsPart(
    { priceSets, priceLists, prices, priceRules, priceListRules, organizations },
    r => ({
      priceSets: {
        organization: r.one.organizations({ from: r.priceSets.organizationId, to: r.organizations.id }),
        prices: r.many.prices({ from: r.priceSets.id, to: r.prices.priceSetId }),
      },
      priceLists: {
        organization: r.one.organizations({ from: r.priceLists.organizationId, to: r.organizations.id }),
        prices: r.many.prices({ from: r.priceLists.id, to: r.prices.priceListId }),
        rules: r.many.priceListRules({ from: r.priceLists.id, to: r.priceListRules.priceListId }),
      },
      prices: {
        organization: r.one.organizations({ from: r.prices.organizationId, to: r.organizations.id }),
        priceSet: r.one.priceSets({ from: r.prices.priceSetId, to: r.priceSets.id }),
        priceList: r.one.priceLists({ from: r.prices.priceListId, to: r.priceLists.id }),
        rules: r.many.priceRules({ from: r.prices.id, to: r.priceRules.priceId }),
      },
      priceRules: {
        price: r.one.prices({ from: r.priceRules.priceId, to: r.prices.id }),
      },
      priceListRules: {
        priceList: r.one.priceLists({ from: r.priceListRules.priceListId, to: r.priceLists.id }),
      },
    }),
  )
}

export type Relations = ReturnType<typeof priceRelations>
