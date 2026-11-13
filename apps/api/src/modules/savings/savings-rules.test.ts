import {
  savingsGoalResponseSchema,
  savingsRuleListResponseSchema,
  savingsRuleResponseSchema,
} from '@splinance/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '../../../test/db';
import { type App, createHousehold, errorCode, join } from '../../../test/households';
import { bearer, createTestUser, type TestUser } from '../../../test/users';
import { createApp } from '../../app';

let app: App;
let anna: TestUser;
let ben: TestUser;
let householdId: string;

const base = (suffix = '') => `/api/households/${householdId}/savings${suffix}`;

beforeEach(async () => {
  await resetDatabase();
  app = createApp();
  anna = await createTestUser('Anna');
  ben = await createTestUser('Ben');
  householdId = await createHousehold(app, anna);
  await join(app, anna, householdId, ben);
});

async function send(
  user: TestUser,
  method: 'post' | 'patch' | 'delete' | 'get',
  suffix: string,
  body?: object,
) {
  const req = request(app)
    [method](base(suffix))
    .set('Authorization', await bearer(user));
  return body ? req.send(body) : req;
}

async function createGoal(user: TestUser, overrides: Record<string, unknown> = {}) {
  const res = await send(user, 'post', '', {
    name: 'Holiday',
    targetAmount: null,
    targetDate: null,
    visibility: 'shared',
    ...overrides,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return savingsGoalResponseSchema.parse(res.body).goal;
}

async function createRule(user: TestUser, pattern: string, goalId: string) {
  const res = await send(user, 'post', '/rules', { pattern, goalId });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return savingsRuleResponseSchema.parse(res.body).rule;
}

async function listRules(user: TestUser) {
  const res = await send(user, 'get', '/rules');
  expect(res.status).toBe(200);
  return savingsRuleListResponseSchema.parse(res.body).rules;
}

describe('savings rules', () => {
  it('creates, lists (oldest first), edits and deletes the caller’s rules', async () => {
    const holiday = await createGoal(anna);
    const car = await createGoal(anna, { name: 'Car', visibility: 'private' });
    const first = await createRule(anna, 'Holiday pocket', holiday.id);
    const second = await createRule(anna, '  Car pocket ', car.id);
    expect(second.pattern).toBe('Car pocket');
    expect(await listRules(anna)).toEqual([first, second]);

    const edited = await send(anna, 'patch', `/rules/${first.id}`, { goalId: car.id });
    expect(edited.status).toBe(200);
    expect(savingsRuleResponseSchema.parse(edited.body).rule).toEqual({
      ...first,
      goalId: car.id,
    });

    expect((await send(anna, 'delete', `/rules/${second.id}`)).status).toBe(204);
    expect((await listRules(anna)).map((rule) => rule.id)).toEqual([first.id]);
  });

  it('keeps rules personal: nobody else lists, edits or deletes them', async () => {
    const holiday = await createGoal(anna);
    const rule = await createRule(anna, 'Holiday pocket', holiday.id);

    expect(await listRules(ben)).toEqual([]);
    const edit = await send(ben, 'patch', `/rules/${rule.id}`, { pattern: 'mine now' });
    expect(edit.status).toBe(404);
    expect(errorCode(edit)).toBe('SAVINGS_RULE_NOT_FOUND');
    expect((await send(ben, 'delete', `/rules/${rule.id}`)).status).toBe(404);
    expect((await send(anna, 'delete', '/rules/not-a-uuid')).status).toBe(404);

    // The same text is free for someone else.
    await createRule(ben, 'Holiday pocket', holiday.id);
  });

  it('points only at an open goal the caller can see', async () => {
    const bike = await createGoal(ben, { name: 'Bike', visibility: 'private' });
    const hidden = await send(anna, 'post', '/rules', { pattern: 'Bike', goalId: bike.id });
    expect(hidden.status).toBe(400);
    expect(errorCode(hidden)).toBe('INVALID_GOAL');

    const closed = await createGoal(anna);
    expect((await send(anna, 'post', `/${closed.id}/archive`)).status).toBe(204);
    const res = await send(anna, 'post', '/rules', { pattern: 'Old', goalId: closed.id });
    expect(errorCode(res)).toBe('INVALID_GOAL');

    const open = await createGoal(anna);
    const rule = await createRule(anna, 'Pocket', open.id);
    const moved = await send(anna, 'patch', `/rules/${rule.id}`, { goalId: bike.id });
    expect(errorCode(moved)).toBe('INVALID_GOAL');
  });

  it('refuses a second rule for the same text, whatever its case and accents', async () => {
    const holiday = await createGoal(anna);
    const rule = await createRule(anna, 'Nyaralás', holiday.id);
    const twin = await send(anna, 'post', '/rules', { pattern: 'NYARALAS', goalId: holiday.id });
    expect(twin.status).toBe(409);
    expect(errorCode(twin)).toBe('SAVINGS_RULE_PATTERN_TAKEN');

    const other = await createRule(anna, 'Car', holiday.id);
    const clash = await send(anna, 'patch', `/rules/${other.id}`, { pattern: 'nyaralas' });
    expect(errorCode(clash)).toBe('SAVINGS_RULE_PATTERN_TAKEN');
    expect((await send(anna, 'patch', `/rules/${rule.id}`, { pattern: 'nyaralás' })).status).toBe(
      200,
    );
  });

  it('validates the body and hides the household from outsiders', async () => {
    const holiday = await createGoal(anna);
    expect((await send(anna, 'post', '/rules', { pattern: 'x', goalId: holiday.id })).status).toBe(
      400,
    );
    expect((await send(anna, 'post', '/rules', { pattern: 'ok', goalId: 'nope' })).status).toBe(
      400,
    );
    const cara = await createTestUser('Cara');
    expect((await send(cara, 'get', '/rules')).status).toBe(404);
  });
});
