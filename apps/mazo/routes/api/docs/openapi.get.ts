import { defineHandler, getRequestURL } from 'nitro/h3'

interface OpenAPISpec {
  components?: {
    schemas?: Record<string, unknown>
    securitySchemes?: Record<string, unknown>
  }
  [key: string]: unknown
}

let cachedSpec: OpenAPISpec | null = null

export default defineHandler(async (event) => {
  // if (cachedSpec) {
  //   return cachedSpec
  // }

  const auth = await useContainer().make('auth')

  const origin = getRequestURL(event).origin
  const [nitroRes, betterAuthSpec] = await Promise.all([
    fetch(`${origin}/_nitro/openapi.json`),
    await auth.api.generateOpenAPISchema?.()
      ?? Promise.resolve({} as OpenAPISpec),
  ])

  // console.log(event.context)

  return betterAuthSpec

  const nitroSpec = (await nitroRes.json()) as OpenAPISpec

  const merged: OpenAPISpec = {
    ...nitroSpec,
    components: {
      ...nitroSpec.components,
      ...betterAuthSpec.components,
      schemas: {
        ...betterAuthSpec.components?.schemas,
        ...nitroSpec.components?.schemas,
      },
      securitySchemes: {
        ...betterAuthSpec.components?.securitySchemes,
        ...nitroSpec.components?.securitySchemes,
      },
    },
  }

  cachedSpec = merged
  return merged
})
