# Splinance architecture

How the code works today, why it is built this way, and the parts that are easy to get wrong. For the database tables and their conventions see [data-model.md](data-model.md); for coding rules see [CLAUDE.md](../CLAUDE.md).

Status: Phases 0 to 3 (foundation; auth, households, invites, onboarding; transactions and splits; balances and settle-up) are done, API and web. Phase 4 (bank CSV import: Revolut and K&H, duplicate check, review, undo) is done; OTP follows once a sample export exists. The first deploy is the last item of the roadmap.

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

---

## 1. Repository map

pnpm monorepo, three packages:

```
apps/api          Express 5 REST API (Node 22, TypeScript, Drizzle, Postgres)
apps/web          React 19 SPA (Vite 8, TanStack Router/Query/Form, shadcn/ui on Base UI, Tailwind v4)
packages/shared   Zod schemas, password rules, brand palette: the contract between api and web
e2e               Playwright end-to-end suite against the production builds
docs/             data-model.md, architecture.md (this file)
docker/           Postgres init script (creates the test database)
```

Key files by concern:

| Concern                       | Files                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| API entry, middleware chain   | `apps/api/src/index.ts`, `apps/api/src/app.ts`                                                                           |
| Env validation                | `apps/api/src/config/env.ts`                                                                                             |
| DB client, schema, migrations | `apps/api/src/db/*`, `apps/api/drizzle/*.sql`                                                                            |
| Auth (API)                    | `apps/api/src/modules/auth/*`, `apps/api/src/middleware/require-auth.ts`                                                 |
| Households and invites (API)  | `apps/api/src/modules/households/*`, `apps/api/src/modules/invites/*`                                                    |
| Categories (API)              | `apps/api/src/modules/categories/*`                                                                                      |
| Transactions (API)            | `apps/api/src/modules/transactions/*`, trigger in `apps/api/drizzle/0006_transaction_split_sum_trigger.sql`              |
| Balances and settlements      | `apps/api/src/modules/balances/*` (`ledger.ts` derives debts), `apps/api/src/modules/settlements/*`                      |
| Bank imports                  | `packages/shared/src/imports/*` (parsers, contract), `apps/api/src/modules/imports/*`, `apps/web/src/features/imports/*` |
| Category rules                | `packages/shared/src/rules.ts` (matching), `apps/api/src/modules/rules/*`, `apps/web/src/features/rules/*`               |
| Money and split math          | `packages/shared/src/money.ts`, `packages/shared/src/splits.ts`, `packages/shared/src/balances.ts`                       |
| Errors                        | `apps/api/src/lib/http-error.ts`, `apps/api/src/middleware/error-handler.ts`, `packages/shared/src/api-error.ts`         |
| Web entry, router setup       | `apps/web/index.html`, `apps/web/src/main.tsx`, `apps/web/src/routes/*`                                                  |
| HTTP client, auth store       | `apps/web/src/lib/http.ts`, `apps/web/src/lib/auth-store.ts`                                                             |
| Auth (web)                    | `apps/web/src/features/auth/*`                                                                                           |
| Households (web), app shell   | `apps/web/src/features/households/*`, `apps/web/src/routes/_authenticated/h/*`                                           |
| URL-driven modals             | `apps/web/src/components/route-dialog.tsx`, `apps/web/src/lib/route-modal.ts`                                            |
| Theme                         | `apps/web/src/lib/theme.ts` + inline script in `apps/web/index.html`                                                     |
| Brand                         | `packages/shared/src/brand.ts`, `apps/web/src/components/brand/*`, `apps/web/src/index.css`                              |

`packages/shared` has no build step: its `package.json` exports `src/index.ts` directly. Every consumer compiles it (Vite in web, tsx in api dev, Vitest in tests) and tsdown inlines it into the production API bundle (`deps.alwaysBundle`).

## 2. Development workflow

### Running locally

```bash
pnpm install
docker compose up -d                          # Postgres 18: databases splinance + splinance_test
cp apps/api/.env.example apps/api/.env        # then set a real JWT_ACCESS_SECRET
pnpm --filter @splinance/api db:migrate
pnpm dev                                      # api :3000 (tsx watch) + web :5173 (Vite)
```

Open http://localhost:5173. Vite proxies `/api/*` to the API, so the browser sees one origin (no CORS, cookies just work).

### Checks

`pnpm check` runs exactly what the main CI job runs: Prettier check, ESLint (type-aware, `strictTypeChecked`), `tsc` per package, all tests, all builds. Run it before pushing.

`pnpm e2e` builds everything and runs the Playwright suite (see [Testing](#13-testing)). It uses its own ports and database, so it can run next to `pnpm dev`. First time only: `pnpm --filter @splinance/e2e exec playwright install chromium`.

### Branches and pull requests

- One branch per change (`feat/...`, `chore/...`, `ci/...`, `docs/...`), merged via pull request. `main` has a GitHub ruleset: PR required, the CI check `Lint, typecheck, test, build` must pass and be up to date, no force push, no deletion.
- CI (`.github/workflows/ci.yml`) runs on Ubuntu with a Postgres 18 service container using the same credentials as Docker Compose, so the default test database URL works unchanged. A second job, `End-to-end (Playwright)`, runs `pnpm e2e` with its own Postgres service and uploads the HTML report and traces when it fails. It is not a required check (yet).
- `gh` is not installed locally; PRs are opened from the GitHub compare page.

### Generators

| Command                                                | What it regenerates                                                                                      |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @splinance/api db:generate`             | SQL migration from `src/db/schema/` changes                                                              |
| `pnpm --filter @splinance/shared gen:common-passwords` | `src/password/common-passwords.ts` (top 1000 passwords with 10+ chars from `@zxcvbn-ts/language-common`) |
| `pnpm --filter @splinance/web gen:icons`               | `public/favicon-32.png`, `public/apple-touch-icon.png` from the SVG logos                                |
| Vite / TanStack Router plugin (automatic)              | `apps/web/src/routeTree.gen.ts` (committed, not linted)                                                  |

## 3. API: request lifecycle

`createApp(deps)` in `app.ts` builds the Express app; `index.ts` only starts the server and handles shutdown. Keeping them apart lets Supertest drive the app in memory without opening a port, and lets tests inject dependencies (for example a failing `pingDatabase`).

Middleware order:

```
helmet()                 security headers (CSP, HSTS, nosniff, ...)
pinoHttp()               request id, req.log, one log line per request (method, url, status only;
                         invite tokens in the url are redacted)
express.json             body parsing with a size cap: 100kb, 1mb for bank imports (a thousand rows)
cookieParser()           req.cookies (needed for the refresh token)
/api router
  /health                live + ready
  /auth                  register, login, refresh, logout (rate limited)
  GET /me                requireAuth -> getMe
  /households            requireAuth for every route; membership checked in the services
  /invites               token-addressed: public preview, accept (rate limited)
notFoundHandler          unknown route -> HttpError 404
errorHandler             every error -> shared JSON error shape
```

Error handling: route handlers just `throw`. Express 5 forwards rejected promises to the error middleware, so there is no `try/catch` or async wrapper in routes. The error handler maps:

| Thrown                                     | Response                                                              |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `ZodError` (from `schema.parse(req.body)`) | 400 `VALIDATION_ERROR` with `details` (Zod tree)                      |
| `HttpError(status, message, code)`         | that status and code                                                  |
| anything else                              | logged with stack, client gets 500 `INTERNAL_ERROR` without internals |

Every error body matches `apiErrorResponseSchema` from the shared package: `{ "error": { "code": string, "message": string, "details"?: unknown } }`.

Graceful shutdown (`index.ts`): on SIGTERM/SIGINT the server stops accepting connections, waits for in-flight requests, then closes the Postgres pool. A 10 second `unref()`ed timer forces exit if something hangs.

## 4. API: endpoints

All routes live under `/api`. Request and response bodies are defined by Zod schemas in `packages/shared`.

| Method and path           | Auth                                   | Request                            | Success                                                                    | Errors                                                        |
| ------------------------- | -------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `GET /api/health/live`    | none                                   |                                    | 200 `{ status: 'ok', uptimeSeconds }`                                      |                                                               |
| `GET /api/health/ready`   | none                                   |                                    | 200 `{ status: 'ok', checks: { database: 'ok' } }`                         | 503 same shape with `'error'`                                 |
| `POST /api/auth/register` | none, 5 req / 15 min / IP              | `{ email, password, displayName }` | 201 `{ accessToken, user }` + refresh cookie                               | 400 `VALIDATION_ERROR`, 409 `EMAIL_TAKEN`, 429 `RATE_LIMITED` |
| `POST /api/auth/login`    | none, 10 failed / 15 min / IP          | `{ email, password }`              | 200 `{ accessToken, user }` + refresh cookie                               | 401 `INVALID_CREDENTIALS`, 429                                |
| `POST /api/auth/refresh`  | refresh cookie, 100 / 15 min           |                                    | 200 `{ accessToken, user }` (+ rotated cookie, except in the grace window) | 401 `INVALID_REFRESH_TOKEN`                                   |
| `POST /api/auth/logout`   | refresh cookie (optional)              |                                    | 204, cookie cleared                                                        |                                                               |
| `GET /api/me`             | `Authorization: Bearer <access token>` |                                    | 200 `{ user }`                                                             | 401 `UNAUTHENTICATED`                                         |

`user` is `{ id, email, displayName, createdAt }` (`userSchema`).

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

`household` is `{ id, name, baseCurrency, role, createdAt }` where `role` is the caller's role; members are `{ userId, displayName, role, joinedAt }` (no emails). The raw invite token appears only in the create response; the web app builds the link (and later a QR code) from it.

The refresh cookie: name `refresh_token`, `HttpOnly`, `SameSite=Strict`, `Path=/api/auth` (never sent to other endpoints), `Secure` when `COOKIE_SECURE` is true (default in production), expires with the session (30 days, sliding).

Environment (`apps/api/src/config/env.ts`, validated with Zod at startup, the process exits on invalid config):

| Variable                   | Default            | Notes                              |
| -------------------------- | ------------------ | ---------------------------------- |
| `NODE_ENV`                 | development        | development, test, production      |
| `PORT`                     | 3000               |                                    |
| `LOG_LEVEL`                | info               | pino levels plus `silent`          |
| `DATABASE_URL`             | required           | must be a `postgres://` URL        |
| `JWT_ACCESS_SECRET`        | required           | at least 32 characters (HS256 key) |
| `ACCESS_TOKEN_TTL_SECONDS` | 900                |                                    |
| `REFRESH_TOKEN_TTL_DAYS`   | 30                 |                                    |
| `COOKIE_SECURE`            | true in production | must be false for local http       |
| `RATE_LIMIT_DISABLED`      | false              | e2e only; refused in production    |

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

- Register: hash the password, then in one database transaction insert the user and create the session. A unique-constraint violation on `users_email_unique` becomes 409 `EMAIL_TAKEN` (`isUniqueViolation` checks the error and its `cause`, because Drizzle wraps driver errors).
- Login: if the email does not exist, the service still runs an Argon2 verification against a dummy hash before answering, so response time does not reveal which emails are registered. Wrong password and unknown email return the identical 401 body.
- Only failed login attempts count against the rate limit (`skipSuccessfulRequests`).
- `RATE_LIMIT_DISABLED=true` turns every limiter into a no-op. Only the e2e suite sets it (it registers dozens of users from one IP, against a limit of 5 per 15 minutes); env validation refuses it when `NODE_ENV=production`.

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
| `imports/`          | `parseStatement()` (Revolut CSV, K&H transaction history CSV), `StatementRow`, flags, fingerprints, `nameKey()`                      | web import page (next PRs), parser tests                    |

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
_auth.tsx                  pathless layout: if authenticated -> redirect to ?redirect target
  _auth/login.tsx          /login
  _auth/register.tsx       /register
_authenticated.tsx         pathless layout: if not authenticated -> redirect /login?redirect=<current>;
                           validates ?modal= and renders app-wide modals (ModalHost)
  _authenticated/index.tsx /  dispatcher: redirect to the last used household, else the first,
                              else /welcome
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
    _authenticated/h/$householdId/transactions_.import.tsx  /h/:id/transactions/import  import page (own page, not nested)
invite.tsx                 /invite#<token>  public invite landing page (logged in or out)
```

- Household shell (`HouseholdShell`): on desktop a sidebar with the logo, the household switcher and the section links; the account menu sits top right, level with the page heading (`PageHeader` leaves room for it). On phones a top bar holds the switcher and account menu, and the sections become a bottom tab bar. New sections are added to `NAV_ITEMS`.
- Household switcher: a plain menu below 5 households (a search box over two entries is noise); from 5 on (`SEARCH_FROM_HOUSEHOLDS`) a combobox with a search box. The search filters households only: "New household" and "Household settings" are items too (one keyboard path for everything) but a custom `filter` always keeps them, and a "No households match" status line covers the case where only they remain. Picking an item navigates.
- The last used household is kept in localStorage per user id (`splinance-last-household:<userId>`), a convenience only: `/` checks it against the list from the API.
- Categories (settings card, any member): one kind at a time (Expenses / Income), a row opens the edit dialog, a per-row menu edits or archives (with a confirmation), and archived categories fold away under "Archived (n)" with Restore. The dialog has a live preview tile, the kind (create only; it is fixed afterwards), the name (a taken name shows next to the field), 8 brand color swatches and the 35-icon grid. Swatches and icons are visually hidden native radio inputs, so arrow keys and screen reader announcements work without extra code. A new category gets the color used least among its kind. Archived categories cannot be opened for editing (the API refuses; the route redirects back).
- Settings: owners rename inline, change roles and remove members from a per-row menu, and archive (typing the household name to confirm). Everyone can leave; the only owner gets an explanation instead of a confirm button (the API enforces `LAST_OWNER` too). Confirmations use `ConfirmDialog` (an alert dialog with local state), not URL-driven modals: a confirmation should not survive a reload or a shared link.

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
- Rules: under `['rules', householdId]` (the list, and match counts with `staleTime: 0`); applying one also invalidates the household's transactions and balances.
- Imports: the history lives under `['imports', householdId]`; an import or its undo invalidates it, the household's transactions and its balances. The check is a mutation (a POST with a body), not a query. Delete marks the deleted detail stale without refetching it, for the same reason as leaving a household (below).
- Households: `householdQueries.list()` and `.detail(id)` under the `['households']` key; mutations invalidate the whole key. Leaving and archiving only mark it stale (`refetchType: 'none'`) and navigate to `/`: refetching the detail first would hit the new 404 while the page is still mounted. The household layout's loader awaits the detail (a 404 becomes `notFound()`) and warms the list for the switcher; components read the detail with `useSuspenseQuery`, which never suspends there because the loader filled the cache.

## 11. Web: forms

- TanStack Form with the shared Zod schema as validator, using `validationLogic: revalidateLogic()` and `validators: { onDynamic: schema }`: nothing is validated until the first submit, then fields re-validate live while the user fixes them.
- `onSubmit` parses the values with the schema again (applying trim/lowercase transforms) and calls `mutateAsync`.
- API errors: field-specific ones go next to the field (`EMAIL_TAKEN` on the email field via `serverError`); everything else appears in `FormError` above the form. Editing the field calls `mutation.reset()`, which clears the server error.
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
- Database-level guarantees (composite FKs, CHECKs) are tested with raw Drizzle inserts; `pgErrorOf()` unwraps the driver error to assert its code and constraint name.
- Time-based behavior (token expiry, the grace window, session expiry) uses `vi.useFakeTimers({ toFake: ['Date'] })`, which fakes only `Date`, so the pg driver's timers keep working.

Web specifics:

- MSW runs with `onUnhandledFrame: 'error'` (MSW 3's name for unhandled requests): any request without a handler fails the test. `MotionGlobalConfig.skipAnimations` makes motion animations finish instantly in tests; an element that animates in still starts at opacity 0 and settles a frame later, so assert its visibility inside `waitFor`. NumberFlow is replaced by a plain formatted `<span>` in tests (`test/number-flow-mock.tsx`): its custom element only registers in a real browser, and jsdom has no Web Animations. `test/msw.ts` has default handlers for reads that pages make in passing (empty category and rule lists for settings and the import page, no debts and no settlements for the overview); tests that care override them.
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
- Transaction flows (`transactions.spec.ts`, two people in one household via `householdWithPartner`): a percentage split whose leftover unit goes to the larger remainder, seen from both sides (row, share, month totals, the edit form); a private expense that the partner sees neither in the list nor in the totals, and whose direct link sends them back to the list; two people editing the same version (the second save gets the conflict, loads the newer version and saves again); delete with undo, then delete for good. On a phone (`transactions.mobile.spec.ts`): adding from the empty state and the floating button in the drawer, opening a row, back closes it.
- Settling up (`settle-up.spec.ts`): leaving with a debt is refused with the reason in the dialog; a partial payment (with the live hint and a note) leaves the rest open for both people; the prefilled rest squares them up and the partner can leave. Deleting a payment reopens the debt, undo closes it again, for both people.
- Bank import (`import.spec.ts`): a made-up K&H export (built in the test, never a real file) goes through the real file input; a hand-entered purchase shows up as a possible duplicate and the Revolut top-up as an own transfer; two rows are imported (one renamed, one shared, which reaches the partner's balance); the same file again leaves them out as already imported; undoing the import from the history removes them and the partner's debt. A file that is not an export is explained.
- Amounts are matched with `money('10 001 Ft')`, which accepts any whitespace (the app groups with a no-break space). Month totals are read with `monthStat(page, 'Spent')`; `MoneyFlow`'s visually hidden copy is what the assertion sees.
- Locators go by role and label, like the web tests. `field(page, label)` matches a label exactly, ignoring the required asterisk, so "Password" does not also match the "Show password" button.
- Debugging: `pnpm --filter @splinance/e2e e2e:ui` (UI mode) or `e2e:report` (last HTML report with traces of failed tests).

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

## 15. Known limitations

- Access tokens cannot be revoked before they expire (15 minutes).
- Rate limits are per IP and in memory: they reset on restart and are not shared between instances (Redis is planned for Phase 6). Behind a reverse proxy, `trust proxy` must be configured first (Phase 3 deploy), otherwise every request appears to come from the proxy's IP.
- Registration reveals whether an email exists (409). Avoiding this needs email verification, which is out of scope for now.
- No email verification, password reset, account deletion or session list yet.
- Invite links are not bound to an email: whoever holds a valid link can join. Owners can list and revoke pending links; links expire after 7 days.
- A removed member can rejoin through any other valid invite link they see; there is no ban list.
- Editing an old transaction that involves someone who left, or deleting or restoring a transaction or settlement, can reopen a debt with a former member. It shows up in the balances and can be settled (an owner records it), but the former member cannot see it.
- The inline theme script in `index.html` needs a CSP hash if a Content Security Policy is added to the frontend.
- Cross-tab refresh locking is covered by reasoning and the server grace window, not by automated tests (jsdom has no Web Locks, and the e2e suite does not open two tabs of one user).
- The e2e suite runs Chromium only (desktop and Pixel 7 emulation), not Firefox or WebKit/Safari.
