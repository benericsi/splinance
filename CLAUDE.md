# Splinance

Splinance is a household expense web app for tracking personal spending and shared expenses with a partner (also usable by roommates or families). It is a solo portfolio project, built to be finished, deployed, and explained in interviews for a Fullstack Developer role (about 3 years of experience, Hungary, 2026). The goal is to deepen Node/TypeScript backend skills: auth, data modeling, authorization, background jobs, tests, CI, and deployment.

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
- Backend: Node.js, Express, TypeScript, PostgreSQL (ORM or query builder still to decide, e.g. Drizzle), Zod validation, Argon2, pino
- Later: BullMQ + Redis for jobs
- Tooling: pnpm monorepo (apps/web, apps/api, packages/shared), Vitest, Supertest, Playwright, Docker Compose, GitHub Actions

## Key design decisions

- Money stored as integer minor units, never floats
- Splits use the largest remainder method so shares always sum to the total
- Balances are derived from transactions, splits, and settlements, not stored
- Multi-row writes use SQL transactions
- Soft delete and an audit log for transactions
- Authorization enforced in the service layer; private data readable only by its creator
- Auth: short-lived access token plus rotated httpOnly refresh token, rate limiting, Helmet

## Roadmap (about 14 weeks part-time)

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
- Use single hyphens, not em dashes
- Explain tradeoffs briefly, and point out risks or mistakes you notice
