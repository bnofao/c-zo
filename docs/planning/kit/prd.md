# PRD: Module Kit (@czo/kit)

**Status**: In Progress
**Author**: Claude (Briana)
**Created**: 2026-02-04
**Last Updated**: 2026-02-08
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
- **Classe abstraite `Repository`** avec CRUD, optimistic locking (version), soft delete, et hooks lifecycle intégrés
- Cache via **Nitro Storage** (`useCache` alias de `useStorage`)
- Events synchrones et asynchrones inter-modules
- Hooks lifecycle intégrés dans Repository (`beforeCreate`, `afterUpdate`, etc.)
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

#### Feature 1: Repository Générique (Classe Abstraite)
- **Description:** Classe abstraite `Repository<T,U,V>` pour éliminer le code CRUD répétitif avec support Drizzle, soft-delete, optimistic locking (version number), pagination, et hooks lifecycle intégrés
- **User Story:** As a module developer, I want a generic repository so that I don't have to write the same CRUD code in every module
- **Acceptance Criteria:**
  - [x] **Classe abstraite avec méthodes CRUD :**
    - [x] `findFirst(opts?)` : premier enregistrement avec relations Drizzle
    - [x] `findMany(opts?)` : plusieurs enregistrements avec limit/offset
    - [x] `paginateByOffset(opts?)` : pagination page/perPage avec totalCount
    - [x] `create(value, opts?)` : insertion avec `version: 1` auto
    - [x] `createMany(values, opts?)` : insertion batch
    - [x] `update(value, opts?)` : avec `expectedVersion` pour locking
    - [x] `delete(opts?)` : avec `soft?: boolean` pour soft delete
    - [x] `restore(opts?)` : annuler le soft delete
  - [x] Pagination offset via `paginateByOffset` avec page/perPage
  - [x] Optimistic locking via `version` number + `expectedVersion` sur update
  - [x] Soft delete via `deletedAt` + paramètre `soft: true` sur delete
  - [x] Filtrage auto des soft-deleted via `includeDeleted?: boolean`
  - [x] Support transactions via `opts.tx`
  - [x] **Hooks lifecycle intégrés (méthodes à override) :**
    - [x] `beforeCreate(row)`, `afterCreate(row)`
    - [x] `beforeUpdate(row)`, `afterUpdate(row)`
    - [x] `afterDelete(row)`, `afterFind(row)`
  - [x] Erreurs typées : `OptimisticLockError`, `DatabaseError`
- **Dependencies:** Drizzle ORM
- **Status:** ✅ Implémenté (Sprint-01)

#### Feature 2: Cache (Nitro Storage)
- **Description:** Export direct de `useStorage` de Nitro comme `useCache` pour une utilisation simple du cache
- **User Story:** As a developer, I want transparent caching so that frequent reads don't hit the database
- **Acceptance Criteria:**
  - [x] **Export `useCache` depuis `@czo/kit/cache` :**
    - [x] Alias de `useStorage` de Nitro
    - [x] Accès direct au storage configuré dans `nitro.config.ts`
  - [ ] **Configuration storage dans `nitro.config.ts` :**
    - [ ] Driver `memory` pour dev
    - [ ] Driver `redis` pour prod
  - [ ] **Modules utilisent directement l'API Nitro :**
    - [ ] `defineCachedFunction` pour SWR
    - [ ] `useCache().setItem/getItem` pour cache manuel
- **Dependencies:** nitro (peer dependency, optional)
- **Status:** ✅ Export implémenté, configuration Redis à faire
- **Note:** L'approche CacheManager complexe a été simplifiée. Les modules gèrent leur cache directement avec les APIs Nitro.

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

#### Feature 4: Hooks Lifecycle (intégrés dans Repository)
- **Description:** Hooks lifecycle intégrés dans la classe Repository comme méthodes à override
- **User Story:** As a developer, I want to intercept operations so that I can add validation, logging, or enrichment
- **Acceptance Criteria:**
  - [x] **Hooks comme méthodes de classe :**
    - [x] `beforeCreate(row)` : validation/enrichissement avant insertion
    - [x] `afterCreate(row)` : post-processing après insertion
    - [x] `beforeUpdate(row)` : validation avant update
    - [x] `afterUpdate(row)` : post-processing après update
    - [x] `afterDelete(row)` : cleanup après suppression
    - [x] `afterFind(row)` : enrichissement des résultats de lecture
  - [x] Override dans les sous-classes pour personnalisation
  - [x] Erreurs propagées correctement
- **Dependencies:** Aucune (intégré dans Repository)
- **Status:** ✅ Implémenté (Sprint-01)
- **Note:** L'approche HookRegistry séparée (hookable) a été simplifiée. Les hooks sont maintenant des méthodes de la classe Repository.

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

#### Feature 6: Cache Tags et Invalidation Groupée
- **Description:** Invalidation de cache par tags pour les données liées
- **User Story:** As a developer, I want to invalidate related cache entries together
- **Acceptance Criteria:**
  - [ ] Support tags dans les options de cache
  - [ ] `invalidateByTag(tag)` pour invalidation groupée
  - [ ] Intégration avec les events (auto-invalidation sur mutations)
- **Dependencies:** CacheManager
- **Note:** SWR est maintenant inclus dans P0 via Nitro Cache natif

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
1. Create a class extending Repository<T, U, V>:
   - T = schema type (for relations)
   - U = table type (PgTableWithColumns)
   - V = model name key
2. Import Repository from @czo/kit/db
3. Pass db and table to super()
4. Override hooks as needed (beforeCreate, afterUpdate, etc.)
5. Add domain-specific methods
6. Register in IoC container as singleton
7. Use in services via useContainer().make()

Example:
  class ProductRepository extends Repository<Schema, typeof products, 'products'> {
    constructor(db: Database) {
      super(db, products)
    }
    async beforeCreate(row) { /* validation */ }
    async findByHandle(handle: string) { return this.findFirst({ where: { handle } }) }
  }
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
  - Nitro Cache natif (`defineCachedFunction`, `useStorage`)
  - hookable (events/hooks)
  - bullmq (async events, webhook retries)
  - Redis (storage backend prod)
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
| Phase 1 | Repository classe abstraite | 2026-02-08 | ✅ Done |
| Phase 2 | Cache (useCache export) | 2026-02-08 | ✅ Done |
| Phase 3 | EventEmitter | TBD | Pending |
| Phase 4 | ~~HookRegistry~~ → Intégré dans Repository | 2026-02-08 | ✅ Done |
| Phase 5 | App System | TBD | Pending |
| Launch | Production ready | TBD | Pending |

---

## Appendix

### Open Questions
- [x] Optimistic locking strategy? → **Version number** (implémenté)
- [x] Cache backend? → **Nitro Storage** (`useStorage` exporté comme `useCache`)
- [x] Cache approach? → **Simplifié** : export direct de useStorage, modules gèrent leur cache
- [x] SWR? → **Built-in avec Nitro** (via `defineCachedFunction`)
- [x] Events sync/async? → **Les deux, avec BullMQ pour async** (à implémenter)
- [x] Hooks library? → **Intégrés dans Repository** (pas de hookable séparé)
- [x] Apps model? → **Self-hosted avec webhooks, extensions UI** (à implémenter)
- [x] Repository pattern? → **PIVOT : Classe abstraite** (pas builders fonctionnels)
- [x] Permissions apps? → **Délégation à @czo/auth** (plugin access)

### Sprint-01 Pivot (2026-02-08)
- **Décision** : Classe abstraite `Repository<T,U,V>` au lieu de builders fonctionnels
- **Raison** : Pragmatisme, code existant éprouvé, hooks intégrés naturellement
- **Trade-offs** : Moins de tree-shaking, mais API plus familière et plus simple

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
