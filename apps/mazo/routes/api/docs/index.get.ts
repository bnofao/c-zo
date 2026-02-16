import { defineHandler, html } from 'nitro/h3'

const scalarConfig = JSON.stringify({
  theme: 'default',
  metaData: {
    title: 'c-zo API',
    description: 'c-zo e-commerce platform API',
  },
})

export default defineHandler(() => {
  return html`<!doctype html>
<html>
  <head>
    <title>c-zo API Reference</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <script
      id="api-reference"
      data-url="/api/docs/openapi"
      data-configuration='${scalarConfig}'></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`
})
