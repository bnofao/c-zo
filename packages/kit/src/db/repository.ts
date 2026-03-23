import type { AnyColumn, AnyRelations, AnyTable, DBQueryConfig, DrizzleTypeError, EmptyRelations, Equal, GetColumnData, InferSelectModel, KnownKeysOnly, SQL, TableRelationalConfig, TablesRelationalConfig } from 'drizzle-orm'
import type { ExtractTablesWithRelations, TablesRelationalConfig as V1TablesRelationalConfig } from 'drizzle-orm/_relations'
import type {
  IndexColumn,
  PgAsyncRelationalQueryHKT,
  PgAsyncTransaction,
  PgInsertValue,
  PgQueryResultHKT,
  PgTable,
  PgUpdateSetSource,
  SelectedFieldsFlat,
} from 'drizzle-orm/pg-core'
import type { RelationalQueryBuilder } from 'drizzle-orm/pg-core/query-builders/query'
import type { Database } from './manager'
import { camelCase } from 'change-case'
import {
  and,
  getColumns,
  isNull,
  isSQLWrapper,
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

/** Base query config that adds tx and soft-delete control on top of Drizzle's DBQueryConfig. */
interface BaseQueryConfig<
  TFullSchema extends Record<string, unknown> = Record<string, never>,
  TRelations extends AnyRelations = EmptyRelations,
> {
  tx?: Transaction<TFullSchema, TRelations>
  /** If true, includes soft-deleted records (where deletedAt is not null) */
  includeDeleted?: boolean
}

/**
 * The find first query builder config (RQBv2).
 */
type FindFirstQueryConfig<
  TFullSchema extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
  TFields extends TableRelationalConfig,
  TConfig extends DBQueryConfig<'one', TSchema, TFields>,
> = BaseQueryConfig<TFullSchema, TSchema> & KnownKeysOnly<TConfig, DBQueryConfig<'one', TSchema, TFields>>

/**
 * The find many query builder config (RQBv2).
 */
type FindManyQueryConfig<
  TFullSchema extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
  TFields extends TableRelationalConfig,
  TConfig extends DBQueryConfig<'many', TSchema, TFields>,
> = BaseQueryConfig<TFullSchema, TSchema> & KnownKeysOnly<TConfig, DBQueryConfig<'many', TSchema, TFields>> & {
  paginate?: boolean
}

/**
 * The generic transaction session.
 */
export type Transaction<
  TFullSchema extends Record<string, unknown> = Record<string, never>,
  TRelations extends AnyRelations = EmptyRelations,
  TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
  TSchema extends V1TablesRelationalConfig = ExtractTablesWithRelations<TFullSchema>,
> = PgAsyncTransaction<TQueryResult, TFullSchema, TRelations, TSchema>

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

// ─── Repository ───────────────────────────────────────────────────────

export abstract class Repository<
  T extends Record<string, unknown> = Record<string, never>,
  R extends AnyRelations = EmptyRelations,
  U extends PgTable = PgTable,
  M extends keyof R = string,
  // V is kept for backward compatibility with subclasses (e.g. AppRepository<AppSchema, typeof apps, 'apps'>)
  // eslint-disable-next-line unused-imports/no-unused-vars
  V extends string = string,
> {
  /**
   * The DB instance.
   */
  db: Database<T, R>

  /**
   * The DB table.
   */
  table: U

  /**
   * The DB model name (camelCased table name for RQBv2 `db.query[modelName]`).
   */
  #modelName!: M

  constructor(db: Database<T, R>, model: M, table?: U) {
    this.db = db
    this.table = (table ?? db._.schema?.[model]) as unknown as U
    this.#modelName = model
  }

  /**
   * Access the RQBv2 query API for this model.
   * `db.query[modelName]` provides findFirst/findMany.
   */
  #queryApi(db: Database<T, R> | Transaction<T, R>) {
    const queryObj = db.query as { [K in M]: RelationalQueryBuilder<R, R[K], PgAsyncRelationalQueryHKT> }
    return queryObj[this.#modelName]
  }

  get columns() {
    return objectKeys(getColumns(this.table))
  }

  #hasColumn(name: string): boolean {
    return getColumnByName(this.table, name) !== undefined
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
            const keys = keyMatch[1]?.split(', ').map(key => camelCase(key.trim())) ?? []
            const values = valueMatch[1]?.split(', ').map(value => value.trim()) ?? []
            const fieldErrors: Record<string, string[]> = {}

            for (let i = 0; i < keys.length; i++) {
              fieldErrors[keys[i]!] = [`${keys[i]} '${values[i] ?? ''}' already exists`]
            }

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

    if (isSQLWrapper(originalWhere)) {
      config.where = and(originalWhere as SQL<unknown>, deletedAtFilter)
    }
    else if (originalWhere && typeof originalWhere === 'object') {
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
      tx?: Transaction<T, R>
    },
  ): Promise<SelectResultFields<TSelectedFields> | null>
  async create(
    value: PgInsertValue<U>,
    opts?: {
      onConflictDoNothing?: { target?: IndexColumn | IndexColumn[] }
      onConflictDoUpdate?: ConflictDoUpdateConfig
      tx?: Transaction<T, R>
    },
  ): Promise<InferSelectModel<U> | null>
  async create(
    value: PgInsertValue<U>,
    opts?: {
      columns?: SelectedFieldsFlat
      onConflictDoNothing?: { target?: IndexColumn | IndexColumn[] }
      onConflictDoUpdate?: ConflictDoUpdateConfig
      tx?: Transaction<T, R>
    },
  ): Promise<unknown> {
    try {
      await this.beforeCreate(value)

      // Set initial version for new records if table has version column
      const createValue = {
        ...value,
        ...(this.#hasColumn('version') ? { version: 1 } : {}),
      }
      let rows

      const qb = (opts?.tx || this.db).insert(this.table).values(createValue)

      if (opts?.onConflictDoUpdate) {
        const conflictConfig = {
          ...opts.onConflictDoUpdate,
          ...(this.#hasColumn('updatedAt')
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
        rows = await qb.returning(opts.columns as SelectedFieldsFlat) as unknown as InferSelectModel<U>[]
      }
      else {
        rows = await qb.returning() as unknown as InferSelectModel<U>[]
      }

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
      let rows
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
        rows = await qb.returning(opts?.columns) as unknown as InferSelectModel<U>[]
      }
      else {
        rows = await qb.returning() as unknown as InferSelectModel<U>[]
      }

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
    tx?: Transaction<T, R>
    soft?: boolean
  }): Promise<SelectResultFields<TSelectedFields>[] | null>
  async delete(opts?: {
    where?: SQL<unknown>
    tx?: Transaction<T, R>
    soft?: boolean
  }): Promise<InferSelectModel<U>[] | null>
  async delete<TSelectedFields extends SelectedFieldsFlat>(opts?: {
    columns?: TSelectedFields
    where?: SQL<unknown>
    tx?: Transaction<T, R>
    soft?: boolean
  }) {
    const where = opts?.where
    let rows: InferSelectModel<U>[]

    // Check if soft delete is requested and table has deletedAt column
    if (opts?.soft && this.#hasColumn('deletedAt')) {
      // Soft delete: set deletedAt timestamp
      const qb = (opts?.tx || this.db)
        .update(this.table)
        .set({ deletedAt: sql`NOW()` } as PgUpdateSetSource<U>)
        .where(where)

      if (opts?.columns) {
        rows = await qb.returning(opts.columns) as unknown as InferSelectModel<U>[]
      }
      else {
        rows = await qb.returning() as unknown as InferSelectModel<U>[]
      }
    }
    else {
      // Hard delete
      const qb = (opts?.tx || this.db).delete(this.table).where(where)

      if (opts?.columns) {
        rows = await qb.returning(opts?.columns) as unknown as InferSelectModel<U>[]
      }
      else {
        rows = await qb.returning() as unknown as InferSelectModel<U>[]
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
    tx?: Transaction<T, R>
  }): Promise<SelectResultFields<TSelectedFields>[]>
  async restore(opts?: {
    where?: SQL<unknown>
    tx?: Transaction<T, R>
  }): Promise<InferSelectModel<U>[]>
  async restore<TSelectedFields extends SelectedFieldsFlat>(opts?: {
    columns?: TSelectedFields
    where?: SQL<unknown>
    tx?: Transaction<T, R>
  }) {
    if (!this.#hasColumn('deletedAt')) {
      throw new Error('Table does not support soft delete (missing deletedAt column)')
    }

    let rows

    const where = opts?.where

    const qb = (opts?.tx || this.db)
      .update(this.table)
      .set({ deletedAt: null } as PgUpdateSetSource<U>)
      .where(where)

    if (opts?.columns) {
      rows = await qb.returning(opts.columns) as unknown as InferSelectModel<U>[]
    }
    else {
      rows = await qb.returning() as unknown as InferSelectModel<U>[]
    }

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
  async findFirst<TConfig extends DBQueryConfig<'one', R, R[M]>>(opts?: FindFirstQueryConfig<T, R, R[M], TConfig>) {
    const { tx, includeDeleted, ...config } = opts || {}
    const qb = tx || this.db

    // Apply soft-delete filter if table has deletedAt column and includeDeleted is not true
    const hasDeletedAt = this.#hasColumn('deletedAt')
    if (hasDeletedAt && !includeDeleted) {
      this.#applySoftDeleteFilter(config as Record<string, unknown>)
    }

    const row = await this.#queryApi(qb).findFirst(config as KnownKeysOnly<TConfig, DBQueryConfig<'one', R, R[M]>>)

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
  async findMany(opts?: FindManyQueryConfig<T, R, R[M], DBQueryConfig<'many', R, R[M]>>) {
    const { tx, includeDeleted, ...config } = opts || {}
    const qb = tx || this.db

    // Apply soft-delete filter if table has deletedAt column and includeDeleted is not true
    const hasDeletedAt = this.#hasColumn('deletedAt')
    if (hasDeletedAt && !includeDeleted) {
      this.#applySoftDeleteFilter(config as Record<string, unknown>)
    }

    const rows = await this.#queryApi(qb).findMany(config as KnownKeysOnly<DBQueryConfig<'many', R, R[M]>, DBQueryConfig<'many', R, R[M]>>)

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

  // ─── Update ─────────────────────────────────────────────────────────

  async update<TSelectedFields extends SelectedFieldsFlat>(
    value: PgUpdateSetSource<U>,
    opts: {
      columns: TSelectedFields
      where?: SQL<unknown>
      tx?: Transaction<T, R>
      expectedVersion?: number
    },
  ): Promise<SelectResultFields<TSelectedFields>[]>
  async update(
    value: PgUpdateSetSource<U>,
    opts?: {
      where?: SQL<unknown>
      tx?: Transaction<T, R>
      expectedVersion?: number
    },
  ): Promise<InferSelectModel<U>[]>
  async update<TSelectedFields extends SelectedFieldsFlat>(
    value: PgUpdateSetSource<U>,
    opts?: {
      columns?: TSelectedFields
      where?: SQL<unknown>
      tx?: Transaction<T, R>
      expectedVersion?: number
    },
  ) {
    try {
      let where: SQL<unknown> | undefined = opts?.where
      let rows
      const originalWhere = where

      await this.beforeUpdate(value)

      // Prepare update values
      const updateValues: Record<string, unknown> = {
        ...value,
        ...(this.#hasColumn('updatedAt')
          ? { updatedAt: sql`NOW()` }
          : {}),
      }

      // Handle optimistic locking if version column exists
      const hasVersionColumn = this.#hasColumn('version')
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
        rows = await qb.returning(opts?.columns) as unknown as InferSelectModel<U>[]
      }
      else {
        rows = await qb.returning() as unknown as InferSelectModel<U>[]
      }

      // Check for optimistic lock failure
      if (rows.length === 0 && opts?.expectedVersion !== undefined && hasVersionColumn) {
        const [current] = originalWhere
          ? await (opts?.tx || this.db).select().from(this.table as PgTable).where(originalWhere).limit(1)
          : []
        const currentRecord = current as Record<string, unknown> | undefined
        const entityId = String(currentRecord?.id ?? currentRecord?.slug ?? 'unknown')
        throw new OptimisticLockError(
          entityId,
          opts.expectedVersion,
          (currentRecord?.version as number | null) ?? null,
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
