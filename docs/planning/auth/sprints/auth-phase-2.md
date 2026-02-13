---
name: Auth Phase 2 — OAuth + Events + Orgs
milestone: 6
start_date: 2026-02-12
end_date: 2026-02-26
status: active
prd: auth
---

## Goals

- [ ] Goal 1: Publish domain events from auth actions via EventBus
- [ ] Goal 2: Implement OAuth social login (Google for customers/merchants, GitHub for admins)
- [ ] Goal 3: Implement organizations with invitations and member management

## Issues

| Issue | Title | Type | Priority | Status | Assignee |
|-------|-------|------|----------|--------|----------|
| #67 | Auth Events via EventBus (Domain Event Publishing) | feature | high | open | @bnofao |
| #58 | OAuth Social Login (Google + GitHub) par Acteur | feature | high | open | @bnofao |
| #59 | Organizations et Gestion des Membres | feature | high | open | @bnofao |

## Execution Order & Rationale

1. **#67 Auth Events** — Foundation for event-driven architecture. Other issues (#58, #59) will emit events through this infrastructure. Medium complexity, no external service deps.
2. **#58 OAuth Social Login** — Self-contained OAuth flows with actor-type restrictions. Requires Google/GitHub OAuth credentials in env.
3. **#59 Organizations** — Most complex: CRUD, invitations, roles, multi-tenancy. Emits member events via #67. Novu for invitation emails (can mock initially).

## Capacity

- Team members: @bnofao
- Estimated velocity: 3 issues / 2 weeks
- Notes: #67 is a prerequisite for event publishing in #58 and #59

## Key Deliverables

- `AuthEventsService` publishing 8 domain events via `EventBus.publish()`
- `correlationId` propagation from AsyncLocalStorage into events
- OAuth sign-in endpoints: `/api/auth/[actor]/sign-in/social`, callback handlers
- Actor-type restrictions: Google for customer/merchant, GitHub for admin
- OAuth state encryption with actor type embedded
- Account linking for existing users with matching email
- Organization CRUD: create, invite, remove, accept invitation
- Organization roles: owner, admin, member, viewer
- Merchant sign-up auto-creates organization
- Unit + integration tests (80%+ coverage)

## Dependencies

- @czo/kit EventBus (operational)
- Google OAuth credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
- GitHub OAuth credentials (GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET)
- Novu for invitation emails (mockable)
- better-auth organization plugin

## Risks

- OAuth provider configuration may require spike if better-auth plugin has limitations
- Novu integration may be deferred to mock if credentials unavailable
- Organization multi-tenancy scope may surface data isolation concerns

## Retrospective

<!-- Filled in after sprint completion -->

### What went well


### What could improve


### Action items

