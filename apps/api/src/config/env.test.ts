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
      TRUST_PROXY: 0,
      REGISTRATION: 'open',
      REGISTRATION_ALLOWLIST: [],
    });
  });

  it('closes registration in production unless it is set', () => {
    expect(parseEnv({ ...required, NODE_ENV: 'production' }).REGISTRATION).toBe('closed');
    const allowlist = parseEnv({
      ...required,
      NODE_ENV: 'production',
      REGISTRATION: 'allowlist',
      REGISTRATION_ALLOWLIST: ' Anna@Example.com, ben@example.com ,',
    });
    expect(allowlist.REGISTRATION).toBe('allowlist');
    expect(allowlist.REGISTRATION_ALLOWLIST).toEqual(['anna@example.com', 'ben@example.com']);
  });

  it('refuses an empty or malformed allowlist', () => {
    expect(() => parseEnv({ ...required, REGISTRATION: 'allowlist' })).toThrow(
      /REGISTRATION_ALLOWLIST/,
    );
    expect(() =>
      parseEnv({ ...required, REGISTRATION: 'allowlist', REGISTRATION_ALLOWLIST: 'anna' }),
    ).toThrow(/REGISTRATION_ALLOWLIST/);
  });

  it('accepts a migration URL only for the same database', () => {
    const owner = 'postgres://owner:secret@localhost:5432/db';
    expect(parseEnv({ ...required, MIGRATE_DATABASE_URL: owner }).MIGRATE_DATABASE_URL).toBe(owner);
    expect(() =>
      parseEnv({ ...required, MIGRATE_DATABASE_URL: 'postgres://owner:secret@localhost/other' }),
    ).toThrow(/MIGRATE_DATABASE_URL/);
  });

  it('trusts at most a few proxy hops', () => {
    expect(parseEnv({ ...required, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
    expect(() => parseEnv({ ...required, TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/);
    expect(() => parseEnv({ ...required, TRUST_PROXY: '10' })).toThrow(/TRUST_PROXY/);
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
