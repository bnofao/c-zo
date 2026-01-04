import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('p_tags')
    .addColumn('id', 'text', col => col.primaryKey())
    .addColumn('value', 'text', col => col.notNull())
    .addColumn('metadata', 'jsonb')
    .addColumn('created_at', 'timestamp', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamp', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('deleted_at', 'timestamp')
    .execute()

  // Create unique index on value
  await db.schema
    .createIndex('p_tags_value_unique')
    .on('p_tags')
    .column('value')
    .unique()
    .where(sql.ref('deleted_at'), 'is', null)
    .execute()

  // Create index on deleted_at
  await db.schema
    .createIndex('p_tags_deleted_at_idx')
    .on('p_tags')
    .column('deleted_at')
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('p_tags').execute()
}
