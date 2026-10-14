import { budgetInputSchema, type BudgetListResponse, budgetQuerySchema } from '@splinance/shared';
import { Router } from 'express';
import { HttpError } from '../../lib/http-error';
import { householdScope, idParam } from '../households/scope';
import { listBudgets, setBudget } from './budgets.service';

const categoryNotFound = () => new HttpError(404, 'Category not found', 'CATEGORY_NOT_FOUND');

/** Mounted at /households/:id/budgets (behind requireAuth). */
export function createBudgetsRouter() {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    const scope = householdScope(req);
    const { month } = budgetQuerySchema.parse(req.query);
    const body: BudgetListResponse = { budgets: await listBudgets(scope, month) };
    res.json(body);
  });

  // Budgets are addressed by category: one per category and month.
  router.put('/:categoryId', async (req, res) => {
    const scope = {
      ...householdScope(req),
      categoryId: idParam(req, 'categoryId', categoryNotFound),
    };
    await setBudget(scope, budgetInputSchema.parse(req.body));
    res.status(204).end();
  });

  return router;
}
