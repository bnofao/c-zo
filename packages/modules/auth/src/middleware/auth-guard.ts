import { defineHandler, HTTPError } from 'nitro/h3'

export default defineHandler((event) => {
  const url = new URL(event.req.url)
  const pathname = url.pathname

  if (!pathname.startsWith('/api/auth'))
    return

  const ctx = event.context as Record<string, unknown>

  if (!ctx.auth) {
    throw new HTTPError({ status: 500, statusText: 'Auth not initialized' })
  }

  if (!ctx.authSecret) {
    throw new HTTPError({ status: 500, statusText: 'Auth secret not configured' })
  }
})
