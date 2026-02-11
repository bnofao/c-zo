import { createError, defineHandler, toWebRequest } from 'nitro/h3'

export default defineHandler(async (event) => {
  const auth = (event.context as Record<string, unknown>).auth as
    | { handler: (req: Request) => Promise<Response> }
    | undefined

  if (!auth) {
    throw createError({ statusCode: 500, statusMessage: 'Auth instance not found in event context' })
  }

  return auth.handler(toWebRequest(event))
})
