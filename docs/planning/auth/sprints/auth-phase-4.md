---
name: Auth Phase 4 — AuthRestrictionRegistry + Admin
milestone: 8
start_date: 2026-02-16
end_date: 2026-03-02
status: active
prd: auth
---

## Goals

- [x] Goal 1: Implement AuthRestrictionRegistry for actor-type-specific auth restrictions (freeze after boot)
- [ ] Goal 2: Implement admin capabilities (user impersonation + user management)

## Issues

| Issue | Title | Type | Priority | Status | Assignee |
|-------|-------|------|----------|--------|----------|
| #62 | AuthRestrictionRegistry — Restrictions d'Auth par Acteur | feature | high | closed | — |
| #63 | Capacités Admin (Impersonation + Gestion Utilisateurs) | feature | medium | open | — |

## Execution Order & Rationale

1. **#62 AuthRestrictionRegistry** — Foundation for actor-type restrictions. Provides the registry that admin capabilities (#63) will depend on for enforcing auth method constraints per actor type. Must freeze after boot (service discovery ready).
2. **#63 Admin Capabilities** — Builds on top of the restriction registry. Implements user impersonation and management features. Requires admin actor type restrictions to be in place.

## Capacity

- Team members: TBD
- Estimated velocity: 2 issues / 2 weeks
- Notes: #62 is a prerequisite for #63 (admin restrictions depend on the registry)

## Key Deliverables

### AuthRestrictionRegistry (#62)
- Registry for configurable auth restrictions per actor type
- Freeze mechanism after boot (immutable at runtime)
- Service discovery readiness (MS-1 preparation)
- Integration with existing actor-type plugin

### Admin Capabilities (#63)
- User impersonation (admin assumes user session)
- User management CRUD (list, view, disable, delete)
- Admin-specific auth restrictions (2FA mandatory, etc.)
- Audit trail for admin actions via auth events

## Dependencies

- Existing actor-type plugin (`src/plugins/actor-type.ts`)
- Auth events infrastructure (Phase 2, #67)
- 2FA enforcement for admin actors (Phase 3, #60)
- better-auth admin plugin

## Risks

- AuthRestrictionRegistry freeze semantics may conflict with hot-reload in dev
- Impersonation requires careful session management to avoid privilege escalation
- Admin plugin may have limited customization options in better-auth

## Retrospective

<!-- Filled in after sprint completion -->

### What went well


### What could improve


### Action items

