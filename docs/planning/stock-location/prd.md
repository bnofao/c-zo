# PRD : Stock Location (Emplacements de stock)

**Statut** : Brouillon
**Auteur** : [Nom]
**Créé le** : 2026-03-15
**Dernière mise à jour** : 2026-03-15

---

## 1. Aperçu

Stock Location permet aux marchands de modéliser leurs emplacements physiques de stock (entrepôts, magasins, centres de fulfillment, fournisseurs dropship). Ce module fournit l'infrastructure fondamentale côté offre ; il modélise *où* le stock peut exister, pas le stock lui-même. Les modules Inventory, Fulfillment et Order le référenceront.

## 2. Énoncé du problème

### État actuel
- La plateforme n'a aucune notion d'emplacement physique de stock
- Impossible de distinguer les surfaces de stockage (entrepôt, magasin, dropshipper)
- Pas de données d'adresse rattachées aux points de fulfillment (nécessaire pour le calcul des frais d'expédition)

### État cible
- Les marchands peuvent créer et gérer leurs emplacements de stock avec adresses structurées
- Chaque emplacement a un type, un statut actif/inactif et des métadonnées extensibles
- Les autres modules (Inventory, Fulfillment, Order) peuvent référencer les emplacements
- Un emplacement par défaut est défini par organisation

### Impact
- Pose la fondation côté offre (supply side) — complémentaire au module Channel (demand side)
- Permet aux futurs modules de s'appuyer sur des emplacements structurés plutôt que des chaînes de texte
- Évite un refactoring coûteux quand le module Inventory arrivera

## 3. Objectifs

### Objectifs principaux
- [ ] Fournir un CRUD complet pour les emplacements de stock avec adresses
- [ ] Supporter des métadonnées extensibles (jsonb) pour les données spécifiques à chaque emplacement
- [ ] Permettre l'activation/désactivation des emplacements
- [ ] Gérer un emplacement par défaut par organisation
- [ ] Émettre des événements lifecycle (stockLocation:created, stockLocation:updated, etc.)
- [ ] Exposer les emplacements via l'API GraphQL

### Non-objectifs (Hors périmètre)
- Suivi des quantités de stock (responsabilité du module Inventory)
- Logique de fulfillment et routage de commandes (responsabilité du module Fulfillment)
- Dépendance au module Product — les produits ne font pas partie du domaine de ce module
- Zones d'expédition et tarifs shipping
- Hiérarchie de locations (région > entrepôt > zone > bin)
- Flag `fulfills_online` — sera ajouté quand le module Fulfillment sera conçu
- Géo-routage (nearest location)
- Import/export en masse

## 4. User Stories

### US-001 : Créer un emplacement de stock
**En tant que** marchand
**Je veux** créer un emplacement de stock avec son type et son adresse
**Afin de** modéliser mon réseau de fulfillment dans la plateforme

**Priorité** : Haute

### US-002 : Modifier un emplacement de stock
**En tant que** marchand
**Je veux** modifier les informations d'un emplacement (nom, adresse, métadonnées)
**Afin de** maintenir mes emplacements à jour

**Priorité** : Haute

### US-003 : Gérer la disponibilité d'un emplacement
**En tant que** marchand
**Je veux** activer ou désactiver un emplacement
**Afin de** refléter les ouvertures/fermetures temporaires (entrepôt saisonnier, travaux)

**Priorité** : Haute

### US-004 : Supprimer un emplacement de stock
**En tant que** marchand
**Je veux** supprimer un emplacement qui n'est plus utilisé
**Afin de** garder ma liste d'emplacements propre

**Priorité** : Moyenne

### US-005 : Lister et consulter les emplacements
**En tant que** marchand
**Je veux** voir la liste de tous mes emplacements avec leur type, statut et adresse
**Afin de** avoir une vue d'ensemble de mon réseau logistique

**Priorité** : Haute

### US-006 : Définir l'emplacement par défaut
**En tant que** marchand
**Je veux** définir un emplacement comme emplacement par défaut
**Afin que** les opérations sans emplacement explicite utilisent cet emplacement

**Priorité** : Haute

## 5. Critères d'acceptation

### Critères d'acceptation US-001
- [ ] Peut créer un emplacement avec nom, handle (slug) et adresse complète
- [ ] Le handle est unique au sein de l'organisation (parmi les non-supprimés)
- [ ] L'adresse inclut : address_line_1, city, country_code (ISO 3166-1 alpha-2) au minimum
- [ ] L'emplacement est créé avec le statut actif par défaut
- [ ] Un événement `stockLocation:created` est émis

### Critères d'acceptation US-002
- [ ] Peut modifier le nom, la description et les métadonnées
- [ ] Peut modifier le handle si le nouveau handle est unique dans l'organisation
- [ ] Peut modifier l'adresse (tous les champs)
- [ ] La modification incrémente le champ `version` (optimistic locking)
- [ ] Un événement `stockLocation:updated` est émis

### Critères d'acceptation US-003
- [ ] Peut basculer le statut actif/inactif d'un emplacement
- [ ] L'emplacement par défaut ne peut pas être désactivé
- [ ] La configuration est préservée lors de la désactivation
- [ ] Un événement `stockLocation:statusChanged` est émis

### Critères d'acceptation US-004
- [ ] La suppression est une suppression logique (soft delete via `deletedAt`)
- [ ] L'emplacement par défaut ne peut pas être supprimé
- [ ] Les emplacements supprimés n'apparaissent plus dans les listes
- [ ] Un événement `stockLocation:deleted` est émis

### Critères d'acceptation US-005
- [ ] Peut lister tous les emplacements d'une organisation (avec filtre : statut)
- [ ] Peut consulter le détail d'un emplacement par ID ou handle (avec adresse)
- [ ] La liste affiche le statut et la ville/pays de chaque emplacement

### Critères d'acceptation US-006
- [ ] Peut définir un emplacement comme emplacement par défaut
- [ ] L'ancien emplacement par défaut perd son statut automatiquement (un seul par org)
- [ ] L'emplacement par défaut ne peut être ni supprimé ni désactivé

## 6. Notes techniques

### Considérations architecturales
- Module autonome `@czo/stock-location` suivant le pattern de `@czo/channel`
- Organisation-scoped : toutes les opérations sont filtrées par `organization_id`
- Événements lifecycle émis via le système d'events du kit
- Création de l'emplacement par défaut manuellement par le marchand (possibilité future de hook sur création d'organisation)

### Modifications de l'API
- Queries : `stockLocation(id: ID!)`, `stockLocations(organizationId: ID, isActive: Boolean)`
- Mutations : `createStockLocation`, `updateStockLocation`, `deleteStockLocation`, `setStockLocationStatus`, `setDefaultStockLocation`

### Modifications de la base de données
- Table `stock_locations` : id, organization_id, handle, name, is_default, is_active, metadata (jsonb), deleted_at, version, created_at, updated_at
- Table `stock_location_addresses` : id, stock_location_id (1:1), address_line_1, address_line_2, city, province, postal_code, country_code (ISO 3166-1 alpha-2), phone, created_at, updated_at
- Index unique partiel : `(organization_id, handle) WHERE deleted_at IS NULL`

### Considérations de sécurité
- Les emplacements appartiennent à une organisation ; l'accès inter-organisation doit être empêché
- Le handle doit être validé (alphanumérique + tirets uniquement)
- Le country_code doit être validé contre ISO 3166-1 alpha-2
- Les métadonnées (jsonb) doivent être validées en taille (limite raisonnable)

## 7. Dépendances

### Bloqueurs
- Aucun — le module Stock Location est autonome

### Fonctionnalités liées
- Module Inventory (futur) — créera `inventory_levels(item_id, location_id, quantity, reserved)`
- Module Fulfillment (futur) — liera les emplacements aux canaux via des fulfillment sets
- Module Order (futur) — taguera les commandes avec l'emplacement source
- Module Channel — complémentaire (demand side vs supply side)

---

## Annexe

### Questions ouvertes
- [ ] ISO 3166-1 alpha-2 suffit-il pour les codes pays, ou faut-il supporter alpha-3 ?
- [ ] Les métadonnées doivent-elles avoir un schéma de validation (JSON Schema) ou rester libres ?
- [ ] Une app tierce (via le système d'apps auth) pourrait-elle enregistrer ses propres emplacements (ex. : app 3PL) ?

### Références
- Shopify Locations API : https://shopify.dev/docs/api/admin-graphql/current/objects/Location
- Medusa Stock Locations : https://docs.medusajs.com/resources/commerce-modules/stock-location
