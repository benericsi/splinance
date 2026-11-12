import {
  type Category,
  categoryListResponseSchema,
  type Notification,
  notificationListResponseSchema,
  notificationSettingsResponseSchema,
  occurrence,
  transactionResponseSchema,
  unreadCountResponseSchema,
} from '@splinance/shared';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '../../../test/db';
import { type App, createHousehold, join, leave, settleUp } from '../../../test/households';
import { bearer, createTestUser, type TestUser } from '../../../test/users';
import { createApp } from '../../app';
import { db, pool } from '../../db/client';
import { notifications } from '../../db/schema';
import { budapestToday } from '../../lib/today';
import { recordTransactionActivity } from './activity';
import { NOTIFICATION_SWEEP_LOCK, runNotificationSweep, syncNotifications } from './sync';

let app: App;
let anna: TestUser;
let ben: TestUser;
let householdId: string;
let groceries: Category;

const today = budapestToday();
const base = (path = '') => `/api/households/${householdId}${path}`;

function plusDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

beforeEach(async () => {
  await resetDatabase();
  app = createApp();
  anna = await createTestUser('Anna');
  ben = await createTestUser('Ben');
  householdId = await createHousehold(app, anna);
  await join(app, anna, householdId, ben);
  const res = await request(app)
    .get(base('/categories'))
    .set('Authorization', await bearer(anna))
    .expect(200);
  const found = categoryListResponseSchema
    .parse(res.body)
    .categories.find((c) => c.name === 'Groceries');
  if (!found) throw new Error('no Groceries');
  groceries = found;
});

async function bell(user: TestUser) {
  const res = await request(app)
    .get('/api/notifications')
    .set('Authorization', await bearer(user))
    .expect(200);
  return notificationListResponseSchema.parse(res.body);
}

const unreadOf = async (user: TestUser) =>
  (await bell(user)).notifications.filter((n) => !n.readAt);

const sharedInput = (
  paidBy: TestUser,
  amount: number,
  overrides: Record<string, unknown> = {},
) => ({
  visibility: 'shared',
  kind: 'expense',
  amount,
  occurredOn: today,
  description: 'Groceries',
  categoryId: null,
  paidBy: paidBy.id,
  split: { method: 'equal', userIds: [anna.id, ben.id] },
  ...overrides,
});

async function addTransaction(user: TestUser, input: Record<string, unknown>) {
  const res = await request(app)
    .post(base('/transactions'))
    .set('Authorization', await bearer(user))
    .send(input);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return transactionResponseSchema.parse(res.body).transaction;
}

async function editTransaction(
  user: TestUser,
  id: string,
  version: number,
  input: Record<string, unknown>,
) {
  const res = await request(app)
    .put(base(`/transactions/${id}`))
    .set('Authorization', await bearer(user))
    .send({ ...input, version });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return transactionResponseSchema.parse(res.body).transaction;
}

async function markRead(user: TestUser, body: object) {
  await request(app)
    .post('/api/notifications/read')
    .set('Authorization', await bearer(user))
    .send(body)
    .expect(204);
}

const summary = (n: Notification) => ({
  type: n.type,
  action: n.action,
  actor: n.actor?.displayName ?? null,
  subjectName: n.subjectName,
  amount: n.amount,
  previousAmount: n.previousAmount,
  count: n.count,
});

describe('activity', () => {
  it('tells the others what someone added, and folds edits into one unread item', async () => {
    const added = await addTransaction(ben, sharedInput(ben, 9_000));
    expect((await bell(ben)).notifications).toEqual([]);
    const [first, ...rest] = (await bell(anna)).notifications;
    expect(rest).toEqual([]);
    expect(first && summary(first)).toEqual({
      type: 'tx_added',
      action: 'create',
      actor: 'Ben',
      subjectName: 'Groceries',
      amount: 4_500,
      previousAmount: null,
      count: null,
    });
    expect((await bell(anna)).unread).toBe(1);

    // A description edit tells nobody; a share edit folds into the unread "added".
    const renamed = await editTransaction(
      ben,
      added.id,
      added.version,
      sharedInput(ben, 9_000, { description: 'Tesco' }),
    );
    const changed = await editTransaction(
      ben,
      added.id,
      renamed.version,
      sharedInput(ben, 12_000, { description: 'Tesco' }),
    );
    const folded = await bell(anna);
    expect(folded.notifications.map(summary)).toEqual([
      {
        type: 'tx_added',
        action: 'create',
        actor: 'Ben',
        subjectName: 'Tesco',
        amount: 6_000,
        previousAmount: null,
        count: null,
      },
    ]);

    // Once read, the next change is news of its own, from the share it started from.
    await markRead(anna, { all: true });
    const again = await editTransaction(
      ben,
      added.id,
      changed.version,
      sharedInput(ben, 14_000, { description: 'Tesco' }),
    );
    await editTransaction(
      ben,
      added.id,
      again.version,
      sharedInput(ben, 16_000, { description: 'Tesco' }),
    );
    const unread = await unreadOf(anna);
    expect(unread.map(summary)).toEqual([
      {
        type: 'tx_changed',
        action: 'update',
        actor: 'Ben',
        subjectName: 'Tesco',
        amount: 8_000,
        previousAmount: 6_000,
        count: null,
      },
    ]);

    await markRead(anna, { all: true });
    await request(app)
      .delete(base(`/transactions/${added.id}`))
      .set('Authorization', await bearer(ben))
      .expect(204);
    expect((await unreadOf(anna)).map(summary)).toEqual([
      {
        type: 'tx_deleted',
        action: 'delete',
        actor: 'Ben',
        subjectName: 'Tesco',
        amount: 8_000,
        previousAmount: null,
        count: null,
      },
    ]);
  });

  it('says nothing about private transactions, and takes back what a shared one made private said', async () => {
    await addTransaction(ben, {
      visibility: 'private',
      kind: 'expense',
      amount: 3_000,
      occurredOn: today,
      description: 'Gift',
      categoryId: null,
    });
    expect((await bell(anna)).notifications).toEqual([]);

    const shared = await addTransaction(anna, sharedInput(anna, 4_000));
    expect((await bell(ben)).unread).toBe(1);
    await editTransaction(anna, shared.id, shared.version, {
      visibility: 'private',
      kind: 'expense',
      amount: 4_000,
      occurredOn: today,
      description: 'Groceries',
      categoryId: null,
    });
    expect((await bell(ben)).notifications).toEqual([]);
  });

  it('writes one item per import, and its undo folds into it', async () => {
    const rows = [5_000, 7_000, 9_000].map((amount, index) => ({
      fingerprint: `kh:${String(index)}`,
      counterparty: 'TESCO 44049',
      transaction: sharedInput(ben, amount, { description: 'Tesco' }),
    }));
    const res = await request(app)
      .post(base('/imports'))
      .set('Authorization', await bearer(ben))
      .send({ source: 'kh', fileName: null, rows })
      .expect(201);
    const batchId = (res.body as { batch: { id: string } }).batch.id;
    expect((await bell(anna)).notifications.map(summary)).toEqual([
      {
        type: 'import_added',
        action: 'create',
        actor: 'Ben',
        subjectName: null,
        amount: 10_500,
        previousAmount: null,
        count: 3,
      },
    ]);

    await request(app)
      .delete(base(`/imports/${batchId}`))
      .set('Authorization', await bearer(ben))
      .expect(204);
    expect((await bell(anna)).notifications.map(summary)).toEqual([
      {
        type: 'import_added',
        action: 'undo',
        actor: 'Ben',
        subjectName: null,
        amount: 10_500,
        previousAmount: null,
        count: 3,
      },
    ]);
  });

  it('leaves nothing behind for a change that rolled back', async () => {
    const added = await addTransaction(anna, sharedInput(anna, 4_000));
    await markRead(ben, { all: true });
    await expect(
      db.transaction(async (tx) => {
        await recordTransactionActivity(
          tx,
          { householdId, userId: anna.id },
          'delete',
          added,
          null,
        );
        throw new Error('rolled back');
      }),
    ).rejects.toThrow('rolled back');
    expect(await unreadOf(ben)).toEqual([]);
  });

  it('tells the other person about a payment; both when an owner records it for them', async () => {
    const cara = await createTestUser('Cara');
    await join(app, anna, householdId, cara);
    const record = async (by: TestUser, from: TestUser, to: TestUser) =>
      request(app)
        .post(base('/settlements'))
        .set('Authorization', await bearer(by))
        .send({
          fromUserId: from.id,
          toUserId: to.id,
          amount: 20_000,
          settledOn: today,
          note: null,
        })
        .expect(201);

    await record(ben, ben, anna);
    const [paid] = (await bell(anna)).notifications;
    expect(paid?.type).toBe('settlement_recorded');
    expect(paid?.parties).toEqual({
      from: { userId: ben.id, displayName: 'Ben' },
      to: { userId: anna.id, displayName: 'Anna' },
    });
    expect((await bell(ben)).notifications).toEqual([]);

    await record(anna, ben, cara);
    expect((await unreadOf(ben)).map((n) => n.type)).toEqual(['settlement_recorded']);
    expect((await unreadOf(cara)).map((n) => n.type)).toEqual(['settlement_recorded']);
  });

  it('can be turned off per household, which also clears what is unread', async () => {
    await addTransaction(ben, sharedInput(ben, 2_000));
    const off = await request(app)
      .put(base('/notification-settings'))
      .set('Authorization', await bearer(anna))
      .send({ activity: false })
      .expect(200);
    expect(notificationSettingsResponseSchema.parse(off.body).settings).toEqual({
      activity: false,
    });
    expect((await bell(anna)).unread).toBe(0);
    await addTransaction(ben, sharedInput(ben, 3_000));
    expect(await unreadOf(anna)).toEqual([]);

    const res = await request(app)
      .get(base('/notification-settings'))
      .set('Authorization', await bearer(anna))
      .expect(200);
    expect(notificationSettingsResponseSchema.parse(res.body).settings.activity).toBe(false);
    const cara = await createTestUser('Cara');
    await request(app)
      .get(base('/notification-settings'))
      .set('Authorization', await bearer(cara))
      .expect(404);
  });
});

describe('state', () => {
  const series = async (user: TestUser, overrides: Record<string, unknown> = {}) =>
    request(app)
      .post(base('/recurring'))
      .set('Authorization', await bearer(user))
      .send({
        name: 'Netflix',
        pattern: 'netflix',
        cadence: 'monthly',
        amount: 4_990,
        amountVaries: false,
        anchorOn: plusDays(today, 2),
        startsOn: null,
        categoryId: null,
        scope: 'shared',
        remind: true,
        ...overrides,
      })
      .expect(201);

  it('reminds everyone of a shared renewal, only its owner of a private one, and resolves it when paid', async () => {
    await series(anna);
    await series(ben, { name: 'Phone', pattern: 'yettel', scope: 'private' });
    const due = (n: Notification) => [n.type, n.subjectName, n.dueOn];
    expect((await bell(anna)).notifications.map(due)).toEqual([
      ['renewal_due', 'Netflix', plusDays(today, 2)],
    ]);
    expect((await bell(ben)).notifications.map(due).sort()).toEqual(
      [
        ['renewal_due', 'Netflix', plusDays(today, 2)],
        ['renewal_due', 'Phone', plusDays(today, 2)],
      ].sort(),
    );

    // The payment arrives (by hand here): the reminder no longer holds.
    await addTransaction(
      anna,
      sharedInput(anna, 4_990, { description: 'Netflix', occurredOn: today }),
    );
    const [renewal] = (await bell(anna)).notifications.filter((n) => n.type === 'renewal_due');
    expect(renewal?.resolvedAt).not.toBeNull();
    expect(renewal?.subjectKind).toBe('expense');
  });

  it('asks about a renewal that never came, and does nothing twice', async () => {
    await series(anna, { anchorOn: occurrence(today, 'monthly', -2) });
    const missed = (await bell(anna)).notifications.filter((n) => n.type === 'renewal_missed');
    expect(missed).toHaveLength(1);
    await syncNotifications(householdId);
    await syncNotifications(householdId);
    expect(await db.$count(notifications, eq(notifications.userId, anna.id))).toBe(1);
  });

  it('does not remind of income about to arrive, but says when it did not', async () => {
    const salary = { kind: 'income', name: 'Salary', pattern: 'acme', amount: 690_000 };
    await series(anna, { ...salary, scope: 'private' });
    expect((await bell(anna)).notifications).toEqual([]);

    await series(anna, {
      ...salary,
      pattern: 'globex',
      anchorOn: occurrence(today, 'monthly', -2),
    });
    expect(
      (await bell(anna)).notifications.map((n) => [n.type, n.subjectName, n.subjectKind]),
    ).toEqual([['renewal_missed', 'Salary', 'income']]);
  });

  it('warns at 80% of a budget and again when it is over, for every member', async () => {
    await request(app)
      .put(base(`/budgets/${groceries.id}`))
      .set('Authorization', await bearer(anna))
      .send({ amount: 10_000, from: today.slice(0, 7) })
      .expect(204);
    await addTransaction(ben, sharedInput(ben, 8_500, { categoryId: groceries.id }));
    const near = (await bell(anna)).notifications.find((n) => n.type === 'budget_near');
    expect(near && [near.subjectName, near.amount, near.previousAmount]).toEqual([
      'Groceries',
      8_500,
      10_000,
    ]);

    await addTransaction(ben, sharedInput(ben, 2_000, { categoryId: groceries.id }));
    const list = (await bell(ben)).notifications;
    expect(list.find((n) => n.type === 'budget_over')?.resolvedAt).toBeNull();
    expect(list.find((n) => n.type === 'budget_near')?.resolvedAt).not.toBeNull();
  });

  it('sweeps households hourly under a lock', async () => {
    await series(anna);
    await db.delete(notifications);
    expect(await runNotificationSweep()).toBe(1);
    expect((await bell(anna)).unread).toBe(1);

    const client = await pool.connect();
    try {
      await client.query('select pg_advisory_lock(hashtext($1))', [NOTIFICATION_SWEEP_LOCK]);
      expect(await runNotificationSweep()).toBeNull();
    } finally {
      await client.query('select pg_advisory_unlock(hashtext($1))', [NOTIFICATION_SWEEP_LOCK]);
      client.release();
    }
  });
});

describe('the bell', () => {
  it('counts unread, marks some or all read, and never someone else’s', async () => {
    await addTransaction(ben, sharedInput(ben, 2_000));
    await addTransaction(ben, sharedInput(ben, 3_000, { description: 'Lidl' }));
    const { notifications: list } = await bell(anna);
    expect(list).toHaveLength(2);
    const count = async (user: TestUser) =>
      unreadCountResponseSchema.parse(
        (
          await request(app)
            .get('/api/notifications/unread-count')
            .set('Authorization', await bearer(user))
            .expect(200)
        ).body,
      ).unread;
    expect(await count(anna)).toBe(2);

    // Ben cannot mark Anna's read.
    await markRead(ben, { ids: list.map((n) => n.id) });
    expect(await count(anna)).toBe(2);
    await markRead(anna, { ids: [list[0]?.id ?? ''] });
    expect(await count(anna)).toBe(1);
    await markRead(anna, { all: true });
    expect(await count(anna)).toBe(0);
  });

  it('forgets a household someone left', async () => {
    await addTransaction(anna, sharedInput(anna, 2_000));
    expect((await bell(ben)).unread).toBe(1);
    await settleUp(app, householdId, ben);
    await leave(app, householdId, ben);
    expect(await bell(ben)).toEqual({ notifications: [], unread: 0 });
    expect(await db.$count(notifications, eq(notifications.userId, ben.id))).toBe(0);
  });
});
