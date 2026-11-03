# syntax=docker/dockerfile:1
# The web image: Caddy with both web builds (production and demo) and its Caddyfile, so the
# config and the files it serves can never drift apart. Build context is the repository root:
#   docker build -f deploy/web/Dockerfile --build-arg VITE_DEMO_URL=https://demo.splinance.com .
# Railway: RAILWAY_DOCKERFILE_PATH=deploy/web/Dockerfile, VITE_DEMO_URL as a service variable.

FROM node:26.13.0-trixie-slim@sha256:e4db4c914bf8ad241bd24804fc25d272d89bad97e68cdc8a1414862790a02c39 AS build
RUN npm install --global pnpm@10.30.0
WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @splinance/web...

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
# The production login page links here ("Try the demo"); empty hides the link.
ARG VITE_DEMO_URL=""
RUN VITE_DEMO_URL="$VITE_DEMO_URL" pnpm --filter @splinance/web build \
  && pnpm --filter @splinance/web build:demo

# The CSP in the Caddyfile must allow every inline script just built.
COPY deploy/web/Caddyfile deploy/web/
COPY deploy/scripts/check-csp.mjs deploy/scripts/
RUN node deploy/scripts/check-csp.mjs

FROM caddy:2.11-alpine@sha256:e70b164da81ef698b3ad19af799ea6086ce6d9e48ed4079eb9fe26f6fbf14ee5
COPY deploy/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv/web
COPY --from=build /repo/apps/web/dist-demo /srv/web-demo
# Caddy validates the config at start; a broken Caddyfile fails the deploy's healthcheck.
EXPOSE 8080
