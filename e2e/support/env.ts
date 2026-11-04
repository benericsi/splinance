// Fixed in apps/web/vite.config.ts (`preview.port`).
export const WEB_PORT = 4173;
export const API_PORT = 3100;

// The fake OpenID provider standing in for Google (packages/fake-oidc). On 127.0.0.1, another
// site than the app on localhost, so the round trip is cross-site like the real one.
export const FAKE_OIDC_PORT = 3300;
export const FAKE_OIDC_ISSUER = `http://127.0.0.1:${String(FAKE_OIDC_PORT)}`;
export const FAKE_OIDC_CLIENT = { id: 'e2e-client', secret: 'e2e-secret' };

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
