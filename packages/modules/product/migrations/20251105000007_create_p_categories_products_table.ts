import type { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('p_categories_products')
    .addColumn('product_id', 'text', col =>
      col.notNull().references('products.id').onDelete('cascade'))
    .addColumn('p_categories_id', 'text', col =>
      col.notNull().references('p_categories.id').onDelete('cascade'))
    .addPrimaryKeyConstraint('p_categories_products_pk', ['product_id', 'p_categories_id'])
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('p_categories_products').execute()
}
