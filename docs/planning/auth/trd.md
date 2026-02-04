# TRD: Module Auth

**Status**: Draft
**Author**: Claude (Briana)
**Created**: 2026-02-03
**Last Updated**: 2026-02-03
**Related PRD**: [prd.md](./prd.md)

---

## 1. Overview

Le module Auth implémente un système d'authentification basé sur **better-auth** avec stockage sessions Redis, intégré à Nitro via `defineNitroModule`. L'architecture sépare les endpoints REST publics (authentification) de l'endpoint GraphQL protégé (données métier). Un `AuthRestrictionRegistry` permet aux modules de domaine de configurer les restrictions d'auth par type d'acteur.

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
│   │   ├── api-key.service.ts
│   │   └── restriction-registry.ts  # AuthRestrictionRegistry
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

#### Authentication Flow (REST)
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
  │                            │                            │ ──────────────────────▶
  │                            │◀───────────────────────────│                       │
  │                            │ 4. Set cookie + return token                       │
  │◀────────────────────────────                            │                       │
  │ Set-Cookie: czo_session=xxx│                            │                       │
  │ { user, session, token }   │  ← Client choisit sa méthode                       │
```

**Response format:**
- `Set-Cookie: czo_session=<token>` (header) - Pour browsers avec cookies
- `{ token, tokenType: "Bearer" }` (body) - Pour SPA/mobile qui préfèrent Bearer

#### GraphQL Request Flow
```
Client                    Middleware              GraphQL Yoga           Resolver
  │                            │                       │                    │
  │ POST /graphql              │                       │                    │
  │ Authorization: Bearer xxx  │  ← Prioritaire        │                    │
  │ (ou Cookie: session=xxx)   │  ← Fallback           │                    │
  │ ──────────────────────────▶│                       │                    │
  │                            │ 1. Extract credentials│                    │
  │                            │    Bearer > Cookie    │                    │
  │                            │                       │                    │
  │                            │ 2. Validate session   │                    │
  │                            │    from Redis         │                    │
  │                            │                       │                    │
  │                            │ 3. No session?        │                    │
  │                            │    → 401 Unauthorized │                    │
  │                            │                       │                    │
  │                            │ 4. Session valid      │                    │
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
| 1 | `Authorization: Bearer <token>` | Session token | Browser SPA, Mobile |
| 2 | `Authorization: Bearer czo_<key>` | Clé API | Intégrations |
| 3 | `Cookie: czo_session=<token>` | Cookie HTTP-only | Browser SSR |

### Components

| Component | Technology | Purpose | Dependencies |
|-----------|------------|---------|--------------|
| Auth Module | @czo/auth (Nitro module) | Authentication primitives | @czo/kit, better-auth |
| REST Routes | Nitro routes | Public auth endpoints | better-auth |
| GraphQL Schema | graphql-yoga | Protected queries/mutations | Session middleware |
| Session Store | Redis | Session storage & validation | ioredis |
| Database | PostgreSQL + Drizzle | Users, orgs, API keys | @czo/kit database utils |
| Notifications | Novu | Emails (verification, reset, invite) | @novu/node |
| OAuth | Google, GitHub | Social authentication | better-auth plugins |

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

Headers:
```
Set-Cookie: czo_session=<token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800
```

Body:
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
  "token": "string - session token for Bearer auth",
  "tokenType": "Bearer",
  "requires2FA": "boolean - true if 2FA enabled"
}
```

> **Note**: Le client peut utiliser soit le cookie (automatique pour browsers), soit le token dans le header `Authorization: Bearer <token>` (SPA, mobile).

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
- `401` - No active session

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

type User {
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

type Organization {
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

## 5. Security

### Authentication

| Method | Actors | Implementation |
|--------|--------|----------------|
| Email/Password | All | better-auth core, bcrypt hashing |
| Google OAuth | Customer, Merchant | better-auth OAuth plugin |
| GitHub OAuth | Admin | better-auth OAuth plugin |
| TOTP 2FA | All (required for Admin) | better-auth two-factor plugin |
| API Keys | API Consumer | better-auth api-key plugin, prefix `czo_` |

### Session Transport

Le serveur supporte deux méthodes de transport de session (le client choisit) :

| Méthode | Header/Cookie | Usage | Avantages |
|---------|---------------|-------|-----------|
| Bearer Token | `Authorization: Bearer <token>` | SPA, Mobile, Postman | Contrôle explicite, cross-origin |
| Cookie | `Cookie: czo_session=<token>` | SSR, Same-origin | Automatique, HttpOnly (XSS-safe) |

**Priorité d'extraction** : Bearer > Cookie (si les deux sont présents, Bearer gagne)

### Authorization

```typescript
// Middleware chain for GraphQL
export const authMiddleware = [
  extractCredentials,   // Bearer token > Cookie > API key
  validateSession,      // Reject if no valid session
  loadUserContext,      // Add user, org to context
  checkActorPermissions // Verify actorType allows operation
]

// Context available in resolvers
interface GraphQLContext {
  session: Session
  user: User
  actorType: string           // 'customer' | 'admin' | 'merchant'
  organization: Organization | null
  authSource: 'bearer' | 'cookie' | 'api-key'  // How the client authenticated
}
```

### Data Protection

| Data | Protection |
|------|------------|
| Passwords | bcrypt (cost 12) or argon2id |
| TOTP Secrets | AES-256-GCM encryption at rest |
| Backup Codes | bcrypt hashed |
| API Keys | SHA-256 hashed, only prefix stored readable |
| Sessions | Redis with TTL, no sensitive data |
| OAuth Tokens | Encrypted in database |

### Threat Model

| Threat | Mitigation |
|--------|------------|
| Credential Stuffing | Rate limiting (5/15min), 2FA promotion |
| Session Hijacking | Secure cookies, HTTPS only, IP binding optional |
| CSRF | SameSite cookies, CSRF tokens for mutations |
| User Enumeration | Generic error messages, no email existence check |
| Privilege Escalation | Actor type validated per-request, domain modules enforce |
| API Key Leakage | Prefix for detection (czo_), rotation support, scoped to org |
| OAuth State Tampering | Encrypted state with actor type, HMAC validation |
| 2FA Bypass | Limited backup codes, rate limited verification |

## 6. Performance

### Requirements

| Metric | Target | Method |
|--------|--------|--------|
| Login latency | < 200ms p95 | APM |
| Session validation | < 50ms p95 | APM |
| GraphQL auth overhead | < 10ms | APM |
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

- **Stateless Nitro instances** - Sessions in Redis, scale horizontally
- **Redis Cluster** - Session reads, rate limit counters
- **Connection pooling** - PostgreSQL via Drizzle

### Caching

| Data | Cache | TTL | Invalidation |
|------|-------|-----|--------------|
| Sessions | Redis | 7 days | On logout, explicit revoke |
| User by ID | Redis | 5 min | On profile update |
| Org membership | Redis | 5 min | On member add/remove |
| Rate limit counters | Redis | Window duration | Auto-expire |

```typescript
// Session config
const sessionConfig = {
  redis: {
    keyPrefix: 'czo:session:',
  },
  maxAge: 7 * 24 * 60 * 60,      // 7 days
  refreshThreshold: 24 * 60 * 60, // Refresh if < 1 day left
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

### Metrics

```typescript
// Prometheus metrics
const authMetrics = {
  login_total: Counter({ labels: ['actor_type', 'method', 'status'] }),
  login_duration: Histogram({ labels: ['actor_type', 'method'] }),
  session_active: Gauge({ labels: ['actor_type'] }),
  rate_limit_hits: Counter({ labels: ['endpoint'] }),
  two_factor_enabled: Gauge(),
  api_key_active: Gauge({ labels: ['org_id'] }),
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
| @better-auth/plugins | ^1.x | org, 2fa, api-key, admin plugins |
| ioredis | ^5.x | Redis client |
| @novu/node | ^2.x | Notification service |
| otplib | ^12.x | TOTP generation/validation |
| bcrypt | ^5.x | Password hashing |

### Infrastructure

- Redis 7+ (sessions, rate limiting)
- PostgreSQL 17+ (user data)
- Environment variables for secrets

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

  describe('GraphQL Protection', () => {
    it('rejects unauthenticated requests')
    it('allows authenticated requests with context')
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

1. **Phase 1: Core Auth** (Week 1-2)
   - Email/password registration and login
   - Session management with Redis
   - GraphQL protection middleware

2. **Phase 2: OAuth + Organizations** (Week 3-4)
   - Google OAuth for customer/merchant
   - GitHub OAuth for admin
   - Organization CRUD and invitations

3. **Phase 3: 2FA + API Keys** (Week 5)
   - TOTP 2FA with backup codes
   - API key generation and validation

4. **Phase 4: AuthRestrictionRegistry** (Week 6)
   - Registry service implementation
   - Domain module integration
   - Admin capabilities (impersonation)

5. **Launch** (Week 7)
   - Production deployment
   - Monitoring enabled
   - Documentation published

### Rollback Plan

| Issue | Rollback Action |
|-------|-----------------|
| better-auth breaking change | Pin to previous version, hotfix |
| Redis failure | Deploy with in-memory session fallback (degraded) |
| OAuth provider outage | Disable OAuth flag, email/password only |
| Critical security vuln | Immediate invalidate all sessions, force re-auth |

---

## Appendix

### Open Questions

- [x] better-auth hooks support actor validation? → **Yes, via `after` hooks**
- [x] Session extension fields in Drizzle? → **ALTER TABLE after better-auth init**
- [x] Rate limiting library? → **Custom with Redis (not external lib)**

### ADRs

- **ADR-001**: REST for auth, GraphQL protected → Security and simplicity
- **ADR-002**: Actor-based endpoints → Early validation, no user enumeration
- **ADR-003**: AuthRestrictionRegistry → Domain module independence

### References

- [better-auth Documentation](https://www.better-auth.com/)
- [better-auth Drizzle Adapter](https://www.better-auth.com/docs/adapters/drizzle)
- [OWASP Authentication Cheatsheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [Brainstorm Auth](./brainstorm.md)
- [PRD Auth](./prd.md)
