import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '../../test/db';
import { createHousehold, join } from '../../test/households';
import { createTestUser } from '../../test/users';
import { createApp } from '../app';
import { db, pool } from './client';
import { auditLog } from './schema';

/** The data migration as written, statement by statement (like the migrator runs it). */
const statements = readFileSync(new URL('../../drizzle/0025_audit_log_names.sql', import.meta.url))
  .toString()
  .split('--> statement-breakpoint');

async function migrate() {
  for (const statement of statements) await pool.query(statement);
}

beforeEach(async () => {
  await resetDatabase();
});

describe('0025 audit log names', () => {
  it('blanks every name kept in older snapshots and changes nothing else, twice over', async () => {
    const app = createApp();
    const [anna, ben] = [await createTestUser('Anna'), await createTestUser('Ben')];
    const householdId = await createHousehold(app, anna);
    await join(app, anna, householdId, ben);

    const person = (user: { id: string; displayName: string }) => ({
      userId: user.id,
      displayName: user.displayName,
    });
    const transaction = (description: string, split: unknown) => ({
      id: '019a0000-0000-7000-8000-000000000001',
      kind: 'expense',
      visibility: 'shared',
      amount: 10_000,
      description,
      paidBy: person(anna),
      createdBy: person(ben),
      split,
    });
    const shares = {
      method: 'equal',
      shares: [
        { ...person(anna), amount: 5_000 },
        { ...person(ben), amount: 5_000 },
      ],
    };
    const settlement = {
      id: '019a0000-0000-7000-8000-000000000002',
      from: person(ben),
      to: person(anna),
      amount: 5_000,
      note: 'Anna and Ben',
      createdBy: person(ben),
    };
    const base = { householdId, actorId: anna.id, entityId: transaction('', null).id };
    // Snapshots in the shape older code stored (names included), not today's types.
    const rows = [
      {
        ...base,
        entity: 'transaction',
        action: 'create',
        before: null,
        after: transaction('Shop', shares),
      },
      {
        ...base,
        entity: 'transaction',
        action: 'update',
        before: transaction('Shop', shares),
        after: transaction('Private now', null),
      },
      {
        ...base,
        entity: 'settlement',
        action: 'create',
        before: null,
        after: settlement,
      },
    ];
    await db.insert(auditLog).values(rows as unknown as (typeof auditLog.$inferInsert)[]);

    await migrate();
    const once = await db.select().from(auditLog).orderBy(auditLog.id);
    await migrate();
    expect(await db.select().from(auditLog).orderBy(auditLog.id)).toEqual(once);

    const blank = (user: { id: string }) => ({ userId: user.id, displayName: '' });
    const blankShares = {
      method: 'equal',
      shares: [
        { ...blank(anna), amount: 5_000 },
        { ...blank(ben), amount: 5_000 },
      ],
    };
    const stored = (description: string, split: unknown) => ({
      ...transaction(description, split),
      paidBy: blank(anna),
      createdBy: blank(ben),
    });
    expect(once.map((row) => [row.before, row.after])).toEqual([
      [null, stored('Shop', blankShares)],
      [stored('Shop', blankShares), stored('Private now', null)],
      [null, { ...settlement, from: blank(ben), to: blank(anna), createdBy: blank(ben) }],
    ]);
    // Free text is not a name field and stays as written.
    const [last] = await db.select().from(auditLog).where(eq(auditLog.entity, 'settlement'));
    expect((last?.after as { note: string }).note).toBe('Anna and Ben');
  });
});
