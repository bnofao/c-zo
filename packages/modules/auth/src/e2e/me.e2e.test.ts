import { describe, expect, it } from 'vitest'
import { bootAuthApp } from './harness'

const ME = `query { me { id name email role } }`

describe('me query', () => {
  it('returns the authenticated user, null when anonymous, and is absent on /graphql/public', async () => {
    const h = await bootAuthApp({ subGraphs: ['public', 'account', 'admin'] })
    try {
      const user = await h.signUp('admin@example.com', 'Admin', 'Sup3rSecret!')

      // Authenticated (full schema, Bearer) → returns the user.
      const authed = await h.gql(ME, {}, user.token)
      expect(authed.errors).toBeUndefined()
      expect(authed.data?.me).toMatchObject({ email: 'admin@example.com', name: 'Admin' })

      // Anonymous → null, no error.
      const anon = await h.gql(ME)
      expect(anon.errors).toBeUndefined()
      expect(anon.data?.me).toBeNull()

      // Tagged account+admin, NOT public: the field is undefined on the public sub-graph.
      const onPublic = await h.app.fetch(new Request('http://localhost/graphql/public', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: ME }),
      }))
      const publicBody = await onPublic.json() as { errors?: { message: string }[] }
      expect(publicBody.errors?.[0]?.message ?? '').toMatch(/Cannot query field "me"/)
    }
    finally {
      await h.close()
    }
  })
})
