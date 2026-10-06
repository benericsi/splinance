# Splinance

Splinance is a household expense web app for tracking personal spending and shared expenses with a partner (also usable by roommates or families). It is a solo full-stack project with a focus on production-quality backend work: auth, data modeling, authorization, background jobs, tests, CI, and deployment. The aim is a finished, deployed app with clear, explainable design decisions.

## Core features

- Households with invite-link pairing and member roles
- Transactions with split rules (equal, percentage, fixed) and shared vs private visibility
- Running balance ("who owes whom") with settle-up
- Bank CSV import with duplicate detection
- Categories, auto-categorization rules, monthly budgets
- Recurring payment and subscription detection with renewal reminders
- Later: multi-currency (HUF/EUR), PWA, Hungarian/English i18n, demo mode

## Stack

- Frontend: React, TypeScript, Vite, TanStack Router, TanStack Query, TanStack Form, shadcn/ui, Tailwind CSS, charts (shadcn charts / Recharts), Zod
- Backend: Node.js, Express 5, TypeScript, PostgreSQL 18, Drizzle ORM (node-postgres driver), Zod validation, Argon2, pino
- Later: BullMQ + Redis for jobs
- Tooling: pnpm monorepo (apps/web, apps/api, packages/shared), Vitest, Supertest, Playwright, Docker Compose, GitHub Actions

## Repo conventions

- `packages/shared` is consumed as TypeScript source (no build step); the api bundles it with tsdown
- TypeScript pinned to 6.0 until typescript-eslint supports TS 7; `@types/node` matches the Node runtime major
- Module resolution is `Bundler` everywhere, so no `.js` extensions in relative imports
- Commands: `pnpm check` (same steps as CI), `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format`
- Database: schema in `apps/api/src/db/schema/` (one file per table, shared column helpers in `columns.ts`), migrations generated with `db:generate` into `apps/api/drizzle` and committed; never use `drizzle-kit push`. Do not edit or regenerate a migration once merged
- Data model and its conventions (uuidv7 ids, money, dates, composite FKs, named constraints) are documented in `docs/data-model.md`; update it in the same PR as any schema change. Create tables only when a feature needs them
- API routes are mounted under `/api`; errors use the shared `apiErrorResponseSchema` shape
- API code is organized by domain in `apps/api/src/modules/<name>/` (`<name>.routes.ts` parses input with shared Zod schemas, `<name>.service.ts` holds business logic and Drizzle queries; services accept `Db` so they run inside or outside a transaction). Multi-row writes use `db.transaction`
- Protected routes use `requireAuth` and read the user with `getAuth(req)`; authorization checks live in services
- Web: file-based TanStack Router routes in `apps/web/src/routes` (`routeTree.gen.ts` is generated, committed, not linted); feature code in `src/features/<name>`; data fetching via `queryOptions` + `apiFetch(path, sharedSchema)`; Vite proxies `/api` to the API in dev
- shadcn/ui on Base UI; components in `src/components/ui` are owned code and may be edited
- Tests run against a real Postgres (`splinance_test`); migrations are applied in Vitest global setup. API test files run sequentially (`fileParallelism: false`); tests that write data call `resetDatabase()` from `apps/api/test/db.ts` in `beforeEach`
- Password hashing uses `@node-rs/argon2` (the `argon2` package segfaults on this Windows setup)
- Work on a branch per change (`chore/...`, `feat/...`, `ci/...`, `docs/...`) and merge via pull request; do not commit to `main` directly

## Key design decisions

- Money stored as integer minor units, never floats
- Splits use the largest remainder method so shares always sum to the total
- Balances are derived from transactions, splits, and settlements, not stored
- Multi-row writes use SQL transactions
- Soft delete and an audit log for transactions
- Authorization enforced in the service layer; private data readable only by its creator
- Auth: short-lived access token plus rotated httpOnly refresh token, rate limiting, Helmet

## Roadmap

0. Foundation: monorepo, Docker, CI, config
1. Auth and households
2. Transactions and splits
3. Balances and settle-up (first deploy)
4. CSV import
5. Rules and budgets
6. Recurring detection and background jobs
7. Polish: PWA, i18n, multi-currency, real-time, demo mode

## Working rules

- Write tested, practical code; every phase ends deployable
- Strict TypeScript, shared Zod schemas between web and api
- Before a larger change, briefly explain the planned steps and wait for a go-ahead
- Explain tradeoffs briefly, and point out risks or mistakes you notice
- Use single hyphens, not em dashes
