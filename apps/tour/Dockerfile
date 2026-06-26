# syntax=docker/dockerfile:1
ARG NODE_VERSION=24

# --- build: install workspace + vite build (Nitro node-server standalone) ---
FROM node:${NODE_VERSION}-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build
# Self-contained OTel preload bundle (runtime image has no node_modules).
# The createRequire banner is REQUIRED: OTel's CJS deps call require() and the
# ESM output otherwise crashes with "require is not defined" (confirmed by spike).
RUN pnpm --filter @czo/tour exec esbuild src/instrumentation.ts \
    --bundle --platform=node --format=esm \
    --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);" \
    --outfile=.output/instrumentation.mjs

# --- runtime: Nitro standalone bundle — no node_modules needed ---
FROM node:${NODE_VERSION}-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
COPY --from=build --chown=node:node /app/apps/tour/.output ./apps/tour/.output
EXPOSE 3000
USER node
WORKDIR /app/apps/tour
CMD ["node", "--import", "./.output/instrumentation.mjs", ".output/server/index.mjs"]
