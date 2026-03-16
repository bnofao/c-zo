# Design Spec: Platform Documentation (Sub-project 1)

**Status**: Approved
**Date**: 2026-03-16
**Scope**: Developer documentation for the c-zo platform and its modules

---

## Context

c-zo is a modular e-commerce platform with multiple vertical products (marketplace, delivery, ticketing) sharing a common module system. The codebase has extensive internal planning docs (PRDs, TRDs) but no user-facing documentation: empty root README, no package READMEs, no documentation site, no API reference.

This spec covers **sub-project 1**: platform and module documentation for internal and external developers. Sub-project 2 (merchant/end-user docs per product vertical) will follow separately.

## Audiences

- **Internal developers**: onboarding, module development guides, architecture reference
- **External developers**: contributors, integrators building apps on c-zo modules

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Tool | Docusaurus | Mature, versioning, i18n, plugin ecosystem, React-based (consistent with Next.js frontend) |
| Location | `apps/docs/` | Treated as a monorepo app, benefits from Turborepo, shared configs |
| GraphQL API docs | `@graphql-markdown/docusaurus` | Auto-generates from `.graphql` schema files |
| OpenAPI docs | `docusaurus-plugin-openapi-docs` | Auto-generates from existing OpenAPI endpoint |
| READMEs | Intermediate | Quick start + examples in README, full docs on site |
| Language | English | Developer audience is international |
| Generated files | Committed to git | Avoids build-time dependency on running services |

## Site Structure

### Navbar

```
c-zo docs
├── Guides          → /docs/
├── Modules         → /docs/modules/
├── API Reference   → /docs/api/
└── Blog            → /blog/
```

### Navigation Tree

```
Guides
├── Introduction
├── Getting Started (install, docker, first run)
├── Architecture (monorepo, module system, IoC, event bus)
├── Creating a Module (step-by-step tutorial)
└── Conventions (coding style, testing, git workflow)

Modules
├── Kit (@czo/kit)
│   ├── Overview
│   ├── Database (Drizzle, Repository, migrations)
│   ├── GraphQL (codegen, context, resolvers)
│   ├── IoC Container
│   └── Event Bus
├── Auth (@czo/auth)
│   ├── Overview
│   ├── Configuration
│   ├── Permissions & Access Control
│   └── Apps (install, webhooks)
├── Stock Location (@czo/stock-location)
│   ├── Overview
│   ├── Mutations (create, update)
│   └── Events
└── ... (future modules follow the same template)

API Reference
├── GraphQL (auto-generated from .graphql schemas)
└── REST / OpenAPI (auto-generated from OpenAPI spec)
```

### Monorepo Placement

```
apps/
  docs/
    docusaurus.config.ts
    sidebars.ts
    docs/
      guides/
        intro.md
        getting-started.md
        architecture.md
        creating-a-module.md
        conventions.md
      modules/
        kit/
        auth/
        stock-location/
      api/
        graphql/       ← auto-generated
        rest/          ← auto-generated
    blog/
    static/
    package.json
```

## Auto-Generation

### GraphQL

Plugin `@graphql-markdown/docusaurus` reads all `.graphql` schema files:

```
Source: packages/modules/*/src/graphql/schema/**/*.graphql
        + packages/kit/src/graphql/base-types.graphql
        + packages/kit/src/graphql/filter-types.graphql
                    ↓
Output: apps/docs/docs/api/graphql/
        ├── mutations.md
        ├── queries.md
        ├── types.md
        ├── inputs.md
        └── scalars.md
```

### OpenAPI

Plugin `docusaurus-plugin-openapi-docs` consumes the spec from `apps/mazo`:

```
Source: Static export of /api/_nitro/openapi.json
                    ↓
Output: apps/docs/docs/api/rest/
```

### Scripts

```json
{
  "scripts": {
    "dev": "docusaurus start",
    "build": "docusaurus build",
    "generate": "pnpm generate:graphql && pnpm generate:openapi",
    "generate:graphql": "graphql-markdown",
    "generate:openapi": "docusaurus gen-api-docs all"
  }
}
```

## Module Documentation Template

Each module page follows a consistent structure:

```markdown
# Module Name

> One-line description

## Overview
What the module does, why it exists, its dependencies.

## Installation
Add to nitro.config.ts + run migration.

## Configuration
Environment variables, plugin options.

## Usage
Code examples (service API, GraphQL queries/mutations).

## Database Schema
Table of columns with types and constraints.

## Events
List of emitted events with their payloads.

## Permissions
Resource, actions, role hierarchy.
```

## Package README Template

Each package in `packages/modules/` gets a README:

```markdown
# @czo/<module-name>

<one-line description>

## Quick Start

\`\`\`bash
# In apps/mazo/nitro.config.ts
modules: ['@czo/<module-name>', ...]

# Run migration
cd packages/modules/<module-name>
pnpm migrate:latest
\`\`\`

## Key Concepts
- Bullet list of 3-5 core concepts

## API

| Operation | Type | Description |
|-----------|------|-------------|
| createX   | Mutation | ... |
| updateX   | Mutation | ... |

## Documentation

Full docs: https://docs.c-zo.dev/modules/<module-name>
```

## Workflow

```
Developer modifies .graphql schema or adds a module
                    ↓
pnpm --filter @czo/docs generate    (regenerate API reference)
                    ↓
Developer updates module guide if needed (manual)
                    ↓
PR includes docs changes
```

No CI automation for generation — deliberate choice to keep the docs build simple. A PR checklist reminds to regenerate when schemas change.

## Deployment

Not in scope for this spec. The Docusaurus build produces static files deployable to Vercel, Netlify, or GitHub Pages when ready.

## Out of Scope

- Merchant/end-user documentation (sub-project 2)
- Product-specific guides per vertical (marketplace, delivery, ticketing)
- i18n (will be needed for sub-project 2, not for dev docs)
- Storybook for UI components (separate concern)
- Changelog automation (can be added later via blog)
