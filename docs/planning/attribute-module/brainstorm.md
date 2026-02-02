# Brainstorm: Attribute Module

- **Date:** 2026-01-30
- **Participants:** Claude, User
- **Status:** Ready for PRD

---

## Problem Statement

### The Problem
c-zo needs a flexible, dynamic attribute system that can be used across multiple entities (products, pages, channels, etc.) without tight coupling to any specific module.

### Who's Affected
- **Merchants**: Need to define custom attributes for their products and content
- **Developers**: Need a reusable system to add attribute support to any entity
- **Customers**: Benefit from rich filtering and faceted search capabilities

### Current Solutions
- The existing `ProductOption` system is limited to variant differentiation
- The `metadata` JSON field lacks structure, validation, and queryability
- No standardized way to add custom fields to entities

### Why Now
- The Product module needs to be rebuilt with proper attribute support
- Channel module (in planning) will need channel-specific metadata
- A generic system enables faster development of future modules

---

## User Insights

### Primary Users
**User Type:** Module developers (internal)
**Goals:** Quickly add attribute support to any entity type
**Pain Points:** Recreating attribute logic in each module
**Context:** When building new modules that need custom fields

### Secondary Users
- **User Type:** Merchants
- **Goals:** Define custom product attributes, enable filtering
- **Pain Points:** Rigid product schemas that don't fit their catalog
- **Context:** Managing diverse product catalogs with varying attributes

### Key Insights
- Saleor's attribute system is a proven model with 11 input types
- Decoupling attribute definitions from consumers enables reusability
- Predefined choices (DROPDOWN/MULTISELECT) need different storage than free-form values

---

## Ideas Explored

### Solution Ideas
1. **EAV Pattern (Entity-Attribute-Value)** - Generic tables for any entity
2. **Saleor-inspired typed attributes** - Structured types with validation
3. **JSON Schema validation** - Store in metadata with schema enforcement
4. **Hybrid approach** - Typed attribute definitions + consumer-managed value tables

### Evaluation Matrix
| Idea | Impact | Effort | Risk | Score |
|------|--------|--------|------|-------|
| EAV Pattern | High | Low | Med | Good for flexibility, poor for queries |
| Saleor-inspired | High | Med | Low | Proven, structured |
| JSON Schema | Med | Low | Med | Less queryable |
| Hybrid approach | High | Med | Low | Best of both worlds |

### Selected Approach
**Hybrid approach** combining:
- Saleor-inspired typed attributes for structure and validation
- Predefined choices (`attribute_values`, `attribute_swatch_values`, `attribute_reference_values`) and typed dynamic values (`attribute_*_values`) stored centrally in @czo/attribute
- Consumer modules create their own junction tables for linking entities to attributes
- Attributes are entity-agnostic (no `entity_type`) - same attribute can be used across products, pages, etc.

### Discarded Ideas
- Pure EAV: Performance concerns with complex queries
- JSON Schema: Limited filtering capabilities in PostgreSQL

---

## Scope Definition

### In Scope (MVP)
- [ ] Attribute CRUD (create, read, update, delete)
- [ ] 11 attribute types: DROPDOWN, MULTISELECT, PLAIN_TEXT, RICH_TEXT, NUMERIC, BOOLEAN, FILE, REFERENCE, SWATCH, DATE, DATE_TIME
- [ ] `attribute_values` table for DROPDOWN/MULTISELECT choices
- [ ] `attribute_swatch_values` table for SWATCH (color + file)
- [ ] `attribute_reference_values` table for REFERENCE (predefined entity references)
- [ ] Typed value tables in module: `attribute_text_values`, `attribute_numeric_values`, `attribute_boolean_values`, `attribute_date_values`, `attribute_file_values`
- [ ] Value reordering (position) for DROPDOWN/MULTISELECT/SWATCH/REFERENCE
- [ ] External identifiers (`external_source`, `external_id`) on all tables for external system integration
- [ ] Multi-consumer support (no entity_type on attributes)
- [ ] Reference type with `reference_entity` field
- [ ] Unit support for NUMERIC type
- [ ] Validation per attribute type
- [ ] Hard delete on attributes and values (consumers manage their relations)
- [ ] GraphQL API for attribute management
- [ ] Filtering/faceted search support

### Out of Scope (Future)
- AttributeGroup for organizing attributes
- Translations (i18n) for attributes and values
- Granular permissions per attribute
- Bulk import/export
- Attribute change history/audit log
- Attribute templates per ProductType (handled by Product module)
- Custom/extensible `type` values (architecture prepared, implementation later)

### Non-Goals
- Direct integration with any specific entity (consumers register themselves)
- Replacing the metadata JSON field (attributes complement it)
- Managing how consumers store assigned attributes (their responsibility)

### Success Criteria
- Any module can add attribute support by registering an entity type
- All 10 input types work with proper validation
- Attributes are queryable for filtering/faceted search
- No tight coupling between attribute module and consumers

---

## Architecture

### Module Structure
```
packages/modules/attribute/
├── src/
│   ├── module.ts              # defineNitroModule
│   ├── plugins/
│   │   └── index.ts           # IoC container setup
│   ├── services/
│   │   ├── attribute.service.ts
│   │   ├── attribute-value.service.ts
│   │   └── entity-registry.service.ts
│   ├── schema/
│   │   ├── attribute/
│   │   ├── attribute-value/
│   │   └── types/
│   └── database/
│       └── tables/
├── migrations/
└── tests/
```

### Database Schema

**Table: `attributes`**
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | VARCHAR(255) | Display name |
| slug | VARCHAR(255) | Unique identifier |
| type | ENUM | DROPDOWN, MULTISELECT, PLAIN_TEXT, RICH_TEXT, NUMERIC, BOOLEAN, FILE, REFERENCE, SWATCH, DATE, DATE_TIME |
| reference_entity | VARCHAR(100) | Required for REFERENCE type, null otherwise |
| unit | ENUM | Unit for NUMERIC type (extensible enum: KILOGRAM, METER, LITER, etc.) |
| is_required | BOOLEAN | Whether value is mandatory |
| is_filterable | BOOLEAN | Whether attribute is used in faceted search |
| external_source | VARCHAR(100) | External system identifier (nullable) |
| external_id | VARCHAR(255) | ID in external system (nullable) |
| metadata | JSONB | Additional config |
| version | INT | Optimistic locking |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Note:** No `entity_type` column - attributes are entity-agnostic and can be used by multiple consumers simultaneously.

**Table: `attribute_values`** (for DROPDOWN/MULTISELECT only)
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| attribute_id | UUID | FK to attributes |
| slug | VARCHAR(255) | Unique key per attribute (auto-generated from value if not provided) |
| value | VARCHAR(255) | Display label |
| position | INT | Display order |
| external_source | VARCHAR(100) | External system identifier (nullable) |
| external_id | VARCHAR(255) | ID in external system (nullable) |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Table: `attribute_swatch_values`** (for SWATCH type)
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| attribute_id | UUID | FK to attributes |
| slug | VARCHAR(255) | Unique key per attribute (auto-generated from value if not provided) |
| value | VARCHAR(255) | Display label |
| color | VARCHAR(7) | Hex color (nullable) |
| file_url | VARCHAR(2048) | File URL - image, pattern, etc. (nullable) |
| mimetype | VARCHAR(100) | MIME type (required if file_url present) |
| position | INT | Display order |
| external_source | VARCHAR(100) | External system identifier (nullable) |
| external_id | VARCHAR(255) | ID in external system (nullable) |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Table: `attribute_reference_values`** (for REFERENCE type)
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| attribute_id | UUID | FK to attributes |
| slug | VARCHAR(255) | Unique key per attribute (auto-generated from value if not provided) |
| value | VARCHAR(255) | Display label (entity name) |
| reference_id | UUID | ID of referenced entity (unique per attribute) |
| position | INT | Display order |
| external_source | VARCHAR(100) | External system identifier (nullable) |
| external_id | VARCHAR(255) | ID in external system (nullable) |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Tables: `attribute_<type>_values`** (in @czo/attribute, used by consumers)
These tables are created in the attribute module and used by consumers to store dynamic values:

- `attribute_text_values` (PLAIN_TEXT, RICH_TEXT) - structure spécifique
- `attribute_numeric_values` (NUMERIC)
- `attribute_boolean_values` (BOOLEAN)
- `attribute_date_values` (DATE, DATE_TIME)
- `attribute_file_values` (FILE) - structure spécifique (file_url + mimetype)

**Table: `attribute_text_values`** (structure spécifique)
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| attribute_id | UUID | FK to attributes |
| plain | TEXT | Texte brut (PLAIN_TEXT et RICH_TEXT) |
| rich | JSONB | Texte structuré JSON (RICH_TEXT uniquement, null pour PLAIN_TEXT) |
| external_source | VARCHAR(100) | External system identifier (nullable) |
| external_id | VARCHAR(255) | ID in external system (nullable) |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Common structure** (numeric, boolean, date):
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| attribute_id | UUID | FK to attributes |
| value | (typed) | NUMERIC, BOOLEAN, TIMESTAMP |
| external_source | VARCHAR(100) | External system identifier (nullable) |
| external_id | VARCHAR(255) | ID in external system (nullable) |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Note:** Hard delete on all value tables. Consumers are responsible for managing their relations when values are deleted.

### Consumer Integration Pattern

Consumers create **two junction tables**:
1. **Entity ↔ Attributes** (which attributes are assigned)
2. **Entity ↔ Attribute Values** (which values are selected, with type discriminator)

```typescript
// In @czo/product module - Drizzle schema

// Table 1: Which attributes are assigned to the product
export const productAttributes = pgTable('product_attributes', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  attributeId: uuid('attribute_id').notNull().references(() => attributes.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  unique: unique().on(table.productId, table.attributeId),
}))

// Table 2: Which values are assigned (polymorphic with type discriminator)
export const productAttributeValues = pgTable('product_attribute_values', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  attributeId: uuid('attribute_id').notNull().references(() => attributes.id, { onDelete: 'cascade' }),
  type: attributeTypeEnum('type').notNull(), // Discriminator: DROPDOWN, TEXT, NUMERIC, etc.
  valueId: uuid('value_id').notNull(), // FK resolved based on type
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

The `type` discriminator tells which value table to join:
- `DROPDOWN` / `MULTISELECT` → `attribute_values`
- `SWATCH` → `attribute_swatch_values`
- `REFERENCE` → `attribute_reference_values`
- `PLAIN_TEXT` / `RICH_TEXT` → `attribute_text_values`
- `NUMERIC` → `attribute_numeric_values`
- `BOOLEAN` → `attribute_boolean_values`
- `DATE` / `DATE_TIME` → `attribute_date_values`
- `FILE` → `attribute_file_values`

The consumer decides how to handle deleted values (via `onDelete` strategy or application logic).

**Note:** This pattern is customizable per consumer. Each consumer can adapt the junction table structure based on their specific needs (e.g., single table vs. two tables, different column names, additional metadata fields).

---

## Risks & Assumptions

### Assumptions to Validate
- [ ] Storing SWATCH with both color and image_url in same row is flexible enough
- [ ] Position-based ordering is sufficient (vs. explicit sort keys)
- [ ] Consumer-managed value tables won't create too much complexity

### Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Complex queries across types | Med | Med | Provide query helpers in attribute service |
| Consumer integration overhead | Med | Low | Clear documentation and helper functions |
| Reference resolution performance | Low | Med | Use DataLoader pattern for batching |

### Dependencies
- @czo/kit for module system and database utilities
- Drizzle ORM for type-safe queries
- GraphQL Yoga for API layer

---

## Open Questions

- [x] Should we support AttributeGroup? → **No, out of MVP scope**
- [x] Storage approach for assigned values? → **Typed value tables in @czo/attribute, consumers create junction tables**
- [x] How to handle REFERENCE type? → **`reference_entity` field on Attribute**
- [x] `input_type` naming? → **Renamed to `type`**
- [x] Soft or hard delete? → **Hard delete on attributes AND values, consumers manage their relations**
- [x] SWATCH storage? → **Separate table `attribute_swatch_values`**
- [x] REFERENCE storage? → **Separate table `attribute_reference_values` (predefined choices, not typed values)**
- [x] Entity-specific attributes? → **No `entity_type`, attributes are multi-consumer**
- [x] Should `type` enum be extensible for custom types in the future? → **Yes, planned for future**
- [x] ORM choice? → **Drizzle ORM (replacing Kysely)**
- [x] Consumer junction pattern? → **Two tables: entity↔attributes + entity↔values with type discriminator**

---

## Research & References

- [Saleor Attributes API Guide](https://docs.saleor.io/developer/attributes/api)
- [Saleor Attribute Object Reference](https://docs.saleor.io/docs/3.x/api-reference/attributes/objects/attribute)
- [Saleor GitHub Repository](https://github.com/saleor/saleor)
- [EAV Pattern in E-commerce](https://en.wikipedia.org/wiki/Entity%E2%80%93attribute%E2%80%93value_model)

---

## Next Steps

- [ ] Create PRD: `/manager:prd create attribute-module`
- [ ] Create TRD: `/manager:trd create attribute-module`
- [ ] Define GraphQL schema
- [ ] Plan migration from existing ProductOption (in Product module rebuild)

---

## Session Notes

**Key decisions made:**
1. Hybrid storage: predefined choices in `attribute_values` (DROPDOWN/MULTISELECT), `attribute_swatch_values` (SWATCH), and `attribute_reference_values` (REFERENCE), dynamic values in typed tables in @czo/attribute
2. SWATCH has its own table `attribute_swatch_values` with `color` (hex) and `file_url` fields
3. REFERENCE has its own table `attribute_reference_values` with `reference_id` field
4. No AttributeGroup in MVP
5. Typed value tables (`attribute_text_values`, etc.) live in @czo/attribute module, consumers create junction tables only
6. REFERENCE type uses `reference_entity` field on Attribute to specify target entity type
7. Position field for reordering DROPDOWN/MULTISELECT/SWATCH/REFERENCE values
8. `input_type` renamed to `type`
9. No `entity_type` on attributes - an attribute can be used by multiple consumers simultaneously
10. Hard delete on attributes AND all value tables - consumers manage their own relations when entities are deleted
11. **Drizzle ORM** replaces Kysely as the database layer
12. `type` enum will be **extensible** in the future for custom attribute types
13. **Consumer junction pattern**: Two separate tables - one for attribute assignment (N:N with `attributes`), one for values (N:N with value tables + type discriminator)
14. **Consumer pattern is customizable**: Each consumer can adapt the junction table structure to their specific needs
15. **External identifiers**: All tables have `external_source` + `external_id` columns for external system integration (ERP, PIM, etc.), with unique constraint on `(external_source, external_id)`
