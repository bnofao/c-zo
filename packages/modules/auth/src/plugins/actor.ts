export const DEFAULT_ACTOR_RESTRICTIONS = {
  admin: {
    allowedMethods: ['email', 'oauth:github'] as const,
    sessionDuration: 28800,
    enableRegistration: true,
    allowImpersonation: false,
  },
}
