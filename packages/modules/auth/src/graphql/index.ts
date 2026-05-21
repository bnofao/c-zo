import type { Relations } from '@czo/auth/relations'
import type { Organization, OrganizationInvitation, OrganizationMember, User } from '@czo/auth/services'
import type { BooleanFilter, DateTimeFilter, OrderByInput, SchemaBuilder, StringFilter } from '@czo/kit/graphql'
// import './context-factory'

export { registerAuthSchema } from './schema'
export { authScopes } from './scopes'

export type AuthGraphQLSchemaBuilder = SchemaBuilder<Relations>
export interface AuthContext {
  /** better-auth session — narrowed when needed */
  session: any
  /** better-auth user — narrowed when needed */
  user?: any
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
    User: User
    Organization: Organization
    Member: OrganizationMember
    Invitation: OrganizationInvitation
  }

  interface BuilderAuthScopes {
    permission: {
      resource: string
      actions: string[]
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
