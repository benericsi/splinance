// Fixed in apps/web/vite.config.ts (`preview.port`).
export const WEB_PORT = 4173;
export const API_PORT = 3100;

// Defaults to the docker compose Postgres; global setup creates the database if needed.
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgres://splinance:splinance@localhost:5432/splinance_e2e';

// The demo instance (playwright.demo.config.ts): its own API, web build and database, whose
// name must end in _demo for DEMO_MODE.
export const DEMO_WEB_PORT = 4273;
export const DEMO_API_PORT = 3200;
export const E2E_DEMO_DATABASE_URL =
  process.env.E2E_DEMO_DATABASE_URL ??
  'postgres://splinance:splinance@localhost:5432/splinance_e2e_demo';
