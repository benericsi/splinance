// Defaults to the docker compose test database; override for a different host or port.
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://splinance:splinance@localhost:5432/splinance_test';
