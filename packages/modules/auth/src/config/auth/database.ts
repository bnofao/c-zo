import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import * as schema from '../../database/schema'

export function databaseConfig(db: unknown) {
  return drizzleAdapter(db as Parameters<typeof drizzleAdapter>[0], {
    provider: 'pg',
    schema: {
      ...schema,
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
      organization: schema.organizations,
      member: schema.members,
      invitation: schema.invitations,
      twoFactor: schema.twoFactor,
      apikey: schema.apikeys,
    },
  })
}
