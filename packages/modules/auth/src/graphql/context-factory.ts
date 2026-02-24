import { registerContextFactory } from '@czo/kit/graphql'
import { useContainer } from '@czo/kit/ioc'
import '../types'

registerContextFactory('auth', async (serverCtx) => {
  const container = useContainer()

  const request = serverCtx.request as Request
  const authService = await container.make('auth:service')
  const authSession = await authService.getSession(request.headers)

  return {
    auth: {
      instance: await container.make('auth'),
      userService: await container.make('auth:users'),
      organizationService: await container.make('auth:organizations'),
      authService,
      apiKeyService: await container.make('auth:apikeys'),
      session: authSession?.session ?? null,
      user: authSession?.user ?? null,
    },
  }
})
