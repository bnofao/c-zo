import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/cli/index.ts', 'src/config.ts', 'src/index.ts'],
  format: ['cjs', 'esm'],
  exports: true,
})
