import { registerContextFactory } from '@czo/kit/graphql'
import { useContainer } from '@czo/kit/ioc'
import type { AuthContext } from '../types'

export async function buildAuthContext(request: Request): Promise<AuthContext> {
  const container = useContainer()

  const [
    userService,
    organizationService,
    accountService,
    sessionService,
    twoFactorService,
    apiKeyService,
    appService,
    authService,
  ] = await Promise.all([
    container.make('auth:users'),
    container.make('auth:organizations'),
    container.make('auth:accounts'),
    container.make('auth:sessions'),
    container.make('auth:twoFactor'),
    container.make('auth:apikeys'),
    container.make('auth:apps'),
    container.make('auth:service'),
  ])

  const session = await authService.getSession(request.headers)

  return {
    userService,
    organizationService,
    accountService,
    sessionService,
    twoFactorService,
    apiKeyService,
    appService,
    authService,
    session: session ?? null,
    user: session?.user ?? null,
  }
}

registerContextFactory('auth', async (serverCtx) => {
  const request = serverCtx.request as Request
  const ctx = await buildAuthContext(request)

  return { auth: ctx }
})
