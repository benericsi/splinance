import type { Category, CreateCategoryInput, UpdateCategoryInput } from '@splinance/shared';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { isUniqueViolation } from '../../db/errors';
import { categories, type CategoryRow } from '../../db/schema';
import { HttpError } from '../../lib/http-error';
import { requireMembership } from '../households/households.service';

export const categoryNotFound = () =>
  new HttpError(404, 'Category not found', 'CATEGORY_NOT_FOUND');

const nameTaken = () =>
  new HttpError(409, 'A category with this name already exists', 'CATEGORY_NAME_TAKEN');

const NAME_UNIQUE = 'categories_household_kind_name_unique';

interface HouseholdScope {
  userId: string;
  householdId: string;
}

interface CategoryScope extends HouseholdScope {
  categoryId: string;
}

function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    icon: row.icon,
    color: row.color,
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

/** Turns the partial unique index violation into a 409 the form can show next to the name. */
async function mapNameTaken<T>(write: Promise<T>): Promise<T> {
  try {
    return await write;
  } catch (err) {
    if (isUniqueViolation(err, NAME_UNIQUE)) throw nameTaken();
    throw err;
  }
}

const activeCategory = ({ householdId, categoryId }: CategoryScope) =>
  and(
    eq(categories.id, categoryId),
    eq(categories.householdId, householdId),
    isNull(categories.archivedAt),
  );

/** Every member can manage categories. Archived ones are included: old transactions show them. */
export async function listCategories(scope: HouseholdScope): Promise<Category[]> {
  await requireMembership(db, scope);
  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.householdId, scope.householdId))
    .orderBy(asc(categories.kind), asc(sql`lower(${categories.name})`), asc(categories.id));
  return rows.map(toCategory);
}

export async function createCategory(
  scope: HouseholdScope,
  input: CreateCategoryInput,
): Promise<Category> {
  await requireMembership(db, scope);
  const [row] = await mapNameTaken(
    db
      .insert(categories)
      .values({ ...input, householdId: scope.householdId })
      .returning(),
  );
  if (!row) throw new Error('Category insert returned no row');
  return toCategory(row);
}

/** Archived categories are read-only: renaming one could collide with an active name later. */
export async function updateCategory(
  scope: CategoryScope,
  input: UpdateCategoryInput,
): Promise<Category> {
  await requireMembership(db, scope);
  const [row] = await mapNameTaken(
    db.update(categories).set(input).where(activeCategory(scope)).returning(),
  );
  if (!row) throw categoryNotFound();
  return toCategory(row);
}

/** Soft delete: hidden from pickers, still shown on the transactions that use it. */
export async function archiveCategory(scope: CategoryScope): Promise<void> {
  await requireMembership(db, scope);
  const [row] = await db
    .update(categories)
    .set({ archivedAt: new Date() })
    .where(activeCategory(scope))
    .returning({ id: categories.id });
  if (!row) throw categoryNotFound();
}
