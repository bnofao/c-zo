# PRD: Architecture Microservices c-zo

**Status**: Draft
**Author**: Claude (Briana)
**Created**: 2026-02-09
**Last Updated**: 2026-02-09
**Brainstorm**: [brainstorm-microservices.md](./brainstorm-microservices.md)
**PRD Kit (parent)**: [prd.md](./prd.md)

---

## 1. Overview

Ce PRD definit la strategie d'evolution de c-zo depuis un **monolithe modulaire** vers une **architecture microservices**. L'objectif n'est pas de migrer immediatement, mais de **preparer le monolithe** pour que l'extraction future de services soit naturelle et incrementale lorsque les conditions le justifieront.

La strategie repose sur trois piliers :
1. **Abstraction EventBus** avec provider pattern (hookable pour le monolithe, RabbitMQ pour les microservices)
2. **Modele hybride de communication** : RabbitMQ pour l'inter-service, BullMQ pour l'intra-service
3. **Migration Strangler Fig** : extraction progressive des services, commencant par Auth puis Catalog

**Important :** ce document est **preparatoire**. Aucune migration ne doit etre lancee sans que les declencheurs definis dans la section "Framework de Decision" soient atteints.

## 2. Problem Statement

### Current State

c-zo est un monolithe modulaire bien structure. Les bounded contexts (product, attribute, auth, channel) sont separes en packages NPM distincts, mais s'executent tous dans un seul processus Nitro. Cette architecture presente des forces significatives :

- **Simplicite operationnelle** : un processus, un deploiement, un build
- **Coherence transactionnelle** : une transaction PostgreSQL couvre product + attribute
- **Latence minimale** : les appels entre modules sont des appels de fonction
- **Debug facilite** : une seule stack trace, un seul log stream
- **IoC partage** : `useContainer()` donne acces a tous les services
- **Config unifiee** : `useCzoConfig()` centralise database, Redis, queue

### Limitations Emergentes

Ces limitations ne sont pas bloquantes aujourd'hui (equipe 1-3 devs), mais emergeront avec la croissance :

| Limitation | Description | Impact |
|-----------|-------------|--------|
| **Couplage au deploiement** | Un fix paiement oblige a redeployer l'ensemble | Risque de regression, downtime inutile |
| **Scaling uniforme** | Impossible de scaler la recherche independamment de l'auth | Surcout infrastructure |
| **Blast radius** | Un OOM dans un worker tue le serveur HTTP et les sessions GraphQL | Indisponibilite totale |
| **Autonomie des equipes** | Les developpeurs du paiement coordonnent leurs releases avec le catalogue | Velocity reduite |
| **Events in-process** | L'`EventEmitter` hookable est synchrone et in-process | Latence accumulee des handlers |

### Target State

Une architecture ou :
- Chaque bounded context peut etre deploye, scale et evoluer independamment
- Les events de domaine transitent par un broker de messages (RabbitMQ)
- Les jobs background restent geres par BullMQ a l'interieur de chaque service
- Un API Gateway (GraphQL Mesh) federe les schemas des services
- Le monitoring distribue (OpenTelemetry) permet le debugging cross-service

### Qui est Affecte

| Persona | Impact Actuel | Benefice Cible |
|---------|--------------|----------------|
| **Equipe ops** | Un seul process a gerer, mais impossible de scaler les composants | Scaling independant par service |
| **Developpeurs de modules** | Coordination des releases, blast radius des bugs | Deploiements independants, isolation des pannes |
| **Marchands (multi-tenant)** | Un shop a fort trafic impacte tous les autres | Isolation de charge par service |
| **Integrateurs tiers** | Webhooks dispatches depuis le meme process | Service d'apps dedie, dispatch distribue |

### Impact

- **Developpeurs** : deploiements independants, reduction du blast radius
- **Operations** : scaling granulaire, observabilite cross-service
- **Business** : resilience accrue, capacite multi-region
- **Cout** : augmentation de ~3-5x du cout infrastructure (de ~100-200 a ~500-1000 USD/mois)

## 3. Goals

### Primary Goals

- [ ] Implementer l'abstraction EventBus avec provider pattern, compatible avec le monolithe actuel (hookable) et les microservices futurs (RabbitMQ)
- [ ] Definir un standard de schema pour les events de domaine (envelope avec id, type, version, correlationId, data, metadata)
- [ ] Integrer RabbitMQ dans l'infrastructure de developpement locale
- [ ] Documenter le framework de decision pour savoir QUAND migrer
- [ ] Preparer le monolithe (Phase 0) sans modifier le deploiement actuel

### Non-Goals (Out of Scope)

- **Migration immediate** : on ne migre pas tant que les declencheurs ne sont pas atteints
- **Remplacement de BullMQ** : BullMQ reste l'outil pour les jobs internes a chaque service
- **Infrastructure Kubernetes** : le deploiement K8s est hors scope tant que le monolithe suffit
- **Services non-TypeScript** : tous les services restent TypeScript/Nitro (pas de Go, Python)
- **Multi-region** : hors scope des premieres phases
- **CQRS complet** : le pattern CQRS pour la recherche est documente mais pas implemente dans Phase 0

## 4. Success Metrics

| Metric | Target | Mesure | Timeline |
|--------|--------|--------|----------|
| Abstraction EventBus fonctionnelle | 100% des events passent par EventBus | Audit du code, aucun `emit()` hookable direct | Phase 0 |
| Dual-write stable | 0 perte de message en dual-write hookable + RabbitMQ | Monitoring queue RabbitMQ vs events hookable | Phase 0 + 3 mois |
| Schema standard adopte | 100% des events suivent l'envelope DomainEvent | Linter / validation schema | Phase 0 |
| Latence EventBus (hookable provider) | < 10ms p95 | APM monitoring | Phase 0 |
| RabbitMQ uptime dev | > 99% | Docker health checks | Phase 0 |
| Couverture tests EventBus | 80%+ | Vitest coverage | Phase 0 |

### Framework de Decision -- Declencheurs de Migration

La migration vers les microservices est declenchee par ces conditions (au moins 2 doivent etre remplies) :

| Declencheur | Seuil | Signal Observable |
|-------------|-------|-------------------|
| **Taille de l'equipe** | > 5 developpeurs avec specialisation par domaine | Les devs du paiement et du catalogue se marchent sur les pieds |
| **Scaling independant** | Un module consomme > 60% des ressources | Profils de charge radicalement differents entre services |
| **Frequence de deploiement** | > 5 deploys/jour avec conflits | Un hotfix paiement bloque le deploy catalogue |
| **Temps de build** | > 15 minutes pour le monolithe | CI/CD devient un bottleneck |
| **Blast radius** | Un bug dans un module crashe tout | OOM dans un worker tue les sessions GraphQL |
| **Divergence techno** | Un module a besoin d'un autre runtime | ML en Python, Go pour l'inventaire |

### Anti-Patterns (Ne PAS Migrer Si)

| Signal | Raison |
|--------|--------|
| Equipe de 1-3 devs | Overhead operationnel > benefice de separation |
| Pas de probleme de scaling | "Microservices pour le CV" n'est pas une raison |
| Bounded contexts flous | Si les modules ne sont pas clairement separes, ne pas les extraire |
| Pas de CI/CD mature | Microservices sans CI/CD automatise = cauchemar |
| Pas de monitoring | Impossible de debugger un systeme distribue sans observabilite |
| Transactions ACID critiques | Si le checkout DOIT etre ACID, garder le monolithe |

## 5. Features and Requirements

### Must-Have Features (P0) -- Phase 0 : Preparer le Monolithe

#### Feature 1 : EventBus Abstraction avec Provider Pattern

- **Description :** Abstraction `EventBus` au-dessus du systeme d'events actuel, avec un provider pattern permettant de switcher entre le backend hookable (monolithe) et RabbitMQ (microservices) sans modifier le code des modules consommateurs.
- **User Story :** En tant que developpeur de module, je veux publier des events de domaine via une API unifiee, pour que mon code fonctionne identiquement en monolithe et en microservices.
- **Acceptance Criteria :**
  - [ ] **Interface `EventBus`** avec les methodes :
    - [ ] `publish<K>(event, payload, metadata?)` : publie un event de domaine
    - [ ] `subscribe(pattern, handler)` : s'abonne a un pattern d'events (ex: `product.item.*`)
    - [ ] `shutdown()` : ferme les connexions proprement
  - [ ] **Provider `hookable`** (backward compatible) :
    - [ ] Delegue a l'`EventEmitter` hookable existant
    - [ ] Fonctionne sans configuration supplementaire
    - [ ] Aucune regression pour les modules existants
  - [ ] **Provider `rabbitmq`** (futur microservices) :
    - [ ] `publish()` envoie via AMQP sur l'exchange `czo.events`
    - [ ] `subscribe()` cree un consumer RabbitMQ avec binding pattern
    - [ ] Configuration via `runtimeConfig.czo.rabbitmq`
    - [ ] Gestion de la connexion (reconnexion automatique)
  - [ ] **Mode dual-write** (transition) :
    - [ ] Emet simultanement sur hookable ET RabbitMQ
    - [ ] Permet de valider que RabbitMQ recoit les memes events
    - [ ] Activable via config : `eventBus.dualWrite: true`
  - [ ] **Configuration** :
    - [ ] Provider selectionnable via `runtimeConfig.czo.eventBus.provider: 'hookable' | 'rabbitmq'`
    - [ ] Fallback automatique sur hookable si RabbitMQ non configure
  - [ ] **Tests** :
    - [ ] Tests unitaires pour chaque provider
    - [ ] Tests d'integration pour le dual-write
    - [ ] Couverture >= 80%
- **Dependencies :** hookable (existant), amqplib (nouveau)

#### Feature 2 : Standard de Schema des Events de Domaine

- **Description :** Convention de nommage et format d'enveloppe standard pour tous les events de domaine. Garantit l'interoperabilite entre services et la tracabilite des events.
- **User Story :** En tant que developpeur, je veux un format standard pour les events, pour que chaque service puisse les deserialiser et les tracer de maniere uniforme.
- **Acceptance Criteria :**
  - [ ] **Interface `DomainEvent<T>`** :
    ```typescript
    interface DomainEvent<T = unknown> {
      id: string              // Identifiant unique (idempotence)
      type: string            // Routing key (= event type)
      version: number         // Version du schema
      timestamp: string       // ISO 8601
      source: string          // Service emetteur
      correlationId: string   // Tracing distribue
      data: T                 // Payload specifique
      metadata: {
        shopId?: string       // Multi-tenant
        actorId?: string      // User ou app
        actorType?: 'user' | 'app' | 'system'
      }
    }
    ```
  - [ ] **Convention de routing key** : `<domaine>.<entite>.<action>`
    - Exemples : `product.item.created`, `order.checkout.completed`, `auth.user.registered`
  - [ ] **Fonction factory** : `createDomainEvent(type, data, metadata)` qui genere automatiquement `id`, `timestamp`, et `correlationId` (ou le propage depuis le contexte)
  - [ ] **Type safety** via module augmentation :
    ```typescript
    declare module '@czo/kit' {
      interface EventMap {
        'product.item.created': ProductCreatedPayload
        'order.checkout.completed': CheckoutCompletedPayload
      }
    }
    ```
  - [ ] **Validation** : schema Zod pour valider les events entrants
  - [ ] **Migration** : guide de migration depuis les event names actuels (ex: `product:created` vers `product.item.created`)
- **Dependencies :** Zod (existant)

#### Feature 3 : Infrastructure RabbitMQ

- **Description :** Integration de RabbitMQ dans l'environnement de developpement local et definition de la topologie des exchanges.
- **User Story :** En tant que developpeur, je veux que RabbitMQ soit disponible localement via Docker Compose, pour pouvoir developper et tester le provider RabbitMQ de l'EventBus.
- **Acceptance Criteria :**
  - [ ] **Docker Compose** :
    - [ ] Service `rabbitmq` ajoute a `docker-compose.dev.yml`
    - [ ] Image : `rabbitmq:3-management-alpine`
    - [ ] Ports : `5672` (AMQP), `15672` (Management UI)
    - [ ] Credentials : configurable via `.env`
  - [ ] **Topologie des exchanges** :
    - [ ] `czo.events` (topic exchange) : exchange principal pour tous les events de domaine
    - [ ] `czo.system` (fanout exchange) : events systeme diffuses a tous les services (config.updated, maintenance.start, shutdown.graceful)
    - [ ] `czo.dlx` (topic exchange) : Dead Letter Exchange pour les messages echoues apres retries
  - [ ] **Configuration** :
    - [ ] `runtimeConfig.czo.rabbitmq.url` : URL de connexion AMQP
    - [ ] `runtimeConfig.czo.rabbitmq.exchanges` : noms des exchanges (avec defaults)
    - [ ] `runtimeConfig.czo.rabbitmq.prefetchCount` : QoS par consumer (default: 10)
  - [ ] **Script d'initialisation** : creation automatique des exchanges au demarrage du provider RabbitMQ
  - [ ] **Health check** : endpoint `/api/_health/rabbitmq` pour verifier la connexion
- **Dependencies :** Docker, amqplib

### Should-Have Features (P1) -- Phase 1-2 : Premieres Extractions

#### Feature 4 : API Gateway (GraphQL Federation)

- **Description :** Un API Gateway base sur GraphQL Mesh qui federe les schemas GraphQL de chaque service extrait. Le gateway gere la composition des schemas, la validation des tokens, le rate limiting et le routing.
- **User Story :** En tant que client frontend (Next.js), je veux continuer a envoyer mes requetes GraphQL a un seul endpoint, meme si les services backend sont distribues.
- **Acceptance Criteria :**
  - [ ] **GraphQL Mesh** configure comme gateway :
    - [ ] Compose les schemas des services extraits et du monolithe restant
    - [ ] Route les requetes vers le bon service selon le type GraphQL
    - [ ] Supporte `@key` directives pour la resolution cross-service
  - [ ] **Validation d'authentification au niveau du gateway** :
    - [ ] Validation du JWT en appelant le Auth Service (sync)
    - [ ] Propagation du contexte utilisateur vers les services downstream
  - [ ] **Rate limiting** :
    - [ ] Par shop (multi-tenant)
    - [ ] Par API key (apps tierces)
    - [ ] Configurable par endpoint
  - [ ] **Query plan optimization** :
    - [ ] Eviter les N+1 reseau via DataLoader
    - [ ] Batching des appels aux services
  - [ ] **Deploiement** :
    - [ ] Stateless (pas de base de donnees propre)
    - [ ] Scalable horizontalement (2-4 replicas en cible)
  - [ ] **Backward compatible** :
    - [ ] Le frontend ne modifie pas ses requetes GraphQL
    - [ ] Le schema GraphQL expose est identique avant et apres
- **Dependencies :** GraphQL Mesh, graphql-yoga (existant), Auth Service (Feature 5)
- **Choix technique :** GraphQL Mesh plutot qu'Apollo Router, car open source, compatible yoga, TypeScript natif

#### Feature 5 : Extraction du Auth Service

- **Description :** Premier service extrait du monolithe. Le Auth Service gere l'authentification (email/pwd, OAuth, API keys), les sessions, les organisations, le RBAC et les permissions. C'est un service transversal dont tous les autres dependent.
- **User Story :** En tant qu'architecte, je veux extraire l'auth en service standalone, pour isoler les donnees sensibles et permettre un scaling independant du module d'authentification.
- **Acceptance Criteria :**
  - [ ] **Service standalone** :
    - [ ] `apps/auth-service/` : application Nitro independante
    - [ ] Schema GraphQL federe pour les types auth (User, Session, Organization)
    - [ ] Base de donnees propre (PostgreSQL : users, sessions, orgs, roles, permissions, api_keys)
  - [ ] **API interne pour validation de tokens** :
    - [ ] Endpoint tRPC (ou gRPC) : `verifyToken(jwt) -> UserContext`
    - [ ] Endpoint tRPC : `checkPermission(userId, resource, action) -> boolean`
    - [ ] Latence cible < 5ms p95 (avec cache local)
  - [ ] **Publication d'events** :
    - [ ] `auth.user.registered` sur RabbitMQ
    - [ ] `auth.session.created` sur RabbitMQ
    - [ ] `auth.org.created`, `auth.org.member_added` sur RabbitMQ
  - [ ] **Migration des donnees** :
    - [ ] Script de migration pour separer les tables auth dans un schema/DB dedie
    - [ ] Zero downtime : dual-write pendant la transition
  - [ ] **Backward compatible** :
    - [ ] Le monolithe consomme les events auth via RabbitMQ (plus via hookable)
    - [ ] Les modules existants continuent de fonctionner avec le nouveau Auth Service
- **Dependencies :** API Gateway (Feature 4), RabbitMQ (Feature 3), better-auth (existant)
- **Justification :** Auth en premier car peu de dependances entrantes, API bien definie, pas de transactions partagees, benefice immediat en securite

#### Feature 6 : Extraction du Catalog Service

- **Description :** Deuxieme service extrait. Le Catalog Service regroupe Product + Attribute + Channel dans un seul service, car ces trois domaines partagent un contexte metier etroitement lie (jointures frequentes, requetes GraphQL traversant les trois).
- **User Story :** En tant qu'architecte, je veux extraire le catalogue en service standalone, pour pouvoir le scaler independamment face au trafic de lecture (vitrine du shop).
- **Acceptance Criteria :**
  - [ ] **Service standalone** :
    - [ ] `apps/catalog-service/` : application Nitro independante
    - [ ] Regroupe `@czo/product` + `@czo/attribute` + `@czo/channel`
    - [ ] Base de donnees propre (PostgreSQL : products, product_variants, attributes, attribute_values, collections, channels, channel_pricing)
  - [ ] **Schema GraphQL federe** :
    - [ ] Types Product, Attribute, Channel, Collection exposees
    - [ ] `@key(fields: "id")` sur Product pour la resolution cross-service
    - [ ] Resolver pour `price(channel: ID!)` et `stock` (resolu via Inventory via event data)
  - [ ] **Jobs internes BullMQ** :
    - [ ] Image processing, CSV import, thumbnail generation
    - [ ] Workers dans un process separe (pattern Sprint-03)
    - [ ] Redis propre pour BullMQ
  - [ ] **Events publies** :
    - [ ] `product.item.created`, `product.item.updated`, `product.item.deleted`, `product.item.published`
    - [ ] `product.collection.created`, `product.collection.updated`
  - [ ] **Events consommes** :
    - [ ] `inventory.stock.low` : marquer un produit en rupture
  - [ ] **Migration des donnees** :
    - [ ] Script de migration pour separer les tables catalogue
    - [ ] Dual-write pendant la transition
- **Dependencies :** API Gateway (Feature 4), RabbitMQ (Feature 3), Auth Service (Feature 5) pour la validation des tokens

### Nice-to-Have Features (P2) -- Phase 3+

#### Feature 7 : Extraction Order + Payment avec Saga Pattern

- **Description :** Extraction des modules Order et Payment en services separes, avec implementation du saga pattern pour les transactions distribuees (Order -> Payment -> Inventory).
- **User Story :** En tant qu'architecte, je veux que les commandes et paiements soient des services independants, pour isoler la logique financiere sensible et implementer des compensations automatiques en cas d'echec.
- **Acceptance Criteria :**
  - [ ] **Order Service** : panier, checkout, commandes, fulfillment, retours
  - [ ] **Payment Service** : Stripe integration, refunds, reconciliation
  - [ ] **Saga pattern** implementee :
    - [ ] Happy path : createOrder -> reserveStock -> chargeCard -> confirmOrder
    - [ ] Compensation : chargeCard ECHEC -> cancelOrder -> releaseStock
  - [ ] Chaque service possede sa propre base de donnees
  - [ ] Events publies et consommes selon la topologie definie dans le brainstorm
  - [ ] Decision : implementation manuelle ou orchestrateur (Temporal) selon la complexite
- **Dependencies :** Features 3, 4, 5 (Auth, RabbitMQ, Gateway)
- **Justification :** Order et Payment separes car le paiement peut echouer independamment, integrer plusieurs processeurs, et la reconciliation financiere est un domaine reglementaire distinct

#### Feature 8 : Services Inventory, Search, Notification

- **Description :** Extraction des services a faible couplage, considerees comme "easy wins".
- **User Story :** En tant qu'architecte, je veux extraire les services secondaires, pour completer l'architecture microservices.
- **Acceptance Criteria :**
  - [ ] **Inventory Service** : stock, entrepots, reservations, mouvements ; consomme `order.checkout.completed` et `payment.refund.completed`
  - [ ] **Search Service** : indexation Meilisearch, CQRS (write path via events, read path via Meilisearch) ; consomme `product.item.*` et `product.collection.*`
  - [ ] **Notification Service** : email/SMS via Novu, templates, preferences ; consomme `order.checkout.completed`, `auth.user.registered`, `inventory.stock.low`
- **Dependencies :** RabbitMQ, tous les services producteurs d'events

#### Feature 9 : Stack d'Observabilite Complette (OpenTelemetry)

- **Description :** Monitoring distribue complet avec traces, metriques et logs correles via OpenTelemetry.
- **User Story :** En tant que developpeur/ops, je veux pouvoir tracer une requete a travers tous les services, pour debugger les problemes en environnement distribue.
- **Acceptance Criteria :**
  - [ ] **Tracing distribue** : Jaeger ou Tempo, traces cross-service via `correlationId`
  - [ ] **Metriques** : Prometheus + Grafana (latence p50/p99, queue depth, error rate, RabbitMQ metrics)
  - [ ] **Logs structures** : Loki/Grafana, `correlationId` dans chaque ligne de log
  - [ ] **Protocole** : OpenTelemetry (OTLP) pour l'export des traces, metriques et logs
  - [ ] **Propagation du correlationId** : HTTP headers (`X-Correlation-Id`), AMQP message properties (`correlation_id`), logs (champ structure)
- **Dependencies :** Tous les services doivent integrer le SDK OpenTelemetry

## 6. User Experience

### User Flows

#### Developpeur : Publier un Event via EventBus

```
1. Declarer le type d'event via module augmentation (EventMap)
2. Importer useEventBus() depuis @czo/kit
3. Appeler eventBus.publish('product.item.created', payload, metadata)
4. Le provider actif (hookable ou rabbitmq) gere la livraison
5. Les modules abonnes recoivent l'event via eventBus.subscribe()

Exemple :
  // Declaration (types)
  declare module '@czo/kit' {
    interface EventMap {
      'product.item.created': { productId: string, title: string, handle: string }
    }
  }

  // Publication
  const bus = useEventBus()
  await bus.publish('product.item.created', {
    productId: 'prod_01HXY789',
    title: 'T-Shirt Bio',
    handle: 't-shirt-bio',
  }, { shopId: 'shop_01', actorId: 'user_01', actorType: 'user' })

  // Abonnement (dans un autre module)
  bus.subscribe('product.item.*', async (event) => {
    console.log(event.type, event.data)
  })
```

#### Developpeur : Migration d'un emit() hookable vers EventBus

```
Avant (monolithe actuel) :
  events.emit('product:created', payload)

Apres Phase 0 :
  eventBus.publish('product.item.created', payload, metadata)

Migration :
  1. Remplacer les appels emit() par eventBus.publish()
  2. Adapter les noms d'events (product:created -> product.item.created)
  3. Ajouter metadata (shopId, actorId, actorType)
  4. Ajouter le type dans EventMap
  5. Verifier que les abonnes recoivent toujours les events
```

#### Ops : Monitoring du Dual-Write

```
1. Activer dual-write : runtimeConfig.czo.eventBus.dualWrite = true
2. Les events sont emis sur hookable ET RabbitMQ
3. Verifier dans la Management UI RabbitMQ (http://localhost:15672)
   que les messages arrivent sur czo.events exchange
4. Comparer les compteurs hookable vs RabbitMQ
5. Si coherent apres 3 mois, basculer le provider sur 'rabbitmq'
```

#### Flux Complet : Un Client Passe une Commande (Architecture Cible)

```
1. Client (Next.js) envoie mutation createCheckout
2. API Gateway valide le JWT (appel sync -> Auth Service)
3. API Gateway route vers Order Service
4. Order Service cree le checkout en DB locale
5. Order Service appelle Catalog Service (sync tRPC : verifier prix)
6. Order Service appelle Inventory Service (sync tRPC : verifier stock)
7. Order Service publie order.checkout.completed sur RabbitMQ
8. RabbitMQ distribue a :
   - Payment Service (cree PaymentIntent Stripe)
   - Inventory Service (reserve le stock)
   - App Service (dispatch webhooks aux apps tierces)
9. Payment Service publie payment.charge.succeeded
10. Order Service met a jour le statut : paid
11. Notification Service envoie l'email de confirmation
```

## 7. Technical Constraints

### Performance Requirements

| Metrique | Cible | Contexte |
|----------|-------|----------|
| Latence EventBus (hookable) | < 10ms p95 | Events in-process, identique a l'actuel |
| Latence EventBus (RabbitMQ) | < 50ms p95 | Incluant serialisation + envoi AMQP |
| Throughput RabbitMQ | > 10K msg/sec | Suffisant pour l'e-commerce (pas millions) |
| Latence Auth token validation | < 5ms p95 | Avec cache local dans l'API Gateway |
| Latence GraphQL Gateway overhead | < 20ms p95 | Overhead du routing cross-service |

### Choix Technologiques

| Decision | Choix | Justification |
|----------|-------|---------------|
| **Broker inter-service** | RabbitMQ | Topic exchanges, fan-out natif, DLX, polyglotte (AMQP standard) |
| **Jobs intra-service** | BullMQ (existant) | Deja en place, Redis deja present, adapte aux jobs background |
| **API Gateway** | GraphQL Mesh | Open source, compatible yoga, TypeScript natif, pas de licence enterprise |
| **Service-to-service sync** | tRPC d'abord | Zero schema duplication (TS), plus simple ; migrer vers gRPC si services non-TS |
| **Routing key convention** | `<domaine>.<entite>.<action>` | Pattern matching naturel avec les topic exchanges RabbitMQ |
| **Dead letter** | DLX natif RabbitMQ | Routing automatique des messages echoues, monitoring, reinection manuelle |

### RabbitMQ vs BullMQ -- Separation des Responsabilites

La regle est simple :
- **RabbitMQ** = communication ENTRE services (events de domaine)
- **BullMQ** = travail INTERNE a un service (background jobs)

| Critere | RabbitMQ (inter-service) | BullMQ (intra-service) |
|---------|------------------------|----------------------|
| **Routing** | Topic exchanges, wildcards (`product.item.*`) | Par nom de queue fixe |
| **Fan-out** | Natif (N consumers recoivent le meme message) | Pas de fan-out natif |
| **Dead letters** | DLX natif | Gestion manuelle |
| **Polyglotte** | AMQP 0.9.1 (Go, Python, Java, Rust) | Node.js uniquement |
| **Monitoring** | Management UI integre | Bull Board (add-on) |
| **Performance** | ~50k msg/sec | ~100k jobs/sec |
| **Simplicite** | Plus complexe (exchanges, bindings) | Plus simple (juste Redis) |

### Topologie RabbitMQ

```
Exchanges :
  czo.events  (topic)   - Tous les events de domaine, routing par pattern
  czo.system  (fanout)  - Events systeme broadcast (config.updated, shutdown.graceful)
  czo.dlx     (topic)   - Dead Letter Exchange, messages echoues apres retries

Bindings (par service) :
  search.indexing      <- product.item.*, product.collection.*
  notification.events  <- order.checkout.completed, auth.user.registered,
                          payment.charge.*, inventory.stock.low, product.item.published
  app.webhooks         <- # (tous les events)
  order.payments       <- payment.charge.*, inventory.stock.reserved, inventory.stock.insufficient
  payment.orders       <- order.checkout.completed
  inventory.orders     <- order.checkout.completed, payment.refund.completed
  catalog.events       <- inventory.stock.low
```

### Integrations

- **hookable** (existant) : provider EventBus pour le monolithe
- **amqplib** (nouveau) : client AMQP pour le provider RabbitMQ
- **graphql-mesh** (nouveau, P1) : API Gateway federation
- **tRPC** (nouveau, P1) : communication sync inter-service
- **OpenTelemetry SDK** (nouveau, P2) : traces, metriques, logs
- **BullMQ** (existant) : jobs background internes a chaque service
- **Drizzle ORM** (existant) : acces base de donnees

### Contraintes Infra

- **Propriete des donnees** : chaque service possede son schema de base de donnees. Aucun service ne lit directement la base d'un autre.
- **Consistance eventuelle** : les services communiquent par events. Un delai de millisecondes a secondes entre le write et la synchronisation est acceptable.
- **Docker Compose local** : en dev, une seule instance PostgreSQL avec schemas separes ; en prod, une instance par service.
- **Idempotence** : tous les handlers d'events doivent etre idempotents (champ `id` dans DomainEvent).

## 8. Security & Compliance

### Authentification

- **JWT validation** au niveau de l'API Gateway (delegue au Auth Service)
- **Auth tokens par app** pour les appels API c-zo
- **mTLS** entre services en production (si Kubernetes)

### Autorisation

- **Permissions validees au gateway** : le Auth Service renvoie le UserContext avec roles et permissions
- **Permissions propagees** : chaque service recoit le UserContext dans les headers de requete

### Donnees Sensibles

- **Isolation du Auth Service** : mots de passe, tokens, sessions dans une DB separee
- **Payment Service** : donnees PCI DSS dans un service isole
- **Pas de donnees sensibles dans les events** : les payloads contiennent des IDs, pas des credentials

### Messages RabbitMQ

- **Persistent delivery** : tous les messages sont persistes sur disque
- **Quorum queues** en production : replication sur 3 noeuds
- **Publisher confirms** : confirmation de reception par le broker
- **Credentials** : configures via variables d'environnement, jamais en clair

### Gestion des Erreurs et Dead Letters

- **Retry policy** : 3 tentatives avec backoff exponentiel (1s, 5s, 30s)
- **Dead Letter Exchange (DLX)** : messages echoues routes vers `czo.dlx`
- **Headers DLX** : `x-death-count`, `x-first-death-exchange`, `x-first-death-queue`, `x-first-death-reason`
- **Monitoring DLX** : service de monitoring avec alertes Slack/PagerDuty
- **Reinection manuelle** : interface pour reinjecter les messages apres debug

### Risques de Securite Specifiques aux Microservices

| Risque | Mitigation |
|--------|------------|
| Surface d'attaque accrue (N services exposes) | Seul l'API Gateway est expose ; les services internes ne sont pas accessibles depuis l'exterieur |
| Communication inter-service non securisee | mTLS en production, VPC peering |
| Messages RabbitMQ interceptes | RabbitMQ dans le meme cluster, TLS pour les connexions |
| Token propagation vulnerabilite | Tokens courte duree, validation a chaque service |

## 9. Dependencies

### Blockers (Phase 0)

- EventEmitter hookable existant (Feature 3 du PRD Kit) : la base sur laquelle l'abstraction EventBus est construite
- Docker Compose infrastructure existante
- Redis infrastructure (existant, pour BullMQ)

### Pre-requis pour Phase 1

- [ ] EventBus avec provider pattern en production depuis > 3 mois
- [ ] RabbitMQ stable en production
- [ ] Monitoring et tracing distribue en place (OpenTelemetry)
- [ ] CI/CD automatise per-service
- [ ] Docker/Kubernetes operationnel
- [ ] Experience equipe en systemes distribues
- [ ] Au moins un bounded context clairement identifie
- [ ] Runbook pour les pannes RabbitMQ (quorum queues, mirroring)
- [ ] Tests d'integration inter-services automatises

### Related Features

- [PRD Kit](./prd.md) : EventEmitter (Feature 3), App System (Feature 5)
- [brainstorm-tasks.md](./brainstorm-tasks.md) : Provider pattern pour les background tasks
- [sprints/sprint-03.md](./sprints/sprint-03.md) : Separation des workers BullMQ

### Cout Operationnel Estime

| Aspect | Monolithe (actuel) | Microservices (cible) |
|--------|-------------------|----------------------|
| Services a deployer | 1 (Nitro) + 1 (Workers) | 8-10 services |
| Bases de donnees | 1 PostgreSQL | 6-8 PostgreSQL |
| Infrastructure additionnel | Redis | Redis + RabbitMQ + Meilisearch |
| Monitoring | Basique (logs) | OpenTelemetry + Jaeger + Grafana |
| CI/CD | 1 pipeline | 8-10 pipelines |
| Temps de debug (p50) | 10 min | 30-60 min |
| Cout cloud (estime) | ~100-200 USD/mois | ~500-1000 USD/mois |
| Connaissance requise | Node.js, PostgreSQL | + K8s, AMQP, systemes distribues |

## 10. Timeline & Milestones

La timeline suit le pattern Strangler Fig : extraction progressive des services, sans big-bang migration.

| Phase | Description | Contenu | Pre-requis | Calendrier Indicatif |
|-------|-------------|---------|------------|---------------------|
| **Phase 0** | Preparer le monolithe | EventBus abstraction, DomainEvent schema, RabbitMQ docker, dual-write | Sprint-02 Events termine | Q1 2026 (Sprints 03-05) |
| **Phase 1** | Extraire Auth Service | Auth standalone Nitro, GraphQL Mesh gateway, tRPC pour token validation | Phase 0 + declencheurs atteints | Q2 2026 |
| **Phase 2** | Extraire Catalog Service | Product+Attribute+Channel standalone, BullMQ interne | Phase 1 stable | Q3 2026 |
| **Phase 3** | Extraire Order + Payment | Saga pattern, compensation, Stripe integration isolee | Phase 2 stable | Q4 2026 |
| **Phase 4** | Services secondaires | Inventory, Search (CQRS Meilisearch), Notification | Phase 3 stable | 2027+ |
| **Phase 5** | App Service | Webhook dispatch distribue, binding `#` sur tous les events | Topologie RabbitMQ finalisee | 2027+ |

### Detail Phase 0 (In Scope Immediat)

| Milestone | Description | Status |
|-----------|-------------|--------|
| Sprint-03 | Separation des workers BullMQ (deja planifie) | Pending |
| Sprint-04 | Provider pattern pour les tasks (brainstorm-tasks.md) | Pending |
| Sprint-05 | Abstraction EventBus + dual-write hookable/RabbitMQ | Pending |
| Sprint-05 | RabbitMQ dans docker-compose.dev.yml | Pending |
| Sprint-05 | Convention routing keys `<domaine>.<entite>.<action>` | Pending |
| Sprint-05 | `correlationId` dans l'EventContext | Pending |

**Rappel critique :** Les Phases 1-5 ne sont PAS planifiees. Elles ne seront lancees que lorsque les declencheurs de la section 4 seront atteints. Sans declencheur, le monolithe suffit indefiniment.

---

## Appendix

### A. Cartographie Modules -> Services

| Service | Modules c-zo Actuels | Responsabilites | Base de Donnees |
|---------|---------------------|-----------------|-----------------|
| **API Gateway** | Nouveau | Federation GraphQL, auth token validation, rate limiting, routing | Aucune (stateless) |
| **Auth Service** | `@czo/auth` | Authentification, sessions, organisations, RBAC, permissions | PostgreSQL (users, sessions, orgs, roles) |
| **Catalog Service** | `@czo/product` + `@czo/attribute` + `@czo/channel` | Produits, variantes, collections, attributs dynamiques, canaux, pricing | PostgreSQL (products, attributes, channels, pricing) |
| **Order Service** | Module order (futur) | Panier, checkout, commandes, fulfillment, retours | PostgreSQL (carts, orders, order_items, fulfillments) |
| **Payment Service** | Module payment (futur) | Processing paiement (Stripe), refunds, reconciliation | PostgreSQL (payments, refunds, payment_methods) |
| **Inventory Service** | Module inventory (futur) | Stock, entrepots, reservations, mouvements | PostgreSQL (stock_items, warehouses, reservations) |
| **Notification Service** | Module notification (futur) | Email, SMS, push via Novu, templates, preferences | PostgreSQL (notifications, templates, preferences) |
| **Search Service** | Module search (futur) | Indexation, recherche full-text, facettes, suggestions | Meilisearch + PostgreSQL (config) |
| **App Service** | Systeme apps de `@czo/kit` | Registre d'apps, webhook dispatch, permissions, extensions | PostgreSQL (installed_apps, webhook_logs) |

### B. Bindings RabbitMQ Complets

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
| **Auth** | *(aucun binding)* | *(producteur uniquement)* | Auth ne consomme pas d'events |

### C. Open Questions

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
- [ ] Meilisearch : un index par shop ou un index global avec filtrage ?

### D. Risques

| Risque | Probabilite | Impact | Mitigation |
|--------|-------------|--------|------------|
| **Complexite operationnelle prematuree** | Elevee | Eleve | Ne pas migrer tant que les declencheurs ne sont pas atteints. Ce PRD est preparatoire. |
| **Latence reseau entre services** | Moyenne | Moyen | Cache agressif, batching, GraphQL DataLoader, co-localisation cluster K8s |
| **Consistance eventuelle mal geree** | Moyenne | Eleve | Idempotence de tous les handlers, outbox pattern, monitoring DLX |
| **Data duplication et derive** | Moyenne | Moyen | Source of truth clairement definie par service, events comme unique canal de sync |
| **Perte de messages RabbitMQ** | Faible | Eleve | Quorum queues, publisher confirms, persistent messages, monitoring queue depth |
| **Debugging distribue difficile** | Elevee | Moyen | OpenTelemetry des Phase 0, correlationId partout, logs structures |
| **Over-engineering** | Elevee | Moyen | Ne rien implementer sans declencheur reel. Phase 0 uniquement dans le monolithe. |
| **GraphQL N+1 entre services** | Moyenne | Moyen | DataLoader par service, query planning au gateway |
| **Schema evolution des messages** | Moyenne | Moyen | Versionner les events (champ `version`), tolerant reader pattern |
| **Couplage temporel (service down)** | Moyenne | Moyen | Queues RabbitMQ bufferisent les messages. Un service down rattrape au redemarrage. |
| **Dual-write incoherence** | Moyenne | Moyen | Si publish RabbitMQ echoue mais hookable a execute : log warning, retry async, monitoring |

### E. References

- [brainstorm-microservices.md](./brainstorm-microservices.md) -- Brainstorm source de ce PRD
- [brainstorm.md](./brainstorm.md) -- Brainstorm original du kit (events, queue, hooks, apps)
- [brainstorm-tasks.md](./brainstorm-tasks.md) -- Provider pattern pour les background tasks
- [brainstorm-split.md](./brainstorm-split.md) -- Decision de garder kit comme un seul package
- [prd.md](./prd.md) -- PRD du module Kit (parent)
- [sprints/sprint-03.md](./sprints/sprint-03.md) -- Separation des workers BullMQ
- [RabbitMQ Tutorials](https://www.rabbitmq.com/tutorials)
- [GraphQL Mesh Documentation](https://the-guild.dev/graphql/mesh)
- [Strangler Fig Pattern (Martin Fowler)](https://martinfowler.com/bliki/StranglerFigApplication.html)
- [Saga Pattern (Chris Richardson)](https://microservices.io/patterns/data/saga.html)
- [CQRS Pattern](https://microservices.io/patterns/data/cqrs.html)
- [Outbox Pattern](https://microservices.io/patterns/data/transactional-outbox.html)
- [OpenTelemetry for Node.js](https://opentelemetry.io/docs/languages/js/)

### Stakeholders & Approvals

| Name | Role | Date | Signature |
|------|------|------|-----------|
| Claude (Briana) | Author | 2026-02-09 | Draft |
| User | Product Owner | TBD | Pending |
