// Auth module — per-type `node(id:)`/`nodes(ids:)` authorization guards.
//
// Auth exposes five relay `drizzleNode`s reachable via the global `node(id:)`
// field. Without a guard the kit relay resolver reads any row by global id with
// NO authorization — a weaker path than the gated queries. Each guard returns
// the SAME effective scope its query computes, so node() is never weaker. Kit
// runs these ONLY on the relay node/nodes path (never connections or mutation
// returns). A denied read resolves to null (existence is not leaked).
//
// `Member`/`Invitation` carry `select: true` on their drizzleNode so the
// guard's columns (`organizationId`, `email`) are loaded regardless of the
// client's field selection.

import type { NodeGuard } from '@czo/kit/graphql'

/** `user`/`users` require the global `user:read` permission. */
const userGuard: NodeGuard = () => ({ permission: { resource: 'user', actions: ['read'] } })

/** `organization(id)`: the org IS its own id. */
const organizationGuard: NodeGuard = row => ({
  permission: { resource: 'organization', actions: ['read'], organization: Number(row.id) },
})

/** `members(organizationId)`: gate on the member row's org. */
const memberGuard: NodeGuard = row => ({
  permission: { resource: 'member', actions: ['read'], organization: Number(row.organizationId) },
})

/**
 * `invitation(id)` (org `invitation:read`) OR `myInvitations` (the invitee, by
 * email). A row addressed to the caller is theirs to read; otherwise gate on the
 * invitation's org.
 */
const invitationGuard: NodeGuard = (row, ctx) =>
  ctx.auth?.user?.email != null && row.email === ctx.auth.user.email
    ? { auth: true }
    : { permission: { resource: 'invitation', actions: ['read'], organization: Number(row.organizationId) } }

/** `apiKey(id)`: ownership OR org-membership, via the polymorphic `apiKeyOwner` scope. */
const apiKeyGuard: NodeGuard = row => ({ apiKeyOwner: { keyId: Number(row.id), action: 'read' } })

export const authNodeGuards = {
  User: userGuard,
  Organization: organizationGuard,
  Member: memberGuard,
  Invitation: invitationGuard,
  ApiKey: apiKeyGuard,
} satisfies Record<string, NodeGuard>
