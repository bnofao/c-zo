import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('p_variants')
    .addColumn('id', 'text', col => col.primaryKey())
    .addColumn('title', 'text', col => col.notNull())
    .addColumn('sku', 'text')
    .addColumn('barcode', 'text')
    .addColumn('ean', 'text')
    .addColumn('upc', 'text')
    .addColumn('allow_backorder', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('manage_inventory', 'boolean', col => col.notNull().defaultTo(true))
    .addColumn('hs_code', 'text')
    .addColumn('origin_country', 'text')
    .addColumn('mid_code', 'text')
    .addColumn('material', 'text')
    .addColumn('thumbnail', 'text')
    .addColumn('weight', 'integer')
    .addColumn('length', 'integer')
    .addColumn('height', 'integer')
    .addColumn('width', 'integer')
    .addColumn('variant_rank', 'integer', col => col.defaultTo(0))
    .addColumn('product_id', 'text', col =>
      col.references('products.id').onDelete('cascade'))
    .addColumn('metadata', 'jsonb')
    .addColumn('created_at', 'timestamp', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamp', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('deleted_at', 'timestamp')
    .execute()

  // Create unique indexes on identifiers
  await db.schema
    .createIndex('p_variants_ean_unique')
    .on('p_variants')
    .column('ean')
    .unique()
    .where(sql.ref('deleted_at'), 'is', null)
    .execute()

  await db.schema
    .createIndex('p_variants_upc_unique')
    .on('p_variants')
    .column('upc')
    .unique()
    .where(sql.ref('deleted_at'), 'is', null)
    .execute()

  await db.schema
    .createIndex('p_variants_sku_unique')
    .on('p_variants')
    .column('sku')
    .unique()
    .where(sql.ref('deleted_at'), 'is', null)
    .execute()

  await db.schema
    .createIndex('p_variants_barcode_unique')
    .on('p_variants')
    .column('barcode')
    .unique()
    .where(sql.ref('deleted_at'), 'is', null)
    .execute()

  // Create regular indexes
  await db.schema
    .createIndex('p_variants_product_id_idx')
    .on('p_variants')
    .column('product_id')
    .where(sql.ref('deleted_at'), 'is', null)
    .execute()

  await db.schema
    .createIndex('p_variants_deleted_at_idx')
    .on('p_variants')
    .column('deleted_at')
    .execute()

  await db.schema
    .createIndex('p_variants_id_product_id_idx')
    .on('p_variants')
    .columns(['id', 'product_id'])
    .where(sql.ref('deleted_at'), 'is', null)
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('p_variants').execute()
}
