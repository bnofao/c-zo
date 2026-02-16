import type { BetterAuthOptions } from 'better-auth'
import type { AuthEventsService } from '../events/auth-events'
import type { EmailService } from '../services/email.service'
import type { SecondaryStorage } from '../services/secondary-storage'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { openAPI, organization, twoFactor } from 'better-auth/plugins'
import * as schema from '../database/schema'
import { ACTOR_TYPE_OPTIONS } from '../plugins/actor-config'
import { actorType } from '../plugins/actor-type'
import { ac, viewerRole } from '../services/organization-roles'
import { validatePasswordStrength } from '../services/password'

export interface AuthConfigOptions {
  secret: string
  baseUrl: string
  emailService?: EmailService
  events?: AuthEventsService
  redis?: { storage: SecondaryStorage }
  oauth?: {
    google?: { clientId: string, clientSecret: string }
    github?: { clientId: string, clientSecret: string }
  }
}

export const SESSION_EXPIRY_SECONDS = 604800
export const SESSION_REFRESH_AGE = 86400

export function createAuthConfig(db: unknown, options: AuthConfigOptions): BetterAuthOptions {
  return buildAuthConfig(db, options)
}

interface AuthContext {
  context?: Record<string, unknown>
  headers?: Headers
}

function getActorFromContext(authCtx: AuthContext | null): string {
  return (authCtx?.context?.actorType as string | undefined) ?? 'customer'
}

function getAuthMethodFromContext(authCtx: AuthContext | null): string {
  return (authCtx?.context?.authMethod as string | undefined) ?? 'email'
}

function buildAuthConfig(db: unknown, options: AuthConfigOptions) {
  return {
    secret: options.secret,
    baseURL: options.baseUrl,
    basePath: '/api/auth',
    database: drizzleAdapter(db as Parameters<typeof drizzleAdapter>[0], {
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
      },
    }),
    user: {
      modelName: 'users',
    },
    account: {
      modelName: 'accounts',
      accountLinking: {
        enabled: true,
        trustedProviders: ['google', 'github'],
      },
    },
    socialProviders: {
      ...(options.oauth?.google
        ? {
            google: {
              clientId: options.oauth.google.clientId,
              clientSecret: options.oauth.google.clientSecret,
              redirectURI: `${options.baseUrl}/api/auth/callback/google`,
            },
          }
        : {}),
      ...(options.oauth?.github
        ? {
            github: {
              clientId: options.oauth.github.clientId,
              clientSecret: options.oauth.github.clientSecret,
              redirectURI: `${options.baseUrl}/api/auth/callback/github`,
            },
          }
        : {}),
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user: { id: string, email: string, name: string }, authCtx: AuthContext | null) => {
            void options.events?.userRegistered({
              userId: user.id,
              email: user.email,
              actorType: getActorFromContext(authCtx),
            })
          },
        },
        update: {
          after: async (user: { id: string, [key: string]: unknown }, authCtx: AuthContext | null) => {
            const { id: userId, ...changes } = user
            void options.events?.userUpdated({ userId, changes })

            if ('twoFactorEnabled' in changes) {
              const actorType = getActorFromContext(authCtx)
              if (changes.twoFactorEnabled === true) {
                void options.events?.twoFactorEnabled({
                  userId,
                  actorType,
                })
              }
              else if (changes.twoFactorEnabled === false) {
                void options.events?.twoFactorDisabled({
                  userId,
                  actorType,
                })
              }
            }
          },
        },
      },
      session: {
        create: {
          before: async (session: { token: string }, authCtx: AuthContext | null) => {
            return {
              data: {
                ...session,
                actorType: getActorFromContext(authCtx),
                authMethod: getAuthMethodFromContext(authCtx),
                organizationId: null,
              },
            }
          },
          after: async (session: { id: string, userId: string, actorType?: string, authMethod?: string }) => {
            void options.events?.sessionCreated({
              sessionId: session.id,
              userId: session.userId,
              actorType: session.actorType ?? 'customer',
              authMethod: session.authMethod ?? 'email',
            })
          },
        },
      },
    },
    session: {
      modelName: 'sessions',
      expiresIn: SESSION_EXPIRY_SECONDS,
      updateAge: SESSION_REFRESH_AGE,
      additionalFields: {
        actorType: { type: 'string' as const, defaultValue: 'customer', input: false },
        authMethod: { type: 'string' as const, defaultValue: 'email', input: false },
        organizationId: { type: 'string' as const, required: false, input: false },
      },
      ...(options.redis ? { storeSessionInDatabase: true } : {}),
    },
    ...(options.redis
      ? { secondaryStorage: options.redis.storage }
      : {}),
    verification: {
      modelName: 'verifications',
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      password: {
        hash: async (password: string) => {
          const result = validatePasswordStrength(password)
          if (!result.valid) {
            throw new Error(`Password too weak: ${result.errors.join(', ')}`)
          }
          const { hashPassword } = await import('better-auth/crypto')
          return hashPassword(password)
        },
        verify: async ({ hash, password }: { hash: string, password: string }) => {
          const { verifyPassword } = await import('better-auth/crypto')
          return verifyPassword({ hash, password })
        },
      },
      requireEmailVerification: false,
      sendResetPassword: async ({ user, url, token }) => {
        await options.emailService?.sendPasswordResetEmail({
          to: user.email,
          userName: user.name,
          url,
          token,
        })
      },
      resetPasswordTokenExpiresIn: 3600,
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url, token }) => {
        await options.emailService?.sendVerificationEmail({
          to: user.email,
          userName: user.name,
          url,
          token,
        })
      },
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 3600,
    },
    rateLimit: {
      window: 60,
      max: 10,
    },
    advanced: {
      cookiePrefix: 'czo',
      useSecureCookies: options.baseUrl.startsWith('https'),
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax' as const,
      },
    },
    plugins: [
      twoFactor({
        issuer: 'c-zo',
      }),
      openAPI({ disableDefaultReference: true }),
      actorType(ACTOR_TYPE_OPTIONS),
      organization({
        ac,
        roles: { viewer: viewerRole },
        creatorRole: 'owner',
        invitationExpiresIn: 604800,
        sendInvitationEmail: async (data) => {
          await options.emailService?.sendInvitationEmail({
            to: data.email,
            organizationName: data.organization.name,
            inviterName: data.inviter.user.name,
            invitationId: data.id,
          })
        },
        schema: {
          organization: {
            modelName: 'organizations',
            additionalFields: {
              type: { type: 'string' as const, required: false, defaultValue: null, input: false },
            },
          },
          member: { modelName: 'members' },
          invitation: { modelName: 'invitations' },
        },
        organizationHooks: {
          afterCreateOrganization: async ({ organization: org, user }) => {
            void options.events?.orgCreated({
              orgId: org.id,
              ownerId: user?.id ?? '',
              name: org.name,
              type: (org as Record<string, unknown>).type as string | null ?? null,
            })
          },
          afterAddMember: async ({ member }) => {
            void options.events?.orgMemberAdded({
              orgId: member.organizationId,
              userId: member.userId,
              role: member.role,
            })
          },
          afterRemoveMember: async ({ member }) => {
            void options.events?.orgMemberRemoved({
              orgId: member.organizationId,
              userId: member.userId,
            })
          },
          afterUpdateMemberRole: async ({ member, previousRole }) => {
            void options.events?.orgRoleChanged({
              orgId: member.organizationId,
              userId: member.userId,
              previousRole,
              newRole: member.role,
            })
          },
        },
      }),
    ],
  } satisfies BetterAuthOptions
}

export function createAuth(db: unknown, options: AuthConfigOptions) {
  return betterAuth(buildAuthConfig(db, options))
}

export type Auth = ReturnType<typeof createAuth>
