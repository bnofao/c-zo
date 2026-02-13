import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'

export const OAUTH_ACTOR_COOKIE = 'czo_oauth_actor'
export const COOKIE_MAX_AGE = 300

export function signActorValue(actor: string, secret: string): string {
  const hmac = createHmac('sha256', secret).update(actor).digest('hex')
  return `${actor}.${hmac}`
}

export function verifyActorValue(value: string, secret: string): string | null {
  const dotIndex = value.indexOf('.')
  if (dotIndex === -1)
    return null

  const actor = value.slice(0, dotIndex)
  const providedHmac = value.slice(dotIndex + 1)

  if (!actor || !providedHmac)
    return null

  const expectedHmac = createHmac('sha256', secret).update(actor).digest('hex')

  if (providedHmac.length !== expectedHmac.length)
    return null

  const isValid = timingSafeEqual(
    Buffer.from(providedHmac, 'hex'),
    Buffer.from(expectedHmac, 'hex'),
  )

  return isValid ? actor : null
}
