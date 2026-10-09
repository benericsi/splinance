import { jwtVerify, SignJWT } from 'jose';
import { env } from '../../config/env';

const ISSUER = 'splinance-api';
const AUDIENCE = 'splinance-web';
const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export interface AccessTokenClaims {
  userId: string;
  sessionId: string;
}

export function signAccessToken({ userId, sessionId }: AccessTokenClaims): Promise<string> {
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${String(env.ACCESS_TOKEN_TTL_SECONDS)}s`)
    .sign(secret);
}

/** Throws if the token is malformed, tampered with, expired or issued for someone else. */
export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, secret, {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: ['HS256'],
  });
  if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
    throw new Error('Access token is missing required claims');
  }
  return { userId: payload.sub, sessionId: payload.sid };
}
