// import js from "@eslint/js"
// import eslintConfigPrettier from "eslint-config-prettier"
// import pluginReact from "eslint-plugin-react"
// import pluginReactHooks from "eslint-plugin-react-hooks"
// import globals from "globals"
// import tseslint from "typescript-eslint"

import { config as baseConfig } from "./base.js"
import { formatters, react } from "@antfu/eslint-config"

/**
 * A custom ESLint configuration for libraries that use React.
 *
 **/
export const config = baseConfig.append(
  formatters({
    /**
     * Format CSS, LESS, SCSS files, also the `<style>` blocks in Vue
     * By default uses Prettier
     */
    css: true,
    /**
     * Format HTML files
     * By default uses Prettier
     */
    html: true,
    /**
     * Format Markdown files
     * Supports Prettier and dprint
     * By default uses Prettier
     */
    markdown: 'prettier'
  }),
  react(),
)
