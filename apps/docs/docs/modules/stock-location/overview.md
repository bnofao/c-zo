---
sidebar_position: 1
---

# Stock Location Overview

`@czo/stock-location` manages physical locations used for inventory and fulfillment — warehouses, stores, distribution centers, and any other place where stock is held or shipped from.

## Features

- **Auto-generated handles** — if no `handle` is provided, one is derived from the location's name by slugifying it (lowercased, diacritics stripped, non-alphanumeric characters replaced with hyphens). Handles must be unique within an organization.
- **Soft delete** — locations are never hard-deleted. Setting `deletedAt` hides them from queries by default.
- **Optimistic locking** — every update increments the `version` column. Passing `expectedVersion` to the repository's `update` method prevents lost updates under concurrent writes.
- **Nested address** — each location has exactly one address record created in the same transaction.
- **Organization scoping** — all locations belong to an `organizationId`; the handle uniqueness constraint is per-organization.

## Database Schema

### stock_locations

| Column | Type | Notes |
|---|---|---|
| `id` | `text` | Primary key (cuid2) |
| `organization_id` | `text` | Foreign-key scoped; indexed |
| `handle` | `text` | URL-safe slug; unique per org |
| `name` | `text` | Display name |
| `is_default` | `boolean` | Default location flag; default `false` |
| `is_active` | `boolean` | Active flag; default `true` |
| `metadata` | `jsonb` | Arbitrary key/value bag |
| `deleted_at` | `timestamp` | Soft delete timestamp |
| `version` | `integer` | Optimistic lock version; starts at 1 |
| `created_at` | `timestamp` | Auto-set on insert |
| `updated_at` | `timestamp` | Auto-updated on each write |

Unique constraint: `(organization_id, handle)`.

### stock_location_addresses

| Column | Type | Notes |
|---|---|---|
| `id` | `text` | Primary key (cuid2) |
| `stock_location_id` | `text` | FK → `stock_locations.id` CASCADE; unique (1:1) |
| `address_line_1` | `text` | Required |
| `address_line_2` | `text` | Optional |
| `city` | `text` | Required |
| `province` | `text` | Optional |
| `postal_code` | `text` | Optional |
| `country_code` | `text` | ISO 3166-1 alpha-2; stored uppercased |
| `phone` | `text` | Optional |
| `created_at` | `timestamp` | Auto-set on insert |
| `updated_at` | `timestamp` | Auto-updated on each write |

The address table has a `UNIQUE` constraint on `stock_location_id`, enforcing the 1:1 relationship at the database level.

## Permissions

The module registers the `stock-location` resource with the auth access service during `czo:register`:

| Role | Allowed actions |
|---|---|
| `member` | `read` |
| `manager` | `create`, `read`, `update` |
| `owner` | `create`, `read`, `update`, `delete` |

All GraphQL mutations are protected with `@permission(resource: "stock-location", action: "<action>")`.
