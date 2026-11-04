import { type LoggerOptions, pino } from 'pino';
import { type Env, env } from '../config/env';

/**
 * Production writes one JSON line per event with the level as text (`"level":"warn"`): pino's
 * default is a number (40), which Railway does not map, so every line showed as INFO and
 * warnings (refresh token reuse, failed provider sign-ins) did not stand out. Development
 * keeps the numbers for pino-pretty.
 */
export function loggerOptions({
  LOG_LEVEL,
  NODE_ENV,
}: Pick<Env, 'LOG_LEVEL' | 'NODE_ENV'>): LoggerOptions {
  return {
    level: LOG_LEVEL,
    redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    ...(NODE_ENV === 'development'
      ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
      : { formatters: { level: (label) => ({ level: label }) } }),
  };
}

export const logger = pino(loggerOptions(env));
