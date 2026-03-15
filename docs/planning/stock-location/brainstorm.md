# Brainstorm: Stock Location

**Date:** 2026-03-15
**Participants:** Claude (Briana), User
**Status:** Draft

---

## Problem Statement

### The Problem

An e-commerce platform without stock locations treats inventory as a single undifferentiated pool. This creates several cascading problems:

1. **No fulfillment intelligence** -- the platform cannot determine *where* to ship from, leading to suboptimal shipping costs and delivery times.
2. **Inaccurate availability** -- without location-aware stock, merchants oversell items that exist in one warehouse but are already committed elsewhere.
3. **No omnichannel readiness** -- modern retail requires buy-online-pick-up-in-store (BOPIS), ship-from-store, and regional fulfillment. None of these are possible without modeled locations.
4. **Scaling bottleneck** -- as a merchant grows from one warehouse to multiple (or adds retail stores), the platform cannot represent this reality.

Stock Location is the *spatial dimension* of inventory. Without it, inventory quantities are just numbers with no physical grounding.

### Who's Affected

| User | Impact |
|------|--------|
| **Merchants** | Cannot model their real-world fulfillment network; forced to manage inventory outside the platform |
| **Warehouse managers** | No system of record for what stock lives where |
| **Fulfillment teams** | No routing logic to determine which location should fulfill an order |
| **Operations managers** | Cannot optimize shipping costs or delivery times |
| **End customers** | Slower delivery, stockouts on items that actually exist elsewhere |

### Current Solutions

Since c-zo has no inventory system yet, this is greenfield. In the broader e-commerce ecosystem, merchants without stock location support typically:
- Use spreadsheets or external WMS (warehouse management systems)
- Treat all inventory as a single bucket and manually reconcile
- Build custom integrations between their platform and fulfillment providers

### Why Now

- **Foundational module**: Stock Location is a prerequisite for any inventory, fulfillment, or order routing feature. Building it early avoids retrofitting later.
- **Standalone by design**: Like the Channel module, Stock Location has no dependency on Product. It models *places*, not *things*. Products, inventory levels, and fulfillment rules will reference locations later.
- **Channel module is in progress**: Channel models *where you sell*; Stock Location models *where you store*. Together they form the two spatial axes of e-commerce (demand side and supply side).
- **Pattern consistency**: Building another standalone foundational module now reinforces the modular architecture pattern established by Channel.

---

## User Insights

### Primary Users

```
User: Merchant / Store Owner
Goals: Model their warehouses, stores, and fulfillment centers in the platform
Pain Points: Having to manage fulfillment geography outside the platform
Context: Setting up their business, adding new warehouses, expanding to new regions
```

```
User: Warehouse / Operations Manager
Goals: Track which locations are active, their capabilities, and address details
Pain Points: No single source of truth for location data
Context: Day-to-day fulfillment operations, onboarding new facilities
```

### Secondary Users

```
User: Developer / Integrator
Goals: Reference stock locations when building inventory, fulfillment, or shipping modules
Pain Points: No standardized location entity to integrate with
Context: Building or extending platform modules
```

```
User: End Customer (indirect)
Goals: Accurate delivery estimates, local pickup options
Pain Points: Stockouts, slow shipping from distant warehouses
Context: Browsing products, checking availability, choosing delivery method
```

### Key Pain Points

- No way to represent physical fulfillment infrastructure in the platform
- Cannot distinguish between a warehouse, a retail store, and a dropship supplier
- No address data attached to fulfillment points (needed for shipping cost calculation)
- Cannot activate/deactivate locations (e.g., seasonal pop-up warehouses)
- No foundation for inventory allocation, order routing, or availability queries

---

## Ideas Explored

### Solution Ideas

1. **Standalone Stock Location module (`@czo/stock-location`)** -- A self-contained module that models physical locations with addresses, types, and status. No product or inventory dependency. Other modules reference it.

2. **Broader Inventory module with locations embedded** -- A single `@czo/inventory` module that includes locations, stock levels, movements, and reservations all in one package.

3. **Location as part of the Channel module** -- Extend Channel to include physical locations, treating stores as a type of sales channel.

4. **Minimal location field on future inventory records** -- Skip a dedicated location entity; just store a `location_name` string on inventory rows when they come.

5. **Location hierarchy system** -- Model locations as a tree (Region > Country > Warehouse > Zone > Bin) for enterprise-grade warehouse management.

6. **Location + Fulfillment Set combo module** -- Stock locations paired with "fulfillment sets" (groups of locations that can fulfill for specific channels/regions), inspired by Medusa v2.

### Evaluation

| Idea | Impact | Effort | Risk | Verdict |
|------|--------|--------|------|---------|
| 1. Standalone Stock Location module | High | Low | Low | **Selected for MVP** |
| 2. Broad Inventory module | High | High | Medium -- scope creep | Defer; build inventory on top of stock-location later |
| 3. Location inside Channel | Medium | Low | High -- conflates demand and supply | Reject; separation of concerns matters |
| 4. Minimal string field | Low | Very Low | High -- no structure, no queries, no routing | Reject; technical debt from day one |
| 5. Location hierarchy | Very High | High | Medium -- over-engineering for early stage | Defer to v2; keep schema extensible |
| 6. Location + Fulfillment Sets | High | Medium | Low | Partial adopt -- fulfillment sets deferred, but keep schema compatible |

### Selected Approach

**Idea 1: Standalone Stock Location module (`@czo/stock-location`)**, following the same pattern as the Channel module:

- Self-contained module with its own schema, service, and GraphQL API
- Models physical locations with structured address data
- Supports location types (warehouse, store, fulfillment center, dropship)
- Organization-scoped (locations belong to an organization)
- Soft delete, optimistic locking, handle generation -- all existing c-zo conventions
- No dependency on Product or Inventory; those modules will reference stock locations later

**Why this approach:**
- Mirrors the Channel module pattern (proven, autonomous, clean)
- Low effort, high value -- establishes the supply-side foundation
- Avoids premature coupling with inventory logic
- Schema can be extended for fulfillment sets and hierarchy later without breaking changes

---

## Industry Reference

### Shopify Locations API

Shopify treats locations as a core primitive:
- Each location has a name, address, and fulfillment/shipping capabilities
- Inventory levels are scoped to `(variant_id, location_id)` pairs
- Locations can be activated/deactivated
- A default location exists per shop
- Location types: warehouse, retail store, pop-up
- Maximum 1000 locations per shop (practical limit)

**Key takeaway**: Locations are simple (name + address + capabilities), and complexity lives in the *inventory level* and *fulfillment* layers that reference them.

### Medusa v2 Stock Locations

Medusa separates stock locations from inventory:
- `StockLocation` -- a physical place with address
- `InventoryItem` -- a SKU-level entity (not product-level)
- `InventoryLevel` -- the join: `(inventory_item_id, stock_location_id, stocked_quantity, reserved_quantity)`
- `FulfillmentSet` -- groups locations into fulfillment strategies
- `ServiceZone` -- geographic zones a fulfillment set can serve

**Key takeaway**: Medusa explicitly decouples location from inventory, validating our standalone module approach. The `FulfillmentSet` concept is worth adopting in a future phase.

### Common Pattern

Both platforms agree on the core model:
- Location = name + address + type + active/inactive status
- Locations are referenced by inventory (not the other way around)
- A default location exists per merchant/organization
- Locations are organization-scoped

---

## Proposed Schema

```
Table: stock_locations
  id              text PK
  organization_id text NOT NULL FK -> organizations.id
  handle          text NOT NULL          -- URL-safe slug, unique per org
  name            text NOT NULL
  type            text NOT NULL DEFAULT 'warehouse'  -- warehouse | store | fulfillment_center | dropship
  is_default      boolean NOT NULL DEFAULT false
  is_active       boolean NOT NULL DEFAULT true
  metadata        jsonb                  -- extensible key-value data
  deleted_at      timestamp              -- soft delete
  version         integer NOT NULL DEFAULT 1  -- optimistic locking
  created_at      timestamp NOT NULL DEFAULT now()
  updated_at      timestamp NOT NULL DEFAULT now()

  UNIQUE(organization_id, handle) WHERE deleted_at IS NULL

Table: stock_location_addresses
  id                  text PK
  stock_location_id   text NOT NULL FK -> stock_locations.id
  address_line_1      text NOT NULL
  address_line_2      text
  city                text NOT NULL
  province            text           -- state/province/region
  postal_code         text
  country_code        text NOT NULL  -- ISO 3166-1 alpha-2
  phone               text
  created_at          timestamp NOT NULL DEFAULT now()
  updated_at          timestamp NOT NULL DEFAULT now()

  UNIQUE(stock_location_id)  -- one address per location (1:1)
```

### Schema Design Decisions

- **Separate address table**: Keeps the location entity clean; address is a value object. Also allows future support for multiple addresses (billing vs shipping for a location) without schema changes.
- **`type` as text enum**: Avoids Postgres enum rigidity. Validated at the application layer.
- **`metadata` jsonb**: Follows Medusa's pattern for extensibility (e.g., storing 3PL-specific config, operating hours, capacity).
- **`handle` with partial unique index**: Same pattern as Channel -- unique within an org, ignoring soft-deleted records.
- **No `country` or `currency` on location itself**: Country is derived from the address. Currency is a pricing concern, not a location concern.

---

## Scope

### In Scope (MVP)

- [ ] `stock_locations` table with full CRUD
- [ ] `stock_location_addresses` table (1:1 with location)
- [ ] Handle generation from name (same utility as Channel)
- [ ] Default location per organization (auto-created on org setup, or manually set)
- [ ] Location types: `warehouse`, `store`, `fulfillment_center`, `dropship`
- [ ] Activate / deactivate locations (default location cannot be deactivated)
- [ ] Soft delete (default location cannot be deleted)
- [ ] Optimistic locking via `version` field
- [ ] GraphQL API: queries (`stockLocation`, `stockLocations`) and mutations (`createStockLocation`, `updateStockLocation`, `deleteStockLocation`, `setStockLocationStatus`)
- [ ] Organization-scoped access control
- [ ] Service layer with IoC container registration
- [ ] Metadata (jsonb) support for extensibility
- [ ] Module follows `defineNitroModule` pattern

### Out of Scope (Future)

- Inventory levels (quantity tracking per location) -- belongs to a future Inventory module
- Fulfillment sets and service zones -- future Fulfillment module
- Location hierarchy (region > warehouse > zone > bin) -- v2 enhancement
- Geo-based fulfillment routing (closest warehouse to customer)
- Operating hours and capacity modeling
- Integration with third-party WMS systems
- Location-specific shipping rates
- Transfer orders between locations
- Stock location analytics and reporting
- Bulk import/export of locations

### Non-Goals

- This module does NOT track inventory quantities -- it only models *where* inventory can exist
- This module does NOT handle fulfillment logic -- it only provides the location entities that fulfillment references
- This module does NOT depend on Product -- products and variants are not part of this module's domain
- This module does NOT manage shipping zones -- that belongs to a Shipping module

---

## Relationship to Other Modules

```
                    +-----------------+
                    |     Channel     |  (where you sell)
                    +-----------------+
                            |
                            | future: fulfillment sets link
                            | channels to locations
                            v
+-----------+     +-------------------+     +-----------+
|  Product  | --> |    Inventory      | <-- |   Stock   |
| (future)  |     |    (future)       |     | Location  |
+-----------+     +-------------------+     +-----------+
                   inventory_levels:          (where you store)
                   (item_id, location_id,
                    quantity, reserved)
```

- **Channel <-> Stock Location**: Independent today. In the future, a Fulfillment module will link channels to locations (which locations can fulfill orders from which channels).
- **Product <-> Stock Location**: No direct relationship. The future Inventory module will create the join between product variants (or inventory items) and locations.
- **Auth (Organizations)**: Stock locations are scoped to organizations, using `organization_id` as a foreign key.

---

## Risks & Assumptions

### Assumptions to Validate

- [ ] The address model (single address per location) is sufficient for MVP -- merchants do not need separate billing/shipping addresses for a location at this stage
- [ ] Four location types (warehouse, store, fulfillment_center, dropship) cover the majority of use cases
- [ ] Organization-scoped locations are the right granularity (not user-scoped or global)
- [ ] A default location per organization is necessary (mirroring Shopify's pattern)
- [ ] The metadata jsonb field provides enough extensibility to defer type-specific columns

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Schema changes needed when Inventory module arrives | Medium | Medium | Design schema to be referenced (not embedded); keep location entity minimal and stable |
| Address model too simple for international merchants | Low | Medium | Use ISO country codes; keep province/postal optional; metadata for edge cases |
| Location types insufficient | Low | Low | Text field (not enum) allows adding types without migration; validate at app layer |
| Default location logic creates edge cases | Medium | Low | Mirror Channel module's default handling (cannot delete/deactivate default; only one default per org) |
| Organization model changes in auth module | Low | High | Use FK to organizations table; auth module schema is stable |
| Over-engineering for current stage (no Product module exists) | Medium | Low | Module is small and focused; cost of building is low relative to value of having the foundation ready |

---

## Open Questions

- [ ] Should locations support a `fulfills_online` boolean flag (indicating whether the location participates in online order fulfillment) vs. deferring this to a fulfillment module?
- [ ] Should the module emit events (e.g., `stock-location:created`, `stock-location:deactivated`) for other modules to react to? The kit module has an event system in planning.
- [ ] Should the default location be auto-created when an organization is created (requires a hook into the auth module), or should it be created manually?
- [ ] Is ISO 3166-1 alpha-2 sufficient for country codes, or do we need alpha-3 / numeric support?
- [ ] Should the GraphQL API expose a `nearestLocations(lat, lng)` query for future geo-routing, or is that firmly out of scope?
- [ ] How does this interact with the app system in auth? Could a third-party app register its own stock locations (e.g., a 3PL app)?

---

## Next Steps

- [ ] Validate scope with stakeholders -- confirm standalone module approach
- [ ] Create PRD: `/manager:prd create stock-location`
- [ ] Create TRD: `/manager:trd create stock-location`
- [ ] Decide on event emission strategy (depends on kit event system status)
- [ ] Decide on default location creation strategy (hook into auth vs. manual)
- [ ] Begin implementation following TDD approach
