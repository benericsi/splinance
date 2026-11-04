import { Writable } from 'node:stream';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { loggerOptions } from './logger';

function capture(nodeEnv: 'production' | 'test') {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      done();
    },
  });
  const log = pino(loggerOptions({ LOG_LEVEL: 'info', NODE_ENV: nodeEnv }), stream);
  return { log, lines };
}

describe('loggerOptions', () => {
  it('writes the level as text, so log platforms tell warnings from info', () => {
    const { log, lines } = capture('production');
    log.info('fine');
    log.warn({ sessionId: 's1' }, 'Refresh token reuse detected, session revoked');
    expect(lines.map((line) => line.level)).toEqual(['info', 'warn']);
    expect(lines[1]).toMatchObject({ sessionId: 's1' });
  });

  it('keeps redacting credentials', () => {
    const { log, lines } = capture('test');
    log.info({ req: { headers: { authorization: 'Bearer secret', cookie: 'refresh_token=x' } } });
    expect(JSON.stringify(lines[0])).not.toMatch(/secret|refresh_token=x/);
  });
});
