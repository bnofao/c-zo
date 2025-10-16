import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/modules/index.ts', 'src/plugins/*.ts'],
  exports: true,
  // dts: true,
  // external: [
  //   'nitropack',
  //   'nitro',
  //   'nitro/runtime',
  //   'unimport',
  // ],
})
