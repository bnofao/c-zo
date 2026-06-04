import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core'

export const attributeTypeEnum = pgEnum('attribute_type', [
  'DROPDOWN',
  'MULTISELECT',
  'PLAIN_TEXT',
  'RICH_TEXT',
  'NUMERIC',
  'BOOLEAN',
  'FILE',
  'REFERENCE',
  'SWATCH',
  'DATE',
  'DATE_TIME',
])

export const attributeUnitEnum = pgEnum('attribute_unit', [
  'KILOGRAM',
  'GRAM',
  'POUND',
  'OUNCE',
  'METER',
  'CENTIMETER',
  'MILLIMETER',
  'INCH',
  'FOOT',
  'LITER',
  'MILLILITER',
  'GALLON',
  'SQUARE_METER',
  'SQUARE_CENTIMETER',
  'PIECE',
  'PERCENT',
])

export const attributes = pgTable('attributes', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  organizationId: integer('organization_id'),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  type: attributeTypeEnum('type').notNull(),
  referenceEntity: varchar('reference_entity', { length: 100 }),
  unit: attributeUnitEnum('unit'),
  isRequired: boolean('is_required').notNull().default(false),
  isFilterable: boolean('is_filterable').notNull().default(false),
  externalSource: varchar('external_source', { length: 100 }),
  externalId: varchar('external_id', { length: 255 }),
  metadata: jsonb('metadata'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  unique('uq_attributes_slug').on(t.slug),
  unique('uq_attributes_external').on(t.externalSource, t.externalId),
  // A REFERENCE attribute must name its target entity; every other type forbids it.
  check('chk_reference_entity', sql`(${t.type} = 'REFERENCE' AND ${t.referenceEntity} IS NOT NULL) OR (${t.type} <> 'REFERENCE' AND ${t.referenceEntity} IS NULL)`),
  // `unit` is only valid on a NUMERIC attribute.
  check('chk_unit_for_numeric', sql`${t.type} = 'NUMERIC' OR ${t.unit} IS NULL`),
  // Trigram GIN indexes power fuzzy name/slug search (requires the pg_trgm extension).
  index('idx_attributes_name_trgm').using('gin', t.name.op('gin_trgm_ops')),
  index('idx_attributes_slug_trgm').using('gin', t.slug.op('gin_trgm_ops')),
  index('idx_attributes_type').on(t.type),
  // Partial index: only the filterable rows are ever queried this way.
  index('idx_attributes_filterable').on(t.isFilterable).where(sql`${t.isFilterable} = TRUE`),
  index('idx_attributes_org').on(t.organizationId),
])

export const attributeValues = pgTable('attribute_values', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  attributeId: integer('attribute_id').notNull().references(() => attributes.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id'),
  slug: varchar('slug', { length: 255 }).notNull(),
  value: varchar('value', { length: 255 }).notNull(),
  position: integer('position').notNull().default(0),
  externalSource: varchar('external_source', { length: 100 }),
  externalId: varchar('external_id', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  unique('uq_attribute_value_slug').on(t.attributeId, t.slug),
  unique('uq_attribute_values_external').on(t.externalSource, t.externalId),
  index('idx_attribute_values_attr').on(t.attributeId, t.position),
])

export const attributeSwatchValues = pgTable('attribute_swatch_values', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  attributeId: integer('attribute_id').notNull().references(() => attributes.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id'),
  slug: varchar('slug', { length: 255 }).notNull(),
  value: varchar('value', { length: 255 }).notNull(),
  color: varchar('color', { length: 7 }),
  fileUrl: varchar('file_url', { length: 2048 }),
  mimetype: varchar('mimetype', { length: 100 }),
  position: integer('position').notNull().default(0),
  externalSource: varchar('external_source', { length: 100 }),
  externalId: varchar('external_id', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  unique('uq_swatch_slug').on(t.attributeId, t.slug),
  unique('uq_swatch_values_external').on(t.externalSource, t.externalId),
  // A swatch must carry at least one visual: a color or a file.
  check('chk_swatch_has_visual', sql`${t.color} IS NOT NULL OR ${t.fileUrl} IS NOT NULL`),
  // A file-backed swatch must declare its mimetype.
  check('chk_swatch_mimetype', sql`${t.fileUrl} IS NULL OR ${t.mimetype} IS NOT NULL`),
  index('idx_swatch_values_attr').on(t.attributeId, t.position),
])

export const attributeReferenceValues = pgTable('attribute_reference_values', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  attributeId: integer('attribute_id').notNull().references(() => attributes.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id'),
  slug: varchar('slug', { length: 255 }).notNull(),
  value: varchar('value', { length: 255 }).notNull(),
  referenceId: integer('reference_id').notNull(),
  position: integer('position').notNull().default(0),
  externalSource: varchar('external_source', { length: 100 }),
  externalId: varchar('external_id', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  unique('uq_reference_slug').on(t.attributeId, t.slug),
  unique('uq_reference_id').on(t.attributeId, t.referenceId),
  unique('uq_reference_values_external').on(t.externalSource, t.externalId),
  index('idx_reference_values_attr').on(t.attributeId, t.position),
])

export const attributeTextValues = pgTable('attribute_text_values', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  attributeId: integer('attribute_id').notNull().references(() => attributes.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id'),
  plain: text('plain').notNull(),
  rich: jsonb('rich'),
  externalSource: varchar('external_source', { length: 100 }),
  externalId: varchar('external_id', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [unique('uq_text_values_external').on(t.externalSource, t.externalId)])

export const attributeNumericValues = pgTable('attribute_numeric_values', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  attributeId: integer('attribute_id').notNull().references(() => attributes.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id'),
  value: numeric('value', { precision: 20, scale: 6, mode: 'number' }).notNull(),
  externalSource: varchar('external_source', { length: 100 }),
  externalId: varchar('external_id', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [unique('uq_numeric_values_external').on(t.externalSource, t.externalId)])

export const attributeBooleanValues = pgTable('attribute_boolean_values', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  attributeId: integer('attribute_id').notNull().references(() => attributes.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id'),
  value: boolean('value').notNull(),
  externalSource: varchar('external_source', { length: 100 }),
  externalId: varchar('external_id', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [unique('uq_boolean_values_external').on(t.externalSource, t.externalId)])

export const attributeDateValues = pgTable('attribute_date_values', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  attributeId: integer('attribute_id').notNull().references(() => attributes.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id'),
  value: timestamp('value', { withTimezone: true }).notNull(),
  externalSource: varchar('external_source', { length: 100 }),
  externalId: varchar('external_id', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [unique('uq_date_values_external').on(t.externalSource, t.externalId)])

export const attributeFileValues = pgTable('attribute_file_values', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  attributeId: integer('attribute_id').notNull().references(() => attributes.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id'),
  fileUrl: varchar('file_url', { length: 2048 }).notNull(),
  mimetype: varchar('mimetype', { length: 100 }).notNull(),
  externalSource: varchar('external_source', { length: 100 }),
  externalId: varchar('external_id', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [unique('uq_file_values_external').on(t.externalSource, t.externalId)])

// Register these tables into the kit's global `SchemaRegistryShape`, so the
// relations builder (`@czo/attribute/relations`) and `db.query.*` are
// typed against them. This augmentation lives next to the table definitions —
// NOT in a standalone file — so it travels with every import of the schema and
// applies in downstream packages (apps/life), whose compilation only pulls
// files reachable through the import graph.
declare module '@czo/kit/db' {
  interface SchemaRegistryShape {
    attributes: typeof attributes
    attributeValues: typeof attributeValues
    attributeSwatchValues: typeof attributeSwatchValues
    attributeReferenceValues: typeof attributeReferenceValues
    attributeTextValues: typeof attributeTextValues
    attributeNumericValues: typeof attributeNumericValues
    attributeBooleanValues: typeof attributeBooleanValues
    attributeDateValues: typeof attributeDateValues
    attributeFileValues: typeof attributeFileValues
  }
}
