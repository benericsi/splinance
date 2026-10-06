import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

const DATABASE_URL = 'postgres://user:pass@localhost:5432/db';

describe('parseEnv', () => {
  it('applies defaults', () => {
    expect(parseEnv({ DATABASE_URL })).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      DATABASE_URL,
    });
  });

  it('coerces PORT from string', () => {
    expect(parseEnv({ DATABASE_URL, PORT: '8080' }).PORT).toBe(8080);
  });

  it('throws on invalid values', () => {
    expect(() => parseEnv({ DATABASE_URL, PORT: 'abc' })).toThrow(/Invalid environment variables/);
  });

  it('requires a postgres DATABASE_URL', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ DATABASE_URL: 'mysql://localhost/db' })).toThrow(/DATABASE_URL/);
  });
});
