# PRD: Module Kit (@czo/kit)

**Status**: Draft
**Author**: Claude (Briana)
**Created**: 2026-02-04
**Last Updated**: 2026-02-04
**TRD**: [trd.md](./trd.md)
**Brainstorm**: [brainstorm.md](./brainstorm.md)

---

## 1. Overview

Le module `@czo/kit` fournit les fondations partagées pour tous les modules c-zo. Cette évolution ajoute cinq composants essentiels : un **Repository générique** pour éliminer le code CRUD répétitif, un **CacheManager** multi-backend, un **EventEmitter** pour la communication inter-modules, un **HookRegistry** pour l'interception des opérations, et un **système d'Applications** pour les intégrations tierces.

## 2. Problem Statement

### Current State
- Code CRUD répétitif dans chaque module (pagination, soft-delete, optimistic locking)
- Pas de gestion de cache → charge DB excessive
- Modules isolés sans communication (pas d'events)
- Impossible d'intercepter les opérations (pas de hooks)
- Intégrations tierces codées en dur

### Target State
- Repository fonctionnel avec **builders composables** (`createQueries`, `createCachedQueries`, `createMutations`, `createRepository`)
- Cache transparent via unstorage (memory/Redis)
- Events synchrones et asynchrones inter-modules
- Hooks before/after/onError pour interception
- Système d'apps extensible avec webhooks et UI extensions

### Impact
- **Développeurs modules** : -70% code CRUD, patterns standardisés
- **Performance** : Latence < 50ms pour reads cachés
- **Extensibilité** : Apps tierces (paiement, shipping) sans modification core
- **Maintenabilité** : Un seul endroit pour les patterns communs

## 3. Goals

### Primary Goals
- [ ] Réduire de 70% le code CRUD dans les modules de domaine
- [ ] Fournir un cache transparent avec < 50ms latence
- [ ] Permettre la communication inter-modules via events typés
- [ ] Supporter les apps tierces avec webhooks et permissions

### Non-Goals (Out of Scope)
- ORM-agnostic (on utilise Drizzle)
- Multi-database (PostgreSQL uniquement)
- Cache distribué complexe (simple Redis suffit)
- App sandboxing (trust model pour MVP)
- Permissions dynamiques à runtime (statements définis au boot)

## 4. Success Metrics

| Metric | Target | Measurement Method | Timeline |
|--------|--------|-------------------|----------|
| Réduction code CRUD | 70% | LOC comparison avant/après | MVP |
| Latence cache reads | < 50ms p95 | APM monitoring | MVP |
| Modules utilisant events | 100% | Code audit | 3 mois |
| Apps installables | 1 (Stripe) | Demo fonctionnelle | MVP |
| Couverture tests | 80%+ | Jest coverage | MVP |

## 5. Features and Requirements

### Must-Have Features (P0)

#### Feature 1: Repository Générique Fonctionnel
- **Description:** Système de **builders composables** pour éliminer le code CRUD répétitif avec support Drizzle, soft-delete, optimistic locking (version number), et pagination
- **User Story:** As a module developer, I want a generic repository so that I don't have to write the same CRUD code in every module
- **Acceptance Criteria:**
  - [ ] **Builders séparés pour tree-shaking et composition granulaire :**
    - [ ] `createQueries()` : `findById`, `findByIds`, `findOne`, `findMany`, `count`, `exists`
    - [ ] `createCachedQueries()` : queries + cache layer avec invalidation
    - [ ] `createMutations()` : `create`, `createMany`, `update`, `delete`, `restore`, `hardDelete`
    - [ ] `createRepository()` : all-in-one convenience (queries + mutations)
  - [ ] Pagination offset + cursor avec `PaginatedResult<T>`
  - [ ] Optimistic locking via `version` number (integer)
  - [ ] Soft delete via `deletedAt` timestamp
  - [ ] Support transactions via `transaction()` method
  - [ ] Composition facile pour extensions (spread operator)
  - [ ] Import sélectif pour minimiser l'API surface
- **Dependencies:** Drizzle ORM, @czo/kit/cache (optional)

#### Feature 2: CacheManager Multi-Backend
- **Description:** Gestionnaire de cache basé sur unstorage avec support memory (dev) et Redis (prod)
- **User Story:** As a developer, I want transparent caching so that frequent reads don't hit the database
- **Acceptance Criteria:**
  - [ ] Interface `CacheManager` avec `get`, `set`, `delete`, `has`
  - [ ] Pattern `getOrSet(key, factory, options)` pour cache-aside
  - [ ] Invalidation par pattern `invalidate(pattern)`
  - [ ] Bulk operations: `getMany`, `setMany`, `deleteMany`
  - [ ] Namespace support via `namespace(prefix)`
  - [ ] TTL et tags support
  - [ ] Drivers: memory (dev), Redis (prod)
  - [ ] Configuration par environnement
- **Dependencies:** unstorage, ioredis

#### Feature 3: EventEmitter Typé
- **Description:** Système d'events synchrones et asynchrones pour communication inter-modules
- **User Story:** As a module developer, I want to emit events so that other modules can react to my actions
- **Acceptance Criteria:**
  - [ ] Interface `EventEmitter` avec `emit`, `emitAsync`, `on`, `once`, `off`
  - [ ] Events synchrones via hookable
  - [ ] Events asynchrones via BullMQ queue
  - [ ] Type safety via module augmentation (`EventMap`)
  - [ ] Context avec `eventId`, `timestamp`, `actor`, `correlationId`
  - [ ] Options async: `delay`, `retries`, `priority`
  - [ ] Fallback sync si queue non configurée
- **Dependencies:** hookable, bullmq, Redis

#### Feature 4: HookRegistry
- **Description:** Système de hooks pour intercepter les opérations avec before/after/onError
- **User Story:** As a developer, I want to intercept operations so that I can add validation, logging, or enrichment
- **Acceptance Criteria:**
  - [ ] Interface `HookRegistry` avec `before`, `after`, `onError`
  - [ ] Method `run(hook, context, fn)` pour exécution avec hooks
  - [ ] Before hooks peuvent modifier le context
  - [ ] After hooks peuvent modifier le result
  - [ ] Error hooks pour logging/recovery
  - [ ] Type safety via module augmentation (`HookMap`)
  - [ ] Unsubscribe via returned function
- **Dependencies:** hookable

#### Feature 5: Système d'Applications
- **Description:** Infrastructure pour apps tierces avec webhooks, permissions (via @czo/auth), et UI extensions
- **User Story:** As a platform administrator, I want to install third-party apps so that merchants can extend c-zo with payment and shipping integrations
- **Acceptance Criteria:**
  - [ ] `AppManifest` schema avec permissions, webhooks, extensions
  - [ ] `AppRegistry` pour install/uninstall/list apps (scoped par shop)
  - [ ] `WebhookDispatcher` pour envoi d'events aux apps
  - [ ] Signature HMAC des webhooks (`X-CZO-Signature`)
  - [ ] Retries avec queue pour webhooks failed
  - [ ] `AppPermissionChecker` intégré avec `@czo/auth`
  - [ ] Validation permissions à l'installation
  - [ ] Auth token par app pour appels API c-zo
- **Dependencies:** @czo/auth (PermissionService), bullmq, Redis

### Should-Have Features (P1)

#### Feature 6: Stale-While-Revalidate Cache
- **Description:** Pattern SWR pour cache avec background refresh
- **User Story:** As a user, I want fast responses even when cache is stale
- **Acceptance Criteria:**
  - [ ] Option `staleWhileRevalidate` dans CacheOptions
  - [ ] Background refresh quand TTL proche
  - [ ] Serve stale data pendant refresh
- **Dependencies:** CacheManager

### Nice-to-Have Features (P2)

#### Feature 7: Dashboard Extensions Rendering
- **Description:** Rendu des extensions UI d'apps dans le dashboard
- **User Story:** As a merchant, I want to see app UI extensions in my dashboard
- **Acceptance Criteria:**
  - [ ] iframe rendering pour extensions
  - [ ] Secure communication via postMessage
  - [ ] Extension mounting points (ORDER_DETAILS, PRODUCT_DETAILS, etc.)
- **Dependencies:** paiya frontend, AppRegistry

## 6. User Experience

### User Flows

#### Module Developer: Using Repository
```
1. Choose builder(s) based on need:
   - createQueries() for read-only access
   - createCachedQueries() for cached reads
   - createMutations() for write operations
   - createRepository() for full CRUD
2. Import selected builder(s) from @czo/kit/db/repository
3. Define entity type, create/update inputs
4. Call builder(db, config) with table and options
5. Extend with custom methods via composition (spread)
6. Register in IoC container as singleton
7. Use in services via useContainer().make()
```

#### Module Developer: Emitting Events
```
1. Declare event types via module augmentation
2. Import useEvents from @czo/kit/events
3. Call events.emit('module.action', payload) for sync
4. Call events.emitAsync('module.action', payload) for async
5. Other modules subscribe via events.on('module.action', handler)
```

#### Platform Admin: Installing an App
```
1. GET manifest from app URL
2. POST /api/apps/install { manifestUrl, shopId }
3. System validates permissions against user's roles
4. If valid, app installed with auth token
5. App receives webhooks for subscribed events
6. App can call c-zo API with auth token
```

### Wireframes/Mockups
- Repository pattern documented in brainstorm
- App architecture diagram in brainstorm

## 7. Technical Constraints

- **Performance Requirements:**
  - Cache reads < 50ms p95
  - Event emit < 10ms (sync)
  - Webhook dispatch < 100ms p95
- **Scalability:**
  - Redis for cache and queues (horizontal scaling)
  - BullMQ workers can scale independently
- **Browser/Platform Support:**
  - Server-side only (Nitro/Node.js)
- **Integrations:**
  - unstorage (cache)
  - hookable (events/hooks)
  - bullmq (async events, webhook retries)
  - Redis
  - @czo/auth (app permissions)

## 8. Security & Compliance

- **Authentication:**
  - Apps authenticate via issued auth tokens
  - Tokens scoped to shop
- **Authorization:**
  - App permissions validated at installation via @czo/auth
  - Permissions use format `{ resource, actions[], scope }`
  - Shop-scoped permissions from `shop_members` table
- **Data Privacy:**
  - Webhooks signed with HMAC (X-CZO-Signature)
  - App tokens can be revoked
  - No sensitive data in webhook payloads without explicit permission
- **Compliance:**
  - Webhook retry policy with exponential backoff
  - Dead letter queue for failed webhooks

## 9. Dependencies

**TRD:** [trd.md](./trd.md)

### Blockers
- @czo/auth module with PermissionService (for app permissions)
- Redis infrastructure
- PostgreSQL database

### Related Features
- Module Auth (permissions for apps)
- Module Product (first consumer of repository/events)
- Module Order (events for app webhooks)

## 10. Timeline & Milestones

| Milestone | Description | Target Date | Status |
|-----------|-------------|-------------|--------|
| Phase 1 | Repository générique | TBD | Pending |
| Phase 2 | CacheManager | TBD | Pending |
| Phase 3 | EventEmitter | TBD | Pending |
| Phase 4 | HookRegistry | TBD | Pending |
| Phase 5 | App System | TBD | Pending |
| Launch | Production ready | TBD | Pending |

---

## Appendix

### Open Questions
- [x] Optimistic locking strategy? → **Version number**
- [x] Cache backend? → **unstorage (multi-backend)**
- [x] Events sync/async? → **Les deux, avec BullMQ pour async**
- [x] Hooks library? → **hookable**
- [x] Apps model? → **Self-hosted avec webhooks, extensions UI**
- [x] Repository pattern? → **Builders séparés** (`createQueries`, `createCachedQueries`, `createMutations`, `createRepository`)
- [x] Permissions apps? → **Délégation à @czo/auth** (plugin access)

### References
- [Brainstorm Kit](./brainstorm.md)
- [unstorage Documentation](https://unstorage.unjs.io/)
- [hookable Documentation](https://github.com/unjs/hookable)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [Saleor Apps Architecture](https://docs.saleor.io/developer/extending/apps/architecture/overview)
- [Brainstorm Auth](../auth/brainstorm.md) - Permission system integration

### Stakeholders & Approvals
| Name | Role | Date | Signature |
|------|------|------|-----------|
| Claude (Briana) | Author | 2026-02-04 | Draft |
| User | Product Owner | TBD | Pending |
