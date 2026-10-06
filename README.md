# Splinance

Household expense tracker for personal spending and shared expenses with a partner, roommates or family.

> Work in progress.

## Tech stack

- **API:** Node.js, Express 5, TypeScript, Zod, pino
- **Web:** React, Vite, TanStack Router/Query/Form, shadcn/ui, Tailwind CSS
- **Shared:** Zod schemas and types used by both apps
- **Tooling:** pnpm workspaces, Vitest, Supertest, ESLint, Prettier

## Repository layout

```
apps/api         Express REST API
apps/web         React SPA (planned)
packages/shared  Zod schemas and types shared by api and web
```

## Getting started

Requirements: Node.js 22.12+ and pnpm 10 (`corepack enable`).

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm dev
```

The API runs at http://localhost:3000. Check it with `GET /health`.

## Scripts

| Command          | What it does                  |
| ---------------- | ----------------------------- |
| `pnpm dev`       | Start all apps in watch mode  |
| `pnpm build`     | Build all apps                |
| `pnpm test`      | Run all tests                 |
| `pnpm typecheck` | Type-check every package      |
| `pnpm lint`      | Lint with ESLint (type-aware) |
| `pnpm format`    | Format with Prettier          |
