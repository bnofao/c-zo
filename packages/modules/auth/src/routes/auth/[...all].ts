import { defineHandler, HTTPError } from 'nitro/h3'

export default defineHandler(async (event) => {
  const auth = (event.context as Record<string, unknown>).auth as
    | { handler: (req: Request) => Promise<Response> }
    | undefined

  if (!auth) {
    throw new HTTPError({ status: 500, statusText: 'Auth instance not found in event context' })
  }

  return auth.handler(event.req)
})
