---
sidebar_position: 5
---

# Conventions

This page documents the coding, testing, git, and security standards enforced across the c-zo codebase.

## 1. Coding Style

### Immutability

Always create new objects; never mutate existing ones. Use the spread operator or `Object.assign` to produce new values:

```typescript
// Good
const updated = { ...existing, name: 'new name' }

// Bad — mutates the original
existing.name = 'new name'
```

### File Size

- Target: **200–400 lines** per file
- Hard maximum: **800 lines**
- Organize by **feature/domain**, not by type (avoid `utils/`, `helpers/` grab-bags)

### Functions

- Keep functions **under 50 lines**
- Nesting depth **must not exceed 4 levels**

### No console.log

Use the logger from `@czo/kit` instead:

```typescript
import { useLogger } from '@czo/kit'
const logger = useLogger('module:context')
logger.info('Service started')
logger.warn('Retrying after error', err.message)
```

A pre-commit hook warns on any `console.log` found in staged files.

### Input Validation

Use **Zod** schemas at every system boundary (service method entry points, HTTP handlers). Never trust raw input downstream.

```typescript
const CreateInput = z.object({
  name: z.string().min(1).max(255),
  countryCode: z.string().length(2),
})

const parsed = CreateInput.parse(rawInput)
```

### Soft Deletion

Never hard-delete records. All entity tables have a `deletedAt` timestamp column:

```typescript
deletedAt: timestamp('deleted_at')
```

Set `deletedAt = new Date()` to logically delete a record. All queries must filter `WHERE deleted_at IS NULL` by default.

### Optimistic Locking

All entity tables have a `version` integer column (default `1`). On every update, increment `version` and include the expected version in the `WHERE` clause to detect concurrent modifications:

```sql
UPDATE stock_locations
SET name = $1, version = version + 1
WHERE id = $2 AND version = $3
```

---

## 2. Testing

### Minimum Coverage: 80%

Every module must maintain at least **80% test coverage** across lines, branches, and functions.

### Test Types

All three test types are required:

| Type | Scope | Tooling |
|------|-------|---------|
| Unit | Individual functions, utilities | vitest |
| Integration | Service + DB operations | vitest + test database |
| E2E | Critical user flows | Playwright |

### Test-Driven Development (TDD)

The mandatory workflow is **RED → GREEN → IMPROVE**:

1. **RED** — Write the test first. It must fail.
2. **GREEN** — Write the minimal implementation to make the test pass.
3. **IMPROVE** — Refactor without breaking the tests.
4. Verify coverage is still at 80%+.

```bash
# Run tests in watch mode while implementing
pnpm test:watch

# Check coverage
pnpm test:coverage
```

### Useful Commands

```bash
pnpm test           # single run
pnpm test:watch     # watch mode
pnpm test:coverage  # coverage report
```

---

## 3. Git Workflow

### Commit Message Format

```
<type>: <short description>

<optional body — explain WHY, not WHAT>
```

Allowed types:

| Type | When to use |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code change with no behaviour change |
| `docs` | Documentation only |
| `test` | Adding or fixing tests |
| `chore` | Build, tooling, dependency updates |
| `perf` | Performance improvement |
| `ci` | CI/CD configuration |

Examples:

```
feat(stock-location): add createStockLocation mutation

fix(auth): handle expired JWT tokens gracefully

docs: add architecture guide to Docusaurus site
```

### Pull Request Workflow

1. Analyze the **full commit history** for the branch (`git diff main...HEAD`)
2. Write a comprehensive PR summary covering all changes — not just the last commit
3. Include a test plan checklist
4. Push the branch with `git push -u origin <branch>`

### Feature Implementation Workflow

1. **Plan** — Identify dependencies and break the work into phases
2. **TDD** — Write tests first, implement to pass, then refactor
3. **Review** — Code review before merging
4. **Commit** — Detailed conventional commit message

---

## 4. Security

### No Hardcoded Secrets

All secrets and credentials must come from environment variables. Never commit API keys, database passwords, or tokens:

```typescript
// Good
const dbUrl = process.env.DATABASE_URL

// Bad — never do this
const dbUrl = 'postgresql://admin:secret@prod-host/db'
```

### Parameterized Queries Only

Drizzle ORM parameterizes all queries automatically. Never interpolate user input into SQL strings.

### Error Messages

Error messages returned to clients must not leak internal implementation details:

```typescript
// Good — generic message to client
throw new GraphQLError('Resource not found')

// Bad — leaks table names and query structure
throw new Error(`SELECT failed on stock_locations WHERE id = ${id}`)
```

Log the full error server-side (with `useLogger`) and return a sanitized message to the API consumer.

### Input Validation at API Boundaries

Validate all user-supplied data with Zod before it reaches the service or database layer. This applies to GraphQL input types, REST query parameters, and any data sourced from external systems.

### If a Security Issue Is Found

1. Stop and assess severity
2. Fix **CRITICAL** issues before continuing any other work
3. Rotate any exposed secrets immediately
4. Search the codebase for similar patterns
