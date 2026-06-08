import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { Relations } from '../database/relations'
import { DrizzleDb, OptimisticLockError, optimisticUpdate } from '@czo/kit/db'
import { sql } from 'drizzle-orm'
import { Context, Data, Effect, Layer } from 'effect'
import { locales as localesTable } from '../database/schema'

// ─── Tagged errors ────────────────────────────────────────────────────────────

export class LocaleNotFound extends Data.TaggedError('LocaleNotFound') {
  readonly code = 'LOCALE_NOT_FOUND'
  get message() { return 'Locale not found' }
}

export class LocaleCodeTaken extends Data.TaggedError('LocaleCodeTaken')<{ readonly localeCode: string }> {
  readonly code = 'LOCALE_CODE_TAKEN'
  get message() { return `Locale '${this.localeCode}' already exists` }
}

export class LocaleDbFailed extends Data.TaggedError('LocaleDbFailed')<{ readonly cause: unknown }> {
  readonly code = 'LOCALE_DB_FAILED'
  get message() { return 'Database operation failed' }
}

// ─── Domain model ─────────────────────────────────────────────────────────────

export type Locale = InferSelectModel<typeof localesTable>

// ─── Input types ──────────────────────────────────────────────────────────────

export interface CreateLocaleInput { code: string, name: string, isActive?: boolean }
export interface UpdateLocaleInput { name?: string, isActive?: boolean }

// ─── Service contract (Effect Tag) ───────────────────────────────────────────

export class LocaleService extends Context.Service<LocaleService, {
  readonly createLocale: (input: CreateLocaleInput) => Effect.Effect<Locale, LocaleCodeTaken | LocaleDbFailed>
  readonly updateLocale: (id: number, expectedVersion: number, input: UpdateLocaleInput) => Effect.Effect<Locale, LocaleNotFound | OptimisticLockError | LocaleDbFailed>
  readonly softDeleteLocale: (id: number, expectedVersion: number) => Effect.Effect<Locale, LocaleNotFound | OptimisticLockError | LocaleDbFailed>
  readonly findLocaleById: (id: number) => Effect.Effect<Locale, LocaleNotFound | LocaleDbFailed>
  readonly findLocaleByCode: (code: string) => Effect.Effect<Locale | null, LocaleDbFailed>
  readonly listLocales: (opts: { activeOnly?: boolean, query?: Record<string, unknown> }) => Effect.Effect<ReadonlyArray<Locale>, LocaleDbFailed>
  readonly getDefaultLocale: () => Effect.Effect<Locale | null, LocaleDbFailed>
  readonly defaultLocaleCode: string
}>()('@czo/translation/LocaleService') {}

type LocaleServiceImpl = Context.Service.Shape<typeof LocaleService>

// ─── Implementation ───────────────────────────────────────────────────────────

export function make(defaultLocaleCode: string) {
  return Effect.gen(function* () {
    const db = (yield* DrizzleDb) as Database<Relations>

    const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
      eff.pipe(Effect.mapError(cause => new LocaleDbFailed({ cause })))

    const dbErrOptimistic = <A, E>(eff: Effect.Effect<A, E>) =>
      eff.pipe(
        Effect.mapError(e => e instanceof OptimisticLockError ? e : new LocaleDbFailed({ cause: e })),
      )

    const findLocaleByCode: LocaleServiceImpl['findLocaleByCode'] = code =>
      dbErr(db.query.locales.findFirst({
        where: { code, deletedAt: { isNull: true } },
      }).pipe(Effect.map(row => row ?? null)))

    const findLocaleById: LocaleServiceImpl['findLocaleById'] = id =>
      Effect.gen(function* () {
        const row = yield* dbErr(db.query.locales.findFirst({
          where: { id, deletedAt: { isNull: true } },
        }))
        if (!row)
          return yield* Effect.fail(new LocaleNotFound())
        return row as Locale
      })

    const createLocale: LocaleServiceImpl['createLocale'] = input =>
      Effect.gen(function* () {
        const existing = yield* findLocaleByCode(input.code)
        if (existing)
          return yield* Effect.fail(new LocaleCodeTaken({ localeCode: input.code }))
        const [row] = yield* dbErr(
          db
            .insert(localesTable)
            .values({ code: input.code, name: input.name, isActive: input.isActive ?? true })
            .returning(),
        )
        return row!
      })

    const updateLocale: LocaleServiceImpl['updateLocale'] = (id, expectedVersion, input) =>
      Effect.gen(function* () {
        const existing = yield* findLocaleById(id)
        return yield* dbErrOptimistic(
          optimisticUpdate({
            db,
            table: localesTable,
            id,
            expectedVersion,
            values: {
              name: input.name ?? existing.name,
              isActive: input.isActive === undefined ? existing.isActive : input.isActive,
            },
          }),
        )
      })

    const softDeleteLocale: LocaleServiceImpl['softDeleteLocale'] = (id, expectedVersion) =>
      Effect.gen(function* () {
        yield* findLocaleById(id)
        return yield* dbErrOptimistic(
          optimisticUpdate({
            db,
            table: localesTable,
            id,
            expectedVersion,
            values: { deletedAt: sql`NOW()` as any },
          }),
        )
      })

    const listLocales: LocaleServiceImpl['listLocales'] = (opts) => {
      const where = opts.activeOnly
        ? { deletedAt: { isNull: true }, isActive: true }
        : { deletedAt: { isNull: true } }
      // Merge the relay-connection `query` (limit/offset/orderBy/columns) so the
      // Pothos drizzle connection can build cursors; AND the where clauses.
      const q = opts.query ?? {}
      const mergedWhere = q.where ? { AND: [where, q.where] } : where
      return dbErr(db.query.locales.findMany({ ...q, where: mergedWhere } as any))
    }

    const getDefaultLocale: LocaleServiceImpl['getDefaultLocale'] = () =>
      findLocaleByCode(defaultLocaleCode)

    return {
      createLocale,
      updateLocale,
      softDeleteLocale,
      findLocaleById,
      findLocaleByCode,
      listLocales,
      getDefaultLocale,
      defaultLocaleCode,
    } satisfies LocaleServiceImpl
  })
}

export const layer = (defaultLocaleCode: string) => Layer.effect(LocaleService, make(defaultLocaleCode))
