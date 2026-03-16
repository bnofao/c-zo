---
sidebar_position: 3
---

# Permissions

c-zo uses an additive role hierarchy for access control. Permissions accumulate as roles ascend the hierarchy: each level inherits all permissions from the levels below it.

## Access Control Model

Permissions are organized around **resources** (nouns) and **actions** (verbs). A permission check asks: "does this actor have the `<action>` action on the `<resource>` resource?"

In GraphQL resolvers the `@permission` directive enforces this check before the resolver runs:

```graphql
extend type Mutation {
  createStockLocation(input: CreateStockLocationInput!): StockLocation!
    @permission(resource: "stock-location", action: "create")
}
```

## Built-in Role Hierarchies

### Organization roles

| Role | Permissions |
|---|---|
| `org:member` | (none) |
| `org:viewer` | `organization:read`, `member:read`, `invitation:read` |
| `org:admin` | + `organization:update`, `member:create/update/delete`, `invitation:create/cancel` |
| `org:owner` | + `organization:delete` |

### Admin roles

| Role | Permissions |
|---|---|
| `admin:viewer` | `user:read`, `session:read` |
| `admin:manager` | + `user:create/update`, `session:revoke` |
| `admin` | + `user:delete/ban/impersonate` |

### API Key roles

| Role | Permissions |
|---|---|
| `api-key:viewer` | `api-key:read` |
| `api-key:manager` | + `api-key:create/update` |
| `api-key:admin` | + `api-key:delete` |

### Apps roles

| Role | Permissions |
|---|---|
| `apps:viewer` | `apps:read` |
| `apps:manager` | + `apps:write` |
| `apps:admin` | + `apps:delete` |

## Registering a Module's Access Domain

Modules register their resources and actions during the `czo:register` hook, before `czo:boot` freezes the registry:

```typescript
nitroApp.hooks.hook('czo:register', async () => {
  const container = useContainer()
  const accessService = await container.make('auth:access')

  accessService.register({
    name: 'my-module',
    statements: {
      'my-resource': ['create', 'read', 'update', 'delete'] as const,
    },
    hierarchy: [
      {
        name: 'member',
        permissions: { 'my-resource': ['read'] },
      },
      {
        name: 'manager',
        permissions: { 'my-resource': ['create', 'read', 'update'] },
      },
      {
        name: 'owner',
        permissions: { 'my-resource': ['create', 'read', 'update', 'delete'] },
      },
    ],
  })
})
```

The `hierarchy` array is processed in order: each level's permissions are merged onto all previous levels' accumulated permissions. The first entry in the array is the least-privileged role; the last is the most-privileged.

After `czo:boot` fires, the auth module calls `accessService.buildRoles()` which compiles all registered statements and hierarchies into a better-auth `AccessControl` instance. The registry is then frozen — any attempt to register new domains after that point throws an error.

## Programmatic Permission Checks

Use `AuthService.hasPermission()` for server-side checks outside of GraphQL resolvers:

```typescript
const authService = await container.make('auth:service')

const allowed = await authService.hasPermission(
  { userId: 'u_123', organizationId: 'org_456' },
  { 'stock-location': ['create'] },
  'manager',  // caller's role
)
```
