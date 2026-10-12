/** The first message among a field's errors: validators report strings or issues ({ message }). */
export function firstError(errors: readonly unknown[]): string | undefined {
  for (const error of errors) {
    if (typeof error === 'string') return error;
    if (typeof error === 'object' && error !== null && 'message' in error)
      return String(error.message);
  }
  return undefined;
}
