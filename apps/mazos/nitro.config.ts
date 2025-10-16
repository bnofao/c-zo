import { defineNitroConfig } from "nitro/config"
import { iocModule } from "@czo/kit/modules"

export default defineNitroConfig({
  preset: "standard",
  plugins: [
    'old/tests.js',
    // '/workspace/c-zo/packages/kit/src/plugins/ioc.ts',
  ],
  modules: [
    iocModule,
  ],
  imports: {
    imports: [],
    dts: true
  }
});
