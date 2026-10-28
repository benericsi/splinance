import { describe, expect, it } from 'vitest';
import { databaseName, parseEnv } from './env';

const required = {
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

describe('parseEnv', () => {
  it('applies defaults', () => {
    expect(parseEnv(required)).toEqual({
      ...required,
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      ACCESS_TOKEN_TTL_SECONDS: 900,
      REFRESH_TOKEN_TTL_DAYS: 30,
      COOKIE_SECURE: false,
      RATE_LIMIT_DISABLED: false,
      DEMO_MODE: false,
      DEMO_TTL_DAYS: 7,
      DEMO_MAX_ACTIVE: 200,
    });
  });

  it('coerces PORT from string', () => {
    expect(parseEnv({ ...required, PORT: '8080' }).PORT).toBe(8080);
  });

  it('throws on invalid values', () => {
    expect(() => parseEnv({ ...required, PORT: 'abc' })).toThrow(/Invalid environment variables/);
  });

  it('requires a postgres DATABASE_URL', () => {
    expect(() => parseEnv({ ...required, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ ...required, DATABASE_URL: 'mysql://localhost/db' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('requires a JWT secret of at least 32 characters', () => {
    expect(() => parseEnv({ ...required, JWT_ACCESS_SECRET: 'short' })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });

  it('makes cookies secure by default only in production', () => {
    expect(parseEnv({ ...required, NODE_ENV: 'production' }).COOKIE_SECURE).toBe(true);
    expect(
      parseEnv({ ...required, NODE_ENV: 'production', COOKIE_SECURE: 'false' }).COOKIE_SECURE,
    ).toBe(false);
  });

  it('refuses to disable rate limits in production', () => {
    expect(parseEnv({ ...required, RATE_LIMIT_DISABLED: 'true' }).RATE_LIMIT_DISABLED).toBe(true);
    expect(() =>
      parseEnv({ ...required, NODE_ENV: 'production', RATE_LIMIT_DISABLED: 'true' }),
    ).toThrow(/RATE_LIMIT_DISABLED/);
  });

  it('refuses the example JWT secret in production', () => {
    const example = {
      ...required,
      JWT_ACCESS_SECRET: 'change-me-to-a-random-string-of-at-least-32-chars',
    };
    expect(parseEnv(example).JWT_ACCESS_SECRET).toBe(example.JWT_ACCESS_SECRET);
    expect(() => parseEnv({ ...example, NODE_ENV: 'production' })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('allows DEMO_MODE only on a database whose name ends in _demo', () => {
    const demo = { ...required, DEMO_MODE: 'true' };
    expect(() => parseEnv(demo)).toThrow(/DEMO_MODE/);
    expect(() =>
      parseEnv({ ...demo, DATABASE_URL: 'postgres://u:p@localhost:5432/splinance' }),
    ).toThrow(/DEMO_MODE/);
    expect(() =>
      parseEnv({ ...demo, DATABASE_URL: 'postgres://u:p@localhost:5432/splinance_demo_old' }),
    ).toThrow(/DEMO_MODE/);
    const env = parseEnv({ ...demo, DATABASE_URL: 'postgres://u:p@db:5432/splinance_demo' });
    expect(env.DEMO_MODE).toBe(true);
  });

  it('reads the database name from the URL', () => {
    expect(databaseName('postgres://u:p@localhost:5432/splinance_demo?sslmode=require')).toBe(
      'splinance_demo',
    );
    expect(databaseName('postgresql://localhost/my%5Fdemo')).toBe('my_demo');
  });
});
