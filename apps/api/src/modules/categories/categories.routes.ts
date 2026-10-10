import {
  type CategoryListResponse,
  type CategoryResponse,
  createCategoryInputSchema,
  updateCategoryInputSchema,
} from '@splinance/shared';
import { type Request, Router } from 'express';
import { householdScope, idParam } from '../households/scope';
import {
  archiveCategory,
  categoryNotFound,
  createCategory,
  listCategories,
  restoreCategory,
  updateCategory,
} from './categories.service';

function categoryScope(req: Request) {
  return { ...householdScope(req), categoryId: idParam(req, 'categoryId', categoryNotFound) };
}

/** Mounted at /households/:id/categories (behind requireAuth). */
export function createCategoriesRouter() {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    const body: CategoryListResponse = { categories: await listCategories(householdScope(req)) };
    res.json(body);
  });

  router.post('/', async (req, res) => {
    const scope = householdScope(req);
    const input = createCategoryInputSchema.parse(req.body);
    const body: CategoryResponse = { category: await createCategory(scope, input) };
    res.status(201).json(body);
  });

  router.patch('/:categoryId', async (req, res) => {
    const scope = categoryScope(req);
    const input = updateCategoryInputSchema.parse(req.body);
    const body: CategoryResponse = { category: await updateCategory(scope, input) };
    res.json(body);
  });

  router.delete('/:categoryId', async (req, res) => {
    await archiveCategory(categoryScope(req));
    res.status(204).end();
  });

  router.post('/:categoryId/restore', async (req, res) => {
    const body: CategoryResponse = { category: await restoreCategory(categoryScope(req)) };
    res.json(body);
  });

  return router;
}
