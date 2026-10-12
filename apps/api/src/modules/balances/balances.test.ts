import {
  type Balances,
  balancesResponseSchema,
  transactionResponseSchema,
} from '@splinance/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '../../../test/db';
import {
  type App,
  createHousehold,
  errorCode,
  join,
  leave,
  settleUp,
} from '../../../test/households';
import { bearer, createTestUser, type TestUser } from '../../../test/users';
import { createApp } from '../../app';

let app: App;
let anna: TestUser;
let ben: TestUser;
let cara: TestUser;
let householdId: string;

const path = (suffix: string) => `/api/households/${householdId}${suffix}`;

beforeEach(async () => {
  await resetDatabase();
  app = createApp();
  anna = await createTestUser('Anna');
  ben = await createTestUser('Ben');
  cara = await createTestUser('Cara');
  householdId = await createHousehold(app, anna);
  await join(app, anna, householdId, ben);
  await join(app, anna, householdId, cara);
});

async function balances(user: TestUser): Promise<Balances> {
  const res = await request(app)
    .get(path('/balances'))
    .set('Authorization', await bearer(user))
    .expect(200);
  return balancesResponseSchema.parse(res.body).balances;
}

/** The debts as plain "from -> to: amount" lines, easy to compare. */
async function debts(user: TestUser = anna): Promise<string[]> {
  const { debts } = await balances(user);
  return debts.map((d) => `${d.from.displayName} -> ${d.to.displayName}: ${String(d.amount)}`);
}

/** A shared transaction paid (or received) by `payer`, split equally between `between`. */
async function shared(
  payer: TestUser,
  amount: number,
  between: TestUser[],
  { kind = 'expense' }: { kind?: 'expense' | 'income' } = {},
) {
  const res = await request(app)
    .post(path('/transactions'))
    .set('Authorization', await bearer(payer))
    .send({
      visibility: 'shared',
      kind,
      amount,
      occurredOn: '2026-10-10',
      description: 'Shared',
      categoryId: null,
      paidBy: payer.id,
      split: { method: 'equal', userIds: between.map((u) => u.id) },
    })
    .expect(201);
  return transactionResponseSchema.parse(res.body).transaction;
}

async function settle(by: TestUser, from: TestUser, to: TestUser, amount: number) {
  return request(app)
    .post(path('/settlements'))
    .set('Authorization', await bearer(by))
    .send({
      fromUserId: from.id,
      toUserId: to.id,
      amount,
      settledOn: '2026-10-12',
      note: null,
    });
}

describe('GET /api/households/:id/balances', () => {
  it('is empty for a new household, in its currency', async () => {
    expect(await balances(anna)).toEqual({ currency: 'HUF', debts: [] });
  });

  it('turns shares of shared expenses into debts to the payer', async () => {
    await shared(anna, 5000, [ben]);
    await shared(anna, 7000, [ben]);
    await shared(anna, 9000, [anna, ben, cara]);
    expect(await debts()).toEqual(['Ben -> Anna: 15000', 'Cara -> Anna: 3000']);
  });

  it('reverses shared income: whoever received it owes the others their shares', async () => {
    await shared(ben, 6000, [anna, ben], { kind: 'income' });
    expect(await debts()).toEqual(['Ben -> Anna: 3000']);
  });

  it('nets debts within a pair but never across pairs', async () => {
    await shared(anna, 5000, [ben]);
    await shared(ben, 3000, [anna]);
    await shared(ben, 4000, [cara]);
    // Ben owes Anna 2000 net; Cara owes Ben 4000. No "Cara pays Anna" shortcut.
    expect(await debts()).toEqual(['Cara -> Ben: 4000', 'Ben -> Anna: 2000']);
  });

  it('ignores private and deleted transactions until they are restored', async () => {
    await request(app)
      .post(path('/transactions'))
      .set('Authorization', await bearer(anna))
      .send({
        visibility: 'private',
        kind: 'expense',
        amount: 2500,
        occurredOn: '2026-10-10',
        description: 'Haircut',
        categoryId: null,
      })
      .expect(201);
    const transaction = await shared(anna, 4000, [ben]);
    expect(await debts()).toEqual(['Ben -> Anna: 4000']);

    await request(app)
      .delete(path(`/transactions/${transaction.id}`))
      .set('Authorization', await bearer(ben))
      .expect(204);
    expect(await debts()).toEqual([]);

    await request(app)
      .post(path(`/transactions/${transaction.id}/restore`))
      .set('Authorization', await bearer(ben))
      .expect(200);
    expect(await debts()).toEqual(['Ben -> Anna: 4000']);
  });

  it('settles partially, fully, and flips when someone pays too much', async () => {
    await shared(anna, 5000, [ben]);
    await shared(anna, 7000, [ben]);

    expect((await settle(ben, ben, anna, 10_000)).status).toBe(201);
    expect(await debts()).toEqual(['Ben -> Anna: 2000']);

    expect((await settle(ben, ben, anna, 2000)).status).toBe(201);
    expect(await debts()).toEqual([]);

    expect((await settle(ben, ben, anna, 500)).status).toBe(201);
    expect(await debts()).toEqual(['Anna -> Ben: 500']);
  });

  it('shows every member the same debts, and nothing to outsiders', async () => {
    await shared(anna, 5000, [ben]);
    expect(await balances(cara)).toEqual(await balances(anna));

    const outsider = await createTestUser('Eve');
    const res = await request(app)
      .get(path('/balances'))
      .set('Authorization', await bearer(outsider));
    expect(res.status).toBe(404);
    expect(errorCode(res)).toBe('HOUSEHOLD_NOT_FOUND');
    await request(app).get(path('/balances')).expect(401);
  });

  it('keeps a debt with someone who left settleable', async () => {
    const transaction = await shared(anna, 4000, [anna, ben]);
    await settleUp(app, householdId, ben);
    await leave(app, householdId, ben);

    // Correcting the old expense later reopens a debt with Ben, who is no longer a member.
    await request(app)
      .put(path(`/transactions/${transaction.id}`))
      .set('Authorization', await bearer(anna))
      .send({
        visibility: 'shared',
        kind: 'expense',
        amount: 6000,
        occurredOn: '2026-10-10',
        description: 'Shared',
        categoryId: null,
        paidBy: anna.id,
        split: { method: 'equal', userIds: [anna.id, ben.id] },
        version: 1,
      })
      .expect(200);
    expect(await debts()).toEqual(['Ben -> Anna: 1000']);

    // Anna (an owner) records Ben's payment.
    expect((await settle(anna, ben, anna, 1000)).status).toBe(201);
    expect(await debts()).toEqual([]);
  });
});

describe('membership changes need settled balances', () => {
  it('blocks leaving while the member owes or is owed money', async () => {
    await shared(anna, 4000, [ben]);

    const res = await request(app)
      .post(path('/leave'))
      .set('Authorization', await bearer(ben));
    expect(res.status).toBe(409);
    expect(errorCode(res)).toBe('UNSETTLED_BALANCE');

    // Debts between other people do not block Cara.
    await leave(app, householdId, cara);

    await settleUp(app, householdId, ben);
    await leave(app, householdId, ben);
  });

  it('also blocks the creditor from leaving', async () => {
    await shared(ben, 4000, [cara]);
    const res = await request(app)
      .post(path('/leave'))
      .set('Authorization', await bearer(ben));
    expect(errorCode(res)).toBe('UNSETTLED_BALANCE');
  });

  it('blocks removing a member with open debts', async () => {
    await shared(anna, 4000, [ben]);

    const blocked = await request(app)
      .delete(path(`/members/${ben.id}`))
      .set('Authorization', await bearer(anna));
    expect(blocked.status).toBe(409);
    expect(errorCode(blocked)).toBe('UNSETTLED_BALANCE');

    await request(app)
      .delete(path(`/members/${cara.id}`))
      .set('Authorization', await bearer(anna))
      .expect(204);
  });

  it('blocks archiving while anyone owes anybody', async () => {
    await shared(ben, 4000, [cara]);

    const blocked = await request(app)
      .delete(`/api/households/${householdId}`)
      .set('Authorization', await bearer(anna));
    expect(blocked.status).toBe(409);
    expect(errorCode(blocked)).toBe('UNSETTLED_BALANCE');

    expect((await settle(cara, cara, ben, 4000)).status).toBe(201);
    await request(app)
      .delete(`/api/households/${householdId}`)
      .set('Authorization', await bearer(anna))
      .expect(204);
  });

  it('never lets a member leave with a debt created at the same moment', async () => {
    // Leaving locks the household exclusively, adding an expense takes a shared lock:
    // whichever runs first, the other sees its result.
    const [left, added] = await Promise.all([
      request(app)
        .post(path('/leave'))
        .set('Authorization', await bearer(ben)),
      request(app)
        .post(path('/transactions'))
        .set('Authorization', await bearer(anna))
        .send({
          visibility: 'shared',
          kind: 'expense',
          amount: 4000,
          occurredOn: '2026-10-10',
          description: 'Race',
          categoryId: null,
          paidBy: anna.id,
          split: { method: 'equal', userIds: [ben.id] },
        }),
    ]);

    if (left.status === 204) {
      expect(errorCode(added)).toBe('INVALID_MEMBER');
      expect(await debts()).toEqual([]);
    } else {
      expect(added.status).toBe(201);
      expect(errorCode(left)).toBe('UNSETTLED_BALANCE');
    }
  });
});
