import type { NuxtServerTemplate } from '@nuxt/schema'

import { useNuxt } from './context.ts'

/**
 * Adds a virtual file that can be used within the Nuxt Nitro server build.
 */
export function addTemplate(template: NuxtServerTemplate): NuxtServerTemplate {
  const nuxt = useNuxt()

  nuxt.options.nitro.virtual ||= {}
  nuxt.options.nitro.virtual[template.filename] = template.getContents

  return template
}
