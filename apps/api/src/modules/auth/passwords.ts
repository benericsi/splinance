import { hash, verify } from '@node-rs/argon2';

// @node-rs/argon2 defaults to Argon2id with m=19456 KiB, t=2, p=1 (OWASP minimum).
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}

let dummyHash: Promise<string> | undefined;

/**
 * Runs a real verification against a throwaway hash when the email is unknown,
 * so login response time does not reveal whether an account exists.
 */
export async function verifyDummyPassword(password: string): Promise<void> {
  dummyHash ??= hash('splinance-timing-equalizer');
  await verify(await dummyHash, password);
}
