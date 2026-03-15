# Security Guidelines

## Pre-Commit Checks

- No hardcoded secrets — use environment variables
- Parameterized queries only (Drizzle ORM handles this)
- Error messages must not leak internal details
- Validate all user input at API boundaries

## If a Security Issue Is Found

1. Stop and assess severity
2. Fix CRITICAL issues before continuing
3. Rotate any exposed secrets
4. Check for similar issues elsewhere in the codebase
