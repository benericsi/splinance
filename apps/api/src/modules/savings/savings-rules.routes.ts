import {
  type SavingsRuleListResponse,
  savingsRuleInputSchema,
  type SavingsRuleResponse,
  updateSavingsRuleInputSchema,
} from '@splinance/shared';
import { type Request, type RequestHandler, Router } from 'express';
import { householdScope, idParam } from '../households/scope';
import {
  createSavingsRule,
  deleteSavingsRule,
  listSavingsRules,
  savingsRuleNotFound,
  updateSavingsRule,
} from './savings-rules.service';

const ruleScope = (req: Request) => ({
  ...householdScope(req),
  ruleId: idParam(req, 'ruleId', savingsRuleNotFound),
});

/**
 * Mounted at /households/:id/savings/rules by the savings router, before its goal routes,
 * and sharing its write limit (`writes`).
 */
export function createSavingsRulesRouter(writes: RequestHandler) {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    const body: SavingsRuleListResponse = { rules: await listSavingsRules(householdScope(req)) };
    res.json(body);
  });

  router.post('/', writes, async (req, res) => {
    const scope = householdScope(req);
    const input = savingsRuleInputSchema.parse(req.body);
    const body: SavingsRuleResponse = { rule: await createSavingsRule(scope, input) };
    res.status(201).json(body);
  });

  router.patch('/:ruleId', writes, async (req, res) => {
    const scope = ruleScope(req);
    const input = updateSavingsRuleInputSchema.parse(req.body);
    const body: SavingsRuleResponse = { rule: await updateSavingsRule(scope, input) };
    res.json(body);
  });

  router.delete('/:ruleId', writes, async (req, res) => {
    await deleteSavingsRule(ruleScope(req));
    res.status(204).end();
  });

  return router;
}
