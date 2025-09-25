// import js from "@eslint/js"
// import pluginNext from "@next/eslint-plugin-next"
// import eslintConfigPrettier from "eslint-config-prettier"
// import pluginReact from "eslint-plugin-react"
// import pluginReactHooks from "eslint-plugin-react-hooks"
// import globals from "globals"
// import tseslint from "typescript-eslint"

import { formatters } from "@antfu/eslint-config"
import nextPlugin from '@next/eslint-plugin-next'
// import { FlatCompat } from '@eslint/eslintrc'
import { config as baseConfig } from "./base.js"
import { nextjs, react } from "@antfu/eslint-config"



// const compat = new FlatCompat({
//   // import.meta.dirname is available after Node.js v20.11.0
//   baseDirectory: import.meta.dirname,
// })
console.log(nextPlugin)  

/**
 * A custom ESLint configuration for libraries that use Next.js.
 *
 * */
export const nextJsConfig = baseConfig.append(
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
  nextPlugin.flatConfig.recommended,
  nextPlugin.flatConfig.coreWebVitals,
  // nextjs(),
  // {
  //   plugins: {
  //     "@next/next": nextPlugin,
  //   },
  //   rules: {
  //     ...nextPlugin.configs.recommended.rules,
  //     ...nextPlugin.configs["core-web-vitals"].rules,
  //   },
  // },
).renamePlugins({
  "next": '@next/next',
})
