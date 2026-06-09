import type { Relations } from '@czo/auth/relations'
import type { ApiKey, Organization, User } from '@czo/auth/services'
import type { BooleanFilter, DateTimeFilter, OrderByInput, SchemaBuilder, StringFilter } from '@czo/kit/graphql'
import type { ResolvedSession } from '../services/session'
import type { SessionRow } from '../services/user'
import type { ApiKeyOwnerInput } from './schema/api-key/inputs'

export { registerAuthSchema } from './schema'
export { authScopes } from './scopes'

export type AuthGraphQLSchemaBuilder = SchemaBuilder<Relations>
export interface AuthContext {
  session: ResolvedSession['session'] | null
  user?: ResolvedSession['user']
  /**
   * Present when the request authenticated via an `x-api-key` header instead of
   * a session (mutually exclusive with an authenticated `user`). Carries the
   * key's owner org and its `permissions` grid; the `permission` scope
   * authorizes against this. `organizationId` is null for a user-owned key.
   */
  apiKey?: {
    id: number
    organizationId: number | null
    permissions: Record<string, string[]>
  }
}

declare module '@czo/kit/graphql' {
  interface GraphQLContextMap {
    auth: AuthContext
  }

  interface BuilderSchemaInputs {
    UserWhereInput: UserWhereInput
    UserOrderByInput: OrderByInput<'email' | 'name' | 'createdAt'>
    ApiKeyOwnerInput: ApiKeyOwnerInput
  }

  interface BuilderSchemaObjects {
    User: User.User
    Organization: Organization.Organization
    Member: Organization.OrganizationMember
    Invitation: Organization.OrganizationInvitation
    ApiKey: ApiKey.ApiKey
    Session: SessionRow
  }

  interface BuilderAuthScopes {
    auth: boolean
    permission: {
      resource: string
      actions: string[]
      organization?: number
    }
    apiKeyOwner:
      | { keyId: number, action: 'update' | 'delete' }
      | { ownerType: 'USER' | 'ORGANIZATION', ownerId: number, action: 'create' }
  }

  interface SchemaBuilderRefs {
  }
}

export interface UserWhereInput {
  name?: StringFilter
  email?: StringFilter
  emailVerified?: BooleanFilter
  twoFactorEnabled?: BooleanFilter
  banned?: BooleanFilter
  banReason?: StringFilter
  banExpires?: DateTimeFilter
  createdAt?: DateTimeFilter
  AND?: UserWhereInput[] | null
  OR?: UserWhereInput[] | null
  NOT?: UserWhereInput | null
}
