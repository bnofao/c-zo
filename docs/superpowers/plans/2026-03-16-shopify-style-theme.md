# Shopify-Style Documentation Theme Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle c-zo Docusaurus docs with Shopify/Stripe-inspired API reference layout, typography, navigation, and code blocks.

**Architecture:** CSS custom properties + targeted selectors for typography, badges, breadcrumbs, TOC, and code blocks. Swizzle `DocItem/Layout` for the split-sticky API reference layout. All changes in `apps/docs/`.

**Tech Stack:** Docusaurus 3.9.x, CSS, React (swizzled component), Prism dracula theme

**Spec:** `docs/superpowers/specs/2026-03-16-shopify-style-docs-design.md`

---

## File Structure

```
apps/docs/
├── src/
│   ├── css/
│   │   └── custom.css              ← Modify: typography, badges, breadcrumbs, TOC, code blocks
│   └── theme/
│       └── DocItem/
│           └── Layout/
│               └── index.tsx        ← Create: swizzled layout for API split view
├── docusaurus.config.ts             ← Modify: add Prism dracula theme
```

---

## Chunk 1: Typography, Badges, and Code Blocks

### Task 1: Typography refinements and inline code styling

**Files:**
- Modify: `apps/docs/src/css/custom.css`

- [ ] **Step 1: Update heading sizes and inline code styling**

In `apps/docs/src/css/custom.css`, update the `.markdown` heading rules and add inline code styling:

```css
/* Replace existing .markdown h1 rule */
.markdown h1 {
  font-size: 2.25rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  margin-bottom: 1.5rem;
}

/* Replace existing .markdown h2 rule */
.markdown h2 {
  font-size: 1.6rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  margin-top: 2.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--ifm-toc-border-color);
}

/* Replace existing .markdown h3 rule */
.markdown h3 {
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin-top: 2rem;
}

/* Update line height */
.markdown p {
  margin-bottom: 1.25rem;
  line-height: 1.8;
}

/* Shopify-style inline code — green tint */
code:not(pre code) {
  background: #f0fdf4;
  color: #166534;
  border: 1px solid #dcfce7;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 0.85em;
}

[data-theme='dark'] code:not(pre code) {
  background: rgba(34, 197, 94, 0.1);
  color: #86efac;
  border-color: rgba(34, 197, 94, 0.2);
}
```

- [ ] **Step 2: Add badge CSS classes**

Append to `apps/docs/src/css/custom.css`:

```css
/* ─── Badges (Shopify-style) ─────────────────────────────────────── */

.badge--required {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 8px;
  border-radius: 4px;
  background: #fef2f2;
  color: #dc2626;
  vertical-align: middle;
  margin-left: 6px;
}

.badge--optional {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 8px;
  border-radius: 4px;
  background: #f0fdf4;
  color: #166534;
  vertical-align: middle;
  margin-left: 6px;
}

.badge--deprecated {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 8px;
  border-radius: 4px;
  background: #fefce8;
  color: #a16207;
  vertical-align: middle;
  margin-left: 6px;
}

.badge--mutation {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 8px;
  border-radius: 4px;
  background: #dcfce7;
  color: #166534;
}

.badge--query {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 8px;
  border-radius: 4px;
  background: #dbeafe;
  color: #1e40af;
}

[data-theme='dark'] .badge--required {
  background: rgba(220, 38, 38, 0.15);
}

[data-theme='dark'] .badge--optional {
  background: rgba(34, 197, 94, 0.15);
}

[data-theme='dark'] .badge--deprecated {
  background: rgba(161, 98, 7, 0.15);
}

[data-theme='dark'] .badge--mutation {
  background: rgba(34, 197, 94, 0.15);
}

[data-theme='dark'] .badge--query {
  background: rgba(37, 99, 235, 0.15);
}
```

- [ ] **Step 3: Verify build**

```bash
pnpm --filter @czo/docs build 2>&1 | tail -3
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/docs/src/css/custom.css
git commit -m "docs: add Shopify-style typography, inline code, and badge classes"
```

---

### Task 2: Dark code blocks with always-visible copy button

**Files:**
- Modify: `apps/docs/src/css/custom.css`
- Modify: `apps/docs/docusaurus.config.ts`

- [ ] **Step 1: Set Prism dracula theme in docusaurus.config.ts**

Read `apps/docs/docusaurus.config.ts`. In the `themeConfig.prism` section, add `theme` and `darkTheme` using the dracula preset from `prism-react-renderer`. The exact import syntax depends on the module system — check if the config uses ESM imports (likely yes, since it's `.ts`). Use:

```typescript
import { themes as prismThemes } from 'prism-react-renderer'
```

at the top of the file, then in `prism`:

```typescript
prism: {
  theme: prismThemes.dracula,
  darkTheme: prismThemes.dracula,
  additionalLanguages: ['bash', 'graphql', 'json', 'typescript'],
},
```

- [ ] **Step 2: Add dark code block CSS overrides**

In `apps/docs/src/css/custom.css`, replace the existing code block rules with:

```css
/* ─── Code Blocks (always dark, Shopify-style) ───────────────────── */

div[class^='codeBlockContainer'],
div[class*='codeBlockContainer'] {
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  border: 1px solid rgba(0, 0, 0, 0.06);
}

[data-theme='dark'] div[class^='codeBlockContainer'],
[data-theme='dark'] div[class*='codeBlockContainer'] {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  border-color: rgba(255, 255, 255, 0.06);
}

/* Force dark background on all code blocks */
pre[class*='prism'] {
  background: #0f172a !important;
}

.prism-code {
  font-size: 0.85rem;
  line-height: 1.7;
  background: #0f172a !important;
}

/* Code block title bar */
div[class^='codeBlockTitle'],
div[class*='codeBlockTitle'] {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  background: #1e293b;
  color: #94a3b8;
  border-bottom: 1px solid #334155;
  padding: 0.5rem 1rem;
}

/* Always-visible copy button */
button[class*='copyButton'] {
  opacity: 1 !important;
  background: #1e293b;
  border: 1px solid #334155;
  color: #94a3b8;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 0.7rem;
}

button[class*='copyButton']:hover {
  background: #334155;
  color: #e2e8f0;
}
```

- [ ] **Step 3: Remove old conflicting code block rules from custom.css**

Remove these old rules that are now replaced:
- The old `.prism-code` rule
- The old `code` rule (replaced by `code:not(pre code)` from Task 1)
- The old `div[class^='codeBlockContainer']` rules
- The old `div[class^='codeBlockTitle']` rules

- [ ] **Step 4: Verify build**

```bash
pnpm --filter @czo/docs build 2>&1 | tail -3
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/docs/src/css/custom.css apps/docs/docusaurus.config.ts
git commit -m "docs: add dark code blocks with dracula theme and always-visible copy button"
```

---

## Chunk 2: Navigation and API Split Layout

### Task 3: Breadcrumbs and sticky TOC styling

**Files:**
- Modify: `apps/docs/src/css/custom.css`

- [ ] **Step 1: Add breadcrumb styling**

Append to `apps/docs/src/css/custom.css`:

```css
/* ─── Breadcrumbs (Shopify-style) ────────────────────────────────── */

.breadcrumbs {
  font-size: 0.85rem;
  margin-bottom: 1rem;
}

.breadcrumbs__link {
  color: var(--ifm-color-emphasis-600);
  transition: color 0.15s ease;
}

.breadcrumbs__link:hover {
  color: var(--ifm-color-primary);
  text-decoration: none;
}

.breadcrumbs__item--active .breadcrumbs__link {
  color: var(--ifm-color-emphasis-800);
  font-weight: 600;
}
```

- [ ] **Step 2: Add sticky TOC "On this page" styling**

In `apps/docs/src/css/custom.css`, replace the existing TOC rules with:

```css
/* ─── TOC "On this page" (Shopify-style) ─────────────────────────── */

.table-of-contents {
  border-left: 2px solid var(--ifm-toc-border-color);
  padding-left: 0.75rem;
}

.table-of-contents::before {
  content: 'On this page';
  display: block;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ifm-color-emphasis-500);
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--ifm-toc-border-color);
}

.table-of-contents__link {
  font-size: 0.8rem;
  color: var(--ifm-color-emphasis-600);
  display: block;
  padding: 3px 0;
  border-left: 2px solid transparent;
  margin-left: -0.85rem;
  padding-left: 0.75rem;
  transition: all 0.15s ease;
}

.table-of-contents__link--active {
  font-weight: 600;
  color: var(--ifm-color-primary);
  border-left-color: var(--ifm-color-primary);
}

.table-of-contents__link:hover {
  color: var(--ifm-color-primary);
  text-decoration: none;
}
```

- [ ] **Step 3: Verify build**

```bash
pnpm --filter @czo/docs build 2>&1 | tail -3
```

- [ ] **Step 4: Commit**

```bash
git add apps/docs/src/css/custom.css
git commit -m "docs: add Shopify-style breadcrumbs and sticky TOC"
```

---

### Task 4: Split sticky API reference layout

**Files:**
- Create: `apps/docs/src/theme/DocItem/Layout/index.tsx`
- Modify: `apps/docs/src/css/custom.css`

This is the most complex task. We swizzle the `DocItem/Layout` component to detect API reference pages and apply a two-column layout where code blocks are extracted to a sticky right panel.

- [ ] **Step 1: Swizzle DocItem/Layout to get the base component**

```bash
cd /workspace/c-zo/apps/docs && npx docusaurus swizzle @docusaurus/theme-classic DocItem/Layout -- --wrap --typescript
```

This creates `src/theme/DocItem/Layout/index.tsx` as a wrapper around the original component. If the swizzle command asks for confirmation, accept it.

Read the generated file before modifying it.

- [ ] **Step 2: Implement the API split layout wrapper**

Read the swizzled `src/theme/DocItem/Layout/index.tsx`. Then modify it to:

1. Import `useLocation` from `@docusaurus/router`
2. Check if current path contains `/api/graphql/`
3. If yes, wrap the content in a `div.api-split-layout` with a `useEffect` that:
   - Queries all `pre` elements from `.api-split-layout__content`
   - Clones them into `.api-split-layout__code` using safe DOM methods (appendChild with cloneNode)
   - Hides the original code block containers in the content column
4. If no, render the default layout unchanged

Key implementation details:
- Use `useRef` for both content and code panel references
- In `useEffect`, query `pre` elements, clone them with `cloneNode(true)`, and append to the code panel
- Hide originals by setting `style.display = 'none'` on the closest `div[class*="codeBlockContainer"]` or the `pre` itself
- Clear the code panel before re-populating (use `while (panel.firstChild) panel.removeChild(panel.firstChild)` — do NOT use innerHTML for security)
- Add `location.pathname` to the useEffect dependency array so it re-runs on navigation

- [ ] **Step 3: Add API split layout CSS**

Append to `apps/docs/src/css/custom.css`:

```css
/* ─── API Split Layout (Stripe-style sticky code) ────────────────── */

.api-split-layout {
  display: flex;
  gap: 0;
  max-width: 100%;
  margin: 0 -1rem;
}

.api-split-layout__content {
  flex: 1.2;
  min-width: 0;
  padding: 0 1rem;
  overflow-y: auto;
}

/* Hide TOC on API split pages — code panel replaces it */
.api-split-layout ~ div[class*='tableOfContents'],
.api-split-layout .col[class*='docItemCol'] + .col {
  display: none;
}

.api-split-layout__code {
  flex: 0.8;
  position: sticky;
  top: var(--ifm-navbar-height);
  height: calc(100vh - var(--ifm-navbar-height));
  overflow-y: auto;
  background: #0f172a;
  padding: 1.5rem;
  border-left: 1px solid #1e293b;
}

.api-split-layout__code pre {
  background: transparent !important;
  margin: 0 0 1rem;
  padding: 0;
  border: none;
  box-shadow: none;
}

.api-split-layout__code pre code {
  font-size: 0.8rem;
  color: #e2e8f0;
}

/* Responsive: stack on tablet and below */
@media (max-width: 996px) {
  .api-split-layout {
    flex-direction: column;
    margin: 0;
  }

  .api-split-layout__code {
    display: none;
  }

  .api-split-layout__content div[class*='codeBlockContainer'],
  .api-split-layout__content pre {
    display: block !important;
  }
}
```

- [ ] **Step 4: Verify build**

```bash
pnpm --filter @czo/docs build 2>&1 | tail -5
```

Expected: Build succeeds. The swizzled component should be detected by Docusaurus.

- [ ] **Step 5: Commit**

```bash
git add apps/docs/src/theme/ apps/docs/src/css/custom.css
git commit -m "docs: add split-sticky API reference layout (Stripe-style)"
```

---

## Chunk 3: Cleanup and Verification

### Task 5: Clean up duplicate CSS rules and final build verification

**Files:**
- Modify: `apps/docs/src/css/custom.css`

- [ ] **Step 1: Remove any duplicate or conflicting CSS rules**

Read through the full `custom.css` and remove any rules that were superseded by Tasks 1-4. Specifically check for:
- Duplicate `.markdown h1/h2/h3` rules (keep only the Task 1 versions)
- Duplicate `.prism-code` rules (keep only the Task 2 version)
- Duplicate `code` rules (keep only `code:not(pre code)` from Task 1)
- Duplicate `div[class^='codeBlockContainer']` rules
- Duplicate `.table-of-contents__link` rules (keep only Task 3 versions)
- Any conflicting `!important` overrides

The file should have a clean structure with sections clearly labeled by comment headers.

- [ ] **Step 2: Full build**

```bash
pnpm --filter @czo/docs build 2>&1 | tail -5
```

Expected: `[SUCCESS] Generated static files in "build".`

- [ ] **Step 3: Commit**

```bash
git add apps/docs/src/css/custom.css
git commit -m "docs: clean up duplicate CSS rules and finalize Shopify-style theme"
```
