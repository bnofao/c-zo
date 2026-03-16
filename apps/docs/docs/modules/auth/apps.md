---
sidebar_position: 4
---

# Apps

The app system allows first-party integrations to be installed into c-zo organizations. Each app is described by a JSON manifest, receives a scoped API key on installation, and can subscribe to domain events via webhooks.

## App Manifest

An app manifest is a JSON document that describes the app's identity, required permissions, and webhook subscriptions:

```json
{
  "id": "my-integration",
  "name": "My Integration",
  "version": "1.0.0",
  "about": "Optional description",
  "appUrl": "https://my-integration.example.com",
  "register": "https://my-integration.example.com/register",
  "author": {
    "name": "Acme Corp",
    "url": "https://acme.example.com"
  },
  "scope": "organization",
  "permissions": {
    "stock-location": ["read"]
  },
  "webhooks": [
    {
      "event": "stockLocation.location.created",
      "targetUrl": "https://my-integration.example.com/webhooks",
      "asyncEvents": true
    }
  ]
}
```

Key manifest fields:

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique app identifier. Used as the app's primary key. |
| `scope` | `"organization" \| "user"` | Whether the app is scoped to an organization or a user. |
| `permissions` | `Record<string, string[]>` | Required resource/action permissions. The installer must hold these permissions. |
| `webhooks` | `Webhook[]` | Events to subscribe to. Each event must match a registered domain event or a declared permission resource prefix. |
| `register` | `string` (URL) | Endpoint called by c-zo after installation to complete app registration. Receives the API key. |

## Install Lifecycle

1. **Caller invokes `installApp`** with a `manifestUrl` pointing to the app's manifest JSON endpoint.
2. **Manifest is fetched and validated** — Zod parses the manifest structure, verifies webhook event names against declared permissions, and validates any inline GraphQL subscription queries.
3. **Permission check** — the installer must hold all permissions declared in `manifest.permissions`.
4. **Duplicate check** — if an app with the same `manifest.id` is already installed, the operation fails.
5. **Row inserted** with `status: 'pending'`.
6. **API key created** — a scoped API key is created and linked to the new app row.
7. **`auth.app.installed` event published** — payload includes the `registerUrl`, the raw `apiKey`, the `webhookSecret`, and the installer's ID. The webhook dispatcher picks this up and calls `manifest.register` with the credentials.
8. **App transitions to `active`** after successful registration.

## GraphQL API

```graphql
extend type Query {
  app(appId: String!): App
    @permission(resource: "apps", action: "read")
  apps(organizationId: ID): [App!]!
    @permission(resource: "apps", action: "read")
}

extend type Mutation {
  installApp(input: InstallAppInput!): AppInstallResult!
    @permission(resource: "apps", action: "write")
  uninstallApp(appId: String!): Boolean!
    @permission(resource: "apps", action: "delete")
  updateAppManifest(appId: String!, manifest: JSON!): App!
    @permission(resource: "apps", action: "write")
  setAppStatus(appId: String!, status: String!): App!
    @permission(resource: "apps", action: "write")
}
```

`InstallAppInput` accepts a `manifestUrl` (remote fetch) or use the internal `installFromManifest` service method for inline manifests.

## Webhooks

Webhook delivery records are stored in the `webhook_deliveries` table. The dispatcher reads active apps, matches their subscribed events against published domain events, and POSTs the payload to `webhook.targetUrl`. Each delivery attempt records the response code, response body, and attempt count.

Apps can optionally provide a `webhook.query` — a GraphQL subscription document that is executed to produce a richer payload before delivery.

## API Keys

Each installed app receives one API key prefixed with the application identifier (e.g. `myintegration_`). The key carries the same permissions as declared in the manifest. Keys are stored in `apikeys` with an `installedAppId` foreign key; uninstalling an app cascades to delete the key.
