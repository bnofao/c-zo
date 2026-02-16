export type AuthSource = 'bearer' | 'cookie' | 'api-key'

export interface ExtractedCredentials {
  headers: Headers
  source: AuthSource
}

export function extractCredentials(request: Request, cookiePrefix: string): ExtractedCredentials | null {
  const authorization = request.headers.get('authorization')
  if (authorization?.startsWith('Bearer ')) {
    const token = authorization.slice(7)
    return {
      headers: new Headers({ authorization }),
      source: token.startsWith('czo_') ? 'api-key' : 'bearer',
    }
  }

  const cookieName = `${cookiePrefix}.session_token`
  const cookieHeader = request.headers.get('cookie')
  if (cookieHeader) {
    const hasSessionCookie = cookieHeader
      .split(';')
      .some(c => c.trim().startsWith(`${cookieName}=`))

    if (hasSessionCookie) {
      return {
        headers: new Headers({ cookie: cookieHeader }),
        source: 'cookie',
      }
    }
  }

  return null
}
