# TRD: Module Auth

**Status**: Draft
**Author**: Claude (Briana)
**Created**: 2026-02-03
**Last Updated**: 2026-02-10
**Related PRD**: [prd.md](./prd.md)

---

## 1. Overview

Le module Auth implémente un système d'authentification basé sur **better-auth** avec architecture **dual-token** (JWT stateless + refresh token Redis), intégré à Nitro via `defineNitroModule`. L'architecture sépare les endpoints REST publics (authentification) de l'endpoint GraphQL protégé par JWT (données métier). Des **auth events** sont publiés via EventBus pour le découplage inter-modules. Le design est prêt pour l'extraction en microservice (Epic #43).

**Composants clés :**
- **AuthRestrictionRegistry** : Permet aux modules de domaine de configurer les restrictions d'auth par type d'acteur
- **PermissionService** : Système de permissions granulaires par domaine, scopées par shop, avec héritage de rôles (plugin `access` de better-auth)

## 2. Architecture

### System Context

```
┌─────────────────────────────────────────────────────────────────────┐
│                           c-zo Platform                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐    ┌──────────────┐    ┌─────────────────────────┐   │
│  │  paiya   │───▶│    mazo      │───▶│      PostgreSQL         │   │
│  │ (Next.js)│    │   (Nitro)    │    │  (users, orgs, etc.)    │   │
│  └──────────┘    └──────────────┘    └─────────────────────────┘   │
│        │                │                                           │
│        │                │            ┌─────────────────────────┐   │
│        │                └───────────▶│        Redis            │   │
│        │                             │     (sessions)          │   │
│        │                             └─────────────────────────┘   │
│        │                                                           │
│        │         ┌──────────────┐    ┌─────────────────────────┐   │
│        └────────▶│  OAuth       │    │        Novu             │   │
│                  │  Providers   │    │   (notifications)       │   │
│                  │ Google/GitHub│    └─────────────────────────┘   │
│                  └──────────────┘                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Diagram

```
packages/modules/auth/
├── src/
│   ├── module.ts                    # defineNitroModule entry point
│   ├── plugins/
│   │   └── index.ts                 # IoC container setup, better-auth init
│   ├── config/
│   │   └── auth.config.ts           # better-auth configuration
│   ├── routes/
│   │   └── auth/
│   │       ├── [actor]/             # Dynamic actor-based routes
│   │       │   ├── sign-up.post.ts
│   │       │   ├── sign-in/
│   │       │   │   ├── email.post.ts
│   │       │   │   └── social.post.ts
│   │       │   ├── callback/
│   │       │   │   └── [provider].get.ts
│   │       │   ├── forgot-password.post.ts
│   │       │   ├── reset-password.post.ts
│   │       │   └── verify-email.post.ts
│   │       ├── session.get.ts
│   │       ├── sign-out.post.ts
│   │       ├── switch-actor.post.ts
│   │       ├── two-factor/
│   │       │   ├── enable.post.ts
│   │       │   ├── verify.post.ts
│   │       │   └── disable.post.ts
│   │       ├── token/
│   │       │   └── refresh.post.ts      # JWT refresh endpoint
│   │       └── api-keys/
│   │           ├── index.post.ts
│   │           └── [id].delete.ts
│   ├── schema/                      # GraphQL (authenticated only)
│   │   ├── user/
│   │   ├── session/
│   │   ├── organization/
│   │   └── api-key/
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── session.service.ts
│   │   ├── token.service.ts         # JWT ES256 sign/verify/refresh
│   │   ├── api-key.service.ts
│   │   ├── restriction-registry.ts  # AuthRestrictionRegistry
│   │   ├── permission.service.ts    # PermissionService (plugin access)
│   │   └── auth-events.service.ts   # EventBus publishing for auth events
│   ├── access/                      # Permission system
│   │   ├── index.ts                 # createAccessControl, buildAccessControl
│   │   ├── role-builder.ts          # createRoleBuilder (héritage)
│   │   ├── registry.ts              # registerAccessStatements
│   │   └── types.ts                 # AppPermission, RolePermissions
│   ├── providers/                   # ActorTypeProvider implementations
│   │   └── base-actor.provider.ts
│   ├── middleware/
│   │   ├── graphql-auth.ts          # Protects GraphQL endpoint
│   │   ├── session.ts
│   │   └── api-key.ts
│   └── database/
│       └── schema.ts                # Drizzle schema extensions
├── migrations/
└── tests/
```

### Data Flow

#### Authentication Flow (REST) — Dual-Token
```
Client                    Nitro (mazo)                 better-auth           Redis/PostgreSQL
  │                            │                            │                       │
  │ POST /api/auth/customer/   │                            │                       │
  │     sign-in/email          │                            │                       │
  │ ──────────────────────────▶│                            │                       │
  │                            │ 1. Validate actor type     │                       │
  │                            │    via registry            │                       │
  │                            │ ──────────────────────────▶│                       │
  │                            │                            │ 2. Verify credentials │
  │                            │                            │ ──────────────────────▶
  │                            │                            │◀──────────────────────│
  │                            │                            │ 3. Create session     │
  │                            │                            │    (refresh token)    │
  │                            │                            │ ──────────────────────▶
  │                            │◀───────────────────────────│                       │
  │                            │ 4. Sign JWT (ES256)        │                       │
  │                            │    + return tokens         │                       │
  │◀────────────────────────────                            │                       │
  │ { accessToken: "eyJ...",   │                            │                       │
  │   refreshToken: "czo_rt_...",                           │                       │
  │   expiresIn: 900 }         │                            │                       │
  │                            │ 5. Publish auth.session.   │                       │
  │                            │    created event           │                       │
```

**Response format:**
- `accessToken` (JWT, 15min) — pour `Authorization: Bearer <jwt>` sur toutes les requêtes
- `refreshToken` (opaque, 7j) — pour `POST /api/auth/token/refresh` quand le JWT expire

#### Token Refresh Flow
```
Client                    Auth Service                     Redis
  │                            │                              │
  │ POST /api/auth/token/      │                              │
  │      refresh               │                              │
  │ { refreshToken }           │                              │
  │ ──────────────────────────▶│                              │
  │                            │ 1. Validate refresh token    │
  │                            │ ────────────────────────────▶│
  │                            │◀────────────────────────────│
  │                            │ 2. Load session + user       │
  │                            │ 3. Rotate refresh token      │
  │                            │ ────────────────────────────▶│
  │                            │ 4. Sign new JWT (ES256)      │
  │◀────────────────────────────                              │
  │ { accessToken: "eyJ...",   │                              │
  │   refreshToken: "czo_rt_new",                             │
  │   expiresIn: 900 }         │                              │
```

#### JWT Revocation Flow
```
Admin/User revokes session:
  1. Delete session from Redis (kills refresh token)
  2. Add jti to blocklist: SET czo:blocklist:<jti> 1 EX 900  (TTL = JWT maxAge)
  3. Publish auth.session.revoked event

Request with revoked JWT:
  1. Verify signature → OK
  2. Check blocklist: GET czo:blocklist:<jti> → EXISTS
  3. → 401 Unauthorized
```

#### GraphQL Request Flow (JWT)
```
Client                    Middleware              GraphQL Yoga           Resolver
  │                            │                       │                    │
  │ POST /graphql              │                       │                    │
  │ Authorization: Bearer eyJ..│  ← JWT                │                    │
  │ ──────────────────────────▶│                       │                    │
  │                            │ 1. Verify JWT         │                    │
  │                            │    signature (ES256)  │                    │
  │                            │    + expiration       │                    │
  │                            │                       │                    │
  │                            │ 2. Check blocklist    │                    │
  │                            │    (optional, Redis)  │                    │
  │                            │                       │                    │
  │                            │ 3. Invalid JWT?       │                    │
  │                            │    → 401 Unauthorized │                    │
  │                            │                       │                    │
  │                            │ 4. Decode claims      │                    │
  │                            │    → Add to context   │                    │
  │                            │ ──────────────────────▶                    │
  │                            │                       │ 5. Execute query   │
  │                            │                       │ ──────────────────▶│
  │                            │                       │◀──────────────────│
  │◀───────────────────────────────────────────────────│                    │
  │ { data: ... }              │                       │                    │
```

**Méthodes d'authentification supportées (par priorité):**

| Priorité | Méthode | Usage | Client |
|----------|---------|-------|--------|
| 1 | `Authorization: Bearer <jwt>` | JWT access token | Browser SPA, Mobile, Services |
| 2 | `Authorization: Bearer czo_<key>` | Clé API | Intégrations programmatiques |

### Components

| Component | Technology | Purpose | Dependencies |
|-----------|------------|---------|--------------|
| Auth Module | @czo/auth (Nitro module) | Authentication primitives | @czo/kit, better-auth |
| REST Routes | Nitro routes | Public auth endpoints | better-auth |
| Token Service | jose (ES256) | JWT sign/verify/refresh | ES256 key pair |
| GraphQL Schema | graphql-yoga | Protected queries/mutations | JWT middleware |
| Session Store | Redis | Refresh tokens & JWT blocklist | ioredis |
| Database | PostgreSQL + Drizzle | Users, orgs, API keys, shop_members | @czo/kit database utils |
| Auth Events | @czo/kit EventBus | Domain event publishing | EventBus (hookable/RabbitMQ) |
| Notifications | Novu | Emails (verification, reset, invite) | @novu/node |
| OAuth | Google, GitHub | Social authentication | better-auth plugins |
| Permission Service | better-auth plugin access | Role-based permissions, shop-scoped | better-auth |

### ActorTypeProvider Pattern

Les modules de domaine implémentent `ActorTypeProvider` pour indiquer quels utilisateurs ont quel type d'acteur.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AuthRestrictionRegistry (@czo/auth)                      │
│  ┌─────────────────────────────┐  ┌─────────────────────────────────────┐   │
│  │ actorConfigs                │  │ actorProviders                      │   │
│  │ Map<string, ActorAuthConfig>│  │ Map<string, ActorTypeProvider>      │   │
│  └─────────────────────────────┘  └─────────────────────────────────────┘   │
│        ▲ registerActorType()            ▲ registerActorProvider()           │
└────────┼────────────────────────────────┼───────────────────────────────────┘
         │                                │
    ┌────┴────┐    ┌─────────┐    ┌───────┴───────┐
    │@czo/    │    │@czo/    │    │@czo/          │
    │customer │    │admin    │    │merchant       │
    └─────────┘    └─────────┘    └───────────────┘
```

#### Interface

```typescript
interface ActorTypeProvider {
  /** Le type d'acteur géré par ce provider */
  actorType: string

  /**
   * Détermine si un utilisateur a ce type d'acteur
   * Appelé lors de l'authentification et du switch-actor
   */
  hasActorType(userId: string): Promise<boolean>
}
```

#### Exemples d'implémentation

```typescript
// @czo/admin - Un user est admin s'il existe dans admin_users
const adminActorProvider: ActorTypeProvider = {
  actorType: 'admin',
  async hasActorType(userId: string): Promise<boolean> {
    const row = await db.query.adminUsers.findFirst({
      where: eq(adminUsers.userId, userId),
    })
    return !!row
  },
}

// @czo/merchant - Un user est merchant s'il est membre d'une org merchant
const merchantActorProvider: ActorTypeProvider = {
  actorType: 'merchant',
  async hasActorType(userId: string): Promise<boolean> {
    const membership = await db
      .select()
      .from(members)
      .innerJoin(organizations, eq(members.organizationId, organizations.id))
      .where(and(
        eq(members.userId, userId),
        eq(organizations.type, 'merchant')
      ))
      .limit(1)
    return membership.length > 0
  },
}

// @czo/customer - Tous les users sont potentiellement customers
const customerActorProvider: ActorTypeProvider = {
  actorType: 'customer',
  async hasActorType(userId: string): Promise<boolean> {
    return true // ou vérifier un profil customer
  },
}
```

#### Enregistrement au boot

```typescript
// @czo/admin/plugins/index.ts
export default defineNitroPlugin(async () => {
  const registry = useAuthRestrictionRegistry()

  // Config des restrictions
  registry.registerActorType('admin', {
    allowedMethods: ['email-password', 'oauth:github'],
    priority: 100,
    require2FA: true,
  })

  // Provider pour déterminer qui est admin
  registry.registerActorProvider(adminActorProvider)
})
```

#### Utilisation dans le flow d'auth

```typescript
// POST /api/auth/[actor]/sign-in/email
const user = await verifyCredentials(email, password)

// Vérifier que l'utilisateur a bien ce type d'acteur
const hasActorType = await registry.hasActorType(user.id, actor)
if (!hasActorType) {
  throw createError({
    statusCode: 403,
    message: `User is not registered as ${actor}`,
    data: { code: 'ACTOR_TYPE_MISMATCH' },
  })
}
```

### Actor Type Evolution

Quand un utilisateur acquiert un nouveau type d'acteur (ex: customer crée une boutique → devient merchant) :

```
Customer (Google)  →  Crée boutique  →  Customer + Merchant
     │                     │                    │
     │                     │                    ▼
     │                     │            POST /api/auth/switch-actor
     │                     │            { actorType: "merchant" }
     │                     │                    │
     │                     │         ┌──────────┴──────────┐
     │                     │         │                     │
     │                     │    Méthode OK?           Méthode KO?
     │                     │    (Google ✓)           (ex: admin+GitHub)
     │                     │         │                     │
     │                     │         ▼                     ▼
     │                     │    Nouvelle session     REAUTH_REQUIRED
     │                     │    merchant créée       → login admin
     │                     │
```

**Points clés :**

1. **Évaluation dynamique** - `hasActorType()` est appelé à chaque vérification, pas seulement au login
2. **Sessions existantes préservées** - La session customer reste valide
3. **Switch-actor** - Permet de changer de contexte si la méthode d'auth est compatible
4. **Notification recommandée** - Le module de domaine doit notifier le user de son nouveau rôle

**Implémentation côté module de domaine :**

```typescript
// Quand un user acquiert un nouveau type d'acteur
async function onActorTypeAcquired(userId: string, actorType: string, context: any) {
  // Notifier via Novu
  await novu.trigger('actor-type-granted', {
    to: { subscriberId: userId },
    payload: {
      actorType,
      message: `You now have ${actorType} access!`,
      switchUrl: '/api/auth/switch-actor',
      loginUrl: `/api/auth/${actorType}/sign-in`,
      ...context,
    },
  })
}
```

### Permission System (plugin `access`)

Le système de permissions utilise le plugin `access` de better-auth avec une architecture de rôles par domaine, scopés par shop, avec héritage.

#### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     @czo/auth - Access Control                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  Core Statements (auth module)                                               │
│  ├── user: [read, update, ban, delete]                                      │
│  ├── session: [read, revoke, revoke-all]                                    │
│  └── api-key: [create, read, revoke]                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  Module Statements (registered via provider pattern)                         │
│  ├── @czo/product → product, category, inventory                            │
│  ├── @czo/order → order, refund, fulfillment                                │
│  ├── @czo/shop → shop, staff, settings                                      │
│  └── @czo/finance → payment, payout, invoice                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Role Builder avec Héritage

```typescript
// @czo/auth/access/role-builder.ts
export function createRoleBuilder<S extends Statements>(statements: S) {
  const ac = createAccessControl(statements);

  return {
    statements,
    ac,

    /**
     * Crée une hiérarchie de rôles avec héritage automatique
     * L'ordre définit l'héritage : viewer → editor → manager
     */
    createHierarchy<N extends string>(
      hierarchy: { name: N; permissions: RolePermissions<S> }[]
    ): Record<N, Role> {
      const roles = {} as Record<N, Role>;
      let accumulated: RolePermissions<S> = {};

      for (const { name, permissions } of hierarchy) {
        // Merge avec les permissions accumulées (héritage)
        accumulated = mergePermissions(accumulated, permissions);
        roles[name] = ac.newRole(accumulated);
      }

      return roles;
    },
  };
}
```

#### Exemple de définition de rôles par module

```typescript
// @czo/product/src/access/index.ts
import { createRoleBuilder } from "@czo/auth/access";

export const productStatements = {
  product: ["create", "read", "update", "delete", "publish", "archive"],
  category: ["create", "read", "update", "delete", "reorder"],
  inventory: ["read", "update", "transfer", "audit"],
} as const;

const builder = createRoleBuilder(productStatements);

// Hiérarchie : viewer → editor → manager
export const productRoles = builder.createHierarchy([
  {
    name: "product:viewer",
    permissions: {
      product: ["read"],
      category: ["read"],
      inventory: ["read"],
    },
  },
  {
    name: "product:editor",
    permissions: {
      product: ["create", "update"],
      inventory: ["update"],
    },
    // Hérite de viewer → peut aussi read
  },
  {
    name: "product:manager",
    permissions: {
      product: ["delete", "publish", "archive"],
      category: ["create", "update", "delete", "reorder"],
      inventory: ["transfer", "audit"],
    },
    // Hérite de editor → peut create, update, read
  },
]);
```

#### Permission Resolution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Permission Resolution Flow                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Request: updateProduct(shopId: "shop-abc", ...)               │
│                          │                                       │
│                          ▼                                       │
│   ┌──────────────────────────────────────┐                      │
│   │  1. Extract userId from session       │                      │
│   └──────────────────────────────────────┘                      │
│                          │                                       │
│                          ▼                                       │
│   ┌──────────────────────────────────────┐                      │
│   │  2. Load global roles (platform)      │                      │
│   │     user.globalRoles → ["admin"]?     │                      │
│   └──────────────────────────────────────┘                      │
│                          │                                       │
│                          ▼                                       │
│   ┌──────────────────────────────────────┐                      │
│   │  3. Load shop-scoped roles            │                      │
│   │     shop_members WHERE                │                      │
│   │       userId = X AND shopId = Y       │                      │
│   │     → ["product:editor"]              │                      │
│   └──────────────────────────────────────┘                      │
│                          │                                       │
│                          ▼                                       │
│   ┌──────────────────────────────────────┐                      │
│   │  4. Merge all roles                   │                      │
│   │     ["product:editor"]                │                      │
│   └──────────────────────────────────────┘                      │
│                          │                                       │
│                          ▼                                       │
│   ┌──────────────────────────────────────┐                      │
│   │  5. Resolve inherited permissions     │                      │
│   │     product:editor includes:          │                      │
│   │     - product: [read, create, update] │                      │
│   │     - category: [read]                │                      │
│   │     - inventory: [read, update]       │                      │
│   └──────────────────────────────────────┘                      │
│                          │                                       │
│                          ▼                                       │
│   ┌──────────────────────────────────────┐                      │
│   │  6. Check: product.update ∈ perms?    │                      │
│   │     ✓ YES → Allow                     │                      │
│   └──────────────────────────────────────┘                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### PermissionService Interface

```typescript
// @czo/auth/services/permission.service.ts

export interface PermissionCheckContext {
  userId: string;
  shopId?: string;
}

export interface PermissionService {
  /**
   * Vérifie si l'utilisateur a la permission dans le contexte donné
   */
  hasPermission(
    ctx: PermissionCheckContext,
    resource: string,
    action: string
  ): Promise<boolean>;

  /**
   * Vérifie plusieurs permissions d'un coup
   */
  hasPermissions(
    ctx: PermissionCheckContext,
    permissions: Record<string, string[]>
  ): Promise<boolean>;

  /**
   * Récupère tous les rôles d'un utilisateur pour un shop
   */
  getUserShopRoles(userId: string, shopId: string): Promise<string[]>;

  /**
   * Récupère les permissions effectives (après résolution de l'héritage)
   */
  getEffectivePermissions(
    ctx: PermissionCheckContext
  ): Promise<Record<string, string[]>>;
}
```

#### Intégration GraphQL Context

```typescript
// Helpers disponibles dans le contexte GraphQL
export interface AuthContext {
  claims: JWTClaims;        // Decoded JWT claims
  userId: string;           // claims.sub
  actorType: string;        // claims.act
  organizationId?: string;  // claims.org
  roles: string[];          // claims.roles

  /**
   * Vérifie et throw ForbiddenError si pas autorisé
   */
  requirePermission(
    resource: string,
    action: string,
    shopId?: string
  ): Promise<void>;

  /**
   * Vérifie sans throw - retourne boolean
   */
  canDo(
    resource: string,
    action: string,
    shopId?: string
  ): Promise<boolean>;
}

// Usage dans un resolver
const resolvers = {
  Mutation: {
    updateProduct: async (_, { shopId, id, input }, ctx: AuthContext) => {
      await ctx.requirePermission("product", "update", shopId);
      // ... logique métier
    },
  },
};
```

## 3. API Specification

### REST Endpoints (Public)

#### `POST /api/auth/[actor]/sign-up`
**Description**: Register a new user with specified actor type

**Request**:
```json
{
  "email": "string - required, valid email",
  "password": "string - required, min 8 chars",
  "name": "string - required",
  "organizationName": "string - optional, for merchant actor"
}
```

**Response** (201):
```json
{
  "user": {
    "id": "string - UUID",
    "email": "string",
    "name": "string",
    "emailVerified": false
  },
  "message": "Verification email sent"
}
```

**Error Codes**:
- `400` - Invalid input (validation error)
- `403` - Sign-up not allowed for this actor type
- `409` - Email already registered
- `429` - Rate limit exceeded

---

#### `POST /api/auth/[actor]/sign-in/email`
**Description**: Authenticate with email and password

**Request**:
```json
{
  "email": "string - required",
  "password": "string - required"
}
```

**Response** (200):

```json
{
  "user": {
    "id": "string",
    "email": "string",
    "name": "string"
  },
  "session": {
    "id": "string",
    "actorType": "string",
    "expiresAt": "ISO8601"
  },
  "accessToken": "string - JWT ES256 (15min)",
  "refreshToken": "string - opaque token (czo_rt_..., 7j)",
  "expiresIn": 900,
  "tokenType": "Bearer",
  "requires2FA": "boolean - true if 2FA enabled"
}
```

> **Note**: Le client envoie `Authorization: Bearer <accessToken>` pour chaque requête. Quand le JWT expire, il appelle `POST /api/auth/token/refresh` avec le `refreshToken`.

**JWT Claims** (embarqués dans l'accessToken) :
```typescript
interface JWTClaims {
  sub: string        // userId
  act: string        // actorType
  org?: string       // organizationId
  roles: string[]    // ['product:editor', 'order:viewer']
  method: string     // authMethod
  iat: number        // issued at
  exp: number        // expires at (15min)
  jti: string        // unique token ID (for blocklist)
}
```

**Error Codes**:
- `400` - Invalid credentials
- `401` - Email not verified
- `403` - Auth method not allowed for this actor type
- `429` - Rate limit exceeded (5 attempts / 15 min)

---

#### `POST /api/auth/[actor]/sign-in/social`
**Description**: Initiate OAuth flow

**Request**:
```json
{
  "provider": "string - 'google' | 'github'",
  "redirectUri": "string - optional callback URL"
}
```

**Response** (302):
Redirect to OAuth provider with encrypted state containing actor type

---

#### `GET /api/auth/[actor]/callback/[provider]`
**Description**: OAuth callback handler

**Query Parameters**:
- `code` - Authorization code from provider
- `state` - Encrypted state with actor type

**Response** (302):
Redirect to `redirectUri` with session cookie set

**Error Codes**:
- `403` - Actor mismatch in state vs URL
- `403` - OAuth provider not allowed for this actor type

---

#### `POST /api/auth/switch-actor`
**Description**: Switch to different actor context (requires existing session)

**Request**:
```json
{
  "actorType": "string - target actor type"
}
```

**Response** (200):
```json
{
  "session": {
    "id": "string",
    "actorType": "string - new actor type",
    "expiresAt": "ISO8601"
  }
}
```

**Error Codes**:
- `401` - No active session
- `403` - User doesn't have this actor type
- `403` - Current auth method incompatible, code: `REAUTH_REQUIRED`

---

#### `GET /api/auth/session`
**Description**: Get current session info

**Response** (200):
```json
{
  "session": {
    "id": "string",
    "userId": "string",
    "actorType": "string",
    "organizationId": "string | null",
    "authMethod": "string",
    "expiresAt": "ISO8601"
  },
  "user": {
    "id": "string",
    "email": "string",
    "name": "string",
    "emailVerified": true,
    "twoFactorEnabled": "boolean"
  }
}
```

**Error Codes**:
- `401` - No active session (invalid or expired JWT)

---

#### `POST /api/auth/token/refresh`
**Description**: Refresh an expired JWT access token using a valid refresh token

**Request**:
```json
{
  "refreshToken": "string - czo_rt_... refresh token"
}
```

**Response** (200):
```json
{
  "accessToken": "string - new JWT ES256 (15min)",
  "refreshToken": "string - rotated refresh token (czo_rt_new...)",
  "expiresIn": 900,
  "tokenType": "Bearer"
}
```

**Error Codes**:
- `401` - Invalid or expired refresh token
- `401` - Session revoked
- `429` - Rate limit exceeded

> **Note**: Le refresh token est **rotatif** — chaque appel invalide l'ancien et en émet un nouveau. Si un refresh token est réutilisé (signe de vol), toute la session est révoquée.

---

#### `POST /api/auth/two-factor/enable`
**Description**: Enable TOTP 2FA

**Response** (200):
```json
{
  "secret": "string - base32 encoded",
  "qrCode": "string - data URI for QR code",
  "backupCodes": ["string - 10 backup codes"]
}
```

---

#### `POST /api/auth/two-factor/verify`
**Description**: Verify TOTP code (during login or enabling)

**Request**:
```json
{
  "code": "string - 6 digit TOTP code"
}
```

**Response** (200):
```json
{
  "verified": true,
  "session": { /* full session if completing 2FA login */ }
}
```

---

#### `POST /api/auth/api-keys`
**Description**: Create new API key

**Request**:
```json
{
  "name": "string - descriptive name",
  "organizationId": "string - optional scope",
  "expiresAt": "ISO8601 - optional expiration"
}
```

**Response** (201):
```json
{
  "apiKey": {
    "id": "string",
    "key": "string - czo_xxx... (shown only once)",
    "name": "string",
    "prefix": "string - first 8 chars for identification",
    "createdAt": "ISO8601"
  }
}
```

### GraphQL Schema (Protected)

```graphql
type Query {
  """Current authenticated user"""
  me: User!

  """Effective auth configuration for current user"""
  myAuthConfig: EffectiveAuthConfig!

  """Active sessions for current user"""
  mySessions: [Session!]!

  """Organizations user is member of"""
  myOrganizations: [Organization!]!

  """Organization by ID (if member)"""
  organization(id: ID!): Organization

  """API keys owned by current user"""
  myApiKeys: [ApiKey!]!
}

type Mutation {
  """Update user profile"""
  updateProfile(input: UpdateProfileInput!): User!

  """Change password (requires current password)"""
  changePassword(currentPassword: String!, newPassword: String!): Boolean!

  """Revoke specific session"""
  revokeSession(sessionId: ID!): Boolean!

  """Revoke all sessions except current"""
  revokeAllOtherSessions: Int!

  """Create new organization"""
  createOrganization(input: CreateOrganizationInput!): Organization!

  """Invite member to organization"""
  inviteMember(orgId: ID!, email: String!, role: String!): Invitation!

  """Remove member from organization"""
  removeMember(orgId: ID!, userId: ID!): Boolean!

  """Accept organization invitation"""
  acceptInvitation(token: String!): Member!

  """Impersonate user (admin only)"""
  impersonateUser(userId: ID!): Session!

  """Stop impersonation"""
  stopImpersonation: Session!
}

type User @key(fields: "id") {
  id: ID!
  email: String!
  name: String!
  image: String
  emailVerified: Boolean!
  twoFactorEnabled: Boolean!
  createdAt: DateTime!
}

type Session {
  id: ID!
  actorType: String!
  authMethod: AuthMethod!
  ipAddress: String
  userAgent: String
  createdAt: DateTime!
  expiresAt: DateTime!
  isCurrent: Boolean!
}

type Organization @key(fields: "id") {
  id: ID!
  name: String!
  slug: String!
  members: [Member!]!
  invitations: [Invitation!]!
  createdAt: DateTime!
}

type Member {
  id: ID!
  user: User!
  role: String!
  joinedAt: DateTime!
}

enum AuthMethod {
  EMAIL_PASSWORD
  OAUTH_GOOGLE
  OAUTH_GITHUB
  API_KEY
  IMPERSONATION
}

type EffectiveAuthConfig {
  require2FA: Boolean!
  allowImpersonation: Boolean!
  actorTypes: [String!]!
  dominantActorType: String!
}
```

## 4. Database Design

### Tables (via better-auth + extensions)

#### `user` (better-auth core)
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | text | PK | UUID primary key |
| email | text | UNIQUE, NOT NULL | User email |
| name | text | NOT NULL | Display name |
| email_verified | boolean | DEFAULT false | Email verified flag |
| image | text | NULL | Profile image URL |
| created_at | timestamp | NOT NULL | Creation time |
| updated_at | timestamp | NOT NULL | Last update time |

#### `session` (better-auth + c-zo extensions)
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | text | PK | Session ID |
| user_id | text | FK → user.id | Owner |
| expires_at | timestamp | NOT NULL | Expiration time |
| ip_address | text | NULL | Client IP |
| user_agent | text | NULL | Browser/client info |
| **actor_type** | varchar(50) | NOT NULL | c-zo extension: 'customer' \| 'admin' \| 'merchant' |
| **auth_method** | varchar(50) | NOT NULL | c-zo extension: how user authenticated |
| **organization_id** | text | FK → organization.id | c-zo extension: org context |
| created_at | timestamp | NOT NULL | Creation time |

#### `account` (better-auth core - OAuth)
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | text | PK | Account ID |
| user_id | text | FK → user.id | Owner |
| provider_id | text | NOT NULL | 'google' \| 'github' |
| provider_account_id | text | NOT NULL | ID from provider |
| access_token | text | NULL | OAuth access token |
| refresh_token | text | NULL | OAuth refresh token |
| expires_at | timestamp | NULL | Token expiration |
| created_at | timestamp | NOT NULL | Creation time |

**Index**: `UNIQUE(provider_id, provider_account_id)`

#### `organization` (better-auth plugin)
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | text | PK | Org ID |
| name | text | NOT NULL | Display name |
| slug | text | UNIQUE, NOT NULL | URL-safe identifier |
| metadata | jsonb | NULL | Custom metadata |
| created_at | timestamp | NOT NULL | Creation time |

#### `member` (better-auth plugin)
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | text | PK | Membership ID |
| user_id | text | FK → user.id | Member |
| organization_id | text | FK → organization.id | Organization |
| role | text | NOT NULL | 'owner' \| 'admin' \| 'member' \| 'viewer' |
| created_at | timestamp | NOT NULL | Join time |

**Index**: `UNIQUE(user_id, organization_id)`

#### `invitation` (better-auth plugin)
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | text | PK | Invitation ID |
| email | text | NOT NULL | Invitee email |
| organization_id | text | FK → organization.id | Target org |
| role | text | NOT NULL | Assigned role |
| token | text | UNIQUE | Invitation token |
| status | text | DEFAULT 'pending' | 'pending' \| 'accepted' \| 'expired' |
| expires_at | timestamp | NOT NULL | Expiration time |
| created_at | timestamp | NOT NULL | Creation time |

#### `two_factor` (better-auth plugin)
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | text | PK | 2FA config ID |
| user_id | text | FK → user.id, UNIQUE | Owner |
| secret | text | NOT NULL | TOTP secret (encrypted) |
| backup_codes | text[] | NOT NULL | Hashed backup codes |
| created_at | timestamp | NOT NULL | Setup time |

#### `api_key` (better-auth plugin)
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | text | PK | Key ID |
| user_id | text | FK → user.id | Owner |
| key_hash | text | NOT NULL | Hashed key |
| prefix | text | NOT NULL | First 8 chars (czo_xxxx) |
| name | text | NOT NULL | Descriptive name |
| organization_id | text | FK → organization.id | Scope (optional) |
| expires_at | timestamp | NULL | Expiration (optional) |
| last_used_at | timestamp | NULL | Last usage time |
| created_at | timestamp | NOT NULL | Creation time |

**Index**: `INDEX(prefix)` for lookup

#### `shop_members` (c-zo extension - permissions scopées)
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| shop_id | text | PK, FK → shop.id | Shop |
| user_id | text | PK, FK → user.id | Member |
| roles | text[] | NOT NULL, DEFAULT '{}' | Roles: ['product:editor', 'order:viewer'] |
| invited_by | text | FK → user.id | Who invited this member |
| joined_at | timestamp | NOT NULL | Join time |
| created_at | timestamp | NOT NULL | Creation time |
| updated_at | timestamp | NOT NULL | Last update time |

**Constraint**: `PRIMARY KEY (shop_id, user_id)`
**Index**: `INDEX(user_id)` for user lookups

#### `user` extension (global roles)
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| global_roles | text[] | DEFAULT '{}' | Platform-wide roles: ['platform-admin'] |

> Note: Cette colonne est ajoutée à la table `user` de better-auth via migration

### Migrations

```typescript
// migrations/0001_create_auth_tables.ts
import { sql } from 'drizzle-orm'

export async function up(db: Database) {
  // better-auth creates core tables automatically
  // We add c-zo extensions to session table
  await db.execute(sql`
    ALTER TABLE session
    ADD COLUMN actor_type VARCHAR(50) NOT NULL DEFAULT 'customer',
    ADD COLUMN auth_method VARCHAR(50) NOT NULL DEFAULT 'email-password',
    ADD COLUMN organization_id TEXT REFERENCES organization(id)
  `)

  await db.execute(sql`
    CREATE INDEX idx_session_actor_type ON session(actor_type)
  `)

  await db.execute(sql`
    CREATE INDEX idx_api_key_prefix ON api_key(prefix)
  `)
}

export async function down(db: Database) {
  await db.execute(sql`
    ALTER TABLE session
    DROP COLUMN actor_type,
    DROP COLUMN auth_method,
    DROP COLUMN organization_id
  `)
}
```

```typescript
// migrations/0002_create_permission_tables.ts
import { sql } from 'drizzle-orm'

export async function up(db: Database) {
  // Add global_roles to user table
  await db.execute(sql`
    ALTER TABLE "user"
    ADD COLUMN global_roles TEXT[] NOT NULL DEFAULT '{}'
  `)

  // Create shop_members table for shop-scoped permissions
  await db.execute(sql`
    CREATE TABLE shop_members (
      shop_id TEXT NOT NULL REFERENCES shop(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      roles TEXT[] NOT NULL DEFAULT '{}',
      invited_by TEXT REFERENCES "user"(id),
      joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (shop_id, user_id)
    )
  `)

  await db.execute(sql`
    CREATE INDEX idx_shop_members_user_id ON shop_members(user_id)
  `)
}

export async function down(db: Database) {
  await db.execute(sql`DROP TABLE shop_members`)
  await db.execute(sql`ALTER TABLE "user" DROP COLUMN global_roles`)
}
```

## 5. Security

### Authentication

| Method | Actors | Implementation |
|--------|--------|----------------|
| Email/Password | All | better-auth core, bcrypt hashing |
| Google OAuth | Customer, Merchant | better-auth OAuth plugin |
| GitHub OAuth | Admin | better-auth OAuth plugin |
| TOTP 2FA | All (required for Admin) | better-auth two-factor plugin |
| API Keys | API Consumer | better-auth api-key plugin, prefix `czo_` |

### Token Architecture (Dual-Token)

| Token | Format | Durée | Stockage Client | Stockage Serveur |
|-------|--------|-------|-----------------|------------------|
| Access Token | JWT ES256 | 15min | Memory / Header | Aucun (stateless) |
| Refresh Token | Opaque (`czo_rt_...`) | 7j | Secure storage | Redis (session) |

**Algorithme** : ES256 (ECDSA P-256) — clé privée pour signer (auth service), clé publique pour vérifier (tout service).

**Transport** : `Authorization: Bearer <jwt>` pour toutes les requêtes API.

**Révocation immédiate** : Redis blocklist avec TTL = JWT maxAge (15min).
```
SET czo:blocklist:<jti> 1 EX 900
```

**Rotation refresh token** : À chaque refresh, l'ancien token est invalidé. Réutilisation d'un ancien token → révocation complète de la session (détection de vol).

### Authorization

```typescript
// Middleware chain for GraphQL
export const authMiddleware = [
  extractJWT,           // Extract JWT from Authorization: Bearer <jwt>
  verifyJWT,            // Verify ES256 signature + expiration
  checkBlocklist,       // Optional: check Redis blocklist for jti
  decodeClaimsToContext, // Add decoded claims to context
  checkActorPermissions // Verify actorType allows operation
]

// Context available in resolvers (from JWT claims)
interface GraphQLContext {
  claims: JWTClaims           // Decoded JWT claims
  userId: string              // claims.sub
  actorType: string           // claims.act — 'customer' | 'admin' | 'merchant'
  organizationId: string | null // claims.org
  roles: string[]             // claims.roles — ['product:editor', 'order:viewer']
  authMethod: string          // claims.method
  authSource: 'jwt' | 'api-key'
}
```

### Data Protection

| Data | Protection |
|------|------------|
| Passwords | bcrypt (cost 12) or argon2id |
| TOTP Secrets | AES-256-GCM encryption at rest |
| Backup Codes | bcrypt hashed |
| API Keys | SHA-256 hashed, only prefix stored readable |
| JWT Signing Key | ES256 private key, env variable or file, never in DB |
| JWT Verification Key | ES256 public key, distributable to all services |
| Refresh Tokens | Redis with TTL (7j), rotated on each use |
| JWT Blocklist | Redis with TTL (15min), for immediate revocation |
| OAuth Tokens | Encrypted in database |

### Threat Model

| Threat | Mitigation |
|--------|------------|
| Credential Stuffing | Rate limiting (5/15min), 2FA promotion |
| JWT Token Theft | Short-lived (15min), blocklist for immediate revocation |
| Refresh Token Theft | Rotation on each use, reuse detection → session revocation |
| JWT Key Compromise | ES256 key rotation, short expiry limits exposure window |
| CSRF | JWT in Authorization header (not cookies), no CSRF needed |
| User Enumeration | Generic error messages, no email existence check |
| Privilege Escalation | Actor type + roles in JWT claims, validated per-request |
| API Key Leakage | Prefix for detection (czo_), rotation support, scoped to org |
| OAuth State Tampering | Encrypted state with actor type, HMAC validation |
| 2FA Bypass | Limited backup codes, rate limited verification |

## 6. Performance

### Requirements

| Metric | Target | Method |
|--------|--------|--------|
| Login latency | < 200ms p95 | APM |
| JWT verification | < 5ms p95 | APM (local ES256 verify, no network) |
| Token refresh | < 50ms p95 | APM |
| GraphQL auth overhead | < 10ms | APM (JWT verify + optional blocklist check) |
| API key validation | < 20ms p95 | APM |

### Scaling Strategy

```
                    Load Balancer
                         │
          ┌──────────────┼──────────────┐
          │              │              │
     ┌────▼────┐    ┌────▼────┐    ┌────▼────┐
     │  Nitro  │    │  Nitro  │    │  Nitro  │
     │Instance │    │Instance │    │Instance │
     └────┬────┘    └────┬────┘    └────┬────┘
          │              │              │
          └──────────────┼──────────────┘
                         │
              ┌──────────┴──────────┐
              │                     │
         ┌────▼────┐          ┌─────▼─────┐
         │  Redis  │          │ PostgreSQL│
         │ Cluster │          │  Primary  │
         └─────────┘          └───────────┘
```

- **JWT Stateless verification** - Each instance (or future microservice) verifies JWT locally with ES256 public key — no network call
- **Redis** - Refresh tokens, JWT blocklist, rate limit counters
- **Connection pooling** - PostgreSQL via Drizzle

### Caching

| Data | Cache | TTL | Invalidation |
|------|-------|-----|--------------|
| Refresh tokens | Redis | 7 days | On logout, explicit revoke, rotation |
| JWT blocklist | Redis | 15 min (= JWT maxAge) | Auto-expire |
| User by ID | Redis | 5 min | On profile update |
| Org membership | Redis | 5 min | On member add/remove |
| Rate limit counters | Redis | Window duration | Auto-expire |

```typescript
// Token config
const tokenConfig = {
  jwt: {
    algorithm: 'ES256',
    expiresIn: 900,              // 15 minutes
    issuer: 'czo-auth',
  },
  refresh: {
    keyPrefix: 'czo:session:',
    maxAge: 7 * 24 * 60 * 60,   // 7 days
  },
  blocklist: {
    keyPrefix: 'czo:blocklist:',
    ttl: 900,                    // 15 min (= JWT maxAge)
  },
}
```

## 7. Observability

### Logging

| Event | Level | Data |
|-------|-------|------|
| Login success | INFO | userId, actorType, authMethod, IP |
| Login failure | WARN | email (hashed), reason, IP |
| Session created | INFO | sessionId, userId, actorType |
| Session revoked | INFO | sessionId, userId, reason |
| 2FA enabled | INFO | userId |
| API key created | INFO | userId, keyPrefix, orgId |
| Rate limit hit | WARN | IP, endpoint, count |
| Impersonation start | WARN | adminId, targetUserId |
| Impersonation end | INFO | adminId, duration |

### Auth Events (EventBus)

Le module auth publie des domain events via `EventBus.publish()` pour chaque action significative. En monolithe, le provider hookable (in-process) est utilisé. En microservices, RabbitMQ prend le relais.

```typescript
// auth-events.service.ts
const AUTH_EVENTS = {
  USER_REGISTERED:    'auth.user.registered',    // { userId, email, actorType }
  USER_UPDATED:       'auth.user.updated',       // { userId, changes }
  SESSION_CREATED:    'auth.session.created',     // { sessionId, userId, actorType, authMethod }
  SESSION_REVOKED:    'auth.session.revoked',     // { sessionId, userId, reason }
  ORG_CREATED:        'auth.org.created',         // { orgId, name, ownerId }
  ORG_MEMBER_ADDED:   'auth.org.member_added',    // { orgId, userId, role }
  ORG_MEMBER_REMOVED: 'auth.org.member_removed',  // { orgId, userId }
  ROLE_CHANGED:       'auth.role.changed',        // { userId, shopId?, oldRoles, newRoles }
} as const

// Usage example
await eventBus.publish(createDomainEvent({
  type: AUTH_EVENTS.SESSION_CREATED,
  source: 'auth',
  data: { sessionId, userId, actorType, authMethod },
}))
```

> **Note**: Auth est **producteur uniquement** — il ne consomme aucun event externe. Cela garantit l'absence de dépendances circulaires.

### Metrics

```typescript
// Prometheus metrics
const authMetrics = {
  login_total: Counter({ labels: ['actor_type', 'method', 'status'] }),
  login_duration: Histogram({ labels: ['actor_type', 'method'] }),
  token_refresh_total: Counter({ labels: ['status'] }),
  token_revocation_total: Counter({ labels: ['reason'] }),
  jwt_blocklist_size: Gauge(),
  session_active: Gauge({ labels: ['actor_type'] }),
  rate_limit_hits: Counter({ labels: ['endpoint'] }),
  two_factor_enabled: Gauge(),
  api_key_active: Gauge({ labels: ['org_id'] }),
  auth_events_published: Counter({ labels: ['event_type'] }),
}
```

### Alerts

| Alert | Condition | Severity |
|-------|-----------|----------|
| High login failure rate | > 100 failures / 5 min | Warning |
| Session validation errors | > 10 / min | Critical |
| Redis connection issues | Connection failures | Critical |
| Rate limit spike | > 1000 hits / min | Warning |
| 2FA bypass attempts | Any backup code used | Info |

## 8. Dependencies

### External Services

| Service | Purpose | Fallback |
|---------|---------|----------|
| Google OAuth | Customer/Merchant social login | Email/password only |
| GitHub OAuth | Admin social login | Email/password only |
| Novu | Email notifications | Queue and retry |
| Redis | Session storage | Fail closed (reject requests) |

### Libraries/Packages

| Package | Version | Purpose |
|---------|---------|---------|
| better-auth | ^1.x | Core auth library |
| @better-auth/drizzle | ^1.x | Drizzle adapter |
| @better-auth/plugins | ^1.x | org, 2fa, api-key, admin, access plugins |
| jose | ^6.x | JWT ES256 sign/verify (Web Crypto API) |
| ioredis | ^5.x | Redis client |
| @novu/node | ^2.x | Notification service |
| otplib | ^12.x | TOTP generation/validation |
| bcrypt | ^5.x | Password hashing |
| @czo/kit | workspace | EventBus for auth events |

### Infrastructure

- Redis 7+ (refresh tokens, JWT blocklist, rate limiting)
- PostgreSQL 17+ (user data)
- Environment variables for secrets:
  - `AUTH_JWT_PRIVATE_KEY` — ES256 private key (PEM or JWK)
  - `AUTH_JWT_PUBLIC_KEY` — ES256 public key (distributed to all services)
  - `AUTH_JWT_ISSUER` — JWT issuer claim (default: `czo-auth`)

## 9. Testing Strategy

### Unit Tests

```typescript
// services/restriction-registry.test.ts
describe('AuthRestrictionRegistry', () => {
  it('registers actor types with config')
  it('resolves effective config for multi-role user')
  it('throws after freeze')
  it('returns default config for unknown actor')
})

// services/session.service.test.ts
describe('SessionService', () => {
  it('creates session with actor context')
  it('validates session from Redis')
  it('revokes session')
  it('handles switch-actor with compatible method')
  it('rejects switch-actor with incompatible method')
})

// services/token.service.test.ts
describe('TokenService', () => {
  it('signs JWT with ES256 and correct claims')
  it('verifies valid JWT and returns claims')
  it('rejects expired JWT')
  it('rejects JWT with invalid signature')
  it('checks blocklist and rejects revoked jti')
  it('refreshes token and rotates refresh token')
  it('detects refresh token reuse and revokes session')
})

// services/auth-events.service.test.ts
describe('AuthEventsService', () => {
  it('publishes auth.user.registered on signup')
  it('publishes auth.session.created on login')
  it('publishes auth.session.revoked on logout')
  it('publishes auth.role.changed on role update')
  it('includes correlationId from context')
})
```

### Integration Tests

```typescript
// routes/auth.integration.test.ts
describe('Auth Routes', () => {
  describe('POST /api/auth/customer/sign-up', () => {
    it('creates user and sends verification email')
    it('rejects duplicate email')
    it('validates password strength')
  })

  describe('POST /api/auth/admin/sign-in/email', () => {
    it('requires 2FA for admin')
    it('rejects Google OAuth for admin')
  })

  describe('POST /api/auth/token/refresh', () => {
    it('returns new JWT + rotated refresh token')
    it('rejects expired refresh token')
    it('revokes session on refresh token reuse')
  })

  describe('GraphQL Protection', () => {
    it('rejects requests without JWT')
    it('rejects requests with expired JWT')
    it('allows requests with valid JWT and populates context')
    it('rejects revoked JWT (jti in blocklist)')
  })
})
```

### Load Tests

```yaml
# k6 load test config
scenarios:
  login_load:
    executor: 'ramping-vus'
    stages:
      - duration: '1m', target: 100
      - duration: '3m', target: 100
      - duration: '1m', target: 0
    exec: 'loginFlow'

  session_validation:
    executor: 'constant-arrival-rate'
    rate: 1000
    duration: '5m'
    exec: 'validateSession'

thresholds:
  http_req_duration: ['p(95)<200']
  http_req_failed: ['rate<0.01']
```

## 10. Rollout Plan

### Feature Flags

| Flag | Description | Default |
|------|-------------|---------|
| `auth.oauth.google` | Enable Google OAuth | true |
| `auth.oauth.github` | Enable GitHub OAuth | true |
| `auth.2fa.required.admin` | Force 2FA for admins | true |
| `auth.rate_limit.enabled` | Enable rate limiting | true |

### Deployment Stages

1. **Phase 1: Core Auth + JWT** (Week 1-2)
   - Email/password registration and login
   - JWT dual-token architecture (ES256 access + refresh)
   - Token refresh endpoint
   - GraphQL protection middleware (JWT verification)

2. **Phase 2: OAuth + Events** (Week 3-4)
   - Google OAuth for customer/merchant
   - GitHub OAuth for admin
   - Auth events via EventBus (8 events)
   - Organization CRUD and invitations

3. **Phase 3: 2FA + API Keys** (Week 5)
   - TOTP 2FA with backup codes
   - API key generation and validation

4. **Phase 4: AuthRestrictionRegistry** (Week 6)
   - Registry service implementation
   - Domain module integration
   - Admin capabilities (impersonation)

5. **Phase 5: Permission System** (Week 7)
   - Plugin access integration
   - shop_members table and migrations
   - PermissionService implementation
   - createRoleBuilder with inheritance
   - GraphQL context helpers (requirePermission, canDo)

6. **Launch** (Week 8)
   - Production deployment
   - Monitoring enabled
   - Documentation published

### Rollback Plan

| Issue | Rollback Action |
|-------|-----------------|
| better-auth breaking change | Pin to previous version, hotfix |
| Redis failure | JWT still works (stateless), refresh fails gracefully, re-login required |
| JWT key compromise | Rotate ES256 key pair, all JWTs invalid (15min max exposure) |
| OAuth provider outage | Disable OAuth flag, email/password only |
| Critical security vuln | Add all active jti to blocklist, force re-auth |

---

## Appendix

### Open Questions

- [x] better-auth hooks support actor validation? → **Yes, via `after` hooks**
- [x] Session extension fields in Drizzle? → **ALTER TABLE after better-auth init**
- [x] Rate limiting library? → **Custom with Redis (not external lib)**
- [x] Permission architecture? → **Rôles par domaine, scopés par shop, héritage par composition**
- [x] Permission storage? → **Table `shop_members` avec colonne `roles` (array)**
- [x] Global vs scoped roles? → **`global_roles` sur user + `roles` par shop**
- [x] Token strategy? → **JWT dual-token** (ES256 access 15min + opaque refresh 7j)
- [x] JWT algorithm? → **ES256** (asymmetric, public key distributable to microservices)
- [x] JWT revocation? → **Redis blocklist** (TTL = JWT maxAge = 15min)
- [x] Auth events? → **8 events via EventBus** (hookable in monolith, RabbitMQ in microservices)
- [x] Cookie-based auth? → **Dropped** — JWT in Authorization header eliminates CSRF risk

### ADRs

- **ADR-001**: REST for auth, GraphQL protected → Security and simplicity
- **ADR-002**: Actor-based endpoints → Early validation, no user enumeration
- **ADR-003**: AuthRestrictionRegistry → Domain module independence
- **ADR-004**: Roles per domain → Each module defines its own roles for flexibility
- **ADR-005**: Shop-scoped permissions → User can have different roles in different shops
- **ADR-006**: Role inheritance by composition → `createRoleBuilder` with cumulative permissions
- **ADR-007**: JWT stateless (ES256) over session cookies → Microservice-ready, no network call for validation, eliminates CSRF
- **ADR-008**: Dual-token pattern (JWT access + opaque refresh) → Short exposure window (15min) + long session (7j) via rotation
- **ADR-009**: Auth events via EventBus from day one → Enables loose coupling with domain modules, ready for RabbitMQ extraction
- **ADR-010**: GraphQL @key directives → Zero-cost federation readiness for GraphQL Mesh

### References

- [better-auth Documentation](https://www.better-auth.com/)
- [better-auth Drizzle Adapter](https://www.better-auth.com/docs/adapters/drizzle)
- [better-auth Plugin Access](https://www.better-auth.com/docs/plugins/admin) - Permission system
- [OWASP Authentication Cheatsheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [Brainstorm Auth](./brainstorm.md)
- [PRD Auth](./prd.md)
- [Brainstorm Microservices](../kit/brainstorm-microservices.md) - Service extraction strategy
- [Brainstorm Kit](../kit/brainstorm.md) - App integration with permissions
- [jose Documentation](https://github.com/panva/jose) - JWT ES256 library
