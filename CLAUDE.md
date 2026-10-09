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

- Read `docs/architecture.md` (how everything works, including "The hard parts") and `docs/data-model.md` before larger changes; update them in the same PR when behavior changes

- `packages/shared` is consumed as TypeScript source (no build step); the api bundles it with tsdown
- TypeScript pinned to 6.0 until typescript-eslint supports TS 7; `@types/node` matches the Node runtime major
- Module resolution is `Bundler` everywhere, so no `.js` extensions in relative imports
- Commands: `pnpm check` (same steps as CI), `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format`
- Database: schema in `apps/api/src/db/schema/` (one file per table, shared column helpers in `columns.ts`), migrations generated with `db:generate` into `apps/api/drizzle` and committed; never use `drizzle-kit push`. Do not edit or regenerate a migration once merged
- Data model and its conventions (uuidv7 ids, money, dates, composite FKs, named constraints) are documented in `docs/data-model.md`; update it in the same PR as any schema change. Create tables only when a feature needs them
- API routes are mounted under `/api`; errors use the shared `apiErrorResponseSchema` shape
- API code is organized by domain in `apps/api/src/modules/<name>/` (`<name>.routes.ts` parses input with shared Zod schemas, `<name>.service.ts` holds business logic and Drizzle queries; services accept `Db` so they run inside or outside a transaction). Multi-row writes use `db.transaction`
- Protected routes use `requireAuth` and read the user with `getAuth(req)`; authorization checks live in services
- Web: file-based TanStack Router routes in `apps/web/src/routes` (`routeTree.gen.ts` is generated, committed, not linted); protected pages live under the `_authenticated` layout route; Vite proxies `/api` to the API in dev
- Web data layer (service layer + custom hooks), per feature in `src/features/<name>/`:
  - `api.ts`: service functions, the only place that imports `http` from `src/lib/http.ts`; object params; return parsed data or void
  - `queries.ts`: `queryOptions` factories with hierarchical keys (`xQueries.all()`, `.list(params)`, `.detail(id)`), usable in route loaders and components
  - `hooks.ts`: one custom hook per mutation use case; owns cache invalidation; set `meta: { suppressErrorToast: true }` only when the component renders the error itself
  - No DTO/model/mapper layer: shared Zod schemas are the contract and are validated at runtime
- `http` is a module-level client (`createHttpClient` factory): attaches the access token from the in-memory `authStore`, refreshes once on 401 (single in-flight refresh, Web Locks across tabs) and retries once. Never store tokens in localStorage
- Failed mutations show a sonner toast globally (`MutationCache.onError`); toasts use `sonner` directly, not the shadcn wrapper
- Forms: TanStack Form with the shared Zod schema via `revalidateLogic()` + `onDynamic`; field-specific API errors next to the field, others in `FormError`. `TextField` takes a placeholder; password fields get a show/hide toggle, no other input icons
- Password policy lives once in `packages/shared/src/password/rules.ts`: required rules (length >= 10, no email/name, not common) block registration and are enforced by the API; composition rules (lower/upper/number) are non-blocking hints (NIST SP 800-63B). The common password list is generated (`pnpm --filter @splinance/shared gen:common-passwords`), do not edit it by hand
- Theme: `src/lib/theme.ts` store (light/dark/system, localStorage, `.dark` on <html>) plus an inline script in `index.html` that applies it before first paint; keep both in sync. Every UI change must look right in light and dark
- Layouts: `_auth` (split screen with `BrandPanel`, redirects logged-in users), onboarding pages under `_authenticated/welcome*` (same split screen via `OnboardingLayout`, steps in the URL), `_authenticated` (redirects to /login, hosts `?modal=` dialogs) and `_authenticated/h/$householdId` (`HouseholdShell`: sidebar with household switcher and sections, account menu top right; phones get a top bar and bottom tabs). Household pages use `PageHeader` for their h1
- Modals are URL-driven: app-wide ones via `?modal=<name>` (Zod enum in `_authenticated`), page-bound ones as child routes over their parent. Always render `RouteDialog` (dialog, or drawer on phones), open links with `state={OPEN_MODAL_STATE}`, close with `useCloseModal(fallback)`. Confirmations (remove, leave, archive) are `ConfirmDialog` with local state, never URL-driven
- Invite tokens live in the URL fragment (`/invite#token`) and pass through login only via sessionStorage (`features/invites/pending-invite.ts`); never put a token in a query string
- Every page renders exactly one `<PageTitle title="..." />` (React 19 hoists it); layouts never render a title
- Boot: `index.html` holds a static splash (with a CSS-only "taking longer" fallback after 8 s); `main.tsx` awaits `router.load()` before rendering, so there is no blank frame or login flash
- Not found / error states: `NotFoundPage` / `ErrorPage` (full page at the root, inline inside layouts via router defaults); throw `notFound()` for missing resources
- shadcn/ui on Base UI; components in `src/components/ui` are owned code and may be edited. Icons: lucide only
- Brand: palette, logo pairings and contrast helpers live in `packages/shared/src/brand.ts` (mirrored as `--color-brand-*` in `apps/web/src/index.css`; keep both in sync). Brand colors are fills; text uses role tokens `text-link`, `text-positive`, `text-negative` (light/dark tuned to >= 4.5:1). UI chrome stays neutral. Every logo pairing must stay >= 3:1 (enforced by a test)
- Logo: pink-to-orange split S on a softly lit blue tile (`LogoMark` / `Logo`, crisp). `public/favicon.svg` (crisp) and `public/logo.svg` (grainy, for large static uses and the iOS icon) must match the component; PNGs via `pnpm --filter @splinance/web gen:icons`. Keep the S at >= 3:1 against the tile glow
- Avatars only through wrappers: `UserAvatar` (facehash with brand colors, seeded with user id) and `HouseholdAvatar` (`@outpacelabs/avatars` mesh gradient in brand colors, seeded with household id, rounded square). The auth screen uses the hand-composed `PosterWall` (`components/brand`): curated art, not generated
- Fonts: Inter (body, 14px base, use `tabular-nums` for amounts) and Bricolage Grotesque (headings, `font-heading`), self-hosted via fontsource (never Google Fonts CDN, GDPR)
- Web tests mock the API with MSW (`test/msw.ts`, unhandled requests fail the test)
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
