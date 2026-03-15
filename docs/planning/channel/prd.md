# PRD : Channel (Canaux de vente)

**Statut** : Brouillon
**Auteur** : [Nom]
**Créé le** : 2026-01-29
**Dernière mise à jour** : 2026-03-15

---

## 1. Aperçu

Channel permet aux marchands de définir et gérer plusieurs canaux de vente (vitrines web, applications mobiles, places de marché) depuis une interface d'administration unique. Ce module fournit l'infrastructure de base des canaux ; la publication de produits et la tarification par canal seront gérées par le module Product.

## 2. Énoncé du problème

### État actuel
- La plateforme ne dispose d'aucune notion de canal de vente
- Impossible de distinguer les différentes surfaces de vente (web, mobile, marketplace)

### État cible
- Les marchands peuvent créer et gérer plusieurs canaux de vente
- Chaque canal dispose d'un handle unique, d'un nom et d'une configuration propre
- Les canaux peuvent être activés ou désactivés sans perte de configuration
- Les autres modules (Product, Order, etc.) peuvent référencer les canaux pour contextualiser leurs données

### Impact
- Prépare l'architecture multi-canal pour l'ensemble de la plateforme
- Permet aux futurs modules de s'intégrer aux canaux (publication produit, tarification, analytics)

## 3. Objectifs

### Objectifs principaux
- [ ] Fournir un CRUD complet pour les canaux de vente
- [ ] Permettre l'activation/désactivation des canaux
- [ ] Créer un canal par défaut lors de la configuration d'une organisation
- [ ] Exposer les canaux via l'API GraphQL pour que les autres modules puissent les référencer

### Non-objectifs (Hors périmètre)
- Publication de produits sur les canaux (responsabilité du module Product)
- Tarification spécifique par canal (responsabilité du module Product)
- Intégration directe avec les places de marché tierces (APIs Amazon, eBay)
- Règles d'expédition spécifiques aux canaux
- Support multi-devises
- Analytics et métriques de performance par canal

## 4. User Stories

### US-001 : Créer un canal de vente
**En tant que** marchand
**Je veux** créer un nouveau canal de vente (ex. : "Application mobile", "Portail grossiste")
**Afin de** configurer où mes produits pourront être vendus

**Priorité** : Haute

### US-002 : Modifier un canal de vente
**En tant que** marchand
**Je veux** modifier le nom, la description ou le handle d'un canal existant
**Afin de** maintenir mes canaux à jour

**Priorité** : Haute

### US-003 : Gérer la disponibilité du canal
**En tant que** marchand
**Je veux** activer ou désactiver rapidement un canal
**Afin de** mettre en pause les ventes sur un canal sans perdre la configuration

**Priorité** : Haute

### US-004 : Supprimer un canal de vente
**En tant que** marchand
**Je veux** supprimer un canal qui n'est plus utilisé
**Afin de** garder ma liste de canaux propre

**Priorité** : Moyenne

### US-005 : Lister et consulter les canaux
**En tant que** marchand
**Je veux** voir la liste de tous mes canaux avec leur statut
**Afin de** avoir une vue d'ensemble de mes surfaces de vente

**Priorité** : Haute

## 5. Critères d'acceptation

### Critères d'acceptation US-001
- [ ] Peut créer un canal avec nom, handle (slug) et description
- [ ] Le handle est unique au sein de l'organisation
- [ ] Le canal est créé avec le statut actif par défaut
- [ ] Un canal par défaut est créé automatiquement lors de la configuration d'une organisation

### Critères d'acceptation US-002
- [ ] Peut modifier le nom et la description d'un canal
- [ ] Peut modifier le handle si le nouveau handle est unique dans l'organisation
- [ ] La modification met à jour le champ `updatedAt`

### Critères d'acceptation US-003
- [ ] Peut basculer le statut actif/inactif du canal
- [ ] Le canal par défaut ne peut pas être désactivé
- [ ] La configuration du canal est préservée lors de la désactivation

### Critères d'acceptation US-004
- [ ] La suppression est une suppression logique (soft delete via `deletedAt`)
- [ ] Le canal par défaut ne peut pas être supprimé
- [ ] Les canaux supprimés n'apparaissent plus dans les listes

### Critères d'acceptation US-005
- [ ] Peut lister tous les canaux actifs d'une organisation
- [ ] Peut consulter le détail d'un canal par ID ou handle
- [ ] La liste affiche le statut (actif/inactif) de chaque canal

## 6. Notes techniques

### Considérations architecturales
- Channel est un module autonome suivant le pattern existant (`@czo/channel`)
- Le contexte du canal est exposé via le GraphQL context pour les autres modules
- Le canal est une dimension structurante : les modules Product, Order et Analytics s'y rattacheront via leurs propres tables de jonction

### Modifications de l'API
- Nouveau type `Channel` avec opérations CRUD
- Queries : `channels(organizationId: ID)`, `channel(id: ID!)`
- Mutations : `createChannel`, `updateChannel`, `deleteChannel`, `setChannelStatus`

### Modifications de la base de données
- Table `channels` : id, organization_id, handle, name, description, is_default, is_active, deleted_at, version, created_at, updated_at

### Considérations de sécurité
- Les canaux appartiennent à une organisation ; l'accès inter-organisation doit être empêché
- Le handle du canal doit être validé (alphanumérique + tirets uniquement)
- L'API de la vitrine ne doit exposer que les canaux actifs

## 7. Dépendances

### Bloqueurs
- Aucun — le module Channel est autonome

### Fonctionnalités liées
- Module Product (publication de produits sur les canaux, tarification par canal)
- Module Order (commandes taguées avec le canal source)
- Module Analytics (métriques de performance des canaux)

---

## Annexe

### Questions ouvertes
- [ ] Les canaux doivent-ils supporter des métadonnées personnalisées (champ JSON) pour les données spécifiques aux places de marché ?
- [ ] Devons-nous supporter des groupes de canaux pour la gestion en masse ?

### Références
- Shopify Sales Channels : https://shopify.dev/docs/apps/sales-channels
- Medusa Sales Channels : https://docs.medusajs.com/modules/sales-channels
