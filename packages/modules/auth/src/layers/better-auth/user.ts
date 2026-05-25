import type { BetterAuthOptions } from 'better-auth'

export function userConfig(): BetterAuthOptions['user'] {
  return {
    modelName: 'users',
    fields: {
      // emailVerified: 'email_verified',
      // createdAt: 'created_at',
      // updatedAt: 'updated_at',
    },
  }
}

// Event emission from these hooks (user create / update / 2FA / password
// change) was previously routed through the legacy `AuthEventBus` via
// `publishAuthEvent`. The bus has been deleted; per-domain event publishing
// from better-auth's internal flows will be re-added when each domain bus
// exists (SessionEvents, SecurityEvents, TwoFactorEvents, …).
export function userHooks(): Exclude<BetterAuthOptions['databaseHooks'], undefined>['user'] {
  return {
    create: {
      after: async (_user, _authCtx) => {
        // TODO(events): publish via SecurityEvents/UserEvents when the
        // signup path routes through UserService.
      },
    },
    update: {
      after: async (_user, _authCtx) => {
        // TODO(events): split into UserUpdated / TwoFAEnabled-Disabled /
        // PasswordChanged across domain buses.
      },
    },
  }
}
