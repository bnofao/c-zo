# syntax=docker/dockerfile:1
ARG NODE_VERSION=24

# --- build: install workspace + build every @czo/* dist ---
FROM node:${NODE_VERSION}-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

# --- runtime: tsx-on-source; keeps node_modules (incl. devDeps) + built dist ---
# devDependencies are deliberately retained despite NODE_ENV=production: `tsx`
# runs the TS source at runtime (`start`/`worker`) and `drizzle-kit` powers the
# pre-deploy `pnpm migrate`. Do NOT add a pruned/prod-only install — it breaks both.
FROM node:${NODE_VERSION}-slim AS runtime
WORKDIR /app
RUN npm i -g pnpm@10.17.1
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000
COPY --from=build --chown=node:node /app /app
EXPOSE 4000
USER node
# Worker reuses this image with: pnpm --filter @czo/life worker
CMD ["pnpm", "--filter", "@czo/life", "start"]
