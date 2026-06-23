# Tolgee i18n for `apps/tour` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Internationalize the `apps/tour` admin backoffice UI with Tolgee — every static label rendered through the Tolgee React SDK, EN/FR switchable, SSR-correct, with dev-only in-context editing; production serves frozen bundled JSON.

**Architecture:** A Tolgee instance is built per app boot (`createTolgee`) with eager-imported JSON as `staticData` (synchronous SSR resolution, no loading flash) and `DevTools` added only in dev. The active locale lives in a `czo_locale` cookie, read server-side in the root route loader so the first SSR render uses it; a switcher in the nav-user dropdown persists the choice. Business content stays owned by `@czo/translation` and is untouched.

**Tech Stack:** TanStack Start (SSR), React 19, `@tolgee/react` v7 (`ReactPlugin` + `FormatSimple` + `DevTools`), `@tolgee/cli` v2 (pull), Vitest (node env).

## Global Constraints

- **No commit during execution.** Per repo CLAUDE.md ("No-commit-until-review"), every task **stages** with `git add` only. A single commit happens at the very end after explicit user review. Never run `git commit` in a task.
- **Branch:** all work on `feat/tour-tolgee-i18n` (off `main`). Never work on `main`.
- **No `console.log`** in committed code.
- **Locale set:** available = `['en', 'fr-FR']` (exact Tolgee tags); default = `en`; fallback = `en`.
- **Keys:** dot-namespaced, English is the authored base value. Dynamic values (user name/email, product name/handle/createdAt) are NOT keys.
- **Production:** only `staticData` is active (no API key, no network). Dev adds `DevTools()` + `VITE_TOLGEE_API_URL`/`VITE_TOLGEE_API_KEY` for in-context editing; both are tree-shaken from prod by the `import.meta.env.DEV` guard.
- **SSR load shape:** `staticData` values are **eager** imported objects (`import en from './en.json'`), never lazy `() => import()`. This is what makes resolution synchronous.
- **Validation per code task:** `pnpm --filter @czo/tour lint --max-warnings 0`, `pnpm --filter @czo/tour test`, `pnpm --filter @czo/tour check-types`.
- **Account-preference locale is OUT of scope** — `locale.server.ts` is the seam where it will later be added.

---

## File Structure

**New (under `apps/tour/`):**
- `src/i18n/locales.ts` — pure isomorphic core: `LOCALES`, `DEFAULT_LOCALE`, `Locale`, `LOCALE_COOKIE`, `resolveLocale`, `readCookie`, `serializeLocaleCookie`. No server/Tolgee imports. The single tested unit for locale logic.
- `src/i18n/en.json`, `src/i18n/fr-FR.json` — frozen translations (flat dotted keys). Generated/maintained by `tolgee pull`; authored here for the first cut.
- `src/i18n/tolgee.ts` — `createTolgee(language)` factory.
- `src/i18n/tolgee.test.tsx` — SSR render test proving EN/FR static resolution.
- `src/i18n/locales.test.ts` — unit tests for the pure core.
- `src/i18n/locale.server.ts` — `getLocale()` / `setLocale()` server functions.
- `src/components/locale-switcher.tsx` — EN/FR control for the nav-user dropdown.
- `.tolgeerc.json` — `@tolgee/cli` config (format + pull path).

**Modified:**
- `pnpm-workspace.yaml` — add catalog entries for `@tolgee/react`, `@tolgee/cli`.
- `apps/tour/package.json` — deps + `i18n:pull` script.
- `apps/tour/.env.example` — document Tolgee env vars.
- `apps/tour/src/routes/__root.tsx` — root loader returns `{ locale }`; `TolgeeProvider` wraps `Outlet`; `<html lang>` from locale.
- `apps/tour/src/router.tsx` — `defaultNotFoundComponent` uses `t('common.notFound')`.
- `apps/tour/src/components/nav-user.tsx` — `t('nav.signOut')` + `<LocaleSwitcher/>`.
- `apps/tour/src/routes/login.tsx` — all strings → `t()`.
- `apps/tour/src/components/app-sidebar.tsx` — all strings → `t()`.
- `apps/tour/src/routes/_authed.tsx` — header label → `t()`.
- `apps/tour/src/routes/_authed/index.tsx` — dashboard strings → `t()`.
- `apps/tour/src/routes/_authed/products/index.tsx` — list strings → `t()`.
- `apps/tour/src/routes/_authed/products/$productId.tsx` — detail strings → `t()`.

---

## Task 1: Locale core + dependencies

**Files:**
- Modify: `pnpm-workspace.yaml` (catalog block)
- Modify: `apps/tour/package.json`
- Modify: `apps/tour/.env.example`
- Create: `apps/tour/src/i18n/locales.ts`
- Test: `apps/tour/src/i18n/locales.test.ts`

**Interfaces:**
- Produces:
  - `LOCALES: readonly ['en', 'fr-FR']`
  - `type Locale = 'en' | 'fr-FR'`
  - `DEFAULT_LOCALE: Locale` (= `'en'`)
  - `LOCALE_COOKIE: 'czo_locale'`
  - `resolveLocale(raw: string | undefined): Locale`
  - `readCookie(header: string | null | undefined, name: string): string | undefined`
  - `serializeLocaleCookie(tag: Locale): string`

- [ ] **Step 1: Add catalog entries**

In `pnpm-workspace.yaml`, inside the top-level `catalog:` block, add these two lines in alphabetical position (immediately after the `@tanstack/router-plugin: ^1.168.18` line, before `@types/jest`):

```yaml
  '@tolgee/cli': ^2.19.0
  '@tolgee/react': ^7.1.1
```

- [ ] **Step 2: Add deps + script to the app**

In `apps/tour/package.json`, add to `dependencies` (alphabetical, after `@tanstack/react-table`):

```json
    "@tolgee/react": "catalog:",
```

Add to `devDependencies` (alphabetical, after `@tanstack/router-plugin`):

```json
    "@tolgee/cli": "catalog:",
```

Add to `scripts` (after `"codegen"`):

```json
    "i18n:pull": "tolgee --api-url \"$TOLGEE_API_URL\" --api-key \"$TOLGEE_API_KEY\" pull",
```

- [ ] **Step 3: Document env vars**

Replace the contents of `apps/tour/.env.example` with:

```dotenv
# Tour admin app environment
# VITE_API_URL=http://localhost:4000

# Tolgee — DEV ONLY (in-context editing + live translations).
# Absent in production: the app then serves the bundled src/i18n/*.json.
# VITE_TOLGEE_API_URL=https://app.tolgee.io
# VITE_TOLGEE_API_KEY=tgpak_your_dev_key

# Tolgee CLI (used by `pnpm i18n:pull`) — not read by the app at runtime.
# TOLGEE_API_URL=https://app.tolgee.io
# TOLGEE_API_KEY=tgpak_your_cli_key
```

- [ ] **Step 4: Install**

Run: `pnpm install`
Expected: lockfile updates, `@tolgee/react` + `@tolgee/cli` resolved, no errors.

- [ ] **Step 5: Write the failing test**

Create `apps/tour/src/i18n/locales.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  readCookie,
  resolveLocale,
  serializeLocaleCookie,
} from './locales'

describe('resolveLocale', () => {
  it('returns the default (en) for undefined', () => {
    expect(resolveLocale(undefined)).toBe('en')
  })
  it('returns the default (en) for an unknown tag', () => {
    expect(resolveLocale('de')).toBe('en')
  })
  it('returns a supported tag verbatim', () => {
    expect(resolveLocale('fr-FR')).toBe('fr-FR')
    expect(resolveLocale('en')).toBe('en')
  })
  it('DEFAULT_LOCALE is en', () => {
    expect(DEFAULT_LOCALE).toBe('en')
  })
})

describe('readCookie', () => {
  it('extracts a named cookie from a header', () => {
    expect(readCookie('a=1; czo_locale=fr-FR; b=2', LOCALE_COOKIE)).toBe('fr-FR')
  })
  it('returns undefined when absent', () => {
    expect(readCookie('a=1; b=2', LOCALE_COOKIE)).toBeUndefined()
  })
  it('returns undefined for a missing header', () => {
    expect(readCookie(undefined, LOCALE_COOKIE)).toBeUndefined()
    expect(readCookie(null, LOCALE_COOKIE)).toBeUndefined()
  })
})

describe('serializeLocaleCookie', () => {
  it('serializes a year-long, root-path, lax cookie', () => {
    expect(serializeLocaleCookie('fr-FR')).toBe(
      'czo_locale=fr-FR; Path=/; Max-Age=31536000; SameSite=Lax',
    )
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @czo/tour test src/i18n/locales.test.ts`
Expected: FAIL — cannot resolve `./locales`.

- [ ] **Step 7: Implement `locales.ts`**

Create `apps/tour/src/i18n/locales.ts`:

```ts
/**
 * Pure, isomorphic locale core shared by the Tolgee factory (client bundle)
 * and the locale server functions. No server or Tolgee imports live here so
 * both sides can depend on it without pulling server-only code into the
 * client bundle.
 */
export const LOCALES = ['en', 'fr-FR'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'
export const LOCALE_COOKIE = 'czo_locale'

/** Coerce an arbitrary cookie/header value to a supported locale, else default. */
export function resolveLocale(raw: string | undefined): Locale {
  return LOCALES.includes(raw as Locale) ? (raw as Locale) : DEFAULT_LOCALE
}

/** Read one cookie value out of a raw `Cookie:` header string. */
export function readCookie(
  header: string | null | undefined,
  name: string,
): string | undefined {
  if (!header)
    return undefined
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name)
      return rest.join('=')
  }
  return undefined
}

/** Build the `Set-Cookie` value persisting the locale for a year. */
export function serializeLocaleCookie(tag: Locale): string {
  return `${LOCALE_COOKIE}=${tag}; Path=/; Max-Age=31536000; SameSite=Lax`
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @czo/tour test src/i18n/locales.test.ts`
Expected: PASS (10 assertions across 3 describes).

- [ ] **Step 9: Type-check + lint**

Run: `pnpm --filter @czo/tour check-types && pnpm --filter @czo/tour lint --max-warnings 0`
Expected: clean.

- [ ] **Step 10: Stage**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml apps/tour/package.json apps/tour/.env.example apps/tour/src/i18n/locales.ts apps/tour/src/i18n/locales.test.ts
```

---

## Task 2: Translations + Tolgee factory

**Files:**
- Create: `apps/tour/src/i18n/en.json`
- Create: `apps/tour/src/i18n/fr-FR.json`
- Create: `apps/tour/src/i18n/tolgee.ts`
- Create: `apps/tour/.tolgeerc.json`
- Test: `apps/tour/src/i18n/tolgee.test.tsx`

**Interfaces:**
- Consumes: `LOCALES` from `./locales` (Task 1).
- Produces: `createTolgee(language: string): TolgeeInstance` — a configured, ready-to-provide Tolgee instance whose `staticData` resolves `en` and `fr-FR` synchronously.

- [ ] **Step 1: Author `en.json`**

Create `apps/tour/src/i18n/en.json`:

```json
{
  "login.brandBadge": "Internal console",
  "login.brandTagline": "Run your operations from a single dashboard.",
  "login.copyright": "Czo © 2026 — All rights reserved",
  "login.title": "Welcome back",
  "login.subtitle": "Sign in to continue.",
  "login.identifierLabel": "Email or username",
  "login.identifierPlaceholder": "you@company.com or your.username",
  "login.passwordLabel": "Password",
  "login.showPassword": "Show password",
  "login.hidePassword": "Hide password",
  "login.remember": "Remember me",
  "login.forgot": "Forgot password?",
  "login.submit": "Sign in",
  "login.invalidCredentials": "Invalid credentials",
  "nav.platform": "Platform",
  "nav.dashboard": "Dashboard",
  "nav.catalog": "Catalog",
  "nav.products": "Products",
  "nav.categories": "Categories",
  "nav.collections": "Collections",
  "nav.attributes": "Attributes",
  "nav.users": "Users",
  "nav.taxonomyRequests": "Taxonomy requests",
  "nav.toggleCatalog": "Toggle catalog",
  "nav.appName": "Czo Admin",
  "nav.signOut": "Sign out",
  "nav.language": "Language",
  "dashboard.title": "Dashboard",
  "dashboard.subtitle": "Platform administration for life.",
  "dashboard.soon": "Soon",
  "dashboard.sections.products": "Global catalog products",
  "dashboard.sections.categories": "Taxonomy categories",
  "dashboard.sections.collections": "Curated collections",
  "dashboard.sections.attributes": "Product attributes",
  "dashboard.sections.users": "Platform accounts",
  "dashboard.sections.taxonomyRequests": "Pending moderation",
  "dashboard.recentProducts.title": "Recent products",
  "dashboard.recentProducts.description": "The latest products in the global catalog.",
  "dashboard.recentProducts.empty": "No products yet.",
  "products.title": "Products",
  "products.morePaginated": "More available (pagination wired in a follow-up).",
  "products.detail.notFound": "Product not found.",
  "products.detail.created": "Created",
  "common.col.name": "Name",
  "common.col.handle": "Handle",
  "common.notFound": "Page not found."
}
```

- [ ] **Step 2: Author `fr-FR.json`**

Create `apps/tour/src/i18n/fr-FR.json`:

```json
{
  "login.brandBadge": "Console interne",
  "login.brandTagline": "Pilotez vos opérations depuis un seul tableau de bord.",
  "login.copyright": "Czo © 2026 — Tous droits réservés",
  "login.title": "Bon retour",
  "login.subtitle": "Connectez-vous pour continuer.",
  "login.identifierLabel": "Email ou identifiant",
  "login.identifierPlaceholder": "vous@entreprise.com ou votre.identifiant",
  "login.passwordLabel": "Mot de passe",
  "login.showPassword": "Afficher le mot de passe",
  "login.hidePassword": "Masquer le mot de passe",
  "login.remember": "Se souvenir de moi",
  "login.forgot": "Mot de passe oublié ?",
  "login.submit": "Se connecter",
  "login.invalidCredentials": "Identifiants invalides",
  "nav.platform": "Plateforme",
  "nav.dashboard": "Tableau de bord",
  "nav.catalog": "Catalogue",
  "nav.products": "Produits",
  "nav.categories": "Catégories",
  "nav.collections": "Collections",
  "nav.attributes": "Attributs",
  "nav.users": "Utilisateurs",
  "nav.taxonomyRequests": "Demandes de taxonomie",
  "nav.toggleCatalog": "Afficher/masquer le catalogue",
  "nav.appName": "Czo Admin",
  "nav.signOut": "Se déconnecter",
  "nav.language": "Langue",
  "dashboard.title": "Tableau de bord",
  "dashboard.subtitle": "Administration de la plateforme life.",
  "dashboard.soon": "Bientôt",
  "dashboard.sections.products": "Produits du catalogue global",
  "dashboard.sections.categories": "Catégories de taxonomie",
  "dashboard.sections.collections": "Collections organisées",
  "dashboard.sections.attributes": "Attributs de produit",
  "dashboard.sections.users": "Comptes de la plateforme",
  "dashboard.sections.taxonomyRequests": "En attente de modération",
  "dashboard.recentProducts.title": "Produits récents",
  "dashboard.recentProducts.description": "Les derniers produits du catalogue global.",
  "dashboard.recentProducts.empty": "Aucun produit pour le moment.",
  "products.title": "Produits",
  "products.morePaginated": "Plus de résultats disponibles (pagination câblée prochainement).",
  "products.detail.notFound": "Produit introuvable.",
  "products.detail.created": "Créé le",
  "common.col.name": "Nom",
  "common.col.handle": "Identifiant",
  "common.notFound": "Page introuvable."
}
```

- [ ] **Step 3: Create the CLI config**

Create `apps/tour/.tolgeerc.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/tolgee/tolgee-cli/main/schema.json",
  "format": "JSON_TOLGEE",
  "pull": {
    "path": "src/i18n"
  }
}
```

- [ ] **Step 4: Write the failing test**

Create `apps/tour/src/i18n/tolgee.test.tsx`:

```tsx
import { T, TolgeeProvider } from '@tolgee/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createTolgee } from './tolgee'

// Eager staticData objects resolve synchronously, so a server render (no
// effects) emits the translated value directly — the SSR no-flash guarantee.
function render(language: string) {
  return renderToStaticMarkup(
    <TolgeeProvider tolgee={createTolgee(language)} options={{ useSuspense: false }}>
      <T keyName="nav.signOut" />
    </TolgeeProvider>,
  )
}

describe('createTolgee static data', () => {
  it('renders the English value when language is en', () => {
    expect(render('en')).toContain('Sign out')
  })
  it('renders the French value when language is fr-FR', () => {
    expect(render('fr-FR')).toContain('Se déconnecter')
  })
})
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm --filter @czo/tour test src/i18n/tolgee.test.tsx`
Expected: FAIL — cannot resolve `./tolgee`.

- [ ] **Step 6: Implement `tolgee.ts`**

Create `apps/tour/src/i18n/tolgee.ts`:

```ts
import { DevTools, FormatSimple, ReactPlugin, Tolgee } from '@tolgee/react'
import en from './en.json'
import frFR from './fr-FR.json'
import { LOCALES } from './locales'

/**
 * Build the app's Tolgee instance. `staticData` holds both languages as eager
 * imported objects so translations resolve synchronously during SSR (no
 * loading flash) and are bundled for production. In development we additionally
 * enable `DevTools` + the API key for Alt+click in-context editing; with no API
 * key in production both are tree-shaken out by the `import.meta.env.DEV` guard.
 */
export function createTolgee(language: string) {
  let tolgee = Tolgee().use(ReactPlugin()).use(FormatSimple())

  if (import.meta.env.DEV)
    tolgee = tolgee.use(DevTools())

  return tolgee.init({
    language,
    availableLanguages: [...LOCALES],
    defaultLanguage: 'en',
    fallbackLanguage: 'en',
    staticData: { 'en': en, 'fr-FR': frFR },
    apiUrl: import.meta.env.DEV ? import.meta.env.VITE_TOLGEE_API_URL : undefined,
    apiKey: import.meta.env.DEV ? import.meta.env.VITE_TOLGEE_API_KEY : undefined,
  })
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @czo/tour test src/i18n/tolgee.test.tsx`
Expected: PASS (2 assertions).

> **If both assertions render empty** (static data not synchronously in cache for your installed `@tolgee/react` version): report this as a finding before proceeding. The remedy is to switch the SSR strategy to suspense — keep `TolgeeProvider` default (`useSuspense: true`) and rely on TanStack Start streaming — and to assert via `renderToPipeableStream` instead. Do not silently leave the test red.

- [ ] **Step 8: Type-check + lint**

Run: `pnpm --filter @czo/tour check-types && pnpm --filter @czo/tour lint --max-warnings 0`
Expected: clean. (Importing `.json` is allowed by the existing tsconfig `resolveJsonModule`; if check-types complains, confirm `resolveJsonModule: true` — TanStack Start's base config sets it.)

- [ ] **Step 9: Stage**

```bash
git add apps/tour/src/i18n/en.json apps/tour/src/i18n/fr-FR.json apps/tour/src/i18n/tolgee.ts apps/tour/src/i18n/tolgee.test.tsx apps/tour/.tolgeerc.json
```

---

## Task 3: Locale server functions + SSR provider wiring

**Files:**
- Create: `apps/tour/src/i18n/locale.server.ts`
- Modify: `apps/tour/src/routes/__root.tsx`

**Interfaces:**
- Consumes: `resolveLocale`, `readCookie`, `serializeLocaleCookie`, `LOCALE_COOKIE`, `Locale` from `./locales`; `createTolgee` from `./tolgee`.
- Produces:
  - `getLocale(): Promise<Locale>` — server fn, reads the cookie.
  - `setLocale(opts: { data: { locale: string } }): Promise<{ locale: Locale }>` — server fn, writes the cookie.

- [ ] **Step 1: Implement `locale.server.ts`**

Create `apps/tour/src/i18n/locale.server.ts`:

```ts
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader, setResponseHeader } from '@tanstack/react-start/server'
import type { Locale } from './locales'
import { LOCALE_COOKIE, readCookie, resolveLocale, serializeLocaleCookie } from './locales'

/**
 * Resolve the active UI locale from the request's `czo_locale` cookie.
 * Defaults to `en` when absent or unrecognized. This is the single seam where
 * an authenticated account's locale preference can later take precedence.
 */
export const getLocale = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Locale> => resolveLocale(readCookie(getRequestHeader('cookie'), LOCALE_COOKIE)),
)

/** Persist the chosen UI locale in the `czo_locale` cookie. */
export const setLocale = createServerFn({ method: 'POST' })
  .validator((data: { locale: string }) => data)
  .handler(async ({ data }): Promise<{ locale: Locale }> => {
    const tag = resolveLocale(data.locale)
    setResponseHeader('set-cookie', serializeLocaleCookie(tag))
    return { locale: tag }
  })
```

- [ ] **Step 2: Wire the provider into the root route**

Replace the entire contents of `apps/tour/src/routes/__root.tsx` with:

```tsx
import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import { TolgeeProvider } from '@tolgee/react'
import * as React from 'react'
import { getLocale } from '../i18n/locale.server'
import { createTolgee } from '../i18n/tolgee'
import styles from '../styles.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // Read the locale server-side so the very first SSR render uses it. On client
  // navigations this is served from the dehydrated loader data; the switcher
  // calls `router.invalidate()` to re-run it after changing the cookie.
  loader: async () => ({ locale: await getLocale() }),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'tour — admin' },
    ],
    links: [{ rel: 'stylesheet', href: styles }],
  }),
  component: RootDocument,
})

function RootDocument() {
  const { locale } = Route.useLoaderData()
  // Build the instance once per router (per request on the server, once on the
  // client). The initial language matches the SSR-resolved locale, so server
  // and client hydrate identically.
  const [tolgee] = React.useState(() => createTolgee(locale))

  return (
    // suppressHydrationWarning: browser extensions (Dark Reader, Grammarly, …)
    // mutate <html> before React hydrates. Scoped to this element only.
    <html lang={locale} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <TolgeeProvider tolgee={tolgee} options={{ useSuspense: false }}>
          <Outlet />
        </TolgeeProvider>
        <Scripts />
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Verify existing tests still pass**

Run: `pnpm --filter @czo/tour test`
Expected: PASS — all existing suites (auth, products, locales, tolgee) green. No behavior change to data flow.

- [ ] **Step 4: Type-check + lint**

Run: `pnpm --filter @czo/tour check-types && pnpm --filter @czo/tour lint --max-warnings 0`
Expected: clean.

- [ ] **Step 5: Manual SSR check**

Run `pnpm --filter @czo/tour dev`, open `http://localhost:3000/login` in a fresh/incognito window (no `czo_locale` cookie).
Expected: the page renders in **English** (default), `view-source` shows `<html lang="en">` with the English login copy already present in the server HTML (no flash, no empty text).

- [ ] **Step 6: Stage**

```bash
git add apps/tour/src/i18n/locale.server.ts apps/tour/src/routes/__root.tsx
```

---

## Task 4: Locale switcher + nav-user

**Files:**
- Create: `apps/tour/src/components/locale-switcher.tsx`
- Modify: `apps/tour/src/components/nav-user.tsx`

**Interfaces:**
- Consumes: `useTolgee`, `useTranslate` from `@tolgee/react`; `setLocale` from `../i18n/locale.server`; `LOCALES`, `Locale` from `../i18n/locales`; `useRouter` from `@tanstack/react-router`.
- Produces: `<LocaleSwitcher />` — a self-contained control; no props.

- [ ] **Step 1: Implement the switcher**

Create `apps/tour/src/components/locale-switcher.tsx`:

```tsx
import { useTolgee, useTranslate } from '@tolgee/react'
import { useRouter } from '@tanstack/react-router'
import { DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@workspace/ui/components/dropdown-menu'
import { Languages } from 'lucide-react'
import { setLocale } from '../i18n/locale.server'
import { LOCALES } from '../i18n/locales'

const LABELS: Record<(typeof LOCALES)[number], string> = {
  'en': 'English',
  'fr-FR': 'Français',
}

export function LocaleSwitcher() {
  const tolgee = useTolgee(['language'])
  const { t } = useTranslate()
  const router = useRouter()
  const current = tolgee.getLanguage() ?? 'en'

  async function onChange(next: string) {
    if (next === current)
      return
    await tolgee.changeLanguage(next) // instant in-app switch
    await setLocale({ data: { locale: next } }) // persist cookie
    await router.invalidate() // re-run root loader → <html lang> + SSR state
  }

  return (
    <>
      <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
        <Languages className="size-3.5" />
        {t('nav.language')}
      </div>
      <DropdownMenuRadioGroup value={current} onValueChange={onChange}>
        {LOCALES.map(tag => (
          <DropdownMenuRadioItem key={tag} value={tag}>
            {LABELS[tag]}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  )
}
```

> Confirm `DropdownMenuRadioGroup` and `DropdownMenuRadioItem` are exported by `packages/ui/src/components/dropdown-menu.tsx`. If the Base UI build does not export radio items, fall back to plain `DropdownMenuItem` rows that call `onChange(tag)` and render a `Check` icon (`lucide-react`) when `tag === current`. Keep the `nav.language` header row either way.

- [ ] **Step 2: Wire it into nav-user + translate Sign out**

In `apps/tour/src/components/nav-user.tsx`:

1. Add imports near the top (after the existing `lucide-react` import):

```tsx
import { useTranslate } from '@tolgee/react'
import { LocaleSwitcher } from './locale-switcher'
```

2. Inside `NavUser`, after `const router = useRouter()`, add:

```tsx
  const { t } = useTranslate()
```

3. Replace the final `DropdownMenuGroup` (the Sign out group) with a language group + the Sign out group:

```tsx
            <DropdownMenuGroup>
              <LocaleSwitcher />
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem disabled={signingOut} onClick={onSignOut}>
                <LogOut />
                {t('nav.signOut')}
              </DropdownMenuItem>
            </DropdownMenuGroup>
```

- [ ] **Step 3: Type-check + lint**

Run: `pnpm --filter @czo/tour check-types && pnpm --filter @czo/tour lint --max-warnings 0`
Expected: clean.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @czo/tour test`
Expected: PASS — existing suites unaffected.

- [ ] **Step 5: Manual switch check**

`pnpm --filter @czo/tour dev`, sign in, open the nav-user dropdown (bottom of sidebar). Pick **Français**.
Expected: the dropdown's "Language"/"Langue" label and "Sign out"/"Se déconnecter" flip to French immediately; reload the page → still French (cookie persisted), `<html lang="fr-FR">` in view-source. Switch back to English → reverts and persists.

- [ ] **Step 6: Stage**

```bash
git add apps/tour/src/components/locale-switcher.tsx apps/tour/src/components/nav-user.tsx
```

---

## Task 5: Convert login

**Files:**
- Modify: `apps/tour/src/routes/login.tsx`

**Interfaces:**
- Consumes: `useTranslate` from `@tolgee/react`; keys `login.*` (Task 2).

- [ ] **Step 1: Convert all strings**

In `apps/tour/src/routes/login.tsx`:

1. Add import (after the `lucide-react` import):

```tsx
import { useTranslate } from '@tolgee/react'
```

2. Inside `LoginPage`, add as the first hook line (before `const [show, ...]`):

```tsx
  const { t } = useTranslate()
```

3. Replace the two hardcoded error strings: both `setError('Identifiants invalides')` occurrences become:

```tsx
        setError(t('login.invalidCredentials'))
```

(There are two — the `else` branch and the `catch` branch. Both use the same key.)

4. Replace the brand-panel and form JSX text nodes with `t()` calls, exactly:

| Current literal | Replacement |
|---|---|
| `Console interne` (Badge) | `{t('login.brandBadge')}` |
| `Pilotez vos opérations depuis un seul tableau de bord.` | `{t('login.brandTagline')}` |
| `Czo © 2026 — Tous droits réservés` | `{t('login.copyright')}` |
| `Bon retour` (h1) | `{t('login.title')}` |
| `Connectez-vous pour continuer.` | `{t('login.subtitle')}` |
| `Email ou identifiant` (label) | `{t('login.identifierLabel')}` |
| `placeholder="vous@entreprise.com ou votre.identifiant"` | `placeholder={t('login.identifierPlaceholder')}` |
| `Mot de passe` (label) | `{t('login.passwordLabel')}` |
| `aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}` | `aria-label={t(show ? 'login.hidePassword' : 'login.showPassword')}` |
| `Se souvenir de moi` | `{t('login.remember')}` |
| `Mot de passe oublié&nbsp;?` | `{t('login.forgot')}` |
| `Se connecter` (Button) | `{t('login.submit')}` |

Leave unchanged: the `LogoMark` brand text (`Czo`/`Admin`) and the decorative password placeholder `"••••••••••"`.

- [ ] **Step 2: Type-check + lint**

Run: `pnpm --filter @czo/tour check-types && pnpm --filter @czo/tour lint --max-warnings 0`
Expected: clean.

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @czo/tour test`
Expected: PASS.

- [ ] **Step 4: Manual check**

Dev server, `/login` in English (default) shows the English copy; switching the app to French (after login, then sign out — or temporarily set the `czo_locale=fr-FR` cookie) shows the French copy.

- [ ] **Step 5: Stage**

```bash
git add apps/tour/src/routes/login.tsx
```

---

## Task 6: Convert sidebar + authed header

**Files:**
- Modify: `apps/tour/src/components/app-sidebar.tsx`
- Modify: `apps/tour/src/routes/_authed.tsx`

**Interfaces:**
- Consumes: `useTranslate` from `@tolgee/react`; keys `nav.*` (Task 2).

- [ ] **Step 1: Convert the sidebar**

In `apps/tour/src/components/app-sidebar.tsx`:

1. Replace the `catalogSoon` constant with key tuples:

```tsx
// Catalog sub-areas without routes yet render as muted placeholders.
const catalogSoon = ['nav.categories', 'nav.collections', 'nav.attributes'] as const
```

2. Add import (after the `lucide-react` import):

```tsx
import { useTranslate } from '@tolgee/react'
```

3. Inside `AppSidebar`, add after the `pathname`/`inCatalog` lines:

```tsx
  const { t } = useTranslate()
```

4. Apply these text replacements:

| Current | Replacement |
|---|---|
| `<SidebarGroupLabel>Platform</SidebarGroupLabel>` | `<SidebarGroupLabel>{t('nav.platform')}</SidebarGroupLabel>` |
| `tooltip="Dashboard"` | `tooltip={t('nav.dashboard')}` |
| `<span>Dashboard</span>` | `<span>{t('nav.dashboard')}</span>` |
| `tooltip="Catalog"` | `tooltip={t('nav.catalog')}` |
| `<span>Catalog</span>` | `<span>{t('nav.catalog')}</span>` |
| `<span className="sr-only">Toggle catalog</span>` | `<span className="sr-only">{t('nav.toggleCatalog')}</span>` |
| `<span>Products</span>` (sub-button) | `<span>{t('nav.products')}</span>` |

5. Replace the `catalogSoon.map` block so it translates each key:

```tsx
                  {catalogSoon.map(key => (
                    <SidebarMenuSubItem key={key}>
                      <SidebarMenuSubButton render={<a href="#" onClick={e => e.preventDefault()} />}>
                        <span className="text-muted-foreground">{t(key)}</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
```

Leave unchanged: the sidebar header brand text (`Czo` / `Admin`).

- [ ] **Step 2: Convert the authed header**

In `apps/tour/src/routes/_authed.tsx`:

1. Add import (after the existing component imports):

```tsx
import { useTranslate } from '@tolgee/react'
```

2. Inside `AuthedLayout`, add after `const { me } = Route.useRouteContext()`:

```tsx
  const { t } = useTranslate()
```

3. Replace `<span className="text-sm font-medium">Czo Admin</span>` with:

```tsx
          <span className="text-sm font-medium">{t('nav.appName')}</span>
```

- [ ] **Step 3: Type-check + lint**

Run: `pnpm --filter @czo/tour check-types && pnpm --filter @czo/tour lint --max-warnings 0`
Expected: clean.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @czo/tour test`
Expected: PASS.

- [ ] **Step 5: Manual check**

Dev server, signed in: sidebar labels and header read English by default; switching to French translates Platform→Plateforme, Dashboard→Tableau de bord, Catalog→Catalogue, Products→Produits, and the Soon sub-items.

- [ ] **Step 6: Stage**

```bash
git add apps/tour/src/components/app-sidebar.tsx apps/tour/src/routes/_authed.tsx
```

---

## Task 7: Convert dashboard

**Files:**
- Modify: `apps/tour/src/routes/_authed/index.tsx`

**Interfaces:**
- Consumes: `useTranslate` from `@tolgee/react`; keys `dashboard.*`, `nav.*`, `common.col.*` (Task 2).

- [ ] **Step 1: Restructure the sections + convert strings**

In `apps/tour/src/routes/_authed/index.tsx`:

1. Add import (after the `lucide-react` import):

```tsx
import { useTranslate } from '@tolgee/react'
```

2. Replace the `Section` interface and `sections` constant with key-based fields:

```tsx
interface Section {
  labelKey: string
  descKey: string
  icon: LucideIcon
  to?: '/products'
}

const sections: Section[] = [
  { labelKey: 'nav.products', descKey: 'dashboard.sections.products', icon: Package, to: '/products' },
  { labelKey: 'nav.categories', descKey: 'dashboard.sections.categories', icon: FolderTree },
  { labelKey: 'nav.collections', descKey: 'dashboard.sections.collections', icon: Layers },
  { labelKey: 'nav.attributes', descKey: 'dashboard.sections.attributes', icon: SlidersHorizontal },
  { labelKey: 'nav.users', descKey: 'dashboard.sections.users', icon: Users },
  { labelKey: 'nav.taxonomyRequests', descKey: 'dashboard.sections.taxonomyRequests', icon: Inbox },
]
```

3. In `DashboardPage`, add after `const { data } = useSuspenseQuery(recentProductsQuery)`:

```tsx
  const { t } = useTranslate()
```

4. Apply replacements in `DashboardPage`:

| Current | Replacement |
|---|---|
| `Dashboard` (h1) | `{t('dashboard.title')}` |
| `Platform administration for life.` | `{t('dashboard.subtitle')}` |
| `<CardTitle>Recent products</CardTitle>` | `<CardTitle>{t('dashboard.recentProducts.title')}</CardTitle>` |
| `<CardDescription>The latest products in the global catalog.</CardDescription>` | `<CardDescription>{t('dashboard.recentProducts.description')}</CardDescription>` |
| `No products yet.` | `{t('dashboard.recentProducts.empty')}` |
| `<TableHead>Name</TableHead>` | `<TableHead>{t('common.col.name')}</TableHead>` |
| `<TableHead>Handle</TableHead>` | `<TableHead>{t('common.col.handle')}</TableHead>` |

5. Change the section map to pass `t` down, and update `SectionCard`:

Map line becomes:

```tsx
        {sections.map(section => <SectionCard key={section.labelKey} section={section} t={t} />)}
```

`SectionCard` signature + body become:

```tsx
function SectionCard({ section, t }: { section: Section, t: (key: string) => string }) {
  const { labelKey, descKey, icon: Icon, to } = section
  const card = (
    <Card className={to ? 'transition-colors hover:bg-accent' : 'opacity-60'}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Icon className="size-4" />
          </span>
          <div className="flex flex-col gap-0.5">
            <CardTitle className="text-base">{t(labelKey)}</CardTitle>
            <CardDescription>{t(descKey)}</CardDescription>
          </div>
          {to ? null : <Badge variant="secondary" className="ml-auto">{t('dashboard.soon')}</Badge>}
        </div>
      </CardHeader>
    </Card>
  )
  return to ? <Link to={to}>{card}</Link> : card
}
```

- [ ] **Step 2: Type-check + lint**

Run: `pnpm --filter @czo/tour check-types && pnpm --filter @czo/tour lint --max-warnings 0`
Expected: clean.

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @czo/tour test`
Expected: PASS.

- [ ] **Step 4: Manual check**

Dashboard cards, titles, and table headers translate on switch; the "Soon" badges become "Bientôt".

- [ ] **Step 5: Stage**

```bash
git add apps/tour/src/routes/_authed/index.tsx
```

---

## Task 8: Convert products list, detail, and not-found

**Files:**
- Modify: `apps/tour/src/routes/_authed/products/index.tsx`
- Modify: `apps/tour/src/routes/_authed/products/$productId.tsx`
- Modify: `apps/tour/src/router.tsx`

**Interfaces:**
- Consumes: `useTranslate` from `@tolgee/react`; keys `products.*`, `common.*` (Task 2).

- [ ] **Step 1: Convert the products list**

In `apps/tour/src/routes/_authed/products/index.tsx`:

1. Add import (after the `@tanstack/react-router` import):

```tsx
import { useTranslate } from '@tolgee/react'
```

2. In `ProductsPage`, add after `const { data } = useSuspenseQuery(productsQuery(null))`:

```tsx
  const { t } = useTranslate()
```

3. Replacements:

| Current | Replacement |
|---|---|
| `<h1 className="mb-4 text-lg font-semibold">Products</h1>` | `<h1 className="mb-4 text-lg font-semibold">{t('products.title')}</h1>` |
| `<th className="py-1">Name</th>` | `<th className="py-1">{t('common.col.name')}</th>` |
| `<th>Handle</th>` | `<th>{t('common.col.handle')}</th>` |
| `More available (pagination wired in a follow-up).` | `{t('products.morePaginated')}` |

- [ ] **Step 2: Convert the product detail**

In `apps/tour/src/routes/_authed/products/$productId.tsx`:

1. Add import (after the `@tanstack/react-router` import):

```tsx
import { useTranslate } from '@tolgee/react'
```

2. In `ProductDetailPage`, add after `const { productId } = Route.useParams()`:

```tsx
  const { t } = useTranslate()
```

3. Replacements:

| Current | Replacement |
|---|---|
| `<Card>Product not found.</Card>` | `<Card>{t('products.detail.notFound')}</Card>` |
| `<dt className="text-muted-foreground">Handle</dt>` | `<dt className="text-muted-foreground">{t('common.col.handle')}</dt>` |
| `<dt className="text-muted-foreground">Created</dt>` | `<dt className="text-muted-foreground">{t('products.detail.created')}</dt>` |

Leave unchanged: `{data.name}`, `{data.handle}`, `{data.createdAt}` (dynamic data).

- [ ] **Step 3: Translate the not-found fallback**

In `apps/tour/src/router.tsx`:

1. Add imports at the top (after the existing imports):

```tsx
import { useTranslate } from '@tolgee/react'
```

2. Replace the inline `defaultNotFoundComponent` arrow with a component reference:

```tsx
    defaultNotFoundComponent: NotFound,
```

3. Add the `NotFound` component below `createAppRouter` (it renders inside `TolgeeProvider`, so the hook works):

```tsx
function NotFound() {
  const { t } = useTranslate()
  return <div className="p-6 text-sm text-muted-foreground">{t('common.notFound')}</div>
}
```

- [ ] **Step 4: Type-check + lint**

Run: `pnpm --filter @czo/tour check-types && pnpm --filter @czo/tour lint --max-warnings 0`
Expected: clean.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @czo/tour test`
Expected: PASS.

- [ ] **Step 6: Manual check**

Products list headers + pagination note translate; a bad product id shows the translated "Product not found."; an unknown route shows the translated "Page not found." Switching language updates all three.

- [ ] **Step 7: Stage**

```bash
git add apps/tour/src/routes/_authed/products/index.tsx apps/tour/src/routes/_authed/products/$productId.tsx apps/tour/src/router.tsx
```

---

## Task 9: Seed the Tolgee project (controller-run, via MCP)

> **This task is executed by the controller, not a fresh implementer subagent** — it uses the connected Tolgee MCP tools (PAK-scoped, project auto-resolved). It does not touch the repo, has no test cycle, and is not on the build's critical path: the committed `src/i18n/*.json` are the source of truth for builds and tests. Its purpose is to make the live Tolgee project (and therefore dev in-context editing) match the committed JSON.

- [ ] **Step 1: List existing keys**

Use `mcp__tolgee__list_keys` to see what already exists in the project (avoid duplicates).

- [ ] **Step 2: Create keys with English base values**

Use `mcp__tolgee__create_keys` to create every key in `apps/tour/src/i18n/en.json` (default namespace) with its English value as the `en` translation. Skip any key Step 1 shows already present.

- [ ] **Step 3: Add the French translations**

For each key, set the `fr-FR` translation to the value in `apps/tour/src/i18n/fr-FR.json` (use `mcp__tolgee__set_translation`, or `mcp__tolgee__machine_translate` then correct against the committed FR values — the committed FR is authoritative).

- [ ] **Step 4: Verify parity**

Use `mcp__tolgee__list_keys` (and `mcp__tolgee__get_translations`) to confirm all keys exist with both `en` and `fr-FR` populated, matching the committed JSON.

- [ ] **Step 5: (Optional, when CLI creds available) round-trip check**

With `TOLGEE_API_URL` + `TOLGEE_API_KEY` exported, run `pnpm --filter @czo/tour i18n:pull` and confirm it regenerates `src/i18n/en.json` + `src/i18n/fr-FR.json` with no meaningful diff (key order may differ). This validates `.tolgeerc.json`. Do not commit a reordered-only diff.

---

## Final: Whole-branch review + single commit

After all tasks are staged and green:

- [ ] Run the full validation once more: `pnpm --filter @czo/tour lint --max-warnings 0 && pnpm --filter @czo/tour test && pnpm --filter @czo/tour check-types`.
- [ ] Dispatch the final whole-branch code review.
- [ ] Present the staged diff to the user for review. **Only after explicit approval**, create the single commit on `feat/tour-tolgee-i18n` (no AI-attribution trailer, per repo git-workflow rule).

---

## Self-Review notes

- **Spec coverage:** SSR static-import provider (Tasks 2–3); cookie + switcher, account-later seam (Tasks 1,3,4); nav-user placement (Task 4); EN default / EN base / FR translations (Tasks 2,9); dev-only in-context via DevTools+API key (Task 2); CLI pull config + script (Tasks 1–2); full string conversion across every listed file (Tasks 5–8); tests for `resolveLocale`/cookie helpers + representative render (Tasks 1–2); `common.notFound` (Task 8). All spec sections map to a task.
- **Out-of-scope respected:** no account-pref work, no login switcher, no `@czo/translation` changes, no ICU.
- **Key consistency:** every `t('…')` call in Tasks 4–8 uses a key defined in the Task 2 JSON (`nav.*`, `login.*`, `dashboard.*`, `products.*`, `common.*`). `common.col.name`/`common.col.handle` are shared by dashboard + products lists; `nav.products` labels both the sidebar item and the dashboard Products card.
- **Risk flagged inline:** Task 2 Step 7 carries the fallback if eager static data does not resolve synchronously under the installed `@tolgee/react` version.
