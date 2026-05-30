// import { addImportsSources, defineNitroModule } from '@czo/kit/nitro'

export type { BuildAppOptions, BuiltApp } from './app'
export { buildApp, runApp } from './app'
/* ─── Module contract (Effect-native, phase 2) ─────────────────────── */
export type { Module as CzoModule, Module } from './contract'
export { defineModule } from './contract'

/* ─── Legacy Nitro module (phase 3 will remove) ────────────────────── */

/**
 * Legacy Nitro module — injects auto-imports for ergonomics
 * (`useDatabase()`, `useLogger()`, etc.). No more plugin registration:
 * the kit no longer owns any boot lifecycle. App composition happens
 * in `apps/<app>/server.ts` via `composeApp(modules)`.
 *
 * Phase 3 will remove this file entirely.
 */
// export default defineNitroModule({
//   setup: (nitro) => {
//     addImportsSources({
//       from: '@czo/kit/db',
//       imports: ['useDatabase'],
//     }, nitro)
//     addImportsSources({
//       from: '@czo/kit/ioc',
//       imports: ['useContainer'],
//     }, nitro)
//     addImportsSources({
//       from: '@czo/kit',
//       imports: ['useLogger'],
//     }, nitro)
//     addImportsSources({
//       from: '@czo/kit/graphql',
//       imports: ['registeredTypeDefs', 'registeredResolvers', 'buildGraphQLContext', 'registerContextFactory', 'registerDirective', 'registeredDirectiveTypeDefs', 'applyDirectives'],
//     }, nitro)
//   },
// })
