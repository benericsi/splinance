import type { QueryClient } from '@tanstack/react-query';
import { redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { householdQueries } from '@/features/households/queries';
import { ApiError } from '@/lib/http';

/** Steps after creating the household carry its id: `?household=<id>`. */
export const householdStepSearchSchema = z.object({
  household: z.string().optional().catch(undefined),
});

/** Loads the household of a later step; a missing or foreign id restarts or leaves onboarding. */
export async function loadStepHousehold(queryClient: QueryClient, householdId: string | undefined) {
  if (!householdId) throw redirect({ to: '/welcome', replace: true });
  try {
    return await queryClient.query(householdQueries.detail(householdId));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw redirect({ to: '/', replace: true });
    }
    throw error;
  }
}
