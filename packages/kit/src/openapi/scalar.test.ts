import { describe, expect, it } from 'vitest'
import { scalarHtml } from './scalar'

describe('scalarHtml', () => {
  it('embeds the JSON url and default CDN', () => {
    const html = scalarHtml({ jsonUrl: '/openapi.json' })
    expect(html).toContain('https://cdn.jsdelivr.net/npm/@scalar/api-reference')
    expect(html).toContain('Scalar.createApiReference(\'#app\', { url: "/openapi.json" })')
  })

  it('honours a custom cdn and title', () => {
    const html = scalarHtml({ jsonUrl: '/spec', cdn: 'https://example.com/s.js', title: 'My API' })
    expect(html).toContain('https://example.com/s.js')
    expect(html).toContain('<title>My API</title>')
  })
})
