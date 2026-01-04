import { defineNitroConfig } from "nitro/config"
import kitModule from "@czo/kit/module"
// import productModule from '@czo/product'

export default defineNitroConfig({
  scanDirs: ['./'],
  preset: "standard",
  plugins: [
    // '@czo/kit/plugins/ioc',
    // 'old/tests.js',
    // '/workspace/c-zo/packages/kit/src/plugins/ioc.ts',
  ],
  modules: [
    // productModule,
    '@czo/product',
    kitModule,
  ],
  imports: {
    imports: [],
    dts: true
  },
  // apiDir: 'api',
  // alias: {
  //   '@czo/product': '@czo/product',
  // }
});
