import type { AnyColumn, AnyTable, BuildQueryResult, DBQueryConfig, DrizzleTypeError, Equal, ExtractTablesWithRelations, GetColumnData, InferSelectModel, KnownKeysOnly, Relation, SQL } from 'drizzle-orm'
import type { NodePgClient } from 'drizzle-orm/node-postgres'
import type {
  IndexColumn,
  PgInsertBase,
  PgInsertOnConflictDoUpdateConfig,
  PgInsertValue,
  PgQueryResultHKT,
  PgTable,
  PgTableWithColumns,
  PgTransaction,
  PgUpdateSetSource,
  SelectedFieldsFlat,
} from 'drizzle-orm/pg-core'
import type { Pool } from 'pg'
import type { Database } from './manager'
import { camelCase } from 'change-case'
import {

  asc,
  createTableRelationsHelpers,
  desc,
  getOperators,
  getTableColumns,
  sql,
} from 'drizzle-orm'
import pg from 'pg'

/**
 * Retrieves the keys of the given object as an array of its own keyof type,
 * ensuring the keys are typed according to the keys actually present in `O`.
 *
 * @template O - The object type from which keys are extracted.
 * @param {O} obj - The object whose keys are to be retrieved.
 * @returns {(keyof O)[]} An array of keys of the object `O`.
 */
export function objectKeys<O extends object>(obj: O): (keyof O)[] {
  return Object.keys(obj) as (keyof O)[]
}

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

/**
 * The options for finding the first record.
 */
export type FindFirstOpts<T extends Record<string, unknown>> = KnownKeysOnly<
  T,
  FindFirstQueryConfig<T, keyof ExtractTablesWithRelations<T>>
>

/**
 * The options for finding many records.
 */
export type FindManyOpts<T extends Record<string, unknown>> = KnownKeysOnly<
  T,
  FindManyQueryConfig<T, keyof ExtractTablesWithRelations<T>>
>

/**
 * The options for paginating the records by offset.
 */
export type PaginateByOffsetOpts<T extends Record<string, unknown>>
  = KnownKeysOnly<
    T,
    PaginateByOffsetQueryConfig<T, keyof ExtractTablesWithRelations<T>>
  >

/**
 * The find first query builder config.
 */
export type FindFirstQueryConfig<
  T extends Record<string, unknown>,
  U extends keyof ExtractTablesWithRelations<T>,
> = Omit<
  DBQueryConfig<
    'many',
    true,
    ExtractTablesWithRelations<T>,
    ExtractTablesWithRelations<T>[U]
  >,
  'limit'
> & {
  tx?: Transaction<T>
  /** If true, includes soft-deleted records (where deletedAt is not null) */
  includeDeleted?: boolean
}

/**
 * The find many query builder config.
 */
export type FindManyQueryConfig<
  T extends Record<string, unknown>,
  U extends keyof ExtractTablesWithRelations<T>,
> = DBQueryConfig<
  'many',
  true,
  ExtractTablesWithRelations<T>,
  ExtractTablesWithRelations<T>[U]
> & {
  tx?: Transaction<T>
  /** If true, includes soft-deleted records (where deletedAt is not null) */
  includeDeleted?: boolean
}

/**
 * The paginate by offset query builder config.
 */
export type PaginateByOffsetQueryConfig<
  T extends Record<string, unknown>,
  U extends keyof ExtractTablesWithRelations<T>,
> = Omit<
  DBQueryConfig<
    'many',
    true,
    ExtractTablesWithRelations<T>,
    ExtractTablesWithRelations<T>[U]
  > & {
    page?: number
    perPage?: number
    sortBy?: keyof ExtractTablesWithRelations<T>[U]['columns']
    sortDirection?: 'asc' | 'desc'
    tx?: Transaction<T>
    /** If true, includes soft-deleted records (where deletedAt is not null) */
    includeDeleted?: boolean
  },
  'limit' | 'offset'
>

/**
 * The generic transaction session.
 */
export type Transaction<T extends Record<string, unknown>> = PgTransaction<
  PgQueryResultHKT,
  T,
  ExtractTablesWithRelations<T>
>

type SimplifyShallow<T> = {
  [K in keyof T]: T[K];
} & {}

type SelectResultField<
  T,
  TDeep extends boolean = true,
> = T extends DrizzleTypeError<any>
  ? T
  : T extends AnyTable<any>
    ? Equal<TDeep, true> extends true
      ? SelectResultField<T['_']['columns'], false>
      : never
    : T extends AnyColumn
      ? GetColumnData<T>
      : T extends SQL | SQL.Aliased
        ? T['_']['type']
        : T extends Record<string, any>
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

export abstract class Repository<
  T extends Record<string, unknown>,
  U extends PgTableWithColumns<any>,
  V extends keyof ExtractTablesWithRelations<T>,
  // TSchema extends Record<string, unknown> = Record<string, never>,
  TClient extends NodePgClient = Pool,
> {
  /**
   * The DB instance.
   */
  db: Database<T, TClient>

  /**
   * The DB table.
   */
  table: U

  /**
   * The DB model name.
   */
  #modelName!: keyof ExtractTablesWithRelations<T>

  /**
   * The DB table relations.
   */
  #relations: Record<string, Relation>

  constructor(db: Database<T, TClient>, table: U) {
    this.db = db
    this.table = table

    Object.getOwnPropertySymbols(table).e((k) => {
      if (k.toString() === 'Symbol(drizzle:Name)') {
        // Replace graphile-worker's table prefix.
        this.#modelName = camelCase(
          table[k as unknown as string].replace('_private_', ''),
        ) as keyof ExtractTablesWithRelations<T>
      }
    })

    // @ts-expect-error unknown
    this.#relations = this.db.schema[`${this.#modelName}Relations`].config(
      createTableRelationsHelpers(this.table),
    )
  }

  get columns() {
    return objectKeys(getTableColumns(this.table))
  }

  /**
   * Asynchronously invalidates the storage cache/object for the provided rows.
   *
   * @param {Array<InferSelectModel<T>>} rows The rows to be checked for
   * cache/object invalidation.
   * @returns {Promise<any>} A promise that resolves once all relevant
   * cache/object entries have been invalidated.
   * @private
   */
  async #cleanUpStorage(rows: Array<InferSelectModel<U>>): Promise<any> {
    const promises: Promise<any>[] = []

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

  //   /**
  //    * Get the Sentry's tracing span attributes.
  //    *
  //    * @returns {StartSpanOptions} The Sentry options to start a tracing span.
  //    */
  //   #getSentryAttributes(): Partial<StartSpanOptions> {
  //     return {
  //       attributes: {
  //         'db.system': 'postgresql',
  //       },
  //       op: 'db.query',
  //     }
  //   }

  /**
   * Convert the unknown error to DatabaseError class with best efforts.
   *
   * @param {unknown} err The unknown error.
   * @returns {unknown | DatabaseError} error object
   */
  #toDatabaseError(err: unknown) {
    /**
     * Refer to the errors list at https://github.com/rails/rails/blob/main/activerecord/lib/active_record/connection_adapters/postgresql_adapter.rb#L769.
     */
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
            // keys.forEach((key, _idx) => {
            //  fieldErrors[
            //    `${pluralize.singular(this.#tableName)}.${camel(key)}`
            //  ] = [
            //    isComposite
            //      ? "app:errors.dbUniqueCompositeConstraint"
            //      : "app:errors.dbUniqueConstraint",
            //  ] satisfies I18nKeys[];
            // });

            return new DatabaseError(err.message, fieldErrors)
          }
        }
      }
    }

    return err
  }

  /**
   * A hook that is invoked right before a row is inserted.
   *
   * @param {PgInsertValue<U>} _
   * @returns {Promise<void>}
   */
  async beforeCreate(_: PgInsertValue<U>): Promise<void> {}

  /**
   * A hook that is invoked after a row is inserted and right before returning to the caller.
   *
   * @param {InferSelectModel<U>} _
   * @returns {Promise<InferSelectModel<U>>} model
   */
  async afterCreate(_: InferSelectModel<U>): Promise<InferSelectModel<U>> { return _ }

  /**
   * A hook that is invoked after a row is deleted and right before returning to the caller.
   *
   * @param {InferSelectModel<U>} _
   * @returns {Promise<void>}
   */
  async afterDelete(_: InferSelectModel<U>): Promise<void> {}

  /**
   * A hook that is invoked right before returning to the caller which applies to:
   *
   * - findFirst()
   * - findMany()
   * - paginateByOffset()
   *
   * The common use cases:
   *
   * - post process s3 storage path to a private s3 URL and cache it
   *
   * @param {InferSelectModel<U>} _
   * @returns {Promise<void>}
   */
  async afterFind(_: InferSelectModel<U>) {}

  /**
   * A hook that is invoked right before a row is updated.
   *
   * @param {PgUpdateSetSource<U>} _
   * @returns {Promise<void>}
   */
  async beforeUpdate(_: PgUpdateSetSource<U>) {}

  /**
   * A hook that is invoked after a row is updated and right before returning to the caller.
   *
   * @param {InferSelectModel<U>} _
   * @returns {Promise<void>}
   */
  async afterUpdate(_: InferSelectModel<U>) {}

  /**
   * Insert 1 value into the database.
   *
   * @param {PgInsertValue<U>} value The values to insert.
   * @param {object} [opts] The insert options.
   * @param {object} [opts.columns] The fields to return.
   * @param {Transaction<U>} [opts.tx] The SQL transaction.
   * @returns
   */
  async create<TSelectedFields extends SelectedFieldsFlat>(
    value: PgInsertValue<U>,
    opts: {
      columns: TSelectedFields
      onConflictDoNothing?: {
        target?: IndexColumn | IndexColumn[]
      }
      onConflictDoUpdate?: PgInsertOnConflictDoUpdateConfig<
        PgInsertBase<U, PgQueryResultHKT>
      >
      tx?: Transaction<T>
    },
  ): Promise<SelectResultFields<TSelectedFields> | null>
  async create(
    value: PgInsertValue<U>,
    opts?: {
      onConflictDoNothing?: {
        target?: IndexColumn | IndexColumn[]
      }
      onConflictDoUpdate?: PgInsertOnConflictDoUpdateConfig<
        PgInsertBase<U, PgQueryResultHKT>
      >
      tx?: Transaction<T>
    },
  ): Promise<InferSelectModel<U> | null>
  async create<TSelectedFields extends SelectedFieldsFlat | undefined>(
    value: PgInsertValue<U>,
    opts?: {
      columns?: TSelectedFields
      onConflictDoNothing?: {
        target?: IndexColumn | IndexColumn[]
      }
      onConflictDoUpdate?: PgInsertOnConflictDoUpdateConfig<
        PgInsertBase<U, PgQueryResultHKT>
      >
      tx?: Transaction<T>
    },
  ) {
    try {
      await this.beforeCreate(value)

      // Set initial version for new records if table has version column
      const createValue = {
        ...value,
        ...(Object.keys(this.table).includes('version') ? { version: 1 } : {}),
      }

      const qb = (opts?.tx || this.db).insert(this.table).values(createValue)

      if (opts?.onConflictDoUpdate) {
        qb.onConflictDoUpdate({
          ...opts.onConflictDoUpdate,
          ...(Object.keys(this.table).includes('updatedAt')
            ? {
                set: {
                  ...opts.onConflictDoUpdate.set,
                  updatedAt: sql`NOW()`,
                },
              }
            : {}),
        })
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

      const rows = await qb as any/* startSpan(
        {
          ...this.#getSentryAttributes(),
          name: qb.toSQL().sql,
        },
        async () => qb.,
      ) */

      if (rows.length < 1) {
        return null
      }

      await this.afterCreate(rows[0])

      return rows[0]
    }
    catch (err) {
      throw this.#toDatabaseError(err)
    }
  }

  /**
   * Insert many values into the database.
   *
   * @param {PgInsertValue<U>[]} values The values to insert.
   * @param {object} [opts] The insert options.
   * @param {object} [opts.columns] The columns to return.
   * @param {Transaction<T>} [opts.tx] The SQL transaction.
   * @returns
   */
  async createMany<TSelectedFields extends SelectedFieldsFlat>(
    value: PgInsertValue<U>[],
    opts: {
      columns: TSelectedFields
      tx?: Transaction<T>
    },
  ): Promise<SelectResultFields<TSelectedFields>[]>
  async createMany(
    value: PgInsertValue<U>[],
    opts?: { tx?: Transaction<T> },
  ): Promise<InferSelectModel<U>[]>
  async createMany<TSelectedFields extends SelectedFieldsFlat>(
    values: PgInsertValue<U>[],
    opts?: {
      columns?: TSelectedFields
      tx?: Transaction<T>
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

      const rows = await qb as any/* startSpan(
        {
          ...this.#getSentryAttributes(),
          name: qb.toSQL().sql,
        },
        async () => qb,
      ) */

      if (rows.length < 1) {
        return []
      }

      // @ts-expect-error force rows to any
      await Promise.all(rows.map(async row => this.afterCreate(row)))

      return rows
    }
    catch (err) {
      throw this.#toDatabaseError(err)
    }
  }

  /**
   * Delete the data rows in the database based on the where condition.
   *
   * @param {object} [opts] The delete options.
   * @param {object} [opts.columns] The columns to return.
   * @param {SQL<unknown>} [opts.where] The SQL where filter.
   * @param {Transaction<T>} [opts.tx] The SQL transaction.
   * @param {boolean} [opts.soft] If true, performs soft delete by setting deletedAt.
   * @returns
   */
  async delete<
    TSelectedFields extends SelectedFieldsFlat,
    QConfig extends FindManyQueryConfig<T, V>,
  >(opts: {
    columns: TSelectedFields
    where?: QConfig['where']
    tx?: Transaction<T>
    soft?: boolean
  }): Promise<SelectResultFields<TSelectedFields>[] | null>
  async delete<QConfig extends FindManyQueryConfig<T, V>>(opts?: {
    where?: QConfig['where']
    tx?: Transaction<T>
    soft?: boolean
  }): Promise<InferSelectModel<U>[] | null>
  async delete<
    TSelectedFields extends SelectedFieldsFlat,
    QConfig extends FindManyQueryConfig<T, V>,
  >(opts?: {
    columns?: TSelectedFields
    where?: QConfig['where']
    tx?: Transaction<T>
    soft?: boolean
  },
  ) {
    let where
    if (opts?.where) {
      if ('queryChunks' in opts.where) {
        where = opts.where
      }
      else if (typeof opts.where === 'function') {
        where = opts.where(getTableColumns(this.table), getOperators())
      }
    }

    const deletingRows = await this.findMany({ where, tx: opts?.tx })
    if (deletingRows.length > 0) {
      await this.#cleanUpStorage(deletingRows)
    }

    let rows: any[]

    // Check if soft delete is requested and table has deletedAt column
    const hasDeletedAt = Object.keys(this.table).includes('deletedAt')
    if (opts?.soft && hasDeletedAt) {
      // Soft delete: set deletedAt timestamp
      const qb = (opts?.tx || this.db)
        .update(this.table)
        .set({ deletedAt: sql`NOW()` } as any)
        .where(where)

      if (opts?.columns) {
        qb.returning(opts.columns)
      }
      else {
        qb.returning()
      }

      rows = await qb as any[]
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

      rows = await qb as any[]
    }

    if (rows.length < 1) {
      return []
    }

    await Promise.all(rows.map(async row => this.afterDelete(row)))

    return rows
  }

  /**
   * Restore soft-deleted records by unsetting deletedAt.
   *
   * @param {object} [opts] The restore options.
   * @param {object} [opts.columns] The columns to return.
   * @param {SQL<unknown>} [opts.where] The SQL where filter.
   * @param {Transaction<T>} [opts.tx] The SQL transaction.
   * @returns
   */
  async restore<
    TSelectedFields extends SelectedFieldsFlat,
    QConfig extends FindManyQueryConfig<T, V>,
  >(opts: {
    columns: TSelectedFields
    where?: QConfig['where']
    tx?: Transaction<T>
  }): Promise<SelectResultFields<TSelectedFields>[]>
  async restore<QConfig extends FindManyQueryConfig<T, V>>(opts?: {
    where?: QConfig['where']
    tx?: Transaction<T>
  }): Promise<InferSelectModel<U>[]>
  async restore<
    TSelectedFields extends SelectedFieldsFlat,
    QConfig extends FindManyQueryConfig<T, V>,
  >(opts?: {
    columns?: TSelectedFields
    where?: QConfig['where']
    tx?: Transaction<T>
  },
  ) {
    // Check if table supports soft delete
    if (!Object.keys(this.table).includes('deletedAt')) {
      throw new Error('Table does not support soft delete (missing deletedAt column)')
    }

    let where
    if (opts?.where) {
      if ('queryChunks' in opts.where) {
        where = opts.where
      }
      else if (typeof opts.where === 'function') {
        where = opts.where(getTableColumns(this.table), getOperators())
      }
    }

    const qb = (opts?.tx || this.db)
      .update(this.table)
      .set({ deletedAt: null } as any)
      .where(where)

    if (opts?.columns) {
      qb.returning(opts.columns)
    }
    else {
      qb.returning()
    }

    const rows = await qb as any

    if (rows.length < 1) {
      return []
    }

    return rows
  }

  /**
   * Return the 1st record based on the config.
   *
   * @param {FindFirstOpts<QConfig>} [opts] The find many options with pagination.
   * @param {object} [opts.columns] The columns to select.
   * @param {object} [opts.extras] The extras columns to return.
   * @param {object} [opts.offset] The offset of the returned rows.
   * @param {object} [opts.orderBy] The sorting order.
   * @param {SQL<unknown>} [opts.where] The where filter.
   * @param {object} [opts.with] The relations to include in query.
   * @param {Transaction<T>} [opts.tx] The SQL transaction.
   * @returns result
   */
  async findFirst<QConfig extends FindFirstQueryConfig<T, V>>(
    opts?: FindFirstOpts<QConfig>,
  ) {
    const { tx, includeDeleted, ...config } = opts || {}
    const qb = tx || this.db

    // Apply soft-delete filter if table has deletedAt column and includeDeleted is not true
    const hasDeletedAt = Object.keys(this.table).includes('deletedAt')
    if (hasDeletedAt && !includeDeleted) {
      const originalWhere = (config as any).where
      ;(config as any).where = (columns: any, operators: any) => {
        const deletedAtFilter = operators.isNull(columns.deletedAt)
        if (originalWhere) {
          if (typeof originalWhere === 'function') {
            return operators.and(originalWhere(columns, operators), deletedAtFilter)
          }
          return operators.and(originalWhere, deletedAtFilter)
        }
        return deletedAtFilter
      }
    }

    // @ts-expect-error unknown error
    const row = await qb.query[this.#modelName].findFirst(config || {})

    if (!row) {
      return null
    }

    await this.afterFind(row)

    return row as BuildQueryResult<
      ExtractTablesWithRelations<T>,
      ExtractTablesWithRelations<T>[V],
      QConfig
    >
  }

  /**
   * Return all the records based on the config.
   *
   * @param {FindManyOpts<QConfig>} [opts] The find many options.
   * @param {object} [opts.columns] The columns to select.
   * @param {object} [opts.extras] The extras columns to return.
   * @param {object} [opts.limit] The limit number of the returned rows.
   * @param {object} [opts.offset] The offset of the returned rows.
   * @param {object} [opts.orderBy] The sorting order.
   * @param {SQL<unknown>} [opts.where] The where filter.
   * @param {object} [opts.with] The relations to include in query.
   * @param {Transaction<T>} [opts.tx] The SQL transaction.
   * @returns result
   */
  async findMany<QConfig extends FindManyQueryConfig<T, V>>(
    opts?: FindManyOpts<QConfig>,
  ) {
    const { tx, includeDeleted, ...config } = opts || {}
    const qb = tx || this.db

    // Apply soft-delete filter if table has deletedAt column and includeDeleted is not true
    const hasDeletedAt = Object.keys(this.table).includes('deletedAt')
    if (hasDeletedAt && !includeDeleted) {
      const originalWhere = (config as any).where
      ;(config as any).where = (columns: any, operators: any) => {
        const deletedAtFilter = operators.isNull(columns.deletedAt)
        if (originalWhere) {
          if (typeof originalWhere === 'function') {
            return operators.and(originalWhere(columns, operators), deletedAtFilter)
          }
          return operators.and(originalWhere, deletedAtFilter)
        }
        return deletedAtFilter
      }
    }

    // @ts-expect-error unknown error
    const rows = await qb.query[this.#modelName].findMany(config || {}) /* startSpan(
      {
        ...this.#getSentryAttributes(),
        // @ts-expect-error
        name: qb.query[this.#modelName].findMany(config || {}).toSQL().sql,
      },
      // @ts-expect-error
      async () => qb.query[this.#modelName].findMany(config || {}),
    ) */

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

    return rows as unknown as BuildQueryResult<
      ExtractTablesWithRelations<T>,
      ExtractTablesWithRelations<T>[V],
      QConfig
    >[]
  }

  /**
   * Return the paginated records based on the config.
   *
   * @param {PaginateByOffsetOpts<QConfig>} [opts] The find many options with pagination.
   * @param {object} [opts.columns] The columns to select.
   * @param {object} [opts.extras] The extras columns to return.
   * @param {SQL<unknown>} [opts.orderBy] The order by SQL. Can be overwritten by sortBy.
   * @param {object} [opts.sortBy] The sorting column.
   * @param {object} [opts.sortDirection] The sorting direction.
   * @param {SQL<unknown>} [opts.where] The where filter.
   * @param {object} [opts.with] The relations to include in query.
   * @param {number} [opts.page] The current page.
   * @param {number} [opts.perPage] The current page size.
   * @param {Transaction<T>} [opts.tx] The SQL transaction.
   * @returns result
   */
  async paginateByOffset<QConfig extends PaginateByOffsetQueryConfig<T, V>>(
    opts?: PaginateByOffsetOpts<QConfig>,
  ) {
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
    if (config.where) {
      if ('queryChunks' in config.where) {
        countWhere = config.where
      }
      else if (typeof config.where === 'function') {
        countWhere = config.where(getTableColumns(this.table), getOperators())
      }
    }

    if (sortBy) {
      config.orderBy
        = sortDirection === 'asc'
          ? [
              asc(
                this.table[sortBy as keyof (typeof this.table)['_']['columns']],
              ),
            ]
          : [
              desc(
                this.table[sortBy as keyof (typeof this.table)['_']['columns']],
              ),
            ]
    }

    // const [rows, totals] = await startSpan(
    //   {
    //     ...this.#getSentryAttributes(),
    //     name: qb
    //       .select({ count: sql<number>`count(*)`.mapWith(Number) })
    //       .from(this.table)
    //       .where(countWhere)
    //       .toSQL()
    //       .sql,
    //   },
    //   async () =>
    //     Promise.all([
    //       this.findMany({
    //         ...config,
    //         offset: (page - 1) * perPage,
    //         limit: perPage + 1,
    //       }),
    //       qb
    //         .select({ count: sql<number>`count(*)`.mapWith(Number) })
    //         .from(this.table)
    //         .where(countWhere),
    //     ]),
    // )

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

  /**
   * Update the data rows in the database based on the where condition.
   *
   * @param {PgUpdateSetSource<U>} value The values to update to.
   * @param {object} [opts] The insert options.
   * @param {object} [opts.columns] The fields to return.
   * @param {SQL<unknown>} [opts.where] The SQL where filter.
   * @param {Transaction<T>} [opts.tx] The SQL transaction.
   * @returns
   */
  async update<
    TSelectedFields extends SelectedFieldsFlat,
    QConfig extends FindManyQueryConfig<T, V>,
  >(
    value: PgUpdateSetSource<U>,
    opts: {
      columns: TSelectedFields
      where?: QConfig['where']
      tx?: Transaction<T>
      expectedVersion?: number
    },
  ): Promise<SelectResultFields<TSelectedFields>[]>
  async update<QConfig extends FindManyQueryConfig<T, V>>(
    value: PgUpdateSetSource<U>,
    opts?: {
      where?: QConfig['where']
      tx?: Transaction<T>
      expectedVersion?: number
    },
  ): Promise<InferSelectModel<U>[]>
  async update<
    TSelectedFields extends SelectedFieldsFlat,
    QConfig extends FindManyQueryConfig<T, V>,
  >(
    value: PgUpdateSetSource<U>,
    opts?: {
      columns?: TSelectedFields
      where?: QConfig['where']
      tx?: Transaction<T>
      expectedVersion?: number
    },
  ) {
    try {
      let where: SQL<unknown> | undefined
      let originalWhere: SQL<unknown> | undefined

      if (opts?.where) {
        if ('queryChunks' in opts.where) {
          where = opts.where as SQL<unknown>
          originalWhere = where
        }
        else if (typeof opts.where === 'function') {
          where = opts.where(getTableColumns(this.table), getOperators())
          originalWhere = where
        }
      }

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
        // Always increment version on update
        updateValues.version = sql`${(this.table as any).version} + 1`

        if (opts?.expectedVersion !== undefined) {
          // Add version check to where clause
          const versionCheck = sql`${(this.table as any).version} = ${opts.expectedVersion}`
          where = where ? sql`${where} AND ${versionCheck}` : versionCheck
        }
      }

      const qb = (opts?.tx || this.db)
        .update(this.table)
        .set(updateValues as any)
        .where(where)

      if (opts?.columns) {
        qb.returning(opts?.columns)
      }
      else {
        qb.returning()
      }

      const rows = await qb as any

      // Check for optimistic lock failure
      if (rows.length === 0 && opts?.expectedVersion !== undefined && hasVersionColumn) {
        // Fetch current record to provide better error message
        const current = await this.findFirst({ where: originalWhere as any, tx: opts?.tx })
        const entityId = originalWhere?.toString() || 'unknown'
        throw new OptimisticLockError(
          entityId,
          opts.expectedVersion,
          (current as any)?.version ?? null,
        )
      }

      if (rows.length < 1) {
        return []
      }

      // @ts-expect-error force rows to any
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
