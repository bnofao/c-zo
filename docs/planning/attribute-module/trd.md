# TRD : Module Attribut

- **Statut** : Brouillon
- **Auteur** : Claude
- **Créé le** : 2026-01-30
- **Dernière mise à jour** : 2026-01-30
- **PRD associé** : [PRD Module Attribut](./prd.md)

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

# Enum extensible - valeurs initiales pour le MVP
# De nouvelles unités peuvent être ajoutées via migration
enum AttributeUnit {
  # Masse
  KILOGRAM    # kg
  GRAM        # g
  POUND       # lb
  OUNCE       # oz

  # Longueur
  METER       # m
  CENTIMETER  # cm
  MILLIMETER  # mm
  INCH        # in
  FOOT        # ft

  # Volume
  LITER       # L
  MILLILITER  # mL
  GALLON      # gal

  # Surface
  SQUARE_METER      # m²
  SQUARE_CENTIMETER # cm²

  # Autres
  PIECE       # pièce/unité
  PERCENT     # %
}

# Type partagé pour les fichiers (utilisé par SWATCH et FILE)
type FileInfo {
  url: String!               # URL du fichier
  mimetype: String!          # Type MIME (image/png, application/pdf, etc.)
}

input FileInfoInput {
  url: String!
  mimetype: String!
}

type Attribute {
  id: ID!
  name: String!
  slug: String!
  type: AttributeType!
  referenceEntity: String
  unit: AttributeUnit          # Enum extensible, null si non NUMERIC
  isRequired: Boolean!
  isFilterable: Boolean!
  externalSource: String       # Identifiant du système externe (ERP, PIM, etc.)
  externalId: String           # ID dans le système externe
  metadata: JSON
  version: Int!
  createdAt: DateTime!
  updatedAt: DateTime!

  # Sous-requête unifiée pour les valeurs prédéfinies
  # Retourne AttributeValue (DROPDOWN/MULTISELECT) ou AttributeSwatchValue (SWATCH)
  # Retourne une connexion vide pour les autres types
  values(
    where: AttributeChoiceWhereInput
    search: String                  # Recherche rapide sur slug et value
    orderBy: AttributeChoiceOrderByInput
    first: Int
    after: String
  ): AttributeChoiceConnection!
}

# Union pour les valeurs prédéfinies (choix)
# DROPDOWN/MULTISELECT → AttributeValue
# SWATCH → AttributeSwatchValue
# REFERENCE → AttributeReferenceValue
union AttributeChoice = AttributeValue | AttributeSwatchValue | AttributeReferenceValue

type AttributeChoiceConnection {
  edges: [AttributeChoiceEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type AttributeChoiceEdge {
  node: AttributeChoice!
  cursor: String!
}

input AttributeChoiceOrderByInput {
  field: AttributeChoiceOrderField!
  direction: OrderDirection!
}

enum AttributeChoiceOrderField {
  POSITION
  VALUE
  SLUG
  CREATED_AT
}

type AttributeValue {
  id: ID!
  attributeId: ID!
  slug: String!              # Clé unique par attribut, auto-générée si non fournie
  value: String!             # Libellé d'affichage
  position: Int!
  externalSource: String     # Identifiant du système externe
  externalId: String         # ID dans le système externe
  createdAt: DateTime!
  updatedAt: DateTime!
}

type AttributeSwatchValue {
  id: ID!
  attributeId: ID!
  slug: String!              # Clé unique par attribut, auto-générée si non fournie
  value: String!             # Libellé d'affichage
  color: String              # Couleur hex (#RRGGBB), optionnel
  file: FileInfo             # Fichier (image, pattern, etc.), optionnel
  position: Int!
  externalSource: String     # Identifiant du système externe
  externalId: String         # ID dans le système externe
  createdAt: DateTime!
  updatedAt: DateTime!
}

# Valeurs typées (utilisées par les consommateurs)
type AttributeTextValue {
  id: ID!
  attributeId: ID!
  plain: String!             # Texte brut (toujours renseigné)
  rich: JSON                 # Texte structuré JSON (RICH_TEXT uniquement, null pour PLAIN_TEXT)
  externalSource: String
  externalId: String
  createdAt: DateTime!
  updatedAt: DateTime!
}

type AttributeNumericValue {
  id: ID!
  attributeId: ID!
  value: Float!
  externalSource: String
  externalId: String
  createdAt: DateTime!
  updatedAt: DateTime!
}

type AttributeBooleanValue {
  id: ID!
  attributeId: ID!
  value: Boolean!
  externalSource: String
  externalId: String
  createdAt: DateTime!
  updatedAt: DateTime!
}

type AttributeDateValue {
  id: ID!
  attributeId: ID!
  value: DateTime!
  externalSource: String
  externalId: String
  createdAt: DateTime!
  updatedAt: DateTime!
}

type AttributeFileValue {
  id: ID!
  attributeId: ID!
  file: FileInfo!            # Fichier requis (URL + mimetype)
  externalSource: String
  externalId: String
  createdAt: DateTime!
  updatedAt: DateTime!
}

type AttributeReferenceValue {
  id: ID!
  attributeId: ID!
  slug: String!              # Clé unique par attribut, auto-générée depuis value
  value: String!             # Libellé d'affichage (ex: nom de l'entité référencée)
  referenceId: ID!           # ID de l'entité référencée (unique par attribut)
  position: Int!             # Ordre d'affichage
  externalSource: String     # Identifiant du système externe
  externalId: String         # ID dans le système externe
  createdAt: DateTime!
  updatedAt: DateTime!
}

# === Types de pagination (Relay-style) ===

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}

type AttributeConnection {
  edges: [AttributeEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type AttributeEdge {
  node: Attribute!
  cursor: String!
}

# Note: AttributeValueConnection et AttributeSwatchValueConnection sont
# remplacés par AttributeChoiceConnection (union type) défini sur Attribute.values()

# === Types de réponse (Payloads) ===

interface MutationPayload {
  success: Boolean!
  errors: [UserError!]!
}

type UserError {
  field: String
  code: String!
  message: String!
}

type AttributePayload implements MutationPayload {
  success: Boolean!
  errors: [UserError!]!
  attribute: Attribute
}

type AttributeValuePayload implements MutationPayload {
  success: Boolean!
  errors: [UserError!]!
  attributeValue: AttributeValue
}

type AttributeSwatchValuePayload implements MutationPayload {
  success: Boolean!
  errors: [UserError!]!
  attributeSwatchValue: AttributeSwatchValue
}

type AttributeValueReorderPayload implements MutationPayload {
  success: Boolean!
  errors: [UserError!]!
  attributeValues: [AttributeValue!]
}

type AttributeSwatchValueReorderPayload implements MutationPayload {
  success: Boolean!
  errors: [UserError!]!
  attributeSwatchValues: [AttributeSwatchValue!]
}

type AttributeReferenceValuePayload implements MutationPayload {
  success: Boolean!
  errors: [UserError!]!
  attributeReferenceValue: AttributeReferenceValue
}

type AttributeReferenceValueReorderPayload implements MutationPayload {
  success: Boolean!
  errors: [UserError!]!
  attributeReferenceValues: [AttributeReferenceValue!]
}

type AttributeTextValuePayload implements MutationPayload {
  success: Boolean!
  errors: [UserError!]!
  attributeTextValue: AttributeTextValue
}

type AttributeNumericValuePayload implements MutationPayload {
  success: Boolean!
  errors: [UserError!]!
  attributeNumericValue: AttributeNumericValue
}

type AttributeBooleanValuePayload implements MutationPayload {
  success: Boolean!
  errors: [UserError!]!
  attributeBooleanValue: AttributeBooleanValue
}

type AttributeDateValuePayload implements MutationPayload {
  success: Boolean!
  errors: [UserError!]!
  attributeDateValue: AttributeDateValue
}

type AttributeFileValuePayload implements MutationPayload {
  success: Boolean!
  errors: [UserError!]!
  attributeFileValue: AttributeFileValue
}

type DeletePayload implements MutationPayload {
  success: Boolean!
  errors: [UserError!]!
  deletedId: ID
}

# === Enums additionnels ===

enum OrderDirection {
  ASC
  DESC
}
```

### Requêtes

```graphql
type Query {
  # Récupérer un attribut par ID ou slug
  attribute(id: ID, slug: String): Attribute

  # Lister les attributs avec filtrage avancé et pagination
  attributes(
    where: AttributeWhereInput
    search: String                  # Recherche rapide sur name et slug
    first: Int
    after: String
    orderBy: AttributeOrderByInput
  ): AttributeConnection!
}

# === Exemples de requêtes avec filtrage avancé ===
#
# Recherche simple :
#   attributes(search: "coul") { ... }
#
# Filtrage par type :
#   attributes(where: { type: { in: [DROPDOWN, MULTISELECT] } }) { ... }
#
# Filtrage composite avec AND :
#   attributes(where: {
#     AND: [
#       { isFilterable: true }
#       { type: { eq: DROPDOWN } }
#       { name: { contains: "color" } }
#     ]
#   }) { ... }
#
# Filtrage avec OR :
#   attributes(where: {
#     OR: [
#       { slug: { eq: "color" } }
#       { slug: { eq: "size" } }
#     ]
#   }) { ... }
#
# Filtrage avec NOT :
#   attributes(where: {
#     NOT: { type: { eq: BOOLEAN } }
#   }) { ... }
#
# Filtrage sur metadata :
#   attributes(where: {
#     metadata: [{ key: "category", value: "technical" }]
#   }) { ... }
#
# Sous-requête values() avec filtre :
#   attribute(slug: "color") {
#     values(
#       where: { hasColor: true }
#       orderBy: { field: POSITION, direction: ASC }
#     ) {
#       edges {
#         node {
#           ... on AttributeSwatchValue { slug value color }
#         }
#       }
#     }
#   }

# === Système de filtrage avancé ===

# Filtre principal pour les attributs
input AttributeWhereInput {
  # Filtres par identifiants
  ids: [ID!]

  # Filtres textuels
  name: StringFilterInput
  slug: StringFilterInput

  # Filtres enum
  type: AttributeTypeFilterInput
  unit: AttributeUnitFilterInput

  # Filtres booléens
  isRequired: Boolean
  isFilterable: Boolean

  # Filtre sur les choix (values/swatches)
  withChoices: Boolean              # true = a des valeurs prédéfinies

  # Filtre sur metadata JSONB
  metadata: [MetadataFilterInput!]

  # Opérateurs composites (récursifs)
  AND: [AttributeWhereInput!]
  OR: [AttributeWhereInput!]
  NOT: AttributeWhereInput
}

# Filtre pour les chaînes de caractères
input StringFilterInput {
  eq: String                        # Égalité exacte
  ne: String                        # Différent de
  in: [String!]                     # Dans la liste
  notIn: [String!]                  # Pas dans la liste
  contains: String                  # Contient (ILIKE %value%)
  notContains: String               # Ne contient pas
  startsWith: String                # Commence par (LIKE value%)
  endsWith: String                  # Finit par (LIKE %value)
  isEmpty: Boolean                  # Est vide ou null
}

# Filtre pour les enums AttributeType
input AttributeTypeFilterInput {
  eq: AttributeType
  ne: AttributeType
  in: [AttributeType!]
  notIn: [AttributeType!]
}

# Filtre pour les enums AttributeUnit
input AttributeUnitFilterInput {
  eq: AttributeUnit
  ne: AttributeUnit
  in: [AttributeUnit!]
  notIn: [AttributeUnit!]
  isNull: Boolean                   # Pour filtrer les attributs sans unité
}

# Filtre sur les métadonnées JSONB
input MetadataFilterInput {
  key: String!                      # Clé à rechercher
  value: String                     # Valeur exacte (optionnel)
}

# Filtre pour les valeurs d'attribut (sous-requête values())
input AttributeChoiceWhereInput {
  slug: StringFilterInput
  value: StringFilterInput

  # Pour SWATCH uniquement
  hasColor: Boolean
  hasFile: Boolean

  AND: [AttributeChoiceWhereInput!]
  OR: [AttributeChoiceWhereInput!]
}

input AttributeOrderByInput {
  field: AttributeOrderField!
  direction: OrderDirection!
}

enum AttributeOrderField {
  NAME
  SLUG
  TYPE
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

  # === Gestion des valeurs REFERENCE ===

  createAttributeReferenceValue(input: CreateAttributeReferenceValueInput!): AttributeReferenceValuePayload!
  updateAttributeReferenceValue(id: ID!, input: UpdateAttributeReferenceValueInput!): AttributeReferenceValuePayload!
  deleteAttributeReferenceValue(id: ID!): DeletePayload!
  reorderAttributeReferenceValues(attributeId: ID!, valueIds: [ID!]!): AttributeReferenceValueReorderPayload!

  # === Gestion des valeurs TEXT (PLAIN_TEXT, RICH_TEXT) ===

  createAttributeTextValue(input: CreateAttributeTextValueInput!): AttributeTextValuePayload!
  updateAttributeTextValue(id: ID!, input: UpdateAttributeTextValueInput!): AttributeTextValuePayload!
  deleteAttributeTextValue(id: ID!): DeletePayload!

  # === Gestion des valeurs NUMERIC ===

  createAttributeNumericValue(input: CreateAttributeNumericValueInput!): AttributeNumericValuePayload!
  updateAttributeNumericValue(id: ID!, input: UpdateAttributeNumericValueInput!): AttributeNumericValuePayload!
  deleteAttributeNumericValue(id: ID!): DeletePayload!

  # === Gestion des valeurs BOOLEAN ===

  createAttributeBooleanValue(input: CreateAttributeBooleanValueInput!): AttributeBooleanValuePayload!
  updateAttributeBooleanValue(id: ID!, input: UpdateAttributeBooleanValueInput!): AttributeBooleanValuePayload!
  deleteAttributeBooleanValue(id: ID!): DeletePayload!

  # === Gestion des valeurs DATE (DATE, DATE_TIME) ===

  createAttributeDateValue(input: CreateAttributeDateValueInput!): AttributeDateValuePayload!
  updateAttributeDateValue(id: ID!, input: UpdateAttributeDateValueInput!): AttributeDateValuePayload!
  deleteAttributeDateValue(id: ID!): DeletePayload!

  # === Gestion des valeurs FILE ===

  createAttributeFileValue(input: CreateAttributeFileValueInput!): AttributeFileValuePayload!
  updateAttributeFileValue(id: ID!, input: UpdateAttributeFileValueInput!): AttributeFileValuePayload!
  deleteAttributeFileValue(id: ID!): DeletePayload!
}

input CreateAttributeInput {
  name: String!
  slug: String # Auto-généré si non fourni
  type: AttributeType!
  referenceEntity: String # Requis pour REFERENCE
  unit: AttributeUnit # Pour NUMERIC, enum extensible
  isRequired: Boolean = false
  isFilterable: Boolean = false
  externalSource: String # Identifiant du système externe
  externalId: String # ID dans le système externe
  metadata: JSON
}

input UpdateAttributeInput {
  name: String
  isRequired: Boolean
  isFilterable: Boolean
  unit: AttributeUnit
  externalSource: String
  externalId: String
  metadata: JSON
  version: Int! # Pour verrouillage optimiste
}

input CreateAttributeValueInput {
  attributeId: ID!
  slug: String               # Auto-généré à partir de value si non fourni
  value: String!             # Libellé d'affichage
  position: Int              # Auto-calculé si non fourni
  externalSource: String     # Identifiant du système externe
  externalId: String         # ID dans le système externe
}

input UpdateAttributeValueInput {
  slug: String               # Peut être modifié (vérifie unicité)
  value: String              # Libellé d'affichage
  externalSource: String
  externalId: String
}

input CreateAttributeSwatchValueInput {
  attributeId: ID!
  slug: String               # Auto-généré à partir de value si non fourni
  value: String!             # Libellé d'affichage
  color: String              # Format hex #RRGGBB, optionnel
  file: FileInfoInput        # Fichier (image, pattern), optionnel
  position: Int              # Auto-calculé si non fourni
  externalSource: String     # Identifiant du système externe
  externalId: String         # ID dans le système externe
}

input UpdateAttributeSwatchValueInput {
  slug: String               # Peut être modifié (vérifie unicité)
  value: String              # Libellé d'affichage
  color: String              # Format hex #RRGGBB
  file: FileInfoInput        # Fichier (image, pattern)
  externalSource: String
  externalId: String
}

input CreateAttributeReferenceValueInput {
  attributeId: ID!
  slug: String               # Auto-généré à partir de value si non fourni
  value: String!             # Libellé d'affichage (nom de l'entité)
  referenceId: ID!           # ID de l'entité référencée
  position: Int              # Auto-calculé si non fourni
  externalSource: String     # Identifiant du système externe
  externalId: String         # ID dans le système externe
}

input UpdateAttributeReferenceValueInput {
  slug: String               # Peut être modifié (vérifie unicité)
  value: String              # Libellé d'affichage
  referenceId: ID            # Peut être modifié (vérifie unicité)
  externalSource: String
  externalId: String
}

# === Inputs pour valeurs TEXT ===

input CreateAttributeTextValueInput {
  attributeId: ID!
  plain: String!               # Texte brut (requis)
  rich: JSON                   # Texte structuré JSON (requis pour RICH_TEXT, null pour PLAIN_TEXT)
  externalSource: String
  externalId: String
}

input UpdateAttributeTextValueInput {
  plain: String
  rich: JSON
  externalSource: String
  externalId: String
}

# === Inputs pour valeurs NUMERIC ===

input CreateAttributeNumericValueInput {
  attributeId: ID!
  value: Float!
  externalSource: String
  externalId: String
}

input UpdateAttributeNumericValueInput {
  value: Float
  externalSource: String
  externalId: String
}

# === Inputs pour valeurs BOOLEAN ===

input CreateAttributeBooleanValueInput {
  attributeId: ID!
  value: Boolean!
  externalSource: String
  externalId: String
}

input UpdateAttributeBooleanValueInput {
  value: Boolean
  externalSource: String
  externalId: String
}

# === Inputs pour valeurs DATE ===

input CreateAttributeDateValueInput {
  attributeId: ID!
  value: DateTime!
  externalSource: String
  externalId: String
}

input UpdateAttributeDateValueInput {
  value: DateTime
  externalSource: String
  externalId: String
}

# === Inputs pour valeurs FILE ===

input CreateAttributeFileValueInput {
  attributeId: ID!
  file: FileInfoInput!         # URL + mimetype (requis)
  externalSource: String
  externalId: String
}

input UpdateAttributeFileValueInput {
  file: FileInfoInput
  externalSource: String
  externalId: String
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
| `SWATCH_REQUIRES_COLOR_OR_FILE` | Swatch incomplet | Ni couleur ni fichier fourni |
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
| unit | attribute_unit_enum | NULL | Unité pour NUMERIC (enum extensible) |
| is_required | BOOLEAN | NOT NULL DEFAULT FALSE | Valeur obligatoire |
| is_filterable | BOOLEAN | NOT NULL DEFAULT FALSE | Utilisé dans les filtres |
| external_source | VARCHAR(100) | NULL | Identifiant du système externe |
| external_id | VARCHAR(255) | NULL | ID dans le système externe |
| metadata | JSONB | NULL | Configuration additionnelle |
| version | INTEGER | NOT NULL DEFAULT 1 | Verrouillage optimiste |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | Date de création |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | Date de modification |

**Contrainte d'unicité** : `UNIQUE (external_source, external_id)` - un seul enregistrement par couple source/ID externe.

```sql
CREATE TYPE attribute_type_enum AS ENUM (
  'DROPDOWN', 'MULTISELECT', 'PLAIN_TEXT', 'RICH_TEXT',
  'NUMERIC', 'BOOLEAN', 'FILE', 'REFERENCE', 'SWATCH',
  'DATE', 'DATE_TIME'
);

-- Enum extensible : nouvelles unités ajoutées via ALTER TYPE ... ADD VALUE
CREATE TYPE attribute_unit_enum AS ENUM (
  -- Masse
  'KILOGRAM', 'GRAM', 'POUND', 'OUNCE',
  -- Longueur
  'METER', 'CENTIMETER', 'MILLIMETER', 'INCH', 'FOOT',
  -- Volume
  'LITER', 'MILLILITER', 'GALLON',
  -- Surface
  'SQUARE_METER', 'SQUARE_CENTIMETER',
  -- Autres
  'PIECE', 'PERCENT'
);

CREATE TABLE attributes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  type attribute_type_enum NOT NULL,
  reference_entity VARCHAR(100),
  unit attribute_unit_enum,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  is_filterable BOOLEAN NOT NULL DEFAULT FALSE,
  external_source VARCHAR(100),
  external_id VARCHAR(255),
  metadata JSONB,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_reference_entity CHECK (
    (type = 'REFERENCE' AND reference_entity IS NOT NULL) OR
    (type != 'REFERENCE' AND reference_entity IS NULL)
  ),
  CONSTRAINT chk_unit_for_numeric CHECK (
    (type = 'NUMERIC') OR (unit IS NULL)
  ),
  -- Unicité des identifiants externes (optionnelle mais unique si présente)
  CONSTRAINT uq_attributes_external UNIQUE (external_source, external_id)
);

-- Note: Hard delete sur les attributs. Les consommateurs doivent gérer
-- leurs propres relations via ON DELETE CASCADE ou logique applicative.

-- Ajout d'une nouvelle unité (migration future) :
-- ALTER TYPE attribute_unit_enum ADD VALUE 'NEW_UNIT';

-- === Index pour les recherches ===

-- Recherche textuelle sur name (préfixe et trigram)
CREATE INDEX idx_attributes_name ON attributes(name);
CREATE INDEX idx_attributes_name_trgm ON attributes USING GIN (name gin_trgm_ops);

-- Recherche textuelle sur slug (trigram pour recherche floue)
CREATE INDEX idx_attributes_slug_trgm ON attributes USING GIN (slug gin_trgm_ops);

-- Filtrage par type (enum)
CREATE INDEX idx_attributes_type ON attributes(type);

-- Filtrage par flags
CREATE INDEX idx_attributes_filterable ON attributes(is_filterable) WHERE is_filterable = TRUE;

-- Recherche dans metadata (JSONB)
CREATE INDEX idx_attributes_metadata ON attributes USING GIN (metadata);

-- Note: slug a déjà un index BTREE via UNIQUE constraint pour recherche exacte

-- Recherche par identifiants externes (index partiel pour ignorer les NULL)
CREATE INDEX idx_attributes_external ON attributes(external_source, external_id)
  WHERE external_source IS NOT NULL;
```

### Table : `attribute_values`

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| id | UUID | PK | Identifiant unique |
| attribute_id | UUID | FK NOT NULL | Référence à attributes |
| slug | VARCHAR(255) | NOT NULL | Clé unique par attribut (auto-générée si non fournie) |
| value | VARCHAR(255) | NOT NULL | Libellé d'affichage |
| position | INTEGER | NOT NULL DEFAULT 0 | Ordre d'affichage |
| external_source | VARCHAR(100) | NULL | Identifiant du système externe |
| external_id | VARCHAR(255) | NULL | ID dans le système externe |
| created_at | TIMESTAMPTZ | NOT NULL | Date de création |
| updated_at | TIMESTAMPTZ | NOT NULL | Date de modification |

```sql
CREATE TABLE attribute_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_id UUID NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
  slug VARCHAR(255) NOT NULL,
  value VARCHAR(255) NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  external_source VARCHAR(100),
  external_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Slug unique par attribut (pas globalement)
  CONSTRAINT uq_attribute_value_slug UNIQUE (attribute_id, slug),
  -- Unicité des identifiants externes
  CONSTRAINT uq_attribute_values_external UNIQUE (external_source, external_id)
);

CREATE INDEX idx_attribute_values_attribute_id ON attribute_values(attribute_id);
CREATE INDEX idx_attribute_values_position ON attribute_values(attribute_id, position);

-- Recherche textuelle sur slug (trigram pour recherche floue)
CREATE INDEX idx_attribute_values_slug_trgm ON attribute_values USING GIN (slug gin_trgm_ops);

-- Recherche textuelle sur value (préfixe et trigram)
CREATE INDEX idx_attribute_values_value ON attribute_values(value);
CREATE INDEX idx_attribute_values_value_trgm ON attribute_values USING GIN (value gin_trgm_ops);

-- Recherche par identifiants externes
CREATE INDEX idx_attribute_values_external ON attribute_values(external_source, external_id)
  WHERE external_source IS NOT NULL;
```

### Table : `attribute_swatch_values`

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| id | UUID | PK | Identifiant unique |
| attribute_id | UUID | FK NOT NULL | Référence à attributes |
| slug | VARCHAR(255) | NOT NULL | Clé unique par attribut (auto-générée si non fournie) |
| value | VARCHAR(255) | NOT NULL | Libellé d'affichage |
| color | VARCHAR(7) | NULL | Couleur hex (#RRGGBB) |
| file_url | VARCHAR(2048) | NULL | URL du fichier (image, pattern, etc.) |
| mimetype | VARCHAR(100) | NULL | Type MIME (image/png, image/svg+xml, etc.) |
| position | INTEGER | NOT NULL | Ordre d'affichage |
| external_source | VARCHAR(100) | NULL | Identifiant du système externe |
| external_id | VARCHAR(255) | NULL | ID dans le système externe |
| created_at | TIMESTAMPTZ | NOT NULL | Date de création |
| updated_at | TIMESTAMPTZ | NOT NULL | Date de modification |

**Mapping GraphQL** : Le champ `file: FileInfo` est mappé aux colonnes `file_url` et `mimetype`.

```sql
CREATE TABLE attribute_swatch_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_id UUID NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
  slug VARCHAR(255) NOT NULL,
  value VARCHAR(255) NOT NULL,
  color VARCHAR(7),
  file_url VARCHAR(2048),
  mimetype VARCHAR(100),
  position INTEGER NOT NULL DEFAULT 0,
  external_source VARCHAR(100),
  external_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Slug unique par attribut
  CONSTRAINT uq_swatch_slug UNIQUE (attribute_id, slug),
  -- Au moins une représentation visuelle requise
  CONSTRAINT chk_swatch_has_visual CHECK (color IS NOT NULL OR file_url IS NOT NULL),
  -- Mimetype requis si file_url présent
  CONSTRAINT chk_swatch_mimetype CHECK (
    (file_url IS NULL) OR (file_url IS NOT NULL AND mimetype IS NOT NULL)
  ),
  -- Unicité des identifiants externes
  CONSTRAINT uq_swatch_values_external UNIQUE (external_source, external_id)
);

CREATE INDEX idx_swatch_values_attribute_id ON attribute_swatch_values(attribute_id);
CREATE INDEX idx_swatch_values_position ON attribute_swatch_values(attribute_id, position);

-- Recherche textuelle sur slug (trigram pour recherche floue)
CREATE INDEX idx_swatch_values_slug_trgm ON attribute_swatch_values USING GIN (slug gin_trgm_ops);

-- Recherche textuelle sur value (préfixe et trigram)
CREATE INDEX idx_swatch_values_value ON attribute_swatch_values(value);
CREATE INDEX idx_swatch_values_value_trgm ON attribute_swatch_values USING GIN (value gin_trgm_ops);

-- Recherche par identifiants externes
CREATE INDEX idx_swatch_values_external ON attribute_swatch_values(external_source, external_id)
  WHERE external_source IS NOT NULL;
```

### Tables de valeurs typées

#### `attribute_text_values`

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| id | UUID | PK | Identifiant unique |
| attribute_id | UUID | FK NOT NULL | Référence à attributes |
| plain | TEXT | NOT NULL | Texte brut (PLAIN_TEXT et RICH_TEXT) |
| rich | JSONB | NULL | Texte structuré JSON (RICH_TEXT uniquement) |
| external_source | VARCHAR(100) | NULL | Identifiant du système externe |
| external_id | VARCHAR(255) | NULL | ID dans le système externe |
| created_at | TIMESTAMPTZ | NOT NULL | Date de création |
| updated_at | TIMESTAMPTZ | NOT NULL | Date de modification |

**Mapping GraphQL** : `plain` → texte brut toujours présent, `rich` → JSON structuré (ProseMirror, TipTap, etc.) pour RICH_TEXT uniquement.

```sql
CREATE TABLE attribute_text_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_id UUID NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
  plain TEXT NOT NULL,
  rich JSONB,
  external_source VARCHAR(100),
  external_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_text_values_external UNIQUE (external_source, external_id)
);

CREATE INDEX idx_text_values_attribute_id ON attribute_text_values(attribute_id);
CREATE INDEX idx_text_values_external ON attribute_text_values(external_source, external_id)
  WHERE external_source IS NOT NULL;

-- Recherche full-text sur le texte brut
CREATE INDEX idx_text_values_plain_trgm ON attribute_text_values USING GIN (plain gin_trgm_ops);

-- Index GIN pour les requêtes JSONB sur rich (si nécessaire)
CREATE INDEX idx_text_values_rich ON attribute_text_values USING GIN (rich);
```

#### `attribute_numeric_values`

```sql
CREATE TABLE attribute_numeric_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_id UUID NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
  value NUMERIC(20, 6) NOT NULL,
  external_source VARCHAR(100),
  external_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_numeric_values_external UNIQUE (external_source, external_id)
);

CREATE INDEX idx_numeric_values_attribute_id ON attribute_numeric_values(attribute_id);
CREATE INDEX idx_numeric_values_value ON attribute_numeric_values(attribute_id, value);
CREATE INDEX idx_numeric_values_external ON attribute_numeric_values(external_source, external_id)
  WHERE external_source IS NOT NULL;
```

#### `attribute_boolean_values`

```sql
CREATE TABLE attribute_boolean_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_id UUID NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
  value BOOLEAN NOT NULL,
  external_source VARCHAR(100),
  external_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_boolean_values_external UNIQUE (external_source, external_id)
);

CREATE INDEX idx_boolean_values_attribute_id ON attribute_boolean_values(attribute_id);
CREATE INDEX idx_boolean_values_external ON attribute_boolean_values(external_source, external_id)
  WHERE external_source IS NOT NULL;
```

#### `attribute_date_values`

```sql
CREATE TABLE attribute_date_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_id UUID NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
  value TIMESTAMPTZ NOT NULL,
  external_source VARCHAR(100),
  external_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_date_values_external UNIQUE (external_source, external_id)
);

CREATE INDEX idx_date_values_attribute_id ON attribute_date_values(attribute_id);
CREATE INDEX idx_date_values_value ON attribute_date_values(attribute_id, value);
CREATE INDEX idx_date_values_external ON attribute_date_values(external_source, external_id)
  WHERE external_source IS NOT NULL;
```

#### `attribute_file_values`

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| id | UUID | PK | Identifiant unique |
| attribute_id | UUID | FK NOT NULL | Référence à attributes |
| file_url | VARCHAR(2048) | NOT NULL | URL du fichier |
| mimetype | VARCHAR(100) | NOT NULL | Type MIME (application/pdf, image/png, etc.) |
| external_source | VARCHAR(100) | NULL | Identifiant du système externe |
| external_id | VARCHAR(255) | NULL | ID dans le système externe |
| created_at | TIMESTAMPTZ | NOT NULL | Date de création |
| updated_at | TIMESTAMPTZ | NOT NULL | Date de modification |

**Mapping GraphQL** : Le champ `file: FileInfo!` est mappé aux colonnes `file_url` et `mimetype`.

```sql
CREATE TABLE attribute_file_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_id UUID NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
  file_url VARCHAR(2048) NOT NULL,
  mimetype VARCHAR(100) NOT NULL,
  external_source VARCHAR(100),
  external_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_file_values_external UNIQUE (external_source, external_id)
);

CREATE INDEX idx_file_values_attribute_id ON attribute_file_values(attribute_id);
CREATE INDEX idx_file_values_external ON attribute_file_values(external_source, external_id)
  WHERE external_source IS NOT NULL;
```

#### `attribute_reference_values`

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| id | UUID | PK | Identifiant unique |
| attribute_id | UUID | FK NOT NULL | Référence à attributes |
| slug | VARCHAR(255) | NOT NULL | Clé unique par attribut (auto-générée depuis value) |
| value | VARCHAR(255) | NOT NULL | Libellé d'affichage (nom de l'entité référencée) |
| reference_id | UUID | NOT NULL | ID de l'entité référencée (unique par attribut) |
| position | INTEGER | NOT NULL | Ordre d'affichage |
| external_source | VARCHAR(100) | NULL | Identifiant du système externe |
| external_id | VARCHAR(255) | NULL | ID dans le système externe |
| created_at | TIMESTAMPTZ | NOT NULL | Date de création |
| updated_at | TIMESTAMPTZ | NOT NULL | Date de modification |

```sql
CREATE TABLE attribute_reference_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_id UUID NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
  slug VARCHAR(255) NOT NULL,
  value VARCHAR(255) NOT NULL,
  reference_id UUID NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  external_source VARCHAR(100),
  external_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Slug unique par attribut
  CONSTRAINT uq_reference_slug UNIQUE (attribute_id, slug),
  -- Reference ID unique par attribut (même entité ne peut être référencée 2x)
  CONSTRAINT uq_reference_id UNIQUE (attribute_id, reference_id),
  -- Unicité des identifiants externes
  CONSTRAINT uq_reference_values_external UNIQUE (external_source, external_id)
);

CREATE INDEX idx_reference_values_attribute_id ON attribute_reference_values(attribute_id);
CREATE INDEX idx_reference_values_position ON attribute_reference_values(attribute_id, position);
CREATE INDEX idx_reference_values_reference_id ON attribute_reference_values(reference_id);

-- Recherche textuelle sur slug et value (trigram)
CREATE INDEX idx_reference_values_slug_trgm ON attribute_reference_values USING GIN (slug gin_trgm_ops);
CREATE INDEX idx_reference_values_value ON attribute_reference_values(value);
CREATE INDEX idx_reference_values_value_trgm ON attribute_reference_values USING GIN (value gin_trgm_ops);

-- Recherche par identifiants externes
CREATE INDEX idx_reference_values_external ON attribute_reference_values(external_source, external_id)
  WHERE external_source IS NOT NULL;
```

### Stratégie de migration

1. **Migration 000** : Activation de l'extension `pg_trgm` (recherche floue)
2. **Migration 001** : Création des types enum (`attribute_type_enum`, `attribute_unit_enum`) et de la table `attributes` avec index
3. **Migration 002** : Création de `attribute_values`, `attribute_swatch_values` et `attribute_reference_values` avec index
4. **Migration 003** : Création des tables de valeurs typées (text, numeric, boolean, date, file) avec index

**Plan de rollback** : Chaque migration inclut une fonction `down()` pour annuler les changements. Les migrations sont versionnées et peuvent être annulées individuellement.

### Index

**Prérequis** : Extension `pg_trgm` pour la recherche floue
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

| Table | Index | Type | Objectif |
|-------|-------|------|----------|
| **attributes** | | | |
| | (slug) | UNIQUE | Recherche exacte par slug |
| | idx_attributes_slug_trgm | GIN (trgm) | Recherche floue/contains sur slug |
| | idx_attributes_name | BTREE | Recherche préfixe sur name |
| | idx_attributes_name_trgm | GIN (trgm) | Recherche floue/contains sur name |
| | idx_attributes_type | BTREE | Filtrage par type |
| | idx_attributes_filterable | BTREE partiel | Attributs filtrables |
| | idx_attributes_metadata | GIN | Recherche JSONB |
| **attribute_values** | | | |
| | (attribute_id, slug) | UNIQUE | Recherche exacte par slug |
| | idx_attribute_values_slug_trgm | GIN (trgm) | Recherche floue/contains sur slug |
| | idx_attribute_values_value | BTREE | Recherche préfixe sur value |
| | idx_attribute_values_value_trgm | GIN (trgm) | Recherche floue/contains sur value |
| | idx_attribute_values_position | BTREE | Ordonnancement |
| **attribute_swatch_values** | | | |
| | (attribute_id, slug) | UNIQUE | Recherche exacte par slug |
| | idx_swatch_values_slug_trgm | GIN (trgm) | Recherche floue/contains sur slug |
| | idx_swatch_values_value | BTREE | Recherche préfixe sur value |
| | idx_swatch_values_value_trgm | GIN (trgm) | Recherche floue/contains sur value |
| | idx_swatch_values_position | BTREE | Ordonnancement |
| **attribute_numeric_values** | | | |
| | idx_numeric_values_value | BTREE | Filtrage par plage |
| **attribute_date_values** | | | |
| | idx_date_values_value | BTREE | Filtrage par date |
| **attribute_reference_values** | | | |
| | (attribute_id, slug) | UNIQUE | Recherche exacte par slug |
| | (attribute_id, reference_id) | UNIQUE | Unicité de l'entité référencée |
| | idx_reference_values_slug_trgm | GIN (trgm) | Recherche floue/contains sur slug |
| | idx_reference_values_value | BTREE | Recherche préfixe sur value |
| | idx_reference_values_value_trgm | GIN (trgm) | Recherche floue/contains sur value |
| | idx_reference_values_position | BTREE | Ordonnancement |
| | idx_reference_values_reference_id | BTREE | Jointure entité référencée |

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
- Extension `pg_trgm` pour la recherche floue (incluse dans PostgreSQL)
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
