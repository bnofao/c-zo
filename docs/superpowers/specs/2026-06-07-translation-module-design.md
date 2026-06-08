# `@czo/translation` — content translation module (design)

**Date:** 2026-06-07
**Branch:** `feat/translation-module`
**Goal:** A small Effect-native module `@czo/translation` that owns a **global `locales` registry** and a **reusable `translatedField` Pothos helper**, plus a **documented pivot pattern** for consumer modules. Translations themselves live in **consumer-owned, typed pivot tables** — not a central store.

## Context

c-zo content (channel names, price-list titles, attribute labels, stock-location names, …) needs per-locale translations. The naïve design is a generic EAV store `translations(resource_type, resource_id, field, locale, value)` — but `resource_id` is **polymorphic**, so it can carry **no foreign key** (no referential integrity, no cascade), `value` is an untyped text catch-all, and *because* it is decoupled-but-untyped it would require a cross-module request-scoped DataLoader to batch reads.

This design rejects EAV in favor of **consumer-owned pivot tables**: each translatable entity gets a typed `<entity>_translations` pivot (real columns, a real `ON DELETE CASCADE` FK to the entity, a `unique(entity_id, locale_code)`). The win:

- **Typed columns** (`channel_translations.name`) instead of a `(field, value)` catch-all.
- **Referential integrity + cascade** — deleting an entity removes its translations automatically.
- **Native Pothos-drizzle batching** — `<entity>.translations` is a real Drizzle relation, so the `translatedField` helper loads it via the drizzle plugin's `select`/`with` (merged into the parent query, batched across N entities). **No DataLoader, no per-request context contributor, no kit change.**

The cost — each consumer adds its own pivot table + relation — is the right trade: that data is typed, FK'd, and owned by the module that owns the entity. This module ships the **registry + helper + pattern**; wiring real consumers is deferred (mirrors how price deferred the `inventory_item.price_set_id` wiring).

### Architecture, deps, boot

Standard Effect-native module (`defineModule`). Depends only on `@czo/auth` (it reuses auth's **global-role** permission path — see authz). No cross-module *service* dependency, **no kit modification**. Boots **early — right after `auth`** — so consumer pivot tables can validate `locale_code` against the registry and adopt the helper. In the `apps/life` manifest it is inserted **right after `authModule`**, before every other module (translation must precede any future consumer that adopts the pivot/helper). The branch is cut from `main`, so the manifest there is `[auth, attribute, stock-location, channel]` → `[auth, translation, attribute, stock-location, channel]`.

## Data model (1 table — GLOBAL)

`locales` is **platform-global** (no `organizationId`): the platform defines the menu of languages; merchants translate their org-scoped content into those languages. The entity's own base field is the translation *source* (whatever its language), so resolution falls back to the base field, never to a "default-locale" row.

### `locales`

| Column | Type | Notes |
|--------|------|-------|
| `id` | integer identity PK | relay node id |
| `code` | text NOT NULL | BCP-47 (`'en'`, `'fr'`, `'fr-CA'`); the value pivots store as `locale_code` |
| `name` | text NOT NULL | display name (`'Francais'`) |
| `is_active` | boolean NOT NULL default true | inactive = hidden from the storefront menu |
| `deleted_at` | timestamp NULL | soft-delete |
| `version` | integer NOT NULL default 1 | optimistic lock |
| `created_at` / `updated_at` | timestamp NOT NULL defaultNow | |

Constraints: partial `unique(code) WHERE deleted_at IS NULL`. Seed migration inserts `en` (active). **There is no `is_default` column** — the platform default locale is a deployment config (see below), not relational state, because it is a single global value used only as a storefront hint.

### Config

The default locale is an Effect `Config` value, declared in the module's `index.ts` Config block (the project convention — tunables live in the module config, threaded as `cfg.value`, not scattered constants):

- **`TRANSLATION_DEFAULT_LOCALE`** → `Config.string` with `Config.withDefault('en')`. Surfaced by the `defaultLocale` GraphQL query, which resolves the configured code to its live `Locale` row (or `null` if the configured code is not an active locale in the registry — ops keeps them in sync).

## LocaleService

Plain CRUD over the registry — **no default management** (the default is config). **Writes are GLOBAL-gated** (see authz); **reads are public**.

- `createLocale({ code, name, isActive? })` → duplicate live `code` → `LocaleCodeTaken`.
- `updateLocale(id, expectedVersion, { name?, isActive? })` → guarded optimistic update. (`code` is immutable after creation.)
- `softDeleteLocale(id, expectedVersion)` → guarded optimistic soft-delete.
- `findLocaleById(id)`, `findLocaleByCode(code)`, `listLocales({ activeOnly? })`.

Errors (tagged, registered as GraphQL errors): `LocaleNotFound`, `LocaleCodeTaken`, `LocaleDbFailed`, `OptimisticLockError`. The mutating methods use the `dbErr`/`dbErrOptimistic` mappers (no domain failure runs inside a transaction here, so the `dbErrSql` SqlError-only mapper is not needed); plain reads use `dbErr`.

## The `translatedField` helper (the reusable core)

Exported from `@czo/translation/graphql`. A Pothos field factory consumers use inside their `drizzleNode` field maps:

```ts
fields: t => ({
  name: translatedField(t, { relation: 'translations', field: 'name', base: r => r.name }),
  description: translatedField(t, { relation: 'translations', field: 'description', base: r => r.description, nullable: true }),
})
```

It exposes `<field>(locale: String): String` and resolves **translation-or-base**:

1. Adds a `locale: String` arg (optional).
2. Uses the **Pothos-drizzle `select`** mechanism to pull the parent's pivot `relation`, filtered `where: { localeCode: args.locale }` (limit 1), selecting the `field` column — so the drizzle plugin **merges it into the batched parent query** (N entities × M translated fields → 1–2 queries, same `locale`).
3. Resolves `parent[relation][0]?.[field] ?? base(parent)`. `locale` omitted, or no matching pivot row → the base value (the source). `nullable` controls whether the base may be null.

**No authz on the overlay** — it runs inside the consumer's already-gated field resolver, so it inherits the parent field's visibility.

> **Technical risk to verify in the plan:** the Pothos-drizzle API for an **arg-dependent `select`/`with`** on a field (so the relation filter uses `args.locale`). If arg-dependent `select` is unsupported, the documented fallback is to load the full `translations` relation for the parent (still batched by the drizzle plugin) and pick the locale in the resolver — identical behavior, marginally more data. This is the one API to confirm first (analogous to the price `CalculatedPrice` union-ref check).

## Pivot pattern (documented, for consumer modules — NOT built here)

A translatable entity adds, **in its own module**:

```ts
export const channelTranslations = pgTable('channel_translations', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(...),
  channelId: integer('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }), // intra-module FK + cascade
  localeCode: text('locale_code').notNull(), // cross-module ref to locales.code — NO DB FK (house convention); validated at write against LocaleService
  name: text('name'),
  description: text('description'),
  createdAt, updatedAt,
}, t => [uniqueIndex('channel_translations_uniq').on(t.channelId, t.localeCode)])
```

plus a `channel.translations` relation, a translation CRUD on the channel service (validating `localeCode` against the registry), and `translatedField` on the `Channel` node. This module **documents** the pattern and proves it with a **demo fixture** (below); it does not wire any real consumer.

## GraphQL & authz

- **`Locale` `drizzleNode`** (`code`, `name`, `isActive`). Queries: **`locales(activeOnly?)`** (list), **`locale(id)`**, and **`defaultLocale`** (resolves the `TRANSLATION_DEFAULT_LOCALE` config code to its live `Locale`, or `null`) — all **public reads** (the storefront enumerates languages + its default; no scope).
- **Mutations** `createLocale` / `updateLocale` / `deleteLocale` — gated **GLOBAL**: `{ permission: { resource: 'locale', actions: [...] } }` with **no `organization`**, which c-zo's existing `permission` scope routes to `UserService.hasPermission(user.global role, …)`. A platform admin is a user whose **global `users.role`** carries the `locale` permission (granted via `grantGlobalRole` in tests; an ops concern in production).
- **`translatedField`** helper export.
- **Access domain**: `onStart` registers a `locale` domain — statements `{ locale: ['create','read','update','delete'] }`, hierarchy `locale:viewer/manager/admin`. The same registry as org domains; the *call sites* omit `organization`, so it is evaluated as a **global** role. No node-guards (locales are global, public-read).

## Out of scope

- **Wiring real consumers** (channel/price-list/attribute pivots + `translatedField`) — a separate per-consumer integration.
- **Static UI strings** (frontend i18n bundles), **machine/auto translation**, **review/approval workflow**.
- **Per-org locale subsets** — the registry is global by decision; an org "supports" a locale implicitly by having translations in it.

## Testing

- **Unit** — `translatedField` overlay logic (translation present → translation; absent / no `locale` → base; nullable handling).
- **Integration (Testcontainers)** — locale CRUD; partial-unique `code` (`LocaleCodeTaken`); optimistic-lock conflict; `listLocales({ activeOnly })`; `findLocaleByCode`.
- **E2E (`bootTestApp`)** — `locales` list + `defaultLocale` are **public** (`defaultLocale` resolves the configured code, or `null` when absent); locale mutations are **global-gated** (a user with `grantGlobalRole(…, 'locale:admin')` succeeds; a plain user / org-only member is **denied**); and a **demo fixture module** (a tiny `widgets` entity + `widget_translations` pivot + a `Widget` node using `translatedField`) proves the helper **end-to-end**: `widget.name(locale: 'fr')` returns the French pivot value, falls back to the base when absent, and **batches** across many widgets in one query.
