// import js from "@eslint/js"
// import eslintConfigPrettier from "eslint-config-prettier"
import onlyWarn from "eslint-plugin-only-warn"
import turboPlugin from "eslint-plugin-turbo"
// import tseslint from "typescript-eslint"
import antfu, { formatters} from "@antfu/eslint-config"

/**
 * A shared ESLint configuration for the repository.
 *
 **/
export const config = antfu(
  {
    pnpm: true,

    // Enable stylistic formatting rules
    stylistic: true,
  },
  {
    plugins: {
      turbo: turboPlugin,
    },
    rules: {
      "turbo/no-undeclared-env-vars": "warn",
    },
  },
  {
    plugins: {
      onlyWarn,
    },
  },
  {
    ignores: ["dist/**"],
  },
)
