import {
  categoryListResponseSchema,
  categoryResponseSchema,
  DEFAULT_CATEGORIES,
} from '@splinance/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '../../../test/db';
import { type App, createHousehold, errorCode, join, leave } from '../../../test/households';
import { bearer, createTestUser, pgErrorOf, type TestUser } from '../../../test/users';
import { createApp } from '../../app';
import { db } from '../../db/client';
import { categories } from '../../db/schema';

const pets = { name: 'Pets', kind: 'expense', icon: 'paw-print', color: 'orange' } as const;

async function list(app: App, user: TestUser, householdId: string) {
  const res = await request(app)
    .get(`/api/households/${householdId}/categories`)
    .set('Authorization', await bearer(user))
    .expect(200);
  return categoryListResponseSchema.parse(res.body).categories;
}

async function create(app: App, user: TestUser, householdId: string, body: object) {
  return request(app)
    .post(`/api/households/${householdId}/categories`)
    .set('Authorization', await bearer(user))
    .send(body);
}

describe('categories', () => {
  let app: App;
  let owner: TestUser;
  let householdId: string;

  beforeEach(async () => {
    await resetDatabase();
    app = createApp();
    owner = await createTestUser('Anna');
    householdId = await createHousehold(app, owner);
  });

  it('starts every household with the default set, expenses first, by name', async () => {
    const result = await list(app, owner, householdId);
    expect(result).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(result.every((c) => c.archivedAt === null)).toBe(true);

    const expected = [...DEFAULT_CATEGORIES].sort((a, b) =>
      a.kind === b.kind
        ? a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        : a.kind === 'expense'
          ? -1
          : 1,
    );
    expect(result.map(({ name, kind, icon, color }) => ({ name, kind, icon, color }))).toEqual(
      expected,
    );
  });

  it('lets any member create, rename and archive', async () => {
    const member = await createTestUser('Ben');
    await join(app, owner, householdId, member);

    const created = await create(app, member, householdId, { ...pets, name: '  Pets ' });
    expect(created.status).toBe(201);
    const category = categoryResponseSchema.parse(created.body).category;
    expect(category).toMatchObject({ ...pets, archivedAt: null });

    const renamed = await request(app)
      .patch(`/api/households/${householdId}/categories/${category.id}`)
      .set('Authorization', await bearer(owner))
      .send({ name: 'Cats', color: 'pink', kind: 'income' })
      .expect(200);
    // The kind is fixed at creation; an unknown key is dropped by the schema.
    expect(categoryResponseSchema.parse(renamed.body).category).toMatchObject({
      name: 'Cats',
      color: 'pink',
      kind: 'expense',
    });

    await request(app)
      .delete(`/api/households/${householdId}/categories/${category.id}`)
      .set('Authorization', await bearer(member))
      .expect(204);
    const archived = (await list(app, owner, householdId)).find((c) => c.id === category.id);
    expect(archived?.archivedAt).not.toBeNull();
  });

  it('keeps active names unique per kind, ignoring case', async () => {
    expect((await create(app, owner, householdId, pets)).status).toBe(201);

    const duplicate = await create(app, owner, householdId, { ...pets, name: 'PETS' });
    expect(duplicate.status).toBe(409);
    expect(errorCode(duplicate)).toBe('CATEGORY_NAME_TAKEN');

    // Same name, other kind: fine.
    expect((await create(app, owner, householdId, { ...pets, kind: 'income' })).status).toBe(201);

    // Renaming into a taken name is the same conflict.
    const groceries = (await list(app, owner, householdId)).find((c) => c.name === 'Groceries');
    const rename = await request(app)
      .patch(`/api/households/${householdId}/categories/${groceries?.id ?? ''}`)
      .set('Authorization', await bearer(owner))
      .send({ name: 'pets' });
    expect(rename.status).toBe(409);
    expect(errorCode(rename)).toBe('CATEGORY_NAME_TAKEN');
  });

  it('frees the name of an archived category and makes it read-only', async () => {
    const res = await create(app, owner, householdId, pets);
    const { id } = categoryResponseSchema.parse(res.body).category;
    const path = `/api/households/${householdId}/categories/${id}`;
    await request(app)
      .delete(path)
      .set('Authorization', await bearer(owner))
      .expect(204);

    expect((await create(app, owner, householdId, pets)).status).toBe(201);

    const update = await request(app)
      .patch(path)
      .set('Authorization', await bearer(owner))
      .send({ name: 'Old pets' });
    expect(update.status).toBe(404);
    expect(errorCode(update)).toBe('CATEGORY_NOT_FOUND');
    await request(app)
      .delete(path)
      .set('Authorization', await bearer(owner))
      .expect(404);
  });

  it('restores an archived category unless its name was reused', async () => {
    const res = await create(app, owner, householdId, pets);
    const { id } = categoryResponseSchema.parse(res.body).category;
    const path = `/api/households/${householdId}/categories/${id}`;
    await request(app)
      .delete(path)
      .set('Authorization', await bearer(owner))
      .expect(204);

    const restored = await request(app)
      .post(`${path}/restore`)
      .set('Authorization', await bearer(owner))
      .expect(200);
    expect(categoryResponseSchema.parse(restored.body).category).toMatchObject({
      name: 'Pets',
      archivedAt: null,
    });
    // Restoring an active category changes nothing.
    await request(app)
      .post(`${path}/restore`)
      .set('Authorization', await bearer(owner))
      .expect(200);

    // Archive again, reuse the name, then restoring conflicts.
    await request(app)
      .delete(path)
      .set('Authorization', await bearer(owner))
      .expect(204);
    expect((await create(app, owner, householdId, pets)).status).toBe(201);
    const conflict = await request(app)
      .post(`${path}/restore`)
      .set('Authorization', await bearer(owner));
    expect(conflict.status).toBe(409);
    expect(errorCode(conflict)).toBe('CATEGORY_NAME_TAKEN');

    // Not visible from another household.
    const outsider = await createTestUser('Eve');
    const otherHousehold = await createHousehold(app, outsider);
    await request(app)
      .post(`/api/households/${otherHousehold}/categories/${id}/restore`)
      .set('Authorization', await bearer(outsider))
      .expect(404);
  });

  it('validates input', async () => {
    const res = await create(app, owner, householdId, { ...pets, icon: 'skull' });
    expect(res.status).toBe(400);
    expect(errorCode(res)).toBe('VALIDATION_ERROR');

    const empty = await request(app)
      .patch(
        `/api/households/${householdId}/categories/${(await list(app, owner, householdId))[0]?.id ?? ''}`,
      )
      .set('Authorization', await bearer(owner))
      .send({});
    expect(empty.status).toBe(400);
  });

  it('hides categories from outsiders, former members and other households', async () => {
    const outsider = await createTestUser('Eve');
    const otherHousehold = await createHousehold(app, outsider);
    const [mine] = await list(app, owner, householdId);
    const [theirs] = await list(app, outsider, otherHousehold);

    // Not a member: 404 for the whole household.
    const listRes = await request(app)
      .get(`/api/households/${householdId}/categories`)
      .set('Authorization', await bearer(outsider));
    expect(listRes.status).toBe(404);
    expect(errorCode(listRes)).toBe('HOUSEHOLD_NOT_FOUND');
    expect((await create(app, outsider, householdId, pets)).status).toBe(404);

    // Another household's category through my own household: 404, untouched.
    const cross = await request(app)
      .patch(`/api/households/${householdId}/categories/${theirs?.id ?? ''}`)
      .set('Authorization', await bearer(owner))
      .send({ name: 'Mine now' });
    expect(cross.status).toBe(404);
    expect(errorCode(cross)).toBe('CATEGORY_NOT_FOUND');

    // A malformed id is a 404 too.
    await request(app)
      .delete(`/api/households/${householdId}/categories/not-a-uuid`)
      .set('Authorization', await bearer(owner))
      .expect(404);

    // A member who left loses access.
    const member = await createTestUser('Ben');
    await join(app, owner, householdId, member);
    await leave(app, householdId, member);
    await request(app)
      .patch(`/api/households/${householdId}/categories/${mine?.id ?? ''}`)
      .set('Authorization', await bearer(member))
      .send({ name: 'Gone' })
      .expect(404);

    await request(app).get(`/api/households/${householdId}/categories`).expect(401);
  });

  it('enforces the name rules in the database too', async () => {
    const err = await pgErrorOf(
      db.insert(categories).values([
        { ...pets, householdId },
        { ...pets, name: 'pEts', householdId },
      ]),
    );
    expect(err).toMatchObject({
      code: '23505',
      constraint: 'categories_household_kind_name_unique',
    });

    const length = await pgErrorOf(
      db.insert(categories).values({ ...pets, name: '', householdId }),
    );
    expect(length).toMatchObject({ code: '23514', constraint: 'categories_name_length' });
  });
});
