# Coding Style

## Project-Specific Conventions

- **Immutability**: Always create new objects, never mutate existing ones (spread operator, not assignment)
- **File organization**: Many small files (200-400 lines, 800 max). Organize by feature/domain, not by type
- **Functions**: Keep under 50 lines, no nesting deeper than 4 levels
- **No console.log**: Use proper logging; hooks will warn on console.log in committed code
- **Input validation**: Use Zod schemas at system boundaries
- **Soft deletion**: Entities use `deletedAt` field, never hard delete
- **Optimistic locking**: Entities use `version` field for concurrency control
