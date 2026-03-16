---
sidebar_position: 2
---

# Configuration

The auth module is configured through Nitro runtime config. All config keys are resolved from environment variables using Nitro's `NITRO_` prefix convention.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NITRO_CZO_AUTH_SECRET` | Yes | Secret used to sign session tokens. Must be at least 32 characters. |
| `DATABASE_URL` | Yes | PostgreSQL connection URL (shared with all modules). |
| `NITRO_CZO_BASE_URL` | No | Base URL of the application, used for OAuth redirect URLs and email links. |

If `NITRO_CZO_AUTH_SECRET` is missing or shorter than 32 characters, the auth module logs a warning and skips initialization — the server starts but all auth-related GraphQL operations will fail.

## Auth Options

The `AuthOption` interface accepted by `createAuth()`:

```typescript
interface AuthOption {
  app: string           // Application name / identifier
  secret: string        // Session signing secret (min 32 chars)
  baseUrl?: string      // Public base URL for redirects
  storage?: Storage     // Nitro storage adapter for session secondary storage
  socials?: SocialProviders  // OAuth provider credentials
  adminRoles?: readonly string[]
  ac?: AccessControl    // Better-auth access control instance (built at boot)
  roles?: Record<string, AccessRole>  // Role map (built at boot)
}
```

These values are assembled in the `czo:boot` hook inside `packages/modules/auth/src/plugins/index.ts` after the access service has built its role map.

## Better-Auth Integration

The auth module wraps [better-auth](https://better-auth.com) and configures the following plugins automatically:

- **Admin** — user management, ban, impersonation, role assignment.
- **Organization** — multi-tenant organizations, members, invitations.
- **Two-Factor** — TOTP, OTP, backup codes.
- **API Key** — scoped API keys with rate limiting.
- **OpenAPI** — auto-generated OpenAPI reference for auth REST endpoints.
- **Actor Type** — custom actor type restrictions per sign-in method.

All REST endpoints for operations exposed through GraphQL resolvers are disabled on the better-auth HTTP handler to avoid duplicate surface area.

The better-auth HTTP handler is mounted at `/api/auth/**` and handles sign-in, sign-out, OAuth callbacks, email verification, and password reset flows.

## Social Providers

Pass OAuth credentials through the `socials` option:

```typescript
// nitro.config.ts
export default defineNitroConfig({
  runtimeConfig: {
    auth: {
      secret: process.env.AUTH_SECRET,
      socials: {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        },
      },
    },
  },
})
```
