import type { Auth } from '../../../../config/auth.config'
import type { Actor } from '../[...all]'
import { defineHandler, getRouterParam, HTTPError, readBody, setCookie } from 'nitro/h3'
import { isProviderAllowedForActor, SUPPORTED_PROVIDERS } from '../../../../services/oauth-providers'
import { COOKIE_MAX_AGE, OAUTH_ACTOR_COOKIE, signActorValue } from '../../../../services/oauth-state'
import { runWithSessionContext } from '../../../../services/session-context'
import { VALID_ACTORS } from '../[...all]'

export default defineHandler(async (event) => {
  const auth = (event.context as Record<string, unknown>).auth as Auth | undefined
  const authSecret = (event.context as Record<string, unknown>).authSecret as string | undefined

  if (!auth) {
    throw new HTTPError({ status: 500, statusText: 'Auth instance not found in event context' })
  }

  if (!authSecret) {
    throw new HTTPError({ status: 500, statusText: 'Auth secret not found in event context' })
  }

  const actor = getRouterParam(event, 'actor')

  if (!actor || !VALID_ACTORS.includes(actor as Actor)) {
    throw new HTTPError({ status: 400, statusText: `Invalid actor: ${actor}. Must be one of: ${VALID_ACTORS.join(', ')}` })
  }

  const body = await readBody(event) as { provider?: string, callbackURL?: string } | undefined

  if (!body?.provider) {
    throw new HTTPError({ status: 400, statusText: 'Missing required field: provider' })
  }

  const { provider } = body

  if (!SUPPORTED_PROVIDERS.includes(provider as typeof SUPPORTED_PROVIDERS[number])) {
    throw new HTTPError({ status: 400, statusText: `Unsupported provider: ${provider}. Must be one of: ${SUPPORTED_PROVIDERS.join(', ')}` })
  }

  if (!isProviderAllowedForActor(provider, actor)) {
    throw new HTTPError({ status: 403, statusText: `Provider ${provider} is not allowed for actor ${actor}` })
  }

  const signedValue = signActorValue(actor, authSecret)
  setCookie(event, OAUTH_ACTOR_COOKIE, signedValue, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/api/auth',
  })

  const url = new URL(event.req.url)
  url.pathname = url.pathname.replace(`/auth/${actor}/`, '/auth/')
  const rewrittenReq = new Request(url, event.req)

  return runWithSessionContext(
    { actorType: actor, authMethod: `oauth:${provider}` },
    () => auth.handler(rewrittenReq),
  )
})
