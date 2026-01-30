# PRD : Channel (Canaux de vente)

**Statut** : Brouillon
**Auteur** : [Nom]
**Créé le** : 2026-01-29
**Dernière mise à jour** : 2026-01-29

---

## 1. Aperçu

Channel permet aux marchands de vendre des produits sur plusieurs canaux de vente (vitrines web, applications mobiles, places de marché comme Amazon) à partir d'un catalogue produit unifié. Cette fonctionnalité est essentielle pour les marchands qui souhaitent étendre leur portée sans gérer des inventaires et des données produits séparés pour chaque plateforme.

## 2. Énoncé du problème

### État actuel
- La plateforme est limitée à une seule vitrine, empêchant les marchands de vendre sur plusieurs plateformes
- Les marchands doivent synchroniser manuellement les produits et l'inventaire entre les différentes plateformes de vente
- Impossibilité de définir des prix différents pour différents canaux de vente (ex. : prix plus élevés sur les places de marché pour couvrir les frais)

### État cible
- Les marchands peuvent créer et gérer plusieurs canaux de vente depuis une interface d'administration unique
- Les produits peuvent être publiés sur n'importe quelle combinaison de canaux avec des paramètres spécifiques à chaque canal
- L'inventaire reste unifié sur tous les canaux avec une synchronisation automatique des stocks
- Les prix peuvent être personnalisés par canal tout en maintenant un prix de base

### Impact
- Les marchands peuvent s'étendre à de nouveaux canaux de vente sans charge opérationnelle supplémentaire
- Réduction du risque de survente grâce à la gestion unifiée de l'inventaire
- Potentiel de revenus accru grâce à l'expansion sur les places de marché avec des stratégies de tarification appropriées

## 3. Objectifs

### Objectifs principaux
- [ ] Permettre la publication multi-canal des produits depuis un catalogue unique
- [ ] Prendre en charge la tarification spécifique par canal (prix différents par canal)
- [ ] Maintenir un inventaire unifié sur tous les canaux avec synchronisation en temps réel
- [ ] Fournir des analyses au niveau du canal pour suivre les performances par canal

### Non-objectifs (Hors périmètre)
- Intégration directe avec les places de marché tierces (APIs Amazon, eBay) - ce PRD couvre uniquement l'architecture des canaux
- Règles d'expédition spécifiques aux canaux (amélioration future)
- Support multi-devises (fonctionnalité séparée)

## 4. User Stories

### US-001 : Créer un canal de vente
**En tant que** marchand
**Je veux** créer un nouveau canal de vente (ex. : "Application mobile", "Portail grossiste")
**Afin de** configurer où mes produits sont vendus

**Priorité** : Haute

### US-002 : Publier des produits sur un canal
**En tant que** marchand
**Je veux** sélectionner quels produits sont disponibles sur chaque canal
**Afin de** contrôler mon catalogue produit par canal de vente

**Priorité** : Haute

### US-003 : Définir une tarification spécifique au canal
**En tant que** marchand
**Je veux** définir des prix différents pour un produit sur différents canaux
**Afin de** tenir compte des frais des places de marché ou offrir des remises grossistes

**Priorité** : Haute

### US-004 : Consulter les performances du canal
**En tant que** marchand
**Je veux** voir les métriques de ventes et d'inventaire par canal
**Afin de** comprendre quels canaux performent le mieux

**Priorité** : Moyenne

### US-005 : Gérer la disponibilité du canal
**En tant que** marchand
**Je veux** activer ou désactiver rapidement un canal
**Afin de** mettre en pause les ventes sur un canal sans perdre la configuration

**Priorité** : Moyenne

## 5. Critères d'acceptation

### Critères d'acceptation US-001
- [ ] Peut créer un canal avec nom, handle (slug) et description
- [ ] Le canal a un handle unique au sein de l'organisation
- [ ] Le canal peut être marqué comme actif ou inactif
- [ ] Un canal par défaut est créé lors de la configuration du compte

### Critères d'acceptation US-002
- [ ] Peut assigner des produits à un ou plusieurs canaux
- [ ] Peut assigner/retirer des produits en masse des canaux
- [ ] La disponibilité des produits par canal est reflétée dans les requêtes de la vitrine
- [ ] Les produits non publiés ne sont pas retournés dans les listes de produits spécifiques au canal

### Critères d'acceptation US-003
- [ ] Peut définir un prix de substitution pour toute variante de produit par canal
- [ ] Si aucun prix de canal n'est défini, le prix de base est utilisé
- [ ] La tarification du canal est retournée dans l'API de la vitrine lors des requêtes par canal
- [ ] Les changements de prix prennent effet immédiatement

### Critères d'acceptation US-004
- [ ] Le tableau de bord affiche le total des ventes par canal
- [ ] Peut filtrer les commandes par canal
- [ ] Peut voir les produits les plus vendus par canal

### Critères d'acceptation US-005
- [ ] Peut basculer le statut actif/inactif du canal
- [ ] Les canaux inactifs ne retournent aucun produit dans les requêtes de la vitrine
- [ ] La configuration du canal est préservée lors de la désactivation

## 6. Notes techniques

### Considérations architecturales
- Channel sera un nouveau module suivant le pattern de module existant (`@czo/channel`)
- Le contexte du canal doit être passé à travers le contexte GraphQL pour les requêtes de la vitrine
- Considérer le canal comme une dimension similaire à la locale pour le futur multi-tenancy

### Modifications de l'API
- Nouveau type `Channel` avec opérations CRUD
- Nouveau type de jonction `ProductChannel` pour les assignations produit-canal
- Nouveau type `ChannelPrice` pour la tarification spécifique au canal
- Les requêtes de la vitrine doivent accepter un argument optionnel `channelId` ou `channelHandle`

### Modifications de la base de données
- Table `channel` : id, handle, name, description, is_active, deleted_at, version
- Table `product_channel` : product_id, channel_id, published_at
- Table `variant_channel_price` : variant_id, channel_id, price, compare_at_price

### Considérations de sécurité
- Les canaux appartiennent à une organisation ; l'accès inter-organisation doit être empêché
- Le handle du canal doit être validé pour prévenir l'injection
- L'API de la vitrine ne doit exposer que les canaux actifs

## 7. Dépendances

### Bloqueurs
- Le module Product doit être complété (actuellement en cours)

### Fonctionnalités liées
- Gestion de l'inventaire (stock unifié sur tous les canaux)
- Gestion des commandes (commandes taguées avec le canal source)
- Module d'analytics (métriques de performance des canaux)

---

## Annexe

### Questions ouvertes
- [ ] Les canaux doivent-ils supporter des champs personnalisés pour les données spécifiques aux places de marché ?
- [ ] Comment les limites d'inventaire spécifiques aux canaux doivent-elles fonctionner (ex. : réserver 10 unités pour le web uniquement) ?
- [ ] Devons-nous supporter des groupes de canaux pour la gestion en masse ?

### Références
- Shopify Sales Channels : https://shopify.dev/docs/apps/sales-channels
- Medusa Sales Channels : https://docs.medusajs.com/modules/sales-channels
