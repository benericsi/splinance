import {
  apiErrorResponseSchema,
  balancesResponseSchema,
  createInviteResponseSchema,
  householdResponseSchema,
} from '@splinance/shared';
import request from 'supertest';
import type { createApp } from '../src/app';
import { bearer, type TestUser } from './users';

export type App = ReturnType<typeof createApp>;

export function errorCode(res: request.Response): string {
  return apiErrorResponseSchema.parse(res.body).error.code;
}

/** Creates a household through the API (with its default categories); the user is owner. */
export async function createHousehold(app: App, user: TestUser, name = 'Otthon'): Promise<string> {
  const res = await request(app)
    .post('/api/households')
    .set('Authorization', await bearer(user))
    .send({ name })
    .expect(201);
  return householdResponseSchema.parse(res.body).household.id;
}

/** Joins through the real invite flow. */
export async function join(app: App, owner: TestUser, householdId: string, user: TestUser) {
  const res = await request(app)
    .post(`/api/households/${householdId}/invites`)
    .set('Authorization', await bearer(owner))
    .expect(201);
  const { token } = createInviteResponseSchema.parse(res.body);
  await request(app)
    .post(`/api/invites/${token}/accept`)
    .set('Authorization', await bearer(user))
    .expect(200);
}

export async function leave(app: App, householdId: string, user: TestUser) {
  await request(app)
    .post(`/api/households/${householdId}/leave`)
    .set('Authorization', await bearer(user))
    .expect(204);
}

/** Records a payment for every open debt of `user`, so they can leave. */
export async function settleUp(app: App, householdId: string, user: TestUser) {
  const res = await request(app)
    .get(`/api/households/${householdId}/balances`)
    .set('Authorization', await bearer(user))
    .expect(200);
  const { debts } = balancesResponseSchema.parse(res.body).balances;
  for (const debt of debts) {
    if (debt.from.userId !== user.id && debt.to.userId !== user.id) continue;
    await request(app)
      .post(`/api/households/${householdId}/settlements`)
      .set('Authorization', await bearer(user))
      .send({
        fromUserId: debt.from.userId,
        toUserId: debt.to.userId,
        amount: debt.amount,
        settledOn: '2026-10-12',
        note: null,
      })
      .expect(201);
  }
}
