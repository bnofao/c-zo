import type { BetterAuthOptions } from 'better-auth'
import { AUTH_EVENTS, publishAuthEvent } from '../../events'

export function userConfig(): BetterAuthOptions['user'] {
  return {
    modelName: 'users',
    fields: {
      emailVerified: 'email_verified',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    changeEmail: {
      enabled: true,
      sendChangeEmailConfirmation: async (_user, _request) => {

      },
    },
    deleteUser: {
      enabled: true,
      sendDeleteAccountVerification: async (_user, _request) => {

      },
      beforeDelete: async (_user, _request) => {

      },
      afterDelete: async (user, _request) => {
        void publishAuthEvent(AUTH_EVENTS.ACCOUNT_DELETED, {
          userId: user.id,
          email: user.email,
        })
      },
    },
  }
}

export function userHooks(): Exclude<BetterAuthOptions['databaseHooks'], undefined>['user'] {
  return {
    create: {
      after: async (user, authCtx) => {
        void publishAuthEvent(AUTH_EVENTS.USER_REGISTERED, {
          userId: user.id,
          email: user.email,
          actorType: authCtx?.context?.actorType as string | undefined,
        })
      },
    },
    update: {
      after: async (user, authCtx) => {
        const { id: userId, ...changes } = user
        void publishAuthEvent(AUTH_EVENTS.USER_UPDATED, { userId, changes })

        if ('twoFactorEnabled' in changes) {
          const actorType = authCtx?.context?.actorType as string | undefined
          if (changes.twoFactorEnabled === true) {
            void publishAuthEvent(AUTH_EVENTS.TWO_FA_ENABLED, {
              userId,
              actorType,
            })
          }
          else if (changes.twoFactorEnabled === false) {
            void publishAuthEvent(AUTH_EVENTS.TWO_FA_DISABLED, {
              userId,
              actorType,
            })
          }
        }

        if ('hashedPassword' in changes || 'password' in changes) {
          const email = ('email' in user ? user.email : '') as string
          void publishAuthEvent(AUTH_EVENTS.PASSWORD_CHANGED, { userId, email })
        }
      },
    },
  }
}
