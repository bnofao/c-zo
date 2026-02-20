---
name: Auth Phase 3 — 2FA + API Keys
milestone: 7
start_date: 2026-02-13
end_date: 2026-03-03
status: completed
prd: auth
---

## Goals

- [x] Goal 1: Implement TOTP 2FA with backup codes and mandatory enforcement for admins
- [x] Goal 2: Implement API key generation, validation, and revocation for programmatic access

## Issues

| Issue | Title | Type | Priority | Status | Assignee |
|-------|-------|------|----------|--------|----------|
| #60 | Two-Factor Authentication (TOTP 2FA) | feature | high | closed | @bnofao |
| #61 | Clés API pour Accès Programmatique | feature | high | closed | @bnofao |

## Execution Order & Rationale

1. **#60 2FA** — Uses better-auth `twoFactor` plugin. Involves TOTP secret encryption (AES-256-GCM), bcrypt-hashed backup codes, and login flow modification (`requires2FA` response). Admin enforcement adds actor-type-specific logic.
2. **#61 API Keys** — Uses better-auth `apiKey` plugin. Involves key generation with `czo_` prefix, hash-based validation in Bearer middleware, org scoping, and expiration. Independent from #60.

Both issues are **independent** and can be worked in parallel.

## Capacity

- Team members: @bnofao
- Estimated velocity: 2 issues / 2.5 weeks
- Notes: Both issues use better-auth plugins; complexity is in the custom logic around them

## Key Deliverables

### 2FA (#60)
- `POST /api/auth/two-factor/enable` — returns TOTP secret + QR URI + 10 backup codes
- `POST /api/auth/two-factor/verify` — validates TOTP code (setup confirmation + login challenge)
- `POST /api/auth/two-factor/disable` — requires re-authentication
- Login flow: `{ requires2FA: true }` intermediate response when 2FA enabled
- 10 backup codes, bcrypt-hashed, one-time use
- Admin actor type: 2FA mandatory before accessing admin features
- TOTP secret encrypted at rest (AES-256-GCM)
- Auth events: `auth.2fa.enabled`, `auth.2fa.disabled`

### API Keys (#61)
- `POST /api/auth/api-keys` — generate key (full key shown once)
- `DELETE /api/auth/api-keys/[id]` — revoke key
- `myApiKeys` GraphQL query — list keys (prefix only)
- Bearer middleware: detect `czo_` prefix -> API key validation path
- Key format: `czo_` + 32 bytes base64url
- Organization scoping, optional expiration, `last_used_at` tracking
- Auth events: `auth.apikey.created`, `auth.apikey.revoked`

## Dependencies

- better-auth `twoFactor` plugin
- better-auth `apiKey` plugin (or custom implementation)
- AES-256-GCM encryption key (env var for TOTP secrets)
- Existing auth events infrastructure (#67)
- Existing organization infrastructure (#59) for API key scoping

## Risks

- better-auth `twoFactor` plugin may not support all customizations (backup code format, admin enforcement) — may need custom hooks
- API key `czo_` prefix detection in Bearer middleware must not conflict with JWT validation
- AES-256-GCM key management requires new env var (`AUTH_ENCRYPTION_KEY`)
