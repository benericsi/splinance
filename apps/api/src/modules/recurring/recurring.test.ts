import {
  type Category,
  categoryListResponseSchema,
  occurrence,
  recurringListResponseSchema,
  recurringPreviewResponseSchema,
  recurringSeriesResponseSchema,
  suggestRecurringPattern,
} from '@splinance/shared';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '../../../test/db';
import { type App, createHousehold, errorCode, join } from '../../../test/households';
import { bearer, createTestUser, type TestUser } from '../../../test/users';
import { createApp } from '../../app';
import { db } from '../../db/client';
import { recurringSeries } from '../../db/schema';
import { budapestToday } from '../../lib/today';

let app: App;
let anna: TestUser;
let ben: TestUser;
let householdId: string;
let entertainment: Category;
let salary: Category;

const base = (path = '') => `/api/households/${householdId}/recurring${path}`;
const today = budapestToday();
/** The 1st of the current month and of the months before it, oldest first. */
const monthsBack = (count: number, day = '01') =>
  Array.from({ length: count }, (_, index) =>
    occurrence(`${today.slice(0, 7)}-${day}`, 'monthly', index - count + 1),
  ).filter((date) => date <= today);

beforeEach(async () => {
  await resetDatabase();
  app = createApp();
  anna = await createTestUser('Anna');
  ben = await createTestUser('Ben');
  householdId = await createHousehold(app, anna);
  await join(app, anna, householdId, ben);
  const res = await request(app)
    .get(`/api/households/${householdId}/categories`)
    .set('Authorization', await bearer(anna))
    .expect(200);
  const { categories } = categoryListResponseSchema.parse(res.body);
  const named = (name: string) => {
    const found = categories.find((c) => c.name === name);
    if (!found) throw new Error(`No category ${name}`);
    return found;
  };
  entertainment = named('Entertainment');
  salary = named('Salary');
});

let fingerprints = 0;

/** Imports one bank row per date, as `user` (shared and split equally unless overridden). */
async function importRows(
  user: TestUser,
  counterparty: string,
  dates: string[],
  overrides: Record<string, unknown> = {},
) {
  const rows = dates.map((occurredOn) => {
    fingerprints += 1;
    return {
      fingerprint: `kh:${String(fingerprints)}`,
      counterparty,
      transaction: {
        visibility: 'shared',
        kind: 'expense',
        amount: 4_490,
        occurredOn,
        description: counterparty,
        categoryId: entertainment.id,
        paidBy: user.id,
        split: { method: 'equal', userIds: [anna.id, ben.id] },
        ...overrides,
      },
    };
  });
  const res = await request(app)
    .post(`/api/households/${householdId}/imports`)
    .set('Authorization', await bearer(user))
    .send({ source: 'kh', fileName: null, rows });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
}

/** Overrides for a private transaction (no payer or split: always its author's). */
const PRIVATE = { visibility: 'private', paidBy: undefined, split: undefined };

async function list(user: TestUser) {
  const res = await request(app)
    .get(base())
    .set('Authorization', await bearer(user))
    .expect(200);
  return recurringListResponseSchema.parse(res.body).recurring;
}

const input = (overrides: Record<string, unknown> = {}) => ({
  name: 'Spotify xyz',
  pattern: suggestRecurringPattern('Spotify xyz'),
  cadence: 'monthly',
  amount: 3_290,
  amountVaries: false,
  anchorOn: monthsBack(3)[0],
  startsOn: null,
  categoryId: entertainment.id,
  scope: 'shared',
  remind: true,
  ...overrides,
});

async function add(user: TestUser, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post(base())
    .set('Authorization', await bearer(user))
    .send(input(overrides));
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return recurringSeriesResponseSchema.parse(res.body).series;
}

async function decide(user: TestUser, action: 'confirm' | 'dismiss', scope: string, key: string) {
  return request(app)
    .post(base(`/suggestions/${action}`))
    .set('Authorization', await bearer(user))
    .send({ scope, key });
}

/** `decide`, expecting `status`. */
async function decided(
  user: TestUser,
  action: 'confirm' | 'dismiss',
  scope: string,
  key: string,
  status: number,
) {
  const res = await decide(user, action, scope, key);
  expect(res.status, JSON.stringify(res.body)).toBe(status);
  return res;
}

describe('series added by hand', () => {
  it('recognizes imports made later as its payments ("Spotify xyz")', async () => {
    const added = await add(anna);
    expect(added).toMatchObject({
      name: 'Spotify xyz',
      pattern: 'spotify',
      source: 'manual',
      scope: 'shared',
      paymentCount: 0,
      lastPaidOn: null,
      latestAmount: 3_290,
      share: null,
    });

    const dates = monthsBack(3);
    await importRows(ben, 'SPOTIFY P46ED88101', dates, { amount: 3_290 });

    const { series, suggestions } = await list(anna);
    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({
      id: added.id,
      paymentCount: dates.length,
      lastPaidOn: dates.at(-1),
      latestAmount: 3_290,
      share: 1_645,
      monthlyAmount: 3_290,
    });
    expect(series[0]?.payments.every((p) => p.imported)).toBe(true);
    // Covered by the series: no "spotify" suggestion on top of it.
    expect(suggestions).toEqual([]);
    expect((await list(ben)).series.map((s) => s.id)).toEqual([added.id]);
  });

  it('follows a price rise and leaves a different purchase at the merchant out', async () => {
    const [first, second, third] = monthsBack(3);
    await importRows(anna, 'Netflix.com', [first ?? '', second ?? '']);
    await importRows(anna, 'Netflix.com', [third ?? ''], { amount: 4_990 });
    await importRows(anna, 'NETFLIX GIFT CARD', [third ?? ''], { amount: 25_000 });
    const added = await add(anna, { name: 'Netflix', pattern: 'netflix', amount: 4_490 });
    expect(added).toMatchObject({ paymentCount: 3, latestAmount: 4_990, previousAmount: 4_490 });
  });

  it('refuses the same text twice in a scope, an income category and a start after the anchor', async () => {
    await add(anna);
    const again = await request(app)
      .post(base())
      .set('Authorization', await bearer(ben))
      .send(input({ name: 'Spotify', pattern: 'SPOTIFY' }));
    expect(again.status).toBe(409);
    expect(errorCode(again)).toBe('SERIES_PATTERN_TAKEN');
    // A private one with the same text is someone's own business.
    await add(ben, { scope: 'private' });

    const income = await request(app)
      .post(base())
      .set('Authorization', await bearer(anna))
      .send(input({ pattern: 'other', categoryId: salary.id }));
    expect(errorCode(income)).toBe('INVALID_CATEGORY');

    const late = await request(app)
      .post(base())
      .set('Authorization', await bearer(anna))
      .send(input({ pattern: 'other', anchorOn: '2026-01-01', startsOn: '2026-02-01' }));
    expect(errorCode(late)).toBe('VALIDATION_ERROR');
  });

  it('edits, then stops tracking: archived with payments, deleted without', async () => {
    const added = await add(anna);
    await importRows(anna, 'SPOTIFY', monthsBack(2), { amount: 3_290 });
    const res = await request(app)
      .patch(base(`/${added.id}`))
      .set('Authorization', await bearer(ben))
      .send({ name: 'Spotify Duo', remind: false })
      .expect(200);
    expect(recurringSeriesResponseSchema.parse(res.body).series).toMatchObject({
      name: 'Spotify Duo',
      remind: false,
      paymentCount: monthsBack(2).length,
    });

    await request(app)
      .delete(base(`/${added.id}`))
      .set('Authorization', await bearer(ben))
      .expect(204);
    const [archived] = await db
      .select()
      .from(recurringSeries)
      .where(eq(recurringSeries.id, added.id));
    expect(archived?.archivedAt).toBeInstanceOf(Date);
    expect((await list(anna)).series).toEqual([]);

    // The text is free again; one that never matched anything is deleted outright.
    const unused = await add(anna, { pattern: 'hbo', name: 'HBO' });
    await add(anna);
    await request(app)
      .delete(base(`/${unused.id}`))
      .set('Authorization', await bearer(anna))
      .expect(204);
    expect(
      await db.select().from(recurringSeries).where(eq(recurringSeries.id, unused.id)),
    ).toEqual([]);
  });
});

describe('suggestions', () => {
  it('confirms, dismisses and shows a dismissed one again', async () => {
    const dates = monthsBack(4);
    await importRows(anna, 'Netflix.com', dates);

    const before = await list(ben);
    expect(before.suggestions).toHaveLength(1);
    expect(before.suggestions[0]).toMatchObject({
      key: 'netflix',
      scope: 'shared',
      cadence: 'monthly',
      occurrences: dates.length,
      description: 'Netflix.com',
      categoryId: entertainment.id,
    });

    await decided(ben, 'dismiss', 'shared', 'netflix', 204);
    const hidden = await list(anna);
    expect(hidden.suggestions).toEqual([]);
    expect(hidden.dismissed).toMatchObject([{ pattern: 'netflix', scope: 'shared' }]);

    await request(app)
      .delete(base(`/${hidden.dismissed[0]?.id ?? ''}`))
      .set('Authorization', await bearer(anna))
      .expect(204);
    expect((await list(anna)).suggestions).toHaveLength(1);

    const confirmed = await decided(anna, 'confirm', 'shared', 'netflix', 201);
    expect(recurringSeriesResponseSchema.parse(confirmed.body).series).toMatchObject({
      source: 'detected',
      name: 'Netflix.com',
      pattern: 'netflix',
      anchorOn: dates.at(-1),
      paymentCount: dates.length,
      categoryId: entertainment.id,
    });
    const again = await decide(anna, 'confirm', 'shared', 'netflix');
    expect(again.status).toBe(404);
    expect(errorCode(again)).toBe('SUGGESTION_NOT_FOUND');
  });

  it('replaces a dismissal when the same text is added by hand', async () => {
    await importRows(anna, 'SPOTIFY', monthsBack(4), { amount: 3_290 });
    await decided(anna, 'dismiss', 'shared', 'spotify', 204);
    await add(anna);
    const after = await list(anna);
    expect(after.dismissed).toEqual([]);
    expect(after.series[0]?.paymentCount).toBe(monthsBack(4).length);
  });
});

describe('privacy', () => {
  it('keeps private series and suggestions to their owner', async () => {
    const dates = monthsBack(4);
    await importRows(anna, 'BKK Automata', dates, { ...PRIVATE, amount: 8_950 });

    expect((await list(ben)).suggestions).toEqual([]);
    const annas = await list(anna);
    expect(annas.suggestions.map((s) => [s.scope, s.key])).toEqual([['private', 'bkk automata']]);

    // Ben cannot confirm or dismiss it, not even by guessing the key.
    expect((await decide(ben, 'confirm', 'private', 'bkk automata')).status).toBe(404);
    expect((await decide(ben, 'dismiss', 'private', 'bkk automata')).status).toBe(404);
    expect((await decide(ben, 'confirm', 'shared', 'bkk automata')).status).toBe(404);

    const res = await decided(anna, 'confirm', 'private', 'bkk automata', 201);
    const series = recurringSeriesResponseSchema.parse(res.body).series;
    expect(series).toMatchObject({ scope: 'private', share: null, paymentCount: dates.length });
    expect((await list(ben)).series).toEqual([]);
    await request(app)
      .patch(base(`/${series.id}`))
      .set('Authorization', await bearer(ben))
      .send({ name: 'Mine now' })
      .expect(404);
    await request(app)
      .delete(base(`/${series.id}`))
      .set('Authorization', await bearer(ben))
      .expect(404);
  });

  it('never gives a shared series a private payment; previews count only what the caller sees', async () => {
    const dates = monthsBack(3);
    await importRows(anna, 'SPOTIFY', dates, { ...PRIVATE, amount: 3_290 });
    const shared = await add(ben);
    expect(shared.paymentCount).toBe(0);
    expect((await list(anna)).series[0]?.paymentCount).toBe(0);

    const preview = async (user: TestUser, scope: string) => {
      const res = await request(app)
        .post(base('/preview'))
        .set('Authorization', await bearer(user))
        .send({ pattern: 'spotify', amount: 3_290, amountVaries: false, scope, startsOn: null })
        .expect(200);
      return recurringPreviewResponseSchema.parse(res.body);
    };
    expect((await preview(anna, 'shared')).matches).toBe(0);
    expect((await preview(ben, 'private')).matches).toBe(0);
    const own = await preview(anna, 'private');
    expect(own.matches).toBe(dates.length);
    expect(own.recent[0]?.occurredOn).toBe(dates.at(-1));
  });

  it('gives a shared series the same payments for everyone, before private series', async () => {
    await importRows(anna, 'Netflix.com', monthsBack(3));
    // Anna tracks her half privately first; the household then tracks it too.
    await add(anna, { name: 'My Netflix', pattern: 'netflix', amount: 4_490, scope: 'private' });
    const shared = await add(ben, { name: 'Netflix', pattern: 'netflix', amount: 4_490 });
    const count = monthsBack(3).length;
    expect(shared.paymentCount).toBe(count);
    const annas = await list(anna);
    expect(annas.series.map((s) => [s.scope, s.paymentCount]).sort()).toEqual(
      [
        ['private', 0],
        ['shared', count],
      ].sort(),
    );
    expect((await list(ben)).series.map((s) => s.paymentCount)).toEqual([count]);
  });

  it('answers 404 to non-members and for malformed ids', async () => {
    const cara = await createTestUser('Cara');
    await request(app)
      .get(base())
      .set('Authorization', await bearer(cara))
      .expect(404);
    await request(app)
      .post(base())
      .set('Authorization', await bearer(cara))
      .send(input())
      .expect(404);
    await request(app)
      .patch(base('/not-an-id'))
      .set('Authorization', await bearer(anna))
      .send({ remind: false })
      .expect(404);
    const other = await createHousehold(app, cara, 'Elsewhere');
    const theirs = await request(app)
      .post(`/api/households/${other}/recurring`)
      .set('Authorization', await bearer(cara))
      .send(input({ categoryId: null }))
      .expect(201);
    const id = recurringSeriesResponseSchema.parse(theirs.body).series.id;
    await request(app)
      .delete(base(`/${id}`))
      .set('Authorization', await bearer(anna))
      .expect(404);
  });
});
