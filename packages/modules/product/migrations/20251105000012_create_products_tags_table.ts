import type { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('products_tags')
    .addColumn('product_id', 'text', col =>
      col.notNull().references('products.id').onDelete('cascade'))
    .addColumn('product_tag_id', 'text', col =>
      col.notNull().references('p_tags.id').onDelete('cascade'))
    .addPrimaryKeyConstraint('products_tags_pk', ['product_id', 'product_tag_id'])
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('products_tags').execute()
}
