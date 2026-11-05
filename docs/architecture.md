# Splinance architecture

How the code works today, why it is built this way, and the parts that are easy to get wrong. For the database tables and their conventions see [data-model.md](data-model.md); for coding rules see [CLAUDE.md](../CLAUDE.md).

Status: Phases 0 to 3 (foundation; auth, households, invites, onboarding; transactions and splits; balances and settle-up) are done, API and web. Phase 4 (bank CSV import: Revolut and K&H, duplicate check, review, undo) is done; OTP follows once a sample export exists. Phase 5 (category rules and monthly household budgets) is done, and so is a Reports section with charts. The first deploy is the last item of the roadmap.

## Contents

1. [Repository map](#1-repository-map)
2. [Development workflow](#2-development-workflow)
3. [API: request lifecycle](#3-api-request-lifecycle)
4. [API: endpoints](#4-api-endpoints)
5. [Database and migrations](#5-database-and-migrations)
6. [Authentication in depth](#6-authentication-in-depth)
7. [Shared package](#7-shared-package)
8. [Web: boot sequence](#8-web-boot-sequence)
9. [Web: routing and guards](#9-web-routing-and-guards)
10. [Web: data layer (HTTP client, queries, hooks)](#10-web-data-layer)
11. [Web: forms](#11-web-forms)
12. [Web: theme, brand and UI building blocks](#12-web-theme-brand-and-ui-building-blocks)
13. [Testing](#13-testing)
14. [The hard parts](#14-the-hard-parts)
15. [Known limitations](#15-known-limitations)
16. [Security](#16-security)

---

## 1. Repository map

pnpm monorepo, three packages:

```
apps/api          Express 5 REST API (Node 26, TypeScript, Drizzle, Postgres)
apps/web          React 19 SPA (Vite 8, TanStack Router/Query/Form, shadcn/ui on Base UI, Tailwind v4)
packages/shared   Zod schemas, password rules, brand palette: the contract between api and web
packages/fake-oidc  A small OpenID Connect provider standing in for Google in tests and e2e (never deployed)
e2e               Playwright end-to-end suite against the production builds (and the smoke suite against the images)
deploy/           Web image (Caddy + both builds, Caddyfile), database roles (db/), backup job and restore drill (backup/), smoke stack, CSP check: see section 13 and deploy.md
data/             Python data track (uv project, not a pnpm package): see data-track.md
infra/            Terraform for AWS (state bucket, data lake, backups bucket, IAM, budgets): see data-track.md
docs/             data-model.md, data-track.md, deploy.md (Railway setup and operations), architecture.md (this file)
docker/           Postgres init scripts (test and demo databases, the data track's login)
```

Key files by concern:

| Concern                       | Files                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| API entry, middleware chain   | `apps/api/src/index.ts`, `apps/api/src/app.ts`                                                                           |
| Env validation                | `apps/api/src/config/env.ts`                                                                                             |
| DB client, schema, migrations | `apps/api/src/db/*`, `apps/api/drizzle/*.sql`                                                                            |
| Auth (API)                    | `apps/api/src/modules/auth/*`, `apps/api/src/middleware/require-auth.ts`                                                 |
| Sign in with a provider (API) | `apps/api/src/modules/auth/oauth/*` (providers, cookies, service, routes), `packages/fake-oidc`                          |
| Households and invites (API)  | `apps/api/src/modules/households/*`, `apps/api/src/modules/invites/*`                                                    |
| Categories (API)              | `apps/api/src/modules/categories/*`                                                                                      |
| Transactions (API)            | `apps/api/src/modules/transactions/*`, trigger in `apps/api/drizzle/0006_transaction_split_sum_trigger.sql`              |
| Balances and settlements      | `apps/api/src/modules/balances/*` (`ledger.ts` derives debts), `apps/api/src/modules/settlements/*`                      |
| Bank imports                  | `packages/shared/src/imports/*` (parsers, contract), `apps/api/src/modules/imports/*`, `apps/web/src/features/imports/*` |
| Category rules                | `packages/shared/src/rules.ts` (matching), `apps/api/src/modules/rules/*`, `apps/web/src/features/rules/*`               |
| Budgets                       | `packages/shared/src/budgets.ts`, `apps/api/src/modules/budgets/*`, `apps/web/src/features/budgets/*`                    |
| Recurring payments            | `packages/shared/src/recurring/*` (matching, detection, dates), `apps/api/src/modules/recurring/*`                       |
| Reports (charts)              | `packages/shared/src/reports.ts`, `apps/api/src/modules/reports/*`, `apps/web/src/features/reports/*`                    |
| Money and split math          | `packages/shared/src/money.ts`, `packages/shared/src/splits.ts`, `packages/shared/src/balances.ts`                       |
| Demo data (story, bank files) | `packages/shared/src/demo/*`, `apps/api/src/modules/demo/bank-files.cli.ts`                                              |
| Errors                        | `apps/api/src/lib/http-error.ts`, `apps/api/src/middleware/error-handler.ts`, `packages/shared/src/api-error.ts`         |
| Web entry, router setup       | `apps/web/index.html`, `apps/web/src/main.tsx`, `apps/web/src/routes/*`                                                  |
| HTTP client, auth store       | `apps/web/src/lib/http.ts`, `apps/web/src/lib/auth-store.ts`                                                             |
| Auth (web)                    | `apps/web/src/features/auth/*`                                                                                           |
| Households (web), app shell   | `apps/web/src/features/households/*`, `apps/web/src/routes/_authenticated/h/*`                                           |
| URL-driven modals             | `apps/web/src/components/route-dialog.tsx`, `apps/web/src/lib/route-modal.ts`                                            |
| Theme                         | `apps/web/src/lib/theme.ts` + inline script in `apps/web/index.html`                                                     |
| Images, web server            | `apps/api/Dockerfile`, `deploy/web/Dockerfile`, `deploy/web/Caddyfile`, `.dockerignore`, `deploy/compose.smoke.yml`      |
| Database roles, backups       | `deploy/db/*.sql`, `deploy/backup/*` (backup.sh, restore.sh, recipients.txt, compose.drill.yml), `infra/main/backups.tf` |
| Brand                         | `packages/shared/src/brand.ts`, `apps/web/src/components/brand/*`, `apps/web/src/index.css`                              |

`packages/shared` has no build step: its `package.json` exports `src/index.ts` directly. Every consumer compiles it (Vite in web, tsx in api dev, Vitest in tests) and tsdown inlines it into the production API bundle (`deps.alwaysBundle`).

## 2. Development workflow

### Running locally

```bash
pnpm install
docker compose up -d                          # Postgres 18: splinance, splinance_test, splinance_demo
cp apps/api/.env.example apps/api/.env        # then set a real JWT_ACCESS_SECRET
pnpm --filter @splinance/api db:migrate
pnpm dev                                      # api :3000 (tsx watch) + web :5173 (Vite)
```

Open http://localhost:5173. Vite proxies `/api/*` to the API, so the browser sees one origin (no CORS, cookies just work).

The scripts in `docker/postgres/init` run only when the volume is empty (first start): `01` creates `splinance_test`, `02` `splinance_demo` (the demo instance's database, the data track's source), `03` the data track's local login `splinance_demo_analytics` (see [data-track.md](data-track.md#postgres-source-the-demo-database)). On an older volume, run the missing ones once by hand, for example `docker compose exec -T db psql -U splinance -d splinance -v ON_ERROR_STOP=1 < docker/postgres/init/03-analytics-login.sql`.

### Checks

`pnpm check` runs exactly what the main CI job runs: Prettier check, ESLint (type-aware, `strictTypeChecked`), `tsc` per package, all tests, all builds. Run it before pushing.

`pnpm e2e` builds everything and runs the Playwright suite (see [Testing](#13-testing)); `pnpm e2e:demo` does the same for the demo instance. It uses its own ports and database, so it can run next to `pnpm dev`. First time only: `pnpm --filter @splinance/e2e exec playwright install chromium`.

`pnpm check:data` runs what the `Data track (Python)` CI job runs: ruff format and lint, mypy (strict) and pytest in `data/`. It needs [uv](https://docs.astral.sh/uv/); see [data-track.md](data-track.md).

### Branches and pull requests

- One branch per change (`feat/...`, `chore/...`, `ci/...`, `docs/...`), merged via pull request. `main` has a GitHub ruleset: PR required, the CI check `Lint, typecheck, test, build` must pass and be up to date, no force push, no deletion.
- CI (`.github/workflows/ci.yml`) runs on Ubuntu with a Postgres 18 service container using the same credentials as Docker Compose, so the default test database URL works unchanged. A second job, `End-to-end (Playwright)`, runs `pnpm e2e` with its own Postgres service and uploads the HTML report and traces when it fails. It is not a required check (yet). Another job, `Data track (Python)`, installs uv and runs the `data/` checks; it needs no database or AWS credentials. `Data track x Postgres` runs the local init scripts, the app's migrations and `demo:create` on a fresh Postgres, then the pipeline's tests marked `postgres` against it. `Infrastructure (Terraform)` checks formatting and validates both stacks in `infra/` without credentials.
- `gh` is not installed locally; PRs are opened from the GitHub compare page.

### Generators

| Command                                                                                  | What it regenerates                                                                                      |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @splinance/api db:generate`                                               | SQL migration from `src/db/schema/` changes                                                              |
| `pnpm --filter @splinance/shared gen:common-passwords`                                   | `src/password/common-passwords.ts` (top 1000 passwords with 10+ chars from `@zxcvbn-ts/language-common`) |
| `pnpm --filter @splinance/web gen:icons`                                                 | `public/favicon-32.png`, `public/apple-touch-icon.png` from the SVG logos                                |
| `pnpm --filter @splinance/api demo:create [--seed <n>] [--today <date>] [--days <n>]`    | A demo sandbox on the configured `_demo` database, no session (see Demo in section 4)                    |
| `pnpm --filter @splinance/api demo:bank-files --out <dir> [--seed <n>] [--today <date>]` | The demo story's monthly Revolut and K&H exports (not committed; for the data track)                     |
| Vite / TanStack Router plugin (automatic)                                                | `apps/web/src/routeTree.gen.ts` (committed, not linted)                                                  |

## 3. API: request lifecycle

`createApp(deps)` in `app.ts` builds the Express app; `index.ts` only starts the server and handles shutdown. Keeping them apart lets Supertest drive the app in memory without opening a port, and lets tests inject dependencies (for example a failing `pingDatabase`).

Middleware order:

```
helmet()                 security headers (CSP, HSTS, nosniff, ...)
pinoHttp()               request id, req.log, one log line per request (method, url, status only;
                         invite tokens in the url are redacted)
express.json             body parsing with a size cap: 100kb, 1mb for bank imports (a thousand rows);
                         no compressed bodies (inflate: false), so the cap bounds memory
cookieParser()           req.cookies (needed for the refresh token)
/api router
  /health                live + ready
  rateLimiter(1000)      ceiling per IP and 15 minutes for everything below
  /auth                  register, login, refresh, logout (rate limited)
  GET /me                requireAuth -> getMe
  /households            requireAuth for every route; membership checked in the services
  /invites               token-addressed: public preview, accept (rate limited)
  /demo                  demo instance only (DEMO_MODE): start a sandbox, its status
notFoundHandler          unknown route -> HttpError 404
errorHandler             every error -> shared JSON error shape
```

Error handling: route handlers just `throw`. Express 5 forwards rejected promises to the error middleware, so there is no `try/catch` or async wrapper in routes. The error handler maps:

| Thrown                                     | Response                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| `ZodError` (from `schema.parse(req.body)`) | 400 `VALIDATION_ERROR` with `details` (Zod tree)                          |
| `HttpError(status, message, code)`         | that status and code                                                      |
| body-parser errors (`expose`, `type`)      | 400 `INVALID_JSON`, 413 `PAYLOAD_TOO_LARGE`, 415 `UNSUPPORTED_MEDIA_TYPE` |
| anything else                              | logged with stack, client gets 500 `INTERNAL_ERROR` without internals     |

Every error body matches `apiErrorResponseSchema` from the shared package: `{ "error": { "code": string, "message": string, "details"?: unknown } }`.

Graceful shutdown (`index.ts`): on SIGTERM/SIGINT the server stops accepting connections, waits for in-flight requests, then closes the Postgres pool. A 10 second `unref()`ed timer forces exit if something hangs.

## 4. API: endpoints

All routes live under `/api`. Request and response bodies are defined by Zod schemas in `packages/shared`.

| Method and path                          | Auth                                   | Request                                       | Success                                                                           | Errors                                                                                   |
| ---------------------------------------- | -------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `GET /api/health/live`                   | none                                   |                                               | 200 `{ status: 'ok', uptimeSeconds }`                                             |                                                                                          |
| `GET /api/health/ready`                  | none                                   |                                               | 200 `{ status: 'ok', checks: { database: 'ok' } }`                                | 503 same shape with `'error'`                                                            |
| `POST /api/auth/register`                | none, 5 req / 15 min / IP              | `{ email, password, displayName }`            | 201 `{ accessToken, user }` + refresh cookie                                      | 400 `VALIDATION_ERROR`, 403 `REGISTRATION_CLOSED`, 409 `EMAIL_TAKEN`, 429 `RATE_LIMITED` |
| `POST /api/auth/login`                   | none, 10 failed / 15 min / IP          | `{ email, password }` (+ link cookie)         | 200 `{ accessToken, user, linkedProvider? }` + refresh cookie                     | 401 `INVALID_CREDENTIALS`, 429                                                           |
| `POST /api/auth/refresh`                 | refresh cookie, 100 / 15 min           |                                               | 200 `{ accessToken, user }` (+ rotated cookie, except in the grace window)        | 401 `INVALID_REFRESH_TOKEN`                                                              |
| `POST /api/auth/logout`                  | refresh cookie (optional)              |                                               | 204, cookie cleared                                                               |                                                                                          |
| `GET /api/auth/providers`                | none                                   |                                               | 200 `{ providers: [{ id }] }` (empty without providers and on the demo)           |                                                                                          |
| `GET /api/auth/oauth/:provider/start`    | none, 30 / 15 min / IP                 | `?redirect=` (same-app path)                  | 303 to the provider + flow cookie                                                 | 303 `/login?oauth_error=unavailable`, 404 unknown provider, 429                          |
| `GET /api/auth/oauth/:provider/callback` | flow cookie, 30 / 15 min / IP          | `?code&state` (or `?error`) from the provider | 303 `/login?redirect=` + refresh cookie, or 303 `/login?oauth=link` + link cookie | 303 `/login?oauth_error=<code>` (section 6), 429                                         |
| `GET /api/auth/oauth/link`               | link cookie                            |                                               | 200 `{ provider, email }`                                                         | 404 `NOT_FOUND`                                                                          |
| `GET /api/me`                            | `Authorization: Bearer <access token>` |                                               | 200 `{ user }`                                                                    | 401 `UNAUTHENTICATED`                                                                    |

`user` is `{ id, email, displayName, createdAt }` (`userSchema`).

Account (the signed-in user's own settings, `modules/account`). Every route needs a Bearer token; limits are per user per 15 minutes. On the demo instance every write answers 403 `DEMO_MODE`.

| Method and path                                          | Request                              | Success                                                                                                   | Errors                                                                                                                 |
| -------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `GET /api/account`                                       |                                      | 200 `{ user, hasPassword, identities: [{ provider, connectedAt, lastUsedAt }], providers, recentSignIn }` |                                                                                                                        |
| `PATCH /api/account` (30)                                | `{ displayName }`                    | 200 `{ user }`                                                                                            | 400                                                                                                                    |
| `POST /api/account/password` (10 failed)                 | `{ currentPassword?, newPassword }`  | 204, every other session signed out                                                                       | 400 `WRONG_PASSWORD` / `WEAK_PASSWORD` / `VALIDATION_ERROR`, 401 (session ended), 403 `REAUTH_REQUIRED`                |
| `POST /api/account/sessions/revoke-others` (10)          |                                      | 200 `{ revoked }`                                                                                         | 401 (session ended)                                                                                                    |
| `POST /api/account/identities/:provider/connect` (10)    | `{ currentPassword? }`               | 200 `{ authorizationUrl }` + flow cookie (`connect`)                                                      | 400 `WRONG_PASSWORD`, 403 `REAUTH_REQUIRED`, 404 unknown provider, 409 `ALREADY_CONNECTED`, 503 `PROVIDER_UNAVAILABLE` |
| `POST /api/account/identities/:provider/reauth` (10)     | `{ redirect? }` (same-app path)      | 200 `{ authorizationUrl }` + flow cookie (`reauth`)                                                       | 404 `IDENTITY_NOT_FOUND` / unknown provider, 503                                                                       |
| `POST /api/account/identities/:provider/disconnect` (10) | `{ currentPassword? }`               | 204, every other session signed out                                                                       | 400 `WRONG_PASSWORD`, 403 `REAUTH_REQUIRED`, 404 `IDENTITY_NOT_FOUND`, 409 `LAST_SIGN_IN_METHOD`                       |
| `GET /api/account/deletion`                              |                                      | 200 `{ blockers, leaves, deletes, archives, privateTransactionCount }`                                    |                                                                                                                        |
| `POST /api/account/delete` (5)                           | `{ currentPassword?, confirmEmail }` | 204, refresh cookie cleared                                                                               | 400 `WRONG_PASSWORD` / `CONFIRMATION_MISMATCH`, 403 `REAUTH_REQUIRED`, 409 `UNSETTLED_BALANCE` / `LAST_OWNER`          |

`providers` lists what this instance offers (empty on the demo), `identities` what is connected, `recentSignIn` whether this session may make a no-password change without signing in again. `currentPassword` is required when the account has a password; an account without one (Google only) may set a first password within 10 minutes of signing in.

Households and invites. Every route needs a Bearer token except the invite preview. "Member" means an active member (not left) of a non-archived household; everyone else gets 404 `HOUSEHOLD_NOT_FOUND`, also for malformed ids. A member calling an owner-only route gets 403 `FORBIDDEN`.

| Method and path                                | Who                   | Request    | Success                                                   | Errors (besides the above)                                                      |
| ---------------------------------------------- | --------------------- | ---------- | --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `POST /api/households`                         | any user              | `{ name }` | 201 `{ household }`, caller is owner                      | 400                                                                             |
| `GET /api/households`                          | any user              |            | 200 `{ households }` (active memberships)                 |                                                                                 |
| `GET /api/households/:id`                      | member                |            | 200 `{ household }` with `members`                        |                                                                                 |
| `PATCH /api/households/:id`                    | owner                 | `{ name }` | 200 `{ household }`                                       | 400                                                                             |
| `DELETE /api/households/:id`                   | owner                 |            | 204, archived (404 for everyone after)                    | 409 `UNSETTLED_BALANCE` (anyone still owes anybody)                             |
| `POST /api/households/:id/leave`               | member                |            | 204                                                       | 409 `LAST_OWNER`, 409 `UNSETTLED_BALANCE`                                       |
| `PATCH /api/households/:id/members/:userId`    | owner                 | `{ role }` | 200 `{ member }`                                          | 404 `MEMBER_NOT_FOUND`, 409 `LAST_OWNER`                                        |
| `DELETE /api/households/:id/members/:userId`   | owner                 |            | 204                                                       | 400 `CANNOT_REMOVE_SELF`, 404 `MEMBER_NOT_FOUND`, 409 `UNSETTLED_BALANCE`       |
| `POST /api/households/:id/invites`             | owner                 |            | 201 `{ invite, token }`                                   |                                                                                 |
| `GET /api/households/:id/invites`              | owner                 |            | 200 `{ invites }` (pending only)                          |                                                                                 |
| `DELETE /api/households/:id/invites/:inviteId` | owner                 |            | 204                                                       | 404 `INVITE_NOT_FOUND` (unknown or no longer pending)                           |
| `GET /api/invites/:token`                      | none, 60 / 15 min     |            | 200 `{ invite: { householdName, invitedBy, expiresAt } }` | 404 `INVITE_NOT_FOUND`, 410 `INVITE_REVOKED` / `INVITE_USED` / `INVITE_EXPIRED` |
| `POST /api/invites/:token/accept`              | any user, 30 / 15 min |            | 200 `{ household }`, caller is member                     | same as preview, 409 `ALREADY_MEMBER` (invite stays unused)                     |

Categories. Mounted under a household, so the same 404 rules apply first. Every member may manage them.

| Method and path                                           | Who    | Request                                   | Success                                      | Errors (besides the above)                    |
| --------------------------------------------------------- | ------ | ----------------------------------------- | -------------------------------------------- | --------------------------------------------- |
| `GET /api/households/:id/categories`                      | member |                                           | 200 `{ categories }`, archived ones included |                                               |
| `POST /api/households/:id/categories`                     | member | `{ name, kind, icon, color }`             | 201 `{ category }`                           | 400, 409 `CATEGORY_NAME_TAKEN`                |
| `PATCH /api/households/:id/categories/:categoryId`        | member | any of `{ name, icon, color }` (not kind) | 200 `{ category }`                           | 404 `CATEGORY_NOT_FOUND` (also archived), 409 |
| `DELETE /api/households/:id/categories/:categoryId`       | member |                                           | 204, archived                                | 404 `CATEGORY_NOT_FOUND`                      |
| `POST /api/households/:id/categories/:categoryId/restore` | member |                                           | 200 `{ category }` (no-op if active)         | 404, 409 `CATEGORY_NAME_TAKEN` (name reused)  |

`category` is `{ id, name, kind, icon, color, archivedAt }`; the list is sorted by kind (expense first), then name. New households get `DEFAULT_CATEGORIES` in the same transaction that creates them.

Transactions. Also under a household. "Visible" means shared, or private and created by the caller; anything else is 404 `TRANSACTION_NOT_FOUND`, exactly like an unknown id.

| Method and path                                                | Who                                | Request                                                                  | Success                                      | Errors (besides the above)                                                             |
| -------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------- | -------------------------------------------------------------------------------------- |
| `GET /api/households/:id/transactions`                         | member                             | query: `month, kind, visibility, categoryId, memberId, q, cursor, limit` | 200 `{ transactions, nextCursor }`           | 400 (bad filter or cursor)                                                             |
| `GET /api/households/:id/transactions/summary`                 | member                             | query: `month` (required)                                                | 200 `{ summary }`                            | 400                                                                                    |
| `POST /api/households/:id/transactions`                        | member                             | transaction input (below)                                                | 201 `{ transaction }`                        | 400 `VALIDATION_ERROR`, `INVALID_MEMBER`, `INVALID_CATEGORY`                           |
| `GET /api/households/:id/transactions/:transactionId`          | member, visible                    |                                                                          | 200 `{ transaction }`                        | 404 `TRANSACTION_NOT_FOUND` (also deleted)                                             |
| `PUT /api/households/:id/transactions/:transactionId`          | member, visible                    | transaction input + `version`                                            | 200 `{ transaction }`, version + 1           | 400 as create, 403 `FORBIDDEN` (making someone else's private), 409 `VERSION_CONFLICT` |
| `DELETE /api/households/:id/transactions/:transactionId`       | member, visible                    |                                                                          | 204, soft deleted                            |                                                                                        |
| `POST /api/households/:id/transactions/:transactionId/restore` | member, visible (deleted included) |                                                                          | 200 `{ transaction }` (no-op if not deleted) |                                                                                        |
| `GET /api/households/:id/transactions/:transactionId/history`  | member, visible (deleted included) |                                                                          | 200 `{ entries }`, oldest first              |                                                                                        |

Transaction input is a union on `visibility`. Both carry `kind, amount, occurredOn, description, categoryId`. `private` has nothing else: the author paid, no split. `shared` adds `paidBy` (for income: who received it) and `split`: `{ method: 'equal', userIds }`, `{ method: 'percentage', shares: [{ userId, basisPoints }] }` or `{ method: 'fixed', shares: [{ userId, amount }] }`, which must add up (`splitProblem`, checked by the schema). The response `transaction` has `paidBy` and `createdBy` as `{ userId, displayName }`, `split` as `{ method, shares: [{ userId, displayName, amount, basisPoints }] }` (null when private), `currency` (always the household's), `version` and timestamps.

Write rules (all in `transactions.service.ts`):

- Every write runs in one database transaction: shared household lock, membership check, the change, the split rows, the audit entry.
- Payer and split people must be active members, except people who were already on the transaction before this edit, so an old expense with someone who left can still be corrected.
- New category references must be active, of the transaction's kind, and in this household. Keeping the current category is allowed even if it was archived since.
- Any member may edit or delete a shared transaction (audited). Only the author may make one private, because the payer becomes the author and the others lose sight of it.
- The server computes the shares from the entered split. People are sorted by user id first, so the same input always gives the same shares (and the same person gets a leftover unit).
- `PUT` replaces the transaction and must name the `version` it was based on. The row is locked (`FOR UPDATE`) before the comparison, so two concurrent edits of the same version produce one 200 and one 409. Delete and restore also bump the version, so a form opened before a delete cannot overwrite the restored row.
- The summary is `{ month, currency, expenses, income, yourExpenses }` over what the caller can see: `yourExpenses` adds their shares of shared expenses and their private expenses. The list is paged, so the client could not total a month itself.
- The list is keyset-paginated: newest `occurred_on` first, then id descending. `nextCursor` encodes the last row's `(occurred_on, id)` and the next page asks for rows strictly before it, so inserts never shift pages (unlike `OFFSET`). `q` is a case-insensitive substring match with `%` and `_` escaped.

Category rules. Also under a household; every member manages them, like categories.

| Method and path                                 | Who    | Request                                | Success                                  | Errors (besides the above)                                                   |
| ----------------------------------------------- | ------ | -------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------- |
| `GET /api/households/:id/rules`                 | member |                                        | 200 `{ rules }`, in the order they apply |                                                                              |
| `POST /api/households/:id/rules`                | member | `{ pattern, categoryId, markShared }`  | 201 `{ rule }`, placed last              | 400 `INVALID_CATEGORY` (archived, other household), 409 `RULE_PATTERN_TAKEN` |
| `PATCH /api/households/:id/rules/:ruleId`       | member | any of the above                       | 200 `{ rule }`                           | 404 `RULE_NOT_FOUND`, 400, 409                                               |
| `DELETE /api/households/:id/rules/:ruleId`      | member |                                        | 204 (hard delete)                        | 404                                                                          |
| `PUT /api/households/:id/rules/order`           | member | `{ ruleIds }`, every rule exactly once | 200 `{ rules }`                          | 400 `RULE_ORDER_MISMATCH`                                                    |
| `GET /api/households/:id/rules/:ruleId/matches` | member |                                        | 200 `{ count }`                          | 404                                                                          |
| `POST /api/households/:id/rules/:ruleId/apply`  | member |                                        | 200 `{ updated }`                        | 404, 400 `INVALID_CATEGORY` (archived since)                                 |

- A rule matches when its text appears in the transaction's counterparty or description, accent and case insensitive (`matchKey`), and the kinds agree. No regular expressions: they are easy to get wrong and can be slow.
- Applying categorizes the earlier transactions the caller can see that have no category, each as an audited update with a new version (an edit form opened before gets the usual conflict). It never changes who a transaction is for: that would move balances. Matching runs in TypeScript with the same function the web uses, so preview and result agree.

Budgets. Also under a household; every member sees and sets them. Household budgets only for now (shared spending).

| Method and path                               | Who    | Request                                     | Success                                         | Errors (besides the above)                                      |
| --------------------------------------------- | ------ | ------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| `GET /api/households/:id/budgets`             | member | query: `month` (required)                   | 200 `{ budgets: { month, currency, budgets } }` | 400                                                             |
| `PUT /api/households/:id/budgets/:categoryId` | member | `{ amount, from }` (`amount: null` removes) | 204                                             | 400 `INVALID_CATEGORY` (income, archived, other household), 404 |

- A budget in the list is `{ categoryId, amount, since, spent }`: the amount in force that month, the month it was set from, and the month's shared expenses in the category (whole amounts). Archived categories drop out.

Reports. Totals over a range of months for the charts, as the caller sees them.

| Method and path                   | Who    | Request                                            | Success                                                      | Errors (besides the above) |
| --------------------------------- | ------ | -------------------------------------------------- | ------------------------------------------------------------ | -------------------------- |
| `GET /api/households/:id/reports` | member | query: `from`, `to` (`YYYY-MM`, at most 24 months) | 200 `{ report: { from, to, currency, months, categories } }` | 400                        |

- `months` has every month of the range (zeros when empty): `expenses` and `income` count shared transactions and the caller's own private ones (like the month summary); `yourExpenses` and `yourIncome` count the caller's part (all of a private one, their share of a shared one).
- `categories` has one row per month and category (`categoryId: null` for none) with spending: `expenses` and `yourExpenses` as above. One grouped query; month totals are summed from its rows.
- Setting an amount from a month keeps earlier months as they were; a later change made before (say from December) still wins from its own month.

Recurring payments. Also under a household. A shared series belongs to the household (every member sees and edits it); a private one to its creator, and nobody else can see, change or address it (404). Writes are limited to 30 per user and 15 minutes, previews to 60.

| Method and path                                          | Who                    | Request                                                                                           | Success                                                           | Errors (besides the above)                                                |
| -------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `GET /api/households/:id/recurring`                      | member                 |                                                                                                   | 200 `{ recurring: { currency, series, suggestions, dismissed } }` |                                                                           |
| `POST /api/households/:id/recurring`                     | member                 | `{ name, pattern, cadence, amount, amountVaries, anchorOn, startsOn, categoryId, scope, remind }` | 201 `{ series }`                                                  | 400 `INVALID_CATEGORY`, 409 `SERIES_PATTERN_TAKEN`, 409 `RECURRING_LIMIT` |
| `POST /api/households/:id/recurring/preview`             | member                 | `{ pattern, amount, amountVaries, scope, startsOn }`                                              | 200 `{ matches, recent }` (the latest three)                      |                                                                           |
| `POST /api/households/:id/recurring/suggestions/confirm` | member                 | `{ scope, key }`                                                                                  | 201 `{ series }`                                                  | 404 `SUGGESTION_NOT_FOUND`                                                |
| `POST /api/households/:id/recurring/suggestions/dismiss` | member                 | `{ scope, key }`                                                                                  | 204                                                               | 404 `SUGGESTION_NOT_FOUND`                                                |
| `PATCH /api/households/:id/recurring/:seriesId`          | member; private: owner | any field of the create body except `scope`                                                       | 200 `{ series }`                                                  | 404 `SERIES_NOT_FOUND`, 400, 409                                          |
| `DELETE /api/households/:id/recurring/:seriesId`         | member; private: owner |                                                                                                   | 204                                                               | 404 `SERIES_NOT_FOUND`                                                    |

- Nothing about payments is stored: every read takes the caller's visible expenses of the last 400 days (at most 20 000) and matches them (shared series first, then the caller's private ones, see hard part 34), then looks for suggestions in what no series' text covers, minus dismissed keys. A series in the list carries its latest 12 payments (`imported` or typed in), `paymentCount`, `lastPaidOn`, `latestAmount`, `previousAmount`, the caller's `share` of the latest payment (null for a private payment) and `monthlyAmount`; series come soonest next payment first, suggestions most expensive per month first (at most 100).
- "Today" for detection (a rhythm that stopped is no suggestion) is Budapest's (`lib/today.ts`); the web computes due dates and states from the browser's date with the shared helpers.
- Adding a series whose text was dismissed replaces the dismissal. Confirming takes the suggestion's latest payment as the anchor, its description as the name and its key as the pattern, and the category if it is still active.
- `DELETE` archives a series that has payments ("Stop tracking", the text is free again), deletes one that never matched anything, and deletes a dismissal ("Show again").
- A suggestion is addressed by `{ scope, key }`; `private` always means the caller's own, so another person's private rhythm cannot be confirmed, dismissed or even probed.

Imports. Also under a household. They are personal: a person sees and undoes only their own, and fingerprints are per person (the same bank row imported by someone else is theirs).

| Method and path                                | Who          | Request                                                                    | Success                                                   | Errors (besides the above)                                                        |
| ---------------------------------------------- | ------------ | -------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `POST /api/households/:id/imports/check`       | member       | `{ rows: [{ fingerprint, occurredOn, kind, amount }] }` (max 1000)         | 200 `{ rows: [{ fingerprint, status, match }] }`          | 400                                                                               |
| `POST /api/households/:id/imports`             | member       | `{ source, fileName, rows: [{ fingerprint, counterparty, transaction }] }` | 201 `{ batch, skipped }`                                  | 400 (names the row: `Row 3: ...`), 409 `NOTHING_TO_IMPORT`, 409 `IMPORT_CONFLICT` |
| `GET /api/households/:id/imports`              | member       |                                                                            | 200 `{ batches }`, own, newest first (50)                 |                                                                                   |
| `DELETE /api/households/:id/imports/:importId` | the importer |                                                                            | 204, its live transactions soft deleted (no-op if undone) | 404 `IMPORT_NOT_FOUND` (also someone else's)                                      |

- `check` is a read with a body, so a `POST`. Statuses: `new`, `imported` (the caller has it), `undone` (its import was undone: import again), `deleted` (deleted on its own: probably not wanted), `possible-duplicate` (a hand-entered transaction the caller paid, same kind and amount, within two days; each one matches a single row, the closest).
- `transaction` in an import row is the ordinary transaction input, created through the same `insertTransaction` as `POST /transactions` (category and member rules, splits, audit entry) with the batch, fingerprint and counterparty attached. Rows the caller already has are skipped and counted; any refused row fails the whole import.
- Two imports of the same rows at once: the unique index makes the second one fail with 409 `IMPORT_CONFLICT`, and the client checks again.

Balances and settlements. Also under a household; every member sees all of them (they come only from shared transactions, which everyone sees).

| Method and path                                              | Who                                          | Request                                             | Success                                     | Errors (besides the above)                     |
| ------------------------------------------------------------ | -------------------------------------------- | --------------------------------------------------- | ------------------------------------------- | ---------------------------------------------- |
| `GET /api/households/:id/balances`                           | member                                       |                                                     | 200 `{ balances: { currency, debts } }`     |                                                |
| `GET /api/households/:id/settlements`                        | member                                       | query: `cursor, limit`                              | 200 `{ settlements, nextCursor }`           | 400 (bad cursor)                               |
| `POST /api/households/:id/settlements`                       | one of the two people, or an owner           | `{ fromUserId, toUserId, amount, settledOn, note }` | 201 `{ settlement }`                        | 400 `VALIDATION_ERROR`, `INVALID_MEMBER`; 403  |
| `DELETE /api/households/:id/settlements/:settlementId`       | the two people, who recorded it, or an owner |                                                     | 204, soft deleted                           | 404 `SETTLEMENT_NOT_FOUND` (also deleted), 403 |
| `POST /api/households/:id/settlements/:settlementId/restore` | same                                         |                                                     | 200 `{ settlement }` (no-op if not deleted) | 404, 403                                       |

- A debt is `{ from, to, amount }`: `from` owes `to`, both `{ userId, displayName }`. Debts are per pair, netted within the pair and never simplified across pairs (see [data-model.md](data-model.md#balances-derived-not-a-table)). People who left appear while a debt with them is open.
- `ledger.ts` computes them: one grouped query over shares (debtor and creditor swap for income), one over settlements (the receiver owes the amount back), then `netDebts()` from the shared package. It lives apart from the balances service so the households service can use it without an import cycle.
- A settlement is any amount: partial payments leave the rest open, paying too much flips the debt. Settlements are never edited (delete and record again). `fromUserId` and `toUserId` must have been members at some point, so a debt with someone who left stays settleable.
- Leaving, removing a member and archiving call `assertSettled()` after `lockHousehold()` (see hard part 24).
- Settlement writes take the same shared household lock as transaction writes and are audited (`audit_log.entity = 'settlement'`).

Demo. Mounted only on the demo instance (`DEMO_MODE`); production has no such routes (404). There, registering and accepting an invite answer 403 `DEMO_MODE`: visitors start with "Try the demo", and sandboxes never share a household.

| Method and path    | Who                     | Request | Success                                                                              | Errors                                     |
| ------------------ | ----------------------- | ------- | ------------------------------------------------------------------------------------ | ------------------------------------------ |
| `POST /api/demo`   | anyone, 5 / 15 min / IP |         | 201 `{ accessToken, user, householdId, expiresAt }` + refresh cookie                 | 429, 503 `DEMO_CAPACITY` (too many active) |
| `GET /api/demo`    | signed in               |         | 200 `{ demo: { expiresAt } }`                                                        | 404 `DEMO_NOT_FOUND` (not a demo account)  |
| `DELETE /api/demo` | signed in, 20 / 15 min  |         | 204, the sandbox deleted for good, refresh cookie cleared ("Start over", "End demo") | 404 `DEMO_NOT_FOUND`                       |

- A sandbox is two accounts (the visitor, John Doe, and the partner, Jane Doe) with `demo-<uuid>@demo.invalid` emails (a reserved domain) and the hash of a random password that is thrown away: nobody can log in to them; the visitor gets a session directly.
- `seedDemo` builds the household from the demo story (`packages/shared/src/demo`, seed and day stored in `demos`) only through the services the routes use: create the household, an invite the partner accepts, rules and budgets, then each person's monthly bank exports through `parseStatement` and `createImport` (own transfers, cash and payments between them left out, as the review would), hand-entered transactions and settlements. About 60 small database transactions, a second or two.
- The cap counts unexpired sandboxes inside a transaction holding an advisory lock (`pg_advisory_xact_lock`), so parallel requests cannot pass it together. If seeding fails, the sandbox is deleted and the request fails with 500.
- `deleteDemo` removes a sandbox for good (see hard part 26). On the demo instance, `startDemoCleanup` (started in `index.ts`) runs `deleteExpiredDemos` at boot and every hour: up to 100 expired sandboxes per run, each in its own transaction, under a session-level advisory lock (`pg_try_advisory_lock` on one pooled connection), so two API instances never clean up together and a run that finds the lock taken does nothing. Runs never overlap, a failed run is logged and retried on the next tick. It moves to a BullMQ repeatable job in Phase 6; the function stays.
- `pnpm --filter @splinance/api demo:create [--seed] [--today] [--days]` makes a sandbox on the configured database without signing anyone in (for example a long-lived showcase household for the data track, `--days 3650`) and prints its seed and day, which `demo:bank-files` turns into the same bank files. Like everything else in `demos`, it refuses to run on a database whose name does not end in `_demo` or `_test`.

`household` is `{ id, name, baseCurrency, role, createdAt }` where `role` is the caller's role; members are `{ userId, displayName, role, joinedAt }` (no emails). The raw invite token appears only in the create response; the web app builds the link (and later a QR code) from it.

The refresh cookie: name `refresh_token`, `HttpOnly`, `SameSite=Strict`, `Path=/api/auth` (never sent to other endpoints), `Secure` when `COOKIE_SECURE` is true (default in production), expires with the session (30 days, sliding).

Environment (`apps/api/src/config/env.ts`, validated with Zod at startup, the process exits on invalid config):

| Variable                   | Default            | Notes                                                                |
| -------------------------- | ------------------ | -------------------------------------------------------------------- |
| `NODE_ENV`                 | development        | development, test, production                                        |
| `PORT`                     | 3000               |                                                                      |
| `LOG_LEVEL`                | info               | pino levels plus `silent`                                            |
| `DATABASE_URL`             | required           | must be a `postgres://` URL                                          |
| `JWT_ACCESS_SECRET`        | required           | at least 32 characters (HS256 key)                                   |
| `ACCESS_TOKEN_TTL_SECONDS` | 900                |                                                                      |
| `REFRESH_TOKEN_TTL_DAYS`   | 30                 |                                                                      |
| `COOKIE_SECURE`            | true in production | must be false for local http                                         |
| `RATE_LIMIT_DISABLED`      | false              | e2e only; refused in production                                      |
| `DEMO_MODE`                | false              | demo instance only; refused unless the database name ends in `_demo` |
| `DEMO_TTL_DAYS`            | 7                  | days until a sandbox is deleted (1-30)                               |
| `DEMO_MAX_ACTIVE`          | 200                | unexpired sandboxes at once                                          |

Notifications (the bell). The person's own, across their households; household settings for one household.

| Method and path                                 | Who                     | Request                                | Success                                                 | Errors   |
| ----------------------------------------------- | ----------------------- | -------------------------------------- | ------------------------------------------------------- | -------- |
| `GET /api/notifications`                        | signed in               |                                        | 200 `{ notifications, unread }` (newest 50)             |          |
| `GET /api/notifications/unread-count`           | signed in               |                                        | 200 `{ unread }` (the badge, polled)                    |          |
| `POST /api/notifications/read`                  | signed in, 120 / 15 min | `{ ids }` (max 100) or `{ all: true }` | 204 (only the caller's rows)                            | 400      |
| `GET /api/households/:id/notification-settings` | member                  |                                        | 200 `{ settings: { activity } }`                        | 404      |
| `PUT /api/households/:id/notification-settings` | member, 30 / 15 min     | `{ activity }`                         | 200 `{ settings }`; off also marks unread activity read | 400, 404 |

- Two families. **State** (`renewal_due` 3 days before a series with reminders on is due, `renewal_missed` once it is past the grace window, `price_changed` for a payment in the last 30 days that differs by over 2%, `budget_near` from 80%, `budget_over` past 100% of a household budget): `syncNotifications(householdId)` (`modules/notifications/sync.ts`) computes what should exist for every active member (series through `seriesForMember`, the same matching as the page, so a private series only ever reaches its owner), inserts what is missing (`ON CONFLICT DO NOTHING` on `(user_id, dedupe_key)`, for example `renewal_due:<series>:<date>`) and marks resolved what no longer holds (a payment arrived, a new month); a price change never resolves. It runs after the writes that change what is due (transactions, imports, recurring payments, budgets: awaited after the write committed, a failure logged and never failing the request) and in an hourly sweep.
- **Activity** (`tx_added`, `tx_changed`, `tx_deleted`, `import_added`, `settlement_recorded`): written by `recordTransactionActivity` and `recordSettlementActivity`, called from the two audit hooks, in the same database transaction as the change. Each other person in the transaction (their share, or as payer) hears about an add, delete or restore, and about an edit only when their share or the payer changed; private transactions notify nobody, and a shared one made private deletes the others' unread items about it. An unread item about the same subject folds the next change in (a partial unique index on `(user_id, subject_id)` over unread activity rows): an unread "added" stays "added" with the new share, an unread "changed" keeps the share it started from. Imports run their rows inside `collectingActivity` and write one item per person (count and share total); the undo folds into it. `withoutActivity` writes none (the demo seeder's history). Members can turn activity off per household (`household_members.notify_activity`).
- Rows hold ids and numbers only; the list joins the current names through the usual visibility (a series only if shared or the reader's, a transaction only if shared or the reader's, a household the reader is still an active member of), and drops a row whose subject is gone. Leaving or being removed deletes the person's rows in that household; account deletion deletes all of theirs. The maintenance job deletes rows read over 90 days ago and any older than 180.
- Jobs: decided against Redis and BullMQ for now (one API instance per host, idempotent work, no email yet); the hourly sweep is `startPeriodic` + `withAdvisoryLock` like the other two jobs. Triggers to revisit, in order: sending email (retries, at-most-once delivery against a provider), a second API instance (shared rate limits), or syncs too slow for a request. Then a queue in the existing Postgres (pg-boss: no new service, its state backed up with the rest) comes before Redis.

## 5. Database and migrations

- Postgres 18 in Docker. Docker Compose mounts the volume at `/var/lib/postgresql` (Postgres 18 stores data in a versioned subdirectory; the old `/data` mount path silently loses data).
- Drizzle ORM 0.45 with node-postgres. `db` is created in `src/db/client.ts` with `casing: 'snake_case'` (TypeScript `createdAt` maps to column `created_at`).
- The pool has an `error` listener: without it, an error on an idle connection (for example Postgres restarting) emits an unhandled `error` event and crashes Node.
- Services accept `Db` (`typeof db | Tx`), so the same function works inside or outside a transaction.

Migrations:

```
schema/*.ts --(db:generate)--> drizzle/NNNN_name.sql + meta snapshot + journal   (committed, reviewed)
drizzle/*  --(db:migrate)----> applied in a transaction, recorded in drizzle.__drizzle_migrations
```

- Never `drizzle-kit push` (no history, can drop data).
- The app has its own migrator (`src/db/migrator.ts`) instead of `drizzle-kit migrate`, because drizzle-kit is a dev dependency. tsdown bundles it to `dist/migrate.mjs` for deploys.
- Tests call `runMigrations` in Vitest global setup against `splinance_test`.
- What Drizzle cannot express (triggers, views, roles) goes into a custom migration: `pnpm --filter @splinance/api db:generate --custom --name <name>` writes an empty SQL file and its journal entry; the snapshot does not change, so later generated migrations never try to drop what it made. Examples: `0006` (split-sum triggers), `0013` (the `analytics` views and their read-only role, see [data-model.md](data-model.md#analytics-schema-views-for-the-data-track)).

Table design, conventions (uuidv7 ids, money as integer minor units, `date` for calendar dates, composite foreign keys for household isolation) and planned tables are in [data-model.md](data-model.md).

## 6. Authentication in depth

### Tokens

|                       | Access token                                                                     | Refresh token                            |
| --------------------- | -------------------------------------------------------------------------------- | ---------------------------------------- |
| Format                | JWT, HS256 (`jose`)                                                              | 256 random bits, base64url               |
| Claims                | `sub` user id, `sid` session id, `iss` splinance-api, `aud` splinance-web, `exp` | none (opaque)                            |
| Lifetime              | 15 minutes                                                                       | 30 days, extended on every rotation      |
| Stored on the server  | no (stateless)                                                                   | only its SHA-256 hash, in `sessions`     |
| Stored in the browser | memory only (`authStore`)                                                        | httpOnly cookie, invisible to JavaScript |

Why two tokens: the access token is cheap to verify on every request (no database hit) but cannot be revoked, so it is short-lived. The refresh token is revocable (database row) and long-lived, and JavaScript can never read it, so XSS cannot steal it.

Passwords use Argon2id via `@node-rs/argon2` (m=19456 KiB, t=2, p=1, the OWASP minimum). The `argon2` npm package segfaults on this Windows setup, which is why the napi-rs build is used. Refresh tokens use plain SHA-256: they are random 256-bit values, so a slow hash adds nothing.

### Register and login

- Register: first the registration policy (`REGISTRATION`: `open` in development and tests, `allowlist` on production with `REGISTRATION_ALLOWLIST`, `closed`; unset means `closed` when `NODE_ENV=production`, so a forgotten variable never opens sign-ups). Anyone else gets 403 `REGISTRATION_CLOSED`, which the form shows on the email field. Then hash the password, and in one database transaction insert the user and create the session. A unique-constraint violation on `users_email_unique` becomes 409 `EMAIL_TAKEN` (`isUniqueViolation` checks the error and its `cause`, because Drizzle wraps driver errors).
- Login: if the email does not exist, the service still runs an Argon2 verification against a dummy hash before answering, so response time does not reveal which emails are registered. Wrong password and unknown email return the identical 401 body.
- Only failed login attempts count against the rate limit (`skipSuccessfulRequests`).
- `RATE_LIMIT_DISABLED=true` turns every limiter into a no-op. Only the e2e suite sets it (it registers dozens of users from one IP, against a limit of 5 per 15 minutes); env validation refuses it when `NODE_ENV=production`.

### Sign in with a provider (Google)

OpenID Connect authorization code flow with PKCE (S256), state and nonce, through `openid-client` v6. Configured per provider by env (`OAUTH_GOOGLE_CLIENT_ID`, `_SECRET`, optional `_ISSUER`) plus `APP_ORIGIN`; without them `GET /api/auth/providers` lists nothing and no OAuth route exists. Never on the demo instance (env validation refuses the variables there, and the router is not mounted).

```
browser -> GET /api/auth/oauth/google/start?redirect=/h/..     (a plain link, top-level navigation)
        <- 303 to Google + Set-Cookie flow (state, nonce, PKCE verifier, destination; encrypted, Lax, 10 min)
browser -> Google: account chooser, consent
        <- 302 to https://splinance.com/api/auth/oauth/google/callback?code&state   (cross-site GET)
api: clear the flow cookie, compare state, exchange code + verifier, validate the ID token, resolve the account
        <- 303 /login?redirect=/h/..  + Set-Cookie refresh_token (as after a password login)
browser: boot -> POST /api/auth/refresh -> signed in -> the _auth guard forwards to the destination
```

- **Callback on the API, redirect URI from `APP_ORIGIN`** (never the `Host` header, which a client controls). The code never reaches the SPA, and no token ever appears in a URL: the session cookie is set on the callback's redirect and the web's normal boot refresh picks it up.
- **Two cookies, no table** (`oauth/cookies.ts`): the flow cookie (`__Host-splinance_oauth`, SameSite=Lax because the callback is a cross-site top-level GET; it only counts together with a matching `state`) and the link cookie (`__Host-splinance_oauth_link`, Strict). Both are JWEs (`dir`, A256GCM) with keys derived from `JWT_ACCESS_SECRET` by HKDF, one per purpose; single use, 10 minutes. `__Host-` stops a sibling host (demo.splinance.com) from planting a value; local http drops the prefix.
- **ID token checks**: `openid-client` validates iss, aud, azp, exp, iat and nonce, and with `enableNonRepudiationChecks` also the signature against the provider's JWKS (by default it would trust TLS for tokens from the token endpoint). Then our own: `sub` 1-255 characters, a valid email, `email_verified === true` exactly. Discovery runs on first use and is cached; a failed discovery is not cached, so a provider outage never blocks boot and the next sign-in retries.
- **Resolution** (`oauth.service.ts`, one transaction, one lookup statement for both the identity and the email, hard part 36): a known `(provider, sub)` signs in (even when registration is closed, like password login; the email the provider reports is ignored, the account keeps its own). Otherwise an account with that email gets a link prompt (below). Otherwise the registration policy decides on the verified email (`not_allowed`), and a new user without a password is created with the identity and the session; the display name is the provider's `name` (at most 50 code points) or the email's local part. A unique violation (two sign-ins at once, or a password registration racing) retries once and takes the path for what exists then.
- **Linking needs the password.** Linking by email alone would hand an account to whoever controls the provider-side email (a Workspace admin, an expired domain re-registered, a breached mailbox) or, because password sign-ups have no email verification, to whoever registered the address first. So the callback sets the link cookie and sends the browser to `/login?oauth=link`; `GET /api/auth/oauth/link` tells the page which email; the next successful `POST /api/auth/login` for that email inserts the identity in the same transaction as the session and answers `linkedProvider`. A wrong password links nothing; another account's login ignores the cookie. Providers whose email claim is not verified get `linkByEmail: false` (`conflict`), as do accounts without a password or with another identity of the provider.
- **Errors** end on `/login?oauth_error=` with a code from the shared `OAUTH_ERROR_CODES`: `cancelled` (access_denied), `not_allowed`, `email_unverified`, `expired` (no, tampered or old flow cookie, or a state mismatch; a newer flow in another tab looks the same), `conflict`, `unavailable` (discovery failed), `failed` (anything else, including a rejected ID token). The log line has the provider and the reason, never the code, tokens, email or the library's error body.
- **Password login** for an account without a password runs the dummy Argon2 verification and answers `INVALID_CREDENTIALS`, like an unknown email.
- **Another provider** is an entry in `providersFromEnv` plus its env variables and a web button: OIDC providers reuse `createOidcProvider`; GitHub (plain OAuth 2: `/user/emails` for the verified address) and Apple (`form_post`, so a `SameSite=None` flow cookie, and a short-lived ES256 JWT as client secret) need adapters behind the same `OAuthProvider` interface. `user_identities.provider` is text, so no migration.

### Account settings and step-up

`/account` (section 9) manages the profile and the ways into the account; the API is `modules/account`.

- **Step-up for anything that adds or removes a way in** (`requireRecentAuth`): an account with a password confirms with its current password every time; one without must have signed in within 10 minutes (`RECENT_SIGN_IN_MS`, measured from `sessions.created_at`, which refresh never moves), else 403 `REAUTH_REQUIRED`. Without it, a stolen access token (15 minutes) could set a password and keep the account. The caller's session must also still be active (an access token outlives a logout), else 401.
- **A wrong current password is 400 `WRONG_PASSWORD`**, never 401: the web client answers every 401 with a refresh and a retry. Failed attempts count against a per-user limit (10 per 15 minutes) and log `account.step_up_failed` at warn.
- **Changing the password signs out every other session** (`revoked_at`), in the same transaction; the caller's stays. Their access tokens expire within 15 minutes. "Sign out other devices" does the same without a password change.
- **The user row is locked first** (`lockUser`, `SELECT ... FOR UPDATE`) by every change to how a user signs in, so a later "is there another way in?" check (disconnecting a provider) cannot interleave with another change.
- The new password goes through the shared rules with the account's own email and name from the database (`requiredPasswordIssues`, the same function registration uses), not the client's copy.
- Log lines carry `event` (`account.password_changed`, `account.password_set`, `account.sessions_revoked`, `account.identity_connected`, `account.identity_disconnected`, `account.reauthenticated`) and the user id (plus the provider), never an email, a name or a password.
- **Connect a provider while signed in.** The public start link cannot know who is signed in (no Bearer on a navigation), and a GET authorized by the refresh cookie would be ambient (demo.splinance.com is the same site, so SameSite=Strict does not separate it). So account settings call `POST /api/account/identities/:provider/connect` with the Bearer token and the step-up; the response sets the usual flow cookie with `intent: 'connect'`, `userId` and `sessionId`, and returns the provider URL, which the web opens with `location.assign`. The flow cookie is a Zod discriminated union on `intent` (`signin` from the public link, `connect` and `reauth` only from these POSTs), so a sign-in link can never connect anything.
- **The callback binds to the session that started it** (`connectIdentity`, under `lockUser`): that session must still be active and the user's (logged out or signed out by a password change meanwhile: `expired`). Then `(provider, sub)` already this user's: done (idempotent); another user's: `taken`; the user already has another account of the provider: `conflict`; else the identity is inserted. No new session; the browser lands on `/account?connected=<id>` and its normal boot refresh restores the session. Errors land on `/account?oauth_error=<code>`. The provider account's email may differ from the Splinance one (matching is by `sub`).
- **Re-authentication** (accounts without a password, once the 10 minutes are over): `POST .../reauth` starts a flow with `intent: 'reauth'` and a same-app destination. The callback requires the connected provider account (another one: `wrong_account`, no session), revokes the starting session, creates a fresh one (its `created_at` is now) and redirects to the destination (`/account/password`).
- **Disconnect** (`disconnectIdentity`): under `lockUser`, refused with 409 `LAST_SIGN_IN_METHOD` when the account has no password and no other identity; then the step-up, the delete and every other session revoked (some may have signed in through that provider). The web shows the explanation instead of the button.
- Display names change with `PATCH /api/account`; the email is read-only (changing it needs verification mail, which nothing sends yet). The demo closes every write: its people keep the story's names (the data track shows demo display names by the provenance rule).

### Account deletion

Self-service (GDPR Art. 17) in `modules/account/deletion.service.ts`. The user row cannot simply go: nine tables reference `household_members (household_id, user_id)` through composite foreign keys (transactions, splits, settlements, budgets, rules, imports, invites, the audit log), and the partner's history and balances must stay correct. So the row is anonymized and everything only the person could see is erased.

| Data                                                     | What happens                                                                                                                                  |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `users` row                                              | stays: `display_name` "Former member", `email` `deleted-<id>@deleted.invalid` (the real address is free again), no password, `deleted_at` set |
| identities, sessions                                     | deleted                                                                                                                                       |
| households nobody else was ever in                       | deleted whole (`deleteHouseholdContents`, the code `deleteDemo` uses)                                                                         |
| households with other members                            | membership ended (as leaving), pending invites revoked; shared entries stay under "Former member"                                             |
| households only former members were in besides them      | membership ended, archived                                                                                                                    |
| private transactions (only their author could read them) | hard deleted with their audit rows (which hold copies)                                                                                        |
| import batches they made                                 | file name cleared (rows stay, shared transactions reference them)                                                                             |
| personal budgets                                         | deleted                                                                                                                                       |

- **Preview first** (`GET /api/account/deletion`): the dialog lists exactly this, and the blockers: an open balance with anyone (`UNSETTLED_BALANCE`) or being the only owner of a household that still has other members (`LAST_OWNER`). A blocked deletion shows only the way to resolve it, never a form.
- **The delete** (`POST /api/account/delete`): `lockUser`, the session still active, the email typed again (`CONFIRMATION_MISMATCH`), the step-up, then every household of the user locked in id order and the plan computed again under those locks, so a new expense naming them cannot slip in (hard part 33). Refused as a whole while a blocker exists. Logs `account.deleted` with the user id and counts.
- **A still-valid access token** (up to 15 minutes) finds its sessions gone (401 on the account routes and `/api/me`), its memberships ended (404), and `POST /api/households` and invite accept refuse a deleted user (`assertLiveUser`).
- **Backups** keep the data up to 13 months; a restore brings deleted accounts back, so the restore runbook repeats every `account.deleted` made after the backup's date with `account:erase` (deploy.md 5), the same erasure without the step-up and blockers.

### Refresh rotation (the core of the design)

One `sessions` row per login. The current token's hash is in `token_hash`; after rotation the old hash moves to `previous_token_hash`.

```
POST /auth/refresh with cookie token T
  hash(T) matches token_hash?            -> rotate: new token N, token_hash = hash(N),
                                            previous_token_hash = hash(T), rotated_at = now,
                                            Set-Cookie N
  hash(T) matches previous_token_hash
     and now - rotated_at <= 10 s?       -> grace: new access token, NO new cookie
     and later?                          -> reuse detected: revoke the session, 401
  no match / revoked / expired           -> 401
```

Why the grace window: browser tabs share one cookie jar. If two tabs refresh at the same moment, both send token T; the first rotates to N and the browser stores N. The second request still carries T. Without the grace window that looks exactly like token theft and would log the user out everywhere. Within the window the second tab simply gets an access token, and the browser keeps the newer cookie.

Why reuse revokes the session: if an attacker stole T and the real user already rotated past it, T coming back later means someone else holds it. Revoking the session forces both parties to log in again, which locks the attacker out.

Concurrency: the lookup uses `SELECT ... FOR UPDATE`, so two simultaneous refreshes with the same token are serialized. Exactly one rotates; the other waits, then lands in the grace branch. A test fires two refreshes in parallel and asserts exactly one new cookie.

Accepted tradeoff of the single-table design: a token stolen two or more rotations ago matches nothing, so it is rejected but does not trigger a revoke.

### Household authorization

Authorization lives in the services, in one helper: `requireMembership(executor, { userId, householdId, role? })` joins `household_members` with `households`, requires `left_at IS NULL` and `archived_at IS NULL`, and throws 404 when nothing matches, 403 when `role: 'owner'` is required and the caller is a member. Routes only parse ids (a malformed uuid is a 404, never a 400 or a Postgres cast error).

Why 404 and not 403 for non-members: household ids are not secret but should not be confirmable. A former member or a stranger gets exactly the same answer as for an id that never existed.

Membership changes (role change, removal, leave, accepting an invite, creating or revoking invites, archiving) run in a transaction that first calls `lockHousehold()`: `SELECT ... FROM households WHERE id = $1 FOR UPDATE`. That serializes them per household, so the "at least one owner" check and the write cannot interleave (see the hard parts).

### requireAuth

Reads `Authorization: Bearer`, verifies the JWT (algorithm pinned to HS256, issuer and audience checked) and sets `req.auth = { userId, sessionId }`. Handlers read it with `getAuth(req)`, which throws if a route forgot the middleware. It does not hit the database, so a logged-out session's access token works until it expires (at most 15 minutes).

## 7. Shared package

| Module              | Contents                                                                                                                             | Used by                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `api-error.ts`      | `apiErrorResponseSchema`                                                                                                             | API error handler (types), web HTTP client (parsing)        |
| `health.ts`         | live/ready response schemas                                                                                                          | API health routes                                           |
| `auth.ts`           | `emailSchema` (trims, lowercases), `registerInputSchema`, `loginInputSchema`, `userSchema`, `authResponseSchema`, `meResponseSchema` | API route parsing, web forms and API client                 |
| `password/rules.ts` | `PASSWORD_RULES`, `checkPassword()`                                                                                                  | register schema (server enforcement) and the live checklist |
| `brand.ts`          | palette, logo pairings, `pairingFor(id)`, `contrastRatio()`, `readableTextOn()`                                                      | web brand components, a contrast test                       |
| `households.ts`     | `HOUSEHOLD_ROLES`, `CURRENCIES` (also the Postgres enums), household/member input and response schemas                               | API routes and Drizzle enums, web (next PR)                 |
| `invites.ts`        | `INVITE_TTL_DAYS`, `inviteTokenSchema`, create/list/preview response schemas                                                         | API routes, web (next PR)                                   |
| `money.ts`          | `CURRENCY_EXPONENTS`, `MAX_AMOUNT_MINOR`, `amountMinorSchema` (positive integer minor units)                                         | transaction schemas, amount formatting                      |
| `splits.ts`         | `SPLIT_METHODS`, `allocate()` (largest remainder), `computeSplits()`, `splitProblem()`, `splitRemainder()`                           | API (authoritative shares), web (live preview in the form)  |
| `categories.ts`     | `CATEGORY_KINDS` (Postgres enum), `CATEGORY_ICONS` (lucide names), colors (brand keys), schemas, `DEFAULT_CATEGORIES`                | API routes and seeding, web pickers                         |
| `balances.ts`       | `netDebts()` (pairwise netting), balance and settlement schemas                                                                      | API ledger and routes, web (next PR)                        |
| `rules.ts`          | `matchKey()`, `ruleMatches()`, `firstMatchingRule()`, rule schemas                                                                   | API (uniqueness, applying), web import review (next PR)     |
| `budgets.ts`        | budget schemas, `budgetUsage()`, `BUDGET_WARNING_RATIO`                                                                              | API, web budgets (next PR)                                  |
| `reports.ts`        | report schemas, `addMonths()`, `monthsBetween()`, `REPORT_MAX_MONTHS`                                                                | API reports, web reports                                    |
| `recurring/`        | `recurringKey()`, `suggestRecurringPattern()`, `assignPayments()`, `detectRecurring()`, `nextDueOn()`, `seriesTiming()`, schemas     | API recurring (next PR), web recurring page, demo tests     |
| `imports/`          | `parseStatement()` (Revolut CSV, K&H transaction history CSV), `StatementRow`, flags, fingerprints, `nameKey()`                      | web import page (next PRs), parser tests                    |
| `demo/`             | `buildDemoStory()` (a seeded year of a household), `renderDemoBankFiles()` (its monthly bank exports), `demoBalance()`               | demo seeder (next PR), `demo:bank-files` CLI, data track    |

Split math: `allocate(total, weights)` gives everyone the floor of their exact share, then hands the units lost to rounding to the largest fractional parts, earlier positions first on ties. Shares therefore always sum to the total and never differ from the exact share by a whole unit. It computes `total * weight` with BigInt, because 10^12 minor units times 10 000 basis points passes 2^53. Equal splits are weights of 1, percentages are basis points (100% = 10 000), fixed splits must already sum to the total. The order of people decides who gets a leftover unit, so callers pass a stable order.

Bank imports (`imports/`): the browser reads the export, so the file never leaves the person's device; the API will only get normalized rows. `parseStatement()` recognizes the bank by its header and returns rows with the purchase date (not the booking date), a positive amount in minor units, a starting description, the counterparty as the bank named it, and flags:

| Flag              | Seen as                                                                                                                                                                            | Default                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `pending`         | K&H card holds (`foglalás`, no usable id), Revolut rows not completed                                                                                                              | never imported (the booked row comes later) |
| `own-transfer`    | Revolut top-ups from an own card (`*1234`), transfers from or to the account holder or `ownNames` (`nameKey()` ignores word order, case and accents), K&H card payments to Revolut | left out                                    |
| `cash-withdrawal` | ATM withdrawals                                                                                                                                                                    | left out                                    |
| `other-currency`  | a currency other than the household's                                                                                                                                              | left out until multi-currency               |
| `bank-fee`        | K&H fee rows, named after the transfer they belong to (`Tranz.ref.`)                                                                                                               | imported                                    |
| `rounded`         | HUF with fillér (Revolut), rounded half away from zero                                                                                                                             | imported                                    |

Fingerprints identify a row across exports of the same account: the bank's transaction id for K&H; for Revolut, which has none, the product, start time to the second, amount and description, plus a counter for exact repeats in one file. Amounts are read as text (`decimalToMinor`), never through floats. Revolut fees are added to the amount; cancelled Revolut rows are dropped. The test fixtures are hand-made in the banks' layouts; real exports contain names and account numbers and are never committed.

Demo story (`demo/`): one deterministic source for the demo household and its bank files. `buildDemoStory({ seed, today })` returns the 12 months up to `today` of a couple in Budapest (John Doe, the visitor, banks with Revolut; Jane Doe, the partner, with K&H): rent with a 60/40 split, bills, subscriptions, salaries, groceries and meals on random days, a trip with a fixed split, cash, quarterly settle-ups, plus rules and budgets. People are roles (`you`, `partner`), not user ids. A seeded generator (`createRandom`, mulberry32, one stream per month) varies amounts, days and shops; the storyline stays fixed, and the same seed and day always give the same story. Every bank movement is a `DemoBankRow` that points at what it is in the app: an imported transaction, a settlement (recorded by hand, left out of the import) or nothing (own transfers, cash withdrawals). `renderDemoBankFiles()` writes them as the banks export them, one file per person and month, and a test reads every file back through `parseStatement` and checks dates, amounts, flags and counterparties, so the demo seeder can import the files exactly like a person would and the data track gets the same files. The current month always holds something, never anything after `today`, and its eating-out spending sits between 85% and 93% of the budget, so the overview's budget alert shows on any day.

Recurring payments (`recurring/`, Phase 6): a series matches its payments like a rule matches transactions: its pattern appears in the counterparty or the description (`matchKey`, contains), same kind, on or after its start, and in scope (a shared series sees only shared transactions; a private one what its owner sees). `seriesPayments()` walks back from the newest covered transaction and keeps each one within 25% of the one after it (60% for "amount varies"), the newest within 25% of the expected amount, so a price rise carries the series while a one-off purchase at the same shop does not join. `assignPayments()` gives each transaction to at most one series (longest pattern first) and returns what no series' text covers; `detectRecurring()` looks for suggestions only there: transactions grouped by `recurringKey()` (the counterparty without branch and card numbers or a web shop suffix, else the description) and scope (never shared with private, never two people's private), a trailing run in a weekly (6-8 days), monthly (26-35), quarterly (85-97) or yearly (350-380) rhythm with one missed payment allowed and each amount within 25% of the next, at least 4 weekly, 3 monthly or quarterly, 2 yearly payments, and not stopped (the next payment not past the grace window). Dates: `occurrence()` keeps the anchor's day of month (31st, 28 February, 31 March), `nextDueOn()` follows the latest payment (or a date the person entered), `seriesTiming()` says `lapsed`, `due`, `soon` (within 7 days) or `later`. `recurringKey()` and `suggestRecurringPattern()` end up stored as patterns, so their outputs are pinned by tests: changing one needs a data migration. The demo story has the cases: rent, Netflix (with a price rise three months ago), Spotify, internet, gas and electricity (varying, found in some years), each person's private BKK pass, the visitor's private phone plan, the partner's bank fee and a shared gym membership that stopped four months ago.

Password policy: required rules (10+ characters, does not contain the email local part or display name, not in the common list) block registration and are enforced by the API through `registerInputSchema.superRefine`. Composition rules (lowercase, uppercase, number) are only hints in the UI, following NIST SP 800-63B, which advises against mandatory composition rules. The login schema deliberately has no policy, so existing passwords keep working if rules change.

## 8. Web: boot sequence

What happens between opening the URL and seeing a page:

1. `index.html` first runs an inline script that reads the saved theme from localStorage and sets the `dark` class on `<html>` before anything paints (no white flash in dark mode). It mirrors `src/lib/theme.ts`; keep both in sync.
2. The static splash in `#root` (pulsing logo, inline CSS because the app CSS is not loaded yet) is visible immediately. If the app has not booted after 8 seconds, a CSS-only animation reveals "Taking longer than expected. Reload the page" (works even if JavaScript failed).
3. `main.tsx` creates the QueryClient and the router, then `await router.load()` before rendering. That runs the root route's `beforeLoad`, which calls `ensureSessionRestored()`: one `POST /api/auth/refresh` using the httpOnly cookie. Success fills `authStore`; failure marks the user anonymous.
4. Only then does React render, replacing the splash. Guards already know the real auth state, so a logged-in user never sees a flash of the login page.

`ensureSessionRestored()` caches its promise, so StrictMode double-invocations and parallel navigations share one refresh call.

## 9. Web: routing and guards

File-based TanStack Router routes in `apps/web/src/routes`:

```
__root.tsx                 shell: TooltipProvider, Toaster, devtools (dev only), session restore,
                           full-page NotFound/Error components
index.tsx                  /  dispatcher for signed-in users: the last used household, else the first,
                              else /welcome. Anonymous: /login, or the landing page on the demo site
_auth.tsx                  pathless layout: if authenticated -> redirect to ?redirect target
  _auth/login.tsx          /login (?redirect, ?oauth_error=<code>, ?oauth=link after a provider sign-in)
  _auth/register.tsx       /register
_authenticated.tsx         pathless layout: if not authenticated -> redirect /login?redirect=<current>;
                           validates ?modal= and renders app-wide modals (ModalHost)
  _authenticated/account.tsx           /account  account settings (AccountLayout, not household-scoped); <Outlet /> for the dialog
    _authenticated/account.delete.tsx    /account/delete  delete account dialog (preview, blockers, step-up; a reauth comes back here)
    _authenticated/account.password.tsx  /account/password  change or set a password (a reauth comes back here)
  _authenticated/welcome.*.tsx  /welcome (create or join), /welcome/household, /welcome/invite,
                                /welcome/done (?household=<id>), /welcome/join
  _authenticated/h/$householdId.tsx           household layout: loads the household (404 -> notFound()),
                                              remembers it as last used, renders HouseholdShell
    _authenticated/h/$householdId/_overview.tsx        pathless layout: the overview page (balances, settlements,
                                                       members); <Outlet /> for the settle up dialog
      _authenticated/h/$householdId/_overview.index.tsx  /h/:id         nothing on top
      _authenticated/h/$householdId/_overview.settle.tsx /h/:id/settle?with=<userId>  settle up dialog
    _authenticated/h/$householdId/settings.tsx /h/:id/settings  rename, members, danger zone; <Outlet /> for modals
      _authenticated/h/$householdId/settings.invite.tsx /h/:id/settings/invite  invite dialog (owners only)
      _authenticated/h/$householdId/settings.categories.new.tsx         /h/:id/settings/categories/new?kind=  new category
      _authenticated/h/$householdId/settings.categories.$categoryId.tsx /h/:id/settings/categories/:cid      edit category
      _authenticated/h/$householdId/settings.rules.new.tsx              /h/:id/settings/rules/new             new rule
      _authenticated/h/$householdId/settings.rules.$ruleId.tsx          /h/:id/settings/rules/:rid            edit rule
    _authenticated/h/$householdId/transactions.tsx /h/:id/transactions?month=YYYY-MM  list; <Outlet /> for modals
      _authenticated/h/$householdId/transactions.new.tsx            /h/:id/transactions/new   add dialog
      _authenticated/h/$householdId/transactions.$transactionId.tsx /h/:id/transactions/:tid  edit dialog
    _authenticated/h/$householdId/budgets.tsx        /h/:id/budgets?month=YYYY-MM  budgets of a month; <Outlet /> for the dialog
      _authenticated/h/$householdId/budgets.set.tsx  /h/:id/budgets/set?category=  set, change or remove a budget
    _authenticated/h/$householdId/reports.tsx        /h/:id/reports?to=&month=&view=  trend and spending by category
    _authenticated/h/$householdId/transactions_.import.tsx  /h/:id/transactions/import  import page (own page, not nested)
invite.tsx                 /invite#<token>  public invite landing page (logged in or out)
privacy.tsx                /privacy  public privacy notice (GDPR Art. 13: controller, data / purpose / legal basis / retention,
                           Google sign-in, processors, cookies, rights); linked from the auth screens; not on the demo site
```

- Household shell (`HouseholdShell`): on desktop a sidebar with the logo, the household switcher and the section links; the account menu sits top right, level with the page heading (`PageHeader` leaves room for it). On phones a top bar holds the switcher and account menu, and the sections become a bottom tab bar. New sections are added to `NAV_ITEMS`.
- Household switcher: a plain menu below 5 households (a search box over two entries is noise); from 5 on (`SEARCH_FROM_HOUSEHOLDS`) a combobox with a search box. The search filters households only: "New household" and "Household settings" are items too (one keyboard path for everything) but a custom `filter` always keeps them, and a "No households match" status line covers the case where only they remain. Picking an item navigates.
- The last used household is kept in localStorage per user id (`splinance-last-household:<userId>`), a convenience only: `/` checks it against the list from the API.
- Categories (settings card, any member): one kind at a time (Expenses / Income), a row opens the edit dialog, a per-row menu edits or archives (with a confirmation), and archived categories fold away under "Archived (n)" with Restore. The dialog has a live preview tile, the kind (create only; it is fixed afterwards), the name (a taken name shows next to the field), 8 brand color swatches and the 35-icon grid. Swatches and icons are visually hidden native radio inputs, so arrow keys and screen reader announcements work without extra code. A new category gets the color used least among its kind. Archived categories cannot be opened for editing (the API refuses; the route redirects back).
- Settings: owners rename inline, change roles and remove members from a per-row menu, and archive (typing the household name to confirm). Everyone can leave; the only owner gets an explanation instead of a confirm button (the API enforces `LAST_OWNER` too). Confirmations use `ConfirmDialog` (an alert dialog with local state), not URL-driven modals: a confirmation should not survive a reload or a shared link.
- Account settings (`features/account`): reached from "Account settings" in the account menu (hidden on the demo site, where `/account` redirects to `/`). `AccountLayout` is a slim top bar (logo, "Back" to `/`, account menu) over one column of cards, the same on phones, because the page belongs to the person and also works before any household exists. Cards: profile (inline rename like a household, email read-only), sign-in methods (password with "Change" or "Set a password"; each provider the API offers or the user connected, with its connected and last-used dates and "Connect" or "Disconnect" in a `ConfirmDialog` with the current password, or, for the last way in, an explanation instead of the button), other devices ("Sign out other devices"), and a danger zone with "Delete account…" (`/account/delete`: the preview's consequences, or only the blockers with links to settle up or hand over ownership; then the password or a Google re-authentication and the email typed again). After deleting, the session ends as `deleted`: the guards go to `/login` without a return path and the page says the account was deleted (a failed refresh afterwards never turns a deliberate end into "expired"). "Back to <household>" above the heading returns to the household used last. The password dialog is a child route (`/account/password`): change (current + new) or set a first one (new only; with `recentSignIn` false it first offers "Continue with Google", a reauth that returns to the same URL), with the shared rules checklist for the signed-in user; `?connected=` and `?oauth_error=` from the provider round trip show a toast once and are removed (`replace`); wrong-password and rule errors from the API show next to their fields. A rename updates `authStore` (`setUser`) and invalidates the households (member names).
- Sign in with a provider (`features/auth`): `/login` and `/register` await `authQueries.providers()` in their loaders (`query(...).catch`, so a failed list just leaves the password form) and render `ProviderButtons`: one full-width outline link per provider the API lists and `PROVIDER_VIEWS` knows, above an "or with email" divider. The link goes to `/api/auth/oauth/<id>/start?redirect=<target>` as a full-page navigation (never a router link or fetch). Back on `/login`, `?oauth_error=` shows the `OAUTH_ERROR_MESSAGES` text in a `FormError` once and is then removed from the URL (`replace`); `?oauth=link` loads `GET /auth/oauth/link` and shows `LinkNotice` with the email prefilled, the password focused and the button "Log in and connect"; a login answer with `linkedProvider` shows a success toast. A 404 there (the link cookie expired) falls back to the normal page. Google's mark (`components/brand/provider-logos.tsx`) is the one non-lucide icon: providers' branding rules require their own logo.

### Demo site

The demo instance (demo.<domain>) serves its own build of the web app. `__DEMO_SITE__` is true in it (`vite --mode demo`, `pnpm --filter @splinance/web dev:demo` on :5174 and `build:demo` into `dist-demo`, or `VITE_DEMO=true`); it is a `define`, a literal at every use, so the bundler removes the demo branches and every import only they use (the landing page, the demo story) from the production build. A constant exported from a module would not do: the bundler does not fold imported constants, only the minifier does, after the shared chunk has kept the story. Vitest turns defines into globals, so tests switch it with `setDemoSite()` (`test/demo-site.ts`).

- `/` for anonymous visitors is the landing page (`DemoLanding`, layout "BC2"): headline, "Try the demo", a recorded tour of the app on the brand's blue tile with a phone screenshot overlapping it (both in the page's theme; with reduced motion the video waits on its poster with controls), what the demo holds, "How it's built" with links to this document, the source and the data pipeline, and a note that the data is made up. "Try the demo" calls `POST /api/demo` (a second or two, the button says "Setting up your household…"), stores the session and opens the household. Errors (the cap, the rate limit) are the usual toast.
- No login: `/login` and `/register` lead to `/`, and so does every page under `_authenticated` for a signed-out visitor. `/welcome/join` leads to `/welcome` (the API refuses joining too).
- `DemoBanner` sits at the top of every household page, level with the account menu on desktop: "Demo data · deleted in 6 days" (`GET /api/demo`, `Intl.RelativeTimeFormat`) and "Start over" (a confirmation, then `DELETE` and `POST /api/demo`). The new household opens with a full page load (`pageLoad.replace`): every cached query and mounted page belongs to the deleted one, and the new refresh cookie restores the session. If the new sandbox cannot be made, the visitor is signed out to the landing page with the error.
- The account menu shows "Demo account" instead of the email and "End demo" (with a confirmation) instead of "Log out": `DELETE /api/demo`, then the same local sign-out as logging out, so the guards return to the landing page.
- The import page offers "No export at hand? Try a sample one": a Revolut export of the current month from a fresh demo story (new rows for the household), handed to the import as if picked from disk.
- Production: when `VITE_DEMO_URL` is an http(s) URL, the login page links to the demo ("Just looking? Try the demo").
- The landing page's media live in `src/assets/demo` and are recorded, not drawn: `pnpm capture:demo` builds both web apps, starts the demo instance like `e2e:demo` and runs `e2e/capture/tour.spec.ts` (`playwright.capture.config.ts`). Per theme it records a 20-second desktop tour (Try the demo, overview, transactions, reports, budgets; 1280x800 WebM, the only format Playwright records) with a drawn pointer, since Playwright videos show none, takes the overview as the video's poster, and screenshots the overview on a phone (JPEG). The landing page's own tour section is hidden while recording, or the video would contain itself. Run it again when the app's look changes and commit the files (about 2.6 MB together).

### Onboarding

A user without a household lands on `/welcome` (registration ends on `/`, which dispatches there). The steps are routes in the split-screen layout (`OnboardingLayout`: `BrandPanel` with the poster wall, a step indicator, the account menu):

```
/welcome            create a household | join with an invite link
/welcome/household  name -> POST /households -> replace with /welcome/invite?household=<id>
/welcome/invite     optional: create an invite link (InviteLinkCard: QR, copy) or skip
/welcome/done       summary (invite pending or not) -> /h/<id>
/welcome/join       paste the link or token -> sessionStorage -> /invite (the regular invite page)
```

- The name step is replaced after creating, so back goes to `/welcome` and never offers to create the same household twice.
- Later steps take the household from `?household=`; a missing id restarts at `/welcome`, an id the user cannot see goes to `/`.
- Onboarding is for the first household; further ones use the `?modal=new-household` dialog. Both share `CreateHouseholdForm`.

### Invite flow

```
owner: settings -> Invite (/h/:id/settings/invite) -> Create invite link
       -> POST /households/:id/invites -> link ${origin}/invite#<token> + QR code (uqr, black on white)
invitee: opens /invite#<token>
       -> token moved to sessionStorage, hash removed from the URL (replace)
       -> GET /invites/:token (public preview: household name, inviter, expiry)
       -> logged out: "Log in to join" / "Create an account" with ?redirect=/invite (no token)
       -> logged in: Join -> POST /invites/:token/accept -> /h/:id, token cleared
```

- The token is a credential. The fragment is never sent to a server or in a Referer header, and it only ever travels through login inside this tab's sessionStorage, never in a query string. If storage is blocked, the hash simply stays in the URL.
- The raw token comes back only from the create call, so reopening the dialog shows the pending list and "Create another link". Revoking an invite that is on screen removes it from the dialog too.
- Every invite error has its own wording (`invite-errors.ts`): expired, used, revoked, not found (includes archived households); `ALREADY_MEMBER` on accept links to the app instead. "Not you? Log out" lets a different person on a shared browser take the invite.

- Router context carries `queryClient` and `auth` (the store), so guards and loaders work outside React.
- The `?redirect=` value is validated by `redirectSearchSchema` and `safeRedirect()`: only same-app paths are allowed; `https://...`, `//evil.com` and `/\evil.com` fall back to `/` (open redirect protection).
- Logout or a failed mid-session refresh flips `authStore` to anonymous. `rerunGuardsOnSessionEnd` (`lib/session-watch.ts`, wired in `main.tsx` and the test router) calls `router.invalidate()` on that transition, so guards re-run and protected pages redirect.
- `authStore` remembers why the session ended (`endedBy`). After a failed refresh the guard keeps `?redirect=<page>`, so the same person continues where they were. After an explicit logout it does not: the next person on the browser is often someone else, and the previous user's household would be a 404 for them.
- Not found and errors: the root shows full-page versions; the router defaults (`defaultNotFoundComponent`, `defaultErrorComponent`) render inline inside layouts. "Try again" resets the error boundary and re-runs loaders.
- Page titles: each page renders exactly one `<PageTitle title="..." />`. React 19 hoists `<title>` into `<head>`; multiple titles at once are unsupported, so layouts never render one.

### Importing bank exports

- A page of its own (`transactions_.import.tsx`: the trailing underscore opts out of nesting under the transactions layout, so it is not a dialog over the list). Transactions has an Import button next to Add.
- The browser reads the file (`readExport`: strict UTF-8, else Windows-1250), parses it with `parseStatement` and sends only normalized rows: first to `/imports/check`, then the picked ones to `/imports`. State lives in the component (pick, review, done); a reload starts over.
- The review is grouped by decision (`review.ts`): "Needs a look" (possible duplicates, rows deleted before, own-account transfers, cash withdrawals: not picked, each with its reason), "Ready to import" (picked, private, no category; bulk "Mark picked shared", "Just me", "Set category" for the picked rows of that kind) and "Left out" (already imported, card holds, other currencies), folded into one line. Shared rows are paid by the viewer and split equally between all members.
- "Your name at the bank" spots own transfers in exports that do not name the holder (Revolut). A K&H file fills it from its account holder; names are kept per user in this browser only (`bank-names.ts`), so the legal name stays off the server. Changing it re-reads the file.
- After importing: a summary with Undo and "Import another file". "Your imports" lists the viewer's imports; undoing one asks first (it deletes many transactions). Its mutation and dialog live in the list, not the row, for the same unmount reason as the settlement list.
- `CategoryPicker` takes `label` (no visible label in a row) and `compact` (an 8-unit trigger).
- Rules pre-fill the review: the first matching rule (`firstMatchingRule`, only rules whose category is active) sets the category, and shared if it says so; the row shows "By rule" while the category is still the rule's. After importing, `suggestRules` offers "Do the same next time?": one rule per merchant whose rows got a hand-picked category (the merchant without branch or card numbers, `suggestRulePattern`), skipped when a rule covers it already or the rows went to different categories; shared when all of them were. They are created one by one, all checked by default.
- Settings has a Rules card (order, edit, move up and down, delete with a confirmation) and add and edit dialogs as child routes. Editing shows how many earlier uncategorized transactions match, with "Apply to them"; a new rule's toast offers the same. The apply result toast lives in `useApplyRule`, since the button that started it may be gone by then.

### Budgets

- A section of its own with the month in `?month=` like transactions; the switcher is the shared `MonthNav`.
- Totals (budgeted, spent, left or over) and one row per budget, sorted by category name, with a bar: neutral below 80%, mustard from 80% (`BUDGET_WARNING_RATIO`), red when over; the line under it says the same in words ("3000 Ft left · 90%", "Over by 4000 Ft"), so the bar is decorative. Only shared expenses count.
- The dialog (`/budgets/set`, with `?category=` when opened from a row) sets the amount from the month on screen; picking a category that has a budget prefills it. "Remove budget" sends a null amount from that month.
- The overview shows `BudgetAlertsCard`: only this month's budgets at 80% or more, most used first, hidden when there are none.

### Recurring payments

- A section of its own between Budgets and Reports (`/h/:id/recurring`, lucide `Repeat`). Six phone tabs leave about 60 px each at 360 px, so Transactions shows as "Activity" there (`shortLabel` in `NAV_ITEMS`; the sidebar keeps the full name).
- The page: the monthly total (`MoneyFlow`, household or your share; series gone quiet do not count), the viewer's series soonest first with "due in 3 days" or "No payment since 3 Jul. Cancelled?" last, a price change chip ("+11%", red up, green down), then Suggestions (Confirm, Not recurring with an undo toast that deletes the dismissal again) and Hidden ("Show again"). Due dates and states come from the browser's date through the shared helpers (`features/recurring/view.ts`); the API is time zone free.
- "+ Add" (`/recurring/new`) and a row (`/recurring/$seriesId`) open `SeriesDialog`: name, amount, next or last payment, how often, category, who sees it (adding only), the text to match, "amount varies" and "remind me". The text follows the name (`suggestRecurringPattern`) until edited; `MatchPreview` under it asks `POST /recurring/preview` once typing settles (400 ms, settled as a string so the timer does not restart every render) and shows "Matches 6 past payments". A series shows its latest payments and "Stop tracking" (a `ConfirmDialog`).
- "Make recurring" in an expense's dialog opens `/recurring/new?from=<transactionId>`, prefilled from it (the counterparty's `recurringKey` as the text, its visibility as the scope).
- The import review labels rows that will count for a series ("Recurring: Spotify Duo", `seriesForRow`, shared series first like the API).
- The overview's `UpcomingCard` lists series due within a week (or a few days late) and links "3 possible recurring payments found. Review"; hidden when neither.
- Transaction and import writes invalidate the recurring queries (a new payment moves a due date). `RouteDialog` caps its height and scrolls, for dialogs taller than the window.

### Notifications (the bell)

- `NotificationBell` sits left of the account menu in `HouseholdShell` (top right on desktop, in the phone top bar). The badge is the unread count (`GET /notifications/unread-count`, polled every 5 minutes and on window focus; "9+" above nine, brand red with white text). It opens a Base UI popover (`components/ui/popover.tsx`) on desktop and a drawer on phones: local state, not a URL-driven modal, since it is a menu-like panel.
- The panel loads `GET /notifications` when it opens. `describeNotification` turns a row into words from the reader's side ("Jane added Groceries", "Your share 6200 Ft", "Netflix renews on Saturday", "Eating out is over budget"); names come from the API. Unread items have a dot, resolved ones are muted. Opening an item marks it read and goes to it (`notificationTarget`: the series dialog, the budgets month, the transaction, the transactions list or the overview); "Mark all as read" does all. The footer switches "What others change in <household>" for the current household.
- Transaction, import, recurring and budget writes invalidate the notification queries, so a renewal or budget alert from one's own change shows without waiting for the poll. `PageHeader` and the demo banner leave `md:pr-28` / `md:mr-28` for the bell and the avatar.

### Reports

- A section of its own (sidebar and phone tabs). Two cards: the last six months (`?to=`, default now) as grouped bars, spent next to income (shadcn `chart`, Recharts), and the selected month (`?month=`, default `to`) by category as horizontal bars in the category colors, largest first, with amount and share. "Household" or "Your share" (`?view=`) switches both.
- Four cards on top (`summarize`, `ReportSummaryCards`): spent, income and left over (with the savings rate) for the selected month or the year, each with a change badge against the month before or the same months of last year ("vs Jan–Oct 2025" for this year so far), and the top category with its share. Up is green for income and left over, red for spending; no badge when the earlier period had nothing (no misleading "↑ 100%"). Each has a sparkline (inline SVG, decorative) of the chart's months with a dot on the month shown. For this, the page fetches one more month, or the whole year before (`fetchRange`); the charts show only the range itself.
- "Month" or "Year" (`?period=year&year=YYYY`, `reportRange`): a year shows its twelve months (all solid) and adds up its categories ("2026 so far" for the current one); the trend's arrows step by year, never past this one. Clicking a month in a year opens that month.
- Clicking a bar or the month arrows selects a month; the window only moves when the selection leaves it (`reportWindow`), so stepping month by month never loses it. The arrows on the trend move six months at a time, never past the current month.
- Accessibility: each trend chart is `aria-hidden` and carries an sr-only table with the same numbers (tests read it); the category list is text with decorative bars. Every bar has a faint inset outline, since several brand colors barely stand out from the card (cream, sky, mustard on light; blue on dark).
- Recharts (about 100 kB gzipped) loads with the reports route only (`autoCodeSplitting`). jsdom has no `ResizeObserver`; the test setup stubs it.
- Every write that changes spending invalidates the household's reports along with budgets.

### Overview and settling up

- The overview is a pathless layout route (`_overview`), so the settle up dialog can be a child route over it at `/h/:id/settle` like the other page-bound modals. The sidebar keeps "Overview" highlighted there (`alsoActiveOn` in `NAV_ITEMS`; the link is `exact`, or it would match every section).
- `BalanceOverview`: the viewer's largest debt as a big line ("Ben owes you", `MoneyFlow` in `text-positive`, or "You owe Cara" in `text-negative`) with Settle up and View transactions; every other debt in "Also in <household>", with Settle up only on the viewer's own. No debts: "You're all square". Debts come from `GET /balances`, already per pair and sorted by amount.
- `SettleUpDialog`: picks the person from `?with=` (else the viewer's largest debt, else any other member; people who left appear while a debt with them is open). "Who paid" defaults to whoever owes, the amount to the whole debt. Any amount is accepted; `remainingHint` says what is left ("Ben still owes you 2000 Ft"), when it is square, and when paying more flips the debt. Records a payment made outside the app; nothing moves money.
- `SettlementList` ("Recent settlements", hidden while empty): a row menu deletes a payment the viewer may manage (the two people, who recorded it, owners, as the API decides) with an 8 second undo toast. The delete mutation lives in the list, not the row: the row unmounts when the refetch drops it, and per-call `mutate` callbacks of an unmounted component never run, so the toast would never appear.

### Transactions

- The page shows one month (`?month=YYYY-MM`, absent means the current month, so a bookmark always opens "now"). The loader awaits the first page, the month summary and the categories; "Load more" fetches the next cursor page (`useSuspenseInfiniteQuery`).
- Rows are grouped by day (the API returns them newest first, so a group is a run of equal dates) with a signed day total. A row shows the category tile (brand color fill, icon black or white by contrast), a lock for private ones, "who paid · how it is split", the signed amount (income in `text-positive`) and the viewer's share.
- Add and edit are child routes over the list (drawer on phones; a floating "+" above the bottom tabs, an "Add" button in the header on desktop). The edit route's loader turns a 404 into a toast and a redirect to the list.
- The form keeps text as typed (`TransactionFormValues`); `toTransactionInput` reads amounts and percentages and builds the shared input, and the validator runs `transactionInputSchema` on it and maps its issues back to fields, so the form and the API apply the same rules.
- The split editor is collapsed to one line for the default ("Paid by you · split equally between you and Bela") and opens for anything else. Switching to percentages or amounts prefills an even split; a live hint shows what is left to assign, and the preview orders people by user id like the API, so it shows the same leftover unit the server will assign.
- A save based on an old version gets 409 `VERSION_CONFLICT`: the dialog offers to load the latest version (refetch, reset the form to it) instead of overwriting. Delete closes the dialog and shows an 8 second toast with Undo (restore).
- Money formatting (`features/transactions/money.ts`): Hungarian conventions whatever the UI language (`10 001 Ft`, `1 234,56 €`, no grouping below five digits). `parseAmount` accepts what people type: spaces, commas or dots as thousands separators, a decimal comma or point only where the currency has decimals. Dates are built from parts in local time (`new Date('2026-10-10')` would be midnight UTC).

### URL-driven modals

Every modal has a URL, so reload, sharing a link and the back button work (the pattern comes from the Bump project, which used React Router's "background location"). Two flavors:

| Flavor                   | Use for                                         | How                                                                                                                           |
| ------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Search param (`?modal=`) | app-wide actions, openable from any page        | `_authenticated` validates `modal` with a Zod enum (unknown values are dropped) and renders the matching dialog over the page |
| Child route              | modals that belong to a page (invite, edit ...) | a child route renders a dialog over its parent route; a pasted link shows the real parent underneath                          |

- `CardTitle` renders an `h2` (shadcn's default is a `div`), so the cards on a page are its sections in the heading outline.
- `RouteDialog` is the shell for both: a Base UI dialog on larger screens, a Base UI drawer (bottom sheet, swipe to dismiss) below the `sm` breakpoint. It is always open while mounted; closing plays the exit animation, then calls `onClose`.
- Links that open a modal pass `state={OPEN_MODAL_STATE}`. `useCloseModal(fallback)` goes back in history when that flag is set (closing does not leave a "modal open" entry behind, so back does not reopen it); for a pasted link there is nothing to go back to, so it runs the fallback, a `replace` navigation to the page underneath.
- After a successful submit the dialog navigates with `replace: true`, which swaps out the modal entry.

## 10. Web: data layer

Layering, per feature folder (`src/features/<name>/`):

```
component  --uses-->  hooks.ts (useLogin, useLogout, ...)       mutations + cache invalidation
           --uses-->  queries.ts (transactionQueries.list(), ...) queryOptions: key + fetcher
                           |
                      api.ts (authApi.login, ...)               service functions, the only importers of http
                           |
                      lib/http.ts                               fetch, auth header, refresh, parsing
```

There is no DTO/model/mapper layer: the API already speaks the shared Zod schemas, and the client validates every response at runtime with them.

### The HTTP client (`lib/http.ts`)

`createHttpClient({ baseUrl, auth })` returns `get/post/put/patch/delete(path, schema, body?, options?)` plus `refreshSession()`. The app uses one module-level instance, `http`, with `baseUrl = ${window.location.origin}/api`.

Per request:

1. Attach `Authorization: Bearer <token>` from `authStore` unless `{ auth: false }` (login, register, logout, health).
2. On 401 for an authenticated request: call `refreshSession()` and, if it succeeds, retry the request once.
3. Non-2xx: throw `ApiError(status, code, message)`, parsed from the shared error schema; HTML or empty bodies become `UNKNOWN_ERROR`; network failures become status 0 `NETWORK_ERROR`.
4. 2xx: parse the body with the given schema (a mismatch throws `ZodError`). `noContent` is the schema for 204 responses.

`refreshSession()` is single-flight: concurrent callers share one promise (`refreshing ??= ...`), so five requests failing with 401 at the same time trigger exactly one refresh (tested). Across tabs it runs inside `navigator.locks.request('splinance:refresh-session')`, so tabs take turns and each one sends the newest cookie; the server grace window covers the remaining races.

Why a module-level client instead of one injected per call (as in the Bump project): there is one platform, and code outside React (route guards, loaders, the mutation cache) needs the client. The `createHttpClient` factory still allows separate instances for tests, or for a second platform later.

### Auth state (`lib/auth-store.ts`)

A tiny external store (`getState`, `subscribe`, `setSession`, `clear`) holding `{ status: 'unknown' | 'authenticated' | 'anonymous', accessToken, user }`. React reads it with `useAuth()` (`useSyncExternalStore`). The access token never touches localStorage.

### Queries and mutations

- Queries are `queryOptions` factories with hierarchical keys (`balanceQueries.all()`, `.household(id)`, `.debts(id)`), usable both in route loaders (`queryClient.query(...)`) and components (`useQuery(...)`).
- Query retries: none for 4xx (`ApiError` with status 400-499), up to 2 otherwise.
- `MutationCache.onError` shows a sonner toast for every failed mutation. A mutation opts out with `meta: { suppressErrorToast: true }` when the component shows the error itself (the auth forms do).
- `useLogout` clears `authStore` and the whole query cache in `onSettled`, even if the request fails, so no data of the previous user stays in memory.
- Transactions: everything of a household lives under `['transactions', householdId]` (list per month as an infinite query, summary per month, detail per id); every write invalidates that prefix and `['balances', householdId]`, because transactions change who owes whom.
- Balances: debts and the settlement list live under `['balances', householdId]`; settlement writes invalidate it.
- Budgets: under `['budgets', householdId, month]`; setting one invalidates the household's budgets, and so does every write that changes spending (transactions, imports, applying a rule).
- Rules: under `['rules', householdId]` (the list, and match counts with `staleTime: 0`); applying one also invalidates the household's transactions and balances.
- Imports: the history lives under `['imports', householdId]`; an import or its undo invalidates it, the household's transactions and its balances. The check is a mutation (a POST with a body), not a query. Delete marks the deleted detail stale without refetching it, for the same reason as leaving a household (below).
- Households: `householdQueries.list()` and `.detail(id)` under the `['households']` key; mutations invalidate the whole key. Leaving and archiving only mark it stale (`refetchType: 'none'`) and navigate to `/`: refetching the detail first would hit the new 404 while the page is still mounted. The household layout's loader awaits the detail (a 404 becomes `notFound()`) and warms the list for the switcher; components read the detail with `useSuspenseQuery`, which never suspends there because the loader filled the cache.

## 11. Web: forms

- TanStack Form with the shared Zod schema as validator, using `validationLogic: revalidateLogic()` and `validators: { onDynamic: schema }`: nothing is validated until the first submit, then fields re-validate live while the user fixes them.
- `onSubmit` parses the values with the schema again (applying trim/lowercase transforms) and calls `mutateAsync`.
- API errors: field-specific ones go next to the field (`EMAIL_TAKEN` and `REGISTRATION_CLOSED` on the email field via `serverError`); everything else appears in `FormError` above the form. Editing the field calls `mutation.reset()`, which clears the server error.
- Forms whose fields hold text that is not the API value yet (amounts, percentages) keep a form-values type and map it to the shared input in one function; the validator runs the shared schema on the mapped value (see Transactions above).
- `SegmentedControl` (a ToggleGroup that cannot be emptied) is the control for one-of-few choices: Expense / Income, Shared / Just me, the payer, the split method.
- Pickers with many options are searchable comboboxes (`components/ui/combobox.tsx`, Base UI Combobox via the shadcn CLI, plus our `ComboboxSearchInput` for a search box inside the popup): `CategoryPicker` (categories of the transaction's kind, "No category" as a normal item) and the household switcher. Base UI's filter uses `Intl.Collator` with `sensitivity: 'base'`, so matching ignores case and accents ("egesz" finds "Egészség"). `autoHighlight` highlights the first match, so Enter picks it; focus returns to the trigger. Inside the phone drawer the popup opens above the drawer and picking does not close it.
- `TextField` handles labels, placeholders, the red required asterisk (`aria-hidden`, plus `aria-required` on the input), `aria-invalid` and `aria-describedby`, and a show/hide toggle for password fields.
- The register form shows `PasswordRequirements`, a live checklist computed by `checkPassword()` from the shared rules. Unmet required rules turn red only after a submit attempt.

## 12. Web: theme, brand and UI building blocks

- Theme store (`lib/theme.ts`): `light | dark | system`, saved in localStorage (wrapped in try/catch for blocked storage), applied as the `dark` class plus `color-scheme` on `<html>`, and follows OS changes live in system mode. The selector (`ThemeToggle`) is a shadcn ToggleGroup with tooltips inside the account menu.
- Fonts: Inter (body, 14px base) and Bricolage Grotesque (headings, `font-heading`), self-hosted with fontsource. Never the Google Fonts CDN (GDPR).
- Colors: the UI chrome stays neutral (shadcn tokens). Brand colors are fills only (`--color-brand-*`). Text uses role tokens tuned to at least 4.5:1 in both themes: `text-link`, `text-positive`, `text-negative`.
- Brand palette and logo pairings live in `packages/shared/src/brand.ts`; a test asserts every logo pairing is at least 3:1. The CSS mirrors the palette in `index.css`.
- `LogoMark`: chunky split S with a pink-to-orange gradient on a radially lit blue tile. The glow is capped at `#1515E8` so the orange end keeps 3:1 contrast. `public/favicon.svg` (crisp) and `public/logo.svg` (grainy) must match the component.
- `PosterWall` (auth panel): 8 hand-composed SVG cards (grainy gradients and geometric symbols). It is a CSS size container: a container query switches 4x2 (landscape) and 2x4 (portrait), and the grid width is `min(100cqw, 150cqh)` (or `37.5cqh`), the largest size that keeps cards at 3:4 without overflowing.
- Avatars: `UserAvatar` (Facehash with brand colors, seeded by user id, no initial) and `HouseholdAvatar` (`@outpacelabs/avatars` mesh gradient, brand colors minus cream, seeded by household id, rounded square so households never look like people; drawn once at a fixed resolution and detail level and scaled with CSS, because the library otherwise simplifies small sizes and one household would look different in the menu and on the settings page). Pass `decorative` when the name is shown next to it.
- Motion: amounts that change in place (month totals, day totals, later balances) use `MoneyFlow`, a wrapper around NumberFlow (`@number-flow/react`): each digit rolls to its new value, with the same `Intl` options as `formatMoney` (`moneyFormatOptions`). Growing values drop new digits in from above, shrinking ones bring them up from below (`rollTrend`, the opposite of NumberFlow's default). The first render is static, so page loads do not animate, and the OS "reduce motion" setting turns rolling off. The digits sit in a shadow root, so the element is `aria-hidden` and a visually hidden copy of the formatted value is what screen readers, find-in-page and tests read. Rows that appear or disappear do not roll.
- Motion for things that appear, disappear or open: `motion` (framer-motion's successor, `m.*` components) inside `MotionProvider` in the root route. `LazyMotion` with `domAnimation` (no layout animations) is loaded as its own chunk after first paint, and `MotionConfig reducedMotion="user"` keeps only opacity fades when the OS asks for reduced motion. Tokens in `lib/motion.ts`: a 0.2 s decelerating curve shared with the drawer, a 0.15 s variant for two-step swaps, and `COLLAPSE` (height and opacity; `overflow` hidden only while animating so focus rings are not clipped). What moves: transaction rows and day groups on add, delete and undo; the split editor opening from its summary line; Shared / Just me swapping the editor and the note; category rows on add, archive and restore; the archived list (`Collapse`). `AnimatePresence initial={false}` everywhere, so first renders are static, and lists are keyed by month (transactions) or kind (categories) so switching swaps them without animating every row. No page transitions; dialogs and drawers keep their Base UI CSS animations.
- Loading: a household page whose loader takes longer than 150 ms (`defaultPendingMs`) shows its `pendingComponent`, a skeleton of the page: the real static header (h1, greeting) plus `Skeleton` blocks that mirror the real boxes, so nothing moves when the content arrives. Once shown, a skeleton stays at least 300 ms (`defaultPendingMinMs`) so it does not flash. Preloading on intent and the Query cache make most navigations skip it. Skeletons exist for the overview, transactions, budgets, reports, settings and the import page; dialogs over a page, and a household switch (the layout's loader, which has no pendingComponent), keep the previous screen until they are ready, as before. The router picks the first loading match from the top: one without a pendingComponent means no skeleton at all, never a blank area.
- Entrance after a skeleton (`components/reveal.tsx`, `lib/reveal.ts`): the page's sections (`Reveal`) fade in and rise 6 px, 40 ms apart; list rows (transaction days, budgets) follow 25 ms apart (the first 8), and budget bars grow from empty. Only a page that replaced a skeleton animates: `PageSkeleton` sets a module flag and `RevealPage` reads it on mount, because the two are never mounted together. A page from the cache appears at once, so this is not a page transition. For 600 ms the rows use the reveal props, then switch back to `COLLAPSE`, so rows added later open by height as before. Reduced motion keeps the fade and skips the rise and the growing bars.
- Shadcn components in `src/components/ui` are owned code (Base UI primitives underneath). Links styled as buttons use `buttonVariants()` on the `Link`, because Base UI's `Button` must render a real `<button>`.

## 13. Testing

| Package | Runner                                 | Strategy                                                                                 |
| ------- | -------------------------------------- | ---------------------------------------------------------------------------------------- |
| shared  | Vitest                                 | Pure unit tests (schemas, password rules, contrast math, pairing distribution)           |
| api     | Vitest + Supertest                     | Integration tests against a real Postgres (`splinance_test`); migrations in global setup |
| web     | Vitest + jsdom + Testing Library + MSW | Components and the HTTP client against MSW handlers; router tests with a memory history  |
| e2e     | Playwright (Chromium)                  | Whole user flows in a real browser against the production builds and a real database     |

API specifics:

- Test files run sequentially (`fileParallelism: false`) because they share one database.
- Tests that write data call `resetDatabase()` in `beforeEach`. It truncates every table in the `public` schema and refuses to run unless the database name ends in `_test`.
- A fresh `createApp()` per test keeps rate-limit counters isolated.
- Household tests create users with `createTestUser()` (`test/users.ts`): a direct insert with a fake hash plus `bearer(user)`, which signs an access token at call time. No Argon2 and no register rate limit, so the permission matrix (every route x owner, member, former member, outsider, anonymous) stays fast, and tokens stay valid after the fake clock jumps 7 days.
- Provider sign-in (`oauth.test.ts`) runs against `@splinance/fake-oidc` in the same process (a real HTTP server on a free port): discovery, JWKS, an authorization endpoint that answers at once for logins queued with `nextLogin()` (or renders a "Sign in as" form for e2e), and a token endpoint that checks the code, PKCE verifier and client secret. Tests play the browser's part by hand (start, follow the authorize URL, call the callback with the flow cookie) and tamper with the ID token (audience, issuer, nonce, expiry, a foreign signing key, missing claims).
- Database-level guarantees (composite FKs, CHECKs) are tested with raw Drizzle inserts; `pgErrorOf()` unwraps the driver error to assert its code and constraint name.
- Time-based behavior (token expiry, the grace window, session expiry) uses `vi.useFakeTimers({ toFake: ['Date'] })`, which fakes only `Date`, so the pg driver's timers keep working.

Web specifics:

- MSW runs with `onUnhandledFrame: 'error'` (MSW 3's name for unhandled requests): any request without a handler fails the test. `MotionGlobalConfig.skipAnimations` makes motion animations finish instantly in tests; an element that animates in still starts at opacity 0 and settles a frame later, so assert its visibility inside `waitFor`. `renderRoute` turns skeletons off (`defaultPendingMs: Infinity`) because they show the page's real heading, which tests often wait for; pass `{ pendingMs: 0 }` to test a skeleton. NumberFlow is replaced by a plain formatted `<span>` in tests (`test/number-flow-mock.tsx`): its custom element only registers in a real browser, and jsdom has no Web Animations. `test/msw.ts` has default handlers for reads that pages make in passing (empty category and rule lists for settings and the import page, no debts, no budgets and no settlements for the overview); tests that care override them.
- `test/setup.ts` stubs `window.matchMedia` (jsdom lacks it) and resets the auth store and session-restore cache after each test.
- `getField(label)` finds inputs by label while ignoring the required asterisk.
- jsdom has no `navigator.locks` and no CSS animations, so cross-tab locking is not covered, and Base UI popups close after their exit animation (tests use `waitFor`).

E2E specifics (`e2e/`):

- Runs against what ships: the bundled API (`node dist/index.mjs`) on :3100 and `vite preview` on :4173, which proxies `/api` there (`API_PROXY_TARGET` in `vite.config.ts`). `pnpm e2e` builds first; Playwright starts and stops both servers.
- Global setup creates `splinance_e2e` if missing (it refuses any other name), applies migrations with the bundled `dist/migrate.mjs` and truncates every table. `E2E_DATABASE_URL` overrides the default URL.
- Every test registers its own users with unique emails, so tests share no state and run fully in parallel. A second person (a partner opening an invite link) is a separate `browser.newContext()`: own cookies, own sessionStorage.
- The API runs with `RATE_LIMIT_DISABLED=true`.
- Projects: `desktop` (Desktop Chrome) runs every spec except `*.mobile.spec.ts`; `mobile` (Pixel 7 emulation) runs only those.
- Flows covered: register, onboarding with an invite link, the partner signing up from the link and joining (token out of the address bar, single use), joining by pasting the link, a revoked link, session restore on reload, deep link through login and a wrong password, logout followed by a different user, and the phone shell (bottom tabs, drawer, no horizontal overflow).
- Sign in with Google (`oauth.spec.ts`) against `@splinance/fake-oidc` as a third web server on 127.0.0.1:3300 (another site than the app on localhost, so the round trip is cross-site like with Google; the API gets `OAUTH_GOOGLE_ISSUER` pointing there): sign-up lands on onboarding and survives a reload (the Strict refresh cookie set on the cross-site callback), sign-in again after logout, a cancelled sign-in and an unverified email explained, an existing password account connected only after its password (then Google alone works), and a partner signing up with Google from an invite link and joining. `oauth.mobile.spec.ts`: the button fits a phone. The demo suite checks that the demo lists no providers and has no start route.
- Providers in account settings (`account-providers.spec.ts`, fake provider): a password account connects Google (password, round trip, back on `/account`), signs in with Google into its household, disconnects it with the password, and then Google alone leads to the link prompt again; a Google-only account sees why it cannot disconnect, sets a password right after signing up and logs in with it.
- Account deletion (`account-deletion.spec.ts`): a partner with an open balance sees only the blocker, settles up through its link, then deletes with the password and the email; `/login` says so, the old login fails, and the owner keeps the expense and the payment from a "Former member".
- Account settings (`account.spec.ts`): changing the password keeps this device signed in (also after a reload) and sends a second, already signed-in context to `/login` on its next load; the old password fails, the new one works; a rename shows in the account menu at once and in the partner's member list. `account.mobile.spec.ts`: the page fits a phone (reached from onboarding, before any household), the dialog is a drawer, Back leads out. The demo suite checks that there is no "Account settings" item and that `/account` sends the visitor home.
- Transaction flows (`transactions.spec.ts`, two people in one household via `householdWithPartner`): a percentage split whose leftover unit goes to the larger remainder, seen from both sides (row, share, month totals, the edit form); a private expense that the partner sees neither in the list nor in the totals, and whose direct link sends them back to the list; two people editing the same version (the second save gets the conflict, loads the newer version and saves again); delete with undo, then delete for good. On a phone (`transactions.mobile.spec.ts`): adding from the empty state and the floating button in the drawer, opening a row, back closes it.
- Settling up (`settle-up.spec.ts`): leaving with a debt is refused with the reason in the dialog; a partial payment (with the live hint and a note) leaves the rest open for both people; the prefilled rest squares them up and the partner can leave. Deleting a payment reopens the debt, undo closes it again, for both people.
- Bank import (`import.spec.ts`): a made-up K&H export (built in the test, never a real file) goes through the real file input; a hand-entered purchase shows up as a possible duplicate and the Revolut top-up as an own transfer; two rows are imported (one renamed, one shared, which reaches the partner's balance); the same file again leaves them out as already imported; undoing the import from the history removes them and the partner's debt. A file that is not an export is explained.
- Category rules (`rules.spec.ts`): after an import with groceries filed and shared by hand, the summary suggests "Contains tesco" (checked); the created rule shows in Settings, and the next export's Tesco row arrives categorized and shared "by rule", leaving nothing to suggest and reaching the partner's balance. A rule added in Settings offers its earlier match in the toast and categorizes it; rules can be moved up and deleted, and a deleted rule's transactions keep their category. K&H exports for these tests come from `support/bank.ts` (`khExport`, `khPurchase`).
- Reports (`reports.spec.ts`): shared purchases and a private one appear by category with amounts and shares, the six-month table ends with the current month, and "Your share" switches to the viewer's part; "Year" adds up the year so far; the cards show the month's totals and top category.
- Budgets (`budgets.spec.ts`): a Groceries budget counts shared spending only (a private purchase stays out), shows up on the overview once it is near the limit, goes over with the next purchase, and the partner sees the same budget. A budget set last month holds this month; changing or removing it this month leaves last month's as it was.
- Amounts are matched with `money('10 001 Ft')`, which accepts any whitespace (the app groups with a no-break space). Month totals are read with `monthStat(page, 'Spent')`; `MoneyFlow`'s visually hidden copy is what the assertion sees.
- Locators go by role and label, like the web tests. `field(page, label)` matches a label exactly, ignoring the required asterisk, so "Password" does not also match the "Show password" button.
- The demo instance has its own suite (`pnpm e2e:demo`, `e2e/playwright.demo.config.ts`, specs in `e2e/demo/`): the bundled API with `DEMO_MODE` on :3200 against `splinance_e2e_demo` (global setup creates and migrates it like the main one), and the demo build (`build:demo`, `dist-demo`) served by `vite preview` on :4273. Its reports go to `playwright-report/demo` and `test-results/demo`. Flows: "Try the demo" lands on John Doe's household with the banner, a balance with Jane Doe, spending this month, Rent eleven months back, budgets and the monthly Revolut imports; Start over swaps in a fresh household and the old one is gone; End demo returns to the landing page and household pages stay closed; no login or registration; a sample export goes through the import; on a phone the landing page and the demo fit without sideways scrolling. CI runs it in the e2e job after the main suite.
- Debugging: `pnpm --filter @splinance/e2e e2e:ui` (UI mode) or `e2e:report` (last HTML report with traces of failed tests).

Images and smoke (`deploy/`, CI job `Images and smoke`):

- Two images, both built from the repository root: `apps/api/Dockerfile` (the bundled API, `node:26` Debian slim, production dependencies only, runs as `node`; the same image runs migrations and `demo-create`) and `deploy/web/Dockerfile` (Caddy with both web builds and the Caddyfile, so config and files never drift apart). `.dockerignore` is an allowlist: `.env` files, `data/` and bank files never reach an image. Base images are pinned by digest.
- `deploy/web/Caddyfile`: plain HTTP on `$PORT` (TLS ends at Railway's edge), the demo host (`demo.$DOMAIN`) gets `dist-demo` and `$API_DEMO_UPSTREAM`, every other host the production build and `$API_UPSTREAM`. Security headers are defaults (`?`), so Helmet's stay on `/api`; the CSP is set on static responses only. The client IP comes from the edge's `X-Real-IP` and is passed on as the only `X-Forwarded-For` entry (the API trusts one hop). No access log: invite tokens travel in API paths.
- `deploy/scripts/check-csp.mjs` hashes every inline script of `dist/index.html` and `dist-demo/index.html` and fails unless the Caddyfile's `script-src` has it. It runs in the main CI job and in the web image build: changing an inline script without its hash fails a build, not production. There are two: the theme script, and `globalThis.__zod_globalConfig = { jitless: true }`. Zod 4 probes for `new Function` while object schemas are created, and a CSP without `'unsafe-eval'` reports even that caught probe; the global has to exist before any module runs, because `z.config()` in the entry module would run after the bundle chunks that create the schemas (found by the smoke suite).
- `deploy/backup/Dockerfile` (`postgres:18-alpine` plus age, aws-cli and curl): `backup.sh` is the nightly job (pg_dump and row counts from one exported snapshot, age, S3 with `If-None-Match`, Healthchecks pings, a whole-run timeout), `restore.sh` the drill (fetch, decrypt, set up a scratch server with `deploy/db`, restore as the owner in one transaction, compare row counts with the manifest). `deploy/backup/compose.drill.yml` is the scratch server.
- `deploy/compose.smoke.yml` runs both images like Railway does (Postgres 18, one-shot migrations, both APIs, Caddy on :8080); `pnpm --filter @splinance/e2e e2e:smoke` then checks headers, CSP violations (none, in a real browser), cache headers, the production allowlist and "Try the demo" on `demo.localhost`. Afterwards the job backs up both smoke databases as the backup roles (files, a throwaway age key) and restores them into the drill's scratch server; every row count must match.

## 14. The hard parts

Things that took real debugging or are easy to break. Read these before changing the related code.

1. **Refresh reuse revoke must commit.** In `auth.service.ts` the transaction returns an outcome (`ok`, `invalid`, `reuse`) and the error is thrown after the transaction. Throwing inside `db.transaction` would roll back the `revoked_at` update, so a stolen token would never actually revoke anything.
2. **Concurrent refresh.** `FOR UPDATE` plus the grace window plus Web Locks are three layers of the same problem (parallel refreshes). Removing any one of them reintroduces random logouts.
3. **Single-flight refresh in the client.** `refreshing` must be reset in `finally`, otherwise a failed refresh would be cached forever. A failed refresh clears `authStore`, which re-runs the route guards.
4. **Boot order.** The theme script, the static splash and `await router.load()` together prevent three flashes: light-before-dark, blank page, and login-before-session-restore. A module error leaves the splash up, which is why the CSS-only reload hint exists.
5. **Drizzle migrations are tracked by timestamp.** Never edit or regenerate a migration that has run anywhere. Regenerating changes its timestamp, and Drizzle then re-runs it or skips later ones.
6. **TypeScript configuration.**
   - `exactOptionalPropertyTypes` means optional props that may receive `undefined` must say `prop?: T | undefined`.
   - `moduleResolution: Bundler` means no `.js` extensions in imports. The one exception is `apps/api/vitest.config.ts`, which imports `./test/test-db.ts` with its extension for Vite's native config loader (hence `allowImportingTsExtensions`).
   - TypeScript is pinned to 6.0 because typescript-eslint does not support TS 7 yet.
7. **Shared package as TypeScript source.** Fast and simple, but the API production build must keep `deps.alwaysBundle: [/^@splinance\//]` in `tsdown.config.ts`, otherwise Node would try to import `.ts` files at runtime.
8. **SVG ids are document-global.** Gradients, filters and clip paths inside components (`LogoMark`, `PosterWall`) are prefixed with `useId()`. Two logos on one page (the login screen has two) would otherwise share and override each other's gradients.
9. **Contrast-driven palette.** Several colors were adjusted by calculation, not taste: green and red darkened to reach 3:1 in pairings, the logo tile glow capped at `#1515E8`. Change a color only with the contrast test running.
10. **Base UI quirks.** A focused theme button shows its tooltip, so the first Escape closes the tooltip and the second the menu (standard nested-popup behavior). Rendering a Base UI `Button` as a link breaks its semantics; use `buttonVariants()` on links.
11. **Vite dev server staleness.** After rapid file rewrites Vite can keep serving a half-written module (`does not provide an export named ...`) and the app stays on the splash. Touching the file or restarting `pnpm dev` fixes it.
12. **The household lock comes before any membership read.** "Is there another owner?" followed by a demotion is a check-then-act race: two owners stepping down at the same time would both see two owners. `lockHousehold()` takes a row lock on `households` first; under READ COMMITTED every later statement in the transaction then sees what the other transaction committed. Reading memberships in the same statement as the lock would not be enough (Postgres re-checks only the locked row). A test fires two parallel step-downs and fails without the lock.
13. **One lock order: household, then invite.** Accepting an invite reads the invite's household id without a lock, locks the household, then locks the invite row. Membership changes lock the household and then revoke invites. Locking the invite first in accept would let the two paths deadlock.
14. **Invite tokens are credentials in a URL.** They are 256-bit random values stored as SHA-256 hashes, but they travel in the path, so `redactUrl()` strips them from request logs. The web invite page must not load third-party resources (Referer leak); Helmet already sends `Referrer-Policy: no-referrer` for API responses.
15. **Invites die with their creator's ownership.** Leaving, removal and demotion revoke the person's pending invites in the same transaction. Otherwise an owner could mint a link, get removed, and walk back in.
16. **Menus that open modals must not take focus back.** A Base UI menu restores focus to its trigger after its close animation. When the clicked item opens a URL-driven dialog, the dialog is already open by then, so focus would land on the trigger behind the backdrop and typing would go nowhere. `DropdownMenuContent` defaults `finalFocus` to skip the restore while a dialog or drawer is open. jsdom does not reproduce this timing; it was found and verified in a real browser.
17. **A hidden browser pane freezes Base UI exit animations** (and motion's, which run on `requestAnimationFrame`). Popups wait for their CSS transitions (and `requestAnimationFrame`) before unmounting. In a background or hidden browser view those never advance, so a closed drawer stays mounted with `data-ending-style` until the page is visible again. Not a bug in the app; verify closing behavior in a visible window or in jsdom tests.
18. **Exiting a household must not refetch it in place.** After leave or archive the household detail is a 404 for the user. An immediate refetch (normal invalidation) would make the still-mounted settings page throw into the error boundary before the navigation to `/` happens. The hooks invalidate with `refetchType: 'none'`; the `/` loader then refetches the list.
19. **Preview port collisions.** A tool or platform that sets `PORT` for a process makes the API bind that port (`--env-file` never overrides existing env vars). Vite uses `strictPort`, so it fails instead of silently moving.
20. **Playwright starts the web servers before global setup.** The API boots while `splinance_e2e` may not exist yet. That works only because the pg pool connects lazily and the readiness URL is `/api/health/live`, which does not touch the database. Pointing it at `/ready`, or querying at boot, would deadlock the first run.
21. **Split sums are checked at commit, not per statement.** The constraint triggers from migration 0006 are `DEFERRABLE INITIALLY DEFERRED`: an edit updates the amount, deletes the old split rows and inserts new ones, and the sum is only consistent at the end. An immediate check would fail halfway through every edit. The flip side: the error surfaces at `COMMIT`, so a test must await the whole `db.transaction(...)`, not a single statement.
22. **Transaction writes take a shared household lock.** Membership changes take `FOR UPDATE` on the household row (hard part 12); transaction writes take `FOR SHARE`. A member being removed therefore cannot slip between "is the payer an active member?" and the insert, while two transaction writes do not block each other. Lock order is always household first, then the transaction row.
23. **The category foreign key includes the kind.** `transactions(household_id, category_id, kind)` references `categories(household_id, id, kind)`, so an expense under an income category is impossible even for raw SQL. It works because `transactions.kind` uses the `category_kind` enum type (a foreign key needs identical types) and because a null `category_id` skips the whole check (`MATCH SIMPLE`). Drizzle generated the referenced unique constraint after the foreign key; migration 0005 was reordered by hand before merging.

24. **Balance checks run under the exclusive household lock.** "Does Ben owe anything?" followed by ending his membership is a check-then-act race with a new expense naming him. Leaving, removal and archiving take `FOR UPDATE` on the household (hard part 12), transaction and settlement writes take `FOR SHARE` (hard part 22), so one waits for the other: either the expense is refused (`INVALID_MEMBER`, Ben already left) or leaving is (`UNSETTLED_BALANCE`). A test fires both at once and accepts either outcome, never both succeeding. The ledger's two queries run one after the other, not with `Promise.all`: inside a transaction they share one connection.

25. **Undo and its timestamp.** Undoing an import soft deletes its transactions and marks the batch with one shared timestamp. That is how the duplicate check knows a row was removed by the undo (import it again) rather than deleted by the person on their own (leave it out): `deleted_at = undone_at`. Separate timestamps per row would turn every undone row into "deleted".

26. **Deleting a demo sandbox is the one hard delete (besides a deleted account's private data and solo households).** Every foreign key is `ON DELETE NO ACTION` and the rest of the app only soft deletes, so `deleteDemo` deletes in dependency order inside one transaction (audit log, splits, transactions, imports, settlements, budgets, recurring series, rules, invites, categories, members, the `demos` row, households, then the users; sessions and provider identities cascade). It first locks the households `FOR UPDATE`, so a write still running in them finishes first. Deleting splits fires the deferred split-sum trigger, which skips transactions that no longer exist. A test deletes a sandbox (plus a household the visitor made) and checks that only another person's rows remain: a new table that references households or users must be added to `deleteDemo`, or that test fails. Before deleting or creating, `assertDemoDatabase` asks Postgres which database the pool reached (`current_database()` must end in `_demo` or `_test`); it runs per call, not at boot, because the API may start before its database exists (hard part 20).

27. **The analytics views pin the columns they read.** Postgres refuses `ALTER COLUMN ... TYPE` and `DROP COLUMN` on a column a view uses, and `CREATE OR REPLACE VIEW` can only add columns at the end. Such a change needs a custom migration that drops the affected views, changes the table and creates the views again with their grants (`analytics.transaction_splits` reads `analytics.transactions`, so it goes too), plus the contract test and docs. Two more rules there are easy to break: a row must never just drop out of a view (make it a stub, or an extract by `updated_at` keeps the old copy), and free text is shown only by the provenance rule (`demos.seeded_at`); both are in data-model.md.
28. **The ID token's signature is checked on purpose.** `openid-client` (like the OIDC spec) skips it for tokens that come straight from the token endpoint and relies on TLS. `createOidcProvider` turns on `enableNonRepudiationChecks`, so the JWKS signature is verified too; the "foreign signing key" test fails without it.
29. **The flow cookie is Lax, the refresh cookie Strict, and both work.** The provider's redirect to the callback is a cross-site top-level GET: a Strict flow cookie would never arrive. Setting the Strict refresh cookie on that same response is allowed (a response to a top-level navigation may set SameSite cookies even when another site started it), and the web's later `POST /refresh` is same-site, so it is sent. The e2e suite proves it in Chromium (the fake provider is on another site, 127.0.0.1); Firefox and Safari are checked by hand on production. If a browser ever dropped it, the fallback is a short Lax handoff cookie exchanged by a same-site POST.
30. **A wrong current password is a 400.** The web `http` client treats every 401 as an expired access token: it refreshes and retries once. `WRONG_PASSWORD` as a 401 would run Argon2 twice per attempt and, with a failing refresh, log the person out. Only an ended session answers 401 on the account routes.
31. **Sign-in method changes lock the user row first.** Password changes (and the provider connect and disconnect that follow) start with `lockUser`. "Does the account keep another way in?" followed by removing one is a check-then-act race between two tabs, like the last-owner check (hard part 12).
32. **Connect and reauth bind to the session in the flow cookie.** The callback is a cross-site GET: no Bearer token, no Strict refresh cookie. The only thing that says who started the flow is the encrypted flow cookie (`userId`, `sessionId`), written by an authenticated POST and readable only by this browser. The callback re-checks that session (active, the same user) before touching the account; the public start link can only ever write `intent: 'signin'`.
33. **Account deletion locks the user, then the households in id order.** The balance check and the erasure must not interleave with an expense naming the person (the same check-then-act race as leaving, hard part 24), and two deletions or a deletion and a role change must not deadlock: one global order (user row, then households sorted by id) and the plan computed again after the locks. Private transactions go with their audit rows (copies of their content), shared ones only lose the name; a new table that references users or members belongs in `erase` (and in `deleteHouseholdContents`).
34. **Shared series take their payments first.** A private series matches everything its owner sees, shared transactions included, so Anna's private "my Netflix" and the household's "Netflix" can cover the same rows. If they competed (longest pattern, then age), the shared series would show different payments to Anna than to Ben. `compute()` therefore assigns shared series over all rows first (they only take shared rows, the same for every member) and private series over the rest.
35. **Recurring keys are stored.** `recurringKey()` and `suggestRecurringPattern()` become a series' `pattern_key` or a dismissal's key; changing their output silently orphans those rows (a dismissed suggestion comes back, a confirmed series stops matching). Their tests pin the outputs; a change needs a data migration of `recurring_series.pattern_key`.
36. **A provider sign-in looks up the identity and the email in one statement.** Under READ COMMITTED every statement takes a fresh snapshot. With two lookups ("is this `(provider, sub)` known?", then "is this email taken?"), a second first sign-in of the same person could run the first before the parallel one commits and the second after: it sees the new user but not its identity, takes the link branch and rejects with `conflict` ("account has no password"), with no unique violation to retry on. One `users LEFT JOIN user_identities` query returns the identity's owner and the email's owner from the same snapshot, so a committed user always comes with its identity. The test that fires two callbacks at once caught it intermittently.
37. **Activity notifications live in the write transaction, state ones after it.** An activity row is an event: written next to the audit entry, it can never exist without its change or survive a rollback, and a failure fails the write. A state row is derived: `syncAfterChange` runs after the commit (it reads what the write just made visible), and a failure there is logged, never undoing a saved expense; the hourly sweep repairs it. Calling the sync inside the write transaction would read stale data for other members and hold the household lock while it runs.

## 15. Known limitations

- Access tokens cannot be revoked before they expire (15 minutes).
- Rate limits are per IP and in memory: they reset on restart and are not shared between instances (Redis is planned for Phase 6). The IP is `req.ip`, which follows `X-Forwarded-For` only through the `TRUST_PROXY` hops; set it to the number of proxies really in front of the API (1 behind Caddy), never more, or clients could pick their own IP.
- Registration reveals whether an email exists (409). Avoiding this needs email verification, which is out of scope for now.
- No email verification, password reset or session list yet ("Sign out other devices" signs out all of them at once). The email address cannot be changed.
- A restore from a backup brings deleted accounts back; deletions made after the backup's date are repeated by hand (`account:erase`, deploy.md 5).
- Railway's edge keeps its own HTTP logs (client IP, full path and query), before our redaction: a provider callback's code lands there. It is single use, already spent by then, and useless without the PKCE verifier and the client secret.
- Provider sign-in: one identity per provider and user; the account page shows the connected date, not which Google account (its email is not stored). An account that signs in only with Google cannot recover on its own if that Google account is lost (an owner fixes it in the database).
- Invite links are not bound to an email: whoever holds a valid link can join. Owners can list and revoke pending links; links expire after 7 days.
- A removed member can rejoin through any other valid invite link they see; there is no ban list.
- Editing an old transaction that involves someone who left, or deleting or restoring a transaction or settlement, can reopen a debt with a former member. It shows up in the balances and can be settled (an owner records it), but the former member cannot see it.
- Cross-tab refresh locking is covered by reasoning and the server grace window, not by automated tests (jsdom has no Web Locks, and the e2e suite does not open two tabs of one user).
- Recurring detection misses some real series: a hand-entered "Netflix" and an imported "Netflix.com" are one key, but "Netflix" typed in and "NFLX" on a statement are not; a bill that jumps over 25% (winter gas) restarts its run, and a series added by hand with "amount varies" covers it instead. "Today" is Budapest's for everyone until people have their own time zone.
- The e2e suite runs Chromium only (desktop and Pixel 7 emulation), not Firefox or WebKit/Safari.

## 16. Security

Reviewed 2026-10-27 (dependencies, auth, authorization, input handling, web client, CI). Where each defense lives:

- Authentication: section 6 (Argon2id with a timing equalizer, refresh rotation with reuse detection, `SameSite=Strict` httpOnly cookie on `/api/auth`, access token in memory only). Provider sign-in: PKCE, state and nonce in an encrypted single-use cookie, ID token signature and claims checked, `email_verified` required, linking to an existing account only after its password, the registration policy for first sign-ups, never on the demo. Account changes: step-up (current password, or a sign-in within 10 minutes, else a provider re-authentication), other sessions signed out on a password change and a disconnect, the user row locked first, never removing the last way in; connect and reauth only from authenticated POSTs, bound to the starting session. Account deletion: preview, blockers, step-up and the email typed again; anonymized row, private data erased, a deleted user's live token refused for new data.
- Authorization: `requireMembership` in every household-scoped service (404 for non-members, 403 for owner-only actions); private transactions through `visibleTo` (lists, details, history, summaries, recurring payments: a shared series only ever takes shared transactions, a suggestion group never mixes scopes, private series are invisible to others); composite foreign keys keep references inside one household. The duplicate check of an import only looks at transactions the importer paid.
- Input: shared Zod schemas on every body, query and param; malformed ids are 404; SQL only through Drizzle or parameterized `sql` templates (`escapeLike` for search); body size caps and no compressed bodies.
- Abuse: per-IP limits on register (5), failed logins (10), refresh (100), provider sign-in start and callback (30 each), invite preview (60) and accept (30), a ceiling of 1000 per IP for the whole API, and per user: 30 import checks or imports, 10 failed password changes, 30 renames, 10 each of "sign out other devices", connect, reauth and disconnect, all per 15 minutes.
- Secrets in URLs and logs: invite tokens live in the URL fragment on the web and are redacted from API request logs, as is the whole query of a provider callback (code, state); logs drop authorization headers and cookies. The example `JWT_ACCESS_SECRET` is refused in production.
- Web: no `dangerouslySetInnerHTML`; React escapes everything else. Redirect targets after login go through `safeRedirect` (same origin only, no backslashes or control characters, which URL parsing would turn into `//host`). Devtools load only in development.
- Dependencies: CI runs `pnpm audit:prod` (high and critical advisories in what ships fail the build). Dev tooling is audited by hand (`pnpm audit`). Node 26 (Active LTS since 2026-10-28, `.nvmrc`; `engines` requires 26.13, the first 26 LTS) runs locally, in CI and in the images; patched `undici` (jsdom) needs its zlib zstd support.

- Demo instance: `DEMO_MODE` is refused by env validation unless the database name ends in `_demo`, and the demo service checks `current_database()` again before creating or deleting anything. Production never mounts `/api/demo`. Registration and joining are closed on the demo, so its database holds only seeded sandboxes. Demo accounts cannot log in (random, discarded password; `.invalid` emails). `POST /api/demo` is limited per IP and by a global cap of active sandboxes.
- Data track: the pipeline reads the demo database only through the `analytics` views, as a role that can read nothing else (a test checks every table in `public` and `drizzle`). The views carry no credentials or contact data, show free text only where the demo story wrote it, keep private and visitor-imported transactions as stubs, and are empty outside `_demo` / `_test` databases. The login role exists only on the demo database.

Accepted by design (a household trusts its members; the audit log and transaction history show who changed what):

- Any member can edit or delete any shared transaction, including who paid and the split.
- Either person involved (or an owner) can record a payment without the other confirming; they can delete it if it is wrong.
- Owners can remove members and change roles; the last owner cannot leave or step down while others remain.

Before the first deploy (the setup itself is in [deploy.md](deploy.md), with a checklist for after it):

- `TRUST_PROXY` set for the proxies in front of the API (`app.set('trust proxy', n)`), so rate limits and logs see client IPs; checked after the first deploy with a forged header.
- `REGISTRATION=allowlist` with `REGISTRATION_ALLOWLIST` on production (closed when unset).
- `MIGRATE_DATABASE_URL` as the schema owner, `DATABASE_URL` as a role without DDL rights.
- The web server sends HSTS, `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `frame-ancestors 'none'` and a CSP (`script-src 'self'` plus the hash of the inline theme script in `index.html`; fonts and styles are self-hosted). Done in `deploy/web/Caddyfile`; the smoke suite checks them in a real browser.
- `NODE_ENV=production` (secure cookies by default; keep `COOKIE_SECURE` unset or true), a random `JWT_ACCESS_SECRET` from a secret store, the database user without superuser rights: per database an owner for migrations and an app role for rows (`deploy/db/*.sql`; the smoke stack runs on exactly these roles and CI checks what they cannot do).
- The demo instance gets its own `JWT_ACCESS_SECRET` (with a shared one, a demo access token would verify on production) and its own database; cookies stay host-only (no `Domain`), so the two hosts never share them.
- GitHub Actions pinned to commit SHAs, Dependabot for npm and actions, a deploy key that can only deploy.
- Database backups: Railway Hobby has none, so our own nightly job (`deploy/backup`, Railway cron) dumps both databases as read-only backup roles, encrypts them with age on the way out (the private keys are only with the owner) and uploads them to S3 Frankfurt as an IAM user that can only add new files. Retention 35 days daily, 13 months monthly; session rows are left out. Healthchecks.io reports a failed or missing run; CI restores a fresh backup on every pull request, and `restore.sh` drills the real ones ([deploy.md](deploy.md) 3.7 and 5). (Stale sessions and invites are deleted by the maintenance job, at boot and daily.)
