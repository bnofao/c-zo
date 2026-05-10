import type { AuthContext } from '../types'
import { useRuntime } from '@czo/kit/effect'
import { registerContextFactory } from '@czo/kit/graphql'
import { useContainer } from '@czo/kit/ioc'

export async function buildAuthContext(request: Request): Promise<AuthContext> {
  const container = useContainer()

  const [
    instance,
    authService,
  ] = await Promise.all([
    container.make('auth'),
    container.make('auth:service'),
  ])

  const session = await instance.api.getSession({ headers: request.headers })

  return {
    authService,
    runtime: useRuntime(),
    session: session ?? null,
    user: session?.user ?? null,
  }
}

registerContextFactory('auth', async (serverCtx) => {
  const request = serverCtx.request as Request
  const ctx = await buildAuthContext(request)

  return { auth: ctx }
})
