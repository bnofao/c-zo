# Design : Module `@czo/attribute` (aligné architecture v2)

- **Statut** : Validé (brainstorm) — prêt pour plan d'implémentation
- **Date** : 2026-05-31
- **Branche** : `feat/sp1-auth`
- **Source métier** : [`docs/planning/attribute-module/`](../../planning/attribute-module/) (brainstorm + prd + trd, 2026-01-30)

Ce document **fige les décisions** et **modernise** la spec de planning (écrite pour l'ancienne
stack : IoC `@adonisjs/fold`, `defineNitroModule`, GraphQL schema-first + codegen, UUID, hard-delete,
mono-tenant). Le **design métier de la spec est conservé** (système d'attributs typés inspiré
Saleor : 11 types, tables de valeurs typées centralisées, jonctions côté consumer, external IDs,
reorder, `reference_entity`, `unit`). On ne re-copie pas le détail exhaustif des tables/champs
GraphQL : se référer au **TRD** pour les colonnes/inputs/outputs inchangés, sous réserve des deltas
ci-dessous.

---

## 1. Décisions (réconciliation spec ↔ conventions actuelles)

| Sujet | Décision | Note |
|---|---|---|
| Clé primaire | **`integer generatedAlwaysAsIdentity`** (pas UUID) | Comme auth/stock-location ; global IDs relay masquent l'id réel |
| Suppression | **Hard-delete + FK `onDelete: cascade`** | Choix délibéré de la spec (catalogue de définitions, pattern Saleor). **Déroge** à la convention soft-delete (`coding-style.md`) — assumé pour ce module |
| Périmètre | **MVP complet en un plan** | 8 tables, 11 types, ~32 mutations, filtrage, union `AttributeChoice` |
| Scoping | **Hybride plateforme/org** (cf. §2) | `organizationId` nullable ; admin gère le tier plateforme, les orgs gèrent/étendent le leur |
| Unicité slug attribut | **`UNIQUE(slug)` global** | Un seul `color` ; les orgs l'**étendent** au lieu de le *shadow*er |
| Stack | **defineModule + Pothos code-first + `@effect/sql-pg`/Drizzle RQBv2** | Calqué sur stock-location |

---

## 2. Modèle de scoping hybride

Deux tiers distingués par **`organizationId integer NULL`** sur les définitions :

| `organizationId` | Signification | Géré par |
|---|---|---|
| `NULL` | Attribut/valeur **plateforme** (catalogue de base) | **admin global** |
| `= orgX` | Attribut/valeur **propre à orgX** (ou **org-value greffée** sur un attribut plateforme) | **membre d'orgX** |

**Cas d'usage**
1. **Admin crée un attribut plateforme** : `Color` (DROPDOWN, `organizationId=null`) + choix plateforme Red/Blue (`attribute_values.organizationId=null`).
2. **Org étend** un attribut plateforme : Acme ajoute `Crimson` → `attribute_value(attribute_id=Color, value="Crimson", organizationId=Acme)`. L'attribut reste plateforme ; seule la **valeur** est org-scoped.
3. **Org crée son propre attribut** : `Fabric` (`organizationId=Acme`) + valeurs (`organizationId=Acme`).

**Visibilité (lecture, pour orgX)**
- `attributes` : **plateforme (null) ∪ org=orgX**.
- `Attribute.values` (sous-champ) : **valeurs plateforme (null) ∪ valeurs org=orgX**. Jamais les valeurs d'autres orgs.

**Autz** — nouveau domaine d'accès `attribute` (cf. §6) :
- **Écriture tier org** (`organizationId=orgX`) → `permission { resource:'attribute', actions:[…], organization: orgX }` ; une org ne touche **que** ses propres attributs/valeurs (y compris ses org-values greffées sur un attribut plateforme).
- **Écriture tier plateforme** (`organizationId=null`) → **capacité admin globale** (cf. §6, point à câbler).
- **Lecture** → `{ auth: true }`, résultats filtrés plateforme ∪ org du caller.

**Règles d'intégrité**
- Une org-value ne peut être greffée que sur un attribut **plateforme** ou sur **son propre** attribut (pas sur l'attribut d'une autre org).
- L'`organizationId` d'une valeur, s'il est non-null, doit correspondre à l'org du caller (posé serveur-side, pas depuis l'input).

---

## 3. Schéma (modernisé)

Tables (détail des colonnes : voir TRD §4, avec les deltas suivants appliqués) :

**Définitions**
- `attributes` — `id` int PK identity ; **`organizationId` int NULL** ; `name`, `slug` (UNIQUE global), `type` (enum), `referenceEntity` NULL, `unit` (enum) NULL, `isRequired`, `isFilterable`, `externalSource`/`externalId`, `metadata` jsonb, **`version` int** (optimistic lock), `createdAt`/`updatedAt`. Checks : `referenceEntity` requis ssi REFERENCE ; `unit` non-null seulement si NUMERIC ; `UNIQUE(externalSource, externalId)`.

**Valeurs de choix** (prédéfinies, reorderables) — chacune : `id` int PK ; `attributeId` int FK `onDelete cascade` ; **`organizationId` int NULL** ; `slug` (`UNIQUE(attributeId, slug)`), `value`, `position` int, external IDs.
- `attribute_values` (DROPDOWN/MULTISELECT)
- `attribute_swatch_values` (+ `color` varchar(7) NULL, `fileUrl` NULL, `mimetype` NULL ; checks : color OU fileUrl ; mimetype si fileUrl)
- `attribute_reference_values` (+ `referenceId` int, `UNIQUE(attributeId, referenceId)`)

**Valeurs typées** (assignées par les consumers) — `id` int PK ; `attributeId` int FK cascade ; **`organizationId` int NULL** ; external IDs ; pas de `position`/`version`.
- `attribute_text_values` (`plain` text NOT NULL, `rich` jsonb NULL)
- `attribute_numeric_values` (`value` numeric(20,6))
- `attribute_boolean_values` (`value` boolean)
- `attribute_date_values` (`value` timestamptz)
- `attribute_file_values` (`fileUrl` NOT NULL, `mimetype` NOT NULL)

**Enums** : `pgEnum('attribute_type', […11])`, `pgEnum('attribute_unit', […])`.
**Extension** : migration `CREATE EXTENSION IF NOT EXISTS pg_trgm` + index GIN trigram (recherche floue), index décrits au TRD §4.
**Relations** (`database/relations.ts`, RQBv2) : `attributes` → many `values`/`swatchValues`/`referenceValues`/typed ; chaque valeur → one `attribute`. Augmentation `SchemaRegistryShape` co-localisée dans `database/schema.ts` (pattern auth/stock-location).

---

## 4. Services (Effect-native)

`Context.Service` + `Layer.effect(make)` colocalisés (pattern SP-A), erreurs taggées `Data.TaggedError` (= erreurs Pothos via `registerError`), `Effect.fnUntraced`/`Effect.gen`, `optimisticUpdate` du kit pour `attributes.version`, `DrizzleDb` (effect-postgres). Le service **fait confiance à l'appelant** (autz au niveau GraphQL authScope), mais porte les invariants **métier** (existence → NotFound, unicité slug → SlugTaken, validation par type, intégrité du scoping org-value).

- `AttributeService` : `findFirst`/`findMany` (filtrés plateforme∪org via paramètre `organizationId` passé par le resolver), `create`, `update` (optimistic), `delete` (hard, cascade DB).
- `AttributeValueService` : CRUD + `reorder*` (batch position) pour value/swatch/reference ; helper `slug` ; pose `organizationId` selon le tier.
- `TypedValueService` : CRUD text/numeric/boolean/date/file.
- `ValidationService` (helpers purs) : par type (hex swatch, FileInfo mimetype, ISO date, rich JSON, slug URL-safe, referenceEntity requis…). Validation au **bord** (input) via Effect Schema/Zod ; le service suppose des entrées validées sauf invariants DB.

---

## 5. GraphQL (Pothos code-first)

- **Mutations** : `relayMutationField` (pas de `*Payload`/`UserError`). Erreurs via `errors.types: [...]` + tagged errors enregistrées (`AttributeNotFound`, `AttributeSlugTaken`, `AttributeTypeImmutable`, `ValidationError`, `OptimisticLockError`, `SwatchRequiresColorOrFile`, `ReferenceEntityRequired`, …). Liste des mutations = TRD §3 (createAttribute/update/delete ; create/update/delete/reorder pour value/swatch/reference ; create/update/delete pour text/numeric/boolean/date/file).
- **Queries** : `attribute(id|slug)`, `attributes(where, search, orderBy, first/after)` (connexion relay). `where` réutilise les **filtres kit** (`StringFilterInput`, `IntFilterInput`, `BooleanFilterInput`) + filtres enum locaux (`AttributeType`/`AttributeUnit`) + `AND/OR/NOT` + `metadata` (JSONB). Toutes les lectures injectent le filtre **org du caller** côté resolver.
- **`Attribute.values`** : sous-champ renvoyant l'**union `AttributeChoice` = `AttributeValue | AttributeSwatchValue | AttributeReferenceValue`** (connexion), résolue org-aware (plateforme ∪ org). Vide pour les types sans choix.
- **Scalars** : `DateTime`, `JSONObject`, `JSON` (déjà dans kit) ; `FileInfo`/`FileInfoInput` (objet/inputs locaux mappés `fileUrl`+`mimetype`).
- **Global IDs** relay (int).

---

## 6. Autorisation (domaine d'accès `attribute`)

- **Enregistrement** : dans `onStart` du module — `Access.AccessService.register({ name:'attribute', statements:{ attribute:['create','read','update','delete'] }, hierarchy:[…org roles…] })` (comme stock-location). Le freeze reste géré par auth en `onStarted`.
- **Mutations tier org** : `authScopes` fonction → `{ permission: { resource:'attribute', actions:[…], organization: <org du caller / dérivée de la ressource> } }`. Pour les mutations by-id (update/delete/reorder), l'org est **dérivée de la ressource** (helper `loadOrganizationId` local, pattern stock-location) ; refus si la ressource est plateforme et le caller non-admin, ou appartient à une autre org.
- **Mutations tier plateforme** (`organizationId` omis → plateforme) : exigent une **capacité admin globale**. ⚠️ **À câbler dans le plan** : un `permission` sans org tape le rôle **global** (cf. fix `createOrganization`), donc `attribute:*` doit être **accordé à un rôle admin global**. Décision d'implémentation : ajouter les statements `attribute` à un rôle admin global (côté auth `ADMIN_*` ou via le domaine `attribute` exposant un rôle global) — à trancher au plan, en réutilisant le mécanisme `permission`.
- **Queries** : `{ auth: true }` + filtrage org côté resolver.

---

## 7. Structure du module (calquée stock-location)

```
packages/modules/attribute/
  package.json            # @czo/attribute ; deps: @czo/kit, drizzle-orm, effect, zod ;
                          # peer+dev: @czo/auth ; exports: . /schema /relations /services /graphql
  build.config.ts         # entries: index, database/schema, database/relations, services/index, graphql/index
  drizzle.config.ts
  migrations/
  src/
    index.ts              # defineModule(() => ({ layer, db:{schema,relations}, graphql:{contribution,authScope?}, onStart: register 'attribute' }))
    database/{schema.ts, relations.ts}
    services/
      index.ts            # AttributeModuleLive = mergeAll(...)
      attribute.ts
      attribute-value.ts
      typed-value.ts
      validation.ts
      utils/slug.ts
    graphql/
      index.ts            # registerAttributeSchema + BuilderSchema* augmentations + import '@czo/auth/graphql'
      schema/attribute/{types,inputs,errors,queries,mutations}.ts
```
- **apps/life** : ajouter `attributeModule` au manifeste, **après** `auth` (provideMerge fold ; le module lit auth `permission` + `AccessService`).
- `@czo/attribute` dépend d'`@czo/auth` (peer+dev) pour : `AccessService` (onStart), scope `permission` + augmentations graphql.

---

## 8. Tests

- Unitaires (`@effect/vitest`) : validation par type, génération slug, sélection org-aware des valeurs (plateforme∪org).
- Intégration (Testcontainers `@czo/kit/testing`) : CRUD attributs + valeurs par type, optimistic lock, cascade hard-delete, contraintes d'unicité, scoping (admin plateforme / org propre / org étend plateforme / isolation cross-org).

---

## 9. Hors périmètre (rappel PRD)

AttributeGroup, i18n, permissions par-attribut, import/export masse, audit log, templates par ProductType, types custom extensibles (architecture préparée). Le champ `metadata` JSON n'est **pas** remplacé.

---

## 10. Points ouverts à trancher au plan

1. **Câblage autz tier plateforme** (§6) : comment `attribute:*` est accordé à un rôle admin global (réutilise `permission`/rôle global sans toucher lourdement à auth).
2. **`organizationId` sur les valeurs typées** : posé par le consumer ; confirmer s'il est requis dès le MVP ou ajouté quand un consumer (Product) arrive.
3. **Slug coexistant plateforme/org** : tranché → **global unique** (les orgs choisissent un slug libre pour leurs propres attributs ; pour étendre, elles ajoutent des valeurs, pas un attribut).

---

### Références
- [Brainstorm](../../planning/attribute-module/brainstorm.md) · [PRD](../../planning/attribute-module/prd.md) · [TRD](../../planning/attribute-module/trd.md) (détail tables/GraphQL inchangé sous réserve des deltas §1–§3)
- Modules de référence : `packages/modules/stock-location` (defineModule, authz org-scopée, Pothos), `packages/modules/auth` (AccessService, `permission`).
