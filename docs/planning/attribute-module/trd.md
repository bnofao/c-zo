# TRD : Module Attribut

**Statut** : Brouillon
**Auteur** : Claude
**Créé le** : 2026-01-30
**Dernière mise à jour** : 2026-01-30
**PRD associé** : [PRD Module Attribut](./prd.md)

---

## 1. Aperçu

Le module Attribut (`@czo/attribute`) implémente un système d'attributs typés et agnostique utilisant une approche hybride : définitions d'attributs centralisées avec tables de valeurs typées, tandis que les modules consommateurs gèrent leurs propres tables de jonction. L'architecture s'inspire du système d'attributs de Saleor tout en l'adaptant aux conventions c-zo (Drizzle ORM, GraphQL Yoga, conteneur IoC).

## 2. Architecture

### Contexte système

```
┌─────────────────────────────────────────────────────────────────┐
│                        c-zo Platform                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   @czo/kit   │    │ @czo/product │    │ @czo/channel │      │
│  │  (core)      │    │ (consumer)   │    │ (consumer)   │      │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘      │
│         │                   │                   │               │
│         ▼                   ▼                   ▼               │
│  ┌──────────────────────────────────────────────────────┐      │
│  │                  @czo/attribute                       │      │
│  │  ┌────────────┐  ┌─────────────┐  ┌───────────────┐  │      │
│  │  │ Attribute  │  │ Attribute   │  │ Typed Value   │  │      │
│  │  │ Service    │  │ Value Svc   │  │ Services      │  │      │
│  │  └────────────┘  └─────────────┘  └───────────────┘  │      │
│  └──────────────────────────────────────────────────────┘      │
│                              │                                  │
│                              ▼                                  │
│  ┌──────────────────────────────────────────────────────┐      │
│  │                    PostgreSQL                         │      │
│  │  attributes | attribute_values | attribute_*_values   │      │
│  └──────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

### Structure du module

```
packages/modules/attribute/
├── src/
│   ├── module.ts                    # defineNitroModule
│   ├── plugins/
│   │   └── index.ts                 # Enregistrement IoC
│   ├── services/
│   │   ├── attribute.service.ts     # CRUD attributs
│   │   ├── attribute-value.service.ts    # Gestion choix DROPDOWN/MULTISELECT
│   │   ├── attribute-swatch.service.ts   # Gestion valeurs SWATCH
│   │   ├── typed-value.service.ts        # Gestion valeurs typées
│   │   └── validation.service.ts         # Validation par type
│   ├── schema/
│   │   ├── attribute/
│   │   │   ├── attribute.gql
│   │   │   ├── resolvers/
│   │   │   │   ├── Query.ts
│   │   │   │   └── Mutation.ts
│   │   ├── attribute-value/
│   │   │   └── ...
│   │   └── types/
│   │       └── enums.gql
│   ├── database/
│   │   ├── schema.ts                # Schéma Drizzle
│   │   └── tables/
│   │       ├── attributes.ts
│   │       ├── attribute-values.ts
│   │       ├── attribute-swatch-values.ts
│   │       └── typed-values/
│   │           ├── text-values.ts
│   │           ├── numeric-values.ts
│   │           ├── boolean-values.ts
│   │           ├── date-values.ts
│   │           ├── file-values.ts
│   │           └── reference-values.ts
│   └── helpers/
│       ├── slug.ts                  # Génération de slugs
│       └── query-builder.ts         # Helpers pour requêtes cross-type
├── migrations/
│   └── 001_initial.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── package.json
└── tsconfig.json
```

### Flux de données

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   GraphQL   │────▶│   Service   │────▶│   Drizzle   │
│   Resolver  │     │   Layer     │     │   Query     │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       │                   │                   ▼
       │                   │            ┌─────────────┐
       │                   │            │  PostgreSQL │
       │                   │            └─────────────┘
       │                   │                   │
       │                   ▼                   │
       │            ┌─────────────┐            │
       │            │ Validation  │◀───────────┘
       │            │  Service    │
       │            └─────────────┘
       │                   │
       ▼                   ▼
┌─────────────────────────────────┐
│        GraphQL Response         │
└─────────────────────────────────┘
```

### Composants

| Composant | Technologie | Objectif | Dépendances |
|-----------|-------------|----------|-------------|
| API GraphQL | GraphQL Yoga | Exposition des opérations CRUD | @czo/kit |
| Services | TypeScript | Logique métier et validation | Drizzle ORM |
| Base de données | PostgreSQL 17 | Persistance des données | - |
| Conteneur IoC | @adonisjs/fold | Injection de dépendances | @czo/kit |

## 3. Spécification API GraphQL

### Types

```graphql
enum AttributeType {
  DROPDOWN
  MULTISELECT
  PLAIN_TEXT
  RICH_TEXT
  NUMERIC
  BOOLEAN
  FILE
  REFERENCE
  SWATCH
  DATE
  DATE_TIME
}

type Attribute {
  id: ID!
  name: String!
  slug: String!
  type: AttributeType!
  referenceEntity: String
  unit: String
  isRequired: Boolean!
  isFilterable: Boolean!
  metadata: JSON
  version: Int!
  createdAt: DateTime!
  updatedAt: DateTime!

  # Relations
  values: [AttributeValue!]! # Pour DROPDOWN/MULTISELECT
  swatchValues: [AttributeSwatchValue!]! # Pour SWATCH
}

type AttributeValue {
  id: ID!
  attributeId: ID!
  value: String!
  position: Int!
  metadata: JSON
  createdAt: DateTime!
  updatedAt: DateTime!
}

type AttributeSwatchValue {
  id: ID!
  attributeId: ID!
  value: String!
  color: String
  imageUrl: String
  position: Int!
  metadata: JSON
  createdAt: DateTime!
  updatedAt: DateTime!
}

# Valeurs typées (utilisées par les consommateurs)
type AttributeTextValue {
  id: ID!
  attributeId: ID!
  value: String!
  createdAt: DateTime!
  updatedAt: DateTime!
}

type AttributeNumericValue {
  id: ID!
  attributeId: ID!
  value: Float!
  createdAt: DateTime!
  updatedAt: DateTime!
}

type AttributeBooleanValue {
  id: ID!
  attributeId: ID!
  value: Boolean!
  createdAt: DateTime!
  updatedAt: DateTime!
}

type AttributeDateValue {
  id: ID!
  attributeId: ID!
  value: DateTime!
  createdAt: DateTime!
  updatedAt: DateTime!
}

type AttributeFileValue {
  id: ID!
  attributeId: ID!
  value: String! # URL du fichier
  createdAt: DateTime!
  updatedAt: DateTime!
}

type AttributeReferenceValue {
  id: ID!
  attributeId: ID!
  value: ID! # ID de l'entité référencée
  createdAt: DateTime!
  updatedAt: DateTime!
}
```

### Requêtes

```graphql
type Query {
  # Récupérer un attribut par ID ou slug
  attribute(id: ID, slug: String): Attribute

  # Lister les attributs avec filtrage et pagination
  attributes(
    filter: AttributeFilterInput
    first: Int
    after: String
    orderBy: AttributeOrderByInput
  ): AttributeConnection!

  # Récupérer les valeurs d'un attribut DROPDOWN/MULTISELECT
  attributeValues(
    attributeId: ID!
    first: Int
    after: String
  ): AttributeValueConnection!

  # Récupérer les valeurs swatch d'un attribut
  attributeSwatchValues(
    attributeId: ID!
    first: Int
    after: String
  ): AttributeSwatchValueConnection!
}

input AttributeFilterInput {
  type: [AttributeType!]
  isFilterable: Boolean
  isRequired: Boolean
  search: String # Recherche sur name et slug
}

input AttributeOrderByInput {
  field: AttributeOrderField!
  direction: OrderDirection!
}

enum AttributeOrderField {
  NAME
  CREATED_AT
  UPDATED_AT
}
```

### Mutations

```graphql
type Mutation {
  # === Gestion des attributs ===

  createAttribute(input: CreateAttributeInput!): AttributePayload!
  updateAttribute(id: ID!, input: UpdateAttributeInput!): AttributePayload!
  deleteAttribute(id: ID!): DeletePayload!

  # === Gestion des valeurs DROPDOWN/MULTISELECT ===

  createAttributeValue(input: CreateAttributeValueInput!): AttributeValuePayload!
  updateAttributeValue(id: ID!, input: UpdateAttributeValueInput!): AttributeValuePayload!
  deleteAttributeValue(id: ID!): DeletePayload!
  reorderAttributeValues(attributeId: ID!, valueIds: [ID!]!): AttributeValueReorderPayload!

  # === Gestion des valeurs SWATCH ===

  createAttributeSwatchValue(input: CreateAttributeSwatchValueInput!): AttributeSwatchValuePayload!
  updateAttributeSwatchValue(id: ID!, input: UpdateAttributeSwatchValueInput!): AttributeSwatchValuePayload!
  deleteAttributeSwatchValue(id: ID!): DeletePayload!
  reorderAttributeSwatchValues(attributeId: ID!, valueIds: [ID!]!): AttributeSwatchValueReorderPayload!

  # === Gestion des valeurs typées ===

  createTypedValue(input: CreateTypedValueInput!): TypedValuePayload!
  updateTypedValue(id: ID!, input: UpdateTypedValueInput!): TypedValuePayload!
  deleteTypedValue(id: ID!, type: AttributeType!): DeletePayload!
}

input CreateAttributeInput {
  name: String!
  slug: String # Auto-généré si non fourni
  type: AttributeType!
  referenceEntity: String # Requis pour REFERENCE
  unit: String # Pour NUMERIC
  isRequired: Boolean = false
  isFilterable: Boolean = false
  metadata: JSON
}

input UpdateAttributeInput {
  name: String
  isRequired: Boolean
  isFilterable: Boolean
  unit: String
  metadata: JSON
  version: Int! # Pour verrouillage optimiste
}

input CreateAttributeValueInput {
  attributeId: ID!
  value: String!
  position: Int # Auto-calculé si non fourni
  metadata: JSON
}

input UpdateAttributeValueInput {
  value: String
  metadata: JSON
}

input CreateAttributeSwatchValueInput {
  attributeId: ID!
  value: String!
  color: String # Format hex #RRGGBB
  imageUrl: String
  position: Int
  metadata: JSON
}

input UpdateAttributeSwatchValueInput {
  value: String
  color: String
  imageUrl: String
  metadata: JSON
}

input CreateTypedValueInput {
  attributeId: ID!
  type: AttributeType!
  # Union discriminée par type
  textValue: String
  numericValue: Float
  booleanValue: Boolean
  dateValue: DateTime
  fileValue: String # URL
  referenceValue: ID
}

input UpdateTypedValueInput {
  type: AttributeType!
  textValue: String
  numericValue: Float
  booleanValue: Boolean
  dateValue: DateTime
  fileValue: String
  referenceValue: ID
}
```

### Codes d'erreur

| Code | Description | Quand |
|------|-------------|-------|
| `ATTRIBUTE_NOT_FOUND` | Attribut inexistant | ID ou slug invalide |
| `ATTRIBUTE_SLUG_EXISTS` | Slug déjà utilisé | Création avec slug dupliqué |
| `ATTRIBUTE_TYPE_IMMUTABLE` | Type non modifiable | Tentative de changer le type |
| `ATTRIBUTE_VALUE_NOT_FOUND` | Valeur inexistante | ID de valeur invalide |
| `VALIDATION_ERROR` | Erreur de validation | Données invalides selon le type |
| `VERSION_CONFLICT` | Conflit de version | Verrouillage optimiste échoué |
| `SWATCH_REQUIRES_COLOR_OR_IMAGE` | Swatch incomplet | Ni couleur ni image fournie |
| `REFERENCE_ENTITY_REQUIRED` | Entité référencée manquante | REFERENCE sans referenceEntity |

## 4. Conception base de données

### Table : `attributes`

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Identifiant unique |
| name | VARCHAR(255) | NOT NULL | Nom d'affichage |
| slug | VARCHAR(255) | NOT NULL, UNIQUE | Identifiant URL-safe |
| type | attribute_type_enum | NOT NULL | Type d'attribut |
| reference_entity | VARCHAR(100) | NULL | Type d'entité pour REFERENCE |
| unit | VARCHAR(50) | NULL | Unité pour NUMERIC |
| is_required | BOOLEAN | NOT NULL DEFAULT FALSE | Valeur obligatoire |
| is_filterable | BOOLEAN | NOT NULL DEFAULT FALSE | Utilisé dans les filtres |
| metadata | JSONB | NULL | Configuration additionnelle |
| deleted_at | TIMESTAMPTZ | NULL | Soft delete |
| version | INTEGER | NOT NULL DEFAULT 1 | Verrouillage optimiste |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | Date de création |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | Date de modification |

```sql
CREATE TYPE attribute_type_enum AS ENUM (
  'DROPDOWN', 'MULTISELECT', 'PLAIN_TEXT', 'RICH_TEXT',
  'NUMERIC', 'BOOLEAN', 'FILE', 'REFERENCE', 'SWATCH',
  'DATE', 'DATE_TIME'
);

CREATE TABLE attributes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  type attribute_type_enum NOT NULL,
  reference_entity VARCHAR(100),
  unit VARCHAR(50),
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  is_filterable BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB,
  deleted_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_reference_entity CHECK (
    (type = 'REFERENCE' AND reference_entity IS NOT NULL) OR
    (type != 'REFERENCE' AND reference_entity IS NULL)
  )
);
```

### Table : `attribute_values`

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| id | UUID | PK | Identifiant unique |
| attribute_id | UUID | FK NOT NULL | Référence à attributes |
| value | VARCHAR(255) | NOT NULL | Valeur du choix |
| position | INTEGER | NOT NULL DEFAULT 0 | Ordre d'affichage |
| metadata | JSONB | NULL | Données additionnelles |
| created_at | TIMESTAMPTZ | NOT NULL | Date de création |
| updated_at | TIMESTAMPTZ | NOT NULL | Date de modification |

```sql
CREATE TABLE attribute_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_id UUID NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
  value VARCHAR(255) NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_attribute_value UNIQUE (attribute_id, value)
);

CREATE INDEX idx_attribute_values_attribute_id ON attribute_values(attribute_id);
CREATE INDEX idx_attribute_values_position ON attribute_values(attribute_id, position);
```

### Table : `attribute_swatch_values`

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| id | UUID | PK | Identifiant unique |
| attribute_id | UUID | FK NOT NULL | Référence à attributes |
| value | VARCHAR(255) | NOT NULL | Libellé du swatch |
| color | VARCHAR(7) | NULL | Couleur hex (#RRGGBB) |
| image_url | VARCHAR(500) | NULL | URL de l'image |
| position | INTEGER | NOT NULL | Ordre d'affichage |
| metadata | JSONB | NULL | Données additionnelles |
| created_at | TIMESTAMPTZ | NOT NULL | Date de création |
| updated_at | TIMESTAMPTZ | NOT NULL | Date de modification |

```sql
CREATE TABLE attribute_swatch_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_id UUID NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
  value VARCHAR(255) NOT NULL,
  color VARCHAR(7),
  image_url VARCHAR(500),
  position INTEGER NOT NULL DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_swatch_has_visual CHECK (color IS NOT NULL OR image_url IS NOT NULL),
  CONSTRAINT uq_swatch_value UNIQUE (attribute_id, value)
);

CREATE INDEX idx_swatch_values_attribute_id ON attribute_swatch_values(attribute_id);
```

### Tables de valeurs typées

#### `attribute_text_values`

```sql
CREATE TABLE attribute_text_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_id UUID NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_text_values_attribute_id ON attribute_text_values(attribute_id);
```

#### `attribute_numeric_values`

```sql
CREATE TABLE attribute_numeric_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_id UUID NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
  value NUMERIC(20, 6) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_numeric_values_attribute_id ON attribute_numeric_values(attribute_id);
CREATE INDEX idx_numeric_values_value ON attribute_numeric_values(attribute_id, value);
```

#### `attribute_boolean_values`

```sql
CREATE TABLE attribute_boolean_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_id UUID NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
  value BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_boolean_values_attribute_id ON attribute_boolean_values(attribute_id);
```

#### `attribute_date_values`

```sql
CREATE TABLE attribute_date_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_id UUID NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
  value TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_date_values_attribute_id ON attribute_date_values(attribute_id);
CREATE INDEX idx_date_values_value ON attribute_date_values(attribute_id, value);
```

#### `attribute_file_values`

```sql
CREATE TABLE attribute_file_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_id UUID NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
  value VARCHAR(2048) NOT NULL, -- URL du fichier
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_file_values_attribute_id ON attribute_file_values(attribute_id);
```

#### `attribute_reference_values`

```sql
CREATE TABLE attribute_reference_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_id UUID NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
  value UUID NOT NULL, -- ID de l'entité référencée
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reference_values_attribute_id ON attribute_reference_values(attribute_id);
CREATE INDEX idx_reference_values_value ON attribute_reference_values(value);
```

### Stratégie de migration

1. **Migration 001** : Création du type enum et de la table `attributes`
2. **Migration 002** : Création de `attribute_values` et `attribute_swatch_values`
3. **Migration 003** : Création des tables de valeurs typées

**Plan de rollback** : Chaque migration inclut une fonction `down()` pour annuler les changements. Les migrations sont versionnées et peuvent être annulées individuellement.

### Index

| Table | Index | Type | Objectif |
|-------|-------|------|----------|
| attributes | idx_attributes_slug | UNIQUE | Recherche par slug |
| attributes | idx_attributes_type | BTREE | Filtrage par type |
| attributes | idx_attributes_filterable | BTREE | Requêtes facettes |
| attribute_values | idx_attribute_values_position | BTREE | Ordonnancement |
| attribute_numeric_values | idx_numeric_values_value | BTREE | Filtrage par plage |
| attribute_date_values | idx_date_values_value | BTREE | Filtrage par date |

## 5. Sécurité

### Authentification
- Les opérations d'écriture (mutations) nécessitent une authentification
- Les opérations de lecture sont publiques (configurables via middleware)

### Autorisation
- Pas de permissions granulaires par attribut dans le MVP
- Contrôle d'accès au niveau organisation (futur multi-tenancy)

### Protection des données
- Validation des slugs : caractères alphanumériques, tirets, underscores uniquement
- Validation des URLs : protocoles HTTP/HTTPS uniquement pour les fichiers et images
- Sanitization des métadonnées JSON
- Pas de données sensibles stockées dans les attributs

### Modèle de menaces
| Menace | Mitigation |
|--------|------------|
| Injection SQL | Requêtes paramétrées via Drizzle ORM |
| Injection dans les slugs | Regex de validation `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` |
| URLs malveillantes | Validation de protocole et de domaine |
| Déni de service | Limite de taille sur metadata (100KB) |

## 6. Performance

### Exigences
- Latence API : < 100ms p95 pour les requêtes simples
- Latence API : < 300ms p95 pour les listes paginées
- Débit : Support de 500 req/sec sur les opérations de lecture

### Stratégie de mise à l'échelle
- Index optimisés pour les requêtes fréquentes
- Pagination cursor-based (pas d'OFFSET)
- Lazy loading des relations (values, swatchValues)

### Mise en cache
- Cache applicatif pour les attributs fréquemment accédés (via @czo/kit)
- Invalidation sur mutation
- TTL recommandé : 5 minutes pour les listes, 15 minutes pour les détails

## 7. Observabilité

### Journalisation
- Création/modification/suppression d'attributs
- Erreurs de validation avec contexte
- Conflits de version (verrouillage optimiste)

### Métriques
- `attribute_operations_total` : Compteur par opération (create, update, delete)
- `attribute_query_duration_seconds` : Histogramme des temps de réponse
- `attribute_validation_errors_total` : Compteur des erreurs de validation par type

### Alertes
| Condition | Seuil | Action |
|-----------|-------|--------|
| Erreur rate > 5% | 5 min | Notification équipe dev |
| Latence p95 > 500ms | 10 min | Vérifier charge DB |
| Conflits version > 10/min | 5 min | Analyser patterns d'accès |

## 8. Dépendances

### Packages
| Package | Version | Objectif |
|---------|---------|----------|
| drizzle-orm | catalog | Requêtes typées PostgreSQL |
| graphql-yoga | catalog | Serveur GraphQL |
| @adonisjs/fold | catalog | Conteneur IoC |
| zod | catalog | Validation des entrées |
| slugify | ^1.6.0 | Génération de slugs |

### Infrastructure
- PostgreSQL 17 (via docker-compose.dev.yml)
- Pas de services externes requis pour le MVP

## 9. Stratégie de test

### Tests unitaires
- Services : AttributeService, ValidationService
- Helpers : génération de slugs, validation par type
- Couverture cible : 80%

### Tests d'intégration
- CRUD complet sur les attributs
- Gestion des valeurs par type
- Verrouillage optimiste
- Validation des contraintes de base de données

### Tests de charge
- Benchmark des requêtes de liste avec 10K attributs
- Test de concurrence pour le verrouillage optimiste

## 10. Plan de déploiement

### Feature flags
- Pas de feature flag requis (nouveau module isolé)

### Étapes de déploiement
1. Exécuter les migrations en staging
2. Déployer le module en staging, valider les tests d'intégration
3. Exécuter les migrations en production (maintenance window courte)
4. Déployer le module en production
5. Valider les health checks

### Plan de rollback
1. Annuler le déploiement du module
2. Rollback des migrations si nécessaire (down migrations)
3. Les consommateurs continuent de fonctionner (pas de dépendance forte)

---

## Annexe

### Questions ouvertes
- [x] Toutes les questions résolues dans le brainstorm

### ADRs (Architecture Decision Records)
- ADR-001 : Choix de l'approche hybride (typed values + consumer junction tables)
- ADR-002 : Séparation SWATCH dans sa propre table

### Références
- [PRD Module Attribut](./prd.md)
- [Brainstorm Module Attribut](./brainstorm.md)
- [Saleor Attributes API](https://docs.saleor.io/developer/attributes/api)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [GraphQL Yoga Documentation](https://the-guild.dev/graphql/yoga-server)
