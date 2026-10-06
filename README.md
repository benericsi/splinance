# Splinance

[![CI](https://github.com/benericsi/splinance/actions/workflows/ci.yml/badge.svg)](https://github.com/benericsi/splinance/actions/workflows/ci.yml)

Household expense tracker for personal spending and shared expenses with a partner, roommates or family.

> Work in progress.

## Tech stack

- **API:** Node.js, Express 5, TypeScript, PostgreSQL, Drizzle ORM, Zod, pino
- **Web:** React, Vite, TanStack Router/Query/Form, shadcn/ui, Tailwind CSS
- **Shared:** Zod schemas and types used by both apps
- **Tooling:** pnpm workspaces, Docker Compose, Vitest, Supertest, ESLint, Prettier, GitHub Actions

## Repository layout

```
apps/api         Express REST API
apps/web         React SPA (planned)
packages/shared  Zod schemas and types shared by api and web
```

## Getting started

Requirements: Node.js 22.12+, pnpm 10 (`corepack enable`) and Docker.

```bash
pnpm install
docker compose up -d
cp apps/api/.env.example apps/api/.env
pnpm --filter @splinance/api db:migrate
pnpm dev
```

Docker Compose starts Postgres with two databases: `splinance` for development and `splinance_test` for tests. If port 5432 is taken, copy `.env.example` to `.env` in the repo root, change `DB_PORT`, and update `DATABASE_URL` (and `TEST_DATABASE_URL` for tests) to match.

The API runs at http://localhost:3000:

- `GET /health/live`: the process is running
- `GET /health/ready`: the API can reach the database (503 if not)

## Database migrations

Schema lives in `apps/api/src/db/schema.ts`. Migrations are SQL files in `apps/api/drizzle`, generated from the schema and committed.

```bash
pnpm --filter @splinance/api db:generate   # create a migration from schema changes
pnpm --filter @splinance/api db:migrate    # apply pending migrations
pnpm --filter @splinance/api db:studio     # browse the database
```

Tests apply migrations to `splinance_test` automatically.

## Scripts

| Command          | What it does                                                       |
| ---------------- | ------------------------------------------------------------------ |
| `pnpm dev`       | Start all apps in watch mode                                       |
| `pnpm build`     | Build all apps                                                     |
| `pnpm test`      | Run all tests (needs Postgres running)                             |
| `pnpm typecheck` | Type-check every package                                           |
| `pnpm lint`      | Lint with ESLint (type-aware)                                      |
| `pnpm format`    | Format with Prettier                                               |
| `pnpm check`     | Run everything CI runs: format check, lint, typecheck, test, build |
