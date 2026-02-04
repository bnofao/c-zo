---
github_number: 20
title: "[Epic] Module Kit (@czo/kit)"
status: synced
prd: kit
trd: true
labels:
  - epic
created: 2026-02-04
updated: 2026-02-04
---

## Overview

Le module `@czo/kit` fournit les fondations partagées pour tous les modules c-zo. Cette évolution ajoute cinq composants essentiels :

- **Repository générique** : Builders composables pour éliminer le code CRUD répétitif
- **Cache hybride** : Nitro Cache natif + CacheManager léger pour l'invalidation
- **EventEmitter** : Communication inter-modules (sync + async)
- **HookRegistry** : Interception des opérations (before/after/onError)
- **App System** : Intégrations tierces avec webhooks et permissions

## Source Documents

- **PRD**: [prd.md](./prd.md)
- **TRD**: [trd.md](./trd.md)
- **Brainstorm**: [brainstorm.md](./brainstorm.md)

## User Stories

### P0 - Must Have
- [ ] #21 As a module developer, I want a generic repository
- [ ] #22 As a developer, I want transparent caching
- [ ] #23 As a module developer, I want to emit events
- [ ] #24 As a developer, I want to intercept operations
- [ ] #25 As a platform admin, I want to install third-party apps

### P1 - Should Have
- [ ] #26 As a developer, I want to invalidate related cache entries together

### P2 - Nice to Have
- [ ] #27 As a merchant, I want to see app UI extensions in my dashboard

## Technical Tasks

### Repository System
- [ ] #28 Implement createQueries builder
- [ ] #29 Implement createCachedQueries with Nitro cache
- [ ] #30 Implement createMutations builder

### Cache System
- [ ] #31 Implement CacheManager (useCacheManager)

### Events & Hooks
- [ ] #32 Implement EventEmitter with hookable + BullMQ
- [ ] #33 Implement HookRegistry for operation interception

### App System
- [ ] #34 Implement AppRegistry for third-party app management
- [ ] #35 Implement WebhookDispatcher with HMAC signing
- [ ] #36 Create database migration for apps tables

### Infrastructure
- [ ] #37 Configure package exports for @czo/kit
- [ ] #38 Configure Redis storage in nitro.config.ts

### Testing
- [ ] #39 Write unit tests for @czo/kit module
- [ ] #40 Write integration tests for @czo/kit module

## Acceptance Criteria

- [ ] All P0 features implemented and tested
- [ ] 80%+ test coverage
- [ ] Documentation updated
- [ ] Migration guide for existing modules
- [ ] At least one module (product) migrated to new patterns

## Notes

- Repository uses functional pattern (composition over inheritance)
- Cache leverages Nitro's built-in `defineCachedFunction` for SWR
- Apps permissions are delegated to @czo/auth via PermissionService
