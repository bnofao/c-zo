import type { OrganizationOptions } from 'better-auth/plugins'
import { organization } from 'better-auth/plugins'
import { AUTH_EVENTS, publishAuthEvent } from '../../events'

export function organizationConfig(option?: OrganizationOptions) {
  return organization({
    ...option,
    sendInvitationEmail: async (data) => {
      void publishAuthEvent(AUTH_EVENTS.INVITATION_REQUESTED, {
        email: data.email,
        organizationName: data.organization.name,
        inviterName: data.inviter.user.name,
        invitationId: data.id,
      })
    },
    schema: {
      organization: {
        modelName: 'organizations',
        fields: {
          createdAt: 'created_at',
          updatedAt: 'updated_at',
        },
        additionalFields: {
          type: { type: 'string' as const, required: false, defaultValue: null, input: false },
        },
      },
      member: {
        modelName: 'members',
        fields: {
          organizationId: 'organization_id',
          userId: 'user_id',
          createdAt: 'created_at',
        },
      },
      invitation: {
        modelName: 'invitations',
        fields: {
          organizationId: 'organization_id',
          expiresAt: 'expires_at',
          inviterId: 'inviter_id',
          createdAt: 'created_at',
        },
      },
      session: {
        fields: {
          activeOrganizationId: 'active_organization_id',
        },
      },
    },
    organizationHooks: {
      ...option?.organizationHooks,
      afterCreateOrganization: async ({ organization: org, user }) => {
        void publishAuthEvent(AUTH_EVENTS.ORG_CREATED, {
          orgId: org.id,
          ownerId: user?.id ?? '',
          name: org.name,
          type: (org as Record<string, unknown>).type as string | null ?? null,
        })
      },
      afterAddMember: async ({ member }) => {
        void publishAuthEvent(AUTH_EVENTS.ORG_MEMBER_ADDED, {
          orgId: member.organizationId,
          userId: member.userId,
          role: member.role,
        })
      },
      afterRemoveMember: async ({ member }) => {
        void publishAuthEvent(AUTH_EVENTS.ORG_MEMBER_REMOVED, {
          orgId: member.organizationId,
          userId: member.userId,
        })
      },
      afterUpdateMemberRole: async ({ member, previousRole }) => {
        void publishAuthEvent(AUTH_EVENTS.ORG_ROLE_CHANGED, {
          orgId: member.organizationId,
          userId: member.userId,
          previousRole,
          newRole: member.role,
        })
      },
    },
  })
}
