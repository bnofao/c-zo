import type { Effect } from 'effect'
import { Context } from 'effect'

export class OrganizationService extends Context.Tag('@czo/auth/OrganizationService')<
  OrganizationService,
  {
    readonly checkMembership: (
      organizationId: number,
      userId: number,
    ) => Effect.Effect<boolean, never>
  }
>() {}
