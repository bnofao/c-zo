import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('p_categories')
    .addColumn('id', 'text', col => col.primaryKey())
    .addColumn('name', 'text', col => col.notNull())
    .addColumn('description', 'text', col => col.notNull().defaultTo(''))
    .addColumn('handle', 'text', col => col.notNull())
    .addColumn('is_active', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('is_internal', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('rank', 'integer', col => col.notNull().defaultTo(0))
    .addColumn('image_id', 'text', col =>
      col.references('images.id').onDelete('set null'))
    .addColumn('thumbnail', 'text')
    .addColumn('parent_id', 'text', col =>
      col.references('p_categories.id').onDelete('set null'))
    .addColumn('metadata', 'jsonb')
    .addColumn('created_at', 'timestamp', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamp', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('deleted_at', 'timestamp')
    .execute()

  // Create unique index on handle
  await db.schema
    .createIndex('p_categories_handle_unique')
    .on('p_categories')
    .column('handle')
    .unique()
    .where(sql.ref('deleted_at'), 'is', null)
    .execute()

  // Create index on parent_id for hierarchy queries
  await db.schema
    .createIndex('p_categories_parent_id_idx')
    .on('p_categories')
    .column('parent_id')
    .where(sql.ref('deleted_at'), 'is', null)
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('p_categories').execute()
}
