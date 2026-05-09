import type { AuthRelations } from '@czo/auth/types'
import type { Database } from '@czo/kit/db'
import { DrizzleDb } from '@czo/kit/db/effect'
import { Effect, Layer } from 'effect'
import { OrganizationService } from '../services/organization'

export const OrganizationServiceLive = Layer.effect(
  OrganizationService,
  Effect.gen(function* () {
    const db = (yield* DrizzleDb) as Database<AuthRelations>
    return {
      checkMembership: (organizationId, userId) =>
        Effect.promise(async () => {
          const member = await db.query.members.findFirst({
            where: { organizationId, userId },
          })
          return !!member
        }),
    }
  }),
)
