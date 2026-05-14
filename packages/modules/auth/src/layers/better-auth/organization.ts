import type { OrganizationOptions } from 'better-auth/plugins'
import { organization } from 'better-auth/plugins'

export function organizationConfig(option?: OrganizationOptions) {
  return organization({
    ...option,
    sendInvitationEmail: async (_data) => {
      // TODO(events): publish InvitationRequested via EmailEvents when the
      // domain bus exists.
    },
    schema: {
      organization: {
        modelName: 'organizations',
        fields: {},
        additionalFields: {
          type: { type: 'string' as const, required: false, defaultValue: null, input: true },
        },
      },
      member: {
        modelName: 'members',
        fields: {},
      },
      invitation: {
        modelName: 'invitations',
        fields: {},
      },
      session: {
        fields: {
          activeOrganizationId: 'active_organization_id',
        },
      },
    },
    organizationHooks: {
      ...option?.organizationHooks,
      // Org / member lifecycle events are published from `OrganizationService`
      // (the only path through the GraphQL resolvers). Better-auth's internal
      // org hooks were previously double-publishing via the legacy AuthEventBus
      // and are intentionally silent here. If a non-service code path triggers
      // these hooks in the future, re-introduce per-domain publishing.
    },
  })
}
