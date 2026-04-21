import type { SchemaRegistry } from '@czo/kit/db'
import { defineRelationsPart } from 'drizzle-orm'

export function authRelations(schema: SchemaRegistry) {
  const { apps, users, webhookDeliveries, apikeys, organizations, accounts, sessions } = schema

  return defineRelationsPart(
    { apps, users, webhookDeliveries, apikeys, organizations, accounts, sessions },
    r => ({
      apps: {
        installedByUser: r.one.users({
          from: r.apps.installedBy,
          to: r.users.id,
        }),
        webhookDeliveries: r.many.webhookDeliveries(),
        apiKeys: r.many.apikeys(),
      },
      webhookDeliveries: {
        app: r.one.apps({
          from: r.webhookDeliveries.appId,
          to: r.apps.id,
        }),
      },
      apikeys: {
        installedApp: r.one.apps({
          from: r.apikeys.installedAppId,
          to: r.apps.id,
        }),
      },
      users: {

      },
      organizations: {

      },
      accounts: {

      },
      sessions: {
        
      }
    }),
  )
}

export type Relations = ReturnType<typeof authRelations>
