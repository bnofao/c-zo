---
sidebar_position: 1
---

# Auth Overview

`@czo/auth` is the authentication and authorization module for c-zo. It provides session-based authentication (email/password, OAuth, two-factor), organization-scoped permissions through a composable access control system, and a first-party app installation framework with webhook delivery and API key management.

## What Auth Provides

- **Session-based authentication** — email/password sign-in, OAuth social providers, two-factor (TOTP + OTP + backup codes), session management, and account self-service operations.
- **Organization-scoped permissions** — role hierarchy with `@permission` directive enforcement in GraphQL. Roles accumulate permissions as they ascend the hierarchy (member → admin → owner). Third-party modules register their own resource/action statements that are merged at boot time.
- **App system** — installable first-party apps identified by a manifest URL. Each app receives a scoped API key, registers webhooks for domain events, and can send GraphQL subscription queries as webhook payloads.

## Installation

1. Add the module to `apps/mazo/nitro.config.ts`:

```typescript
export default defineNitroConfig({
  modules: [
    '@czo/auth/module',
    // other modules
  ],
})
```

2. Run migrations from `packages/modules/auth`:

```bash
pnpm migrate:latest
```

## Database Tables

| Table | Purpose |
|---|---|
| `users` | User accounts with email, name, ban status, and 2FA flag |
| `sessions` | Active sessions linked to users, with actor type, auth method, and active organization |
| `accounts` | OAuth accounts and credential records linked to a user |
| `verifications` | Pending email verification tokens |
| `organizations` | Multi-tenant organization records with a unique slug |
| `members` | Organization membership records linking users to organizations with a role |
| `invitations` | Pending organization invitations with expiry |
| `two_factors` | TOTP secret and backup codes per user |
| `apps` | Installed app records with manifest, status, and webhook secret |
| `webhook_deliveries` | Outbound webhook delivery attempts with status and response tracking |
| `apikeys` | API keys with rate limiting, permissions, and optional app association |

All session records include `actorType` (e.g. `customer`) and `authMethod` (e.g. `email`) columns to support extensible actor-type restrictions.
