import type { Relations } from '@czo/auth/relations'
import type { Organization, User } from '@czo/auth/services'
import type { BooleanFilter, DateTimeFilter, OrderByInput, SchemaBuilder, StringFilter } from '@czo/kit/graphql'
import type { ResolvedSession } from '../services/session'

export { registerAuthSchema } from './schema'
export { authScopes } from './scopes'

export type AuthGraphQLSchemaBuilder = SchemaBuilder<Relations>
export interface AuthContext {
  session: ResolvedSession['session'] | null
  user?: ResolvedSession['user']
}

declare module '@czo/kit/graphql' {
  interface GraphQLContextMap {
    auth: AuthContext
  }

  interface BuilderSchemaInputs {
    UserWhereInput: UserWhereInput
    UserOrderByInput: OrderByInput<'email' | 'name' | 'createdAt'>
  }

  interface BuilderSchemaObjects {
    User: User.User
    Organization: Organization.Organization
    Member: Organization.OrganizationMember
    Invitation: Organization.OrganizationInvitation
  }

  interface BuilderAuthScopes {
    auth: boolean
    permission: {
      resource: string
      actions: string[]
      organization?: number
    }
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
