import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('images')
    .addColumn('id', 'text', col => col.primaryKey())
    .addColumn('url', 'text', col => col.notNull())
    .addColumn('rank', 'integer', col => col.notNull().defaultTo(0))
    .addColumn('metadata', 'jsonb')
    .addColumn('created_at', 'timestamp', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamp', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('deleted_at', 'timestamp')
    .execute()

  // Create indexes
  await db.schema
    .createIndex('images_url_idx')
    .on('images')
    .column('url')
    .where(sql.ref('deleted_at'), 'is', null)
    .execute()

  await db.schema
    .createIndex('images_deleted_at_idx')
    .on('images')
    .column('deleted_at')
    .execute()

  await db.schema
    .createIndex('images_rank_idx')
    .on('images')
    .column('rank')
    .where(sql.ref('deleted_at'), 'is', null)
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('images').execute()
}

