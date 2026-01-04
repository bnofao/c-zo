import type { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('products_images')
    .addColumn('product_id', 'text', col =>
      col.notNull().references('products.id').onDelete('cascade'))
    .addColumn('image_id', 'text', col =>
      col.notNull().references('images.id').onDelete('cascade'))
    .addColumn('variant_id', 'text', col =>
      col.references('p_variants.id').onDelete('cascade'))
    .addPrimaryKeyConstraint('products_images_pk', ['product_id', 'image_id'])
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('products_images').execute()
}
