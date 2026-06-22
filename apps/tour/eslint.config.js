import { config as reactInternalConfig } from '@workspace/eslint-config/react-internal'

/** @type {import("eslint").Linter.Config[]} */
export default reactInternalConfig.append({
  ignores: ['src/routeTree.gen.ts', 'src/graphql/gen/**'],
})
