import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('products')
    .addColumn('id', 'text', col => col.primaryKey())
    .addColumn('title', 'text', col => col.notNull())
    .addColumn('handle', 'text', col => col.notNull())
    .addColumn('subtitle', 'text')
    .addColumn('description', 'text')
    .addColumn('is_giftcard', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('status', 'text', col => col.notNull().defaultTo('draft'))
    .addColumn('thumbnail', 'text')
    .addColumn('weight', 'text')
    .addColumn('length', 'text')
    .addColumn('height', 'text')
    .addColumn('width', 'text')
    .addColumn('origin_country', 'text')
    .addColumn('hs_code', 'text')
    .addColumn('mid_code', 'text')
    .addColumn('material', 'text')
    .addColumn('collection_id', 'text', col =>
      col.references('p_collections.id').onDelete('set null'))
    .addColumn('type_id', 'text', col =>
      col.references('p_types.id').onDelete('set null'))
    .addColumn('discountable', 'boolean', col => col.notNull().defaultTo(true))
    .addColumn('external_id', 'text')
    .addColumn('metadata', 'jsonb')
    .addColumn('created_at', 'timestamp', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamp', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('deleted_at', 'timestamp')
    .addCheckConstraint(
      'products_status_check',
      sql`status IN ('draft', 'proposed', 'published', 'rejected')`,
    )
    .execute()

  // Create indexes
  await db.schema
    .createIndex('products_handle_unique')
    .on('products')
    .column('handle')
    .unique()
    .where(sql.ref('deleted_at'), 'is', null)
    .execute()

  await db.schema
    .createIndex('products_type_id_idx')
    .on('products')
    .column('type_id')
    .where(sql.ref('deleted_at'), 'is', null)
    .execute()

  await db.schema
    .createIndex('products_collection_id_idx')
    .on('products')
    .column('collection_id')
    .where(sql.ref('deleted_at'), 'is', null)
    .execute()

  await db.schema
    .createIndex('products_deleted_at_idx')
    .on('products')
    .column('deleted_at')
    .execute()

  await db.schema
    .createIndex('products_status_idx')
    .on('products')
    .column('status')
    .where(sql.ref('deleted_at'), 'is', null)
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('products').execute()
}
