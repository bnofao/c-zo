import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader, setResponseHeader } from '@tanstack/react-start/server'
import { LIFE_URL } from '../env.server'
import { graphql } from '../graphql/gen'
import { gqlAdmin } from '../graphql/gql-admin.server'

/** One resource bucket of the viewer's effective permissions (from the API). */
export interface UserPermission { resource: string, actions: string[] }
export interface MeUser { id: string, name: string, email: string, role: string, permissions: UserPermission[] }

/** Re-emit life's Set-Cookie onto the tour response. Pure, unit-tested. */
export function bridgeSetCookie(setCookieHeader: string | null, set: (value: string) => void): void {
  if (setCookieHeader)
    set(setCookieHeader)
}

const MeQuery = graphql(`query Me { me { id name email role permissions { resource actions } } }`)

export const signIn = createServerFn({ method: 'POST' })
  .validator((data: { email: string, password: string }) => data)
  .handler(async ({ data }) => {
    const res = await fetch(`${LIFE_URL}/api/auth/sign-in`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    })
    bridgeSetCookie(res.headers.get('set-cookie'), v => setResponseHeader('set-cookie', v))
    return { ok: res.ok }
  })

export const signOut = createServerFn({ method: 'POST' }).handler(async () => {
  const res = await fetch(`${LIFE_URL}/api/auth/sign-out`, {
    method: 'POST',
    headers: { cookie: getRequestHeader('cookie') ?? '' },
  })
  bridgeSetCookie(res.headers.get('set-cookie'), v => setResponseHeader('set-cookie', v))
})

export const fetchMe = createServerFn({ method: 'GET' }).handler(async (): Promise<MeUser | null> => {
  const data = await gqlAdmin<{ me: MeUser | null }>(MeQuery)
  return data.me
})
