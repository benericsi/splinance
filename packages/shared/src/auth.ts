import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, requiredPasswordIssues } from './password/rules';
import { localeSchema } from './i18n/locales';
import { msg } from './i18n/validation';

// Normalized before validation so "Anna@Example.com " and "anna@example.com" are the same account.
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email(msg('email.invalid')).max(254, msg('email.tooLong')));

// Length over complexity rules (NIST SP 800-63B). Upper bound keeps hashing cost predictable.
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, msg('password.tooShort', PASSWORD_MIN_LENGTH))
  .max(PASSWORD_MAX_LENGTH, msg('password.tooLong', PASSWORD_MAX_LENGTH));

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, msg('displayName.required'))
  .max(50, msg('displayName.tooLong', 50));

export const registerInputSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    displayName: displayNameSchema,
  })
  .superRefine(({ password, email, displayName }, ctx) => {
    // Length is covered by passwordSchema; the remaining required rules need the other fields.
    for (const message of requiredPasswordIssues(password, { email, displayName })) {
      ctx.addIssue({ code: 'custom', path: ['password'], message });
    }
  });

export type RegisterInput = z.infer<typeof registerInputSchema>;

// No password policy on login: rules may change, existing passwords must still work.
export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, msg('password.required')).max(128),
});

export type LoginInput = z.infer<typeof loginInputSchema>;

export const userSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string(),
  /** The chosen UI language; null follows the device (browser language). */
  locale: localeSchema.nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});

export type User = z.infer<typeof userSchema>;

/** Returned by register, login and refresh. The refresh token travels only in an httpOnly cookie. */
export const authResponseSchema = z.object({
  accessToken: z.string(),
  user: userSchema,
  /** Set by a login that also connected a waiting provider account (e.g. 'google'). */
  linkedProvider: z.string().optional(),
});

export type AuthResponse = z.infer<typeof authResponseSchema>;

export const meResponseSchema = z.object({
  user: userSchema,
});

export type MeResponse = z.infer<typeof meResponseSchema>;
