import type { Effect } from 'effect'
import { Context } from 'effect'

export interface OrganizationService {
  readonly checkMembership: (
    organizationId: number,
    userId: number,
  ) => Effect.Effect<boolean, never>
}

export const OrganizationService = Context.GenericTag<OrganizationService>(
  '@czo/auth/OrganizationService',
)
