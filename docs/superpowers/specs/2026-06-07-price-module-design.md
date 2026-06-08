# `@czo/price` — pricing module (design)

**Date:** 2026-06-07
**Branch:** `feat/price-module`
**Goal:** A new Effect-native module `@czo/price` — a **rules-as-data pricing engine**: org-scoped price-sets grouping multi-currency prices, generic per-price rules resolved by specificity, quantity tiers, and time-bounded **price lists** (sales / contractual overrides). The headline capability is a **context-driven price resolver** that returns a *calculated price* (a tagged union `Base | Override | Sale | null`) for an arbitrary buying context — via an indexed Postgres cut + a pure Effect `BigDecimal` core, with **no rules engine binary** and **no schema change to add a pricing dimension**.

## Context

Pricing (Medusa-style) answers one question: *given this thing being sold and this buying context, what is the price?* The design splits cleanly into **data** (which rules each price carries) and **a uniform algorithm** (how the best price is picked). Putting the variation in the data — not the algorithm — is what makes the module extensible without migrations, and is why a generic Business Rules Engine (e.g. GoRules ZEN) was **explicitly rejected** for this layer: price resolution is a set-based, indexable *query* problem, not a per-decision branching problem. (A BRE remains a candidate for a future Promotions/Discounts module, where the variation genuinely lives in the algorithm.)

The module follows the established Effect-native template (`defineModule`, Drizzle schema+relations into the global `SchemaRegistryShape`, one colocated `PriceService`, code-first Pothos GraphQL, `permission` authz + node-guards, access domain in `onStart`, Testcontainers integration + E2E). It depends **only on `@czo/auth`** (org-scoping) — nothing in `price` knows about `inventory` or any consumer. **Consumers carry `price_set_id`** (a plain int ref, ownership enforced at the service layer, no inter-module DB FK), so `price` boots **before** `inventory`.

### Boot order

`[auth, attribute, stock-location, channel, price, inventory]` — `price` after `auth`. It is placed before `inventory` as **forward-ready** for the deferred `price_set_id` wiring (L4): no ordering dependency exists *yet* (that wiring is out of scope here), but the slot avoids a later manifest reshuffle. `price` has no cross-module *service* dependency (unlike channel/inventory, which reach `StockLocationService`).

### Money representation

`amount` is Postgres **`numeric`** (exact decimal, no float), manipulated as Effect **`BigDecimal`** in the service. Currency-agnostic: no coupling to a currency's minor-unit exponent (JPY=0, USD=2, BHD=3 all work). Amounts cross the JS boundary as strings to preserve precision. **No tax** (`is_tax_inclusive` omitted — a future Tax module owns that) and **no FX/currency conversion** (each price carries its currency verbatim).

## Data model (5 tables)

`organizationId` is denormalized onto `price` (copied from its set/list at creation, never mutated) so the per-row `permission` authz + node-guards work with `select:true`, consistent with attribute/stock-location/channel/inventory. All tables are **soft-delete** (`deletedAt`); top-level entities also carry `version` (optimistic lock). `price_rule` / `price_list_rule` are **value-objects** of their parent: `deletedAt` but **no `version`** (a parent's ruleset is replaced as a set, not independently versioned).

### `price_sets` (aggregation root / FK target for consumers)

| Column | Type | Notes |
|--------|------|-------|
| `id` | integer identity PK | the value consumers store as `price_set_id` |
| `organization_id` | integer NOT NULL | cross-module ref to auth `organizations.id` (no DB FK) |
| `metadata` | jsonb NULL | |
| `deleted_at` | timestamp NULL | soft-delete |
| `version` | integer NOT NULL default 1 | optimistic lock |
| `created_at` / `updated_at` | timestamp NOT NULL defaultNow | |

Indexes: `index(organization_id)`. Intentionally thin — a price-set is a pure handle that prices belong to and consumers reference; **no title** (it is not user-facing, it is a join construct).

### `prices` (a money amount + applicability)

| Column | Type | Notes |
|--------|------|-------|
| `id` | integer identity PK | |
| `organization_id` | integer NOT NULL | denormalized from the set/list |
| `price_set_id` | integer NOT NULL | FK → `price_sets.id` `onDelete: cascade` |
| `price_list_id` | integer NULL | FK → `price_lists.id` `onDelete: cascade`; **null = base price** |
| `currency_code` | text NOT NULL | ISO-4217 lowercase (`'eur'`); every price has exactly one |
| `amount` | numeric NOT NULL | exact decimal; BigDecimal in service |
| `min_quantity` | integer NULL | inclusive lower tier bound (null = unbounded) |
| `max_quantity` | integer NULL | inclusive upper tier bound (null = unbounded) |
| `deleted_at` | timestamp NULL | soft-delete |
| `version` | integer NOT NULL default 1 | optimistic lock |
| `created_at` / `updated_at` | timestamp NOT NULL defaultNow | |

Indexes: `index(price_set_id)`, `index(price_list_id)`, `index(price_set_id, currency_code)` (the resolver's hot filter). CHECK: `amount >= 0`, `min_quantity IS NULL OR min_quantity >= 1`, `max_quantity IS NULL OR max_quantity >= 1` (L2 — a `0` upper bound would make the price never applicable), `max_quantity IS NULL OR min_quantity IS NULL OR max_quantity >= min_quantity`.

Quantity tiers are deliberately **columns, not rules**: quantity is a typed *applicability filter*, not a specificity dimension — keeping it out of `price_rules` means a quantity bound never inflates `rules_matched` (a region-specific price stays more specific than a quantity-tiered-but-region-agnostic one), and a two-bound range lives on one row (the `unique(price_id, attribute)` invariant could not hold two `quantity` rules). `quantity` is therefore **reserved column-only** — it must not appear as a `price_rules`/`price_list_rules` attribute (and is not part of the buying context's `attributes` list; it is the resolver's typed `quantity` input).

### `price_rules` (generic per-price dimension — value-object)

| Column | Type | Notes |
|--------|------|-------|
| `id` | integer identity PK | |
| `price_id` | integer NOT NULL | FK → `prices.id` `onDelete: cascade` |
| `attribute` | text NOT NULL | opaque dimension key (e.g. `'region_id'`, `'item_total'`) |
| `operator` | enum `price_rule_operator` NOT NULL default `'eq'` | `eq \| ne \| gt \| gte \| lt \| lte \| in` |
| `value` | jsonb NOT NULL | `string \| number \| (string \| number)[]`; shape validated against `operator` at the mutation boundary |
| `priority` | integer NOT NULL default 0 | **dimension importance** — feeds the `Σ` tie-break at equal rule count (Medusa places `priority` here, not on `Price`) |
| `deleted_at` | timestamp NULL | soft-delete |
| `created_at` | timestamp NOT NULL defaultNow | |

Constraints: partial `unique(price_id, attribute) WHERE deleted_at IS NULL` (a price carries at most one rule per attribute), `index(price_id)`. **No launch-time pre-wired dimension** — the engine is generic; tests exercise it with a synthetic `region_id` attribute (proves extensibility without coupling to absent modules). A price with **zero** rules = the default price (always applicable for its currency/qty).

**Operators** keep *numeric/threshold* dimensions generic without a column per dimension (the reason Medusa carries `operator`): categorical dims use `eq`/`ne`/`in`, context thresholds like `item_total gte 100` use the numeric ops. `value` is `jsonb` so it can hold a scalar (eq/ne/gt/gte/lt/lte) or an array (`in`). Mutation-boundary validation enforces `operator ↔ value` coherence: numeric ops require a `number`, `in` requires a non-empty array, `eq`/`ne` accept `string` or `number`.

### Rule evaluation (a rule is *satisfied* by the context iff)

The context must **provide** the rule's `attribute` (absence ⇒ unsatisfied ⇒ the price is excluded — a rule gates *on* a dimension, including `ne`). Both `ctx = context[attribute]` and the rule `value` are JSON scalars (`string | number`); to avoid `"100" !== 100` mismatches (H2), comparison **normalizes per operator**:

| operator | satisfied when |
|---|---|
| `eq` | `String(ctx) === String(value)` |
| `ne` | `String(ctx) !== String(value)` |
| `gt` / `gte` / `lt` / `lte` | `Number(ctx)` vs `Number(value)` (`BigDecimal`-exact); either `NaN` ⇒ unsatisfied |
| `in` | `value` is an array and `value.map(String).includes(String(ctx))` |

A price is **applicable** iff **all** its rules are satisfied; `rules_matched` = its rule count (specificity), unchanged by operators.

### `price_lists` (time-bounded override collection)

| Column | Type | Notes |
|--------|------|-------|
| `id` | integer identity PK | |
| `organization_id` | integer NOT NULL | cross-module ref to auth `organizations.id` |
| `title` | text NOT NULL | user-facing (lists *are* admin-managed, unlike sets) |
| `description` | text NULL | |
| `type` | enum `sale \| override` NOT NULL | **presentational** — selects the `Sale` vs `Override` result variant (whether an `originalAmount` is surfaced); does NOT affect which price is selected |
| `status` | enum `draft \| active` NOT NULL default `'draft'` | a list applies only when `active` |
| `starts_at` | timestamp NULL | null = no lower bound |
| `ends_at` | timestamp NULL | null = no upper bound |
| `metadata` | jsonb NULL | |
| `deleted_at` | timestamp NULL | soft-delete |
| `version` | integer NOT NULL default 1 | optimistic lock |
| `created_at` / `updated_at` | timestamp NOT NULL defaultNow | |

Indexes: `index(organization_id)`. `type` and `status` are Postgres enums (`price_list_type`, `price_list_status`). A list is **applicable** iff `status='active' AND (starts_at IS NULL OR starts_at <= at) AND (ends_at IS NULL OR ends_at >= at)` AND all its `price_list_rules` match the context.

### `price_list_rules` (generic per-list gate — value-object)

Same shape as `price_rules` (incl. `operator` + jsonb `value` + the satisfaction table above) but FK → `price_lists.id`, partial `unique(price_list_id, attribute) WHERE deleted_at IS NULL`, and **no `priority`** — a list is applicable or not (boolean gate); it does not participate in price ranking, so dimension-weight is meaningless here. Gates whether the **whole list** applies to a context (e.g. `customer_group_id = 'vip'`, or `item_total gte 200` for a spend-tier list), independent of per-price rules.

## Resolution

`resolvePrice(organizationId, priceSetId, context)` where
`context = { currencyCode: string; quantity?: number /* default 1 */; at?: Date /* default now */; attributes?: ReadonlyArray<{ attribute: string; value: string | number }> }`.

**Authorization — customer-facing, org-scoped (H1).** This is the one *public* query (storefronts call it for shoppers, who hold no org permission), so it carries **no `permission` scope**. It is bound to a tenant by the explicit `organizationId` arg: the resolver loads the set and resolves **only if `price_set.organization_id === organizationId` and the set is live**, otherwise returns `null` (deny-as-null, like the node-guards). This keeps it open to unauthenticated shoppers while blocking blind cross-tenant enumeration of the sequential `price_set.id` space. Listing/CRUD stay admin-gated; only `resolvePrice` is public.

### Step 1 — SQL fetch (the cheap, indexed cut)

Because rules now carry **operators** (numeric `gt/gte/lt/lte`, set `in`), an operator-per-`CASE` SQL predicate with `value::numeric` casts would defeat indexing for marginal benefit — the genuinely selective filter is `price_set_id + currency_code` (indexed), which already cuts a set to a handful of prices. So SQL does only the cheap, indexed cut and **hydrates** the candidates for service-side evaluation:

- one query selects live `prices` where `price_set_id = $set AND deleted_at IS NULL AND currency_code = $currencyCode`,
- **dropping list prices whose list is already known-inapplicable** by the cheap, indexable temporal gate — `price_list_id IS NULL OR EXISTS (live `price_lists` row, `status='active' AND ($at BETWEEN starts_at AND ends_at`, NULL bounds open`))` — so draft/expired-list prices are excluded *before* any rule work (M1); base prices are always kept,
- `LEFT JOIN`ing the surviving prices' live `price_rules` and (for list prices) their `price_lists` + live `price_list_rules`,
- returning each price with its rules and (if any) its list + list-rules attached.

Only the *temporal/status* gate is pushed to SQL (indexable); no context values and **no rule/operator** logic enter the SQL — rule matching is evaluated in the service.

### Step 2 — evaluate, tier-override & rank (service, Effect `BigDecimal`)

On the small hydrated candidate set, the service:

1. **Applies quantity tiers** — drop prices where `$qty` falls outside `[min_quantity, max_quantity]` (NULL bounds = unbounded).
2. **Evaluates rules** (the satisfaction table above) — a price is applicable iff **all** its `price_rules` are satisfied by the context; `rules_matched` = its rule count.
3. **Evaluates list rules** for `price_list_id`-bearing prices — the list's `status='active'` and `$at ∈ [starts_at, ends_at]` were already enforced by the SQL gate, so here only the **`price_list_rules`** are checked (all must be satisfied); a list price whose list-rules fail is dropped.
4. **Partitions** the survivors into **Tier 1** (`price_list_id` non-null) and **Tier 0** (base). If Tier 1 is non-empty, the winner is the best of Tier 1; **else** the best of Tier 0 (tier-override: an active matching list always beats base — the point of a sale).
5. **Ranks** — "best" = `rules_matched DESC, Σ(matched rule priority) DESC, amount ASC (BigDecimal), price_id ASC`. Count is the primary specificity; `Σ priority` breaks count-ties by total dimension-weight (a `region` match, `priority 100`, beats a `channel` match, `priority 10`); `BigDecimal` gives exact amount comparison; the `price_id` final key guarantees a total order.

(Evaluating in Effect keeps operator logic typed, `BigDecimal`-exact, and unit-testable, and is free given a price-set resolves to a handful of candidates.)

### Step 3 — calculated price (a **tagged union**, not loose nullable fields)

The resolver returns a **discriminated result** so illegal field combinations are unrepresentable (the c-zo improvement over a flat `{ isSale, originalAmount? }` shape — those two fields are *removed*: `isSale` becomes the tag, `originalAmount` lives only where it has meaning):

```
CalculatedPrice =
  | { _tag: 'Base';     amount: string; currencyCode: string; priceId: number }
  | { _tag: 'Override'; amount: string; currencyCode: string; priceId: number; priceListId: number }
  | { _tag: 'Sale';     amount: string; originalAmount: string; currencyCode: string; priceId: number; priceListId: number }
  | null   // no applicable price (not an error; the caller decides what an unpriced set means)
```

- **`Base`** — a Tier-0 price won (no active list). `amount` only.
- **`Override`** — a Tier-1 price whose list `type === 'override'` won. `amount` + `priceListId`; no "was" price to show.
- **`Sale`** — a Tier-1 price whose list `type === 'sale'` won. Carries `originalAmount` = the best **Tier-0** price's amount for the same context (derived from the already-fetched candidates — no second query), for the storefront "~~original~~ **sale**" display. *(If a sale list wins but no base price exists, there is no markdown to display — degrade to `Override` rather than fabricate an `originalAmount`.)*

A `Sale` whose `amount` exceeds its `originalAmount` (a misconfigured "sale" dearer than base) is **not** rejected by the resolver — it is a data concern; the `price` mutation surfaces it as a non-blocking validation warning (L3), but resolution stays pure and returns the data as-is.

`amount` fields are `BigDecimal` serialized to string at the boundary. The result is an Effect Schema tagged union in the service and a **Pothos union type** (`BasePrice | OverridePrice | SalePrice`, nullable) in GraphQL — the storefront pattern-matches on `__typename`.

## GraphQL & authz

- **`drizzleNode`** for `PriceSet`, `Price`, `PriceList` (`select: true` loads `organization_id` for guards). Relay connections for the **collections** `PriceSet.prices` and `PriceList.prices`; **rules are plain list fields** — `Price.rules: [PriceRule!]`, `PriceList.rules: [PriceListRule!]` (a price has a handful of rules → a relay connection is overkill and *fails closed in mutation payloads*, the channel-connection trap from memory) (M2). `Price.amount` exposed as a `String` (BigDecimal-safe).
- **`resolvePrice(organizationId, priceSetId, context)`** query → nullable `CalculatedPrice` **union** (`BasePrice | OverridePrice | SalePrice`); the client selects per `__typename`. **Public + org-scoped** — no `permission` scope; resolves only when `price_set.organization_id === organizationId`, else `null` (see Resolution → Authorization). Context input mirrors `context` above with an `attributes: [PriceContextRuleInput!]` list (`value` a JSON scalar).
- Org-scoped **list** queries (`priceSets`, `priceLists`) take an explicit `organizationId` arg (never session-derived), consistent with project convention.
- **Mutations split by entity**: `priceSet` (create/delete), `price` (create/update/delete, incl. replacing its rules as a set), `priceList` (create/update/delete + status/window), and rule management folded into price/list mutations (rules are value-objects, replaced wholesale — no standalone rule CRUD). **Replacing a parent's rule set runs inside that parent's optimistic-lock transaction and bumps its `version`** (L1 — so concurrent rule edits conflict-detect; soft-delete the old rule rows + insert the new). A rule input is `{ attribute, operator, value }` (value a JSON scalar/array); the **buying context** input is `{ attribute, value }` only (the context supplies concrete values — operators live on rules, never on the context).
- **Node-guards** register `PriceSet`/`Price`/`PriceList` → `price:read`; **access domain** `price:viewer/manager/admin` registered in `onStart`. `permission` scope `{ resource: 'price', actions, organization }`; **deny-as-null** on `node(id:)`; reads org-scoped explicitly.

## Out of scope (locked assumptions)

- **Taxes & tax-inclusivity** — no `is_tax_inclusive` and **no `PricePreference`-equivalent** (Medusa's per-currency/region tax-inclusive config). Both are purely tax concerns owned by a future Tax module; if added later, as a typed per-currency flag, not Medusa's generic-in-name-only `(attribute, value, is_tax_inclusive)` table. Prices here are opaque gross/net amounts.
- **FX / currency conversion** — none; a price carries its currency verbatim.
- **`inventory_item.price_set_id` wiring** — a *separate* integration (adds the column to inventory + resolves at its GraphQL layer). This module ships `price` **standalone** + the resolver; wiring inventory is a follow-up task.
- **Promotions / discounts** — a future module (where a BRE like ZEN may fit). Price lists here are *lookup* overrides, not computed discounts.

## Testing

- **Unit** — rule satisfaction per operator (`eq/ne/gt/gte/lt/lte/in`, incl. missing-attribute ⇒ unsatisfied and non-numeric-context ⇒ unsatisfied for numeric ops), rank/tie-break ordering (rules → priority → BigDecimal amount → id), BigDecimal comparison edge cases, calculated-price shaping (`sale` vs `override` vs base; `originalAmount` derivation), mutation-boundary `operator ↔ value` validation.
- **Integration (Testcontainers)** — resolver correctness: specificity (rule count), quantity tiers, zero-rule default, generic extensibility via synthetic `region_id` (`eq`/`in`) and a numeric threshold (`item_total gte 100`), **tier-override** (active sale beats more-specific base), price-list **window** via `TestClock` (before/within/after; draft inactive), list-level rule gating, **no-match → null**, multi-currency isolation, soft-deleted price/list/rule excluded.
- **E2E** — `bootTestApp([auth, price])`: full CRUD via GraphQL, `resolvePrice` end-to-end returning the calculated-price union, **public + org-scoped resolve** (no auth needed; a mismatched `organizationId` → `null`, proving no cross-tenant read of another org's `price_set` — H1), node-guard org-scoping (deny-as-null), permission gating per access tier on listing/CRUD.
