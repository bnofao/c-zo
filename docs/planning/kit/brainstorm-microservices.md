# Brainstorm: Architecture Microservices pour c-zo

**Date:** 2026-02-09
**Participants:** Claude (Briana), Utilisateur
**Status:** Draft

---

## Enonce du Probleme

### Le Probleme

c-zo est aujourd'hui un **monolithe modulaire** bien structure : les bounded contexts (product, attribute, auth, channel) sont separes en packages NPM distincts, mais ils s'executent tous dans un seul processus Nitro. Cette architecture est correcte pour l'equipe actuelle (1-3 devs), mais elle presente des limitations qui emergeront avec la croissance :

1. **Couplage au deploiement** : un fix dans le module paiement oblige a redeployer l'ensemble de la plateforme, y compris le catalogue et l'auth
2. **Scaling uniforme** : on ne peut pas scaler le moteur de recherche independamment du service d'authentification, alors que leurs profils de charge sont radicalement differents
3. **Blast radius** : un OOM dans un worker de traitement d'images tue le serveur HTTP et les sessions GraphQL en cours
4. **Autonomie des equipes** : quand l'equipe grandira (5-10 devs), les developpeurs du module paiement ne devraient pas avoir a coordonner leurs releases avec ceux du catalogue
5. **Events in-process** : l'`EventEmitter` actuel (hookable) est synchrone et in-process -- `emit('product.created')` execute les handlers sequentiellement dans le meme thread

### Forces du Monolithe Actuel

Il est important de reconnaitre ce qui fonctionne bien aujourd'hui :

- **Simplicite operationnelle** : un processus, un deploiement, un build
- **Coherence transactionnelle** : une transaction PostgreSQL peut couvrir product + attribute
- **Latence minimale** : les appels entre modules sont des appels de fonction, pas des requetes reseau
- **Debug facilite** : une seule stack trace, un seul log stream
- **IoC partage** : `useContainer()` donne acces a tous les services de tous les modules
- **Config unifiee** : `useCzoConfig()` centralise database, Redis, queue

### Qui est Affecte

| Persona | Impact |
|---------|--------|
| **Equipe ops (futur)** | Incapacite de scaler les composants independamment |
| **Developpeurs de modules** | Coordination de releases, blast radius des bugs |
| **Marchands (multi-tenant)** | Un shop a fort trafic impacte tous les autres shops |
| **Integrateurs tiers** | Le systeme d'apps dispatch les webhooks depuis le meme process |

### Pourquoi Maintenant (et Pourquoi Pas Maintenant)

**Cet exercice est preparatoire, pas decisionnaire.** L'objectif est de designer l'architecture cible pour que le monolithe modulaire actuel soit construit avec l'extraction future en tete. On ne migre pas maintenant.

**Raisons de designer maintenant :**
- Les bounded contexts emergent clairement (product, auth, order, payment)
- Le provider pattern pour les tasks (brainstorm-tasks.md) prepare l'abstraction
- Sprint-03 separe deja les workers du process Nitro -- premier pas vers la separation
- Le systeme d'apps (webhooks externes) est un proto-microservice

**Raisons de NE PAS migrer maintenant :**
- Equipe trop petite (1-3 devs) pour supporter la complexite operationnelle
- Pas de probleme de scaling reel a ce jour
- La coherence transactionnelle du monolithe est precieuse pour l'e-commerce

---

## Architecture Actuelle (Reference)

```
                           Internet
                              |
                              v
┌─ apps/paiya (Next.js) ─────────────────────────────────────────┐
│  Storefront + Dashboard (React 19)                              │
└──────────────────────────────┬──────────────────────────────────┘
                               │ GraphQL / REST
                               v
┌─ apps/mazo (Nitro) ─────────────────────────────────────────────┐
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    API Layer (GraphQL Yoga)                │   │
│  └──────────────────────────────┬───────────────────────────┘   │
│                                 │                                │
│  ┌──────────┬──────────┬────────┴──┬──────────┬──────────┐      │
│  │ Product  │Attribute │   Auth    │ Channel  │  (...)   │      │
│  │ Module   │ Module   │  Module   │ Module   │          │      │
│  └────┬─────┴────┬─────┴─────┬────┴────┬─────┴────┬─────┘      │
│       │          │           │         │          │              │
│  ┌────▼──────────▼───────────▼─────────▼──────────▼─────┐      │
│  │  @czo/kit                                              │      │
│  │  ┌───────┬──────┬────────┬───────┬───────┬──────────┐ │      │
│  │  │ IoC   │  DB  │ Events │ Queue │ Cache │ GraphQL  │ │      │
│  │  │       │Drizzle│hookable│BullMQ │Nitro  │ Yoga     │ │      │
│  │  └───────┴──┬───┴────────┴───┬───┴───────┴──────────┘ │      │
│  └─────────────┼────────────────┼────────────────────────┘      │
│                │                │                                │
│           PostgreSQL          Redis                              │
│           (master/replicas)   (queue + cache)                    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

┌─ Process 2 (Sprint-03, planifie) ────────────────────────────────┐
│  Worker Runner (Node.js)                                          │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  BullMQ Workers (orders, emails, inventory, ...)          │    │
│  │  Config via process.env (REDIS_URL, DATABASE_URL)         │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

### Flux d'Events Actuel

```
ProductService.createProduct()
       │
       ▼  emit('product:created', payload)   ← synchrone, in-process
       │
       ├──► SearchHandler: indexProduct()     ← bloque le thread
       ├──► NotificationHandler: notify()     ← sequentiel
       └──► AppHandler: dispatchWebhooks()    ← sequentiel

Temps total = somme de tous les handlers
```

**Limitation** : si le webhook dispatch prend 2 secondes (timeout reseau), `createProduct()` prend 2+ secondes a retourner au client.

---

## Decoupage en Services (Bounded Contexts)

### Cartographie Modules vers Services

| Service | Modules c-zo actuels | Responsabilites | Base de donnees |
|---------|---------------------|-----------------|-----------------|
| **API Gateway** | Nouveau | Federation GraphQL, auth token validation, rate limiting, routing | Aucune (stateless) |
| **Auth Service** | `@czo/auth` | Authentification (email/pwd, OAuth, API keys), sessions, organisations, RBAC, permissions | PostgreSQL (users, sessions, orgs, roles) |
| **Catalog Service** | `@czo/product` + `@czo/attribute` + `@czo/channel` | Produits, variantes, collections, attributs dynamiques, canaux de vente, pricing par canal | PostgreSQL (products, attributes, channels, pricing) |
| **Order Service** | Module order (futur) | Panier, checkout, commandes, fulfillment, retours | PostgreSQL (carts, orders, order_items, fulfillments) |
| **Payment Service** | Module payment (futur) | Processing paiement (Stripe), refunds, reconciliation | PostgreSQL (payments, refunds, payment_methods) |
| **Inventory Service** | Module inventory (futur) | Stock, entrepots, reservations, mouvements | PostgreSQL (stock_items, warehouses, reservations) |
| **Notification Service** | Module notification (futur) | Email, SMS, push via Novu, templates, preferences | PostgreSQL (notifications, templates, preferences) |
| **Search Service** | Module search (futur) | Indexation produits, recherche full-text, facettes, suggestions | Meilisearch ou Elasticsearch + PostgreSQL (config) |
| **App Service** | Systeme apps de `@czo/kit` | Registre d'apps, webhook dispatch, permission checking, extensions | PostgreSQL (installed_apps, webhook_logs) |

### Regroupements et Justifications

**Pourquoi Product + Attribute + Channel dans un seul Catalog Service ?**

Ces trois modules partagent un contexte metier etroitement lie :
- Un produit a des attributs (relation 1:N avec jointures frequentes)
- Un produit est publie sur un canal avec un prix specifique
- Les requetes GraphQL typiques (`product { attributes, channels { pricing } }`) traversent les trois
- Separer attribute de product creerait un probleme N+1 reseau permanent

**Pourquoi Auth est un service separe ?**

- L'auth est un service transversal : tous les autres services en dependent
- Son profil de charge est different (pics de login, sessions stables)
- Securite : isoler les donnees sensibles (mots de passe, tokens)
- Technologie : better-auth a son propre cycle de vie

**Pourquoi Order et Payment sont separes ?**

- Le paiement peut echouer independamment de la commande
- Le payment service peut integrer plusieurs processeurs (Stripe, PayPal, etc.)
- La reconciliation financiere est un domaine reglementaire distinct
- Le saga pattern (Order → Payment → Inventory) necessite cette separation

### Propriete des Donnees

Chaque service possede son schema de base de donnees. Aucun service ne lit directement la base d'un autre.

```
┌─ Auth DB ──────────┐  ┌─ Catalog DB ─────────┐  ┌─ Order DB ──────────┐
│ users               │  │ products              │  │ carts                │
│ sessions            │  │ product_variants      │  │ orders               │
│ organizations       │  │ attributes            │  │ order_items          │
│ org_members         │  │ attribute_values      │  │ fulfillments         │
│ roles               │  │ collections           │  │ returns              │
│ permissions         │  │ channels              │  │                      │
│ api_keys            │  │ channel_pricing       │  │                      │
└─────────────────────┘  └───────────────────────┘  └──────────────────────┘

┌─ Payment DB ───────┐  ┌─ Inventory DB ────────┐  ┌─ App DB ─────────────┐
│ payments            │  │ stock_items           │  │ installed_apps        │
│ refunds             │  │ warehouses            │  │ app_configs           │
│ payment_methods     │  │ reservations          │  │ webhook_logs          │
│ payment_events      │  │ stock_movements       │  │ webhook_subscriptions │
└─────────────────────┘  └───────────────────────┘  └──────────────────────┘

┌─ Notification DB ──┐  ┌─ Search (engine) ─────┐
│ notifications       │  │ Meilisearch Index:    │
│ templates           │  │   products            │
│ preferences         │  │   collections         │
│ delivery_logs       │  │ PostgreSQL:           │
└─────────────────────┘  │   index_configs       │
                         └───────────────────────┘
```

**Consequence : consistance eventuelle.** Quand un produit est cree dans le Catalog Service, le Search Service recoit l'event `product.item.created` et met a jour son index. Il y a un delai (millisecondes a secondes) pendant lequel la recherche ne retourne pas le nouveau produit. C'est acceptable pour l'e-commerce.

---

## Architecture de Communication -- Le Modele Hybride

Le design repose sur trois couches de communication, chacune optimisee pour son cas d'usage.

### Couche 1 : Synchrone (Request/Response)

Pour les appels ou le client attend une reponse immediate.

#### API Gateway : GraphQL Federation

```
┌─ Next.js (paiya) ──────────────────────────────────────────────┐
│  Storefront                          Dashboard                  │
│  (public queries)                    (admin mutations)          │
└──────────────┬───────────────────────────────┬─────────────────┘
               │                               │
               ▼                               ▼
┌─ API Gateway (GraphQL Mesh / Apollo Router) ───────────────────┐
│                                                                 │
│  - Schema Federation (compose les schemas de chaque service)    │
│  - Auth token validation (delegue au Auth Service)              │
│  - Rate limiting per shop/API key                               │
│  - Request routing vers le bon service                          │
│  - Query plan optimization (eviter N+1 reseau)                  │
│                                                                 │
│  Schema compose :                                               │
│    type Product @key(fields: "id") {                            │
│      id: ID!                                                    │
│      title: String!                                             │
│      price(channel: ID!): Money!    # resolu par Catalog       │
│      stock: StockInfo!              # resolu par Inventory     │
│      reviews: [Review!]!            # resolu par Review        │
│    }                                                            │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

**Choix technologique : GraphQL Mesh**

Raisons par rapport a Apollo Router :
- Open source (pas de licence entreprise)
- Compatible avec graphql-yoga (deja utilise dans c-zo)
- Supporte les schemas GraphQL natifs et les sources REST/gRPC
- TypeScript natif (aligne avec le stack)

#### Service-to-Service : gRPC ou tRPC

Pour les appels internes ou un service a besoin de donnees d'un autre (hors events).

```
Order Service                          Catalog Service
     │                                       │
     │  getProductPrice(productId, channel)   │
     │ ─────────────────────────────────────► │
     │                                       │
     │  { price: 29.99, currency: 'EUR' }    │
     │ ◄───────────────────────────────────── │
     │                                       │
```

**Option A : gRPC** (si des services non-TypeScript arrivent)
- Protocol Buffers pour les contrats
- Streaming bidirectionnel
- Performance superieure (binaire, HTTP/2)
- Nativement polyglotte

**Option B : tRPC** (si tout reste TypeScript)
- Zero schema duplication (types TS partages)
- Plus simple a mettre en place
- Pas de codegen
- Moins performant que gRPC mais suffisant pour l'interne

**Recommandation** : commencer avec tRPC (simplicite, stack homogene TS), migrer vers gRPC si des services non-TS apparaissent.

### Couche 2 : Asynchrone (Event-Driven) -- OU RABBITMQ EXCELLE

Pour les events de domaine qui doivent etre distribues a plusieurs services sans couplage.

#### Pourquoi RabbitMQ pour l'Inter-Service

Le modele d'exchange/routing de RabbitMQ mappe naturellement sur la communication inter-services :

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         RabbitMQ Broker                                  │
│                                                                         │
│  ┌─ Exchange: czo.events (type: topic) ─────────────────────────────┐  │
│  │                                                                   │  │
│  │  Routing keys entrants :                                          │  │
│  │    product.item.created                                           │  │
│  │    product.item.published                                         │  │
│  │    product.item.updated                                           │  │
│  │    product.item.deleted                                           │  │
│  │    order.checkout.completed                                       │  │
│  │    order.item.shipped                                             │  │
│  │    auth.user.registered                                           │  │
│  │    auth.session.created                                           │  │
│  │    payment.charge.succeeded                                       │  │
│  │    payment.charge.failed                                          │  │
│  │    inventory.stock.low                                            │  │
│  │                                                                   │  │
│  └────┬──────────┬──────────┬──────────┬──────────┬─────────────────┘  │
│       │          │          │          │          │                     │
│       │          │          │          │          │                     │
│  ┌────▼────┐┌────▼────┐┌───▼─────┐┌───▼─────┐┌──▼──────┐             │
│  │ search  ││ notif   ││ app     ││ order   ││inventory│             │
│  │ .queue  ││ .queue  ││ .queue  ││ .queue  ││ .queue  │             │
│  └────┬────┘└────┬────┘└────┬────┘└────┬────┘└────┬────┘             │
│       │          │          │          │          │                     │
└───────┼──────────┼──────────┼──────────┼──────────┼─────────────────────┘
        │          │          │          │          │
        ▼          ▼          ▼          ▼          ▼
   Search Svc  Notif Svc  App Svc   Order Svc  Inventory Svc
```

#### Topologie des Exchanges RabbitMQ

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Exchanges RabbitMQ                                    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  czo.events (topic exchange)                                         │    │
│  │                                                                      │    │
│  │  THE principal exchange. Tous les events de domaine passent ici.     │    │
│  │  Le routing se fait par pattern matching sur les routing keys.       │    │
│  │                                                                      │    │
│  │  Convention routing key : <domaine>.<entite>.<action>                 │    │
│  │                                                                      │    │
│  │  Exemples :                                                          │    │
│  │    product.item.created      product.item.updated                    │    │
│  │    product.item.published    product.item.deleted                    │    │
│  │    product.collection.created                                        │    │
│  │    order.checkout.started    order.checkout.completed                 │    │
│  │    order.item.shipped        order.item.delivered                    │    │
│  │    auth.user.registered      auth.user.login                        │    │
│  │    auth.org.created          auth.org.member_added                   │    │
│  │    payment.charge.succeeded  payment.charge.failed                   │    │
│  │    payment.refund.created    payment.refund.completed                │    │
│  │    inventory.stock.reserved  inventory.stock.low                     │    │
│  │    inventory.stock.released                                          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  czo.system (fanout exchange)                                        │    │
│  │                                                                      │    │
│  │  Pour les events systeme diffuses a TOUS les services sans filtrage.│    │
│  │  Exemples :                                                          │    │
│  │    config.updated    (tous les services rechargent leur config)       │    │
│  │    maintenance.start (tous les services passent en mode maintenance)  │    │
│  │    shutdown.graceful (tous les services commencent le drain)          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  czo.dlx (topic exchange) -- Dead Letter Exchange                    │    │
│  │                                                                      │    │
│  │  Les messages echoues (apres retries) atterrissent ici.             │    │
│  │  Un service de monitoring consomme cette queue pour alerting.        │    │
│  │  Les messages peuvent etre reinjectes manuellement apres debug.      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

#### Bindings (Queue → Exchange)

Chaque service declare les patterns d'events qui l'interessent :

| Service | Queue | Binding (routing key pattern) | Raison |
|---------|-------|-------------------------------|--------|
| **Search** | `search.indexing` | `product.item.*` | Reindexer a chaque changement produit |
| **Search** | `search.indexing` | `product.collection.*` | Reindexer les collections |
| **Notification** | `notification.events` | `order.checkout.completed` | Email de confirmation |
| **Notification** | `notification.events` | `auth.user.registered` | Email de bienvenue |
| **Notification** | `notification.events` | `product.item.published` | Notifier les followers |
| **Notification** | `notification.events` | `inventory.stock.low` | Alerter le marchand |
| **App** | `app.webhooks` | `#` (tout) | Dispatcher a toutes les apps tierces |
| **Order** | `order.payments` | `payment.charge.*` | Mettre a jour le statut commande |
| **Order** | `order.inventory` | `inventory.stock.reserved` | Confirmer la reservation |
| **Inventory** | `inventory.orders` | `order.checkout.completed` | Reserver le stock |
| **Inventory** | `inventory.payments` | `payment.refund.completed` | Liberer le stock |
| **Payment** | `payment.orders` | `order.checkout.completed` | Initier le paiement |
| **Catalog** | `catalog.inventory` | `inventory.stock.low` | Marquer produit "rupture" |
| **Auth** | *(aucun binding event)* | *(producteur uniquement)* | Auth ne consomme pas d'events |

#### Schema des Messages

Tous les messages RabbitMQ suivent un schema uniforme :

```typescript
interface DomainEvent<T = unknown> {
  /** Identifiant unique de l'event (idempotence) */
  id: string                    // ex: "evt_01HXYZ..."
  /** Type de l'event (= routing key) */
  type: string                  // ex: "product.item.created"
  /** Version du schema (pour evolution) */
  version: number               // ex: 1
  /** Timestamp ISO 8601 */
  timestamp: string             // ex: "2026-02-09T14:30:00.000Z"
  /** Source du service emetteur */
  source: string                // ex: "catalog-service"
  /** ID de correlation pour le tracing distribue */
  correlationId: string         // ex: "req_01HXYZ..."
  /** Payload specifique a l'event */
  data: T
  /** Metadata additionnel */
  metadata: {
    /** ID du shop concerne (multi-tenant) */
    shopId?: string
    /** ID de l'acteur (user ou app) */
    actorId?: string
    /** Type d'acteur */
    actorType?: 'user' | 'app' | 'system'
  }
}

// Exemple concret
const event: DomainEvent<ProductCreatedPayload> = {
  id: 'evt_01HXY123',
  type: 'product.item.created',
  version: 1,
  timestamp: '2026-02-09T14:30:00.000Z',
  source: 'catalog-service',
  correlationId: 'req_01HXY456',
  data: {
    productId: 'prod_01HXY789',
    title: 'T-Shirt Bio',
    handle: 't-shirt-bio',
    status: 'draft',
  },
  metadata: {
    shopId: 'shop_01HXY000',
    actorId: 'user_01HXY111',
    actorType: 'user',
  },
}
```

#### Flux Concret : Un Client Passe une Commande

Trace complete a travers les couches sync et async :

```
Client (Next.js)
  │
  │  mutation { createCheckout(input: {...}) }
  │
  ▼
API Gateway (GraphQL Mesh)
  │
  │  1. Valide le JWT (appel sync → Auth Service)
  │  2. Route la mutation vers Order Service
  │
  ▼
Order Service                                              [SYNC]
  │
  │  3. Cree le cart/checkout en DB locale
  │  4. Appel sync → Catalog Service (verifier prix, dispo)
  │  5. Appel sync → Inventory Service (verifier stock)
  │  6. Sauvegarde la commande (status: pending_payment)
  │
  │  7. Publie event → RabbitMQ                            [ASYNC]
  │     Exchange: czo.events
  │     Routing key: order.checkout.completed
  │     Payload: { orderId, items, total, customerId }
  │
  ▼
RabbitMQ distribue l'event a 3 consumers :
  │
  ├──► Payment Service (queue: payment.orders)
  │      │
  │      │  8. Cree un PaymentIntent Stripe
  │      │  9. Attend la confirmation Stripe (webhook Stripe → Payment Service)
  │      │ 10. Publie: payment.charge.succeeded
  │      │     OU: payment.charge.failed
  │      │
  │      ▼
  │    RabbitMQ distribue payment.charge.succeeded :
  │      │
  │      ├──► Order Service (queue: order.payments)
  │      │      11. Met a jour status: paid
  │      │      12. Publie: order.item.confirmed
  │      │
  │      └──► Notification Service (queue: notification.events)
  │             13. Envoie email "paiement recu"
  │
  ├──► Inventory Service (queue: inventory.orders)
  │      │
  │      │  8b. Reserve le stock pour les items
  │      │  9b. Publie: inventory.stock.reserved
  │      │      OU: inventory.stock.insufficient
  │      │
  │      ▼
  │    Si stock insuffisant :
  │      Order Service recoit l'event → annule la commande
  │      Payment Service recoit l'event → annule le paiement
  │
  └──► App Service (queue: app.webhooks)
         │
         │  8c. Identifie les apps abonnees a order.checkout.completed
         │  9c. Dispatch webhook HTTP a chaque app tierce
         │      (signature HMAC, retries exponentiels)
         │
         ▼
       Apps tierces (Stripe dashboard, ERP, analytics, ...)
```

#### Gestion des Erreurs et Dead Letters

```
┌─ Message original ──────────────────────────────────────────────┐
│  Exchange: czo.events                                            │
│  Routing key: order.checkout.completed                           │
│  Delivery: payment.orders queue                                  │
└──────────────────────────────────────────────────────────────────┘
          │
          │  Payment Service essaie de traiter
          │  Retry 1: Stripe timeout → NACK + requeue
          │  Retry 2: Stripe 500 → NACK + requeue
          │  Retry 3: Stripe 500 → NACK (pas de requeue)
          │
          ▼
┌─ Dead Letter ────────────────────────────────────────────────────┐
│  Exchange: czo.dlx (topic)                                       │
│  Routing key: order.checkout.completed                           │
│  Queue: dlx.payment.orders                                       │
│                                                                  │
│  Headers additionels :                                           │
│    x-death-count: 3                                              │
│    x-first-death-exchange: czo.events                            │
│    x-first-death-queue: payment.orders                           │
│    x-first-death-reason: rejected                                │
└──────────────────────────────────────────────────────────────────┘
          │
          ▼
   Monitoring Service
   → Alerte Slack/PagerDuty
   → Dashboard de messages echoues
   → Bouton "reinjecter" pour retry manuel
```

### Couche 3 : Background Jobs -- OU BULLMQ RESTE

Chaque service qui a besoin de jobs background les traite en interne avec BullMQ. Ces jobs ne sont PAS des events inter-services -- ce sont des taches internes au service.

| Service | Jobs BullMQ internes | Pourquoi BullMQ |
|---------|---------------------|-----------------|
| **Catalog** | Import CSV, traitement images, generation thumbnails | Jobs lourds, priorites, progress tracking |
| **Notification** | Envoi email/SMS avec retries, batch sending | Rate limiting, scheduling, cron |
| **Payment** | Reconciliation quotidienne, rapport comptable | Jobs cron, idempotence |
| **Search** | Re-indexation complete (batch), synonymes | Jobs longs, progress |
| **App** | Webhook retry (apres echec du dispatch initial) | Backoff exponentiel, dead letter |
| **Order** | Archivage commandes anciennes, export | Jobs planifies |

```
┌─ Catalog Service ────────────────────────────────────────────────┐
│                                                                   │
│  ┌─────────────┐    ┌────────────────┐    ┌──────────────────┐  │
│  │ API (Nitro) │    │ Event Consumer │    │ BullMQ Workers   │  │
│  │             │    │ (RabbitMQ)     │    │                  │  │
│  │ GraphQL     │    │                │    │ image-processing │  │
│  │ mutations   │───►│ Reindex on     │    │ csv-import       │  │
│  │             │    │ event receive  │    │ thumbnail-gen    │  │
│  └──────┬──────┘    └────────┬───────┘    └────────▲─────────┘  │
│         │                    │                      │            │
│         │         useQueue('image-processing')      │            │
│         │                .add(jobData)              │            │
│         │                    │                      │            │
│         │                    ▼                      │            │
│         │              ┌──────────┐                 │            │
│         │              │  Redis   │─────────────────┘            │
│         └──────────────►│ (local)  │  BullMQ poll                │
│                        └──────────┘                              │
│                                                                   │
│                     PostgreSQL (catalog_db)                       │
└──────────────────────────────────────────────────────────────────┘
```

**La regle est simple :**
- **RabbitMQ** = communication ENTRE services (events de domaine)
- **BullMQ** = travail INTERNE a un service (background jobs)

---

## Diagramme d'Architecture Cible

### A. Topologie Globale des Services

```
                                Internet
                                   │
                        ┌──────────▼──────────┐
                        │    Load Balancer     │
                        │   (Traefik / Nginx)  │
                        └──────────┬───────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │       API Gateway            │
                    │   (GraphQL Mesh / Router)    │
                    │                              │
                    │  - Schema Federation         │
                    │  - JWT validation            │
                    │  - Rate limiting             │
                    │  - Request routing           │
                    └──┬───┬───┬───┬───┬───┬──────┘
                       │   │   │   │   │   │
          ┌────────────┘   │   │   │   │   └────────────┐
          │      ┌─────────┘   │   │   └──────────┐     │
          │      │      ┌──────┘   └────────┐     │     │
          ▼      ▼      ▼                   ▼     ▼     ▼
       ┌──────┬──────┬──────┐          ┌──────┬──────┬──────┐
       │ Auth │Cata- │Order │          │Pay-  │Search│ App  │
       │ Svc  │log   │ Svc  │          │ment  │ Svc  │ Svc  │
       │      │ Svc  │      │          │ Svc  │      │      │
       └──┬───┴──┬───┴──┬───┘          └──┬───┴──┬───┴──┬───┘
          │      │      │                 │      │      │
          │      │      │   ┌─────────┐   │      │      │
          │      │      └───┤         ├───┘      │      │
          │      └──────────┤ RabbitMQ├──────────┘      │
          └─────────────────┤ Broker  ├─────────────────┘
                            │         │
                            └────┬────┘
                                 │
                            ┌────▼────┐
                            │  DLX    │
                            │ Monitor │
                            └─────────┘

       Chaque service possede :
       ┌──────────────────────────┐
       │  ┌─────┐  ┌──────────┐  │
       │  │Nitro│  │ RabbitMQ │  │
       │  │ API │  │ Consumer │  │
       │  └──┬──┘  └────┬─────┘  │
       │     │          │        │
       │  ┌──▼──────────▼─────┐  │
       │  │    PostgreSQL     │  │
       │  │   (propre DB)     │  │
       │  └───────────────────┘  │
       │  ┌───────────────────┐  │
       │  │ Redis (BullMQ)    │  │
       │  │ (jobs internes)   │  │
       │  └───────────────────┘  │
       └──────────────────────────┘
```

### B. Topologie Detaillee des Exchanges RabbitMQ

```
Producteurs                    Exchanges                        Queues & Consumers
─────────────              ──────────────────              ────────────────────────

                      ┌───────────────────────┐
Auth Service ────────►│                       │
  auth.user.registered│                       ├──► [notification.events]──► Notification Svc
  auth.user.login     │                       │      binding: auth.user.registered
  auth.org.created    │                       │      binding: order.checkout.completed
                      │                       │      binding: payment.charge.*
                      │                       │      binding: inventory.stock.low
Catalog Service ─────►│                       │      binding: product.item.published
  product.item.*      │                       │
  product.collection.*│   czo.events          ├──► [search.indexing]──► Search Svc
                      │   (topic exchange)    │      binding: product.item.*
                      │                       │      binding: product.collection.*
Order Service ───────►│                       │
  order.checkout.*    │                       ├──► [order.payments]──► Order Svc
  order.item.*        │                       │      binding: payment.charge.*
  order.return.*      │                       │      binding: inventory.stock.reserved
                      │                       │      binding: inventory.stock.insufficient
Payment Service ─────►│                       │
  payment.charge.*    │                       ├──► [payment.orders]──► Payment Svc
  payment.refund.*    │                       │      binding: order.checkout.completed
                      │                       │
Inventory Service ───►│                       ├──► [inventory.orders]──► Inventory Svc
  inventory.stock.*   │                       │      binding: order.checkout.completed
                      │                       │      binding: payment.refund.completed
                      │                       │
                      │                       ├──► [catalog.events]──► Catalog Svc
                      │                       │      binding: inventory.stock.low
                      │                       │
                      │                       ├──► [app.webhooks]──► App Svc
                      │                       │      binding: # (TOUS les events)
                      └───────────────────────┘

                      ┌───────────────────────┐
Tout service ────────►│   czo.system          ├──► [auth.system]──► Auth Svc
  config.updated      │   (fanout exchange)   ├──► [catalog.system]──► Catalog Svc
  maintenance.start   │                       ├──► [order.system]──► Order Svc
  shutdown.graceful   │                       ├──► [payment.system]──► Payment Svc
                      │   Broadcast a tous    ├──► [search.system]──► Search Svc
                      └───────────────────────┘    ...etc

                      ┌───────────────────────┐
Messages echoues ────►│   czo.dlx             ├──► [dlx.all]──► DLX Monitor
(apres max retries)   │   (topic exchange)    │
                      │   Dead Letter Exchange│
                      └───────────────────────┘
```

### C. Architecture Donnees : Pattern CQRS pour la Recherche

```
                    Write Path                         Read Path
                    ──────────                         ─────────

Catalog Service                                    Search Service
┌──────────────┐                                  ┌──────────────────┐
│              │                                  │                  │
│  createProduct()                                │  searchProducts()│
│       │      │                                  │       │          │
│       ▼      │     RabbitMQ                     │       ▼          │
│  PostgreSQL  │     product.item.created         │  Meilisearch     │
│  (source     │ ──────────────────────────────►  │  (index          │
│   of truth)  │                                  │   optimise)      │
│              │     product.item.updated         │                  │
│              │ ──────────────────────────────►  │  Donnees         │
│              │                                  │  denormalisees   │
│              │     product.item.deleted         │  pour la         │
│              │ ──────────────────────────────►  │  recherche       │
│              │                                  │                  │
└──────────────┘                                  └──────────────────┘

Le Search Service maintient un index denormalise :
{
  "id": "prod_01HXY789",
  "title": "T-Shirt Bio",
  "description": "...",
  "price": { "EUR": 29.99, "USD": 34.99 },    ← de channel_pricing
  "attributes": { "color": "bleu", "size": "M" },  ← de attributes
  "stock": 42,                                  ← de inventory
  "collections": ["summer-2026"],               ← de collections
  "shopId": "shop_01HXY000"
}
```

### D. Saga Pattern : Commande → Paiement → Inventaire

Pour les transactions distribuees, on utilise le pattern Saga avec compensation :

```
                          Saga: PlaceOrder
                          ────────────────

   HAPPY PATH :

   Order Svc          Payment Svc         Inventory Svc
   ─────────          ───────────         ─────────────
       │                   │                    │
   1.  │ createOrder()     │                    │
       │ (status: pending) │                    │
       │                   │                    │
   2.  │──event: order.checkout.completed──────►│
       │                   │                    │
       │                   │              3.  reserveStock()
       │                   │                  (status: reserved)
       │                   │                    │
       │           ◄──event: inventory.stock.reserved──│
       │                   │                    │
   4.  │──event: order.checkout.completed──►    │
       │                   │                    │
       │             5.  chargeCard()           │
       │                 (Stripe API)           │
       │                   │                    │
       │           ◄──event: payment.charge.succeeded──│
       │                   │                    │
   6.  │ confirmOrder()    │                    │
       │ (status: paid)    │                    │
       │                   │                    │


   COMPENSATION PATH (paiement echoue) :

   Order Svc          Payment Svc         Inventory Svc
   ─────────          ───────────         ─────────────
       │                   │                    │
       │             5.  chargeCard()           │
       │                 ECHEC !                │
       │                   │                    │
       │           ◄──event: payment.charge.failed─────│
       │                   │                    │
   6.  │ cancelOrder()     │                    │
       │ (status: cancelled)                    │
       │                   │                    │
   7.  │──event: order.item.cancelled──────────►│
       │                   │                    │
       │                   │              8. releaseStock()
       │                   │                 (compensation)
       │                   │                    │
```

---

## RabbitMQ vs BullMQ -- Verdict Final

### Dans le Monolithe (Maintenant) : BullMQ est Correct

| Critere | BullMQ | Justification |
|---------|--------|---------------|
| **Infra** | Redis deja present (cache + sessions) | Pas de service supplementaire |
| **Modele** | Job queue (producteur → file → worker) | Correspond au besoin actuel |
| **Complexite** | Minimale | `useQueue().add()` / `useWorker()` |
| **Events** | hookable in-process | Suffisant pour un monolithe |
| **Routing** | Par nom de queue | Pas besoin de routing complexe |
| **Sprint-03** | Workers dans un processus separe | Deja planifie |

**BullMQ excelle pour les jobs background dans un seul service** : traitement d'images, envoi d'emails, import CSV, cron jobs. Son modele mental est simple : "j'ai du travail a faire plus tard".

### Dans les Microservices (Futur) : RabbitMQ est le Bon Choix

| Critere | RabbitMQ | BullMQ | Gagnant |
|---------|----------|--------|---------|
| **Routing** | Topic exchanges, patterns wildcards (`product.item.*`) | Par nom de queue fixe | RabbitMQ |
| **Fan-out** | Fanout exchange : N consumers recoivent le meme message | Pas de fan-out natif (il faut publier N fois) | RabbitMQ |
| **Garanties** | Publisher confirms, persistent delivery, quorum queues | At-least-once via Redis persistence | RabbitMQ |
| **Dead letters** | DLX natif avec routing automatique | Manual dead letter handling | RabbitMQ |
| **Polyglotte** | AMQP 0.9.1 -- clients en Go, Python, Java, Rust, etc. | Node.js uniquement | RabbitMQ |
| **Monitoring** | Management UI integre (HTTP API + dashboard) | Bull Board (add-on) | RabbitMQ |
| **Back-pressure** | QoS (prefetch count) par consumer | Concurrency par worker | Equivalent |
| **Performance** | ~50k msg/sec (suffisant) | ~100k jobs/sec | BullMQ |
| **Simplicite** | Plus complexe (exchanges, bindings, vhosts) | Plus simple (juste Redis) | BullMQ |

**Pourquoi RabbitMQ gagne pour l'inter-service :**

1. **Le modele exchange/binding est fait pour le decoupling.** Le producteur publie sur un exchange sans savoir qui consomme. Les consumers se lient aux patterns qui les interessent. Ajouter un nouveau service qui ecoute `product.item.*` ne necessite aucune modification du Catalog Service.

2. **Le fan-out est natif.** Quand `order.checkout.completed` est publie, il est delivre simultanement a Payment, Inventory, Notification et App. Avec BullMQ, il faudrait publier le meme message dans 4 queues separees.

3. **Les dead letter exchanges resolvent un vrai probleme.** Un message echoue dans le Payment Service atterrit dans une DLX dediee, avec le contexte complet de l'echec. Pas de perte de message, pas de retry infini.

4. **AMQP est un standard.** Si un service est reecrit en Go pour la performance (ex: Inventory), il utilise le meme broker. BullMQ est verrouille sur Node.js.

### L'Approche Hybride (Recommandee)

```
┌────────────────────────────────────────────────────────────────────────┐
│                                                                        │
│   INTER-SERVICE                           INTRA-SERVICE               │
│   (Events de domaine)                     (Background jobs)           │
│                                                                        │
│   ┌──────────────┐                        ┌──────────────┐            │
│   │              │                        │              │            │
│   │  RabbitMQ    │                        │   BullMQ     │            │
│   │              │                        │   (+ Redis)  │            │
│   │  - Exchanges │                        │              │            │
│   │  - Routing   │                        │  - Job queue │            │
│   │  - Fan-out   │                        │  - Workers   │            │
│   │  - DLX       │                        │  - Cron      │            │
│   │              │                        │  - Progress  │            │
│   └──────────────┘                        └──────────────┘            │
│                                                                        │
│   Utilise pour :                          Utilise pour :              │
│   - product.item.created                  - image-processing          │
│   - order.checkout.completed              - csv-import                │
│   - payment.charge.succeeded              - send-email (batch)        │
│   - auth.user.registered                  - daily-reconciliation      │
│   - inventory.stock.low                   - reindex-all (full)        │
│                                                                        │
│   Protocole : AMQP 0.9.1                 Protocole : Redis            │
│   Persistant : oui (disk-backed)          Persistant : oui (Redis AOF)│
│   Fan-out : natif                         Fan-out : non               │
│   Monitoring : Management UI              Monitoring : Bull Board     │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Integration avec le Provider Pattern Existant

Le provider pattern designe dans `brainstorm-tasks.md` s'adapte naturellement a cette architecture hybride. Deux niveaux d'abstraction coexistent :

```typescript
// Niveau 1 : TaskProvider (background jobs intra-service)
// Deja designe dans brainstorm-tasks.md
// BullMQ est le provider par defaut ; Inngest/Trigger.dev possibles

const handle = await useTaskClient().enqueue('image-processing', {
  productId: 'prod_01HXY789',
  imageUrl: 'https://...',
})

// Niveau 2 : EventBus (events de domaine inter-service)
// NOUVEAU : abstraction au-dessus de RabbitMQ pour microservices
// Fallback sur hookable pour le monolithe

interface EventBus {
  /** Publie un event de domaine */
  publish<K extends keyof EventMap>(
    event: K,
    payload: EventMap[K],
    metadata?: EventMetadata,
  ): Promise<void>

  /** S'abonne a un pattern d'events */
  subscribe(
    pattern: string,   // ex: 'product.item.*'
    handler: EventHandler,
  ): Promise<() => void>

  /** Ferme les connexions */
  shutdown(): Promise<void>
}

// Provider pattern pour l'EventBus
interface EventBusProvider {
  name: 'hookable' | 'rabbitmq'
  createEventBus(config: EventBusConfig): EventBus
}

// Monolithe (actuel) : hookable provider
// emit() appelle les handlers in-process
const bus = createHookableEventBus()

// Microservices (futur) : RabbitMQ provider
// publish() envoie via AMQP, subscribe() cree un consumer
const bus = createRabbitMQEventBus({
  url: 'amqp://rabbitmq:5672',
  exchange: 'czo.events',
})
```

**Compatibilite descendante** : dans le monolithe, `EventBus.publish()` delegue a l'`EventEmitter` hookable existant. La migration est transparente pour les modules consumers.

---

## Strategie de Migration (Strangler Fig)

Le pattern Strangler Fig consiste a extraire progressivement les services du monolithe, en les remplacant un par un, sans big-bang migration.

### Phase 0 : Preparer le Monolithe (Sprint actuel → Sprint-05)

**Objectif** : faire evoluer l'architecture interne sans changer le deploiement.

```
Avant (actuel) :
  EventEmitter (hookable, in-process)
     emit('product:created')  →  handler1(), handler2()

Apres Phase 0 :
  EventBus (dual-write)
     publish('product.item.created')
       → hookable handlers (in-process, comme avant)
       → RabbitMQ (si configure, pour preparer l'extraction)
```

Actions :
- [ ] Ajouter RabbitMQ au docker-compose.dev.yml
- [ ] Implementer `createRabbitMQEventBus()` dans `@czo/kit`
- [ ] Creer l'abstraction `EventBus` avec le provider pattern
- [ ] Migrer les `emit()` hookable vers `EventBus.publish()`
- [ ] Convention de routing keys : `<domaine>.<entite>.<action>`
- [ ] Configurer le dual-write : hookable + RabbitMQ en parallele
- [ ] Ajouter `correlationId` a tous les events

**Resultat** : le monolithe publie sur RabbitMQ, mais continue de traiter les events in-process. RabbitMQ recoit les messages mais personne ne les consomme encore (sauf pour monitoring/debug).

### Phase 1 : Extraire le Auth Service (Premier service)

**Pourquoi Auth en premier :**
- Service transversal, peu de dependances entrantes
- API bien definie (login, register, verify token, check permission)
- Pas de transactions partagees avec d'autres modules
- Benefice immediat : isolation des donnees sensibles

```
                    Phase 1
                    ───────

┌─ API Gateway ──────────────────────────────────────────────────┐
│  GraphQL Mesh                                                   │
│                                                                 │
│  Requetes auth → Auth Service (nouveau, standalone)            │
│  Autres requetes → Monolithe (Nitro)                           │
└────────┬──────────────────────────┬────────────────────────────┘
         │                          │
         ▼                          ▼
┌─ Auth Service ──────┐    ┌─ Monolithe (Nitro) ──────────────┐
│  better-auth         │    │  Product + Attribute + Channel   │
│  Standalone Nitro    │    │  Order + Payment + ... (tout)     │
│                      │    │                                   │
│  PostgreSQL (auth)   │    │  PostgreSQL (tout sauf auth)     │
│                      │    │                                   │
│  Publie :            │    │  Consomme : auth.user.registered │
│  auth.user.registered│    │  (via RabbitMQ)                   │
│  auth.session.created│    │                                   │
└──────────┬───────────┘    └──────────┬────────────────────────┘
           │                           │
           └───────────┬───────────────┘
                       │
                  ┌────▼────┐
                  │RabbitMQ │
                  └─────────┘
```

Actions :
- [ ] Creer `apps/auth-service/` (Nitro standalone)
- [ ] Migrer les tables auth dans leur propre schema/DB
- [ ] Exposer un schema GraphQL federe pour auth
- [ ] Les autres modules appellent Auth via tRPC/gRPC pour la verification de tokens
- [ ] Events auth publies sur RabbitMQ
- [ ] Le monolithe consomme les events auth via RabbitMQ (plus via hookable)
- [ ] Mettre en place le API Gateway (GraphQL Mesh)

### Phase 2 : Extraire le Catalog Service (Product + Attribute + Channel)

**Pourquoi ensuite :**
- Module le plus mature (product est deja implemente)
- Fort trafic en lecture (vitrine du shop)
- Besoin de scaling independant

```
                    Phase 2
                    ───────

┌─ API Gateway ──────────────────────────────────────────────────┐
│  GraphQL Mesh                                                   │
│                                                                 │
│  auth → Auth Service                                           │
│  products, attributes, channels → Catalog Service              │
│  orders, payment, inventory, ... → Monolithe (reste)           │
└────────┬──────────────┬────────────────────┬───────────────────┘
         │              │                    │
         ▼              ▼                    ▼
  Auth Service    Catalog Service     Monolithe (reduit)
                  ┌──────────────┐
                  │ Product      │
                  │ Attribute    │
                  │ Channel      │
                  │              │
                  │ PostgreSQL   │
                  │ (catalog)    │
                  │              │
                  │ Redis        │
                  │ (BullMQ)     │
                  │ images, CSV  │
                  └──────────────┘
```

### Phase 3 : Extraire Order + Payment

**Pourquoi ensemble puis separer :**
- D'abord extraire ensemble pour simplifier les transactions locales
- Puis separer Order et Payment quand le saga pattern est stable
- Payment est sensible (PCI DSS considerations)

### Phase 4 : Extraire Inventory, Search, Notification

**Les services "easy-win" :**
- Inventory : peu de dependances, profil de charge previsible
- Search : deja un index separe (Meilisearch), juste consumer d'events
- Notification : completement asynchrone, consomme des events

### Phase 5 : Extraire App Service

**Dernier car :**
- Le App Service ecoute TOUS les events (`#` binding)
- Il doit etre stable quand la topologie RabbitMQ est finalisee
- C'est un service de "plomberie" qui depend de tous les autres

### Calendrier Indicatif

```
2026         Q1              Q2              Q3              Q4
             ┌───────────────┬───────────────┬───────────────┬──────────┐
Monolithe    │███████████████│███████████████│███████████████│          │
             │ Sprints 1-5   │ Feature dev   │ Stabilisation │          │
             │ Kit, Auth     │ Order, Pay    │               │          │
             └───────────────┴───────────────┴───────────────┴──────────┘

Phase 0      │  ████████████ │               │               │          │
Preparer     │  RabbitMQ,    │               │               │          │
             │  EventBus     │               │               │          │

Phase 1                      │  ████████     │               │          │
Auth Svc                     │  Extraire auth│               │          │

Phase 2                                      │  ████████     │          │
Catalog Svc                                  │  Extraire     │          │
                                             │  catalogue    │          │

Phase 3-5                                                    │██████████│
Reste                                                        │Order,Pay │
                                                             │Inv,Notif │
                                                             │Search,App│

DECLENCHEUR : equipe > 5 devs ET/OU problemes de scaling reels
             Sans declencheur, le monolithe suffit indefiniment.
```

---

## Considerations Operationnelles

### Environnement de Developpement Local

```yaml
# docker-compose.dev.yml (etendu pour microservices)
services:
  # --- Infrastructure partagee ---
  postgres:
    image: postgres:17
    ports: ["5432:5432"]
    # Chaque service a son propre schema dans la meme instance
    # (en prod, chaque service a sa propre instance)

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  rabbitmq:
    image: rabbitmq:3-management-alpine
    ports:
      - "5672:5672"    # AMQP
      - "15672:15672"  # Management UI
    environment:
      RABBITMQ_DEFAULT_USER: czo
      RABBITMQ_DEFAULT_PASS: czo_dev

  meilisearch:
    image: getmeili/meilisearch:v1
    ports: ["7700:7700"]

  # --- Services (en mode monolithe, un seul service) ---
  mazo:
    build: ./apps/mazo
    depends_on: [postgres, redis, rabbitmq]
    environment:
      NITRO_CZO_DATABASE_URL: postgresql://czo:czo@postgres:5432/czo_dev
      NITRO_CZO_REDIS_URL: redis://redis:6379
      NITRO_CZO_RABBITMQ_URL: amqp://czo:czo_dev@rabbitmq:5672

  # --- En mode microservices (Phase 1+) ---
  # auth-service:
  #   build: ./apps/auth-service
  #   depends_on: [postgres, rabbitmq]
  #   environment:
  #     NITRO_CZO_DATABASE_URL: postgresql://czo:czo@postgres:5432/czo_auth
  #
  # catalog-service:
  #   build: ./apps/catalog-service
  #   depends_on: [postgres, redis, rabbitmq]
  #   environment:
  #     NITRO_CZO_DATABASE_URL: postgresql://czo:czo@postgres:5432/czo_catalog
```

### Production (Kubernetes)

```yaml
# Architecture K8s cible
#
# Namespace: czo-production
#
# Deployments:
#   api-gateway        (2-4 replicas, HPA sur CPU)
#   auth-service       (2-3 replicas, HPA sur requests/sec)
#   catalog-service    (3-6 replicas, HPA sur CPU -- le plus scalable)
#   order-service      (2-4 replicas)
#   payment-service    (2-3 replicas)
#   inventory-service  (2-3 replicas)
#   notification-svc   (1-2 replicas -- async, pas critique en latence)
#   search-service     (2-3 replicas)
#   app-service        (1-2 replicas)
#
# StatefulSets:
#   rabbitmq           (3 nodes, quorum queues)
#   redis              (3 nodes, sentinel)
#
# External:
#   PostgreSQL         (RDS / CloudNativePG operator, une instance par service)
#   Meilisearch        (StatefulSet ou cloud)
#
# Ingress:
#   Traefik IngressRoute → api-gateway
#   Traefik IngressRoute → paiya (Next.js)
```

### Observabilite

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Observability Stack                           │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │   Tracing    │  │   Metrics    │  │   Logging    │             │
│  │              │  │              │  │              │             │
│  │  Jaeger /    │  │  Prometheus  │  │   Loki /     │             │
│  │  Tempo       │  │  + Grafana   │  │   Grafana    │             │
│  │              │  │              │  │              │             │
│  │  Traces      │  │  - Latence   │  │  Logs        │             │
│  │  distribuees │  │    p50/p99   │  │  structures  │             │
│  │  cross-svc   │  │  - Queue     │  │  par service │             │
│  │              │  │    depth     │  │              │             │
│  │  correlationId│  │  - Error    │  │  correlationId            │
│  │  propage via │  │    rate      │  │  dans chaque │             │
│  │  headers     │  │  - RabbitMQ  │  │  log line    │             │
│  │  HTTP et     │  │    metrics   │  │              │             │
│  │  AMQP        │  │              │  │              │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
│                                                                     │
│  Protocol : OpenTelemetry (OTLP)                                   │
│  Chaque service exporte traces + metrics + logs via OTLP           │
│  Le correlationId est propage dans :                                │
│    - HTTP headers (X-Correlation-Id)                                │
│    - AMQP message properties (correlation_id)                       │
│    - Logs (structured field)                                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### CI/CD par Service

```
monorepo/
├── .github/workflows/
│   ├── ci-auth.yml          # Triggered par changes dans apps/auth-service/**
│   ├── ci-catalog.yml       # Triggered par changes dans packages/modules/product/**
│   ├── ci-order.yml         #   ou apps/catalog-service/**
│   ├── ci-shared.yml        # Triggered par changes dans packages/kit/**
│   └── deploy.yml           # Deploy individuel par service
│
├── apps/
│   ├── mazo/                # Monolithe (tant qu'il existe)
│   ├── auth-service/        # Phase 1
│   ├── catalog-service/     # Phase 2
│   └── paiya/               # Frontend (toujours un seul deploy)
│
└── packages/
    ├── kit/                 # Shared — tout changement ici rebuild tous les services
    └── modules/
        ├── product/         # Shared code — utilise par catalog-service
        └── auth/            # Shared code — utilise par auth-service
```

**Regle de rebuild :** un changement dans `packages/kit/` declenche le rebuild de TOUS les services (car tous en dependent). Un changement dans `packages/modules/product/` ne rebuild que le Catalog Service.

---

## Quand Passer aux Microservices -- Framework de Decision

### Declencheurs Positifs (Il est TEMPS de split)

| Declencheur | Seuil | Signal |
|-------------|-------|--------|
| **Taille de l'equipe** | > 5 developpeurs avec specialisation par domaine | Les devs du paiement et du catalogue se marchent sur les pieds |
| **Scaling independant** | Un module consomme > 60% des ressources | Le Search Service a besoin de 10x plus de CPU que l'Auth |
| **Frequence de deploiement** | > 5 deploys/jour avec conflits | Un hotfix paiement bloque le deploy du catalogue |
| **Temps de build** | > 15 minutes pour le monolithe | Le CI/CD devient un bottleneck |
| **Blast radius** | Un bug dans un module crashe tout | OOM dans le worker d'images tue les sessions GraphQL |
| **Divergence techno** | Un module a besoin d'un autre runtime | ML en Python pour les recommandations, Go pour l'inventaire |
| **Multi-region** | Deploiement dans plusieurs regions | L'auth doit etre proche de l'utilisateur, le catalogue peut etre centralise |

### Anti-Patterns (Il est TROP TOT pour split)

| Signal | Raison de ne PAS split |
|--------|------------------------|
| Equipe de 1-3 devs | Overhead operationnel > benefice de separation |
| Pas de probleme de scaling | "Microservices pour le CV" n'est pas une raison |
| Bounded contexts flous | Si product et attribute ne sont pas clairement separes, ne pas les mettre dans des services differents |
| Pas de CI/CD mature | Les microservices sans CI/CD automatise sont un cauchemar |
| Pas de monitoring | Impossible de debugger un systeme distribue sans observabilite |
| Les transactions sont critiques | Si le checkout DOIT etre ACID (pas eventual consistency), garder le monolithe |

### Checklist de Pret

Avant de lancer Phase 1, ces conditions doivent etre remplies :

- [ ] EventBus avec provider pattern implemente et en production
- [ ] RabbitMQ en production depuis > 3 mois (stabilite)
- [ ] Monitoring et tracing distribue en place (OpenTelemetry)
- [ ] CI/CD automatise pour chaque service potentiel
- [ ] Docker/Kubernetes operationnel pour le deploiement
- [ ] L'equipe a de l'experience avec les systemes distribues
- [ ] Au moins un bounded context clairement identifie pour l'extraction
- [ ] Runbook pour les pannes de RabbitMQ (quorum queues, mirroring)
- [ ] Tests d'integration inter-services automatises

---

## Risques & Hypotheses

### Hypotheses a Valider

- [ ] **GraphQL Federation fonctionne bien avec graphql-yoga** : verifier que GraphQL Mesh compose correctement les schemas de services Nitro/Yoga
- [ ] **RabbitMQ quorum queues sont suffisamment performantes** : tester avec le volume attendu (milliers de messages/min, pas millions)
- [ ] **Le saga pattern est geerable sans framework** : ou faut-il un orchestrateur (Temporal, etc.) ?
- [ ] **tRPC est viable pour les appels inter-services** : ou faut-il gRPC des le debut ?
- [ ] **Le dual-write (hookable + RabbitMQ) ne cause pas de problemes de coherence** : si le publish RabbitMQ echoue mais le handler hookable a deja execute
- [ ] **Meilisearch supporte le volume multi-tenant** : un index par shop ou un index global avec filtrage ?
- [ ] **L'equipe peut supporter l'overhead operationnel** : monitoring, debugging distribue, gestion de N services

### Risques

| Risque | Probabilite | Impact | Mitigation |
|--------|-------------|--------|------------|
| **Complexite operationnelle prematuree** | Elevee | Eleve | Ne pas migrer tant que les declencheurs ne sont pas atteints. Ce document est un plan, pas un calendrier. |
| **Latence reseau entre services** | Moyenne | Moyen | Cache agressif, batching des appels, GraphQL DataLoader, co-localisation dans le meme cluster K8s |
| **Consistance eventuelle mal geree** | Moyenne | Eleve | Idempotence de tous les handlers, outbox pattern pour les events critiques, monitoring des DLX |
| **Data duplication et derive** | Moyenne | Moyen | Source of truth clairement definie par service, events comme unique canal de sync |
| **Perte de messages RabbitMQ** | Faible | Eleve | Quorum queues, publisher confirms, persistent messages, monitoring queue depth |
| **Debugging distribue difficile** | Elevee | Moyen | OpenTelemetry des Phase 0, correlationId dans tous les messages, logs structures |
| **Over-engineering** | Elevee | Moyen | Ce document est exploratoire. Ne rien implementer sans declencheur reel. |
| **GraphQL N+1 entre services** | Moyenne | Moyen | DataLoader par service, query planning au niveau du gateway |
| **Schema evolution des messages** | Moyenne | Moyen | Versionner les events (champ `version`), consumer tolerant reader pattern |
| **Couplage temporel (service down)** | Moyenne | Moyen | Les queues RabbitMQ bufferisent les messages. Un service down rattrape son retard au redemarrage. |

### Cout Operationnel Estime

| Aspect | Monolithe (actuel) | Microservices (cible) |
|--------|-------------------|----------------------|
| **Services a deployer** | 1 (Nitro) + 1 (Workers) | 8-10 services |
| **Bases de donnees** | 1 PostgreSQL | 6-8 PostgreSQL |
| **Infrastructure additionnel** | Redis | Redis + RabbitMQ + Meilisearch |
| **Monitoring** | Basique (logs) | OpenTelemetry + Jaeger + Grafana |
| **CI/CD** | 1 pipeline | 8-10 pipelines |
| **Temps de debug (p50)** | 10 min | 30-60 min |
| **Cout cloud (estime)** | ~100-200 USD/mois | ~500-1000 USD/mois |
| **Connaissance requise** | Node.js, PostgreSQL | + K8s, AMQP, distributed systems |

---

## Questions Ouvertes

- [ ] GraphQL Mesh vs Apollo Router vs Hive Gateway pour la federation ?
- [ ] tRPC vs gRPC pour l'inter-service sync ? (recommandation : tRPC d'abord)
- [ ] Un RabbitMQ partage ou un par "equipe de services" ?
- [ ] Outbox pattern necessaire pour garantir la publication d'events apres commit DB ?
- [ ] Comment gerer les migrations de schema DB quand chaque service a sa propre DB ?
- [ ] Temporal/Conductor pour les sagas, ou implementation manuelle ?
- [ ] Comment tester l'integration inter-services en CI ? (contract testing avec Pact ?)
- [ ] API Gateway : un seul pour storefront + dashboard, ou deux (BFF pattern) ?
- [ ] Comment le systeme d'apps (webhooks externes) coexiste avec le App Service ?
- [ ] Redis partage (un cluster) ou un Redis par service ?

---

## Prochaines Etapes

### Court Terme (Sprints 03-05, dans le monolithe)

- [ ] Sprint-03 : Separation des workers (deja planifie)
- [ ] Sprint-04 : Implementer le provider pattern pour les tasks (brainstorm-tasks.md)
- [ ] Sprint-05 : Implementer l'abstraction `EventBus` avec dual-write hookable + RabbitMQ
- [ ] Ajouter RabbitMQ au docker-compose.dev.yml
- [ ] Ajouter `correlationId` a l'`EventContext` existant (deja prevu dans le type)
- [ ] Convention de nommage `<domaine>.<entite>.<action>` pour les events

### Moyen Terme (Quand les declencheurs apparaissent)

- [ ] Evaluer GraphQL Mesh comme API Gateway
- [ ] Prototype : extraire Auth en service standalone
- [ ] Mettre en place OpenTelemetry et tracing distribue
- [ ] CI/CD per-service avec Turborepo + GitHub Actions

### Long Terme (Architecture cible)

- [ ] Migration progressive selon le Strangler Fig pattern
- [ ] Kubernetes avec auto-scaling par service
- [ ] Contract testing inter-services (Pact)
- [ ] Saga orchestration (Temporal si necessaire)

---

## References

- [brainstorm.md](./brainstorm.md) -- Brainstorm original du kit (events, queue, hooks, apps)
- [brainstorm-tasks.md](./brainstorm-tasks.md) -- Provider pattern pour les background tasks
- [brainstorm-split.md](./brainstorm-split.md) -- Decision de garder kit comme un seul package
- [sprints/sprint-03.md](./sprints/sprint-03.md) -- Separation des workers BullMQ
- [RabbitMQ Tutorials](https://www.rabbitmq.com/tutorials) -- Exchanges, routing, dead letters
- [GraphQL Mesh Documentation](https://the-guild.dev/graphql/mesh) -- Federation pour le gateway
- [Strangler Fig Pattern (Martin Fowler)](https://martinfowler.com/bliki/StranglerFigApplication.html)
- [Saga Pattern (Chris Richardson)](https://microservices.io/patterns/data/saga.html)
- [CQRS Pattern](https://microservices.io/patterns/data/cqrs.html)
- [Outbox Pattern](https://microservices.io/patterns/data/transactional-outbox.html)
- [OpenTelemetry for Node.js](https://opentelemetry.io/docs/languages/js/)

---

## Notes de Session

**Decisions cles prises dans ce brainstorm :**

1. **Ceci est un exercice preparatoire**, pas une decision de migrer
2. **Le monolithe modulaire est correct pour aujourd'hui** -- les microservices sont l'architecture cible SI les declencheurs apparaissent
3. **Modele hybride** : RabbitMQ pour l'inter-service (events de domaine), BullMQ pour l'intra-service (background jobs)
4. **RabbitMQ topology** : un topic exchange principal (`czo.events`), un fanout (`czo.system`), un DLX (`czo.dlx`)
5. **Routing key convention** : `<domaine>.<entite>.<action>`
6. **Schema de message** : enveloppe standard avec `id`, `type`, `version`, `correlationId`, `data`, `metadata`
7. **Ordre d'extraction** : Auth → Catalog → Order+Payment → Inventory/Search/Notification → App
8. **API Gateway** : GraphQL Mesh (compatible yoga, open source)
9. **Service-to-service sync** : tRPC d'abord, gRPC si polyglotte
10. **EventBus abstraction** : etend le provider pattern existant, compatible avec hookable (monolithe) et RabbitMQ (microservices)
11. **Phase 0 critique** : le dual-write hookable+RabbitMQ dans le monolithe est le pont vers les microservices
12. **Ne PAS migrer avant** : equipe > 5 devs, problemes de scaling reels, CI/CD mature, monitoring en place
