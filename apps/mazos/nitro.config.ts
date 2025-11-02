import { defineNitroConfig } from "nitro/config"
import { iocModule } from "@czo/kit/modules"

export default defineNitroConfig({
  preset: "standard",
  plugins: [
    // '@czo/kit/plugins/ioc',
    // 'old/tests.js',
    // '/workspace/c-zo/packages/kit/src/plugins/ioc.ts',
  ],
  modules: [
    iocModule,
    '@czo/product',
  ],
  imports: {
    imports: [],
    dts: true
  }
});
