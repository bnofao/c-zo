import type { ApiRoute } from './route'
import { H3 } from 'h3'
import { describe, expect, it } from 'vitest'
import { mountOpenApi } from './mount'

const widget: ApiRoute = {
  method: 'get',
  path: '/widgets/:id',
  operation: { summary: 'Get widget', responses: { 200: { description: 'OK' } } },
  handler: event => ({ id: event.context.params?.id }),
}

const docs = { info: { title: 'T', version: '1.0.0' }, jsonPath: '/openapi.json', uiPath: '/reference' }

describe('mountOpenApi', () => {
  it('registers the route handler regardless of docs', async () => {
    const app = new H3()
    mountOpenApi(app, [widget])
    const res = await app.request('/widgets/42')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: '42' })
  })

  it('serves the document and Scalar UI when docs are provided', async () => {
    const app = new H3()
    mountOpenApi(app, [widget], docs)

    const json = await app.request('/openapi.json')
    const doc = await json.json()
    expect(doc.paths['/widgets/{id}'].get.summary).toBe('Get widget')

    const ui = await app.request('/reference')
    expect(ui.headers.get('content-type')).toContain('text/html')
    expect(await ui.text()).toContain('/openapi.json')
  })

  it('does not mount doc endpoints when docs are omitted', async () => {
    const app = new H3()
    mountOpenApi(app, [widget])
    const res = await app.request('/openapi.json')
    expect(res.status).toBe(404)
  })
})
