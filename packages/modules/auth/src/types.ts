import type { Relations } from '@czo/auth/relations'
import type { Database, RelationsEntry } from '@czo/kit/db'
import type { BooleanFilter, BuilderSchemaInputs, DateTimeFilter, GraphQLContextMap, orderDirectionSchema, SchemaBuilder, SchemaBuilderRefs, StringFilter } from '@czo/kit/graphql'
import type { SocialProviders } from 'better-auth/social-providers'
import type { AccessService } from './config/access'
import type { AuthActorService } from './config/actor'
import type { Auth } from './config/auth'
import type { AccountService } from './services/account.service'
import type { ApiKeyService } from './services/api-key'
import type { AppService } from './services/app.service'
import type { AuthService } from './services/auth.service'
import type { OrganizationService } from './services/organization.service'
import type { SessionService } from './services/session.service'
import type { TwoFactorService } from './services/twoFactor.service'

import type { UserService } from './services/user.service'
import { apikeys, invitations, members, organizations, users } from '@czo/auth/schema'
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-orm/zod'
import { z } from 'zod'

export type { Relations as AuthRelations } from '@czo/auth/relations'

export interface AuthContext {
  userService: UserService
  organizationService: OrganizationService
  // accountService: AccountService
  // sessionService: SessionService
  // twoFactorService: TwoFactorService
  // apiKeyService: ApiKeyService
  // appService: AppService
  authService: AuthService
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
    UserCreateData: CreateUserInput
    UserUpdateData: UpdateUserInput
    UserWhereInput: UserWhereInput
    UserOrderByInput: UserOrderByInput
    UserBanData: BanUserInput
    ImpersonateUserInput: ImpersonateUserInput
    CreateOrganizationInput: CreateOrganizationInput
    // SetActiveOrganizationInput: SetActiveOrganizationInput
  }

  interface BuilderSchemaObjects {
    User: User
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

declare module '@czo/kit/db' {
  interface SchemaRegistry {
    users: typeof users
    sessions: typeof import('./database/schema').sessions
    accounts: typeof import('./database/schema').accounts
    verifications: typeof import('./database/schema').verifications
    organizations: typeof import('./database/schema').organizations
    members: typeof import('./database/schema').members
    invitations: typeof import('./database/schema').invitations
    twoFactor: typeof import('./database/schema').twoFactor
    apps: typeof import('./database/schema').apps
    webhookDeliveries: typeof import('./database/schema').webhookDeliveries
    apikeys: typeof import('./database/schema').apikeys
  }
}

declare module '@czo/kit/ioc' {
  interface ContainerBindings {
    'auth': Auth
    'auth:actor': AuthActorService
    'auth:access': AccessService
    'auth:users': UserService
    'auth:service': AuthService
    'auth:organizations': OrganizationService
    'auth:accounts': AccountService
    'auth:sessions': SessionService
    'auth:twoFactor': TwoFactorService
    'auth:apikeys': ApiKeyService
    'auth:apps': AppService
  }
}

declare module 'nitro/types' {
  interface NitroRuntimeConfig {
    auth: {
      secret: string
      socials?: SocialProviders
      app?: {
        /** Additional event types apps can subscribe to via webhooks, merged with BASE_SUBSCRIBABLE_EVENTS. */
        subscribableEvents?: string[]
      }
    }
  }
}

/**
 * Alias for codegen compatibility — codegen.ts references `../../types#GraphQLContext`.
 * The actual shape is composed from all module augmentations of GraphQLContextMap.
 */
export type GraphQLContext = GraphQLContextMap
export type AuthGraphQLShemaBuilder = SchemaBuilder<Relations>

/**
 * User
 */
export const createUserSchema = createInsertSchema(users, {
  email: z.email().transform(email => email.toLowerCase()),
  name: schema => schema.max(225).min(1).transform(name => name.trim()),
  role: z.union([z.string(), z.array(z.string())]).nullable().optional(),
}).pick({ email: true, name: true, role: true }).and(z.object({ password: z.string().min(8).max(128).nullable().optional() }))

export const updateUserSchema = createUpdateSchema(users, {
  name: schema => schema.max(225).min(1).transform(name => name?.trim()),
  role: z.union([z.string(), z.array(z.string())]).nullable().optional(),
}).pick({ name: true, role: true })

export const selectUserSchema = createSelectSchema(users)

export const banUserSchema = z.object({
  reason: z.string().max(1024).nullable().optional(),
  expiresIn: z.number().meta({ description: 'Time in seconds until the ban expires' }).nullable().optional(),
})

export const passwordSchema = z
  .string()
  .min(8, { message: 'Password must be at least 8 characters long' })
  .max(20, { message: 'Password cannot exceed 20 characters' })
  .refine(val => /[A-Z]/.test(val), {
    message: 'Password must contain at least one uppercase letter',
  })
  .refine(val => /[a-z]/.test(val), {
    message: 'Password must contain at least one lowercase letter',
  })
  .refine(val => /\d/.test(val), {
    message: 'Password must contain at least one number',
  })
  .refine(val => /[!@#$%^&*]/.test(val), {
    message: 'Password must contain at least one special character',
  })

export const impersonateUserSchema = z.object({
  byUserId: z.number().positive(),
  actor: z.string().nonempty(),
  sessionDuration: z.number().positive().meta({ description: 'Duration in seconde' }).optional(),
})

export const userOrderFieldSchema = z.enum({
  NAME: 'name',
  EMAIL: 'email',
  CREATED_AT: 'createdAt',
})

/**
 * Organization
 */

export const createOrganizationSchema = createInsertSchema(organizations, {
  name: schema => schema.max(255).min(1).transform(name => name.trim()),
}).pick({ name: true, type: true, logo: true, metadata: true, slug: true }).and(z.object({
  userId: z.number().positive(),
}))

export const updateOrganizationSchema = createUpdateSchema(organizations, {
  name: schema => schema.max(255).min(1).transform(name => name.trim()),
  logo: z.string().max(1024).nullable().optional(),
  metadata: z.string().nullable().optional(),
  slug: z.string().max(255).nullable().optional(),
}).pick({ name: true, type: true, logo: true, metadata: true, slug: true })

export const selectOrganizationSchema = createSelectSchema(organizations)

export const selectOrgMemberSchema = createSelectSchema(members)

export const createOrgMemberSchema = createInsertSchema(members).omit({ createdAt: true })

export const removeOrgMemberSchema = z.object({
  identifier: z.union([z.int().positive(), z.email()]),
  organizationId: z.int().positive(),
})

export const updateOrgMemberSchema = z.object({
  id: z.int().positive(),
  organizationId: z.int().positive(),
  role: z.union([z.string(), z.array(z.string())]),
})

export const createOrgInvitationSchema = createInsertSchema(invitations, {
  role: z.union([z.string(), z.array(z.string())]),
}).pick(
  { email: true, role: true, organizationId: true, inviterId: true },
).and(z.object({ resend: z.boolean().optional() }))

export const selectOrgInvitationSchema = createSelectSchema(invitations)

export const cancelOrgInvitationSchema = z.object({
  id: z.int().positive(),
  organizationId: z.int().positive(),
})

/**
 * API Key
 */

export const createApiKeySchema = z.object({
  name: z.string().nonempty(),
  group: z.string().nonempty(),
  expiresIn: z.int().positive().nullable().optional(),
  prefix: z.string().nonempty(),
  remaining: z.number().min(0).nullable().optional(),
  metadata: z.any().optional(),
  refillAmount: z.number().min(1).optional(),
  refillInterval: z.number().optional(),
  rateLimitTimeWindow: z.number().optional(),
  rateLimitMax: z.number().optional(),
  rateLimitEnabled: z.boolean().optional(),
  permissions: z.record(z.string(), z.array(z.string())).optional(),
  referenceId: z.number(),
})

export const updateApiKeySchema = z.object({
  name: z.string().nonempty().optional(),
  enabled: z.boolean().optional(),
  remaining: z.number().min(0).nullable().optional(),
  metadata: z.any().optional(),
  expiresIn: z.int().positive().nullable().optional(),
  permissions: z.record(z.string(), z.array(z.string())).nullable().optional(),
  refillAmount: z.number().min(1).optional(),
  refillInterval: z.number().optional(),
  rateLimitEnabled: z.boolean().optional(),
  rateLimitTimeWindow: z.number().optional(),
  rateLimitMax: z.number().optional(),
})

export const selectApiKeySchema = createSelectSchema(apikeys)

// export const setActiveOrganizationSchema = z.object({
//   id: z.number().positive().optional(),
//   slug: z.string().max(255).optional(),
// })

export type User = z.infer<typeof selectUserSchema>
export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
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
export type BanUserInput = z.infer<typeof banUserSchema>
export type ImpersonateUserInput = z.infer<typeof impersonateUserSchema>
export type UserOderField = z.infer<typeof userOrderFieldSchema>
export interface UserOrderByInput {
  field: UserOderField
  direction: z.infer<typeof orderDirectionSchema>
}

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>
export type Organization = z.infer<typeof selectOrganizationSchema>
export type OrganizationMember = z.infer<typeof selectOrgMemberSchema>
export type CreateOrgMemberInput = z.infer<typeof createOrgMemberSchema>
export type RemoveOrgMemberInput = z.infer<typeof removeOrgMemberSchema>
export type UpdateOrgMemberInput = z.infer<typeof updateOrgMemberSchema>
export type CreateOrgInvitationInput = z.infer<typeof createOrgInvitationSchema>
export type OrganizationInvitation = z.infer<typeof selectOrgInvitationSchema>
export type CancelOrgInvitationInput = z.infer<typeof cancelOrgInvitationSchema>
// export type SetActiveOrganizationInput = z.infer<typeof setActiveOrganizationSchema>

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>
export type UpdateApiKeyInput = z.infer<typeof updateApiKeySchema>
export type ApiKey = z.infer<typeof selectApiKeySchema>
