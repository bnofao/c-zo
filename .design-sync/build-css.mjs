// Pre-compile the design system's Tailwind 4 stylesheet into a real CSS file
// for design-sync. @workspace/ui ships no compiled CSS — its components are
// styled entirely with Tailwind utility classes + the token custom-properties
// in src/styles/globals.css. The design-sync converter copies cfg.cssEntry
// verbatim, so the utility classes must already be resolved here; otherwise the
// preview cards (and every design the agent builds) render unstyled.
//
// Run this BEFORE the converter on every (re)sync:
//   node .design-sync/build-css.mjs
// It scans the component sources AND the authored previews for class names, so
// re-run it whenever a preview's classes change. Output: packages/ui/.ds-compiled.css
//
// Tailwind packages are resolved from packages/ui's own node_modules (where the
// pinned tailwindcss@4 lives), so this stays correct across version bumps.

import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO = resolve(import.meta.dirname, '..')
const PKG = resolve(REPO, 'packages/ui')

// @tailwindcss/node + oxide are transitive deps of @tailwindcss/postcss (a
// direct dep of @workspace/ui), so resolve them through the plugin's module
// context rather than the package's top level, where pnpm doesn't expose them.
const pkgRequire = createRequire(pathToFileURL(resolve(PKG, 'package.json')))
const postcssRequire = createRequire(pkgRequire.resolve('@tailwindcss/postcss'))
const { compile, optimize } = await import(pathToFileURL(postcssRequire.resolve('@tailwindcss/node')))
const { Scanner } = await import(pathToFileURL(postcssRequire.resolve('@tailwindcss/oxide')))

// globals.css is the Tailwind entry. tw-animate-css adds animation utilities the
// three foundation components don't use — drop it so we don't need that plugin
// resolvable at compile time.
const globals = readFileSync(resolve(PKG, 'src/styles/globals.css'), 'utf8')
const css = globals.replace(/^@import ['"]tw-animate-css['"];?\s*$/m, '')

// Harvest candidate class names from the component sources and the authored
// previews. Tailwind silently ignores candidates that don't map to a utility,
// so over-scanning is safe; under-scanning drops real styles.
const scanner = new Scanner({
  sources: [
    { base: resolve(PKG, 'src'), pattern: '**/*.{ts,tsx}', negated: false },
    { base: resolve(REPO, '.design-sync/previews'), pattern: '**/*.{ts,tsx}', negated: false },
  ],
})
const scanned = scanner.scan()

// Curated safelist. The Claude Design agent composes NEW layouts around these
// components and receives only styles.css's closure — so the brand-token
// utilities and common layout/spacing/type classes must ship even though no
// scanned source uses them yet. This is a deliberate, bounded superset (not the
// full Tailwind engine); a design needing a class outside it must add it here.
const SEMANTIC_TOKENS = [
  'background', 'foreground', 'card', 'card-foreground', 'primary', 'primary-foreground',
  'muted', 'muted-foreground', 'border', 'destructive', 'destructive-foreground',
]
const SPACE = ['0', '0.5', '1', '1.5', '2', '2.5', '3', '4', '5', '6', '8', '10', '12', '16']
const safelist = [
  // brand-token colors
  ...SEMANTIC_TOKENS.flatMap((t) => [`bg-${t}`, `text-${t}`, `border-${t}`]),
  // layout
  'flex', 'inline-flex', 'grid', 'block', 'inline-block', 'hidden',
  'flex-col', 'flex-row', 'flex-wrap', 'items-center', 'items-start', 'items-end',
  'justify-center', 'justify-between', 'justify-start', 'justify-end', 'justify-around',
  'grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4',
  // sizing
  'w-full', 'h-full', 'w-fit', 'h-fit', 'min-w-0', 'max-w-sm', 'max-w-md', 'max-w-lg', 'max-w-xl',
  // spacing scale: p/px/py/pt/pb, m/mx/my/mt/mb, gap/gap-x/gap-y
  ...SPACE.flatMap((n) => [
    `p-${n}`, `px-${n}`, `py-${n}`, `pt-${n}`, `pb-${n}`, `pl-${n}`, `pr-${n}`,
    `m-${n}`, `mx-${n}`, `my-${n}`, `mt-${n}`, `mb-${n}`,
    `gap-${n}`, `gap-x-${n}`, `gap-y-${n}`,
  ]),
  // radius / borders
  'rounded', 'rounded-sm', 'rounded-md', 'rounded-lg', 'rounded-xl', 'rounded-2xl', 'rounded-full',
  'border', 'border-0', 'border-2', 'border-t', 'border-b', 'border-l', 'border-r',
  // typography
  'text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl',
  'font-normal', 'font-medium', 'font-semibold', 'font-bold',
  'text-left', 'text-center', 'text-right', 'truncate', 'leading-tight', 'leading-normal',
  // effects / state
  'shadow-sm', 'shadow', 'shadow-md', 'opacity-50', 'opacity-60', 'opacity-70',
  'overflow-hidden', 'overflow-auto', 'cursor-pointer', 'transition-colors',
]
const candidates = [...new Set([...scanned, ...safelist])]

const compiler = await compile(css, { base: PKG, onDependency() {} })
const out = optimize(compiler.build(candidates)).code

const dest = resolve(PKG, '.ds-compiled.css')
writeFileSync(dest, out)
console.error(`✓ compiled ${candidates.length} candidates → ${dest} (${out.length} bytes)`)
