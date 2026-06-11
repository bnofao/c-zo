# Auth `node(id:)` read guards — Design

**Date:** 2026-06-11
**Context:** Surfaced while reviewing the auth sub-graph tagging work (`docs/superpowers/specs/2026-06-10-auth-subgraphs-design.md`, staged on `feat/auth-subgraphs`). Sub-graphs control **exposure**, not **authorization**. `@czo/auth` exposes five relay `drizzleNode`s (`User`, `Organization`, `Member`, `Invitation`, `ApiKey`) reachable via the global `node(id:)`/`nodes(ids:)` field — but auth registers **no `nodeGuards`** (unlike attribute, product, channel, inventory, price, stock-location). The kit relay resolver does `if (!guard) return resolveNode(id)`, so `node(id:)` currently reads any of these rows **without authorization** — a weaker read path than the gated `user`/`organization`/… queries. This closes that gap, on the same branch, as the authorization complement of the exposure work.

## Goal

Register per-type `node(id:)` read guards for auth's five nodes so that reading a node by global id requires the **same effective authorization as the corresponding query** — `node()` is never a weaker read path. Guards gate ONLY the relay `node(id:)`/`nodes(ids:)` path (never connections or mutation returns, which keep their `authScopes`). A denied read resolves to **null** (existence is not leaked).

This is pre-existing exposure (auth never had node-guards); the sub-graph work makes `node(id:)` available on every served endpoint, so closing it now is the responsible completion.

## Decisions (settled during brainstorming)

1. **Mirror the query's effective per-row authorization.** Each guard reproduces exactly what its query would return for the caller — including the in-resolver "is this mine" filtering some queries do behind `{ auth: true }`. Never weaker (security), never stronger (would break legitimate reads).
2. **All five nodes** in this increment: `User`, `Organization`, `Member`, `Invitation`, `ApiKey`.
3. **Deny → null** (kit's established node-guard behavior; no existence oracle).
4. **ApiKey mirrors the current query** = ownership OR org-membership (any role). Tightening org-key reads to an `api-key:read` permission is an explicit out-of-scope follow-up.

## Architecture

### 1. `packages/modules/auth/src/graphql/node-guards.ts`

Exports `authNodeGuards: Record<string, NodeGuard>` keyed by GraphQL type name, mirroring `packages/modules/attribute/src/graphql/node-guards.ts`. A `NodeGuard` is `(row, ctx) => scope` (kit type from `@czo/kit/graphql`); kit evaluates the returned scope against the loaded row via `passesNodeGuard(guard(row, ctx), ctx, authScope)` in the relay `node`/`nodes` resolver. The guard runs after the row is loaded, so it can derive the row's org/owner/email.

The five guards, each a literal mirror of its query's effective authz (verified against the query resolvers):

| Node (type) | drizzle table | Guard `(row, ctx) =>` | Mirrors |
| --- | --- | --- | --- |
| `User` | `users` | `{ permission: { resource: 'user', actions: ['read'] } }` | `user`/`users` (global `user:read`) |
| `Organization` | `organizations` | `{ permission: { resource: 'organization', actions: ['read'], organization: row.id } }` | `organization(id)` — the org IS its own id |
| `Member` | `members` | `{ permission: { resource: 'member', actions: ['read'], organization: row.organizationId } }` | `members(organizationId)` |
| `Invitation` | `invitations` | `row.email === ctx.auth?.user?.email ? { auth: true } : { permission: { resource: 'invitation', actions: ['read'], organization: row.organizationId } }` | `invitation(id)` (org `invitation:read`) **OR** `myInvitations` (self-email, `{ auth: true }`) |
| `ApiKey` | `apikeys` | `{ apiKeyOwner: { keyId: row.id, action: 'read' } }` | `apiKey(id)`/`organizationApiKey(id)` — ownership OR org-membership |

Notes:
- **`Invitation` and `ApiKey` guards branch / reuse a polymorphic scope** because their query authz is conditional. The `Invitation` guard returns `{ auth: true }` when the row is addressed to the caller (self-read, the `myInvitations`/`account` path) and otherwise requires org `invitation:read` (the `invitation(id)`/`org` path). The `ApiKey` guard reuses the **existing `apiKeyOwner` polymorphic scope** (`packages/modules/auth/src/graphql/scopes.ts`), which already encodes ownership-OR-membership for the api-key mutations; it is invoked with the key's id and a `read` action.
- **`apiKeyOwner` `read` action:** the plan must confirm `apiKeyOwner` accepts an `action: 'read'` that resolves a `keyId` to its owner and passes on ownership (`reference === 'user'` && `referenceId === caller`) OR org-membership (any role, via `checkMembership`). If `'read'` is not yet a supported action, add it to the scope (mirroring the resolver's `apiKey(id)` logic) — no change to `ApiKeyService`.

### 2. Loading the gating columns

Each guard reads columns from the row that the client may not have selected: `Member.organizationId`, `Invitation.organizationId` + `Invitation.email`, `ApiKey.reference` + `ApiKey.referenceId` (and `ApiKey.id`/`Organization.id`, always present as the node id). As the attribute module does (`select: true` on each node so `organizationId` is loaded for the guard), ensure these columns are always loaded for the guard regardless of the client's field selection. The plan determines the exact mechanism the kit drizzle-node + node-guard registry uses (a node-level `select`, or the guard's declared columns) by following the attribute precedent.

### 3. Registration

In `packages/modules/auth/src/index.ts`, the module's `graphql` slot (currently `{ contribution, authScope, contexts }`) gains `nodeGuards: authNodeGuards`. The kit module registry merges per-module `graphql.nodeGuards` into the relay resolver's guard map (keyed by type name), so auth's five guards apply on every served endpoint that exposes those node types.

## Data flow

```
POST /graphql/admin  node(id: <User gid>)
  → kit relay node resolver decodes typename "User" → guard = authNodeGuards.User
  → resolveNode(id) loads the users row
  → passesNodeGuard({ permission: { user:read } }, ctx, authScope)
      ✓ caller has global user:read → return row
      ✗ otherwise → null
POST /graphql/org  node(id: <ApiKey gid>)  (org member)
  → guard = authNodeGuards.ApiKey → { apiKeyOwner: { keyId, action:'read' } }
  → owner is org X; caller is a member of X → return row; else null
```

## Error handling / security

- **Deny = null**, uniformly (no "exists but forbidden" vs "not found" distinction) — no existence oracle, matching the query paths (which already resolve unknown/forbidden ids to null).
- **node() is never weaker than the query:** every guard returns the same scope the query path computes for that row, so a caller cannot read via `node(id:)` anything the corresponding query would withhold.
- **Sub-graph type membership remains an orthogonal bound:** a node type only appears in the sub-graphs it's tagged into (e.g. `User` only in `admin`), so `node(id: <User>)` on `/graphql/account` already fails type resolution; the guard closes the remaining hole on the endpoint where the type IS exposed.
- **Connections and mutations are unaffected** — they keep their own `authScopes`; the guard runs only on the relay `node`/`nodes` path.

## Testing

`packages/modules/auth/src/e2e/node-authz.e2e.test.ts` (mirroring `packages/modules/attribute/src/e2e/node-authz.e2e.test.ts`), Testcontainers-backed, one block per node. For each: an **allowed** reader (right permission / ownership / self-email) gets the row via `node(id:)`; a **denied** reader (authenticated but lacking the right) gets `null`. Key cases:
- `User`: a global `user:read` holder reads any user; a plain authenticated user (no global role) → null.
- `Organization`: a member with `organization:read` reads their org; a non-member → null.
- `Member`: a caller with `member:read` in the org reads a member row; a non-member → null.
- `Invitation`: the invitee (matching email) reads their own invitation via `node()`; a member with `invitation:read` reads the org's invitation; an unrelated user → null.
- `ApiKey`: the owning user reads their personal key; a member of the owning org reads an org key; a non-owner/non-member → null.

## Out of scope / follow-ups

- Tightening org-owned `ApiKey` reads from "any member" to an `api-key:read` permission (a coordinated query + node change, if desired).
- Node guards for non-auth modules are already in place (attribute, product, channel, inventory, price, stock-location) — unaffected.
- Per-endpoint transport auth (still v1: field `authScopes` + these node guards are the gates).
