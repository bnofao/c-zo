---
sidebar_position: 2
---

# Mutations

All stock location mutations require an authenticated session and the appropriate `stock-location` permission enforced by the `@permission` directive.

## createStockLocation

Creates a new stock location with a mandatory nested address in a single database transaction.

```graphql
mutation CreateStockLocation($input: CreateStockLocationInput!) {
  createStockLocation(input: $input) {
    id
    handle
    name
    isDefault
    isActive
    address {
      addressLine1
      city
      countryCode
    }
    createdAt
  }
}
```

### Input

```graphql
input CreateStockLocationInput {
  name: String!          # Display name (1–255 chars)
  handle: String         # Optional URL slug. Auto-generated from name if omitted.
  organizationId: ID!
  addressLine1: String!
  addressLine2: String
  city: String!
  province: String
  postalCode: String
  countryCode: String!   # ISO 3166-1 alpha-2 (e.g. "US", "DE")
  phone: String
  metadata: JSON
}
```

### Handle Auto-Generation

If `handle` is omitted, the service slugifies `name`:

- Lowercase and strip diacritics.
- Replace non-alphanumeric characters with hyphens.
- Trim leading and trailing hyphens.

Example: `"Main Warehouse (EU)"` becomes `"main-warehouse-eu"`.

If a location with the derived handle already exists in the organization, the mutation fails with a duplicate handle error. Provide an explicit `handle` to override.

### Example Variables

```json
{
  "input": {
    "name": "Main Warehouse",
    "organizationId": "org_01j...",
    "addressLine1": "1 Logistics Way",
    "city": "Chicago",
    "province": "IL",
    "postalCode": "60601",
    "countryCode": "US"
  }
}
```

---

## updateStockLocation

Updates a stock location's scalar fields. All fields are optional; only supplied fields are changed (patch semantics). The `address` object, if provided, replaces the full address record.

```graphql
mutation UpdateStockLocation($id: ID!, $input: UpdateStockLocationInput!) {
  updateStockLocation(id: $id, input: $input) {
    id
    handle
    name
    address {
      addressLine1
      city
      countryCode
    }
  }
}
```

### Input

```graphql
input UpdateStockLocationInput {
  name: String
  handle: String
  isDefault: Boolean
  isActive: Boolean
  metadata: JSON
  address: UpdateStockLocationAddressInput
}
```

Omitting a field leaves the current value unchanged. Passing `null` for a nullable field explicitly clears it.

---

## updateStockLocationAddress

Updates only the address record for an existing stock location. Useful when address data needs to change independently of location metadata.

```graphql
mutation UpdateStockLocationAddress($stockLocationId: ID!, $input: UpdateStockLocationAddressInput!) {
  updateStockLocationAddress(stockLocationId: $stockLocationId, input: $input) {
    id
    addressLine1
    addressLine2
    city
    province
    postalCode
    countryCode
    phone
  }
}
```

### Input

```graphql
input UpdateStockLocationAddressInput {
  addressLine1: String
  addressLine2: String
  city: String
  province: String
  postalCode: String
  countryCode: String
  phone: String
}
```

**Null-clearing semantics for nullable fields:** passing `null` for `addressLine2`, `province`, `postalCode`, or `phone` explicitly sets the column to `NULL`, clearing any previously stored value. Omitting the field entirely leaves the current value unchanged.

### Example

```json
{
  "stockLocationId": "loc_01j...",
  "input": {
    "addressLine1": "2 New Street",
    "province": null
  }
}
```

This updates `address_line_1` and clears `province`. All other address fields remain unchanged.
