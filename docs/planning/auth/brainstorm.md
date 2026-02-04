# Brainstorm: Module Auth

- **Date:** 2026-02-03
- **Participants:** Claude (Briana), Utilisateur
- **Statut:** Prêt pour PRD

---

## Énoncé du Problème

### Le Problème
c-zo a besoin d'un système complet d'authentification et d'autorisation qui supporte plusieurs types d'acteurs (clients, marchands, administrateurs, consommateurs API) tout en restant agnostique au domaine. Le module auth doit fournir des primitives sur lesquelles les modules de domaine peuvent s'appuyer sans être étroitement couplés à une logique métier spécifique.

### Qui est Affecté
- **Clients**: Ont besoin d'une inscription et connexion simple et sécurisée pour acheter
- **Marchands**: Ont besoin d'un accès basé sur l'organisation pour gérer leurs boutiques
- **Administrateurs**: Ont besoin d'un accès au niveau plateforme pour le support et la gestion
- **Consommateurs API**: Ont besoin d'un accès programmatique pour les intégrations et le commerce headless
- **Développeurs**: Ont besoin de contrats clairs pour intégrer l'auth avec les modules de domaine

### Solutions Actuelles
- Développement greenfield - aucun système d'auth en place
- Le placeholder du module existe à `packages/modules/auth/` mais est vide

### Pourquoi Maintenant
- L'authentification est fondamentale - requise avant que les autres modules puissent implémenter des fonctionnalités protégées
- Les modules product et attribute progressent et auront besoin du contexte utilisateur
- Les exigences du commerce headless demandent l'authentification API dès le premier jour

---

## Compréhension des Utilisateurs

### Utilisateurs Principaux

**Acteur: Client**
- **Objectifs:** Inscription rapide, connexion facile, paiement sécurisé
- **Points de friction:** Friction à l'inscription, fatigue des mots de passe
- **Contexte:** Achats sur web/mobile, peut utiliser des comptes sociaux

**Acteur: Marchand**
- **Objectifs:** Gérer la boutique avec les membres de l'équipe, contrôler les niveaux d'accès
- **Points de friction:** Gestion complexe des permissions, onboarding de l'équipe
- **Contexte:** Opérations quotidiennes de la boutique, plusieurs membres du personnel

**Acteur: Administrateur**
- **Objectifs:** Supporter les utilisateurs, gérer la plateforme, investiguer les problèmes
- **Points de friction:** Besoin de visibilité sans compromettre la sécurité
- **Contexte:** Tickets de support, gestion des utilisateurs, débogage

**Acteur: Consommateur API**
- **Objectifs:** Accès programmatique fiable, authentification claire
- **Points de friction:** Gestion des tokens, confusion des scopes
- **Contexte:** Intégrations (ERP, PIM, expédition), apps mobiles, vitrines tierces

### Insights Clés
- Un système d'identité unique simplifie la gestion des utilisateurs et permet des fonctionnalités transversales
- Le design domain-agnostic reflète le pattern du module attribute et permet l'indépendance des modules
- better-auth fournit des primitives éprouvées avec un design TypeScript-first
- Le modèle d'organisation est assez flexible pour les marchands, agences, équipes sans coder en dur la sémantique

---

## Idées Explorées

### Solutions Envisagées
1. **Auth custom from scratch** - Construire tout en utilisant JWT/sessions manuellement
2. **Auth.js (NextAuth)** - Populaire mais centré Next.js, moins flexible pour Nitro
3. **Lucia Auth** - Léger, bonne DX, mais moins riche en fonctionnalités
4. **better-auth** - TypeScript-first, écosystème de plugins, agnostique au framework
5. **Fournisseur externe (Auth0, Clerk)** - Solutions SaaS, vendor lock-in

### Matrice d'Évaluation
| Idée | Impact | Effort | Risque | Score |
|------|--------|--------|--------|-------|
| Auth custom | Élevé | Très Élevé | Élevé | Non recommandé - risque sécurité |
| Auth.js | Moyen | Moyen | Moyen | Trop spécifique à Next.js |
| Lucia Auth | Moyen | Faible | Faible | Manque de fonctionnalités entreprise |
| better-auth | Élevé | Moyen | Faible | Meilleur fit pour c-zo |
| Fournisseur externe | Moyen | Faible | Moyen | Vendor lock-in, coût |

### Approche Sélectionnée
**better-auth** avec les plugins suivants:
- **organization** - Support multi-tenant avec rôles et invitations
- **two-factor** - 2FA basé sur TOTP pour une sécurité renforcée
- **api-key** - Accès programmatique pour les intégrations
- **admin** - Gestion des utilisateurs et impersonation pour le support
- **access** - Système de permissions basé sur des statements déclaratifs

### Idées Écartées
- Auth custom: Risque de sécurité, charge de maintenance
- Auth.js: Trop couplé aux patterns Next.js
- Fournisseurs externes: Vendor lock-in, préoccupations de résidence des données, coût à l'échelle

---

## Architecture

### Principes Clés

1. **Domain-Agnostic**: Auth fournit les primitives (users, sessions, organizations, roles); les modules de domaine définissent la sémantique
2. **Table Users Unique**: Tous les acteurs partagent une table avec différenciation par rôles
3. **Organisations Génériques**: Les organisations ne sont pas liées aux "marchands" - les modules de domaine interprètent l'appartenance à l'organisation
4. **Pattern Consumer**: Similaire au module attribute - auth fournit les données, les consumers (modules de domaine) définissent le sens
5. **REST pour Auth, GraphQL Protégé**: Les opérations d'authentification (register, login, etc.) sont exposées en REST; l'endpoint GraphQL est entièrement protégé

### Séparation REST / GraphQL

#### Pourquoi REST pour l'Authentification?

| Aspect | REST (Auth) | GraphQL (Protégé) |
|--------|-------------|-------------------|
| **Accès** | Public (non authentifié) | Requiert session valide |
| **Opérations** | Register, login, logout, password reset, OAuth callbacks | Queries/mutations métier |
| **Rate Limiting** | Agressif (protection brute-force) | Standard |
| **Surface d'attaque** | Minimale, endpoints bien définis | Large, introspection possible |
| **Caching** | HTTP caching natif | Complexe |

#### Avantages de cette Architecture

1. **Sécurité**: L'endpoint GraphQL peut rejeter toute requête sans session valide
2. **Simplicité**: better-auth fournit déjà des endpoints REST out-of-the-box
3. **Standards**: OAuth callbacks et redirections fonctionnent naturellement en REST
4. **Performance**: Les opérations auth sont simples, pas besoin de la flexibilité GraphQL
5. **Protection introspection**: Pas de fuite de schéma pour les utilisateurs non authentifiés

#### Endpoints REST par Acteur

L'URL porte le type d'acteur: `/api/auth/[actor]/<action>`

**Avantages de cette structure:**
- L'intention est explicite dans l'URL
- Validation des restrictions AVANT l'authentification
- Pas de risque d'énumération utilisateur
- OAuth callback conserve l'acteur dans le state
- Session porte le contexte acteur

```
/api/auth/[actor]/                    # [actor] = customer | admin | merchant | ...
├── sign-up                           # Inscription (si autorisé pour cet acteur)
├── sign-in/
│   ├── email                         # Connexion email/password
│   └── social                        # Initier OAuth
├── callback/:provider                # Callback OAuth (acteur dans state)
├── forgot-password                   # Demande reset password
├── reset-password                    # Appliquer reset
└── verify-email                      # Vérification email

/api/auth/                            # Endpoints partagés (authentifié)
├── session                           # Session courante (inclut actorType)
├── sign-out                          # Déconnexion
├── switch-actor                      # Changer de contexte acteur (si multi-rôles)
├── two-factor/
│   ├── enable                        # Activer 2FA
│   ├── verify                        # Vérifier code TOTP
│   └── disable                       # Désactiver 2FA
└── api-keys/
    ├── POST                          # Créer une clé
    └── DELETE /:id                   # Révoquer une clé
```

**Exemples:**

```bash
# Customer s'inscrit via email
POST /api/auth/customer/sign-up
{ "email": "client@example.com", "password": "...", "name": "Jean" }

# Customer se connecte via Google
POST /api/auth/customer/sign-in/social
{ "provider": "google" }
# → Redirige vers Google avec state={"actor":"customer","nonce":"..."}

# Admin se connecte (email/password uniquement, 2FA obligatoire)
POST /api/auth/admin/sign-in/email
{ "email": "admin@czo.com", "password": "..." }
# → Vérifie restrictions admin, requiert 2FA

# Merchant s'inscrit (crée aussi une organisation)
POST /api/auth/merchant/sign-up
{ "email": "shop@example.com", "password": "...", "organizationName": "Ma Boutique" }
# → Crée user + organization + membership role=owner
```

#### Session avec Contexte Acteur

La session porte le type d'acteur utilisé lors de la connexion:

```typescript
interface Session {
  id: string
  userId: string
  actorType: string        // "customer" | "admin" | "merchant" | ...
  organizationId?: string  // Si connecté dans le contexte d'une org
  expiresAt: Date
  createdAt: Date
  ipAddress: string
  userAgent: string
  authMethod: AuthMethod   // Comment l'utilisateur s'est authentifié
}
```

**Pourquoi le contexte acteur dans la session?**

1. **Permissions contextuelles**: Un user admin+customer a des permissions différentes selon son contexte
2. **Audit trail**: Savoir "en tant que quoi" une action a été effectuée
3. **UX**: Afficher l'interface appropriée (dashboard admin vs storefront)
4. **Multi-sessions**: Peut avoir une session admin ET une session customer simultanées

**Changement de contexte (multi-rôles):**

```bash
# User connecté en tant que customer veut passer en mode admin
POST /api/auth/switch-actor
{ "actorType": "admin" }

# Vérifie:
# 1. L'utilisateur a bien le rôle admin
# 2. La méthode d'auth actuelle est autorisée pour admin
# 3. Si non → force re-authentification via endpoint admin
```

#### Gestion OAuth avec State

```typescript
// 1. Initiation OAuth - conserve l'acteur dans le state
// POST /api/auth/customer/sign-in/social { "provider": "google" }

const state = encryptState({
  actor: 'customer',
  nonce: generateNonce(),
  redirectUri: body.redirectUri,
})

const authUrl = `https://accounts.google.com/oauth?` +
  `client_id=${config.google.clientId}&` +
  `redirect_uri=/api/auth/customer/callback/google&` +
  `state=${state}`

// 2. Callback - vérifie cohérence acteur
// GET /api/auth/customer/callback/google?code=...&state=...

const { actor, nonce } = decryptState(query.state)

// Sécurité: l'acteur dans l'URL doit matcher le state
if (actor !== routeParam.actor) {
  throw createError({ statusCode: 403, message: 'Actor mismatch in OAuth callback' })
}

// 3. Créer session avec contexte acteur
const session = await auth.api.createSession({
  userId: user.id,
  actorType: actor,           // Porté dans la session
  authMethod: 'oauth:google',
})
```

#### GraphQL: Queries/Mutations Authentifiées Uniquement

```graphql
# Toutes ces opérations requièrent une session valide

type Query {
  # User courant
  me: User!
  myAuthConfig: EffectiveAuthConfig!
  mySessions: [Session!]!

  # Organisations (si membre)
  myOrganizations: [Organization!]!
  organization(id: ID!): Organization

  # API Keys (si propriétaire)
  myApiKeys: [ApiKey!]!
}

type Mutation {
  # Gestion profil
  updateProfile(input: UpdateProfileInput!): User!
  changePassword(currentPassword: String!, newPassword: String!): Boolean!

  # Sessions
  revokeSession(sessionId: ID!): Boolean!
  revokeAllOtherSessions: Int!

  # Organisations
  createOrganization(input: CreateOrganizationInput!): Organization!
  inviteMember(orgId: ID!, email: String!, role: String!): Invitation!
  removeMember(orgId: ID!, userId: ID!): Boolean!
  acceptInvitation(token: String!): Member!

  # Admin (si rôle admin)
  impersonateUser(userId: ID!): Session!
  stopImpersonation: Session!
}
```

#### Middleware de Protection GraphQL

```typescript
// apps/mazo/middleware/graphql-auth.ts
export default defineEventHandler(async (event) => {
  // Ne s'applique qu'à l'endpoint GraphQL
  if (!event.path.startsWith('/graphql')) return

  const session = await getSession(event)

  // Exceptions: introspection en dev uniquement
  if (process.env.NODE_ENV === 'development') {
    const body = await readBody(event)
    if (body?.operationName === 'IntrospectionQuery') return
  }

  // Pas de session = accès refusé
  if (!session) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication required',
      data: {
        code: 'UNAUTHENTICATED',
        // Pas de loginUrl générique - le client choisit l'endpoint selon le contexte
        // Ex: /api/auth/customer/sign-in ou /api/auth/admin/sign-in
      }
    })
  }

  // Ajouter la session au contexte
  event.context.session = session
  event.context.user = session.user
})
```

### Système de Rôles et Permissions

#### Philosophie: Rôles par Domaine

Plutôt qu'un rôle unique par type d'acteur (customer, merchant, admin), le système utilise des **rôles granulaires par module**. Chaque module définit ses propres rôles et permissions.

**Avantages:**
- Un merchant peut être `product-manager` mais pas `finance-admin`
- Délégation fine des responsabilités dans une équipe
- Chaque module reste autonome dans la gestion de ses permissions

#### Architecture du Système de Permissions

```
┌─────────────────────────────────────────────────────────────────┐
│                     @czo/auth - Access Control                   │
├─────────────────────────────────────────────────────────────────┤
│  Core Statements (auth module)                                   │
│  ├── user: [read, update, ban, delete]                          │
│  ├── session: [read, revoke, revoke-all]                        │
│  └── api-key: [create, read, revoke]                            │
├─────────────────────────────────────────────────────────────────┤
│  Module Statements (registered via provider pattern)             │
│  ├── @czo/product → product, category, inventory                │
│  ├── @czo/order → order, refund, fulfillment                    │
│  ├── @czo/shop → shop, staff, settings                          │
│  └── @czo/finance → payment, payout, invoice                    │
└─────────────────────────────────────────────────────────────────┘
```

#### Plugin `access` de better-auth

Le plugin `access` utilise une approche **déclarative** basée sur des statements:

```typescript
import { createAccessControl } from "better-auth/plugins/access";

// 1. Définir les statements (ressources + actions possibles)
const statement = {
  product: ["create", "read", "update", "delete", "publish", "archive"],
  category: ["create", "read", "update", "delete", "reorder"],
  inventory: ["read", "update", "transfer", "audit"],
} as const;

const ac = createAccessControl(statement);

// 2. Définir les rôles avec leurs permissions
export const productViewer = ac.newRole({
  product: ["read"],
  category: ["read"],
  inventory: ["read"],
});

export const productManager = ac.newRole({
  product: ["create", "read", "update", "delete", "publish", "archive"],
  category: ["create", "read", "update", "delete", "reorder"],
  inventory: ["read", "update", "transfer", "audit"],
});
```

#### Héritage de Rôles par Composition

better-auth n'a pas d'héritage natif. L'héritage est simulé via composition:

```typescript
// packages/modules/auth/src/access/role-builder.ts
import { createAccessControl } from "better-auth/plugins/access";

type Statements = Record<string, readonly string[]>;
type RolePermissions<S extends Statements> = {
  [K in keyof S]?: S[K][number][];
};

/**
 * Crée un builder de rôles avec support de l'héritage
 */
export function createRoleBuilder<S extends Statements>(statements: S) {
  const ac = createAccessControl(statements);

  type Permissions = RolePermissions<S>;

  return {
    statements,
    ac,

    /**
     * Crée une hiérarchie de rôles avec héritage automatique
     * L'ordre définit l'héritage : viewer → editor → manager
     */
    createHierarchy<N extends string>(
      hierarchy: { name: N; permissions: Permissions }[]
    ): Record<N, ReturnType<typeof ac.newRole>> {
      const roles = {} as Record<N, ReturnType<typeof ac.newRole>>;
      let accumulated: Permissions = {};

      for (const { name, permissions } of hierarchy) {
        // Merge avec les permissions accumulées (héritage)
        accumulated = mergePermissions(accumulated, permissions);
        roles[name] = ac.newRole(accumulated as any);
      }

      return roles;
    },
  };
}

function mergePermissions<P extends RolePermissions<any>>(base: P, additions: P): P {
  const result = { ...base } as P;

  for (const [resource, actions] of Object.entries(additions)) {
    const existing = result[resource as keyof P] as string[] | undefined;
    const newActions = actions as string[];

    result[resource as keyof P] = existing
      ? [...new Set([...existing, ...newActions])]
      : newActions;
  }

  return result;
}
```

**Exemple de hiérarchie avec héritage:**

```typescript
// packages/modules/product/src/access/index.ts
import { createRoleBuilder } from "@czo/auth/access";

export const productStatements = {
  product: ["create", "read", "update", "delete", "publish", "archive"],
  category: ["create", "read", "update", "delete", "reorder"],
  inventory: ["read", "update", "transfer", "audit"],
} as const;

const builder = createRoleBuilder(productStatements);

// Hiérarchie : viewer → editor → manager
// Chaque niveau hérite du précédent
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

// Résultat après héritage:
// product:viewer  → product: [read], category: [read], inventory: [read]
// product:editor  → product: [read, create, update], category: [read], inventory: [read, update]
// product:manager → product: [read, create, update, delete, publish, archive], category: [...], inventory: [...]
```

#### Scoping des Permissions par Shop

Les permissions sont **scopées par shop**. Un utilisateur peut avoir différents rôles dans différents shops.

**Schéma `shop_members`:**

```typescript
// packages/modules/shop/src/database/schema.ts
import { pgTable, text, timestamp, primaryKey } from "drizzle-orm/pg-core";

export const shopMembers = pgTable(
  "shop_members",
  {
    shopId: text("shop_id").notNull().references(() => shops.id),
    userId: text("user_id").notNull().references(() => users.id),
    roles: text("roles").array().notNull().default([]),  // ["product:editor", "order:viewer"]
    invitedBy: text("invited_by").references(() => users.id),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.shopId, table.userId] }),
  })
);

// Type pour les rôles d'un utilisateur
export interface UserShopRoles {
  global: string[];                    // Rôles plateforme (platform-admin)
  shops: Record<string, string[]>;     // { shopId: [roles] }
}
```

**Exemple multi-shop:**

```typescript
// Un utilisateur peut avoir différents rôles dans différents shops
const userRolesExample = {
  userId: "user-123",
  globalRoles: [],  // Pas admin plateforme
  shopMemberships: [
    {
      shopId: "shop-abc",
      roles: ["product:manager", "order:editor"],  // Manager produits
    },
    {
      shopId: "shop-xyz",
      roles: ["product:viewer"],  // Simple viewer dans un autre shop
    },
  ],
};

// Requête sur shop-abc → peut delete product ✓
// Requête sur shop-xyz → ne peut PAS delete product ✗
```

#### Service de Vérification des Permissions

```typescript
// packages/modules/auth/src/services/permission.service.ts

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

export function createPermissionService(
  db: Database,
  ac: AccessControl
): PermissionService {
  return {
    async hasPermission(ctx, resource, action) {
      const roles = await this.resolveRoles(ctx);

      // Vérifier si au moins un rôle a la permission
      for (const role of roles) {
        const rolePermissions = ac.getRolePermissions(role);
        if (rolePermissions?.[resource]?.includes(action)) {
          return true;
        }
      }

      return false;
    },

    async hasPermissions(ctx, permissions) {
      for (const [resource, actions] of Object.entries(permissions)) {
        for (const action of actions) {
          if (!(await this.hasPermission(ctx, resource, action))) {
            return false;
          }
        }
      }
      return true;
    },

    async resolveRoles(ctx: PermissionCheckContext): Promise<string[]> {
      const roles: string[] = [];

      // 1. Rôles globaux (admin plateforme)
      const user = await db.query.users.findFirst({
        where: eq(users.id, ctx.userId),
      });
      if (user?.globalRoles) {
        roles.push(...user.globalRoles);
      }

      // 2. Rôles scopés au shop
      if (ctx.shopId) {
        const membership = await db.query.shopMembers.findFirst({
          where: and(
            eq(shopMembers.userId, ctx.userId),
            eq(shopMembers.shopId, ctx.shopId)
          ),
        });
        if (membership?.roles) {
          roles.push(...membership.roles);
        }
      }

      return roles;
    },

    // ... autres méthodes
  };
}
```

#### Intégration dans le Contexte GraphQL

```typescript
// packages/modules/auth/src/graphql/context.ts
export interface AuthContext {
  session: Session | null;
  actor: Actor | null;

  /**
   * Helper pour vérifier les permissions dans les resolvers
   * Throw ForbiddenError si pas autorisé
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
      // Vérifie et throw ForbiddenError si pas autorisé
      await ctx.requirePermission("product", "update", shopId);

      // ... logique métier
    },

    deleteProduct: async (_, { shopId, id }, ctx: AuthContext) => {
      await ctx.requirePermission("product", "delete", shopId);
      // ...
    },
  },

  Query: {
    products: async (_, { shopId }, ctx: AuthContext) => {
      // Lecture possible pour viewer et au-dessus
      await ctx.requirePermission("product", "read", shopId);
      // ...
    },
  },
};
```

#### Diagramme de Résolution des Permissions

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

#### Vérification côté Client

Le plugin `access` permet aussi des vérifications côté client sans round-trip serveur:

```typescript
// Vérification synchrone côté client
const canCreateProject = authClient.admin.checkRolePermission({
  role: "product:editor",
  permissions: {
    product: ["create"]
  }
});

// Vérification asynchrone (interroge le serveur)
const hasPermission = await authClient.admin.hasPermission({
  permissions: {
    product: ["delete"]
  }
});
```

#### Enregistrement des Statements par Module

```typescript
// packages/modules/auth/src/access/registry.ts

export interface AccessStatementProvider {
  name: string;
  statements: Record<string, readonly string[]>;
  roles: Record<string, unknown>;
}

const statementProviders: AccessStatementProvider[] = [];

export function registerAccessStatements(provider: AccessStatementProvider) {
  statementProviders.push(provider);
}

// Agrégation de tous les statements au boot
export function buildAccessControl() {
  const allStatements = statementProviders.reduce(
    (acc, provider) => ({ ...acc, ...provider.statements }),
    { ...defaultStatements }
  );

  return createAccessControl(allStatements as const);
}

// packages/modules/product/src/plugins/index.ts
import { registerAccessStatements } from "@czo/auth/access";
import { productStatements, productRoles } from "../access";

export default defineNitroPlugin(async () => {
  registerAccessStatements({
    name: "product",
    statements: productStatements,
    roles: productRoles,
  });
});
```

### Structure du Module
```
packages/modules/auth/
├── src/
│   ├── module.ts              # defineNitroModule
│   ├── plugins/
│   │   └── index.ts           # Configuration IoC container, init better-auth
│   ├── config/
│   │   └── auth.config.ts     # Configuration better-auth
│   ├── routes/
│   │   └── auth/
│   │       ├── [actor]/
│   │       │   ├── sign-up.post.ts       # Inscription par acteur
│   │       │   ├── sign-in/
│   │       │   │   ├── email.post.ts     # Login email/password
│   │       │   │   └── social.post.ts    # Initier OAuth
│   │       │   ├── callback/
│   │       │   │   └── [provider].get.ts # Callback OAuth
│   │       │   ├── forgot-password.post.ts
│   │       │   ├── reset-password.post.ts
│   │       │   └── verify-email.post.ts
│   │       ├── session.get.ts            # Session courante
│   │       ├── sign-out.post.ts          # Déconnexion
│   │       ├── switch-actor.post.ts      # Changer de contexte
│   │       ├── two-factor/               # 2FA
│   │       └── api-keys/                 # Gestion clés API
│   ├── schema/
│   │   ├── user/              # Types/resolvers GraphQL (authentifié)
│   │   ├── session/           # Gestion sessions (authentifié)
│   │   ├── organization/      # Organisations (authentifié)
│   │   └── api-key/           # Clés API (authentifié)
│   ├── services/
│   │   ├── auth.service.ts    # Opérations auth core
│   │   ├── session.service.ts # Gestion des sessions
│   │   ├── api-key.service.ts # Opérations clés API
│   │   └── restriction-registry.ts  # AuthRestrictionRegistry
│   └── middleware/
│       ├── graphql-auth.ts    # Protection endpoint GraphQL
│       ├── session.ts         # Validation session
│       └── api-key.ts         # Validation clé API
├── migrations/                 # Migrations Drizzle (schéma better-auth)
└── tests/
```

### Schéma Base de Données (via adaptateur Drizzle better-auth)

better-auth avec les plugins sélectionnés crée ces tables:

**Tables Core (better-auth):**
- `user` - Comptes utilisateurs (email, name, emailVerified, image)
- `session` - Sessions actives (token, userId, expiresAt, ipAddress, userAgent)
- `account` - Comptes OAuth liés aux utilisateurs (providerId, providerAccountId)
- `verification` - Tokens de vérification email/téléphone

**Plugin Organization:**
- `organization` - Organisations (name, slug, metadata)
- `member` - Appartenances aux organisations (userId, organizationId, role)
- `invitation` - Invitations en attente (email, organizationId, role, status)

**Plugin Two-Factor:**
- `twoFactor` - Configuration 2FA (userId, secret, backupCodes)

**Plugin API Key:**
- `apiKey` - Clés API (key, userId, name, expiresAt, scopes)

**Extension du schéma session (custom c-zo):**

better-auth ne gère pas nativement `actorType` et `authMethod`. On étend la table session:

```typescript
// packages/modules/auth/src/database/schema.ts
import { pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'

// Extension de la table session better-auth
export const sessionExtension = pgTable('session', {
  // Colonnes better-auth (déjà existantes)
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),

  // Extensions c-zo
  actorType: varchar('actor_type', { length: 50 }).notNull(),  // 'customer' | 'admin' | 'merchant'
  authMethod: varchar('auth_method', { length: 50 }).notNull(), // 'email-password' | 'oauth:google' | ...
  organizationId: text('organization_id'),  // Contexte org si applicable
})
```

### Points d'Intégration

**Intégration Nitro:**
```typescript
// apps/mazo/nitro.config.ts
export default defineNitroConfig({
  modules: [
    '@czo/auth',
    '@czo/product',
    // ...
  ]
})
```

**Contexte GraphQL:**
```typescript
// Session disponible dans tous les resolvers
interface GraphQLContext {
  session: Session | null
  user: User | null
  actorType: string | null      // "customer" | "admin" | "merchant" | ...
  organization: Organization | null
}

// Utilisation dans un resolver
const resolvers = {
  Query: {
    adminDashboard: (_, __, ctx) => {
      // Vérifier le contexte acteur, pas juste les rôles
      if (ctx.actorType !== 'admin') {
        throw new ForbiddenError('Admin context required')
      }
      return getAdminDashboard()
    }
  }
}
```

**Contrat Module de Domaine:**
```typescript
// Les modules de domaine peuvent interroger les primitives auth
interface AuthContract {
  getUser(id: string): Promise<User | null>
  getUserRoles(userId: string, organizationId?: string): Promise<Role[]>
  getOrganizationMembers(orgId: string): Promise<Member[]>
  validateApiKey(key: string): Promise<ApiKeyPayload | null>
}
```

### Restrictions d'Authentification par Acteur

#### Le Problème Résolu

Par défaut, toutes les méthodes d'authentification sont disponibles pour tous les utilisateurs. Mais certains acteurs nécessitent des restrictions de sécurité :

| Acteur | Besoin | Risque si non restreint |
|--------|--------|------------------------|
| Admin | Méthodes sécurisées uniquement (email/pwd + 2FA, GitHub corporate) | Admin connecté via Google perso = risque sécurité |
| Customer | Flexibilité maximale (social, magic link) | Pas de risque majeur |
| API Consumer | API keys uniquement, pas de sessions | Service avec session = comportement inattendu |
| Merchant | Restrictions selon politique de l'organisation | Cohérence des accès store |

#### API Proposée (TypeScript)

```typescript
// @czo/auth - Types exposés

/**
 * Méthodes d'authentification supportées par le module auth
 */
type AuthMethod =
  | 'email-password'
  | 'oauth:google'
  | 'oauth:github'
  | 'oauth:apple'
  | 'magic-link'      // future
  | 'passkey'         // future
  | 'api-key'
  | 'impersonation'   // admin impersonating user

/**
 * Configuration des restrictions pour un type d'acteur
 */
interface ActorAuthConfig {
  /** Méthodes autorisées pour ce type d'acteur */
  allowedMethods: AuthMethod[]

  /** Priorité pour résolution de conflits (plus élevé = plus restrictif) */
  priority: number

  /** 2FA obligatoire? */
  require2FA?: boolean

  /** Durée de session (override du défaut) */
  sessionDuration?: number

  /** Peut être impersonifié par un admin? */
  allowImpersonation?: boolean
}

/**
 * Service de registre des restrictions d'authentification
 * Exposé par @czo/auth pour les modules de domaine
 */
interface AuthRestrictionRegistry {
  /**
   * Enregistre les restrictions pour un type d'acteur
   * Appelé par les modules de domaine au boot
   */
  registerActorType(
    actorType: string,
    config: ActorAuthConfig
  ): void

  /**
   * Récupère la config pour un type d'acteur spécifique
   * Utilisé pour valider les endpoints /api/auth/[actor]/*
   */
  getActorConfig(actorType: string): ActorAuthConfig | null

  /**
   * Liste tous les types d'acteurs enregistrés
   */
  getRegisteredActorTypes(): string[]

  /**
   * Récupère la config effective pour un utilisateur (multi-rôles)
   * Utilisé pour: require2FA, sessionDuration, allowImpersonation
   * Résout par priorité (plus élevée = plus restrictif)
   */
  getEffectiveConfig(userId: string): Promise<EffectiveAuthConfig>

  /**
   * Freeze le registry après le boot de tous les modules
   */
  freeze(): void
}

/**
 * Config effective après résolution des priorités (multi-rôles)
 */
interface EffectiveAuthConfig {
  require2FA: boolean           // true si au moins un rôle l'exige
  sessionDuration: number       // Durée la plus courte parmi les rôles
  allowImpersonation: boolean   // false si au moins un rôle l'interdit
  actorTypes: string[]          // Types d'acteurs de l'utilisateur
  dominantActorType: string     // Type avec la priorité la plus élevée
}
```

#### Détermination du Type d'Acteur d'un Utilisateur

Les modules de domaine doivent indiquer quels utilisateurs ont quel type d'acteur:

```typescript
/**
 * Interface que les modules de domaine implémentent
 * pour indiquer les types d'acteurs de leurs utilisateurs
 */
interface ActorTypeProvider {
  actorType: string
  hasActorType(userId: string): Promise<boolean>
}

// @czo/admin/providers/admin-actor.ts
export const adminActorProvider: ActorTypeProvider = {
  actorType: 'admin',
  async hasActorType(userId: string): Promise<boolean> {
    // Un user est admin s'il a le rôle 'admin' dans la table admin_users
    const adminUser = await db.query.adminUsers.findFirst({
      where: eq(adminUsers.userId, userId)
    })
    return !!adminUser
  }
}

// @czo/customer/providers/customer-actor.ts
export const customerActorProvider: ActorTypeProvider = {
  actorType: 'customer',
  async hasActorType(userId: string): Promise<boolean> {
    // Tous les users sont potentiellement des customers
    // Sauf s'ils n'ont jamais eu d'activité customer
    return true  // ou vérifier s'ils ont un profil customer
  }
}

// @czo/merchant/providers/merchant-actor.ts
export const merchantActorProvider: ActorTypeProvider = {
  actorType: 'merchant',
  async hasActorType(userId: string): Promise<boolean> {
    // Un user est merchant s'il est membre d'une organisation merchant
    const membership = await db.query.members.findFirst({
      where: and(
        eq(members.userId, userId),
        eq(members.organizationType, 'merchant')
      )
    })
    return !!membership
  }
}
```

#### Exemple d'Utilisation par les Modules de Domaine

```typescript
// @czo/admin/plugins/index.ts
import { useAuthRestrictionRegistry } from '@czo/auth'

export default defineNitroPlugin(async () => {
  const registry = useAuthRestrictionRegistry()

  registry.registerActorType('admin', {
    allowedMethods: ['email-password', 'oauth:github'],
    priority: 100,                // Haute priorité = restrictif
    require2FA: true,
    sessionDuration: 4 * 60 * 60, // 4 heures
    allowImpersonation: false,    // Admin ne peut pas être impersonifié
  })
})

// @czo/customer/plugins/index.ts
export default defineNitroPlugin(async () => {
  const registry = useAuthRestrictionRegistry()

  registry.registerActorType('customer', {
    allowedMethods: ['email-password', 'oauth:google'],  // MVP: Google uniquement
    // Future: ajouter 'oauth:apple', 'magic-link'
    priority: 10,                 // Basse priorité
    require2FA: false,
    allowImpersonation: true,     // Support peut impersonifier
  })
})

// @czo/merchant/plugins/index.ts
export default defineNitroPlugin(async () => {
  const registry = useAuthRestrictionRegistry()

  registry.registerActorType('merchant', {
    allowedMethods: ['email-password', 'oauth:google'],
    priority: 30,                 // Priorité moyenne
    require2FA: false,            // Optionnel, peut être activé par org
    allowImpersonation: true,     // Support peut impersonifier
  })
})

// @czo/integration/plugins/index.ts
export default defineNitroPlugin(async () => {
  const registry = useAuthRestrictionRegistry()

  registry.registerActorType('api-consumer', {
    allowedMethods: ['api-key'],
    priority: 50,
    require2FA: false,
    allowImpersonation: false,
  })
})
```

#### Edge Cases et Résolutions

**1. Utilisateur avec plusieurs rôles**

Scénario : Un utilisateur est à la fois `customer` et `admin` (ex: fondateur qui teste son propre store).

**Avec les endpoints par acteur:**
- L'utilisateur choisit explicitement son contexte via l'URL d'endpoint
- `/api/auth/admin/sign-in` → session avec `actorType: 'admin'`
- `/api/auth/customer/sign-in` → session avec `actorType: 'customer'`

**La priorité sert pour les paramètres globaux (pas les méthodes):**
```typescript
// admin.priority = 100, customer.priority = 10
// Si user a les deux rôles:
// - require2FA: true (admin l'exige, priorité haute)
// - sessionDuration: 4h (durée admin, plus restrictive)
// - allowImpersonation: false (admin ne peut pas être impersonifié)

// Les méthodes autorisées dépendent de l'endpoint choisi, pas de la priorité
```

**2. Transition de rôle (user devient admin)**

Scénario : Un customer obtient le rôle admin.

**Avec les endpoints par acteur, les sessions sont séparées par contexte:**
- Les sessions `actorType: 'customer'` restent valides pour le contexte customer
- Pour accéder au contexte admin, l'utilisateur doit se connecter via `/api/auth/admin/sign-in`
- Pas d'invalidation automatique des sessions existantes

**Notification à l'utilisateur:**
```typescript
async function onRoleGranted(userId: string, newRole: string): Promise<void> {
  // Notifier l'utilisateur de son nouveau rôle
  await notifyUser(userId, {
    type: 'role-granted',
    role: newRole,
    message: `You now have ${newRole} access. Login via the ${newRole} portal to use it.`,
    loginUrl: `/api/auth/${newRole}/sign-in`
  })
}
```

**Cas particulier - switch-actor:**
Si l'utilisateur tente `/api/auth/switch-actor` vers admin depuis une session Google:
```typescript
// POST /api/auth/switch-actor { "actorType": "admin" }

// 1. Vérifier que l'utilisateur a le rôle admin
if (!userActorTypes.includes('admin')) {
  throw new AuthError({ code: 'ACTOR_TYPE_MISMATCH' })
}

// 2. Vérifier que la méthode d'auth actuelle est compatible avec admin
const adminConfig = registry.getActorConfig('admin')
if (!adminConfig.allowedMethods.includes(session.authMethod)) {
  // Google n'est pas autorisé pour admin → forcer re-auth
  throw new AuthError({
    code: 'REAUTH_REQUIRED',
    message: 'Please re-authenticate via admin portal',
    loginUrl: '/api/auth/admin/sign-in'
  })
}

// 3. Si compatible, créer nouvelle session avec actorType: 'admin'
```

**3. Aucun type d'acteur enregistré pour un user**

**Solution : Config par défaut sécurisée**
```typescript
const DEFAULT_AUTH_CONFIG: ActorAuthConfig = {
  allowedMethods: ['email-password'], // Minimum sécurisé
  priority: 0,
  require2FA: false,
  allowImpersonation: false,
}
```

**4. Enregistrement au boot uniquement**

Le registry est frozen après le boot de tous les modules :
```typescript
// Ordre d'exécution Nitro:
// 1. @czo/auth boot -> crée le registry vide
// 2. @czo/admin boot -> enregistre 'admin'
// 3. @czo/customer boot -> enregistre 'customer'
// 4. czo:boot hook -> registry.freeze()

// Après freeze(), registerActorType() throw une erreur
```

#### Intégration avec better-auth

```typescript
// @czo/auth/config/auth.config.ts
import { betterAuth } from 'better-auth'
import { useAuthRestrictionRegistry } from '../services/restriction-registry'

export const auth = betterAuth({
  hooks: {
    after: [
      {
        // Intercepte les authentifications réussies
        matcher: (ctx) => ctx.path.startsWith('/api/auth') && ctx.response?.user,
        handler: async (ctx) => {
          const registry = useAuthRestrictionRegistry()
          const actor = extractActorFromPath(ctx.path)  // Ex: /api/auth/customer/sign-in → 'customer'
          const method = extractAuthMethod(ctx.path)
          const userId = ctx.response.user.id

          // Vérifier que l'utilisateur a bien ce type d'acteur
          const userActorTypes = await getActorTypes(userId)
          if (!userActorTypes.includes(actor)) {
            await auth.api.revokeSession({ sessionId: ctx.response.session.id })
            throw new AuthError({
              code: 'ACTOR_TYPE_MISMATCH',
              message: `User is not registered as ${actor}`
            })
          }

          // Vérifier que la méthode est autorisée pour cet acteur
          const config = registry.getActorConfig(actor)
          if (!config.allowedMethods.includes(method)) {
            await auth.api.revokeSession({ sessionId: ctx.response.session.id })
            throw new AuthError({
              code: 'METHOD_NOT_ALLOWED',
              message: `${method} not allowed for ${actor}. Use: ${config.allowedMethods.join(', ')}`
            })
          }

          return { context: ctx }
        }
      }
    ]
  }
})
```

#### Schéma GraphQL

```graphql
enum AuthMethod {
  EMAIL_PASSWORD
  OAUTH_GOOGLE
  OAUTH_GITHUB
  OAUTH_APPLE
  MAGIC_LINK
  PASSKEY
  API_KEY
}

type EffectiveAuthConfig {
  allowedMethods: [AuthMethod!]!
  require2FA: Boolean!
  allowImpersonation: Boolean!
  determinedByRole: String
}

extend type Query {
  """Config d'auth effective pour l'utilisateur courant (authentifié)"""
  myAuthConfig: EffectiveAuthConfig!
}

# Note: Pas de query availableAuthMethods(email) pour éviter l'énumération utilisateur.
# Le frontend utilise directement l'endpoint /api/auth/[actor]/sign-in selon le contexte.
```

#### UX: Pages de Login par Acteur

Avec les endpoints par acteur, le frontend gère des pages de login séparées:

```typescript
// Le frontend connaît les méthodes par acteur (config statique côté client)
const ACTOR_AUTH_CONFIG = {
  customer: {
    methods: ['email-password', 'oauth:google'],
    signUpAllowed: true,
    loginUrl: '/api/auth/customer/sign-in',
    signUpUrl: '/api/auth/customer/sign-up',
  },
  admin: {
    methods: ['email-password', 'oauth:github'],  // GitHub corporate SSO
    signUpAllowed: false,         // Admins créés par invitation
    loginUrl: '/api/auth/admin/sign-in',
  },
  merchant: {
    methods: ['email-password', 'oauth:google'],
    signUpAllowed: true,
    loginUrl: '/api/auth/merchant/sign-in',
    signUpUrl: '/api/auth/merchant/sign-up',
  },
}

// Pages de login distinctes
// /login/customer → affiche email/password + Google
// /login/admin    → affiche email/password uniquement
// /login/merchant → affiche email/password + Google
```

**Avantages:**
- Pas de lookup email côté serveur (pas d'énumération)
- UX claire: l'utilisateur sait "où" il se connecte
- Configuration statique côté frontend (pas d'API call)

**Stockage Session (Redis):**
```typescript
// Configuration Redis pour les sessions
interface SessionConfig {
  redis: {
    host: string
    port: number
    password?: string
    db?: number
    keyPrefix: 'czo:session:'
  }
  session: {
    maxAge: 7 * 24 * 60 * 60  // 7 jours
    refreshThreshold: 24 * 60 * 60  // Refresh si < 1 jour restant
  }
}
```

**Intégration Novu (Notifications):**
```typescript
// Novu gère l'orchestration des emails/notifications
interface AuthNotifications {
  // Emails transactionnels
  sendVerificationEmail(userId: string, token: string): Promise<void>
  sendPasswordResetEmail(userId: string, token: string): Promise<void>
  sendInvitationEmail(invitation: Invitation): Promise<void>

  // Alertes sécurité
  sendNewDeviceAlert(userId: string, device: DeviceInfo): Promise<void>
  send2FAEnabledNotification(userId: string): Promise<void>
}
```

**Rate Limiting (Niveau App):**
```typescript
// Rate limiting intégré au module auth
interface RateLimitConfig {
  login: {
    windowMs: 15 * 60 * 1000  // 15 minutes
    maxAttempts: 5            // 5 tentatives par IP/email
    blockDuration: 30 * 60 * 1000  // Blocage 30 min après dépassement
  }
  registration: {
    windowMs: 60 * 60 * 1000  // 1 heure
    maxAttempts: 3            // 3 inscriptions par IP
  }
  passwordReset: {
    windowMs: 60 * 60 * 1000  // 1 heure
    maxAttempts: 3            // 3 demandes par email
  }
  apiKey: {
    windowMs: 60 * 1000       // 1 minute
    maxRequests: 100          // 100 requêtes par clé
  }
}
```

---

## Définition du Scope

### Dans le Scope (MVP)

**Authentification Core:**
- [ ] Inscription email/mot de passe avec vérification email
- [ ] Connexion email/mot de passe avec gestion de session
- [ ] Flux de réinitialisation de mot de passe
- [ ] Connexion sociale par acteur:
  - Customer: Google OAuth
  - Admin: GitHub OAuth (corporate SSO)
  - Merchant: Google OAuth
- [ ] Gestion des sessions (créer, révoquer, lister les appareils)
- [ ] Déconnexion (session unique, toutes les sessions)

**Organisation & Membership:**
- [ ] CRUD Organisation (créer, lire, mettre à jour, supprimer)
- [ ] Système d'invitation par email
- [ ] Gestion des membres (ajouter, supprimer, mettre à jour le rôle)
- [ ] Attribution de rôles (rôles génériques, domain-agnostic)
- [ ] Changement d'organisation active

**Authentification Two-Factor:**
- [ ] Configuration et vérification TOTP
- [ ] Génération de codes de secours
- [ ] Application 2FA par organisation (optionnel)

**Authentification API:**
- [ ] Génération et gestion de clés API
- [ ] Scoping des clés API (par organisation)
- [ ] Révocation de clés API
- [ ] Vérification des tokens Bearer pour les requêtes API

**Capacités Admin:**
- [ ] Impersonation utilisateur (pour le support)
- [ ] Gestion des utilisateurs (lister, rechercher, désactiver)
- [ ] Gestion des organisations (lister, rechercher)

**Restrictions d'Authentification par Acteur:**
- [ ] Service `AuthRestrictionRegistry` pour enregistrer les types d'acteurs
- [ ] API pour les modules de domaine: `registerActorType(actorType, config)`
- [ ] Interface `ActorTypeProvider` pour déterminer les types d'acteurs d'un user
- [ ] Résolution par priorité pour paramètres globaux (2FA, session duration)
- [ ] Validation des méthodes d'auth dans les hooks better-auth
- [ ] Invalidation automatique des sessions lors des transitions de rôle
- [ ] Config par défaut sécurisée pour les users sans type d'acteur
- [ ] Query GraphQL `myAuthConfig` (authentifié uniquement)
- [ ] Freeze du registry après boot des modules

**Système de Rôles et Permissions (plugin `access`):**
- [ ] Rôles par domaine (chaque module définit ses propres rôles)
- [ ] Permissions scopées par shop (table `shop_members`)
- [ ] Héritage de rôles par composition (`createRoleBuilder`)
- [ ] Service `PermissionService` avec `hasPermission()` et `hasPermissions()`
- [ ] Helpers GraphQL `requirePermission()` et `canDo()` dans le contexte
- [ ] Enregistrement des statements par module via `registerAccessStatements()`
- [ ] Vérification côté client via `checkRolePermission()` (synchrone)
- [ ] Rôles globaux (platform-admin) + rôles scopés (shop-specific)

**Intégration:**
- [ ] Module Nitro (`@czo/auth`)
- [ ] Routes REST par acteur (`/api/auth/[actor]/<action>`)
- [ ] Session avec contexte acteur (`actorType`, `authMethod`)
- [ ] Endpoint switch-actor pour multi-rôles
- [ ] OAuth state avec acteur pour callbacks sécurisés
- [ ] Middleware protection GraphQL (requiert session valide)
- [ ] Contexte GraphQL avec `actorType`
- [ ] Schéma Drizzle (utilisant l'adaptateur better-auth)
- [ ] Introspection GraphQL désactivée en production

### Hors Scope (Futur)

| Fonctionnalité | Version Cible | Notes |
|----------------|---------------|-------|
| Connexion magic link | v1.1 | Amélioration UX pour les clients |
| Passkey/WebAuthn | v1.2 | Standard émergent |
| OAuth Provider (c-zo comme IdP) | v1.1 | Nécessite un écosystème d'apps tierces |
| SSO/SAML | v2.0 | Fonctionnalité entreprise |
| Connexion par username | v1.1 | Email suffisant pour MVP |
| Audit logging | v1.1 | Important mais module séparé |
| Providers auth custom | v1.2 | Extensibilité |

### Non-Objectifs

- **Profils utilisateurs étendus** - Au-delà des champs auth (email, name); les modules de domaine étendent les données utilisateur via leurs propres tables
- **Gating paiement/abonnement** - Préoccupation facturation séparée
- **Multi-région/résidence des données** - Préoccupation infrastructure
- **Permissions dynamiques à runtime** - Les statements et rôles sont définis au boot, pas modifiables dynamiquement
- **UI de gestion des permissions** - MVP se concentre sur l'API; admin UI viendra plus tard

### Critères de Succès

1. **Fonctionnel:** Les quatre types d'acteurs peuvent s'authentifier via les méthodes appropriées
2. **Sécurité:** Passe la checklist d'authentification OWASP
3. **Intégration:** Contexte session disponible dans tous les resolvers GraphQL
4. **Performance:** Connexion < 200ms, validation session < 50ms
5. **Expérience Développeur:** API claire pour que les modules de domaine interrogent les primitives auth
6. **Couverture de Tests:** 80%+ sur les flux auth

---

## Risques & Hypothèses

### Hypothèses à Valider
- [ ] Le plugin organization de better-auth répond aux exigences multi-tenant
- [ ] L'adaptateur Drizzle fonctionne bien avec les patterns de schéma c-zo existants
- [ ] Le système de rôles générique est assez flexible pour les modules de domaine
- [ ] Le modèle de scoping des clés API convient aux cas d'usage d'intégration
- [ ] Les hooks better-auth permettent d'intercepter et rejeter les méthodes d'auth non autorisées
- [ ] La résolution par priorité couvre tous les cas de conflits multi-rôles
- [ ] L'ordre de boot des modules Nitro est déterministe pour le registry
- [ ] Le plugin `access` de better-auth supporte l'extension des statements par module
- [ ] La composition de rôles pour l'héritage est performante (pas de recalcul à chaque requête)
- [ ] La table `shop_members` scale bien avec beaucoup de shops et d'utilisateurs

### Risques de Sécurité
| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Détournement de session | Moyen | Critique | Cookies sécurisés, HTTPS uniquement, binding de session |
| Credential stuffing | Élevé | Élevé | Rate limiting, promotion 2FA, détection de brèches |
| Escalade de privilèges | Moyen | Critique | Validation des rôles au niveau domaine, audit logging |
| Fuite de clé API | Moyen | Élevé | Rotation de clés, scoping, monitoring, préfixe pour détection |
| Isolation des données d'organisation | Moyen | Critique | Isolation stricte des tenants dans les requêtes, tests |
| Contournement 2FA | Faible | Critique | Limites de codes de secours, revue du flux de récupération |

### Risques Techniques
| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Instabilité version better-auth | Moyen | Moyen | Épingler les versions, tests d'intégration |
| Conflits schéma Drizzle | Faible | Moyen | Préfixer les tables auth (ex: `auth_`) |
| Complexité contexte GraphQL | Moyen | Faible | Pattern d'injection de session clair |
| Problèmes d'hydratation SSR Nitro | Moyen | Moyen | Gestion de session cohérente |
| Ordre de boot modules non déterministe | Faible | Élevé | Documenter les dépendances, hook `czo:boot` après tous les plugins |
| Fuite de méthode d'auth avant validation | Moyen | Élevé | Hook `after` qui révoque immédiatement la session invalide |
| UX dégradée lors transition de rôle | Moyen | Faible | Notification claire, redirection vers login approprié |

### Dépendances
- Librairie better-auth et plugins
- @czo/kit pour le système de modules et utilitaires base de données
- Drizzle ORM pour l'accès base de données
- GraphQL Yoga pour la couche API
- **Novu** pour l'orchestration email/notifications (vérification, invitations, alertes 2FA)
- **Redis** pour le stockage des sessions (performance)

---

## Questions Ouvertes

- [x] Table users unique ou séparée par acteur? --> **Table unique avec rôles**
- [x] Rôles spécifiques au domaine ou génériques? --> **Génériques, les modules de domaine interprètent**
- [x] Quels plugins better-auth pour MVP? --> **organization, two-factor, api-key, admin, access**
- [x] OAuth Provider dans MVP? --> **Reporté à v1.1**
- [x] Choix du service email? --> **Novu** (orchestration email/notifications)
- [x] Providers sociaux pour MVP? --> **Google** (customer/merchant) + **GitHub** (admin), autres en v1.1
- [x] Implémentation rate limiting? --> **Niveau app** (dans le module auth)
- [x] Stockage session? --> **Redis** (performance pour validations fréquentes)
- [x] Architecture des permissions? --> **Rôles par domaine** (chaque module définit ses propres rôles)
- [x] Scoping des permissions? --> **Par shop** (table `shop_members`)
- [x] Héritage des rôles? --> **Par composition** avec `createRoleBuilder`

---

## Recherche & Références

- [Documentation better-auth](https://www.better-auth.com/)
- [Plugin Organization better-auth](https://www.better-auth.com/docs/plugins/organization)
- [Plugin API Key better-auth](https://www.better-auth.com/docs/plugins/api-key)
- [Plugin Access better-auth](https://www.better-auth.com/docs/plugins/admin) - Système de permissions basé sur statements
- [Adaptateur Drizzle better-auth](https://www.better-auth.com/docs/adapters/drizzle)
- [Documentation Novu](https://docs.novu.co/) - Orchestration notifications
- [OWASP Authentication Cheatsheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [Brainstorm Module Attribute c-zo](../attribute/brainstorm.md) - Référence de pattern

---

## Notes de Session

**Décisions clés prises:**

1. **Table users unique** avec différenciation par rôles
2. **Rôles domain-agnostic** - auth fournit les primitives, les modules de domaine interprètent
3. **Organisations génériques** - pas liées aux marchands spécifiquement
4. **better-auth** avec plugins: organization, two-factor, api-key, admin, **access**
5. **Redis** pour le stockage des sessions
6. **Novu** pour l'orchestration des emails/notifications
7. **Rate limiting au niveau app** (dans le module auth)
8. **OAuth par acteur pour MVP** - Customer/Merchant: Google, Admin: GitHub
9. **Restrictions d'auth par acteur** via `AuthRestrictionRegistry`
10. **Résolution de conflits par priorité** - rôle le plus restrictif gagne
11. **Invalidation automatique** des sessions lors des transitions de rôle
12. **Registry frozen après boot** - pas de modification dynamique
13. **REST pour auth, GraphQL protégé** - opérations auth en REST, endpoint GraphQL requiert session valide
14. **Endpoints par acteur** - structure `/api/auth/[actor]/<action>` pour validation précoce
15. **Session porte le contexte acteur** - `actorType` dans la session pour permissions contextuelles
16. **ActorTypeProvider** - interface que les modules de domaine implémentent pour déterminer les types d'acteurs
17. **Pas de query availableAuthMethods** - évite l'énumération utilisateur, config statique côté frontend
18. **Rôles par domaine** - chaque module définit ses propres rôles et permissions (pas un rôle unique par acteur)
19. **Permissions scopées par shop** - un user peut avoir différents rôles dans différents shops
20. **Héritage de rôles par composition** - viewer → editor → manager via `createRoleBuilder`
21. **Plugin `access` de better-auth** - système de permissions basé sur statements déclaratifs
22. **Table `shop_members`** - stocke les associations user-shop-roles
23. **Rôles globaux vs scopés** - `platform-admin` (global) vs `product:manager` (shop-specific)

---

## Prochaines Étapes

- [x] Créer PRD: `/manager:prd create auth`
- [x] Créer TRD: `/manager:trd create auth`
- [ ] Spike: prototype intégration better-auth + Nitro
- [ ] Spike: prototype `AuthRestrictionRegistry` avec hooks better-auth
- [ ] Spike: prototype plugin `access` avec `createRoleBuilder` pour héritage
- [ ] Spike: prototype table `shop_members` et `PermissionService`
- [ ] Définir schéma GraphQL pour les opérations auth
- [ ] Concevoir interface contrat module de domaine
