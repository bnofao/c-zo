import type { AuthContext } from '../types'
import { runEffect, useRuntime } from '@czo/kit/effect'
import { registerContextFactory } from '@czo/kit/graphql'
import { BetterAuth } from '../services/auth-instance'

export async function buildAuthContext(request: Request): Promise<AuthContext> {
  const runtime = useRuntime()
  const instance = await runEffect(runtime, BetterAuth)
  const session = await instance.api.getSession({ headers: request.headers })

  return {
    runtime,
    session: session ?? null,
    user: session?.user ?? null,
  }
}

registerContextFactory('auth', async (serverCtx) => {
  const request = serverCtx.request as Request
  const ctx = await buildAuthContext(request)

  return { auth: ctx }
})
