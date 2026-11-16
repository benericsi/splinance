# Splinance

Household expense app (personal and shared spending, splits, balances, imports, budgets, savings, recurring payments) with a production-grade backend. Solo project; every design decision should be explainable. What it does and how: `docs/architecture.md` (start with section 1, the repository map, and section 14, "The hard parts"). Stack: same document, section 1.

## Read first, update in the same PR

- `docs/architecture.md` and `docs/data-model.md` before larger changes; update them whenever behavior or schema changes
- `docs/deploy.md` for a new env variable, service or database role
- `docs/data-track.md` before touching `data/` or `infra/`

## Commands

`pnpm check` (the main CI job: format, lint, typecheck, test, build), `pnpm check:data` (the data CI job), `pnpm e2e` (build + Playwright), `pnpm e2e:demo`, `pnpm --filter @splinance/e2e e2e:smoke` (needs `deploy/compose.smoke.yml` up), `pnpm capture:demo`, `pnpm dev`, `pnpm audit:prod`, `pnpm knip` (manual dead-code report). Postgres for tests: `docker compose up -d`.

## Workflow

- A branch per change (`feat/`, `fix/`, `chore/`, `ci/`, `docs/`, `perf/`, `refactor/`), merged by pull request; never commit to `main`. `main` requires branches to be up to date
- e2e runs against production builds; add an e2e flow when a feature ships a new user journey

## Working rules

- Write tested, practical code; every phase ends deployable
- Strict TypeScript, shared Zod schemas between web and api
- Before a larger change, briefly explain the planned steps and wait for a go-ahead
- Explain tradeoffs briefly, and point out risks or mistakes you notice
- Use single hyphens, not em dashes

## Never

- `drizzle-kit push`, or editing/regenerating a migration once merged (generate with `db:generate`; data migrations are hand-written, `--custom`)
- Commit to `main`, skip hooks, or run Terraform `apply` / anything against production or the demo database without the owner's go-ahead
- Tokens or personal data in query strings, logs, error messages or localStorage; `dangerouslySetInnerHTML`; `'unsafe-eval'` in the CSP
- Store money as floats (integer minor units only) or store balances (derived)
- Give the backup job a private key or read access; credentials in code, logs or Terraform state
- Add a dependency without checking `pnpm audit` (CI fails on high/critical in production deps)

## Pins

TypeScript 6.0 (until typescript-eslint supports 7); `@types/node` and the Node images follow the runtime major (26); Polars 1.x (Airflow constraints); `@node-rs/argon2`, not `argon2` (segfaults on Windows). Module resolution `Bundler`: no `.js` in relative imports. `packages/shared` ships TS source (bundled by tsdown).

## API rules (architecture 3-6, 16)

- Modules in `apps/api/src/modules/<name>/`: `<name>.routes.ts` parses with shared Zod schemas, `<name>.service.ts` holds logic and Drizzle queries and accepts `Db`. Household writes go through `inHouseholdWrite`; multi-row writes use one `db.transaction`. Keep the lock order: user row, households by id, goals by id
- Every household-scoped service calls `requireMembership` (404 for non-members); owner-only passes `role: 'owner'`. Private data goes through `visibleTo` / `goalVisibleTo` everywhere it can surface
- Ids via `idParam`; bodies and queries via shared Zod schemas with upper bounds; SQL only through Drizzle or parameterized `sql`; `escapeLike` for LIKE. Errors use the shared shape and codes (`API_ERROR_CODES`, worded per code in both web locales)
- Sign-in changes live in `modules/account` (`lockUser`, step-up via `verifyBeforeLock` + `requireRecentAuth`, never remove the last way in; wrong current password is 400, never 401). Providers: architecture 6
- New public or expensive endpoints get a `rateLimiter`; `RATE_LIMIT_DISABLED` is for e2e only
- Scheduled work: `startPeriodic` + `withAdvisoryLock`, plain functions with a `now` parameter
- A new table referencing households or users: delete it in `deleteHouseholdContents`, handle it in account deletion's `erase`, and decide whether it belongs in `EXCLUDE_DATA` (backups). The data track reads only the `analytics` views (contract test `src/db/analytics.test.ts`)
- Tests hit a real Postgres (`splinance_test`); writing tests call `resetDatabase()` in `beforeEach`

## Web rules (architecture 8-12)

- File routes in `src/routes` (`routeTree.gen.ts` generated and committed); protected pages under `_authenticated`; household pages render `PageHeader`, one `PageTitle`, and a `pendingComponent` skeleton
- Per feature: `api.ts` (only importer of `http`), `queries.ts` (`queryOptions` factories), `hooks.ts` (one hook per mutation, owns invalidation). Shared Zod schemas are the contract; no DTO layer
- Forms: TanStack Form + shared schema (`revalidateLogic()` + `onDynamic`). Modals are URL-driven (`RouteDialog`, `OPEN_MODAL_STATE`, `useCloseModal`); confirmations are local `ConfirmDialog`
- Demo-only code branches on the `__DEMO_SITE__` define and lives in `features/demo`; demo data comes only from `buildDemoStory` in `packages/shared/src/demo`
- UI: shadcn on Base UI (owned code), lucide icons, brand colors as fills and role tokens for text, amounts through `MoneyFlow` / `Amount` / `MaskMoney`, motion via `m.*` and `src/lib/motion.ts`. Every change must look right in light and dark, EN and HU
- Changing an inline script in `index.html` means updating its CSP hash (`node deploy/scripts/check-csp.mjs`); keep `theme.ts` and the inline theme script in sync
- PWA caches the app shell only, never `/api`. Invite tokens stay in the URL fragment. Post-login navigation only via `safeRedirect`
- Web tests mock the API with MSW (unhandled requests fail)

## Data track (docs/data-track.md)

Python only in `data/` (uv; commit `pyproject.toml` and `uv.lock` together), never imports app code. Thin DAGs (logic in tested functions), lake keys from `splinance_data.lake.paths`, idempotent overwrites. `data/scripts/check_dags.py` enforces the Airflow rules; extend it with new ones. Terraform: `plan -out`, apply that plan only with the go-ahead; commit `.terraform.lock.hcl` for windows, linux, darwin.

## Key design decisions

Integer minor units; largest-remainder splits; balances derived from transactions, splits and settlements; soft delete plus an audit log (snapshots keep ids, names are read live); authorization in the service layer; short-lived access token plus rotated httpOnly refresh token. Details and the reasons: architecture 14.
