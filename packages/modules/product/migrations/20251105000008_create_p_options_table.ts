import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('p_options')
    .addColumn('id', 'text', col => col.primaryKey())
    .addColumn('title', 'text', col => col.notNull())
    .addColumn('product_id', 'text', col =>
      col.notNull().references('products.id').onDelete('cascade'))
    .addColumn('metadata', 'jsonb')
    .addColumn('created_at', 'timestamp', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamp', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('deleted_at', 'timestamp')
    .execute()

  // Create unique index on product_id + title
  await db.schema
    .createIndex('p_options_product_title_unique')
    .on('p_options')
    .columns(['product_id', 'title'])
    .unique()
    .where(sql.ref('deleted_at'), 'is', null)
    .execute()

  // Create index on product_id
  await db.schema
    .createIndex('p_options_product_id_idx')
    .on('p_options')
    .column('product_id')
    .where(sql.ref('deleted_at'), 'is', null)
    .execute()

  // Create index on deleted_at
  await db.schema
    .createIndex('p_options_deleted_at_idx')
    .on('p_options')
    .column('deleted_at')
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('p_options').execute()
}
