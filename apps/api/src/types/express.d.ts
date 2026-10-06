import type { AccessTokenClaims } from '../modules/auth/tokens';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth. */
      auth?: AccessTokenClaims;
    }
  }
}

export {};
