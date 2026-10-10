import {
  apiErrorResponseSchema,
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
