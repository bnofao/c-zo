import type { PriceGraphQLSchemaBuilder } from '@czo/price/graphql'
import { Effect } from 'effect'
import { PriceService } from '../../../services/price'
import { loadPriceListOrganizationId, loadPriceSetOrganizationId } from './authz'

export function registerPriceQueries(builder: PriceGraphQLSchemaBuilder): void {
  // ── priceSet(id) — single price set by global ID ───────────────────────────
  builder.queryField('priceSet', t =>
    t.drizzleField({
      type: 'priceSets',
      nullable: true,
      description: 'Fetch a single price set by id. Requires `price:read` in the set\'s owning organization. Returns null if not found or soft-deleted.',
      args: {
        id: t.arg.globalID({ for: 'PriceSet', required: true, description: 'Relay global id of the PriceSet to fetch.' }),
      },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadPriceSetOrganizationId(ctx, Number(args.id.id))
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'price', actions: ['read'], organization } }
      },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* PriceService
            return yield* svc.findPriceSet(query({ where: { id: Number(args.id.id) } } as any))
          }).pipe(
            Effect.catchTag('PriceSetNotFound', () => Effect.succeed(null)),
          ),
        ),
    }))

  // ── priceSets — paginated connection, always tenant-scoped ─────────────────
  builder.queryField('priceSets', t =>
    t.drizzleConnection({
      type: 'priceSets',
      description: 'Paginated (relay) connection over an organization\'s price sets. Requires `price:read` in that org.',
      authScopes: (_parent, args) => ({
        permission: {
          resource: 'price',
          actions: ['read'],
          organization: Number(args.organizationId.id),
        },
      }),
      args: {
        organizationId: t.arg.globalID({ for: 'Organization', required: true, description: 'The organization whose price sets to list.' }),
      },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* PriceService
            return yield* svc.findPriceSets(query({ where: { organizationId: Number(args.organizationId.id) } } as any))
          }),
        ) as Promise<any>,
    }))

  // ── priceList(id) — single price list by global ID ─────────────────────────
  builder.queryField('priceList', t =>
    t.drizzleField({
      type: 'priceLists',
      nullable: true,
      description: 'Fetch a single price list by id. Requires `price:read` in the list\'s owning organization. Returns null if not found or soft-deleted.',
      args: {
        id: t.arg.globalID({ for: 'PriceList', required: true, description: 'Relay global id of the PriceList to fetch.' }),
      },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadPriceListOrganizationId(ctx, Number(args.id.id))
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'price', actions: ['read'], organization } }
      },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* PriceService
            return yield* svc.findPriceList(query({ where: { id: Number(args.id.id) } } as any))
          }).pipe(
            Effect.catchTag('PriceListNotFound', () => Effect.succeed(null)),
          ),
        ),
    }))

  // ── priceLists — paginated connection, always tenant-scoped ───────────────
  builder.queryField('priceLists', t =>
    t.drizzleConnection({
      type: 'priceLists',
      description: 'Paginated (relay) connection over an organization\'s price lists. Requires `price:read` in that org.',
      authScopes: (_parent, args) => ({
        permission: {
          resource: 'price',
          actions: ['read'],
          organization: Number(args.organizationId.id),
        },
      }),
      args: {
        organizationId: t.arg.globalID({ for: 'Organization', required: true, description: 'The organization whose price lists to list.' }),
      },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* PriceService
            return yield* svc.findPriceLists(query({ where: { organizationId: Number(args.organizationId.id) } } as any))
          }),
        ) as Promise<any>,
    }))

  // ── resolvePrice — PUBLIC + org-scoped (NO authScopes → field is open) ─────
  // The org boundary is enforced inside the service: resolvePrice(organizationId, ...)
  // returns null when the price set doesn't belong to the given org.
  builder.queryField('resolvePrice', t =>
    t.field({
      type: 'CalculatedPrice',
      subGraphs: ['public'],
      nullable: true,
      description: 'Resolve the effective price for a price set in a given currency and buying context (the pricing engine). Public, but org-scoped inside the service: returns null when the price set does not belong to the given organization or no price applies. The result is a Base, Override, or Sale price.',
      args: {
        organizationId: t.arg.globalID({ for: 'Organization', required: true, description: 'The organization the price set must belong to.' }),
        priceSetId: t.arg.globalID({ for: 'PriceSet', required: true, description: 'The price set to resolve a price for.' }),
        currencyCode: t.arg.string({ required: true, description: 'ISO 4217 currency code to price in (e.g. `USD`).' }),
        quantity: t.arg.int({ description: 'Purchase quantity, used to select quantity-tier prices; defaults to 1.' }),
        at: t.arg({ type: 'DateTime', description: 'Point in time to evaluate price-list windows against; defaults to now.' }),
        attributes: t.arg({ type: ['PriceContextRuleInput'], description: 'Buying-context attributes evaluated against price/list rules.' }),
      },
      resolve: async (_root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* PriceService
            return yield* svc.resolvePrice(
              Number(args.organizationId.id),
              Number(args.priceSetId.id),
              {
                currencyCode: args.currencyCode,
                quantity: args.quantity ?? undefined,
                at: args.at instanceof Date ? args.at : undefined,
                attributes: ((args.attributes ?? []) as Array<{ attribute: string, value: unknown }>).map(a => ({
                  attribute: a.attribute,
                  value: a.value as string | number,
                })),
              },
            )
          }),
        ),
    }))

  // ── resolvePrices — bulk variant of resolvePrice (PUBLIC + org-scoped) ──────
  // O(1) DB queries for N sets. Each requested id is present in the result; a
  // foreign-org / unknown / no-applicable set yields a `price: null` entry.
  builder.queryField('resolvePrices', t =>
    t.field({
      type: ['PriceResolution'],
      subGraphs: ['public'],
      description: 'Bulk variant of `resolvePrice`: resolve effective prices for many price sets at once (O(1) DB queries for N sets). Every requested id appears in the result; a foreign-org, unknown, or non-applicable set yields a `price: null` entry. Public, org-scoped inside the service.',
      args: {
        organizationId: t.arg.globalID({ for: 'Organization', required: true, description: 'The organization the price sets must belong to.' }),
        priceSetIds: t.arg.globalIDList({ for: 'PriceSet', required: true, description: 'The price sets to resolve prices for.' }),
        currencyCode: t.arg.string({ required: true, description: 'ISO 4217 currency code to price in (e.g. `USD`).' }),
        quantity: t.arg.int({ description: 'Purchase quantity, used to select quantity-tier prices; defaults to 1.' }),
        at: t.arg({ type: 'DateTime', description: 'Point in time to evaluate price-list windows against; defaults to now.' }),
        attributes: t.arg({ type: ['PriceContextRuleInput'], description: 'Buying-context attributes evaluated against price/list rules.' }),
      },
      resolve: async (_root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* PriceService
            const ids = args.priceSetIds.map((g: any) => Number(g.id))
            const map = yield* svc.resolvePrices(
              Number(args.organizationId.id),
              ids,
              {
                currencyCode: args.currencyCode,
                quantity: args.quantity ?? undefined,
                at: args.at instanceof Date ? args.at : undefined,
                attributes: ((args.attributes ?? []) as Array<{ attribute: string, value: unknown }>).map(a => ({
                  attribute: a.attribute,
                  value: a.value as string | number,
                })),
              },
            )
            return ids.map(id => ({ priceSetId: id, price: map.get(id) ?? null }))
          }),
        ),
    }))
}
