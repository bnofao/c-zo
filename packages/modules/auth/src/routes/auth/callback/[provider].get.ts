import type { Auth } from '../../../config/auth.config'
import { defineHandler, deleteCookie, getCookie, getRouterParam, HTTPError } from 'nitro/h3'
import { isProviderAllowedForActor, SUPPORTED_PROVIDERS } from '../../../services/oauth-providers'
import { OAUTH_ACTOR_COOKIE, verifyActorValue } from '../../../services/oauth-state'
import { runWithSessionContext } from '../../../services/session-context'

export default defineHandler(async (event) => {
  const auth = (event.context as Record<string, unknown>).auth as Auth | undefined
  const authSecret = (event.context as Record<string, unknown>).authSecret as string | undefined

  if (!auth) {
    throw new HTTPError({ status: 500, statusText: 'Auth instance not found in event context' })
  }

  if (!authSecret) {
    throw new HTTPError({ status: 500, statusText: 'Auth secret not found in event context' })
  }

  const provider = getRouterParam(event, 'provider')

  if (!provider || !SUPPORTED_PROVIDERS.includes(provider as typeof SUPPORTED_PROVIDERS[number])) {
    throw new HTTPError({ status: 400, statusText: `Unsupported provider: ${provider}` })
  }

  const cookieValue = getCookie(event, OAUTH_ACTOR_COOKIE)

  if (!cookieValue) {
    throw new HTTPError({ status: 403, statusText: 'Missing OAuth actor cookie' })
  }

  const actor = verifyActorValue(cookieValue, authSecret)

  if (!actor) {
    throw new HTTPError({ status: 403, statusText: 'Invalid or tampered OAuth actor cookie' })
  }

  if (!isProviderAllowedForActor(provider, actor)) {
    throw new HTTPError({ status: 403, statusText: `Provider ${provider} is not allowed for actor ${actor}` })
  }

  deleteCookie(event, OAUTH_ACTOR_COOKIE, { path: '/api/auth' })

  return runWithSessionContext(
    { actorType: actor, authMethod: `oauth:${provider}` },
    () => auth.handler(event.req),
  )
})
