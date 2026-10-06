import { defineConfig } from 'drizzle-kit';

// drizzle-kit does not read .env itself; load it when present (local dev).
try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on the real environment.
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  casing: 'snake_case',
  strict: true,
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});
