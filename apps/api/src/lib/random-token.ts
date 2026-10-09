import { createHash, randomBytes } from 'node:crypto';

/** 256 bits of randomness, base64url (43 characters); opaque to the client. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

// A fast hash is fine here: these tokens are long random values, not guessable passwords.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
