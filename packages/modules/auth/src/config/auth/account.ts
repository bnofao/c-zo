import type { LiteralUnion, SocialProviderList } from 'better-auth'

export function accountConfig(socialProviders?: Array<LiteralUnion<SocialProviderList[number] | 'email-password', string>>) {
  return {
    modelName: 'accounts',
    fields: {
      accountId: 'account_id',
      providerId: 'provider_id',
      userId: 'user_id',
      accessToken: 'access_token',
      refreshToken: 'refresh_token',
      idToken: 'id_token',
      accessTokenExpiresAt: 'access_token_expires_at',
      refreshTokenExpiresAt: 'refresh_token_expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    accountLinking: {
      enabled: true,
      trustedProviders: socialProviders,
    },
  }
}
