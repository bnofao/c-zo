# Performance

## Agent Model Selection

- **Haiku** (`haiku`): Lightweight agents, frequent invocations, worker agents
- **Sonnet** (`sonnet`): Main development, orchestration, complex coding
- **Opus** (`opus`): Architectural decisions, deep reasoning, research

## Context Window

For tasks spanning many files (refactoring, multi-file features), be mindful of context usage. Single-file edits and utility creation are low-context tasks.

## Build Troubleshooting

If build fails:
1. Analyze error messages
2. Fix incrementally
3. Verify after each fix
