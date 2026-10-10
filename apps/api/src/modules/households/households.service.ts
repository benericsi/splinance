import {
  DEFAULT_CATEGORIES,
  type CreateHouseholdInput,
  type Household,
  type HouseholdDetail,
  type HouseholdMember,
  type HouseholdRole,
  type UpdateHouseholdInput,
} from '@splinance/shared';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db, type Db } from '../../db/client';
import {
  categories,
  householdInvites,
  householdMembers,
  type HouseholdMemberRow,
  households,
  type HouseholdRow,
  users,
} from '../../db/schema';
import { HttpError } from '../../lib/http-error';

export const householdNotFound = () =>
  new HttpError(404, 'Household not found', 'HOUSEHOLD_NOT_FOUND');

export const memberNotFound = () => new HttpError(404, 'Member not found', 'MEMBER_NOT_FOUND');

const ownerRequired = () => new HttpError(403, 'Only owners can do this', 'FORBIDDEN');

const lastOwner = () =>
  new HttpError(
    409,
    'A household needs at least one owner. Make another member an owner first',
    'LAST_OWNER',
  );

export interface Membership {
  household: HouseholdRow;
  role: HouseholdRole;
}

interface HouseholdScope {
  userId: string;
  householdId: string;
}

interface MemberScope extends HouseholdScope {
  targetUserId: string;
}

export function toHousehold(row: HouseholdRow, role: HouseholdRole): Household {
  return {
    id: row.id,
    name: row.name,
    baseCurrency: row.baseCurrency,
    role,
    createdAt: row.createdAt.toISOString(),
  };
}

function toMember(row: HouseholdMemberRow, displayName: string): HouseholdMember {
  return {
    userId: row.userId,
    displayName,
    role: row.role,
    joinedAt: row.joinedAt.toISOString(),
  };
}

const activeMember = (householdId: string, userId: string) =>
  and(
    eq(householdMembers.householdId, householdId),
    eq(householdMembers.userId, userId),
    isNull(householdMembers.leftAt),
  );

/**
 * Serializes membership changes per household (role changes, removals, leaving, joining).
 * Without it, two owners demoting each other at the same time would both see "another
 * owner exists" and leave the household with none. Call it first in the transaction,
 * before reading memberships: under READ COMMITTED a statement that runs after the lock
 * is acquired sees the other transaction's committed changes.
 */
export async function lockHousehold(
  tx: Db,
  householdId: string,
  onMissing: () => HttpError = householdNotFound,
): Promise<void> {
  const [row] = await tx
    .select({ id: households.id })
    .from(households)
    .where(and(eq(households.id, householdId), isNull(households.archivedAt)))
    .for('update');
  if (!row) throw onMissing();
}

/**
 * The single authorization check for household-scoped work. Non-members (including former
 * members) and archived households get 404, so ids reveal nothing. A member asking for an
 * owner-only action gets 403: they already know the household exists.
 */
export async function requireMembership(
  executor: Db,
  { userId, householdId, role }: HouseholdScope & { role?: 'owner' },
): Promise<Membership> {
  const [row] = await executor
    .select({ household: households, role: householdMembers.role })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(and(activeMember(householdId, userId), isNull(households.archivedAt)));

  if (!row) throw householdNotFound();
  if (role === 'owner' && row.role !== 'owner') throw ownerRequired();
  return row;
}

async function countOwners(executor: Db, householdId: string): Promise<number> {
  return executor.$count(
    householdMembers,
    and(
      eq(householdMembers.householdId, householdId),
      eq(householdMembers.role, 'owner'),
      isNull(householdMembers.leftAt),
    ),
  );
}

/** Invites are only valid while their creator is an owner, so a removed owner cannot rejoin with one. */
async function revokePendingInvitesBy(tx: Db, householdId: string, userId: string) {
  await tx
    .update(householdInvites)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(householdInvites.householdId, householdId),
        eq(householdInvites.createdBy, userId),
        isNull(householdInvites.acceptedAt),
        isNull(householdInvites.revokedAt),
      ),
    );
}

export async function createHousehold(
  userId: string,
  input: CreateHouseholdInput,
): Promise<Household> {
  return db.transaction(async (tx) => {
    const [household] = await tx
      .insert(households)
      .values({ name: input.name, createdBy: userId })
      .returning();
    if (!household) throw new Error('Household insert returned no row');

    await tx.insert(householdMembers).values({ householdId: household.id, userId, role: 'owner' });
    await tx
      .insert(categories)
      .values(DEFAULT_CATEGORIES.map((category) => ({ ...category, householdId: household.id })));
    return toHousehold(household, 'owner');
  });
}

export async function listHouseholds(userId: string): Promise<Household[]> {
  const rows = await db
    .select({ household: households, role: householdMembers.role })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(
      and(
        eq(householdMembers.userId, userId),
        isNull(householdMembers.leftAt),
        isNull(households.archivedAt),
      ),
    )
    .orderBy(asc(householdMembers.joinedAt), asc(households.id));
  return rows.map((row) => toHousehold(row.household, row.role));
}

export async function getHousehold(scope: HouseholdScope): Promise<HouseholdDetail> {
  const { household, role } = await requireMembership(db, scope);

  const members = await db
    .select({ member: householdMembers, displayName: users.displayName })
    .from(householdMembers)
    .innerJoin(users, eq(users.id, householdMembers.userId))
    .where(and(eq(householdMembers.householdId, household.id), isNull(householdMembers.leftAt)))
    .orderBy(asc(householdMembers.joinedAt), asc(householdMembers.userId));

  return {
    ...toHousehold(household, role),
    members: members.map((row) => toMember(row.member, row.displayName)),
  };
}

export async function updateHousehold(
  scope: HouseholdScope,
  input: UpdateHouseholdInput,
): Promise<Household> {
  const { household, role } = await requireMembership(db, { ...scope, role: 'owner' });

  const [updated] = await db
    .update(households)
    .set({ name: input.name })
    .where(eq(households.id, household.id))
    .returning();
  if (!updated) throw householdNotFound();
  return toHousehold(updated, role);
}

/** Soft delete. Phase 3 adds: only when all balances are settled. */
export async function archiveHousehold(scope: HouseholdScope): Promise<void> {
  await db.transaction(async (tx) => {
    await lockHousehold(tx, scope.householdId);
    await requireMembership(tx, { ...scope, role: 'owner' });
    await tx
      .update(households)
      .set({ archivedAt: new Date() })
      .where(eq(households.id, scope.householdId));
  });
}

export async function updateMemberRole(
  { targetUserId, ...scope }: MemberScope,
  role: HouseholdRole,
): Promise<HouseholdMember> {
  return db.transaction(async (tx) => {
    await lockHousehold(tx, scope.householdId);
    await requireMembership(tx, { ...scope, role: 'owner' });

    const [target] = await tx
      .select({ member: householdMembers, displayName: users.displayName })
      .from(householdMembers)
      .innerJoin(users, eq(users.id, householdMembers.userId))
      .where(activeMember(scope.householdId, targetUserId));
    if (!target) throw memberNotFound();
    if (target.member.role === role) return toMember(target.member, target.displayName);

    if (role === 'member') {
      if ((await countOwners(tx, scope.householdId)) <= 1) throw lastOwner();
      await revokePendingInvitesBy(tx, scope.householdId, targetUserId);
    }

    const [updated] = await tx
      .update(householdMembers)
      .set({ role })
      .where(activeMember(scope.householdId, targetUserId))
      .returning();
    if (!updated) throw memberNotFound();
    return toMember(updated, target.displayName);
  });
}

async function endMembership(tx: Db, householdId: string, userId: string): Promise<void> {
  await tx
    .update(householdMembers)
    .set({ leftAt: new Date() })
    .where(activeMember(householdId, userId));
  await revokePendingInvitesBy(tx, householdId, userId);
}

export async function removeMember({ targetUserId, ...scope }: MemberScope): Promise<void> {
  await db.transaction(async (tx) => {
    await lockHousehold(tx, scope.householdId);
    await requireMembership(tx, { ...scope, role: 'owner' });
    if (targetUserId === scope.userId) {
      throw new HttpError(400, 'Use leave to leave the household', 'CANNOT_REMOVE_SELF');
    }

    // The caller is an owner who stays, so removing another owner never leaves zero owners.
    const [target] = await tx
      .select({ userId: householdMembers.userId })
      .from(householdMembers)
      .where(activeMember(scope.householdId, targetUserId));
    if (!target) throw memberNotFound();

    await endMembership(tx, scope.householdId, targetUserId);
  });
}

/** Phase 3 adds: blocked while the member has an unsettled balance. */
export async function leaveHousehold(scope: HouseholdScope): Promise<void> {
  await db.transaction(async (tx) => {
    await lockHousehold(tx, scope.householdId);
    const { role } = await requireMembership(tx, scope);

    // Also applies to a sole member: they archive the household instead of orphaning it.
    if (role === 'owner' && (await countOwners(tx, scope.householdId)) <= 1) throw lastOwner();

    await endMembership(tx, scope.householdId, scope.userId);
  });
}
