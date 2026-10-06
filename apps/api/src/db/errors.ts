const UNIQUE_VIOLATION = '23505';

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
