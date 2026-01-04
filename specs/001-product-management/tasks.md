# Tasks: Product Management Module

**Input**: Design documents from `/specs/001-product-management/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Following TDD principles - tests are written FIRST and must FAIL before implementation

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Monorepo package**: `packages/modules/product/`
- Paths follow the structure defined in plan.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and configuration

- [x] T001 Create kysely.config.ts in packages/modules/product/ with PostgreSQL connection configuration
- [x] T002 [P] Add migration scripts to package.json (migrate:create, migrate:latest, migrate:status, migrate:down)
- [x] T003 [P] Add type generation script to package.json for kysely-codegen
- [x] T004 [P] Configure vitest.config.ts in packages/modules/product/ for unit and integration tests
- [x] T005 [P] Create test setup file in packages/modules/product/tests/setup.ts with test container configuration
- [x] T006 Create database connection module in packages/modules/product/src/database/connection.ts
- [x] T007 [P] Create utility for handle generation in packages/modules/product/src/utils/handle-generator.ts
- [x] T008 [P] Create utility for soft delete in packages/modules/product/src/utils/soft-delete.ts
- [x] T009 [P] Create utility for category tree operations in packages/modules/product/src/utils/category-tree.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Database Migrations (Order-dependent)

- [x] T010 Create migration for p_collections table: packages/modules/product/migrations/YYYYMMDDHHMMSS_create_p_collections_table.ts
- [x] T011 Create migration for p_types table: packages/modules/product/migrations/YYYYMMDDHHMMSS_create_p_types_table.ts
- [x] T012 Create migration for images table: packages/modules/product/migrations/YYYYMMDDHHMMSS_create_images_table.ts
- [x] T013 Create migration for products table: packages/modules/product/migrations/YYYYMMDDHHMMSS_create_products_table.ts
- [x] T014 Create migration for p_variants table: packages/modules/product/migrations/YYYYMMDDHHMMSS_create_p_variants_table.ts
- [x] T015 Create migration for p_categories table: packages/modules/product/migrations/YYYYMMDDHHMMSS_create_p_categories_table.ts
- [x] T016 Create migration for p_categories_products junction table: packages/modules/product/migrations/YYYYMMDDHHMMSS_create_p_categories_products_table.ts
- [x] T017 Create migration for p_options table: packages/modules/product/migrations/YYYYMMDDHHMMSS_create_p_options_table.ts
- [x] T018 Create migration for p_option_values table: packages/modules/product/migrations/YYYYMMDDHHMMSS_create_p_option_values_table.ts
- [x] T019 Create migration for p_variants_options junction table: packages/modules/product/migrations/YYYYMMDDHHMMSS_create_p_variants_options_table.ts
- [x] T020 Create migration for p_tags table: packages/modules/product/migrations/YYYYMMDDHHMMSS_create_p_tags_table.ts
- [x] T021 Create migration for products_tags junction table: packages/modules/product/migrations/YYYYMMDDHHMMSS_create_products_tags_table.ts
- [x] T022 Create migration for products_images junction table: packages/modules/product/migrations/YYYYMMDDHHMMSS_create_products_images_table.ts

### Run Migrations and Generate Types

- [x] T023 Run all migrations with kysely-ctl migrate:latest
- [x] T024 Generate Kysely types: pnpm kysely-codegen --dialect postgres --out-file packages/modules/product/src/database/types.ts

### GraphQL Schema Foundation

- [x] T025 [P] Create base GraphQL scalars and common types in packages/modules/product/src/schema/common/schema.gql
- [x] T026 Update GraphQL codegen config to process all schema files
- [x] T027 Generate initial GraphQL types: pnpm run generate in packages/modules/product/

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Basic Product Management (Priority: P1) 🎯 MVP

**Goal**: Enable administrators to create, view, update, and delete products with basic information (title, description, status)

**Independent Test**: Create a product with title "Laptop X1" and status "draft", view it in the list, update status to "published", verify update, then soft-delete and confirm it no longer appears in active lists.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T028 [P] [US1] Unit test for ProductService.createProduct in packages/modules/product/tests/unit/services/product.service.test.ts
- [x] T029 [P] [US1] Unit test for ProductService.updateProduct in packages/modules/product/tests/unit/services/product.service.test.ts
- [x] T030 [P] [US1] Unit test for ProductService.deleteProduct in packages/modules/product/tests/unit/services/product.service.test.ts
- [x] T031 [P] [US1] Unit test for ProductService.getProduct in packages/modules/product/tests/unit/services/product.service.test.ts
- [x] T032 [P] [US1] Unit test for ProductService.listProducts in packages/modules/product/tests/unit/services/product.service.test.ts
- [x] T033 [P] [US1] Unit test for handle generator in packages/modules/product/tests/unit/utils/handle-generator.test.ts
- [x] T034 [P] [US1] Integration test for product GraphQL queries in packages/modules/product/tests/integration/resolvers/product.resolver.test.ts
- [x] T035 [P] [US1] Integration test for product GraphQL mutations in packages/modules/product/tests/integration/resolvers/product-mutations.resolver.test.ts

### GraphQL Schema for User Story 1

- [x] T036 [P] [US1] Create Product GraphQL schema in packages/modules/product/src/schema/product/schema.gql (Product type, ProductStatus enum, inputs, payloads)
- [x] T037 [US1] Generate GraphQL types for product schema: pnpm run generate

### Implementation for User Story 1

- [x] T038 [P] [US1] Create product validator in packages/modules/product/src/validators/product.validator.ts
- [x] T039 [P] [US1] Create product query builders in packages/modules/product/src/database/tables/products.ts
- [x] T040 [US1] Implement ProductService.createProduct in packages/modules/product/src/services/product.service.ts
- [x] T041 [US1] Implement ProductService.updateProduct with optimistic locking in packages/modules/product/src/services/product.service.ts
- [x] T042 [US1] Implement ProductService.getProduct in packages/modules/product/src/services/product.service.ts
- [x] T043 [US1] Implement ProductService.listProducts with pagination in packages/modules/product/src/services/product.service.ts
- [x] T044 [US1] Implement ProductService.deleteProduct (soft delete) in packages/modules/product/src/services/product.service.ts
- [x] T045 [P] [US1] Create Query resolver for product in packages/modules/product/src/schema/product/resolvers/Query/product.ts
- [x] T046 [P] [US1] Create Query resolver for products in packages/modules/product/src/schema/product/resolvers/Query/products.ts
- [x] T047 [P] [US1] Create Mutation resolver for createProduct in packages/modules/product/src/schema/product/resolvers/Mutation/createProduct.ts
- [x] T048 [P] [US1] Create Mutation resolver for updateProduct in packages/modules/product/src/schema/product/resolvers/Mutation/updateProduct.ts
- [x] T049 [P] [US1] Create Mutation resolver for deleteProduct in packages/modules/product/src/schema/product/resolvers/Mutation/deleteProduct.ts
- [x] T050 [US1] Register product GraphQL resolvers and typeDefs in packages/modules/product/src/index.ts

**Checkpoint**: At this point, User Story 1 should be fully functional - products can be created, viewed, updated, and deleted independently

---

## Phase 4: User Story 2 - Product Variants Management (Priority: P2)

**Goal**: Enable administrators to manage product variants with different SKUs, barcodes, and inventory settings

**Independent Test**: Create a product, add variants "Medium - Blue" with SKU "SHIRT-M-BL" and "Large - Red" with SKU "SHIRT-L-R", verify unique SKU enforcement, update variant inventory settings, and retrieve variant details with shipping information.

### Tests for User Story 2 ⚠️

- [x] T051 [P] [US2] Unit test for VariantService.createVariant in packages/modules/product/tests/unit/services/variant.service.test.ts
- [x] T052 [P] [US2] Unit test for VariantService.updateVariant in packages/modules/product/tests/unit/services/variant.service.test.ts
- [x] T053 [P] [US2] Unit test for VariantService.deleteVariant in packages/modules/product/tests/unit/services/variant.service.test.ts
- [x] T054 [P] [US2] Unit test for unique SKU/barcode/EAN/UPC validation in packages/modules/product/tests/unit/validators/variant.validator.test.ts
- [x] T055 [P] [US2] Integration test for variant GraphQL operations in packages/modules/product/tests/integration/resolvers/variant.resolver.test.ts

### GraphQL Schema for User Story 2

- [x] T056 [P] [US2] Create Variant GraphQL schema in packages/modules/product/src/schema/variant/schema.gql (ProductVariant type, inputs, payloads)
- [x] T057 [US2] Generate GraphQL types for variant schema: pnpm run generate

### Implementation for User Story 2

- [x] T058 [P] [US2] Create variant validator in packages/modules/product/src/validators/variant.validator.ts
- [x] T059 [P] [US2] Create variant query builders in packages/modules/product/src/database/tables/variants.ts
- [x] T060 [P] [US2] Create query composition for variant with options in packages/modules/product/src/database/queries/variant-with-options.ts
- [x] T061 [US2] Implement VariantService.createVariant in packages/modules/product/src/services/variant.service.ts
- [x] T062 [US2] Implement VariantService.updateVariant in packages/modules/product/src/services/variant.service.ts
- [x] T063 [US2] Implement VariantService.deleteVariant in packages/modules/product/src/services/variant.service.ts
- [x] T064 [US2] Implement VariantService.getVariant in packages/modules/product/src/services/variant.service.ts
- [x] T065 [P] [US2] Create Query resolver for variant in packages/modules/product/src/schema/variant/resolvers/Query/variant.ts
- [x] T066 [P] [US2] Create Mutation resolver for createProductVariant in packages/modules/product/src/schema/variant/resolvers/Mutation/createProductVariant.ts
- [x] T067 [P] [US2] Create Mutation resolver for updateProductVariant in packages/modules/product/src/schema/variant/resolvers/Mutation/updateProductVariant.ts
- [x] T068 [P] [US2] Create Mutation resolver for deleteProductVariant in packages/modules/product/src/schema/variant/resolvers/Mutation/deleteProductVariant.ts
- [x] T069 [US2] Add Product.variants field resolver in packages/modules/product/src/schema/product/resolvers/Product.ts
- [x] T070 [US2] Register variant GraphQL resolvers in packages/modules/product/src/index.ts

**Checkpoint**: User Stories 1 AND 2 both work independently - products with variants can be managed

---

## Phase 5: User Story 3 - Product Organization with Categories (Priority: P3)

**Goal**: Enable administrators to organize products into hierarchical categories for browsing and filtering

**Independent Test**: Create root category "Electronics", child category "Laptops" under it, assign a product to both "Laptops" and "Gaming" categories, query products by category hierarchy using recursive CTEs.

### Tests for User Story 3 ⚠️

- [x] T071 [P] [US3] Unit test for CategoryService.createCategory in packages/modules/product/tests/unit/services/category.service.test.ts
- [x] T072 [P] [US3] Unit test for CategoryService.updateCategory in packages/modules/product/tests/unit/services/category.service.test.ts
- [x] T073 [P] [US3] Unit test for CategoryService.getCategoryTree in packages/modules/product/tests/unit/services/category.service.test.ts
- [x] T074 [P] [US3] Unit test for category tree utilities in packages/modules/product/tests/unit/utils/category-tree.test.ts
- [x] T075 [P] [US3] Unit test for cycle prevention in category hierarchy in packages/modules/product/tests/unit/validators/category.validator.test.ts
- [x] T076 [P] [US3] Integration test for category GraphQL operations in packages/modules/product/tests/integration/resolvers/category.resolver.test.ts
- [x] T077 [P] [US3] Integration test for recursive CTE category queries in packages/modules/product/tests/integration/category-hierarchy.test.ts

### GraphQL Schema for User Story 3

- [x] T078 [P] [US3] Create Category GraphQL schema in packages/modules/product/src/schema/category/schema.gql (ProductCategory type, CategoryNode type, inputs)
- [x] T079 [US3] Generate GraphQL types for category schema: pnpm run generate

### Implementation for User Story 3

- [x] T080 [P] [US3] Create category validator in packages/modules/product/src/validators/category.validator.ts
- [x] T081 [P] [US3] Create category query builders in packages/modules/product/src/database/tables/categories.ts
- [x] T082 [P] [US3] Create recursive CTE query for category tree in packages/modules/product/src/database/queries/category-tree.ts
- [x] T083 [US3] Implement CategoryService.createCategory in packages/modules/product/src/services/category.service.ts
- [x] T084 [US3] Implement CategoryService.updateCategory in packages/modules/product/src/services/category.service.ts
- [x] T085 [US3] Implement CategoryService.deleteCategory with cascade check in packages/modules/product/src/services/category.service.ts
- [x] T086 [US3] Implement CategoryService.getCategoryTree using recursive CTE in packages/modules/product/src/services/category.service.ts
- [x] T087 [US3] Implement CategoryService.assignProductToCategories in packages/modules/product/src/services/category.service.ts
- [x] T088 [P] [US3] Create Query resolver for category in packages/modules/product/src/schema/category/resolvers/Query/category.ts
- [x] T089 [P] [US3] Create Query resolver for categoryTree in packages/modules/product/src/schema/category/resolvers/Query/categoryTree.ts
- [x] T090 [P] [US3] Create Mutation resolver for createCategory in packages/modules/product/src/schema/category/resolvers/Mutation/createCategory.ts
- [x] T091 [P] [US3] Create Mutation resolver for updateCategory in packages/modules/product/src/schema/category/resolvers/Mutation/updateCategory.ts
- [x] T092 [P] [US3] Create Mutation resolver for deleteCategory in packages/modules/product/src/schema/category/resolvers/Mutation/deleteCategory.ts
- [x] T093 [P] [US3] Create Mutation resolver for assignProductToCategories in packages/modules/product/src/schema/category/resolvers/Mutation/assignProductToCategories.ts
- [x] T094 [US3] Add Product.categories field resolver in packages/modules/product/src/schema/product/resolvers/Product.ts
- [x] T095 [US3] Add ProductCategory.image field resolver in packages/modules/product/src/schema/category/resolvers/ProductCategory.ts
- [x] T096 [US3] Register category GraphQL resolvers in packages/modules/product/src/index.ts

**Checkpoint**: User Stories 1, 2, AND 3 all work independently - products can be organized in hierarchical categories

---

## Phase 6: User Story 4 - Product Options and Option Values (Priority: P4)

**Goal**: Enable administrators to define product options (Color, Size) and values for structured variant configuration

**Independent Test**: Create product with option "Size" and values "Small", "Medium", "Large", create variants and assign option values, verify variant-option-value relationships, test variant generation for all combinations.

### Tests for User Story 4 ⚠️

- [x] T097 [P] [US4] Unit test for OptionService.createProductOption in packages/modules/product/tests/unit/services/option.service.test.ts
- [x] T098 [P] [US4] Unit test for OptionService.addOptionValue in packages/modules/product/tests/unit/services/option.service.test.ts
- [x] T099 [P] [US4] Unit test for OptionService.associateVariantOptions in packages/modules/product/tests/unit/services/option.service.test.ts
- [x] T100 [P] [US4] Unit test for variant generation with option combinations in packages/modules/product/tests/unit/services/option.service.test.ts
- [x] T101 [P] [US4] Integration test for option GraphQL operations in packages/modules/product/tests/integration/resolvers/option.resolver.test.ts

### GraphQL Schema for User Story 4

- [x] T102 [P] [US4] Create Option GraphQL schema in packages/modules/product/src/schema/option/schema.gql (ProductOption, ProductOptionValue types, inputs)
- [x] T103 [US4] Generate GraphQL types for option schema: pnpm run generate

### Implementation for User Story 4

- [x] T104 [P] [US4] Create option query builders in packages/modules/product/src/database/tables/options.ts
- [x] T105 [P] [US4] Create option value query builders in packages/modules/product/src/database/tables/option-values.ts
- [x] T106 [US4] Implement OptionService.createProductOption in packages/modules/product/src/services/option.service.ts
- [x] T107 [US4] Implement OptionService.addOptionValue in packages/modules/product/src/services/option.service.ts
- [x] T108 [US4] Implement OptionService.deleteOptionValue with variant check in packages/modules/product/src/services/option.service.ts
- [x] T109 [US4] Implement OptionService.associateVariantOptions in packages/modules/product/src/services/option.service.ts
- [x] T110 [P] [US4] Create Query resolver for productOptions in packages/modules/product/src/schema/option/resolvers/Query/productOptions.ts
- [x] T111 [P] [US4] Create Mutation resolver for createProductOption in packages/modules/product/src/schema/option/resolvers/Mutation/createProductOption.ts
- [x] T112 [P] [US4] Create Mutation resolver for addOptionValue in packages/modules/product/src/schema/option/resolvers/Mutation/addOptionValue.ts
- [x] T113 [P] [US4] Create Mutation resolver for deleteOptionValue in packages/modules/product/src/schema/option/resolvers/Mutation/deleteOptionValue.ts
- [x] T114 [P] [US4] Create Mutation resolver for associateVariantOptions in packages/modules/product/src/schema/variant/resolvers/Mutation/associateVariantOptions.ts
- [x] T115 [US4] Add Product.options field resolver in packages/modules/product/src/schema/product/resolvers/Product.ts
- [x] T116 [US4] Add ProductVariant.optionValues field resolver in packages/modules/product/src/schema/variant/resolvers/ProductVariant.ts
- [x] T117 [US4] Register option GraphQL resolvers in packages/modules/product/src/index.ts

**Checkpoint**: Product options enable structured variant configuration - all previous stories still work independently

---

## Phase 7: User Story 5 - Product Collections and Tags (Priority: P5)

**Goal**: Enable administrators to create collections and apply tags for curated product sets and flexible filtering

**Independent Test**: Create collection "Summer Collection 2025", assign products to it, create tags "organic", "vegan", "sustainable", apply multiple tags to products, query products by collection and tag combinations.

### Tests for User Story 5 ⚠️

- [x] T118 [P] [US5] Unit test for CollectionService.createCollection in packages/modules/product/tests/unit/services/collection.service.test.ts
- [x] T119 [P] [US5] Unit test for CollectionService.updateCollection in packages/modules/product/tests/unit/services/collection.service.test.ts
- [x] T120 [P] [US5] Unit test for TagService.createTag in packages/modules/product/tests/unit/services/tag.service.test.ts
- [x] T121 [P] [US5] Unit test for TagService.assignTagsToProduct in packages/modules/product/tests/unit/services/tag.service.test.ts
- [x] T122 [P] [US5] Integration test for collection GraphQL operations in packages/modules/product/tests/integration/resolvers/collection.resolver.test.ts
- [x] T123 [P] [US5] Integration test for tag GraphQL operations in packages/modules/product/tests/integration/resolvers/tag.resolver.test.ts

### GraphQL Schema for User Story 5

- [x] T124 [P] [US5] Create Collection GraphQL schema in packages/modules/product/src/schema/collection/schema.gql (ProductCollection type, inputs)
- [x] T125 [P] [US5] Create Tag GraphQL schema in packages/modules/product/src/schema/tag/schema.gql (ProductTag type, inputs, filters)
- [x] T126 [US5] Generate GraphQL types for collection and tag schemas: pnpm run generate

### Implementation for User Story 5

- [x] T127 [P] [US5] Create collection query builders in packages/modules/product/src/database/tables/collections.ts
- [x] T128 [P] [US5] Create tag query builders in packages/modules/product/src/database/tables/tags.ts
- [x] T129 [US5] Implement CollectionService.createCollection in packages/modules/product/src/services/collection.service.ts
- [x] T130 [US5] Implement CollectionService.updateCollection in packages/modules/product/src/services/collection.service.ts
- [x] T131 [US5] Implement CollectionService.deleteCollection in packages/modules/product/src/services/collection.service.ts
- [x] T132 [US5] Implement CollectionService.listProductsByCollection in packages/modules/product/src/services/collection.service.ts
- [x] T133 [US5] Implement TagService.createTag in packages/modules/product/src/services/tag.service.ts
- [x] T134 [US5] Implement TagService.assignTagsToProduct in packages/modules/product/src/services/tag.service.ts
- [x] T135 [US5] Implement TagService.deleteTag in packages/modules/product/src/services/tag.service.ts
- [x] T136 [P] [US5] Create Query resolver for collection in packages/modules/product/src/schema/collection/resolvers/Query/collection.ts
- [x] T137 [P] [US5] Create Query resolver for productsByCollection in packages/modules/product/src/schema/collection/resolvers/Query/productsByCollection.ts
- [x] T138 [P] [US5] Create Query resolver for tag in packages/modules/product/src/schema/tag/resolvers/Query/tag.ts
- [x] T139 [P] [US5] Create Query resolver for tags in packages/modules/product/src/schema/tag/resolvers/Query/tags.ts
- [x] T140 [P] [US5] Create Mutation resolver for createCollection in packages/modules/product/src/schema/collection/resolvers/Mutation/createCollection.ts
- [x] T141 [P] [US5] Create Mutation resolver for updateCollection in packages/modules/product/src/schema/collection/resolvers/Mutation/updateCollection.ts
- [x] T142 [P] [US5] Create Mutation resolver for deleteCollection in packages/modules/product/src/schema/collection/resolvers/Mutation/deleteCollection.ts
- [x] T143 [P] [US5] Create Mutation resolver for createTag in packages/modules/product/src/schema/tag/resolvers/Mutation/createTag.ts
- [x] T144 [P] [US5] Create Mutation resolver for assignTagsToProduct in packages/modules/product/src/schema/tag/resolvers/Mutation/assignTagsToProduct.ts
- [x] T145 [P] [US5] Create Mutation resolver for deleteTag in packages/modules/product/src/schema/tag/resolvers/Mutation/deleteTag.ts
- [x] T146 [US5] Add Product.collection field resolver in packages/modules/product/src/schema/product/resolvers/Product.ts
- [x] T147 [US5] Add Product.tags field resolver in packages/modules/product/src/schema/product/resolvers/Product.ts
- [x] T148 [US5] Register collection GraphQL resolvers in packages/modules/product/src/index.ts
- [x] T149 [US5] Register tag GraphQL resolvers in packages/modules/product/src/index.ts

**Checkpoint**: Collections and tags enable flexible product grouping - all previous stories remain independent

---

## Phase 8: User Story 6 - Product Types (Priority: P6)

**Goal**: Enable administrators to categorize products by type (Physical, Digital, Service) for type-specific business rules

**Independent Test**: Create product type "Digital Download", assign to products, verify type-specific validation (e.g., shipping fields not required), query products by type efficiently.

### Tests for User Story 6 ⚠️

- [x] T150 [P] [US6] Unit test for TypeService.createProductType in packages/modules/product/tests/unit/services/type.service.test.ts
- [x] T151 [P] [US6] Unit test for TypeService.updateProductType in packages/modules/product/tests/unit/services/type.service.test.ts
- [x] T152 [P] [US6] Unit test for TypeService.deleteProductType with product count check in packages/modules/product/tests/unit/services/type.service.test.ts
- [x] T153 [P] [US6] Integration test for type GraphQL operations in packages/modules/product/tests/integration/resolvers/type.resolver.test.ts

### GraphQL Schema for User Story 6

- [x] T154 [P] [US6] Create Type GraphQL schema in packages/modules/product/src/schema/type/schema.gql (ProductType type, inputs)
- [x] T155 [US6] Generate GraphQL types for type schema: pnpm run generate

### Implementation for User Story 6

- [x] T156 [P] [US6] Create type query builders in packages/modules/product/src/database/tables/types.ts
- [x] T157 [US6] Implement TypeService.createProductType in packages/modules/product/src/services/type.service.ts
- [x] T158 [US6] Implement TypeService.updateProductType in packages/modules/product/src/services/type.service.ts
- [x] T159 [US6] Implement TypeService.deleteProductType with cascade check in packages/modules/product/src/services/type.service.ts
- [x] T160 [US6] Implement TypeService.listProductTypes in packages/modules/product/src/services/type.service.ts
- [x] T161 [P] [US6] Create Query resolver for productType in packages/modules/product/src/schema/type/resolvers/Query/productType.ts
- [x] T162 [P] [US6] Create Query resolver for productTypes in packages/modules/product/src/schema/type/resolvers/Query/productTypes.ts
- [x] T163 [P] [US6] Create Mutation resolver for createProductType in packages/modules/product/src/schema/type/resolvers/Mutation/createProductType.ts
- [x] T164 [P] [US6] Create Mutation resolver for updateProductType in packages/modules/product/src/schema/type/resolvers/Mutation/updateProductType.ts
- [x] T165 [P] [US6] Create Mutation resolver for deleteProductType in packages/modules/product/src/schema/type/resolvers/Mutation/deleteProductType.ts
- [x] T166 [US6] Add Product.type field resolver in packages/modules/product/src/schema/product/resolvers/Product.ts
- [x] T167 [US6] Register type GraphQL resolvers in packages/modules/product/src/index.ts

**Checkpoint**: Product types enable type-specific business logic - all stories work independently

---

## Phase 9: User Story 7 - Product Images Management (Priority: P7)

**Goal**: Enable administrators to upload and manage product images with ranking and variant-specific associations

**Independent Test**: Upload multiple images for a product, set rank order, associate specific images with specific variants, set product thumbnail, reorder images, verify image-product-variant relationships.

### Tests for User Story 7 ⚠️

- [x] T168 [P] [US7] Unit test for ImageService.uploadProductImage in packages/modules/product/tests/unit/services/image.service.test.ts
- [x] T169 [P] [US7] Unit test for ImageService.associateImageWithVariant in packages/modules/product/tests/unit/services/image.service.test.ts
- [x] T170 [P] [US7] Unit test for ImageService.deleteProductImage with cascade check in packages/modules/product/tests/unit/services/image.service.test.ts
- [x] T171 [P] [US7] Integration test for image GraphQL operations in packages/modules/product/tests/integration/resolvers/image.resolver.test.ts

### GraphQL Schema for User Story 7

- [x] T172 [P] [US7] Create Image GraphQL schema in packages/modules/product/src/schema/image/schema.gql (ProductImage type, inputs)
- [x] T173 [US7] Generate GraphQL types for image schema: pnpm run generate

### Implementation for User Story 7

- [x] T174 [P] [US7] Create image query builders in packages/modules/product/src/database/tables/images.ts
- [x] T175 [US7] Implement ImageService.uploadProductImage in packages/modules/product/src/services/image.service.ts
- [x] T176 [US7] Implement ImageService.associateImageWithVariant in packages/modules/product/src/services/image.service.ts
- [x] T177 [US7] Implement ImageService.deleteProductImage with cascade check in packages/modules/product/src/services/image.service.ts
- [x] T178 [US7] Implement ImageService.reorderImages in packages/modules/product/src/services/image.service.ts
- [x] T179 [P] [US7] Create Mutation resolver for uploadProductImage in packages/modules/product/src/schema/image/resolvers/Mutation/uploadProductImage.ts
- [x] T180 [P] [US7] Create Mutation resolver for associateImageWithVariant in packages/modules/product/src/schema/image/resolvers/Mutation/associateImageWithVariant.ts
- [x] T181 [P] [US7] Create Mutation resolver for deleteProductImage in packages/modules/product/src/schema/image/resolvers/Mutation/deleteProductImage.ts
- [x] T182 [US7] Add Product.images field resolver in packages/modules/product/src/schema/product/resolvers/Product.ts
- [x] T183 [US7] Add ProductVariant.images field resolver in packages/modules/product/src/schema/variant/resolvers/ProductVariant.ts
- [x] T184 [US7] Add ProductCategory.image field resolver (already created in US3, verify implementation)
- [x] T185 [US7] Register image GraphQL resolvers in packages/modules/product/src/index.ts

**Checkpoint**: All 7 user stories complete - full product management system functional

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T186 [P] Add structured logging across all services in packages/modules/product/src/services/
- [ ] T187 [P] Add GraphQL error handling middleware in packages/modules/product/src/schema/
- [ ] T188 [P] Implement query performance monitoring (RED metrics) in packages/modules/product/src/database/
- [ ] T189 [P] Add API rate limiting configuration in packages/modules/product/src/
- [ ] T190 [P] Create database connection health check in packages/modules/product/src/database/health-check.ts
- [ ] T191 Optimize recursive CTE queries for category hierarchy with EXPLAIN ANALYZE
- [ ] T192 [P] Add caching layer for frequently accessed category trees
- [ ] T193 [P] Implement DataLoader pattern for N+1 query prevention (if needed)
- [ ] T194 [P] Add comprehensive API documentation in packages/modules/product/README.md
- [ ] T195 [P] Create migration rollback guide in packages/modules/product/migrations/README.md
- [ ] T196 Validate all user stories work independently (run independent tests for US1-US7)
- [ ] T197 Run full test suite: pnpm run test in packages/modules/product/
- [ ] T198 Validate quickstart.md instructions work end-to-end
- [ ] T199 Performance test: verify P95 response times meet specification (<300ms)
- [ ] T200 Security audit: verify JWT authentication on all mutations, input sanitization

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-9)**: All depend on Foundational phase completion
  - US1 (P1): Can start after Foundational - No dependencies on other stories ✅ MVP
  - US2 (P2): Can start after Foundational - Depends on US1 (Product entity) but independently testable
  - US3 (P3): Can start after Foundational - Independent of US1/US2
  - US4 (P4): Can start after Foundational - Enhances US2 (variants) but independently testable
  - US5 (P5): Can start after Foundational - Enhances US1 (products) but independently testable
  - US6 (P6): Can start after Foundational - Enhances US1 (products) but independently testable
  - US7 (P7): Can start after Foundational - Can reference US1/US2/US3 but independently testable
- **Polish (Phase 10)**: Depends on desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: ✅ MVP - Complete independence, only depends on Foundational phase
- **User Story 2 (P2)**: Logically depends on US1 (needs Product entity) but service layer abstracts this
- **User Story 3 (P3)**: Independent - can be implemented in parallel with US1/US2
- **User Story 4 (P4)**: Enhances US2 but can be tested independently
- **User Story 5 (P5)**: Enhances US1 but can be tested independently
- **User Story 6 (P6)**: Enhances US1 but can be tested independently
- **User Story 7 (P7)**: References US1/US2/US3 for image associations but independently testable

### Within Each User Story

1. Tests MUST be written FIRST and FAIL before implementation (TDD)
2. GraphQL schema → Generate types → Implementation
3. Validators before services
4. Query builders before services
5. Services before resolvers
6. Field resolvers after main resolvers
7. Registration last

### Parallel Opportunities

**Setup (Phase 1)**: Tasks T002-T009 can run in parallel

**Foundational (Phase 2)**: 
- Migrations T010-T022 must run sequentially (order-dependent)
- T023 (run migrations) is blocking
- T024-T027 can run after T023

**User Stories**:
- Once Foundational completes, US1, US3, US5, US6 can start in parallel (no inter-dependencies)
- US2 should wait for US1 Product entity to exist
- US4 should wait for US2 Variant entity to exist
- US7 can start once US1, US2, US3 have created their entities

**Within Each Story**:
- All tests marked [P] can run in parallel
- All GraphQL schema files marked [P] can be created in parallel
- All validators marked [P] can be created in parallel
- All query builders marked [P] can be created in parallel
- All resolvers marked [P] can be created in parallel

---

## Parallel Example: User Story 1

```bash
# After tests written and failing, launch all parallel implementation tasks:

# Validators and query builders (parallel)
Task T038: "Create product validator in packages/modules/product/src/validators/product.validator.ts"
Task T039: "Create product query builders in packages/modules/product/src/database/tables/products.ts"

# After service is complete, launch all resolvers (parallel)
Task T045: "Create Query resolver for product in packages/modules/product/src/schema/product/resolvers/Query/product.ts"
Task T046: "Create Query resolver for products in packages/modules/product/src/schema/product/resolvers/Query/products.ts"
Task T047: "Create Mutation resolver for createProduct in packages/modules/product/src/schema/product/resolvers/Mutation/createProduct.ts"
Task T048: "Create Mutation resolver for updateProduct in packages/modules/product/src/schema/product/resolvers/Mutation/updateProduct.ts"
Task T049: "Create Mutation resolver for deleteProduct in packages/modules/product/src/schema/product/resolvers/Mutation/deleteProduct.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T009)
2. Complete Phase 2: Foundational (T010-T027) - CRITICAL, blocks everything
3. Complete Phase 3: User Story 1 (T028-T050)
4. **STOP and VALIDATE**: Test User Story 1 independently using the independent test criteria
5. Deploy/demo MVP - basic product CRUD is functional!

**MVP Deliverable**: Administrators can create, view, update, and delete products with basic information. This is a complete, usable feature.

### Incremental Delivery (Recommended)

1. **Sprint 1**: Setup + Foundational + US1 (P1) → **MVP deployed!**
2. **Sprint 2**: Add US2 (P2 - Variants) → Test independently → Deploy (products with variants)
3. **Sprint 3**: Add US3 (P3 - Categories) → Test independently → Deploy (organized catalog)
4. **Sprint 4**: Add US4 (P4 - Options) → Test independently → Deploy (structured variants)
5. **Sprint 5**: Add US5 (P5 - Collections/Tags) → Test independently → Deploy (merchandising)
6. **Sprint 6**: Add US6 (P6 - Types) → Test independently → Deploy (type-specific rules)
7. **Sprint 7**: Add US7 (P7 - Images) → Test independently → Deploy (visual catalog)
8. **Sprint 8**: Polish (Phase 10) → Final optimizations

Each sprint delivers incremental value without breaking previous functionality.

### Parallel Team Strategy

With 3+ developers after Foundational phase completes:

**Wave 1** (parallel):
- Developer A: User Story 1 (P1) - MVP
- Developer B: User Story 3 (P3) - Categories (independent)
- Developer C: User Story 5 (P5) - Collections/Tags (independent)

**Wave 2** (after US1 complete):
- Developer A: User Story 2 (P2) - Variants (needs US1 Product)
- Developer B: User Story 6 (P6) - Types (independent)
- Developer C: Polish and optimization

**Wave 3** (after US2 complete):
- Developer A: User Story 4 (P4) - Options (needs US2 Variant)
- Developer B: User Story 7 (P7) - Images
- Developer C: Cross-cutting concerns

---

## Task Statistics

- **Total Tasks**: 200
- **Setup Phase**: 9 tasks
- **Foundational Phase**: 18 tasks (BLOCKING)
- **User Story 1 (P1)**: 23 tasks (15 implementation + 8 tests)
- **User Story 2 (P2)**: 20 tasks (15 implementation + 5 tests)
- **User Story 3 (P3)**: 26 tasks (19 implementation + 7 tests)
- **User Story 4 (P4)**: 21 tasks (17 implementation + 4 tests)
- **User Story 5 (P5)**: 32 tasks (27 implementation + 5 tests)
- **User Story 6 (P6)**: 18 tasks (14 implementation + 4 tests)
- **User Story 7 (P7)**: 18 tasks (14 implementation + 4 tests)
- **Polish Phase**: 15 tasks

**Parallel Opportunities**: ~120 tasks marked [P] can run in parallel within their phase

**MVP Scope**: 50 tasks (Setup + Foundational + US1)

---

## Notes

- **[P]** tasks = different files, no dependencies within phase - can run in parallel
- **[Story]** label (US1-US7) maps task to specific user story for traceability
- Each user story is independently completable and testable per specification
- **TDD Approach**: All tests written FIRST, must FAIL before implementation
- Verify tests fail before implementing (Red → Green → Refactor)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- **File Paths**: All paths are exact and based on plan.md structure
- **Kysely**: Use kysely-ctl for all migration operations
- **GraphQL**: Use @eddeee888/gcg-typescript-resolver-files code generator
- **Testing**: Vitest with test containers for integration tests

---

## Format Validation ✅

All 200 tasks follow the strict checklist format:
- ✅ All tasks start with `- [ ]`
- ✅ All tasks have sequential IDs (T001-T200)
- ✅ All parallelizable tasks marked with `[P]`
- ✅ All user story tasks marked with `[US1]` through `[US7]`
- ✅ All tasks include exact file paths
- ✅ All tasks are actionable and specific enough for LLM execution

