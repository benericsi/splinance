import { z } from 'zod';

// Normalized before validation so "Anna@Example.com " and "anna@example.com" are the same account.
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address').max(254, 'Email is too long'));

// Length over complexity rules (NIST SP 800-63B). Upper bound keeps hashing cost predictable.
export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be at most 128 characters');

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Display name is required')
  .max(50, 'Display name must be at most 50 characters');

export const registerInputSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
});

export type RegisterInput = z.infer<typeof registerInputSchema>;

// No password policy on login: rules may change, existing passwords must still work.
export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(128),
});

export type LoginInput = z.infer<typeof loginInputSchema>;

export const userSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
});

export type User = z.infer<typeof userSchema>;

/** Returned by register, login and refresh. The refresh token travels only in an httpOnly cookie. */
export const authResponseSchema = z.object({
  accessToken: z.string(),
  user: userSchema,
});

export type AuthResponse = z.infer<typeof authResponseSchema>;

export const meResponseSchema = z.object({
  user: userSchema,
});

export type MeResponse = z.infer<typeof meResponseSchema>;
