import { z } from 'zod';
import { msg } from './i18n/validation';
import { transactionVisibilitySchema } from './transactions';

/** How the household overview opens on a wide screen. Also the Postgres enum `overview_view`. */
export const OVERVIEW_VIEWS = ['cards', 'map'] as const;
export const overviewViewSchema = z.enum(OVERVIEW_VIEWS);
export type OverviewView = z.infer<typeof overviewViewSchema>;

/**
 * Whose spending Reports and the Calendar show: the whole household's or the viewer's
 * share. Also the Postgres enum `spending_view`.
 */
export const SPENDING_VIEWS = ['household', 'mine'] as const;
export const spendingViewSchema = z.enum(SPENDING_VIEWS);
export type SpendingView = z.infer<typeof spendingViewSchema>;

/**
 * The person's defaults, saved to the account so every device follows them. Each one only
 * fills in what the URL leaves open: a link with `?view=map` opens the map whatever the
 * default says. The UI language is `user.locale`, the theme stays on the device.
 */
export const preferencesSchema = z.object({
  overviewView: overviewViewSchema,
  /** What a new transaction starts as; editing one keeps its own. */
  transactionVisibility: transactionVisibilitySchema,
  spendingView: spendingViewSchema,
});

export type Preferences = z.infer<typeof preferencesSchema>;

/** A new account's preferences (and the column defaults). */
export const DEFAULT_PREFERENCES: Preferences = {
  overviewView: 'cards',
  transactionVisibility: 'shared',
  spendingView: 'household',
};

/** PATCH /api/account/preferences: any of them; answers with the user (`profileResponseSchema`). */
export const updatePreferencesInputSchema = preferencesSchema
  .partial()
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    ...msg('nothingToUpdate'),
  });

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesInputSchema>;
