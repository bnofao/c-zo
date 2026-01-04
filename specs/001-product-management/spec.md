# Feature Specification: Product Management Module

**Feature Branch**: `001-product-management`  
**Created**: 2025-11-02  
**Status**: Draft  
**Input**: User description: "Je veux un module de produit pour gérer les produits et entités associés (catégories, variants, collections, type de produits, tags de produits et options de produits)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Basic Product Management (Priority: P1)

As a marketplace administrator, I need to create, view, update, and delete products so that I can build and maintain the marketplace product catalog.

**Why this priority**: Core CRUD operations for products are the foundation of the entire product management system. Without the ability to manage basic products, no other feature can function.

**Independent Test**: Can be fully tested by creating a product with basic information (title, description, status), viewing it in a list, updating its details, and deleting it. Delivers immediate value as products become visible and manageable.

**Acceptance Scenarios**:

1. **Given** I am an authenticated administrator, **When** I create a new product with title "Laptop X1", description "High-performance laptop", and status "draft", **Then** the product is saved with a unique ID and appears in the product list
2. **Given** a product exists with status "draft", **When** I update its status to "published", **Then** the product status changes and the updated_at timestamp is refreshed
3. **Given** a product exists in the system, **When** I request to view its details, **Then** I see all product information including title, description, status, dimensions, and metadata
4. **Given** a product exists with no active orders, **When** I delete it, **Then** the product is soft-deleted (deleted_at timestamp set) and no longer appears in active product lists
5. **Given** I create a product with a duplicate handle, **When** I attempt to save it, **Then** I receive a validation error indicating the handle must be unique

---

### User Story 2 - Product Variants Management (Priority: P2)

As a marketplace administrator, I need to manage product variants with different SKUs, barcodes, and inventory settings so that I can offer multiple versions of the same product (e.g., different sizes or colors).

**Why this priority**: Product variants are essential for most e-commerce scenarios where products come in multiple configurations. This enables the marketplace to handle real-world inventory scenarios.

**Independent Test**: Can be tested by creating a product, adding multiple variants with different SKUs and attributes, managing inventory settings per variant, and verifying each variant can be independently accessed and modified.

**Acceptance Scenarios**:

1. **Given** a product exists, **When** I add a variant with title "Medium - Blue", SKU "SHIRT-M-BL", and inventory settings, **Then** the variant is associated with the product and can be managed independently
2. **Given** a product variant exists, **When** I update its barcode and EAN values, **Then** the variant information is updated and remains unique across all variants
3. **Given** multiple variants exist for a product, **When** I set different inventory management rules per variant (allow backorder, manage inventory), **Then** each variant respects its own inventory configuration
4. **Given** a variant has physical dimensions and weight, **When** I retrieve variant details, **Then** I see accurate shipping-related information (weight, length, height, width)
5. **Given** I attempt to create a variant with a duplicate SKU, **When** I save it, **Then** I receive a validation error preventing duplicate SKU values

---

### User Story 3 - Product Organization with Categories (Priority: P3)

As a marketplace administrator, I need to organize products into hierarchical categories so that customers can browse and filter products by category.

**Why this priority**: Product categorization is critical for product discovery and navigation. Hierarchical categories enable intuitive browsing experiences.

**Independent Test**: Can be tested by creating parent and child categories, assigning products to multiple categories, and verifying products can be filtered and retrieved by category hierarchy.

**Acceptance Scenarios**:

1. **Given** I am creating a category structure, **When** I create a root category "Electronics" and a child category "Laptops" under it, **Then** the hierarchy is maintained via the mpath (materialized path) field
2. **Given** a product exists, **When** I assign it to multiple categories (e.g., "Laptops" and "Gaming"), **Then** the product appears when filtering by either category
3. **Given** categories exist in a hierarchy, **When** I query for all products in "Electronics", **Then** I retrieve products from "Electronics" and all its subcategories
4. **Given** a category has products assigned, **When** I soft-delete the category, **Then** the category is marked as deleted but products remain accessible
5. **Given** I set a category as "is_internal", **When** customers browse the catalog, **Then** the category is hidden from public view but visible to administrators

---

### User Story 4 - Product Options and Option Values (Priority: P4)

As a marketplace administrator, I need to define product options (like Color, Size) and their values so that variants can be properly described and customers can make informed choices.

**Why this priority**: Product options provide structure to variant attributes and enable consistent product configuration across the marketplace. This is essential for variant generation and customer selection interfaces.

**Independent Test**: Can be tested by creating product options (e.g., "Color"), adding values (e.g., "Red", "Blue"), associating these with variants, and verifying the option-value-variant relationships are maintained correctly.

**Acceptance Scenarios**:

1. **Given** a product exists, **When** I create an option named "Size" with values "Small", "Medium", "Large", **Then** the option is associated with the product and values are linked to the option
2. **Given** product options and values exist, **When** I create variants and assign option values to them, **Then** each variant is uniquely identified by its combination of option values
3. **Given** a product has two options (Color and Size), **When** I generate variants for all combinations, **Then** variants are created with appropriate option value associations (e.g., "Small-Red", "Small-Blue", etc.)
4. **Given** an option value is associated with variants, **When** I attempt to delete the option value, **Then** I receive a warning about affected variants before deletion proceeds
5. **Given** I update an option value from "XL" to "Extra Large", **When** I view associated variants, **Then** the updated value is reflected across all variants

---

### User Story 5 - Product Collections and Tags (Priority: P5)

As a marketplace administrator, I need to group products into collections and apply tags so that I can create curated product sets and enable flexible product discovery.

**Why this priority**: Collections and tags provide marketing and merchandising flexibility. Collections enable curated product sets (e.g., "Summer Sale", "New Arrivals") while tags enable flexible filtering and search.

**Independent Test**: Can be tested by creating collections, assigning products to them, adding tags to products, and verifying products can be retrieved by collection or filtered by tags.

**Acceptance Scenarios**:

1. **Given** I create a collection named "Summer Collection 2025", **When** I assign products to this collection, **Then** the products are accessible via the collection and maintain their individual properties
2. **Given** products are assigned to a collection, **When** I update the collection title, **Then** the collection is updated without affecting associated products
3. **Given** I create tags "organic", "vegan", "sustainable", **When** I apply multiple tags to a product, **Then** the product can be filtered by any combination of these tags
4. **Given** a tag "discontinued" exists, **When** I remove it from all products and delete it, **Then** the tag is removed from the system cleanly
5. **Given** a product belongs to both a collection and has tags, **When** I query for products in "Summer Collection" with tag "organic", **Then** I retrieve only products matching both criteria

---

### User Story 6 - Product Types (Priority: P6)

As a marketplace administrator, I need to categorize products by type (e.g., "Physical", "Digital", "Service") so that different business rules can be applied based on product type.

**Why this priority**: Product types enable different handling logic for different kinds of products (e.g., digital products don't require shipping, services don't have inventory).

**Independent Test**: Can be tested by creating product types, assigning them to products, and verifying products can be filtered and managed based on their type.

**Acceptance Scenarios**:

1. **Given** I create a product type "Digital Download", **When** I assign it to products, **Then** the products inherit type-specific attributes and behaviors
2. **Given** a product has type "Physical", **When** I view the product, **Then** shipping-related fields (weight, dimensions, origin_country) are required and validated
3. **Given** multiple products share the same type, **When** I query products by type, **Then** I retrieve all products of that type efficiently
4. **Given** a product type is no longer needed, **When** I attempt to delete it, **Then** I receive information about how many products would be affected

---

### User Story 7 - Product Images Management (Priority: P7)

As a marketplace administrator, I need to upload and manage product images so that products have visual representations for customers.

**Why this priority**: Product images are essential for e-commerce but can be added after basic product structure is in place. This makes it a lower priority than core product management.

**Independent Test**: Can be tested by uploading images, associating them with products and variants, setting image order (rank), and verifying images are correctly linked and retrievable.

**Acceptance Scenarios**:

1. **Given** I have a product, **When** I upload multiple images and set their rank (order), **Then** the images are associated with the product and displayed in the specified order
2. **Given** a product has variants, **When** I associate specific images with specific variants, **Then** customers see variant-specific images when selecting that variant
3. **Given** multiple images exist for a product, **When** I set one as the thumbnail, **Then** that image is used as the product's primary visual in listings
4. **Given** an image is associated with multiple products or variants, **When** I delete the image, **Then** I see which products/variants would be affected before confirming deletion
5. **Given** images have been uploaded, **When** I reorder them by changing rank values, **Then** the new order is persisted and reflected in product displays

---

### Edge Cases

- **What happens when deleting a category that has subcategories?** The system should either prevent deletion or cascade the soft-delete to all subcategories, based on configuration
- **How does the system handle variant creation when option values are modified?** Existing variant-option value associations should remain stable; modifications create new values rather than updating existing ones to preserve data integrity
- **What happens when a product's collection is deleted?** Products remain accessible but are no longer associated with that collection (via the foreign key relationship)
- **How are unique constraints enforced for handles when products are soft-deleted?** Unique indexes include `WHERE (deleted_at IS NULL)` clause to allow handle reuse after deletion
- **What happens when attempting to create variants without defining product options first?** The system should validate that appropriate options and values exist before variant creation
- **How does the system handle concurrent updates to the same product?** Optimistic locking using updated_at timestamps or version fields should prevent lost updates
- **What happens to variant images when a variant is deleted?** Images should be preserved (soft-deleted) for potential audit trail and restoration scenarios

## Requirements *(mandatory)*

### Functional Requirements

#### Product Management

- **FR-001**: System MUST allow administrators to create products with required fields (title, handle, status) and optional fields (subtitle, description, thumbnail, dimensions, metadata)
- **FR-002**: System MUST generate unique handles for products based on title if not explicitly provided
- **FR-003**: System MUST enforce unique handle constraint per product within active (non-deleted) products
- **FR-004**: System MUST support four product statuses: draft, proposed, published, rejected
- **FR-005**: System MUST allow products to be marked as giftcards via boolean flag
- **FR-006**: System MUST support product discountability configuration via boolean flag
- **FR-007**: System MUST automatically track created_at and updated_at timestamps for all products
- **FR-008**: System MUST implement soft deletion for products via deleted_at timestamp
- **FR-009**: System MUST support JSONB metadata field for extensible product attributes
- **FR-010**: System MUST validate and store product dimensions (weight, length, height, width) as text fields
- **FR-011**: System MUST store shipping-related codes (hs_code, mid_code) and origin_country for products

#### Product Variants

- **FR-012**: System MUST allow creation of multiple variants per product
- **FR-013**: System MUST enforce unique constraints on variant identifiers (SKU, barcode, EAN, UPC) across all active variants
- **FR-014**: System MUST support inventory management configuration per variant (allow_backorder, manage_inventory flags)
- **FR-015**: System MUST store physical attributes per variant (weight, length, height, width as integers)
- **FR-016**: System MUST support variant ranking (variant_rank) to define display order
- **FR-017**: System MUST maintain variant-to-product association via foreign key
- **FR-018**: System MUST support variant-specific shipping codes and material information
- **FR-019**: System MUST allow variant-specific thumbnails independent of product thumbnail

#### Categories

- **FR-020**: System MUST support hierarchical category structure with parent-child relationships
- **FR-021**: System MUST maintain materialized path (mpath) for efficient category hierarchy queries
- **FR-022**: System MUST allow products to belong to multiple categories via many-to-many relationship
- **FR-023**: System MUST support category handles with uniqueness constraint within active categories
- **FR-024**: System MUST support category activation (is_active) and internal/external visibility (is_internal) flags
- **FR-025**: System MUST support category ranking for display order
- **FR-026**: System MUST allow category descriptions and optional image/thumbnail associations
- **FR-027**: System MUST update mpath automatically when category hierarchy changes

#### Product Options and Values

- **FR-028**: System MUST allow definition of product options (e.g., Color, Size) associated with specific products
- **FR-029**: System MUST enforce unique option titles per product
- **FR-030**: System MUST allow multiple values per option (e.g., Color: Red, Blue, Green)
- **FR-031**: System MUST enforce unique values per option
- **FR-032**: System MUST associate variant with specific option values to describe variant attributes
- **FR-033**: System MUST prevent deletion of option values that are actively used by variants

#### Collections

- **FR-034**: System MUST allow creation of product collections with title and handle
- **FR-035**: System MUST enforce unique collection handles within active collections
- **FR-036**: System MUST associate products with collections via foreign key relationship
- **FR-037**: System MUST support collection metadata for extensible attributes

#### Product Types

- **FR-038**: System MUST allow definition of product types with unique values
- **FR-039**: System MUST associate products with optional product type
- **FR-040**: System MUST support type metadata for extensible type attributes

#### Product Tags

- **FR-041**: System MUST allow creation of reusable product tags with unique values
- **FR-042**: System MUST support many-to-many relationship between products and tags
- **FR-043**: System MUST prevent duplicate tag values within active tags

#### Product Images

- **FR-044**: System MUST allow uploading and storing product images with URL references
- **FR-045**: System MUST support image ranking to control display order
- **FR-046**: System MUST associate images with both products and specific variants via junction table
- **FR-047**: System MUST support image metadata for extensible image attributes
- **FR-048**: System MUST implement soft deletion for images

#### Data Integrity

- **FR-049**: System MUST maintain referential integrity via foreign key constraints across all relationships
- **FR-050**: System MUST index frequently queried fields (handles, status, deleted_at, parent_id, mpath)
- **FR-051**: System MUST prevent hard deletion of entities that have dependent records
- **FR-052**: System MUST validate status transitions follow allowed workflows (draft → proposed → published/rejected)

### Key Entities

- **Product** (`products` table): Core entity representing a marketplace item with title, description, status, physical attributes, and extensible metadata. Links to collection, type, categories, tags, variants, options, and images.

- **Product Variant** (`p_variants` table): Specific variation of a product with unique identifiers (SKU, barcode, EAN, UPC), inventory settings, and physical dimensions. Each variant represents a purchasable item.

- **Product Category** (`p_categories` table): Hierarchical organizational structure for products using adjacency list pattern. Supports multi-level categorization with parent-child relationships and many-to-many product associations. Can have an associated image.

- **Product Option** (`p_options` table): Configurable attribute dimension for products (e.g., Color, Size). Each product can have multiple options, and each option has multiple values.

- **Product Option Value** (`p_option_values` table): Specific value for an option (e.g., "Red" for Color option). Variants are uniquely identified by their combination of option values.

- **Product Collection** (`p_collections` table): Curated grouping of products for marketing and merchandising purposes. Products have optional one-to-many relationship with collections.

- **Product Type** (`p_types` table): Classification of products into types (e.g., Physical, Digital, Service) to enable type-specific business rules and handling.

- **Product Tag** (`p_tags` table): Reusable labels for products enabling flexible filtering and search. Many-to-many relationship allows products to have multiple tags.

- **Product Image** (`images` table): Visual representation of products stored as URL references. Supports ranking and can be associated with both products and specific variants.

### Database Schema

#### Core Tables

**products**
```sql
- id: text (PK)
- title: text (NOT NULL)
- handle: text (NOT NULL, unique when not deleted)
- subtitle: text
- description: text
- is_giftcard: boolean (default: false)
- status: text (default: 'draft', CHECK: draft|proposed|published|rejected)
- thumbnail: text
- weight, length, height, width: text
- origin_country, hs_code, mid_code, material: text
- collection_id: text (FK → p_collections.id)
- type_id: text (FK → p_types.id)
- discountable: boolean (default: true)
- external_id: text
- created_at, updated_at, deleted_at: timestamp with time zone
- metadata: jsonb
Indexes: handle (unique where deleted_at IS NULL), type_id, collection_id, deleted_at, status
```

**p_variants**
```sql
- id: text (PK)
- title: text (NOT NULL)
- sku, barcode, ean, upc: text (each unique where deleted_at IS NULL)
- allow_backorder: boolean (default: false)
- manage_inventory: boolean (default: true)
- hs_code, origin_country, mid_code, material, thumbnail: text
- weight, length, height, width: integer
- variant_rank: integer (default: 0)
- product_id: text (FK → products.id)
- created_at, updated_at, deleted_at: timestamp with time zone
- metadata: jsonb
Indexes: sku, barcode, ean, upc (unique where deleted_at IS NULL), product_id, deleted_at, (id, product_id)
```

**p_categories**
```sql
- id: text (PK)
- name: text (NOT NULL)
- description: text (default: '')
- handle: text (NOT NULL, unique where deleted_at IS NULL)
- is_active: boolean (default: false)
- is_internal: boolean (default: false)
- rank: integer (default: 0)
- image_id: text (FK → images.id)
- thumbnail: text
- parent_id: text (FK → p_categories.id, self-reference)
- created_at, updated_at, deleted_at: timestamp with time zone
- metadata: jsonb
Indexes: handle (unique where deleted_at IS NULL), parent_id
```

**p_categories_products** (junction table)
```sql
- product_id: text (PK, FK → products.id)
- p_categories_id: text (PK, FK → p_categories.id)
Composite PK: (product_id, p_categories_id)
```

**p_collections**
```sql
- id: text (PK)
- title: text (NOT NULL)
- handle: text (NOT NULL, unique where deleted_at IS NULL)
- metadata: jsonb
- created_at, updated_at, deleted_at: timestamp with time zone
Indexes: handle (unique where deleted_at IS NULL), deleted_at
```

**p_options**
```sql
- id: text (PK)
- title: text (NOT NULL)
- product_id: text (NOT NULL, FK → products.id)
- metadata: jsonb
- created_at, updated_at, deleted_at: timestamp with time zone
Indexes: (product_id, title) unique where deleted_at IS NULL, product_id, deleted_at
```

**p_option_values**
```sql
- id: text (PK)
- value: text (NOT NULL)
- option_id: text (FK → p_options.id)
- metadata: jsonb
- created_at, updated_at, deleted_at: timestamp with time zone
Indexes: (option_id, value) unique where deleted_at IS NULL, option_id, deleted_at
```

**p_variants_options** (junction table)
```sql
- variant_id: text (PK, FK → p_variants.id)
- option_value_id: text (NOT NULL, FK → p_option_values.id)
Primary key on variant_id only (each variant maps to one set of option values)
```

**p_tags**
```sql
- id: text (PK)
- value: text (NOT NULL, unique where deleted_at IS NULL)
- metadata: jsonb
- created_at, updated_at, deleted_at: timestamp with time zone
Indexes: value (unique where deleted_at IS NULL), deleted_at
```

**products_tags** (junction table)
```sql
- product_id: text (PK, FK → products.id)
- product_tag_id: text (PK, FK → p_tags.id)
Composite PK: (product_id, product_tag_id)
```

**p_types**
```sql
- id: text (PK)
- value: text (NOT NULL, unique where deleted_at IS NULL)
- metadata: json
- created_at, updated_at, deleted_at: timestamp with time zone
Indexes: value (unique where deleted_at IS NULL), deleted_at
```

**images**
```sql
- id: text (PK)
- url: text (NOT NULL)
- metadata: jsonb
- rank: integer (default: 0)
- product_id: text (NOT NULL)
- created_at, updated_at, deleted_at: timestamp with time zone
Indexes: url, deleted_at, rank
```

**products_images** (junction table)
```sql
- product_id: text (PK, FK → products.id)
- image_id: text (PK, FK → images.id)
- variant_id: text (PK, FK → p_variants.id)
Composite PK: (product_id, variant_id, image_id)
Note: All three fields are foreign keys linking images to specific product-variant combinations
```

#### Key Schema Patterns

1. **Soft Deletion**: All tables use `deleted_at` timestamp for soft deletion
2. **Unique Constraints**: Unique indexes include `WHERE (deleted_at IS NULL)` to allow reuse after deletion
3. **Timestamps**: All tables track `created_at` and `updated_at` automatically
4. **Extensibility**: JSONB `metadata` fields on all entities for custom attributes
5. **Text IDs**: All primary keys use text type for UUIDs or custom ID schemes

### API Contracts *(mandatory if feature exposes APIs)*

#### Product Queries

- **API-001**: GetProduct
  - **Type**: GraphQL Query
  - **Purpose**: Retrieve a single product by ID with all related entities
  - **Input**: `{ id: ID! }`
  - **Output**: `{ product: Product! }` (includes variants, options, categories, tags, collection, type, images)
  - **Authentication**: Required (admin role)
  - **Rate Limit**: 1000 req/min per user
  - **Versioning**: v1

- **API-002**: ListProducts
  - **Type**: GraphQL Query
  - **Purpose**: Retrieve paginated list of products with filtering and sorting
  - **Input**: `{ filter: ProductFilter, sort: ProductSort, pagination: PaginationInput }`
  - **Output**: `{ products: [Product!]!, total: Int!, hasMore: Boolean! }`
  - **Authentication**: Required (admin role)
  - **Rate Limit**: 500 req/min per user
  - **Versioning**: v1

#### Product Mutations

- **API-003**: CreateProduct
  - **Type**: GraphQL Mutation
  - **Purpose**: Create a new product with basic information
  - **Input**: `{ input: CreateProductInput! }` (title, handle, subtitle, description, status, dimensions, metadata, collectionId, typeId)
  - **Output**: `{ product: Product! }`
  - **Authentication**: Required (admin role)
  - **Rate Limit**: 100 req/min per user
  - **Versioning**: v1

- **API-004**: UpdateProduct
  - **Type**: GraphQL Mutation
  - **Purpose**: Update existing product information
  - **Input**: `{ id: ID!, input: UpdateProductInput! }`
  - **Output**: `{ product: Product! }`
  - **Authentication**: Required (admin role)
  - **Rate Limit**: 200 req/min per user
  - **Versioning**: v1

- **API-005**: DeleteProduct
  - **Type**: GraphQL Mutation
  - **Purpose**: Soft-delete a product
  - **Input**: `{ id: ID! }`
  - **Output**: `{ success: Boolean!, deletedAt: DateTime! }`
  - **Authentication**: Required (admin role)
  - **Rate Limit**: 50 req/min per user
  - **Versioning**: v1

#### Variant Mutations

- **API-006**: CreateProductVariant
  - **Type**: GraphQL Mutation
  - **Purpose**: Add a new variant to an existing product
  - **Input**: `{ productId: ID!, input: CreateVariantInput! }` (title, sku, barcode, inventory settings, dimensions)
  - **Output**: `{ variant: ProductVariant! }`
  - **Authentication**: Required (admin role)
  - **Rate Limit**: 200 req/min per user
  - **Versioning**: v1

- **API-007**: UpdateProductVariant
  - **Type**: GraphQL Mutation
  - **Purpose**: Update variant information
  - **Input**: `{ id: ID!, input: UpdateVariantInput! }`
  - **Output**: `{ variant: ProductVariant! }`
  - **Authentication**: Required (admin role)
  - **Rate Limit**: 200 req/min per user
  - **Versioning**: v1

- **API-008**: AssociateVariantOptions
  - **Type**: GraphQL Mutation
  - **Purpose**: Link variant to specific option values
  - **Input**: `{ variantId: ID!, optionValueIds: [ID!]! }`
  - **Output**: `{ variant: ProductVariant! }`
  - **Authentication**: Required (admin role)
  - **Rate Limit**: 200 req/min per user
  - **Versioning**: v1

#### Category Operations

- **API-009**: CreateCategory
  - **Type**: GraphQL Mutation
  - **Purpose**: Create a new product category with optional parent
  - **Input**: `{ input: CreateCategoryInput! }` (name, handle, description, parentId, rank)
  - **Output**: `{ category: ProductCategory! }`
  - **Authentication**: Required (admin role)
  - **Rate Limit**: 100 req/min per user
  - **Versioning**: v1

- **API-010**: GetCategoryTree
  - **Type**: GraphQL Query
  - **Purpose**: Retrieve hierarchical category structure
  - **Input**: `{ rootCategoryId: ID }`
  - **Output**: `{ categories: [CategoryNode!]! }` (tree structure with nested children)
  - **Authentication**: Required (admin role)
  - **Rate Limit**: 500 req/min per user
  - **Versioning**: v1

- **API-011**: AssignProductToCategories
  - **Type**: GraphQL Mutation
  - **Purpose**: Associate product with one or more categories
  - **Input**: `{ productId: ID!, categoryIds: [ID!]! }`
  - **Output**: `{ product: Product! }`
  - **Authentication**: Required (admin role)
  - **Rate Limit**: 200 req/min per user
  - **Versioning**: v1

#### Option Management

- **API-012**: CreateProductOption
  - **Type**: GraphQL Mutation
  - **Purpose**: Define a new option for a product (e.g., Color, Size)
  - **Input**: `{ productId: ID!, title: String!, values: [String!]! }`
  - **Output**: `{ option: ProductOption!, values: [ProductOptionValue!]! }`
  - **Authentication**: Required (admin role)
  - **Rate Limit**: 100 req/min per user
  - **Versioning**: v1

- **API-013**: AddOptionValue
  - **Type**: GraphQL Mutation
  - **Purpose**: Add a new value to an existing option
  - **Input**: `{ optionId: ID!, value: String! }`
  - **Output**: `{ optionValue: ProductOptionValue! }`
  - **Authentication**: Required (admin role)
  - **Rate Limit**: 200 req/min per user
  - **Versioning**: v1

#### Collection Management

- **API-014**: CreateCollection
  - **Type**: GraphQL Mutation
  - **Purpose**: Create a new product collection
  - **Input**: `{ input: CreateCollectionInput! }` (title, handle, metadata)
  - **Output**: `{ collection: ProductCollection! }`
  - **Authentication**: Required (admin role)
  - **Rate Limit**: 100 req/min per user
  - **Versioning**: v1

- **API-015**: ListProductsByCollection
  - **Type**: GraphQL Query
  - **Purpose**: Retrieve all products in a specific collection
  - **Input**: `{ collectionId: ID!, pagination: PaginationInput }`
  - **Output**: `{ products: [Product!]!, total: Int! }`
  - **Authentication**: Required (admin role)
  - **Rate Limit**: 500 req/min per user
  - **Versioning**: v1

#### Tag Management

- **API-016**: CreateTag
  - **Type**: GraphQL Mutation
  - **Purpose**: Create a new reusable product tag
  - **Input**: `{ value: String! }`
  - **Output**: `{ tag: ProductTag! }`
  - **Authentication**: Required (admin role)
  - **Rate Limit**: 100 req/min per user
  - **Versioning**: v1

- **API-017**: AssignTagsToProduct
  - **Type**: GraphQL Mutation
  - **Purpose**: Associate multiple tags with a product
  - **Input**: `{ productId: ID!, tagIds: [ID!]! }`
  - **Output**: `{ product: Product! }`
  - **Authentication**: Required (admin role)
  - **Rate Limit**: 200 req/min per user
  - **Versioning**: v1

#### Image Management

- **API-018**: UploadProductImage
  - **Type**: GraphQL Mutation
  - **Purpose**: Upload and associate an image with a product
  - **Input**: `{ productId: ID!, url: String!, rank: Int, metadata: JSON }`
  - **Output**: `{ image: ProductImage! }`
  - **Authentication**: Required (admin role)
  - **Rate Limit**: 50 req/min per user (due to upload size)
  - **Versioning**: v1

- **API-019**: AssociateImageWithVariant
  - **Type**: GraphQL Mutation
  - **Purpose**: Link an existing image to a specific variant
  - **Input**: `{ imageId: ID!, variantId: ID! }`
  - **Output**: `{ success: Boolean! }`
  - **Authentication**: Required (admin role)
  - **Rate Limit**: 200 req/min per user
  - **Versioning**: v1

### Performance Requirements *(mandatory)*

- **PERF-001**: Product listing API (API-002) response time P95 < 250ms for queries returning up to 100 products
- **PERF-002**: Single product retrieval (API-001) including all related entities P95 < 150ms
- **PERF-003**: Category hierarchy query (API-010) P95 < 200ms for trees up to 5 levels deep with 1000 total categories
- **PERF-004**: Product creation mutation (API-003) P95 < 200ms
- **PERF-005**: Variant creation mutation (API-006) P95 < 150ms
- **PERF-006**: Product search by handle (unique index) P95 < 50ms
- **PERF-007**: System must handle 500 concurrent read operations without degradation
- **PERF-008**: System must handle 100 concurrent write operations (creates/updates) without conflicts
- **PERF-009**: Category mpath queries for hierarchy traversal P95 < 100ms
- **PERF-010**: Bulk product tagging operations (up to 50 products) P95 < 500ms

### Security Requirements *(mandatory if handling sensitive data)*

- **SEC-001**: All product management APIs require JWT authentication with admin role
- **SEC-002**: Product metadata fields must sanitize input to prevent JSON injection attacks
- **SEC-003**: Handle generation must sanitize input to prevent special character exploits
- **SEC-004**: Image URLs must be validated to prevent malicious URL injection
- **SEC-005**: Rate limiting enforced per API endpoint to prevent abuse and DoS attacks
- **SEC-006**: Soft deletion audit trail maintained via deleted_at for compliance and recovery
- **SEC-007**: All product mutations must log user ID, timestamp, and action for audit purposes
- **SEC-008**: Database queries must use parameterized statements to prevent SQL injection
- **SEC-009**: RBAC (Role-Based Access Control) enforced for all product operations (admin vs. customer access)
- **SEC-010**: Product status transitions must be validated to prevent unauthorized publishing

### Accessibility Requirements *(if feature has UI components)*

- **ACC-001**: Product management interface keyboard-navigable with tab order following logical flow
- **ACC-002**: Form fields have associated labels with for/id relationships for screen reader compatibility
- **ACC-003**: Error messages displayed with sufficient color contrast (minimum 4.5:1) and not relying on color alone
- **ACC-004**: Product image upload interface includes alt text input for accessibility
- **ACC-005**: Category tree navigation supports keyboard navigation with arrow keys and Enter/Space for selection
- **ACC-006**: Loading states announce to screen readers using ARIA live regions
- **ACC-007**: Success/error notifications use appropriate ARIA roles (alert, status) for screen reader announcement
- **ACC-008**: Complex multi-select interfaces (categories, tags) provide clear selection state indicators

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Administrators can create a complete product with basic information in under 2 minutes
- **SC-002**: Product search and filtering operations return results in under 1 second for catalogs up to 100,000 products
- **SC-003**: System handles 500 concurrent administrators managing products without performance degradation
- **SC-004**: 95% of product creation attempts succeed on first try without validation errors
- **SC-005**: Category hierarchy queries support up to 10 levels deep without performance issues
- **SC-006**: Product variant generation (all combinations of options) completes in under 5 seconds for up to 100 variants
- **SC-007**: Product catalog operations maintain ACID properties with zero data loss
- **SC-008**: Administrators can organize products into categories 50% faster than previous manual methods
- **SC-009**: API response times meet performance requirements under load (1000 requests per minute)
- **SC-010**: Zero security incidents related to unauthorized product data access or modification

## Assumptions

1. **Authentication System Exists**: We assume a JWT-based authentication system is already in place that provides admin role information
2. **File Storage Service**: We assume a file storage service (S3, cloud storage) is available for image uploads; the database stores only URL references
3. **Database Platform**: PostgreSQL is assumed based on the schema syntax (text type, JSONB, timestamp with time zone)
4. **Handle Generation**: If handle is not provided during product creation, it is auto-generated from the title (slugified)
5. **Soft Deletion Standard**: All entities use soft deletion pattern (deleted_at timestamp) rather than hard deletion
6. **Metadata Extensibility**: JSONB metadata fields allow extensibility without schema changes for entity-specific attributes
7. **Unique Constraint Handling**: Unique indexes include `WHERE (deleted_at IS NULL)` to allow reuse of handles/values after deletion
8. **Materialized Path Maintenance**: Category mpath field is automatically maintained by application logic when hierarchy changes
9. **Concurrency Control**: Optimistic locking using updated_at timestamps for conflict detection on concurrent updates
10. **Default Values**: New products default to "draft" status, discountable=true, is_giftcard=false unless specified otherwise
