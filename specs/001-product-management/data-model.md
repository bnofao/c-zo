# Data Model: Product Management Module

**Date**: 2025-11-02  
**Feature**: Product Management Module  
**Plan**: [plan.md](./plan.md)

## Overview

This document defines the complete database schema for the product management module, including all tables, relationships, indexes, and constraints. The schema uses PostgreSQL with type-safe Kysely query builder.

## Schema Design Principles

1. **Soft Deletion**: All entities use `deleted_at` timestamp for audit trail
2. **Partial Unique Indexes**: Unique constraints apply only to active records (`WHERE deleted_at IS NULL`)
3. **Timestamps**: All tables track `created_at` and `updated_at` automatically
4. **Extensibility**: JSONB `metadata` fields for custom attributes without schema changes
5. **Text IDs**: All primary keys use text type for UUIDs or custom ID schemes
6. **Foreign Keys**: Maintain referential integrity across all relationships

## Entity Relationship Diagram

```text
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│  p_types    │◄────────│   products   │────────►│p_collections│
└─────────────┘         └──────────────┘         └─────────────┘
                               │ │ │
                    ┌──────────┘ │ └──────────┐
                    │            │            │
              ┌─────▼───┐  ┌────▼─────┐  ┌───▼──────┐
              │p_variants│  │p_categories│  │  p_tags  │
              └──────────┘  └────────────┘  └──────────┘
                    │              │
              ┌─────▼───┐    ┌─────▼──────────────┐
              │p_options│    │p_categories_products│
              └──────────┘    └────────────────────┘
                    │
              ┌─────▼─────────┐
              │p_option_values│
              └───────────────┘
                    │
              ┌─────▼──────────┐
              │p_variants_options│
              └────────────────┘

         ┌────────┐
         │ images │◄────┐
         └────────┘     │
              │         │
         ┌────▼──────────▼───┐
         │ products_images   │
         └───────────────────┘
```

## Core Tables

### 1. products

**Purpose**: Core product entity with basic information and relationships

**Table Definition**:
```sql
CREATE TABLE products (
    id text NOT NULL PRIMARY KEY,
    title text NOT NULL,
    handle text NOT NULL,
    subtitle text,
    description text,
    is_giftcard boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'draft',
    thumbnail text,
    weight text,
    length text,
    height text,
    width text,
    origin_country text,
    hs_code text,
    mid_code text,
    material text,
    collection_id text,
    type_id text,
    discountable boolean NOT NULL DEFAULT true,
    external_id text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone,
    metadata jsonb,
    
    CONSTRAINT products_collection_fk 
        FOREIGN KEY (collection_id) REFERENCES p_collections(id),
    CONSTRAINT products_type_fk 
        FOREIGN KEY (type_id) REFERENCES p_types(id),
    CONSTRAINT products_status_check 
        CHECK (status IN ('draft', 'proposed', 'published', 'rejected'))
);

CREATE UNIQUE INDEX products_handle_unique 
    ON products (handle) WHERE (deleted_at IS NULL);

CREATE INDEX products_type_id_idx 
    ON products (type_id) WHERE (deleted_at IS NULL);

CREATE INDEX products_collection_id_idx 
    ON products (collection_id) WHERE (deleted_at IS NULL);

CREATE INDEX products_deleted_at_idx 
    ON products (deleted_at);

CREATE INDEX products_status_idx 
    ON products (status) WHERE (deleted_at IS NULL);
```

**Kysely Type**:
```typescript
interface ProductsTable {
  id: string
  title: string
  handle: string
  subtitle: string | null
  description: string | null
  is_giftcard: boolean
  status: 'draft' | 'proposed' | 'published' | 'rejected'
  thumbnail: string | null
  weight: string | null
  length: string | null
  height: string | null
  width: string | null
  origin_country: string | null
  hs_code: string | null
  mid_code: string | null
  material: string | null
  collection_id: string | null
  type_id: string | null
  discountable: boolean
  external_id: string | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
  metadata: Record<string, any> | null
}
```

**Business Rules**:
- Handle must be unique among non-deleted products
- Status transitions: draft → proposed → published/rejected
- Soft deletion preserves relationships for audit
- Metadata field limited to 10KB for performance

---

### 2. p_variants

**Purpose**: Product variants with unique identifiers and inventory settings

**Table Definition**:
```sql
CREATE TABLE p_variants (
    id text NOT NULL PRIMARY KEY,
    title text NOT NULL,
    sku text,
    barcode text,
    ean text,
    upc text,
    allow_backorder boolean NOT NULL DEFAULT false,
    manage_inventory boolean NOT NULL DEFAULT true,
    hs_code text,
    origin_country text,
    thumbnail text,
    mid_code text,
    material text,
    weight integer,
    length integer,
    height integer,
    width integer,
    metadata jsonb,
    variant_rank integer DEFAULT 0,
    product_id text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone,
    
    CONSTRAINT p_variants_product_fk 
        FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE UNIQUE INDEX p_variants_ean_unique 
    ON p_variants (ean) WHERE (deleted_at IS NULL);

CREATE UNIQUE INDEX p_variants_upc_unique 
    ON p_variants (upc) WHERE (deleted_at IS NULL);

CREATE UNIQUE INDEX p_variants_sku_unique 
    ON p_variants (sku) WHERE (deleted_at IS NULL);

CREATE UNIQUE INDEX p_variants_barcode_unique 
    ON p_variants (barcode) WHERE (deleted_at IS NULL);

CREATE INDEX p_variants_product_id_idx 
    ON p_variants (product_id) WHERE (deleted_at IS NULL);

CREATE INDEX p_variants_deleted_at_idx 
    ON p_variants (deleted_at);

CREATE INDEX p_variants_id_product_id_idx 
    ON p_variants (id, product_id) WHERE (deleted_at IS NULL);
```

**Kysely Type**:
```typescript
interface VariantsTable {
  id: string
  title: string
  sku: string | null
  barcode: string | null
  ean: string | null
  upc: string | null
  allow_backorder: boolean
  manage_inventory: boolean
  hs_code: string | null
  origin_country: string | null
  thumbnail: string | null
  mid_code: string | null
  material: string | null
  weight: number | null
  length: number | null
  height: number | null
  width: number | null
  metadata: Record<string, any> | null
  variant_rank: number
  product_id: string | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}
```

**Business Rules**:
- SKU, barcode, EAN, UPC must be unique among non-deleted variants
- Dimensions (weight, length, height, width) stored as integers (e.g., grams, millimeters)
- variant_rank determines display order (lower = higher priority)
- At least one variant typically required per product

---

### 3. p_categories

**Purpose**: Hierarchical category structure using adjacency list pattern

**Table Definition**:
```sql
CREATE TABLE p_categories (
    id text NOT NULL PRIMARY KEY,
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    handle text NOT NULL,
    is_active boolean NOT NULL DEFAULT false,
    is_internal boolean NOT NULL DEFAULT false,
    rank integer NOT NULL DEFAULT 0,
    image_id text,
    thumbnail text,
    parent_id text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone,
    metadata jsonb,
    
    CONSTRAINT p_categories_parent_fk 
        FOREIGN KEY (parent_id) REFERENCES p_categories(id),
    CONSTRAINT p_categories_image_fk 
        FOREIGN KEY (image_id) REFERENCES images(id)
);

CREATE UNIQUE INDEX p_categories_handle_unique 
    ON p_categories (handle) WHERE (deleted_at IS NULL);

CREATE INDEX p_categories_parent_id_idx 
    ON p_categories (parent_id) WHERE (deleted_at IS NULL);
```

**Kysely Type**:
```typescript
interface CategoriesTable {
  id: string
  name: string
  description: string
  handle: string
  is_active: boolean
  is_internal: boolean
  rank: number
  image_id: string | null
  thumbnail: string | null
  parent_id: string | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
  metadata: Record<string, any> | null
}
```

**Business Rules**:
- is_internal categories hidden from public catalog
- rank determines sibling order
- Handle must be unique among non-deleted categories
- image_id references the category's main image

**Hierarchy Queries**:
```typescript
// Get direct children of a category
function getChildren(categoryId: string) {
  return db
    .selectFrom('p_categories')
    .selectAll()
    .where('parent_id', '=', categoryId)
    .where('deleted_at', 'is', null)
    .orderBy('rank', 'asc')
    .execute()
}

// Get parent category
function getParent(categoryId: string) {
  return db
    .selectFrom('p_categories as c')
    .innerJoin('p_categories as p', 'c.parent_id', 'p.id')
    .selectAll('p')
    .where('c.id', '=', categoryId)
    .where('p.deleted_at', 'is', null)
    .executeTakeFirst()
}

// Get full path to root using recursive CTE
async function getCategoryPath(categoryId: string) {
  const result = await db
    .withRecursive('category_path', (qb) =>
      qb
        .selectFrom('p_categories')
        .select(['id', 'name', 'parent_id'])
        .where('id', '=', categoryId)
        .unionAll(
          qb
            .selectFrom('p_categories as c')
            .innerJoin('category_path as cp', 'c.id', 'cp.parent_id')
            .select(['c.id', 'c.name', 'c.parent_id'])
        )
    )
    .selectFrom('category_path')
    .selectAll()
    .execute()
  
  return result.reverse() // Root to current
}
```

---

### 4. p_categories_products (Junction Table)

**Purpose**: Many-to-many relationship between products and categories

**Table Definition**:
```sql
CREATE TABLE p_categories_products (
    product_id text NOT NULL,
    p_categories_id text NOT NULL,
    
    PRIMARY KEY (product_id, p_categories_id),
    
    CONSTRAINT p_categories_products_product_fk 
        FOREIGN KEY (product_id) REFERENCES products(id),
    CONSTRAINT p_categories_products_category_fk 
        FOREIGN KEY (p_categories_id) REFERENCES p_categories(id)
);
```

**Kysely Type**:
```typescript
interface CategoriesProductsTable {
  product_id: string
  p_categories_id: string
}
```

**Business Rules**:
- A product can belong to multiple categories
- Composite primary key prevents duplicate assignments
- Foreign keys ensure referential integrity

---

### 5. p_collections

**Purpose**: Curated product collections for marketing and merchandising

**Table Definition**:
```sql
CREATE TABLE p_collections (
    id text NOT NULL PRIMARY KEY,
    title text NOT NULL,
    handle text NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone
);

CREATE UNIQUE INDEX p_collections_handle_unique 
    ON p_collections (handle) WHERE (deleted_at IS NULL);

CREATE INDEX p_collections_deleted_at_idx 
    ON p_collections (deleted_at);
```

**Kysely Type**:
```typescript
interface CollectionsTable {
  id: string
  title: string
  handle: string
  metadata: Record<string, any> | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}
```

**Business Rules**:
- Handle must be unique among non-deleted collections
- Products reference collection via collection_id (one-to-many)
- Deleting collection nullifies product.collection_id

---

### 6. p_options

**Purpose**: Product options (e.g., Color, Size) defining variant dimensions

**Table Definition**:
```sql
CREATE TABLE p_options (
    id text NOT NULL PRIMARY KEY,
    title text NOT NULL,
    product_id text NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone,
    
    CONSTRAINT p_options_product_fk 
        FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX p_options_deleted_at_idx 
    ON p_options (deleted_at);

CREATE UNIQUE INDEX p_options_product_title_unique 
    ON p_options (product_id, title) WHERE (deleted_at IS NULL);

CREATE INDEX p_options_product_id_idx 
    ON p_options (product_id) WHERE (deleted_at IS NULL);
```

**Kysely Type**:
```typescript
interface OptionsTable {
  id: string
  title: string
  product_id: string
  metadata: Record<string, any> | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}
```

**Business Rules**:
- Option title must be unique per product
- Options belong to a specific product
- Deleting option should check for dependent variants

---

### 7. p_option_values

**Purpose**: Specific values for product options (e.g., "Red" for Color option)

**Table Definition**:
```sql
CREATE TABLE p_option_values (
    id text NOT NULL PRIMARY KEY,
    value text NOT NULL,
    option_id text,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone,
    
    CONSTRAINT p_option_values_option_fk 
        FOREIGN KEY (option_id) REFERENCES p_options(id)
);

CREATE UNIQUE INDEX p_option_values_option_value_unique 
    ON p_option_values (option_id, value) WHERE (deleted_at IS NULL);

CREATE INDEX p_option_values_deleted_at_idx 
    ON p_option_values (deleted_at);

CREATE INDEX p_option_values_option_id_idx 
    ON p_option_values (option_id) WHERE (deleted_at IS NULL);
```

**Kysely Type**:
```typescript
interface OptionValuesTable {
  id: string
  value: string
  option_id: string | null
  metadata: Record<string, any> | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}
```

**Business Rules**:
- Value must be unique per option
- Option values define the available choices for an option
- Variants are identified by their combination of option values

---

### 8. p_variants_options (Junction Table)

**Purpose**: Links variants to their option values

**Table Definition**:
```sql
CREATE TABLE p_variants_options (
    variant_id text NOT NULL PRIMARY KEY,
    option_value_id text NOT NULL,
    
    CONSTRAINT p_variants_options_variant_fk 
        FOREIGN KEY (variant_id) REFERENCES p_variants(id),
    CONSTRAINT p_variants_options_option_value_fk 
        FOREIGN KEY (option_value_id) REFERENCES p_option_values(id)
);
```

**Kysely Type**:
```typescript
interface VariantsOptionsTable {
  variant_id: string
  option_value_id: string
}
```

**Business Rules**:
- Primary key on variant_id means each variant maps to one option value set
- In practice, need multiple rows per variant for multiple options
- Example: variant "Red-Large" has two rows:
  - (variant_id, color_option_value_id)
  - (variant_id, size_option_value_id)

---

### 9. p_tags

**Purpose**: Reusable tags for flexible product categorization

**Table Definition**:
```sql
CREATE TABLE p_tags (
    id text NOT NULL PRIMARY KEY,
    value text NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone
);

CREATE UNIQUE INDEX p_tags_value_unique 
    ON p_tags (value) WHERE (deleted_at IS NULL);

CREATE INDEX p_tags_deleted_at_idx 
    ON p_tags (deleted_at);
```

**Kysely Type**:
```typescript
interface TagsTable {
  id: string
  value: string
  metadata: Record<string, any> | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}
```

**Business Rules**:
- Tag value must be unique among non-deleted tags
- Tags are reusable across multiple products
- Many-to-many relationship via products_tags junction table

---

### 10. products_tags (Junction Table)

**Purpose**: Many-to-many relationship between products and tags

**Table Definition**:
```sql
CREATE TABLE products_tags (
    product_id text NOT NULL,
    product_tag_id text NOT NULL,
    
    PRIMARY KEY (product_id, product_tag_id),
    
    CONSTRAINT products_tags_product_fk 
        FOREIGN KEY (product_id) REFERENCES products(id),
    CONSTRAINT products_tags_tag_fk 
        FOREIGN KEY (product_tag_id) REFERENCES p_tags(id)
);
```

**Kysely Type**:
```typescript
interface ProductsTagsTable {
  product_id: string
  product_tag_id: string
}
```

**Business Rules**:
- A product can have multiple tags
- A tag can be applied to multiple products
- Composite primary key prevents duplicate tag assignments

---

### 11. p_types

**Purpose**: Product type classification (Physical, Digital, Service, etc.)

**Table Definition**:
```sql
CREATE TABLE p_types (
    id text NOT NULL PRIMARY KEY,
    value text NOT NULL,
    metadata json,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone
);

CREATE UNIQUE INDEX p_types_value_unique 
    ON p_types (value) WHERE (deleted_at IS NULL);

CREATE INDEX p_types_deleted_at_idx 
    ON p_types (deleted_at);
```

**Kysely Type**:
```typescript
interface TypesTable {
  id: string
  value: string
  metadata: Record<string, any> | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}
```

**Business Rules**:
- Type value must be unique among non-deleted types
- Products reference type via type_id (many-to-one)
- Types enable different business rules per product category

---

### 12. images

**Purpose**: Product images with URL references and ranking

**Table Definition**:
```sql
CREATE TABLE images (
    id text NOT NULL PRIMARY KEY,
    url text NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone,
    rank integer NOT NULL DEFAULT 0,
    product_id text NOT NULL
);

CREATE INDEX images_url_idx 
    ON images (url) WHERE (deleted_at IS NULL);

CREATE INDEX images_deleted_at_idx 
    ON images (deleted_at);

CREATE INDEX images_rank_idx 
    ON images (rank) WHERE (deleted_at IS NULL);
```

**Kysely Type**:
```typescript
interface ImagesTable {
  id: string
  url: string
  metadata: Record<string, any> | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
  rank: number
  product_id: string
}
```

**Business Rules**:
- rank determines image display order (lower = higher priority)
- Images linked to products and variants via products_images junction table
- URL stores reference to file storage service (S3, cloud storage)

---

### 13. products_images (Junction Table)

**Purpose**: Links images to products and variants

**Table Definition**:
```sql
CREATE TABLE products_images (
    product_id text NOT NULL,
    image_id text NOT NULL,
    variant_id text NOT NULL,
    
    PRIMARY KEY (product_id, variant_id, image_id),
    
    CONSTRAINT products_images_product_fk 
        FOREIGN KEY (product_id) REFERENCES products(id),
    CONSTRAINT products_images_image_fk 
        FOREIGN KEY (image_id) REFERENCES images(id),
    CONSTRAINT products_images_variant_fk 
        FOREIGN KEY (variant_id) REFERENCES p_variants(id)
);
```

**Kysely Type**:
```typescript
interface ProductsImagesTable {
  product_id: string
  image_id: string
  variant_id: string
}
```

**Business Rules**:
- Three-way relationship: product + variant + image
- Allows variant-specific images
- Composite primary key prevents duplicate associations

---

## Complete Kysely Database Interface

```typescript
// database/types.ts
import type { Generated, ColumnType } from 'kysely'

export interface Database {
  products: ProductsTable
  p_variants: VariantsTable
  p_categories: CategoriesTable
  p_categories_products: CategoriesProductsTable
  p_collections: CollectionsTable
  p_options: OptionsTable
  p_option_values: OptionValuesTable
  p_variants_options: VariantsOptionsTable
  p_tags: TagsTable
  products_tags: ProductsTagsTable
  p_types: TypesTable
  images: ImagesTable
  products_images: ProductsImagesTable
}

// Timestamps type helper
type Timestamps = {
  created_at: Generated<Date>
  updated_at: Generated<Date>
  deleted_at: Date | null
}

// Metadata type helper
type Metadata = {
  metadata: Record<string, any> | null
}
```

## Common Query Patterns

### 1. Soft Delete Query

```typescript
// Always filter out deleted records
db.selectFrom('products')
  .selectAll()
  .where('deleted_at', 'is', null)
  .execute()
```

### 2. Product with All Relations

```typescript
async function getProductComplete(productId: string) {
  // Main product data
  const product = await db
    .selectFrom('products')
    .leftJoin('p_collections', 'products.collection_id', 'p_collections.id')
    .leftJoin('p_types', 'products.type_id', 'p_types.id')
    .selectAll('products')
    .select([
      'p_collections.title as collection_title',
      'p_types.value as type_value'
    ])
    .where('products.id', '=', productId)
    .where('products.deleted_at', 'is', null)
    .executeTakeFirst()
  
  if (!product) return null
  
  // Variants
  const variants = await db
    .selectFrom('p_variants')
    .selectAll()
    .where('product_id', '=', productId)
    .where('deleted_at', 'is', null)
    .orderBy('variant_rank', 'asc')
    .execute()
  
  // Categories
  const categories = await db
    .selectFrom('p_categories')
    .innerJoin('p_categories_products', 'p_categories.id', 'p_categories_products.p_categories_id')
    .selectAll('p_categories')
    .where('p_categories_products.product_id', '=', productId)
    .where('p_categories.deleted_at', 'is', null)
    .execute()
  
  // Tags
  const tags = await db
    .selectFrom('p_tags')
    .innerJoin('products_tags', 'p_tags.id', 'products_tags.product_tag_id')
    .selectAll('p_tags')
    .where('products_tags.product_id', '=', productId)
    .where('p_tags.deleted_at', 'is', null)
    .execute()
  
  return {
    ...product,
    variants,
    categories,
    tags
  }
}
```

### 3. Category Hierarchy Traversal

```typescript
// Get all descendants using recursive CTE
async function getCategoryTree(rootCategoryId: string) {
  return db
    .withRecursive('category_tree', (qb) =>
      qb
        .selectFrom('p_categories')
        .selectAll()
        .where('id', '=', rootCategoryId)
        .where('deleted_at', 'is', null)
        .unionAll(
          qb
            .selectFrom('p_categories as c')
            .innerJoin('category_tree as ct', 'c.parent_id', 'ct.id')
            .selectAll('c')
            .where('c.deleted_at', 'is', null)
        )
    )
    .selectFrom('category_tree')
    .selectAll()
    .execute()
}
```

### 4. Transactional Insert with Relations

```typescript
async function createProductWithCategories(input: CreateProductInput) {
  return db.transaction().execute(async (trx) => {
    // Insert product
    const product = await trx
      .insertInto('products')
      .values({
        id: generateId(),
        title: input.title,
        handle: await generateUniqueHandle('products', input.title),
        status: 'draft',
        created_at: new Date(),
        updated_at: new Date()
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    
    // Insert category associations
    if (input.categoryIds?.length) {
      await trx
        .insertInto('p_categories_products')
        .values(
          input.categoryIds.map(categoryId => ({
            product_id: product.id,
            p_categories_id: categoryId
          }))
        )
        .execute()
    }
    
    return product
  })
}
```

## Migration Checklist

- [ ] 001: Create products table with indexes
- [ ] 002: Create p_variants table with unique constraints
- [ ] 003: Create p_categories table with parent_id index and image_id FK
- [ ] 004: Create p_categories_products junction table
- [ ] 005: Create p_collections table
- [ ] 006: Create p_options table
- [ ] 007: Create p_option_values table
- [ ] 008: Create p_variants_options junction table
- [ ] 009: Create p_tags table
- [ ] 010: Create products_tags junction table
- [ ] 011: Create p_types table
- [ ] 012: Create images table
- [ ] 013: Create products_images junction table

## Type Generation

After migrations, generate Kysely types:

```bash
# Install kysely-codegen
pnpm add -D kysely-codegen

# Generate types from database
pnpm kysely-codegen --dialect postgres --out-file src/database/types.ts
```

## Performance Considerations

### Indexes Strategy

1. **Primary Keys**: Automatic index on all PKs
2. **Foreign Keys**: Indexed for join performance (especially parent_id for category hierarchies)
3. **Unique Constraints**: Partial indexes with `WHERE deleted_at IS NULL`
4. **Filtering Columns**: status, deleted_at, parent_id indexed
5. **Composite Indexes**: (id, product_id) for variant queries

### Query Optimization

1. **Use Joins**: Prefer joins over multiple queries
2. **Limit Results**: Always paginate large result sets
3. **Select Specific Columns**: Avoid `selectAll()` in production
4. **Connection Pooling**: Configure appropriate pool size
5. **Query Caching**: Cache category trees and frequently accessed data

## Next Steps

1. Implement migrations in `packages/modules/product/migrations/`
2. Generate Kysely types from database schema
3. Create query builder utilities in `database/queries/`
4. Implement service layer using type-safe Kysely queries
5. Write tests for all query patterns

