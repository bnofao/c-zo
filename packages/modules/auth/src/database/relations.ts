import type { SchemaRegistry } from '@czo/kit/db'
import { defineRelationsPart } from 'drizzle-orm'

export function authRelations(schema: SchemaRegistry) {
  return defineRelationsPart(
    schema,
    r => ({
      // apps: {
      //   installedByUser: r.one.users({
      //     from: r.apps.installedBy,
      //     to: r.users.id,
      //   }),
      //   webhookDeliveries: r.many.webhookDeliveries(),
      //   apiKeys: r.many.apikeys(),
      // },
      // webhookDeliveries: {
      //   app: r.one.apps({
      //     from: r.webhookDeliveries.appId,
      //     to: r.apps.id,
      //   }),
      // },
      apikeys: {
        // installedApp: r.one.apps({
        //   from: r.apikeys.installedAppId,
        //   to: r.apps.id,
        // }),
      },
      users: {

      },
      organizations: {
        members: r.many.members({
          from: r.organizations.id,
          to: r.members.organizationId,
        }),
      },
      accounts: {

      },
      sessions: {

      },
      members: {
        organization: r.one.organizations({
          from: r.members.organizationId,
          to: r.organizations.id,
        }),
        user: r.one.users({
          from: r.members.userId,
          to: r.users.id,
        }),
      },
      invitations: {
        organization: r.one.organizations({
          from: r.invitations.organizationId,
          to: r.organizations.id,
        }),
        inviter: r.one.users({
          from: r.invitations.inviterId,
          to: r.users.id,
        }),
      },
    }),
  )
}

export type Relations = ReturnType<typeof authRelations>
