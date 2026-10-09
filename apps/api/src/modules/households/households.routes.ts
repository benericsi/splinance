import {
  createHouseholdInputSchema,
  type CreateInviteResponse,
  type HouseholdDetailResponse,
  type HouseholdListResponse,
  type HouseholdResponse,
  type InviteListResponse,
  type MemberResponse,
  updateHouseholdInputSchema,
  updateMemberInputSchema,
} from '@splinance/shared';
import { type Request, Router } from 'express';
import { z } from 'zod';
import type { HttpError } from '../../lib/http-error';
import { getAuth, requireAuth } from '../../middleware/require-auth';
import {
  createInvite,
  inviteNotFound,
  listInvites,
  revokeInvite,
} from '../invites/invites.service';
import {
  archiveHousehold,
  createHousehold,
  getHousehold,
  householdNotFound,
  leaveHousehold,
  listHouseholds,
  memberNotFound,
  removeMember,
  updateHousehold,
  updateMemberRole,
} from './households.service';

const uuidSchema = z.uuid();

/** A malformed id cannot exist, so it gets the same 404 as an unknown one (never a 400 or 500). */
function idParam(req: Request, name: string, notFound: () => HttpError): string {
  const result = uuidSchema.safeParse(req.params[name]);
  if (!result.success) throw notFound();
  return result.data;
}

function householdScope(req: Request) {
  return { userId: getAuth(req).userId, householdId: idParam(req, 'id', householdNotFound) };
}

export function createHouseholdsRouter() {
  const router = Router();
  router.use(requireAuth);

  router.post('/', async (req, res) => {
    const input = createHouseholdInputSchema.parse(req.body);
    const body: HouseholdResponse = {
      household: await createHousehold(getAuth(req).userId, input),
    };
    res.status(201).json(body);
  });

  router.get('/', async (req, res) => {
    const body: HouseholdListResponse = { households: await listHouseholds(getAuth(req).userId) };
    res.json(body);
  });

  router.get('/:id', async (req, res) => {
    const body: HouseholdDetailResponse = { household: await getHousehold(householdScope(req)) };
    res.json(body);
  });

  router.patch('/:id', async (req, res) => {
    const scope = householdScope(req);
    const input = updateHouseholdInputSchema.parse(req.body);
    const body: HouseholdResponse = { household: await updateHousehold(scope, input) };
    res.json(body);
  });

  router.delete('/:id', async (req, res) => {
    await archiveHousehold(householdScope(req));
    res.status(204).end();
  });

  router.post('/:id/leave', async (req, res) => {
    await leaveHousehold(householdScope(req));
    res.status(204).end();
  });

  router.patch('/:id/members/:userId', async (req, res) => {
    const scope = householdScope(req);
    const targetUserId = idParam(req, 'userId', memberNotFound);
    const { role } = updateMemberInputSchema.parse(req.body);
    const body: MemberResponse = {
      member: await updateMemberRole({ ...scope, targetUserId }, role),
    };
    res.json(body);
  });

  router.delete('/:id/members/:userId', async (req, res) => {
    const scope = householdScope(req);
    const targetUserId = idParam(req, 'userId', memberNotFound);
    await removeMember({ ...scope, targetUserId });
    res.status(204).end();
  });

  router.post('/:id/invites', async (req, res) => {
    const body: CreateInviteResponse = await createInvite(householdScope(req));
    res.status(201).json(body);
  });

  router.get('/:id/invites', async (req, res) => {
    const body: InviteListResponse = { invites: await listInvites(householdScope(req)) };
    res.json(body);
  });

  router.delete('/:id/invites/:inviteId', async (req, res) => {
    const scope = householdScope(req);
    const inviteId = idParam(req, 'inviteId', inviteNotFound);
    await revokeInvite({ ...scope, inviteId });
    res.status(204).end();
  });

  return router;
}
