# syntax=docker/dockerfile:1
# The API image: built in the workspace, shipped with only dist/, drizzle/ and production
# dependencies. Build context is the repository root:
#   docker build -f apps/api/Dockerfile .        (Railway: RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile)
# One image for both instances; DEMO_MODE and the database come from the environment.
#   node dist/index.mjs                        the API (default command)
#   node dist/migrate.mjs                      migrations (Railway pre-deploy command)
#   node dist/demo-create.mjs --seed 42 ...    the showcase household (demo instance)

# Debian slim, not Alpine: glibc for the napi-rs builds (@node-rs/argon2), and full ICU for
# the demo's Europe/Budapest dates. Pinned by digest; Dependabot bumps it.
FROM node:26.13.0-trixie-slim@sha256:e4db4c914bf8ad241bd24804fc25d272d89bad97e68cdc8a1414862790a02c39 AS build
# Node 25+ no longer ships corepack.
RUN npm install --global pnpm@10.30.0
WORKDIR /repo

# Manifests first: the install layer stays cached until a dependency changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
# A dev dependency of the API (tests only): the install needs its manifest, never its source,
# and `deploy --prod` below leaves it out of the image.
COPY packages/fake-oidc/package.json packages/fake-oidc/
RUN pnpm install --frozen-lockfile --filter @splinance/api...

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @splinance/api build
# Production dependencies only (express, pg, argon2's linux build, ...); the shared package is
# bundled into dist by tsdown.
RUN pnpm --filter @splinance/api deploy --prod --legacy /out

FROM node:26.13.0-trixie-slim@sha256:e4db4c914bf8ad241bd24804fc25d272d89bad97e68cdc8a1414862790a02c39
ENV NODE_ENV=production
# migrator.ts resolves drizzle/ from the working directory: dist/ and drizzle/ side by side.
WORKDIR /app
# Owned by root, run as node: the process cannot change its own code.
COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/drizzle ./drizzle
USER node
EXPOSE 3000
# No curl in slim images. Liveness only: a database outage must not restart the API.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT ?? 3000}/api/health/live`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "--enable-source-maps", "dist/index.mjs"]
