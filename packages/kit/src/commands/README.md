# CZO Commands

This directory contains CLI commands for the CZO toolkit.

## Publish Command

The `publish` command allows you to publish specific directories or files to an output directory.

### Usage

```bash
czo publish --dirs <directories> --outdir <output-directory>
```

### Options

- `--dirs`: Comma-separated list of directories or glob patterns to publish (required)
- `--outdir`: Output directory where files will be published (required)

### Examples

1. **Publish a single directory:**
```bash
czo publish --dirs src --outdir dist
```

2. **Publish multiple directories:**
```bash
czo publish --dirs "src,lib,assets" --outdir dist
```

3. **Publish using glob patterns:**
```bash
czo publish --dirs "src/**/*.ts,lib/**/*.js" --outdir dist
```

4. **Publish specific files:**
```bash
czo publish --dirs "package.json,README.md" --outdir dist
```

### Features

- Supports multiple directories separated by commas
- Supports glob patterns for flexible file selection
- Automatically creates output directory if it doesn't exist
- Preserves directory structure in the output
- Provides detailed progress information

### Installation

After building the package, you can run the command globally if the package is linked:

```bash
pnpm install
pnpm build
pnpm link --global
```

Or use it within the workspace:

```bash
pnpm czo publish --dirs src --outdir dist
```

### Programmatic Usage

You can also use the publish command programmatically:

```typescript
import { publishCommand } from '@czo/kit'

// Use with citty's runCommand
import { runCommand } from 'citty'

await runCommand(publishCommand, {
  rawArgs: ['--dirs', 'src,lib', '--outdir', 'dist']
})
```



