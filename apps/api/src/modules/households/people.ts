import type { TransactionPerson } from '@splinance/shared';
import { inArray } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { users } from '../../db/schema';

/** Current display names for the given users, in one query ("Former member" once deleted). */
export async function namesOf(
  executor: Db,
  userIds: Iterable<string>,
): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const people = await executor
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(inArray(users.id, ids));
  return new Map(people.map((person) => [person.id, person.displayName]));
}

/** `{ userId, displayName }` from a `namesOf` map. */
export const personOf =
  (nameOf: Map<string, string>) =>
  (userId: string): TransactionPerson => ({ userId, displayName: nameOf.get(userId) ?? '' });

/**
 * A person as stored in an audit snapshot: the id only, the name blank. Names are read from
 * `users` when the history is read, so an erased account leaves no copy of its name behind.
 */
export const nameless = (person: TransactionPerson): TransactionPerson => ({
  userId: person.userId,
  displayName: '',
});
