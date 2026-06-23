import { config as reactInternalConfig } from '@workspace/eslint-config/react-internal'

/** @type {import("eslint").Linter.Config[]} */
export default reactInternalConfig.append(
  {
    ignores: ['src/routeTree.gen.ts', 'src/graphql/gen/**'],
  },
  {
    // `import.meta.env.DEV` / `.PROD` / `.MODE` are Vite built-ins, not
    // turbo-managed env vars — allowList them so the turbo rule doesn't warn.
    rules: {
      'turbo/no-undeclared-env-vars': ['warn', { allowList: ['DEV', 'PROD', 'MODE', 'BASE_URL', 'SSR'] }],
    },
  },
)
