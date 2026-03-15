import type { AppResolvers } from './../../../__generated__/types.generated'

export const App: AppResolvers = {
  manifest: parent => (parent.manifest ?? null) as Record<string, unknown> | null,
}
