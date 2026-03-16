# @czo/auth

Authentication, authorization, and app management for the c-zo platform.

## Quick Start

```typescript
// apps/mazo/nitro.config.ts
modules: ['@czo/auth', kitModule]
```

```bash
cd packages/modules/auth
pnpm migrate:latest
```

## Key Concepts

- **Session-based auth** via better-auth
- **Organization-scoped permissions** with resource/action model
- **Role hierarchy** (member → manager → owner)
- **App system** with manifest-based install, webhooks, and API keys

## API

| Operation | Type | Description |
|-----------|------|-------------|
| Organization CRUD | Mutations | Create, update, manage organizations |
| User management | Queries/Mutations | Users, sessions, invitations |
| App install/uninstall | Mutations | Install third-party apps |
| Two-factor auth | Mutations | TOTP setup and verification |

## Documentation

Full docs: https://docs.c-zo.dev/docs/modules/auth/overview
