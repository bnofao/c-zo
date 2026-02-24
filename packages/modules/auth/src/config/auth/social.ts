import type { BetterAuthOptions, SocialProviders } from 'better-auth'

export function socialConfig(providers?: SocialProviders, baseUrl?: string): BetterAuthOptions['socialProviders'] {
  if (!baseUrl)
    return providers

  if (providers) {
    return Object.fromEntries(Object.entries(providers).map(([name, config]) => [
      name,
      config.redirectURI ? config : { ...config, redirectURI: `${baseUrl}/api/auth/callback/${name}` },
    ]))
  }
}
