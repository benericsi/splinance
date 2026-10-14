import {
  type RuleApplyResponse,
  ruleInputSchema,
  type RuleListResponse,
  type RuleMatchesResponse,
  ruleOrderInputSchema,
  type RuleResponse,
  updateRuleInputSchema,
} from '@splinance/shared';
import { type Request, Router } from 'express';
import { householdScope, idParam } from '../households/scope';
import {
  applyRule,
  countRuleMatches,
  createRule,
  deleteRule,
  listRules,
  reorderRules,
  ruleNotFound,
  updateRule,
} from './rules.service';

const ruleScope = (req: Request) => ({
  ...householdScope(req),
  ruleId: idParam(req, 'ruleId', ruleNotFound),
});

/** Mounted at /households/:id/rules (behind requireAuth). */
export function createRulesRouter() {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    const body: RuleListResponse = { rules: await listRules(householdScope(req)) };
    res.json(body);
  });

  router.post('/', async (req, res) => {
    const scope = householdScope(req);
    const input = ruleInputSchema.parse(req.body);
    const body: RuleResponse = { rule: await createRule(scope, input) };
    res.status(201).json(body);
  });

  // Before /:ruleId, which would otherwise read "order" as an id.
  router.put('/order', async (req, res) => {
    const scope = householdScope(req);
    const { ruleIds } = ruleOrderInputSchema.parse(req.body);
    const body: RuleListResponse = { rules: await reorderRules(scope, ruleIds) };
    res.json(body);
  });

  router.patch('/:ruleId', async (req, res) => {
    const scope = ruleScope(req);
    const input = updateRuleInputSchema.parse(req.body);
    const body: RuleResponse = { rule: await updateRule(scope, input) };
    res.json(body);
  });

  router.delete('/:ruleId', async (req, res) => {
    await deleteRule(ruleScope(req));
    res.status(204).end();
  });

  router.get('/:ruleId/matches', async (req, res) => {
    const body: RuleMatchesResponse = { count: await countRuleMatches(ruleScope(req)) };
    res.json(body);
  });

  router.post('/:ruleId/apply', async (req, res) => {
    const body: RuleApplyResponse = { updated: await applyRule(ruleScope(req)) };
    res.json(body);
  });

  return router;
}
