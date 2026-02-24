---
name: Auth Phase 1 — Core Auth + JWT
milestone: 5
start_date: 2026-02-10
end_date: 2026-02-24
status: completed
prd: auth
---

## Goals

- [x] Goal 1: Setup better-auth with Nitro integration and email/password authentication
- [x] Goal 2: Implement JWT dual-token architecture (ES256 access + refresh)
- [x] Goal 3: Protect GraphQL endpoint with JWT validation middleware

## Issues

| Issue | Title | Type | Priority | Status | Assignee |
|-------|-------|------|----------|--------|----------|
| #55 | Setup better-auth + Email/Password Authentication | feature | high | closed | @bnofao |
| #56 | Session Management with Actor Context | feature | high | closed | @bnofao |
| #57 | GraphQL Endpoint Protection Middleware | feature | high | closed | @bnofao |

## Capacity

- Team members: TBD
- Estimated velocity: 3 issues / 2 weeks
- Notes: All issues are high priority, sequential dependencies (#55 → #56 → #57)

## Key Deliverables

- `packages/modules/auth/` module scaffolded with better-auth
- Email/password registration + login endpoints (`/api/auth/[actor]/sign-up`, `/api/auth/[actor]/sign-in/email`)
- JWT ES256 signing/verification (TokenService)
- Dual-token flow: access token (15min) + refresh token (7j)
- `POST /api/auth/token/refresh` endpoint
- Redis session store for refresh tokens + JWT blocklist
- GraphQL middleware: JWT verification + claims in context
- Unit + integration tests (80%+ coverage)

## Retrospective

<!-- Filled in after sprint completion -->

### What went well


### What could improve


### Action items

