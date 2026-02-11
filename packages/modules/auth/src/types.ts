export interface AuthContext {
  session: {
    id: string
    userId: string
    expiresAt: Date
    actorType: string
    authMethod: string
    organizationId: string | null
  }
  user: {
    id: string
    email: string
    name: string
  }
  actorType: string
  organization: string | null
  authSource: 'bearer' | 'cookie' | 'api-key'
}

export interface GraphQLContext {
  auth: AuthContext
}
