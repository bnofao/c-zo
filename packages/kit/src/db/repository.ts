import type { AnyColumn, AnyTable, DBQueryConfig, DrizzleTypeError, Equal, GetColumnData, InferSelectModel, SQL } from 'drizzle-orm'
import type {
  IndexColumn,
  PgAsyncTransaction,
  PgInsertValue,
  PgQueryResultHKT,
  PgTable,
  PgUpdateSetSource,
  SelectedFieldsFlat,
} from 'drizzle-orm/pg-core'
import type { Database } from './manager'
import { camelCase } from 'change-case'
import {
  and,
  asc,
  desc,
  getColumns,
  isNull,
  sql,
} from 'drizzle-orm'
import pg from 'pg'

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Retrieves the keys of the given object as an array of its own keyof type,
 * ensuring the keys are typed according to the keys actually present in `O`.
 *
 * @template O - The object type from which keys are extracted.
 * @param obj - The object whose keys are to be retrieved.
 * @returns An array of keys of the object `O`.
 */
export function objectKeys<O extends object>(obj: O): (keyof O)[] {
  return Object.keys(obj) as (keyof O)[]
}

/**
 * Access a drizzle table's Symbol(drizzle:Name) value safely.
 */
function getTableSymbolValue(table: PgTable, symbolName: string): string | undefined {
  for (const sym of Object.getOwnPropertySymbols(table)) {
    if (sym.toString() === symbolName) {
      return (table as unknown as Record<symbol, string>)[sym]
    }
  }
  return undefined
}

/**
 * Access a column from a table by name (bypasses strict PgTable index signature).
 */
function getColumnByName(table: PgTable, name: string): AnyColumn | undefined {
  return (table as unknown as Record<string, AnyColumn>)[name]
}

// ─── Error Classes ────────────────────────────────────────────────────

/**
 * The database error class.
 */
export class DatabaseError extends Error {
  fieldErrors!: Record<string, string[] | undefined>

  constructor(
    message: string,
    fieldErrors?: Record<string, string[] | undefined>,
  ) {
    super(message)

    if (fieldErrors) {
      this.fieldErrors = fieldErrors
    }
  }
}

/**
 * Error thrown when optimistic locking fails due to version mismatch.
 */
export class OptimisticLockError extends Error {
  readonly entityId: string
  readonly expectedVersion: number
  readonly actualVersion: number | null

  constructor(
    entityId: string,
    expectedVersion: number,
    actualVersion: number | null,
  ) {
    super(
      `Optimistic lock failed: entity ${entityId} expected version ${expectedVersion}, `
      + `but found ${actualVersion === null ? 'deleted record' : `version ${actualVersion}`}`,
    )
    this.name = 'OptimisticLockError'
    this.entityId = entityId
    this.expectedVersion = expectedVersion
    this.actualVersion = actualVersion
  }
}

// ─── Config Types ─────────────────────────────────────────────────────

/** Base query config that accepts both RQBv2 object filters and raw SQL for `where`. */
interface BaseQueryConfig {
  where?: DBQueryConfig['where'] | SQL<unknown>
  columns?: DBQueryConfig['columns']
  extras?: DBQueryConfig['extras']
  with?: DBQueryConfig['with']
  orderBy?: DBQueryConfig['orderBy']
  offset?: number
  tx?: Transaction
  /** If true, includes soft-deleted records (where deletedAt is not null) */
  includeDeleted?: boolean
}

/**
 * The find first query builder config (RQBv2).
 */
export interface FindFirstQueryConfig extends BaseQueryConfig {}

/**
 * The find many query builder config (RQBv2).
 */
export interface FindManyQueryConfig extends BaseQueryConfig {
  limit?: number
}

/**
 * The paginate by offset query builder config.
 */
export type PaginateByOffsetQueryConfig = Omit<
  DBQueryConfig & {
    page?: number
    perPage?: number
    sortBy?: string
    sortDirection?: 'asc' | 'desc'
    tx?: Transaction
    /** If true, includes soft-deleted records (where deletedAt is not null) */
    includeDeleted?: boolean
  },
  'limit' | 'offset'
>

/**
 * The generic transaction session.
 */
// eslint-disable-next-line ts/no-empty-object-type
export type Transaction = PgAsyncTransaction<PgQueryResultHKT, {}, {}>

/**
 * Conflict do-update config used by Repository.create().
 * Decoupled from drizzle's internal PgInsertOnConflictDoUpdateConfig
 * which now requires the full insert builder type — not just the table.
 */
interface ConflictDoUpdateConfig {
  target: IndexColumn | IndexColumn[]
  set: Record<string, unknown>
  where?: SQL
  targetWhere?: SQL
  setWhere?: SQL
}

// ─── Internal utility types ───────────────────────────────────────────

type SimplifyShallow<T> = {
  [K in keyof T]: T[K];
} & {}

type SelectResultField<
  T,
  TDeep extends boolean = true,
> = T extends DrizzleTypeError<infer _TMessage>
  ? T
  : T extends AnyTable<infer _TTableConfig>
    ? Equal<TDeep, true> extends true
      ? SelectResultField<T['_']['columns'], false>
      : never
    : T extends AnyColumn
      ? GetColumnData<T>
      : T extends SQL | SQL.Aliased
        ? T['_']['type']
        : T extends Record<string, unknown>
          ? SelectResultFields<T, true>
          : never

type SelectResultFields<
  TSelectedFields,
  TDeep extends boolean = true,
> = SimplifyShallow<{
  [Key in keyof TSelectedFields & string]: SelectResultField<
    TSelectedFields[Key],
    TDeep
  >;
}>

/**
 * Type for the RQBv2 query API accessed via db.query[modelName].
 * Uses structural typing to avoid depending on drizzle's internal types.
 */
interface RelationalQueryApi<TRow> {
  findFirst: (config: Record<string, unknown>) => Promise<TRow | undefined>
  findMany: (config: Record<string, unknown>) => Promise<TRow[]>
}

// ─── Repository ───────────────────────────────────────────────────────

export abstract class Repository<
  T extends Record<string, unknown>,
  U extends PgTable,
  // V is kept for backward compatibility with subclasses (e.g. AppRepository<AppSchema, typeof apps, 'apps'>)
  // eslint-disable-next-line unused-imports/no-unused-vars
  V extends string = string,
> {
  /**
   * The DB instance.
   */
  db: Database<T>

  /**
   * The DB table.
   */
  table: U

  /**
   * The DB model name (camelCased table name for RQBv2 `db.query[modelName]`).
   */
  #modelName!: string

  constructor(db: Database<T>, table: U) {
    this.db = db
    this.table = table

    const tableName = getTableSymbolValue(table, 'Symbol(drizzle:Name)')
    if (tableName) {
      // Replace graphile-worker's table prefix.
      this.#modelName = camelCase(tableName.replace('_private_', ''))
    }
  }

  /**
   * Access the RQBv2 query API for this model.
   * `db.query[modelName]` provides findFirst/findMany.
   */
  #queryApi(db: Database<T> | Transaction): RelationalQueryApi<InferSelectModel<U>> {
    const queryObj = (db as unknown as { query: Record<string, RelationalQueryApi<InferSelectModel<U>>> }).query
    return queryObj[this.#modelName]!
  }

  get columns() {
    return objectKeys(getColumns(this.table))
  }

  /**
   * Asynchronously invalidates the storage cache/object for the provided rows.
   */
  async #cleanUpStorage(rows: Array<InferSelectModel<U>>): Promise<void> {
    const promises: Promise<unknown>[] = []

    rows.forEach((row) => {
      Object.values(row).forEach((value) => {
        if (
          value
          && typeof value === 'object'
          && 'key' in value
          && 'name' in value
          && 'url' in value
          && value.key
        ) {
          // promises.push(cache.expire(CACHE_KEYS.storage(value.key)));
          // promises.push(storage.delete(value.key));
        }
      })
    })

    await Promise.all(promises)
  }

  /**
   * Convert the unknown error to DatabaseError class with best efforts.
   */
  #toDatabaseError(err: unknown) {
    if (err instanceof pg.DatabaseError) {
      switch (err.code) {
        case '23505': {
          const keyRegex = /Key \(([^=]+)\)=/
          const valueRegex = /=\(([^)]+)\)/
          const keyMatch = err.detail?.match(keyRegex)
          const valueMatch = err.detail?.match(valueRegex)

          if (keyMatch && valueMatch) {
            const keys = keyMatch?.[1]?.split(', ').map(key => key.trim())
            // eslint-disable-next-line unused-imports/no-unused-vars
            const values = valueMatch?.[1]
              ?.split(', ')
              .map(value => value.trim())
            const fieldErrors: Record<string, string[]> = {}
            // eslint-disable-next-line unused-imports/no-unused-vars
            const isComposite = keys?.length && keys.length > 1

            // TODO: Finish up composite key error handling.

            return new DatabaseError(err.message, fieldErrors)
          }
        }
      }
    }

    return err
  }

  /**
   * Apply soft-delete filter to a RQBv2 config.
   * Merges an `isNull(deletedAt)` condition into the where clause.
   */
  #applySoftDeleteFilter(config: Record<string, unknown>): void {
    const deletedAtCol = getColumnByName(this.table, 'deletedAt')
    if (!deletedAtCol)
      return

    const deletedAtFilter = isNull(deletedAtCol)
    const originalWhere = config.where

    if (originalWhere && typeof originalWhere === 'object' && 'queryChunks' in originalWhere) {
      // SQL where — combine with AND
      config.where = and(originalWhere as SQL<unknown>, deletedAtFilter)
    }
    else if (originalWhere && typeof originalWhere === 'object') {
      // RQBv2 object-style where — add RAW for deletedAt
      config.where = { ...(originalWhere as Record<string, unknown>), RAW: () => deletedAtFilter }
    }
    else {
      config.where = { RAW: () => deletedAtFilter }
    }
  }

  // ─── Hooks ──────────────────────────────────────────────────────────

  async beforeCreate(_: PgInsertValue<U>): Promise<void> {}
  async afterCreate(_: InferSelectModel<U>): Promise<InferSelectModel<U>> { return _ }
  async afterDelete(_: InferSelectModel<U>): Promise<void> {}

  /**
   * A hook that is invoked right before returning to the caller which applies to:
   * findFirst(), findMany(), paginateByOffset()
   */
  async afterFind(_: InferSelectModel<U>) {}

  async beforeUpdate(_: PgUpdateSetSource<U>) {}
  async afterUpdate(_: InferSelectModel<U>) {}

  // ─── Create ─────────────────────────────────────────────────────────

  async create<TSelectedFields extends SelectedFieldsFlat>(
    value: PgInsertValue<U>,
    opts: {
      columns: TSelectedFields
      onConflictDoNothing?: { target?: IndexColumn | IndexColumn[] }
      onConflictDoUpdate?: ConflictDoUpdateConfig
      tx?: Transaction
    },
  ): Promise<SelectResultFields<TSelectedFields> | null>
  async create(
    value: PgInsertValue<U>,
    opts?: {
      onConflictDoNothing?: { target?: IndexColumn | IndexColumn[] }
      onConflictDoUpdate?: ConflictDoUpdateConfig
      tx?: Transaction
    },
  ): Promise<InferSelectModel<U> | null>
  async create(
    value: PgInsertValue<U>,
    opts?: {
      columns?: SelectedFieldsFlat
      onConflictDoNothing?: { target?: IndexColumn | IndexColumn[] }
      onConflictDoUpdate?: ConflictDoUpdateConfig
      tx?: Transaction
    },
  ): Promise<unknown> {
    try {
      await this.beforeCreate(value)

      // Set initial version for new records if table has version column
      const createValue = {
        ...value,
        ...(Object.keys(this.table).includes('version') ? { version: 1 } : {}),
      }

      const qb = (opts?.tx || this.db).insert(this.table).values(createValue)

      if (opts?.onConflictDoUpdate) {
        const conflictConfig = {
          ...opts.onConflictDoUpdate,
          ...(Object.keys(this.table).includes('updatedAt')
            ? {
                set: {
                  ...opts.onConflictDoUpdate.set,
                  updatedAt: sql`NOW()`,
                },
              }
            : {}),
        }
        // The drizzle v1 onConflictDoUpdate expects its own internal type,
        // but structurally our ConflictDoUpdateConfig is compatible.
        ;(qb as unknown as { onConflictDoUpdate: (c: ConflictDoUpdateConfig) => void }).onConflictDoUpdate(conflictConfig)
      }
      else if (opts?.onConflictDoNothing) {
        qb.onConflictDoNothing(opts.onConflictDoNothing)
      }

      if (opts && 'columns' in opts) {
        qb.returning(opts.columns as SelectedFieldsFlat)
      }
      else {
        qb.returning()
      }

      const rows = await qb as unknown as InferSelectModel<U>[]

      if (rows.length < 1) {
        return null
      }

      await this.afterCreate(rows[0]!)

      return rows[0]
    }
    catch (err) {
      throw this.#toDatabaseError(err)
    }
  }

  // ─── Create Many ────────────────────────────────────────────────────

  async createMany<TSelectedFields extends SelectedFieldsFlat>(
    value: PgInsertValue<U>[],
    opts: {
      columns: TSelectedFields
      tx?: Transaction
    },
  ): Promise<SelectResultFields<TSelectedFields>[]>
  async createMany(
    value: PgInsertValue<U>[],
    opts?: { tx?: Transaction },
  ): Promise<InferSelectModel<U>[]>
  async createMany<TSelectedFields extends SelectedFieldsFlat>(
    values: PgInsertValue<U>[],
    opts?: {
      columns?: TSelectedFields
      tx?: Transaction
    },
  ) {
    try {
      const qb = (opts?.tx || this.db).insert(this.table).values(
        await Promise.all(
          values
            .map((value) => {
              return async () => {
                await this.beforeCreate(value)
                return value
              }
            })
            .map(v => v()),
        ),
      )

      if (opts?.columns) {
        qb.returning(opts?.columns)
      }
      else {
        qb.returning()
      }

      const rows = await qb as unknown as InferSelectModel<U>[]

      if (rows.length < 1) {
        return []
      }

      await Promise.all(rows.map(async row => this.afterCreate(row)))

      return rows
    }
    catch (err) {
      throw this.#toDatabaseError(err)
    }
  }

  // ─── Delete ─────────────────────────────────────────────────────────

  async delete<TSelectedFields extends SelectedFieldsFlat>(opts: {
    columns: TSelectedFields
    where?: SQL<unknown>
    tx?: Transaction
    soft?: boolean
  }): Promise<SelectResultFields<TSelectedFields>[] | null>
  async delete(opts?: {
    where?: SQL<unknown>
    tx?: Transaction
    soft?: boolean
  }): Promise<InferSelectModel<U>[] | null>
  async delete<TSelectedFields extends SelectedFieldsFlat>(opts?: {
    columns?: TSelectedFields
    where?: SQL<unknown>
    tx?: Transaction
    soft?: boolean
  }) {
    const where = opts?.where

    // SQL where is runtime-compatible with RQBv2's findMany, cast through unknown
    const deletingRows = await this.findMany({
      ...(where ? { where: where as unknown as FindManyQueryConfig['where'] } : {}),
      tx: opts?.tx,
    })
    if (deletingRows.length > 0) {
      await this.#cleanUpStorage(deletingRows)
    }

    let rows: InferSelectModel<U>[]

    // Check if soft delete is requested and table has deletedAt column
    const hasDeletedAt = Object.keys(this.table).includes('deletedAt')
    if (opts?.soft && hasDeletedAt) {
      // Soft delete: set deletedAt timestamp
      const qb = (opts?.tx || this.db)
        .update(this.table)
        .set({ deletedAt: sql`NOW()` } as PgUpdateSetSource<U>)
        .where(where)

      if (opts?.columns) {
        qb.returning(opts.columns)
      }
      else {
        qb.returning()
      }

      rows = await qb as unknown as InferSelectModel<U>[]
    }
    else {
      // Hard delete
      const qb = (opts?.tx || this.db).delete(this.table).where(where)

      if (opts?.columns) {
        qb.returning(opts?.columns)
      }
      else {
        qb.returning()
      }

      rows = await qb as unknown as InferSelectModel<U>[]
    }

    if (rows.length < 1) {
      return []
    }

    await Promise.all(rows.map(async row => this.afterDelete(row)))

    return rows
  }

  // ─── Restore ────────────────────────────────────────────────────────

  async restore<TSelectedFields extends SelectedFieldsFlat>(opts: {
    columns: TSelectedFields
    where?: SQL<unknown>
    tx?: Transaction
  }): Promise<SelectResultFields<TSelectedFields>[]>
  async restore(opts?: {
    where?: SQL<unknown>
    tx?: Transaction
  }): Promise<InferSelectModel<U>[]>
  async restore<TSelectedFields extends SelectedFieldsFlat>(opts?: {
    columns?: TSelectedFields
    where?: SQL<unknown>
    tx?: Transaction
  }) {
    if (!Object.keys(this.table).includes('deletedAt')) {
      throw new Error('Table does not support soft delete (missing deletedAt column)')
    }

    const where = opts?.where

    const qb = (opts?.tx || this.db)
      .update(this.table)
      .set({ deletedAt: null } as PgUpdateSetSource<U>)
      .where(where)

    if (opts?.columns) {
      qb.returning(opts.columns)
    }
    else {
      qb.returning()
    }

    const rows = await qb as unknown as InferSelectModel<U>[]

    if (rows.length < 1) {
      return []
    }

    return rows
  }

  // ─── Find First ─────────────────────────────────────────────────────

  /**
   * Return the 1st record based on the config.
   * Uses RQBv2 `db.query[model].findFirst(...)` with object-style where filters.
   */
  async findFirst(opts?: FindFirstQueryConfig) {
    const { tx, includeDeleted, ...config } = opts || {}
    const qb = tx || this.db

    // Apply soft-delete filter if table has deletedAt column and includeDeleted is not true
    const hasDeletedAt = Object.keys(this.table).includes('deletedAt')
    if (hasDeletedAt && !includeDeleted) {
      this.#applySoftDeleteFilter(config as Record<string, unknown>)
    }

    const row = await this.#queryApi(qb).findFirst(config as Record<string, unknown>)

    if (!row) {
      return null
    }

    await this.afterFind(row)

    return row
  }

  // ─── Find Many ──────────────────────────────────────────────────────

  /**
   * Return all the records based on the config.
   * Uses RQBv2 `db.query[model].findMany(...)` with object-style where filters.
   */
  async findMany(opts?: FindManyQueryConfig) {
    const { tx, includeDeleted, ...config } = opts || {}
    const qb = tx || this.db

    // Apply soft-delete filter if table has deletedAt column and includeDeleted is not true
    const hasDeletedAt = Object.keys(this.table).includes('deletedAt')
    if (hasDeletedAt && !includeDeleted) {
      this.#applySoftDeleteFilter(config as Record<string, unknown>)
    }

    const rows = await this.#queryApi(qb).findMany(config as Record<string, unknown>)

    if (!rows || rows.length < 1) {
      return []
    }

    await Promise.all(
      rows
        .map((row: InferSelectModel<U>) => async () => {
          return this.afterFind(row)
        })
        .map((v: () => Promise<void>) => v()),
    )

    return rows
  }

  // ─── Paginate By Offset ─────────────────────────────────────────────

  async paginateByOffset(opts?: PaginateByOffsetQueryConfig) {
    const {
      page = 1,
      perPage = 10,
      sortBy,
      sortDirection = 'asc',
      ...config
    } = opts || {
      columns: undefined,
      extras: undefined,
      orderBy: undefined,
      tx: undefined,
      where: undefined,
      with: undefined,
    }
    const qb = config.tx || this.db

    let countWhere: SQL<unknown> | undefined
    if (config.where && typeof config.where === 'object' && 'queryChunks' in config.where) {
      countWhere = config.where as unknown as SQL<unknown>
    }

    if (sortBy) {
      const sortColumn = getColumnByName(this.table, sortBy)
      if (sortColumn) {
        // RQBv2 orderBy accepts callback or object-style, but the runtime also
        // supports SQL[] — cast through unknown at the type boundary
        ;(config as Record<string, unknown>).orderBy
          = sortDirection === 'asc'
            ? [asc(sortColumn)]
            : [desc(sortColumn)]
      }
    }

    const [rows, totals] = await Promise.all([
      this.findMany({
        ...config,
        offset: (page - 1) * perPage,
        limit: perPage + 1,
      }),
      qb
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(this.table as PgTable)
        .where(countWhere),
    ])

    const totalRows = totals[0]?.count ?? 0
    const next = rows.length > perPage
    if (next) {
      rows.pop()
    }

    return {
      rows,
      next,
      previous: page > 1,
      page,
      perPage,
      totalPages: Math.ceil(totalRows / perPage),
      totalRows,
    }
  }

  // ─── Update ─────────────────────────────────────────────────────────

  async update<TSelectedFields extends SelectedFieldsFlat>(
    value: PgUpdateSetSource<U>,
    opts: {
      columns: TSelectedFields
      where?: SQL<unknown>
      tx?: Transaction
      expectedVersion?: number
    },
  ): Promise<SelectResultFields<TSelectedFields>[]>
  async update(
    value: PgUpdateSetSource<U>,
    opts?: {
      where?: SQL<unknown>
      tx?: Transaction
      expectedVersion?: number
    },
  ): Promise<InferSelectModel<U>[]>
  async update<TSelectedFields extends SelectedFieldsFlat>(
    value: PgUpdateSetSource<U>,
    opts?: {
      columns?: TSelectedFields
      where?: SQL<unknown>
      tx?: Transaction
      expectedVersion?: number
    },
  ) {
    try {
      let where: SQL<unknown> | undefined = opts?.where
      const originalWhere = where

      await this.beforeUpdate(value)

      // Prepare update values
      const updateValues: Record<string, unknown> = {
        ...value,
        ...(Object.keys(this.table).includes('updatedAt')
          ? { updatedAt: sql`NOW()` }
          : {}),
      }

      // Handle optimistic locking if version column exists
      const hasVersionColumn = Object.keys(this.table).includes('version')
      if (hasVersionColumn) {
        const versionCol = getColumnByName(this.table, 'version')!
        // Always increment version on update
        updateValues.version = sql`${versionCol} + 1`

        if (opts?.expectedVersion !== undefined) {
          const versionCheck = sql`${versionCol} = ${opts.expectedVersion}`
          where = where ? sql`${where} AND ${versionCheck}` : versionCheck
        }
      }

      const qb = (opts?.tx || this.db)
        .update(this.table)
        .set(updateValues as PgUpdateSetSource<U>)
        .where(where)

      if (opts?.columns) {
        qb.returning(opts?.columns)
      }
      else {
        qb.returning()
      }

      const rows = await qb as unknown as InferSelectModel<U>[]

      // Check for optimistic lock failure
      if (rows.length === 0 && opts?.expectedVersion !== undefined && hasVersionColumn) {
        const current = await this.findFirst({
          ...(originalWhere ? { where: originalWhere as unknown as FindFirstQueryConfig['where'] } : {}),
          tx: opts?.tx,
        })
        const entityId = originalWhere?.toString() || 'unknown'
        throw new OptimisticLockError(
          entityId,
          opts.expectedVersion,
          (current as Record<string, unknown> | null)?.version as number | null ?? null,
        )
      }

      if (rows.length < 1) {
        return []
      }

      await Promise.all(rows.map(row => this.afterUpdate(row)))

      return rows
    }
    catch (err) {
      if (err instanceof OptimisticLockError) {
        throw err
      }
      throw this.#toDatabaseError(err)
    }
  }
}
