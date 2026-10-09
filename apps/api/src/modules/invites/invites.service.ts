import {
  type CreateInviteResponse,
  type Household,
  INVITE_TTL_DAYS,
  type Invite,
  type InvitePreview,
} from '@splinance/shared';
import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  householdInvites,
  type HouseholdInviteRow,
  householdMembers,
  households,
  users,
} from '../../db/schema';
import { HttpError } from '../../lib/http-error';
import { generateToken, hashToken } from '../../lib/random-token';
import {
  householdNotFound,
  lockHousehold,
  requireMembership,
  toHousehold,
} from '../households/households.service';

const DAY_MS = 24 * 60 * 60 * 1000;

export const inviteNotFound = () => new HttpError(404, 'Invite not found', 'INVITE_NOT_FOUND');

interface HouseholdScope {
  userId: string;
  householdId: string;
}

function toInvite(row: HouseholdInviteRow, inviterName: string): Invite {
  return {
    id: row.id,
    invitedBy: { userId: row.createdBy, displayName: inviterName },
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

/** Distinct codes so the web app can explain why a link no longer works. */
function assertUsable(invite: HouseholdInviteRow, now: Date): void {
  if (invite.revokedAt) throw new HttpError(410, 'This invite was revoked', 'INVITE_REVOKED');
  if (invite.acceptedAt) throw new HttpError(410, 'This invite was already used', 'INVITE_USED');
  if (invite.expiresAt <= now)
    throw new HttpError(410, 'This invite has expired', 'INVITE_EXPIRED');
}

export async function createInvite(scope: HouseholdScope): Promise<CreateInviteResponse> {
  return db.transaction(async (tx) => {
    // Serialized with role changes: a demotion revokes the demoted owner's pending invites,
    // so an invite must not slip in concurrently.
    await lockHousehold(tx, scope.householdId);
    await requireMembership(tx, { ...scope, role: 'owner' });

    const token = generateToken();
    const [invite] = await tx
      .insert(householdInvites)
      .values({
        householdId: scope.householdId,
        tokenHash: hashToken(token),
        createdBy: scope.userId,
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * DAY_MS),
      })
      .returning();
    if (!invite) throw new Error('Invite insert returned no row');

    const [inviter] = await tx
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, scope.userId));
    return { invite: toInvite(invite, inviter?.displayName ?? ''), token };
  });
}

export async function listInvites(scope: HouseholdScope): Promise<Invite[]> {
  await requireMembership(db, { ...scope, role: 'owner' });

  const rows = await db
    .select({ invite: householdInvites, inviterName: users.displayName })
    .from(householdInvites)
    .innerJoin(users, eq(users.id, householdInvites.createdBy))
    .where(
      and(
        eq(householdInvites.householdId, scope.householdId),
        isNull(householdInvites.acceptedAt),
        isNull(householdInvites.revokedAt),
        gt(householdInvites.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(householdInvites.createdAt), asc(householdInvites.id));
  return rows.map((row) => toInvite(row.invite, row.inviterName));
}

export async function revokeInvite(scope: HouseholdScope & { inviteId: string }): Promise<void> {
  await db.transaction(async (tx) => {
    await lockHousehold(tx, scope.householdId);
    await requireMembership(tx, { ...scope, role: 'owner' });

    const [revoked] = await tx
      .update(householdInvites)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(householdInvites.id, scope.inviteId),
          eq(householdInvites.householdId, scope.householdId),
          isNull(householdInvites.acceptedAt),
          isNull(householdInvites.revokedAt),
        ),
      )
      .returning({ id: householdInvites.id });
    if (!revoked) throw inviteNotFound();
  });
}

/** Public: the token itself is the credential (256 random bits, not guessable). */
export async function previewInvite(token: string): Promise<InvitePreview> {
  const [row] = await db
    .select({
      invite: householdInvites,
      householdName: households.name,
      inviterName: users.displayName,
    })
    .from(householdInvites)
    .innerJoin(
      households,
      and(eq(households.id, householdInvites.householdId), isNull(households.archivedAt)),
    )
    .innerJoin(users, eq(users.id, householdInvites.createdBy))
    .where(eq(householdInvites.tokenHash, hashToken(token)));

  if (!row) throw inviteNotFound();
  assertUsable(row.invite, new Date());
  return {
    householdName: row.householdName,
    invitedBy: { displayName: row.inviterName },
    expiresAt: row.invite.expiresAt.toISOString(),
  };
}

export async function acceptInvite({
  userId,
  token,
}: {
  userId: string;
  token: string;
}): Promise<Household> {
  const tokenHash = hashToken(token);

  return db.transaction(async (tx) => {
    const [found] = await tx
      .select({ id: householdInvites.id, householdId: householdInvites.householdId })
      .from(householdInvites)
      .where(eq(householdInvites.tokenHash, tokenHash));
    if (!found) throw inviteNotFound();

    // Lock order household -> invite, the same as membership changes (which revoke invites),
    // so the two can never deadlock. The invite row lock makes accepting single-use.
    await lockHousehold(tx, found.householdId, inviteNotFound);
    const [invite] = await tx
      .select()
      .from(householdInvites)
      .where(eq(householdInvites.id, found.id))
      .for('update');
    if (!invite) throw inviteNotFound();

    const now = new Date();
    assertUsable(invite, now);

    const [existing] = await tx
      .select({ leftAt: householdMembers.leftAt })
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, invite.householdId),
          eq(householdMembers.userId, userId),
        ),
      );

    // Throwing rolls the transaction back, so the invite stays unused.
    if (existing && existing.leftAt === null) {
      throw new HttpError(409, 'You are already a member of this household', 'ALREADY_MEMBER');
    }

    if (existing) {
      // A former member rejoins: same row, fresh membership.
      await tx
        .update(householdMembers)
        .set({ role: 'member', joinedAt: now, leftAt: null })
        .where(
          and(
            eq(householdMembers.householdId, invite.householdId),
            eq(householdMembers.userId, userId),
          ),
        );
    } else {
      await tx
        .insert(householdMembers)
        .values({ householdId: invite.householdId, userId, role: 'member', joinedAt: now });
    }

    await tx
      .update(householdInvites)
      .set({ acceptedBy: userId, acceptedAt: now })
      .where(eq(householdInvites.id, invite.id));

    const [household] = await tx
      .select()
      .from(households)
      .where(eq(households.id, invite.householdId));
    if (!household) throw householdNotFound();
    return toHousehold(household, 'member');
  });
}
