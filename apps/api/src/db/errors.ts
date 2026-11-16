const UNIQUE_VIOLATION = '23505';
/** lock_not_available (lock_timeout) and query_canceled (statement_timeout). */
const TIMED_OUT = new Set(['55P03', '57014']);

interface PgError {
  code?: string;
  constraint?: string;
}

/** Drizzle wraps driver errors, so check both the error and its cause. */
export function isUniqueViolation(err: unknown, constraint: string): boolean {
  const candidates = [err, err instanceof Error ? err.cause : undefined];
  return candidates.some((candidate) => {
    if (typeof candidate !== 'object' || candidate === null) return false;
    const pgError = candidate as PgError;
    return pgError.code === UNIQUE_VIOLATION && pgError.constraint === constraint;
  });
}

/** A statement or lock wait cut off by the connection's timeouts (client.ts). */
export function isTimeout(err: unknown): boolean {
  const candidates = [err, err instanceof Error ? err.cause : undefined];
  return candidates.some(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      TIMED_OUT.has((candidate as PgError).code ?? ''),
  );
}

/** Runs `write`, turning a unique violation of `constraint` into `makeError()` (a 409). */
export async function mapUniqueViolation<T>(
  write: Promise<T>,
  constraint: string,
  makeError: () => Error,
): Promise<T> {
  try {
    return await write;
  } catch (err) {
    if (isUniqueViolation(err, constraint)) throw makeError();
    throw err;
  }
}
