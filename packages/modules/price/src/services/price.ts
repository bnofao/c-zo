import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { Relations } from '../database/relations'
import type { Candidate, RawListForGate, JsonScalar as ResolveScalar } from './resolve'
import { DrizzleDb, OptimisticLockError, optimisticUpdate } from '@czo/kit/db'
import { and, eq, sql } from 'drizzle-orm'
import { Context, Data, Effect, Layer } from 'effect'
import { isSqlError } from 'effect/unstable/sql/SqlError'
import {
  priceListRules as priceListRulesTable,
  priceLists as priceListsTable,
  priceRules as priceRulesTable,
  priceSets as priceSetsTable,
  prices as pricesTable,
} from '../database/schema'
import { resolveCalculated, rowToCandidate } from './resolve'
import { validateRuleInput } from './validation'

// ─── Tagged errors ────────────────────────────────────────────────────────────

export class PriceSetNotFound extends Data.TaggedError('PriceSetNotFound') {
  readonly code = 'PRICE_SET_NOT_FOUND'
  get message() { return 'Price set not found' }
}

export class PriceNotFound extends Data.TaggedError('PriceNotFound') {
  readonly code = 'PRICE_NOT_FOUND'
  get message() { return 'Price not found' }
}

export class PriceListNotFound extends Data.TaggedError('PriceListNotFound') {
  readonly code = 'PRICE_LIST_NOT_FOUND'
  get message() { return 'Price list not found' }
}

export class InvalidPriceRule extends Data.TaggedError('InvalidPriceRule')<{
  readonly attribute: string
  readonly reason: string
}> {
  readonly code = 'PRICE_INVALID_RULE'
  get message() { return `Invalid rule on '${this.attribute}': ${this.reason}` }
}

export class PriceDbFailed extends Data.TaggedError('PriceDbFailed')<{ readonly cause: unknown }> {
  readonly code = 'PRICE_DB_FAILED'
  get message() { return 'Database operation failed' }
}

export type PriceError
  = | PriceSetNotFound | PriceNotFound | PriceListNotFound
    | InvalidPriceRule | PriceDbFailed | OptimisticLockError

// ─── Rule + context value types ───────────────────────────────────────────────

export type RuleOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in'
export type JsonScalar = string | number
export type RuleValue = JsonScalar | ReadonlyArray<JsonScalar>

export interface RuleInput { attribute: string, operator: RuleOperator, value: RuleValue }

// ─── Input types ──────────────────────────────────────────────────────────────

export interface CreatePriceSetInput { organizationId: number, metadata?: Record<string, unknown> | null }

export interface CreatePriceInput {
  priceSetId: number
  priceListId?: number | null
  currencyCode: string
  amount: string
  minQuantity?: number | null
  maxQuantity?: number | null
  rules?: ReadonlyArray<RuleInput>
}

export interface UpdatePriceInput {
  currencyCode?: string
  amount?: string
  minQuantity?: number | null
  maxQuantity?: number | null
  rules?: ReadonlyArray<RuleInput>
}

export interface CreatePriceListInput {
  organizationId: number
  title: string
  description?: string | null
  type: 'sale' | 'override'
  status?: 'draft' | 'active'
  startsAt?: Date | null
  endsAt?: Date | null
  rules?: ReadonlyArray<RuleInput>
  metadata?: Record<string, unknown> | null
}

export interface UpdatePriceListInput {
  title?: string
  description?: string | null
  type?: 'sale' | 'override'
  status?: 'draft' | 'active'
  startsAt?: Date | null
  endsAt?: Date | null
  rules?: ReadonlyArray<RuleInput>
  metadata?: Record<string, unknown> | null
}

export interface PriceContext {
  currencyCode: string
  quantity?: number
  at?: Date
  attributes?: ReadonlyArray<{ attribute: string, value: JsonScalar }>
}

// ─── Domain model ─────────────────────────────────────────────────────────────

export type PriceSet = InferSelectModel<typeof priceSetsTable>
export type Price = InferSelectModel<typeof pricesTable>
export type PriceRule = InferSelectModel<typeof priceRulesTable>
export type PriceList = InferSelectModel<typeof priceListsTable>
export type PriceListRule = InferSelectModel<typeof priceListRulesTable>

// ─── Calculated price ─────────────────────────────────────────────────────────

export type CalculatedPrice
  = | { readonly _tag: 'Base', readonly amount: string, readonly currencyCode: string, readonly priceId: number }
    | { readonly _tag: 'Override', readonly amount: string, readonly currencyCode: string, readonly priceId: number, readonly priceListId: number }
    | { readonly _tag: 'Sale', readonly amount: string, readonly originalAmount: string, readonly currencyCode: string, readonly priceId: number, readonly priceListId: number }

// ─── Service contract ─────────────────────────────────────────────────────────

export class PriceService extends Context.Service<PriceService, {
  readonly createPriceSet: (input: CreatePriceSetInput) => Effect.Effect<PriceSet, PriceDbFailed>
  readonly findPriceSetById: (id: number) => Effect.Effect<PriceSet, PriceSetNotFound | PriceDbFailed>
  readonly findPriceSet: (config: Parameters<Database['query']['priceSets']['findFirst']>[0]) => Effect.Effect<PriceSet, PriceSetNotFound | PriceDbFailed>
  readonly findPriceSets: (config: Parameters<Database['query']['priceSets']['findMany']>[0]) => Effect.Effect<ReadonlyArray<PriceSet>, PriceDbFailed>
  readonly softDeletePriceSet: (id: number, expectedVersion: number) => Effect.Effect<PriceSet, PriceSetNotFound | OptimisticLockError | PriceDbFailed>
  readonly createPrice: (input: CreatePriceInput) => Effect.Effect<Price, PriceSetNotFound | PriceListNotFound | InvalidPriceRule | PriceDbFailed>
  readonly findPriceById: (id: number) => Effect.Effect<Price, PriceNotFound | PriceDbFailed>
  readonly findPriceRules: (priceId: number) => Effect.Effect<ReadonlyArray<PriceRule>, PriceDbFailed>
  readonly updatePrice: (id: number, expectedVersion: number, input: UpdatePriceInput) => Effect.Effect<Price, PriceNotFound | InvalidPriceRule | OptimisticLockError | PriceDbFailed>
  readonly softDeletePrice: (id: number, expectedVersion: number) => Effect.Effect<Price, PriceNotFound | OptimisticLockError | PriceDbFailed>
  readonly createPriceList: (input: CreatePriceListInput) => Effect.Effect<PriceList, InvalidPriceRule | PriceDbFailed>
  readonly findPriceListById: (id: number) => Effect.Effect<PriceList, PriceListNotFound | PriceDbFailed>
  readonly findPriceList: (config: Parameters<Database['query']['priceLists']['findFirst']>[0]) => Effect.Effect<PriceList, PriceListNotFound | PriceDbFailed>
  readonly findPriceLists: (config: Parameters<Database['query']['priceLists']['findMany']>[0]) => Effect.Effect<ReadonlyArray<PriceList>, PriceDbFailed>
  readonly findPriceListRules: (priceListId: number) => Effect.Effect<ReadonlyArray<PriceListRule>, PriceDbFailed>
  readonly updatePriceList: (id: number, expectedVersion: number, input: UpdatePriceListInput) => Effect.Effect<PriceList, PriceListNotFound | InvalidPriceRule | OptimisticLockError | PriceDbFailed>
  readonly softDeletePriceList: (id: number, expectedVersion: number) => Effect.Effect<PriceList, PriceListNotFound | OptimisticLockError | PriceDbFailed>
  readonly resolvePrice: (
    organizationId: number,
    priceSetId: number,
    context: PriceContext,
  ) => Effect.Effect<CalculatedPrice | null, PriceDbFailed>
  readonly resolvePrices: (
    organizationId: number,
    priceSetIds: ReadonlyArray<number>,
    context: PriceContext,
  ) => Effect.Effect<ReadonlyMap<number, CalculatedPrice | null>, PriceDbFailed>
}>()('@czo/price/PriceService') {}

type PriceServiceImpl = Context.Service.Shape<typeof PriceService>

// ─── Implementation ───────────────────────────────────────────────────────────

/** Project a loaded price-list row (+ rules) onto the pure-gate shape. */
function toGateList(list: PriceList & { rules: PriceListRule[] }): RawListForGate {
  return {
    status: list.status,
    startsAt: list.startsAt,
    endsAt: list.endsAt,
    type: list.type,
    rules: list.rules.map(r => ({ attribute: r.attribute, operator: r.operator, value: r.value as RuleValue })),
  }
}

export const make = Effect.gen(function* () {
  const db = (yield* DrizzleDb) as Database<Relations>

  /** Map any DB-layer error to PriceDbFailed. */
  const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(Effect.mapError(cause => new PriceDbFailed({ cause })))

  /**
   * Map a DB-layer error, but preserve OptimisticLockError as-is so the
   * GraphQL layer can route it correctly.
   */
  const dbErrOptimistic = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(
      Effect.mapError(e => e instanceof OptimisticLockError ? e : new PriceDbFailed({ cause: e })),
    )

  /**
   * Map only SqlError (raw DB failures) to PriceDbFailed, letting domain
   * tagged errors pass through. Use this for transaction bodies where
   * Effect.fail(new DomainError()) must not be swallowed into PriceDbFailed.
   */
  const dbErrSql = <A, E>(eff: Effect.Effect<A, E>): Effect.Effect<A, any> =>
    eff.pipe(
      Effect.mapError(e => isSqlError(e) ? new PriceDbFailed({ cause: e }) : e),
    )

  const validateRules = (rules: ReadonlyArray<RuleInput> | undefined) =>
    Effect.gen(function* () {
      for (const r of rules ?? []) {
        const res = validateRuleInput(r)
        if (!res.ok)
          return yield* Effect.fail(new InvalidPriceRule({ attribute: r.attribute, reason: res.reason }))
      }
    })

  const findPriceSet: PriceServiceImpl['findPriceSet'] = config =>
    Effect.gen(function* () {
      const row = yield* dbErr(db.query.priceSets.findFirst({
        ...config,
        where: { ...config?.where, deletedAt: { isNull: true } },
      }))
      if (!row)
        return yield* Effect.fail(new PriceSetNotFound())
      return row as PriceSet
    })

  const findPriceSetById: PriceServiceImpl['findPriceSetById'] = id =>
    Effect.gen(function* () {
      const row = yield* dbErr(db.query.priceSets.findFirst({
        where: { id, deletedAt: { isNull: true } },
      }))
      if (!row)
        return yield* Effect.fail(new PriceSetNotFound())
      return row as PriceSet
    })

  const createPriceSet: PriceServiceImpl['createPriceSet'] = input =>
    dbErr(Effect.gen(function* () {
      const [row] = yield* db.insert(priceSetsTable).values({
        organizationId: input.organizationId,
        metadata: input.metadata ?? null,
      }).returning()
      return row!
    }))

  const findPriceSets: PriceServiceImpl['findPriceSets'] = config =>
    dbErr(db.query.priceSets.findMany({
      ...config,
      where: { ...config?.where, deletedAt: { isNull: true } },
    }))

  const softDeletePriceSet: PriceServiceImpl['softDeletePriceSet'] = (id, expectedVersion) =>
    Effect.gen(function* () {
      yield* findPriceSetById(id)
      return yield* dbErrOptimistic(
        optimisticUpdate({ db, table: priceSetsTable, id, expectedVersion, values: { deletedAt: sql`NOW()` as any } }),
      )
    })

  const findPriceById: PriceServiceImpl['findPriceById'] = id =>
    Effect.gen(function* () {
      const row = yield* dbErr(db.query.prices.findFirst({
        where: { id, deletedAt: { isNull: true } },
      }))
      if (!row)
        return yield* Effect.fail(new PriceNotFound())
      return row as Price
    })

  const findPriceRules: PriceServiceImpl['findPriceRules'] = priceId =>
    dbErr(db.query.priceRules.findMany({
      where: { priceId, deletedAt: { isNull: true } },
    })) as Effect.Effect<ReadonlyArray<PriceRule>, PriceDbFailed>

  const createPrice: PriceServiceImpl['createPrice'] = input =>
    Effect.gen(function* () {
      yield* validateRules(input.rules)
      return yield* dbErrSql(db.transaction(tx =>
        Effect.gen(function* () {
        // Verify the set exists and is live
          const set = yield* (tx).query.priceSets.findFirst({
            where: { id: input.priceSetId, deletedAt: { isNull: true } },
          })
          if (!set)
            return yield* Effect.fail(new PriceSetNotFound())

          // If priceListId provided, verify the list exists, is live, AND belongs
          // to the SAME org as the set. A cross-org link would let another org's
          // list gate/override this price at resolution time (cross-tenant leak),
          // so reject it as not-found (no existence leak across orgs).
          if (input.priceListId != null) {
            const list = yield* (tx).query.priceLists.findFirst({
              where: { id: input.priceListId, deletedAt: { isNull: true } },
            })

            if (!list || list.organizationId !== set.organizationId)
              return yield* Effect.fail(new PriceListNotFound())
          }

          // Insert the price, denormalizing organizationId from the set
          const [price] = yield* (tx)
            .insert(pricesTable)
            .values({
              priceSetId: input.priceSetId,
              priceListId: input.priceListId ?? null,
              organizationId: set.organizationId,
              currencyCode: input.currencyCode,
              amount: input.amount,
              minQuantity: input.minQuantity ?? null,
              maxQuantity: input.maxQuantity ?? null,
            })
            .returning()

          // Insert rules if provided
          if (input.rules && input.rules.length > 0) {
            yield* (tx)
              .insert(priceRulesTable)
              .values(input.rules.map(r => ({
                priceId: price!.id,
                attribute: r.attribute,
                operator: r.operator,
                value: r.value,
              })))
          }

          return price!
        }),
      ))
    })

  const updatePrice: PriceServiceImpl['updatePrice'] = (id, expectedVersion, input) =>
    Effect.gen(function* () {
      yield* validateRules(input.rules)
      return yield* dbErrSql(db.transaction(tx =>
        (Effect.gen(function* () {
          // Load the live row — NotFound is a domain failure, not a DB error
          const existing = yield* (tx).query.prices.findFirst({
            where: { id, deletedAt: { isNull: true } },
          })
          if (!existing)
            return yield* Effect.fail(new PriceNotFound())

          // Guarded UPDATE: version must match
          const txDb = tx
          const updated: Price[] = yield* txDb
            .update(pricesTable)
            .set({
              ...(input.currencyCode !== undefined ? { currencyCode: input.currencyCode } : {}),
              ...(input.amount !== undefined ? { amount: input.amount } : {}),
              ...(input.minQuantity !== undefined ? { minQuantity: input.minQuantity } : {}),
              ...(input.maxQuantity !== undefined ? { maxQuantity: input.maxQuantity } : {}),
              version: sql`${pricesTable.version} + 1`,
              updatedAt: sql`NOW()`,
            })
            .where(and(
              eq(pricesTable.id, id),
              eq(pricesTable.version, expectedVersion),
            ))
            .returning()

          if (updated.length === 0) {
          // Version is stale — re-read current version for the error
            const rows: Array<{ version: number }> = yield* txDb
              .select({ version: pricesTable.version })
              .from(pricesTable)
              .where(eq(pricesTable.id, id))
              .limit(1)
            return yield* Effect.fail(new OptimisticLockError(id, expectedVersion, rows[0]?.version ?? null))
          }

          // Replace rules if provided
          if (input.rules !== undefined) {
            yield* txDb
              .update(priceRulesTable)
              .set({ deletedAt: sql`NOW()` })
              .where(and(
                eq(priceRulesTable.priceId, id),
                sql`${priceRulesTable.deletedAt} IS NULL`,
              ))
            if (input.rules.length > 0) {
              yield* txDb
                .insert(priceRulesTable)
                .values(input.rules.map(r => ({
                  priceId: id,
                  attribute: r.attribute,
                  operator: r.operator,
                  value: r.value,
                })))
            }
          }

          return updated[0]!
        }) as Effect.Effect<Price, PriceNotFound | OptimisticLockError, never>),
      ))
    })

  const softDeletePrice: PriceServiceImpl['softDeletePrice'] = (id, expectedVersion) =>
    Effect.gen(function* () {
      yield* findPriceById(id)
      return yield* dbErrOptimistic(
        optimisticUpdate({ db, table: pricesTable, id, expectedVersion, values: { deletedAt: sql`NOW()` as any } }),
      )
    })

  const findPriceList: PriceServiceImpl['findPriceList'] = config =>
    Effect.gen(function* () {
      const row = yield* dbErr(db.query.priceLists.findFirst({
        ...config,
        where: { ...config?.where, deletedAt: { isNull: true } },
      }))
      if (!row)
        return yield* Effect.fail(new PriceListNotFound())
      return row as PriceList
    })

  const findPriceListById: PriceServiceImpl['findPriceListById'] = id =>
    Effect.gen(function* () {
      const row = yield* dbErr(db.query.priceLists.findFirst({
        where: { id, deletedAt: { isNull: true } },
      }))
      if (!row)
        return yield* Effect.fail(new PriceListNotFound())
      return row as PriceList
    })

  const findPriceLists: PriceServiceImpl['findPriceLists'] = config =>
    dbErr(db.query.priceLists.findMany({
      ...config,
      where: { ...config?.where, deletedAt: { isNull: true } },
    })) as Effect.Effect<ReadonlyArray<PriceList>, PriceDbFailed>

  const findPriceListRules: PriceServiceImpl['findPriceListRules'] = priceListId =>
    dbErr(db.query.priceListRules.findMany({
      where: { priceListId, deletedAt: { isNull: true } },
    })) as Effect.Effect<ReadonlyArray<PriceListRule>, PriceDbFailed>

  const createPriceList: PriceServiceImpl['createPriceList'] = input =>
    Effect.gen(function* () {
      yield* validateRules(input.rules)
      return yield* dbErrSql(db.transaction(tx =>
        Effect.gen(function* () {
          const [list] = yield* (tx)
            .insert(priceListsTable)
            .values({
              organizationId: input.organizationId,
              title: input.title,
              description: input.description ?? null,
              type: input.type,
              status: input.status ?? 'draft',
              startsAt: input.startsAt ?? null,
              endsAt: input.endsAt ?? null,
              metadata: input.metadata ?? null,
            })
            .returning()

          if (input.rules && input.rules.length > 0) {
            yield* (tx)
              .insert(priceListRulesTable)
              .values(input.rules.map(r => ({
                priceListId: list!.id,
                attribute: r.attribute,
                operator: r.operator,
                value: r.value,
              })))
          }

          return list!
        }),
      ))
    })

  const updatePriceList: PriceServiceImpl['updatePriceList'] = (id, expectedVersion, input) =>
    Effect.gen(function* () {
      yield* validateRules(input.rules)
      return yield* dbErrSql(db.transaction(tx =>
        (Effect.gen(function* () {
          const existing = yield* (tx).query.priceLists.findFirst({
            where: { id, deletedAt: { isNull: true } },
          })
          if (!existing)
            return yield* Effect.fail(new PriceListNotFound())

          const txDb = tx
          const updated: PriceList[] = yield* txDb
            .update(priceListsTable)
            .set({
              ...(input.title !== undefined ? { title: input.title } : {}),
              ...(input.description !== undefined ? { description: input.description } : {}),
              ...(input.type !== undefined ? { type: input.type } : {}),
              ...(input.status !== undefined ? { status: input.status } : {}),
              ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
              ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
              ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
              version: sql`${priceListsTable.version} + 1`,
              updatedAt: sql`NOW()`,
            })
            .where(and(
              eq(priceListsTable.id, id),
              eq(priceListsTable.version, expectedVersion),
            ))
            .returning()

          if (updated.length === 0) {
            const rows: Array<{ version: number }> = yield* txDb
              .select({ version: priceListsTable.version })
              .from(priceListsTable)
              .where(eq(priceListsTable.id, id))
              .limit(1)
            return yield* Effect.fail(new OptimisticLockError(id, expectedVersion, rows[0]?.version ?? null))
          }

          if (input.rules !== undefined) {
            yield* txDb
              .update(priceListRulesTable)
              .set({ deletedAt: sql`NOW()` })
              .where(and(
                eq(priceListRulesTable.priceListId, id),
                sql`${priceListRulesTable.deletedAt} IS NULL`,
              ))
            if (input.rules.length > 0) {
              yield* txDb
                .insert(priceListRulesTable)
                .values(input.rules.map(r => ({
                  priceListId: id,
                  attribute: r.attribute,
                  operator: r.operator,
                  value: r.value,
                })))
            }
          }

          return updated[0]!
        }) as Effect.Effect<PriceList, PriceListNotFound | OptimisticLockError, never>),
      ))
    })

  const softDeletePriceList: PriceServiceImpl['softDeletePriceList'] = (id, expectedVersion) =>
    Effect.gen(function* () {
      yield* findPriceListById(id)
      return yield* dbErrOptimistic(
        optimisticUpdate({ db, table: priceListsTable, id, expectedVersion, values: { deletedAt: sql`NOW()` as any } }),
      )
    })

  const resolvePrice: PriceServiceImpl['resolvePrice'] = (organizationId, priceSetId, context) =>
    dbErr(Effect.gen(function* () {
      const at = context.at ?? new Date()
      const qty = context.quantity ?? 1

      // Org guard (H1): set must exist, be live, and belong to the caller's org.
      const set = yield* db.query.priceSets.findFirst({
        where: { id: priceSetId, organizationId, deletedAt: { isNull: true } },
      })
      if (!set)
        return null

      // Indexed cut: this set + currency, live, within quantity tier (NULL bounds open).
      // Two-query form: fetch prices with their rules, then fetch price lists separately.
      const rows = (yield* (db.query.prices.findMany({
        where: {
          priceSetId,
          currencyCode: context.currencyCode,
          deletedAt: { isNull: true },
          AND: [
            { OR: [{ minQuantity: { isNull: true } }, { minQuantity: { lte: qty } }] },
            { OR: [{ maxQuantity: { isNull: true } }, { maxQuantity: { gte: qty } }] },
          ],
        },
        with: {
          rules: { where: { deletedAt: { isNull: true } } },
        },
      })))

      // Collect distinct priceListIds that appear in the rows
      const priceListIds = [...new Set(rows.map(r => r.priceListId).filter((id): id is number => id !== null))]

      // Second query: fetch those price lists with their rules in one shot
      const priceLists = priceListIds.length > 0
        ? ((yield* (db.query.priceLists.findMany({
            where: { id: { in: priceListIds }, deletedAt: { isNull: true } },
            with: { rules: { where: { deletedAt: { isNull: true } } } },
          }))))
        : []

      const priceListMap = new Map(priceLists.map(l => [l.id, l]))

      const ctx = new Map<string, ResolveScalar>(
        (context.attributes ?? []).map(a => [a.attribute, a.value]),
      )

      const candidates: Candidate[] = []
      for (const p of rows) {
        const list = p.priceListId !== null ? priceListMap.get(p.priceListId) : undefined
        const cand = rowToCandidate(
          { priceId: p.id, amount: p.amount, currencyCode: p.currencyCode, priceListId: p.priceListId, rules: p.rules.map(r => ({ attribute: r.attribute, operator: r.operator, value: r.value as RuleValue, priority: r.priority })) },
          list ? toGateList(list) : null,
          at,
          ctx,
        )
        if (cand === null)
          continue
        candidates.push(cand)
      }

      return resolveCalculated(candidates, ctx)
    }))

  const resolvePrices: PriceServiceImpl['resolvePrices'] = (organizationId, priceSetIds, context) =>
    dbErr(Effect.gen(function* () {
      const out = new Map<number, CalculatedPrice | null>()
      for (const id of priceSetIds) out.set(id, null)
      if (priceSetIds.length === 0)
        return out
      const at = context.at ?? new Date()
      const qty = context.quantity ?? 1
      const ctx = new Map<string, ResolveScalar>((context.attributes ?? []).map(a => [a.attribute, a.value]))

      // 1. bulk org-guard — only sets that exist, are live, and belong to the org.
      const sets = (yield* (db.query.priceSets.findMany({
        where: { id: { in: [...priceSetIds] }, organizationId, deletedAt: { isNull: true } },
      })))
      const validIds = sets.map(s => s.id)
      if (validIds.length === 0)
        return out

      // 2. bulk prices + rules for ALL valid sets (one query, quantity-tier filtered).
      const rows = (yield* (db.query.prices.findMany({
        where: {
          priceSetId: { in: validIds },
          currencyCode: context.currencyCode,
          deletedAt: { isNull: true },
          AND: [
            { OR: [{ minQuantity: { isNull: true } }, { minQuantity: { lte: qty } }] },
            { OR: [{ maxQuantity: { isNull: true } }, { maxQuantity: { gte: qty } }] },
          ],
        },
        with: { rules: { where: { deletedAt: { isNull: true } } } },
      })))

      // 3. bulk price-lists + rules (one query for every list referenced by the rows).
      const listIds = [...new Set(rows.map(r => r.priceListId).filter((id): id is number => id !== null))]
      const lists = listIds.length > 0
        ? ((yield* (db.query.priceLists.findMany({
            where: { id: { in: listIds }, deletedAt: { isNull: true } },
            with: { rules: { where: { deletedAt: { isNull: true } } } },
          }))))
        : []
      const listMap = new Map(lists.map(l => [l.id, l]))

      const bySet = new Map<number, Candidate[]>()
      for (const p of rows) {
        const list = p.priceListId !== null ? listMap.get(p.priceListId) : undefined
        const cand = rowToCandidate(
          { priceId: p.id, amount: p.amount, currencyCode: p.currencyCode, priceListId: p.priceListId, rules: p.rules.map(r => ({ attribute: r.attribute, operator: r.operator, value: r.value as RuleValue, priority: r.priority })) },
          list ? toGateList(list) : null,
          at,
          ctx,
        )
        if (cand === null)
          continue
        const arr = bySet.get(p.priceSetId) ?? []
        arr.push(cand)
        bySet.set(p.priceSetId, arr)
      }
      for (const id of validIds)
        out.set(id, resolveCalculated(bySet.get(id) ?? [], ctx))
      return out
    }))

  return {
    createPriceSet,
    findPriceSet,
    findPriceSetById,
    findPriceSets,
    softDeletePriceSet,
    createPrice,
    findPriceById,
    findPriceRules,
    updatePrice,
    softDeletePrice,
    createPriceList,
    findPriceListById,
    findPriceList,
    findPriceLists,
    findPriceListRules,
    updatePriceList,
    softDeletePriceList,
    resolvePrice,
    resolvePrices,
  } satisfies PriceServiceImpl
})

export const layer = Layer.effect(PriceService, make)
