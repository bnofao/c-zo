# TRD : Stock Location (Emplacements de stock)

**Statut** : Brouillon
**Auteur** : [Nom]
**Créé le** : 2026-03-15
**Dernière mise à jour** : 2026-03-15
**PRD lié** : [docs/planning/stock-location/prd.md](./prd.md)

---

## 1. Aperçu technique

Module autonome `@czo/stock-location` qui modélise les emplacements physiques de stock (entrepôts, magasins, centres de fulfillment). Suit le pattern du module auth : schéma Drizzle, service avec IoC, API GraphQL avec codegen, événements lifecycle typés. Deux tables : `stock_locations` et `stock_location_addresses` (1:1).

## 2. Architecture

### Contexte système

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Channel    │     │  Stock Location   │     │  Inventory   │
│ (demand side)│     │  (supply side)    │     │  (futur)     │
└─────────────┘     └──────────────────┘     └─────────────┘
                           │                        │
                     organization_id           location_id FK
                           │                        │
                    ┌──────┴──────┐          ┌──────┴──────┐
                    │    Auth     │          │   Product    │
                    │ (orgs)      │          │   (futur)    │
                    └─────────────┘          └─────────────┘
```

Stock Location est un module de premier niveau. Il dépend uniquement de Auth pour la résolution d'`organization_id`. Les modules futurs (Inventory, Fulfillment) créeront leurs propres FK vers `stock_locations.id`.

### Composants

| Composant | Technologie | Rôle | Dépendances |
|-----------|-------------|------|-------------|
| Schema | Drizzle ORM | Tables stock_locations + addresses | `@czo/kit/db` |
| Relations | Drizzle Relations | Liens 1:1 location ↔ address | `@czo/kit/db` |
| Service | TypeScript | CRUD, validation, events | `@czo/kit/ioc`, `@czo/kit/event-bus` |
| GraphQL | graphql-yoga + codegen | API queries/mutations | `@czo/kit/graphql` |
| Plugin | Nitro plugin | Lifecycle hooks (init/register/boot) | `@czo/kit` |
| Events | Typed events | stockLocation:created/updated/deleted | `@czo/kit/event-bus` |

### Flux de données

```
Client GraphQL
    │
    ▼
Resolver (schema/stock-location/resolvers/)
    │
    ▼
StockLocationService (services/stock-location.service.ts)
    │
    ├──▶ Repository (Drizzle queries)
    │       │
    │       ▼
    │    PostgreSQL (stock_locations + stock_location_addresses)
    │
    └──▶ Event Bus (stockLocation:created, etc.)
```

## 3. Spécification API (GraphQL)

### Types

```graphql
type StockLocation {
  id: ID!
  organizationId: ID!
  handle: String!
  name: String!
  isDefault: Boolean!
  isActive: Boolean!
  metadata: JSON
  address: StockLocationAddress
  createdAt: DateTime!
  updatedAt: DateTime!
}

type StockLocationAddress {
  id: ID!
  addressLine1: String!
  addressLine2: String
  city: String!
  province: String
  postalCode: String
  countryCode: String!
  phone: String
}
```

### Queries

```graphql
extend type Query {
  """Récupérer un emplacement par ID"""
  stockLocation(id: ID!): StockLocation
    @permission(resource: "stock-location", action: "read")

  """Lister les emplacements d'une organisation"""
  stockLocations(
    organizationId: ID
    isActive: Boolean
    first: Int
    after: String
  ): [StockLocation!]!
    @permission(resource: "stock-location", action: "read")
}
```

### Mutations

```graphql
input CreateStockLocationInput {
  name: String!
  handle: String
  addressLine1: String!
  addressLine2: String
  city: String!
  province: String
  postalCode: String
  countryCode: String!
  phone: String
  metadata: JSON
}

input UpdateStockLocationInput {
  name: String
  handle: String
  addressLine1: String
  addressLine2: String
  city: String
  province: String
  postalCode: String
  countryCode: String
  phone: String
  metadata: JSON
}

extend type Mutation {
  """Créer un emplacement de stock"""
  createStockLocation(input: CreateStockLocationInput!): StockLocation!
    @permission(resource: "stock-location", action: "write")

  """Modifier un emplacement de stock"""
  updateStockLocation(id: ID!, input: UpdateStockLocationInput!): StockLocation!
    @permission(resource: "stock-location", action: "write")

  """Supprimer un emplacement (soft delete)"""
  deleteStockLocation(id: ID!): Boolean!
    @permission(resource: "stock-location", action: "delete")

  """Activer/désactiver un emplacement"""
  setStockLocationStatus(id: ID!, isActive: Boolean!): StockLocation!
    @permission(resource: "stock-location", action: "write")

  """Définir l'emplacement par défaut"""
  setDefaultStockLocation(id: ID!): StockLocation!
    @permission(resource: "stock-location", action: "write")
}
```

### Codes d'erreur

| Code | Cas |
|------|-----|
| `STOCK_LOCATION_NOT_FOUND` | ID ou handle inexistant |
| `STOCK_LOCATION_HANDLE_TAKEN` | Handle déjà utilisé dans l'organisation |
| `STOCK_LOCATION_IS_DEFAULT` | Tentative de supprimer ou désactiver l'emplacement par défaut |
| `STOCK_LOCATION_VERSION_CONFLICT` | Conflit d'optimistic locking (version mismatch) |
| `INVALID_COUNTRY_CODE` | Code pays non conforme ISO 3166-1 alpha-2 |

## 4. Design base de données

### Nouvelles tables

#### `stock_locations`

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| id | text | PK | Identifiant unique (cuid2 ou nanoid) |
| organization_id | text | NOT NULL, FK → organizations.id CASCADE | Organisation propriétaire |
| handle | text | NOT NULL | Slug URL-safe, unique par org |
| name | text | NOT NULL | Nom affiché |
| is_default | boolean | NOT NULL, DEFAULT false | Emplacement par défaut de l'org |
| is_active | boolean | NOT NULL, DEFAULT true | Statut actif/inactif |
| metadata | jsonb | | Données extensibles |
| deleted_at | timestamp | | Soft delete |
| version | integer | NOT NULL, DEFAULT 1 | Optimistic locking |
| created_at | timestamp | NOT NULL, DEFAULT now() | Date de création |
| updated_at | timestamp | NOT NULL, DEFAULT now() | Date de dernière modification |

#### `stock_location_addresses`

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| id | text | PK | Identifiant unique |
| stock_location_id | text | NOT NULL, FK → stock_locations.id CASCADE, UNIQUE | Relation 1:1 |
| address_line_1 | text | NOT NULL | Adresse ligne 1 |
| address_line_2 | text | | Adresse ligne 2 |
| city | text | NOT NULL | Ville |
| province | text | | État/province/région |
| postal_code | text | | Code postal |
| country_code | text | NOT NULL | ISO 3166-1 alpha-2 |
| phone | text | | Téléphone |
| created_at | timestamp | NOT NULL, DEFAULT now() | |
| updated_at | timestamp | NOT NULL, DEFAULT now() | |

### Index

```sql
-- Handle unique par org (exclut les soft-deleted)
CREATE UNIQUE INDEX stock_locations_org_handle_idx
  ON stock_locations (organization_id, handle)
  WHERE deleted_at IS NULL;

-- Lookup par organisation
CREATE INDEX stock_locations_organization_id_idx
  ON stock_locations (organization_id);

-- Relation 1:1 (déjà couvert par UNIQUE sur stock_location_id)
```

### Migrations

- Migration initiale : `0001_create_stock_locations.sql`
- Rollback : `DROP TABLE stock_location_addresses; DROP TABLE stock_locations;`
- Les migrations sont générées via `drizzle-kit generate` et appliquées via `drizzle-kit migrate`

## 5. Sécurité

### Authentification
- Toutes les requêtes passent par le middleware auth existant
- Session utilisateur requise (pas d'accès anonyme)

### Autorisation
- Permissions basées sur le système d'access control de `@czo/kit`
- Resource : `stock-location`, actions : `read`, `write`, `delete`
- Toutes les requêtes filtrées par `organization_id` de la session
- Un utilisateur ne peut jamais accéder aux emplacements d'une autre organisation

### Modèle de menaces

| Menace | Mitigation |
|--------|-----------|
| Accès cross-organisation | Filtre `organization_id` sur toutes les queries |
| Injection via handle | Validation regex : `^[a-z0-9]+(?:-[a-z0-9]+)*$` |
| Metadata trop volumineuse | Limite de taille jsonb (ex. 10 KB) |
| Code pays invalide | Validation ISO 3166-1 alpha-2 (set de 249 codes) |

## 6. Événements

### Événements lifecycle

```typescript
// Convention de nommage : stockLocation.domain.action
interface StockLocationEvents {
  'stockLocation.created': {
    id: string
    organizationId: string
    handle: string
    name: string
  }
  'stockLocation.updated': {
    id: string
    organizationId: string
    changes: string[] // champs modifiés
  }
  'stockLocation.statusChanged': {
    id: string
    organizationId: string
    isActive: boolean
  }
  'stockLocation.deleted': {
    id: string
    organizationId: string
    handle: string
  }
  'stockLocation.defaultChanged': {
    id: string
    organizationId: string
    previousDefaultId: string | null
  }
}
```

Les événements sont déclarés via declaration merging sur `EventMap` de `@czo/kit/event-bus`.

## 7. Structure du module

```
packages/modules/stock-location/
├── package.json
├── tsconfig.json
├── codegen.ts
├── drizzle.config.ts
├── migrations/
│   └── 0001_create_stock_locations.sql
├── src/
│   ├── module.ts                          # defineNitroModule
│   ├── types.ts                           # Declaration merging
│   ├── database/
│   │   ├── schema.ts                      # Drizzle tables
│   │   └── relations.ts                   # Drizzle relations
│   ├── events/
│   │   ├── types.ts                       # Event payloads + EventMap
│   │   └── index.ts                       # Export
│   ├── services/
│   │   ├── stock-location.service.ts      # CRUD + business logic
│   │   ├── stock-location.service.test.ts
│   │   └── index.ts
│   ├── graphql/
│   │   ├── context-factory.ts             # registerContextFactory
│   │   ├── index.ts                       # registerResolvers
│   │   ├── __generated__/                 # Codegen output
│   │   └── schema/
│   │       └── stock-location/
│   │           ├── schema.graphql
│   │           └── resolvers/
│   │               ├── StockLocation.ts
│   │               ├── StockLocationAddress.ts
│   │               ├── Query/
│   │               │   ├── stockLocation.ts
│   │               │   ├── stockLocations.ts
│   │               │   └── stockLocations.test.ts
│   │               └── Mutation/
│   │                   ├── createStockLocation.ts
│   │                   ├── createStockLocation.test.ts
│   │                   ├── updateStockLocation.ts
│   │                   ├── deleteStockLocation.ts
│   │                   ├── setStockLocationStatus.ts
│   │                   └── setDefaultStockLocation.ts
│   └── plugins/
│       ├── index.ts                       # Lifecycle hooks
│       └── index.test.ts
```

## 8. Déclarations de types (module augmentation)

```typescript
// src/types.ts

declare module '@czo/kit/db' {
  interface SchemaRegistry {
    stockLocations: typeof import('./database/schema').stockLocations
    stockLocationAddresses: typeof import('./database/schema').stockLocationAddresses
  }
}

declare module '@czo/kit/ioc' {
  interface ContainerBindings {
    'stockLocation:service': ReturnType<typeof import('./services').createStockLocationService>
  }
}

declare module '@czo/kit/graphql' {
  interface GraphQLContextMap {
    stockLocation: {
      service: ContainerBindings['stockLocation:service']
    }
  }
}
```

## 9. Stratégie de test

### Tests unitaires
- **Service** : CRUD operations, validation (handle unique, country code, default location rules), optimistic locking, soft delete
- **Resolvers** : Chaque query/mutation résout correctement via le service mocké
- **Schema** : Validation des inputs Zod (handle format, country code, metadata size)

### Tests d'intégration
- CRUD complet avec base de données réelle
- Contrainte d'unicité handle par organisation
- Comportement soft delete (exclusion des listes, handle réutilisable)
- Emplacement par défaut : un seul par org, non supprimable, non désactivable
- Optimistic locking : conflit de version détecté
- Émission des événements lifecycle

### Couverture cible
- ≥ 80% de couverture sur le service et les resolvers

## 10. Plan d'implémentation

| Phase | Description | Dépendances |
|-------|-------------|-------------|
| Phase 1 | Scaffolding : package.json, module.ts, types.ts, drizzle config | Aucune |
| Phase 2 | Database : schema.ts, relations.ts, migration | Phase 1 |
| Phase 3 | Service : stock-location.service.ts + tests unitaires | Phase 2 |
| Phase 4 | Events : types.ts, émission dans le service | Phase 3 |
| Phase 5 | GraphQL : schema.graphql, codegen, resolvers + tests | Phase 3 |
| Phase 6 | Plugin : lifecycle hooks (init/register/boot) | Phase 3, 5 |
| Phase 7 | Enregistrement dans apps/mazo/nitro.config.ts | Phase 6 |

---

## Annexe

### Questions ouvertes
- [ ] ISO 3166-1 alpha-2 suffit-il ou faut-il supporter alpha-3 ?
- [ ] Taille max du champ metadata (10 KB proposé) — à valider
- [ ] Stratégie de génération d'ID : cuid2 ou nanoid ? (aligner avec auth)

### Références
- Shopify Locations API : https://shopify.dev/docs/api/admin-graphql/current/objects/Location
- Medusa Stock Locations : https://docs.medusajs.com/resources/commerce-modules/stock-location
- PRD : [docs/planning/stock-location/prd.md](./prd.md)
- Brainstorm : [docs/planning/stock-location/brainstorm.md](./brainstorm.md)
