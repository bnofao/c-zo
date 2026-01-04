import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('p_option_values')
    .addColumn('id', 'text', col => col.primaryKey())
    .addColumn('value', 'text', col => col.notNull())
    .addColumn('option_id', 'text', col =>
      col.references('p_options.id').onDelete('cascade'))
    .addColumn('metadata', 'jsonb')
    .addColumn('created_at', 'timestamp', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamp', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('deleted_at', 'timestamp')
    .execute()

  // Create unique index on option_id + value
  await db.schema
    .createIndex('p_option_values_option_value_unique')
    .on('p_option_values')
    .columns(['option_id', 'value'])
    .unique()
    .where(sql.ref('deleted_at'), 'is', null)
    .execute()

  // Create index on option_id
  await db.schema
    .createIndex('p_option_values_option_id_idx')
    .on('p_option_values')
    .column('option_id')
    .where(sql.ref('deleted_at'), 'is', null)
    .execute()

  // Create index on deleted_at
  await db.schema
    .createIndex('p_option_values_deleted_at_idx')
    .on('p_option_values')
    .column('deleted_at')
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('p_option_values').execute()
}
