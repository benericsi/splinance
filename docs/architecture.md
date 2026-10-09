# Splinance architecture

How the code works today, why it is built this way, and the parts that are easy to get wrong. For the database tables and their conventions see [data-model.md](data-model.md); for coding rules see [CLAUDE.md](../CLAUDE.md).

Status: Phase 0 (foundation) and Phase 1 (auth, households, invites, onboarding; API and web) are done. Transactions (Phase 2) and everything after are not built yet.

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
docs/             data-model.md, architecture.md (this file)
docker/           Postgres init script (creates the test database)
```

Key files by concern:

| Concern                       | Files                                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| API entry, middleware chain   | `apps/api/src/index.ts`, `apps/api/src/app.ts`                                                                   |
| Env validation                | `apps/api/src/config/env.ts`                                                                                     |
| DB client, schema, migrations | `apps/api/src/db/*`, `apps/api/drizzle/*.sql`                                                                    |
| Auth (API)                    | `apps/api/src/modules/auth/*`, `apps/api/src/middleware/require-auth.ts`                                         |
| Households and invites (API)  | `apps/api/src/modules/households/*`, `apps/api/src/modules/invites/*`                                            |
| Errors                        | `apps/api/src/lib/http-error.ts`, `apps/api/src/middleware/error-handler.ts`, `packages/shared/src/api-error.ts` |
| Web entry, router setup       | `apps/web/index.html`, `apps/web/src/main.tsx`, `apps/web/src/routes/*`                                          |
| HTTP client, auth store       | `apps/web/src/lib/http.ts`, `apps/web/src/lib/auth-store.ts`                                                     |
| Auth (web)                    | `apps/web/src/features/auth/*`                                                                                   |
| Households (web), app shell   | `apps/web/src/features/households/*`, `apps/web/src/routes/_authenticated/h/*`                                   |
| URL-driven modals             | `apps/web/src/components/route-dialog.tsx`, `apps/web/src/lib/route-modal.ts`                                    |
| Theme                         | `apps/web/src/lib/theme.ts` + inline script in `apps/web/index.html`                                             |
| Brand                         | `packages/shared/src/brand.ts`, `apps/web/src/components/brand/*`, `apps/web/src/index.css`                      |

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

`pnpm check` runs exactly what CI runs: Prettier check, ESLint (type-aware, `strictTypeChecked`), `tsc` per package, all tests, all builds. Run it before pushing.

### Branches and pull requests

- One branch per change (`feat/...`, `chore/...`, `ci/...`, `docs/...`), merged via pull request. `main` has a GitHub ruleset: PR required, the CI check `Lint, typecheck, test, build` must pass and be up to date, no force push, no deletion.
- CI (`.github/workflows/ci.yml`) runs on Ubuntu with a Postgres 18 service container using the same credentials as Docker Compose, so the default test database URL works unchanged.
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
express.json(100kb)      body parsing with a size cap
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
| `DELETE /api/households/:id`                   | owner                 |            | 204, archived (404 for everyone after)                    |                                                                                 |
| `POST /api/households/:id/leave`               | member                |            | 204                                                       | 409 `LAST_OWNER`                                                                |
| `PATCH /api/households/:id/members/:userId`    | owner                 | `{ role }` | 200 `{ member }`                                          | 404 `MEMBER_NOT_FOUND`, 409 `LAST_OWNER`                                        |
| `DELETE /api/households/:id/members/:userId`   | owner                 |            | 204                                                       | 400 `CANNOT_REMOVE_SELF`, 404 `MEMBER_NOT_FOUND`                                |
| `POST /api/households/:id/invites`             | owner                 |            | 201 `{ invite, token }`                                   |                                                                                 |
| `GET /api/households/:id/invites`              | owner                 |            | 200 `{ invites }` (pending only)                          |                                                                                 |
| `DELETE /api/households/:id/invites/:inviteId` | owner                 |            | 204                                                       | 404 `INVITE_NOT_FOUND` (unknown or no longer pending)                           |
| `GET /api/invites/:token`                      | none, 60 / 15 min     |            | 200 `{ invite: { householdName, invitedBy, expiresAt } }` | 404 `INVITE_NOT_FOUND`, 410 `INVITE_REVOKED` / `INVITE_USED` / `INVITE_EXPIRED` |
| `POST /api/invites/:token/accept`              | any user, 30 / 15 min |            | 200 `{ household }`, caller is member                     | same as preview, 409 `ALREADY_MEMBER` (invite stays unused)                     |

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
| `health.ts`         | live/ready response schemas                                                                                                          | API health routes, web status panel                         |
| `auth.ts`           | `emailSchema` (trims, lowercases), `registerInputSchema`, `loginInputSchema`, `userSchema`, `authResponseSchema`, `meResponseSchema` | API route parsing, web forms and API client                 |
| `password/rules.ts` | `PASSWORD_RULES`, `checkPassword()`                                                                                                  | register schema (server enforcement) and the live checklist |
| `brand.ts`          | palette, logo pairings, `pairingFor(id)`, `contrastRatio()`, `readableTextOn()`                                                      | web brand components, a contrast test                       |
| `households.ts`     | `HOUSEHOLD_ROLES`, `CURRENCIES` (also the Postgres enums), household/member input and response schemas                               | API routes and Drizzle enums, web (next PR)                 |
| `invites.ts`        | `INVITE_TTL_DAYS`, `inviteTokenSchema`, create/list/preview response schemas                                                         | API routes, web (next PR)                                   |

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
    _authenticated/h/$householdId/index.tsx    /h/:id           overview
    _authenticated/h/$householdId/settings.tsx /h/:id/settings  rename, members, danger zone; <Outlet /> for modals
      _authenticated/h/$householdId/settings.invite.tsx /h/:id/settings/invite  invite dialog (owners only)
invite.tsx                 /invite#<token>  public invite landing page (logged in or out)
```

- Household shell (`HouseholdShell`): on desktop a sidebar with the logo, the household switcher and the section links; the account menu sits top right, level with the page heading (`PageHeader` leaves room for it). On phones a top bar holds the switcher and account menu, and the sections become a bottom tab bar. New sections are added to `NAV_ITEMS`.
- The last used household is kept in localStorage per user id (`splinance-last-household:<userId>`), a convenience only: `/` checks it against the list from the API.
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
- Logout or a failed mid-session refresh flips `authStore` to anonymous. `main.tsx` subscribes to that transition and calls `router.invalidate()`, so guards re-run and protected pages redirect.
- Not found and errors: the root shows full-page versions; the router defaults (`defaultNotFoundComponent`, `defaultErrorComponent`) render inline inside layouts. "Try again" resets the error boundary and re-runs loaders.
- Page titles: each page renders exactly one `<PageTitle title="..." />`. React 19 hoists `<title>` into `<head>`; multiple titles at once are unsupported, so layouts never render one.

### URL-driven modals

Every modal has a URL, so reload, sharing a link and the back button work (the pattern comes from the Bump project, which used React Router's "background location"). Two flavors:

| Flavor                   | Use for                                         | How                                                                                                                           |
| ------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Search param (`?modal=`) | app-wide actions, openable from any page        | `_authenticated` validates `modal` with a Zod enum (unknown values are dropped) and renders the matching dialog over the page |
| Child route              | modals that belong to a page (invite, edit ...) | a child route renders a dialog over its parent route; a pasted link shows the real parent underneath                          |

- `RouteDialog` is the shell for both: a Base UI dialog on larger screens, a Base UI drawer (bottom sheet, swipe to dismiss) below the `sm` breakpoint. It is always open while mounted; closing plays the exit animation, then calls `onClose`.
- Links that open a modal pass `state={OPEN_MODAL_STATE}`. `useCloseModal(fallback)` goes back in history when that flag is set (closing does not leave a "modal open" entry behind, so back does not reopen it); for a pasted link there is nothing to go back to, so it runs the fallback, a `replace` navigation to the page underneath.
- After a successful submit the dialog navigates with `replace: true`, which swaps out the modal entry.

## 10. Web: data layer

Layering, per feature folder (`src/features/<name>/`):

```
component  --uses-->  hooks.ts (useLogin, useLogout, ...)       mutations + cache invalidation
           --uses-->  queries.ts (healthQueries.live(), ...)    queryOptions: key + fetcher
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

- Queries are `queryOptions` factories with hierarchical keys (`healthQueries.all()`, `.live()`), usable both in route loaders (`queryClient.query(...)`) and components (`useQuery(...)`).
- Query retries: none for 4xx (`ApiError` with status 400-499), up to 2 otherwise.
- `MutationCache.onError` shows a sonner toast for every failed mutation. A mutation opts out with `meta: { suppressErrorToast: true }` when the component shows the error itself (the auth forms do).
- `useLogout` clears `authStore` and the whole query cache in `onSettled`, even if the request fails, so no data of the previous user stays in memory.
- Households: `householdQueries.list()` and `.detail(id)` under the `['households']` key; mutations invalidate the whole key. Leaving and archiving only mark it stale (`refetchType: 'none'`) and navigate to `/`: refetching the detail first would hit the new 404 while the page is still mounted. The household layout's loader awaits the detail (a 404 becomes `notFound()`) and warms the list for the switcher; components read the detail with `useSuspenseQuery`, which never suspends there because the loader filled the cache.

## 11. Web: forms

- TanStack Form with the shared Zod schema as validator, using `validationLogic: revalidateLogic()` and `validators: { onDynamic: schema }`: nothing is validated until the first submit, then fields re-validate live while the user fixes them.
- `onSubmit` parses the values with the schema again (applying trim/lowercase transforms) and calls `mutateAsync`.
- API errors: field-specific ones go next to the field (`EMAIL_TAKEN` on the email field via `serverError`); everything else appears in `FormError` above the form. Editing the field calls `mutation.reset()`, which clears the server error.
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
- Shadcn components in `src/components/ui` are owned code (Base UI primitives underneath). Links styled as buttons use `buttonVariants()` on the `Link`, because Base UI's `Button` must render a real `<button>`.

## 13. Testing

| Package | Runner                                 | Strategy                                                                                 |
| ------- | -------------------------------------- | ---------------------------------------------------------------------------------------- |
| shared  | Vitest                                 | Pure unit tests (schemas, password rules, contrast math, pairing distribution)           |
| api     | Vitest + Supertest                     | Integration tests against a real Postgres (`splinance_test`); migrations in global setup |
| web     | Vitest + jsdom + Testing Library + MSW | Components and the HTTP client against MSW handlers; router tests with a memory history  |

API specifics:

- Test files run sequentially (`fileParallelism: false`) because they share one database.
- Tests that write data call `resetDatabase()` in `beforeEach`. It truncates every table in the `public` schema and refuses to run unless the database name ends in `_test`.
- A fresh `createApp()` per test keeps rate-limit counters isolated.
- Household tests create users with `createTestUser()` (`test/users.ts`): a direct insert with a fake hash plus `bearer(user)`, which signs an access token at call time. No Argon2 and no register rate limit, so the permission matrix (every route x owner, member, former member, outsider, anonymous) stays fast, and tokens stay valid after the fake clock jumps 7 days.
- Database-level guarantees (composite FKs, CHECKs) are tested with raw Drizzle inserts; `pgErrorOf()` unwraps the driver error to assert its code and constraint name.
- Time-based behavior (token expiry, the grace window, session expiry) uses `vi.useFakeTimers({ toFake: ['Date'] })`, which fakes only `Date`, so the pg driver's timers keep working.

Web specifics:

- MSW runs with `onUnhandledFrame: 'error'` (MSW 3's name for unhandled requests): any request without a handler fails the test.
- `test/setup.ts` stubs `window.matchMedia` (jsdom lacks it) and resets the auth store and session-restore cache after each test.
- `getField(label)` finds inputs by label while ignoring the required asterisk.
- jsdom has no `navigator.locks` and no CSS animations, so cross-tab locking is not covered, and Base UI popups close after their exit animation (tests use `waitFor`).

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
17. **A hidden browser pane freezes Base UI exit animations.** Popups wait for their CSS transitions (and `requestAnimationFrame`) before unmounting. In a background or hidden browser view those never advance, so a closed drawer stays mounted with `data-ending-style` until the page is visible again. Not a bug in the app; verify closing behavior in a visible window or in jsdom tests.
18. **Exiting a household must not refetch it in place.** After leave or archive the household detail is a 404 for the user. An immediate refetch (normal invalidation) would make the still-mounted settings page throw into the error boundary before the navigation to `/` happens. The hooks invalidate with `refetchType: 'none'`; the `/` loader then refetches the list.
19. **Preview port collisions.** A tool or platform that sets `PORT` for a process makes the API bind that port (`--env-file` never overrides existing env vars). Vite uses `strictPort`, so it fails instead of silently moving.

## 15. Known limitations

- Access tokens cannot be revoked before they expire (15 minutes).
- Rate limits are per IP and in memory: they reset on restart and are not shared between instances (Redis is planned for Phase 6). Behind a reverse proxy, `trust proxy` must be configured first (Phase 3 deploy), otherwise every request appears to come from the proxy's IP.
- Registration reveals whether an email exists (409). Avoiding this needs email verification, which is out of scope for now.
- No email verification, password reset, account deletion or session list yet.
- Invite links are not bound to an email: whoever holds a valid link can join. Owners can list and revoke pending links; links expire after 7 days.
- A removed member can rejoin through any other valid invite link they see; there is no ban list.
- Leaving and archiving do not check balances yet (Phase 3).
- The inline theme script in `index.html` needs a CSP hash if a Content Security Policy is added to the frontend.
- Cross-tab refresh locking is covered by reasoning and the server grace window, not by automated tests (jsdom has no Web Locks).
