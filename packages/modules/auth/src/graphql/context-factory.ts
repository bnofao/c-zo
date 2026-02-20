import { registerContextFactory } from '@czo/kit/graphql'
import { useContainer } from '@czo/kit/ioc'
import '../types'

registerContextFactory('auth', async (serverCtx) => {
  const container = useContainer()

  const request = serverCtx.request as Request
  const authService = await container.make('auth:service')
  const authSession = await authService.getSession(request.headers) // Session must be not null. Check entrypoint

  return {
    auth: {
      instance: await container.make('auth'),
      userService: await container.make('auth:users'),
      authService: await container.make('auth:service'),
      session: authSession!.session,
      user: authSession!.user,
    },

  }
})
