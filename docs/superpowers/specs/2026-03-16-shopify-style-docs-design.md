# Design Spec: Shopify-Style Documentation Theme

**Status**: Approved
**Date**: 2026-03-16
**Scope**: Visual refinement of c-zo Docusaurus docs — API reference layout, typography, navigation, and code blocks

---

## Context

The c-zo documentation site (`apps/docs/`) is functional but uses default Docusaurus styling. The goal is to bring it closer to Shopify/Stripe developer docs: a split-sticky API reference layout, refined typography with badges, breadcrumbs with sticky TOC, and dark code blocks with copy and tabs.

This spec covers CSS-only changes and Docusaurus component swizzling. No new plugins or dependencies.

## Selected Elements

| Element | Description |
|---------|-------------|
| API reference layout | Split sticky — description scrolls left, code stays fixed right |
| Typography & spacing | Larger bold titles, badges (Required, Optional, Deprecated), green tinted inline code |
| Navigation | Breadcrumbs at top of each page + "On this page" sticky TOC on right |
| Code blocks | Dark background (#0f172a), visible Copy button, language tabs (GraphQL/cURL/Response) |

## Element 1: Split Sticky API Layout

The auto-generated GraphQL API pages (from `@graphql-markdown/docusaurus`) use standard single-column Markdown. To achieve the two-column split:

**Approach:** Swizzle the `DocItem/Layout` component to detect API reference pages (path starts with `docs/api/graphql/`) and apply a custom two-column layout. The left column contains the generated Markdown content. The right column contains code examples extracted from code blocks in the page, rendered in a sticky container.

**CSS structure:**
```
.api-split-layout {
  display: flex;
  gap: 0;
}
.api-split-layout__content {
  flex: 1.2;
  padding-right: 2rem;
}
.api-split-layout__code {
  flex: 0.8;
  position: sticky;
  top: var(--ifm-navbar-height);
  height: calc(100vh - var(--ifm-navbar-height));
  overflow-y: auto;
  background: #0f172a;
  border-radius: 0;
}
```

**Simplification:** Since graphql-markdown generates `.mdx` files with a consistent structure, and the code examples are embedded in the content, the split can be achieved via CSS-only by targeting `pre` elements within API pages and repositioning them to the right column using CSS grid or flexbox. No React swizzling may be needed if we use a CSS-only approach with `display: grid` and `order` properties.

**Recommendation:** Start with CSS-only. If insufficient, swizzle `DocItem/Layout`.

## Element 2: Typography & Badges

**Changes to `custom.css`:**

- Heading sizes: h1 = 2.25rem, h2 = 1.6rem (with bottom border), h3 = 1.25rem
- Line height: 1.8 for body text
- Inline code: light green background (`#f0fdf4`) with green text (`#166534`), dark mode inverted
- Badges as CSS classes usable in Markdown/MDX:
  - `.badge--required` — red background, used for required fields
  - `.badge--optional` — green background, for optional fields
  - `.badge--deprecated` — yellow background, for deprecated fields
  - `.badge--mutation` / `.badge--query` — semantic badges for operation types
- Field type links in blue (`var(--ifm-color-primary)`)

## Element 3: Breadcrumbs + Sticky TOC

Docusaurus has built-in breadcrumbs (enabled by default in classic preset) and a TOC sidebar. The changes are:

- **Breadcrumbs**: Already present in Docusaurus. Style them to be more prominent — slightly larger font, separator character `›`, and module-aware labels.
- **TOC "On this page"**: Docusaurus renders this by default on the right side. Style it to be sticky with a heading "On this page", smaller font, and a left border indicator for the active section.

**CSS only — no swizzling needed.**

## Element 4: Dark Code Blocks with Copy & Tabs

**Dark background:** Override Prism theme to use `#0f172a` background regardless of light/dark site theme. Code blocks should always be dark.

**Copy button:** Docusaurus already has a copy button (`themeConfig.prism.copyButton` or swizzle `CodeBlock/CopyButton`). Just style it to be more visible — always shown (not just on hover), with a subtle background.

**Language tabs:** For API pages where we want to show GraphQL + cURL + Response, use Docusaurus built-in `<Tabs>` component in MDX. This doesn't require swizzling — it's content-level. The auto-generated graphql-markdown pages won't have tabs, but manually written API examples in module docs can use them.

## Implementation Approach

All changes are in `apps/docs/`:

1. **`src/css/custom.css`** — bulk of the work: API split layout, typography, badges, code blocks, breadcrumbs, TOC
2. **`src/theme/DocItem/Layout/index.tsx`** — only if CSS-only split layout is insufficient (swizzle wrapper)
3. **No new dependencies** — everything uses existing Docusaurus features and CSS

## Out of Scope

- Sidebar redesign with icons (not selected)
- Homepage cards redesign (already done)
- Search integration
- Custom MDX components beyond badges
