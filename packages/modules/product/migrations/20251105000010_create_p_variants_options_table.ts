import type { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('p_variants_options')
    .addColumn('variant_id', 'text', col =>
      col.notNull().references('p_variants.id').onDelete('cascade'))
    .addColumn('option_value_id', 'text', col =>
      col.notNull().references('p_option_values.id').onDelete('cascade'))
    .addPrimaryKeyConstraint('p_variants_options_pk', ['variant_id', 'option_value_id'])
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('p_variants_options').execute()
}
