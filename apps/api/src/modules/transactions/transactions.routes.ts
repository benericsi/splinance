import {
  transactionInputSchema,
  type TransactionHistoryResponse,
  type TransactionListResponse,
  transactionListQuerySchema,
  type TransactionResponse,
  updateTransactionInputSchema,
} from '@splinance/shared';
import { type Request, Router } from 'express';
import { householdScope, idParam } from '../households/scope';
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  getTransactionHistory,
  listTransactions,
  restoreTransaction,
  transactionNotFound,
  updateTransaction,
} from './transactions.service';

function transactionScope(req: Request) {
  return {
    ...householdScope(req),
    transactionId: idParam(req, 'transactionId', transactionNotFound),
  };
}

/** Mounted at /households/:id/transactions (behind requireAuth). */
export function createTransactionsRouter() {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    const scope = householdScope(req);
    const query = transactionListQuerySchema.parse(req.query);
    const body: TransactionListResponse = await listTransactions(scope, query);
    res.json(body);
  });

  router.post('/', async (req, res) => {
    const scope = householdScope(req);
    const input = transactionInputSchema.parse(req.body);
    const body: TransactionResponse = { transaction: await createTransaction(scope, input) };
    res.status(201).json(body);
  });

  router.get('/:transactionId', async (req, res) => {
    const body: TransactionResponse = { transaction: await getTransaction(transactionScope(req)) };
    res.json(body);
  });

  // A full replacement, guarded by the version the client edited.
  router.put('/:transactionId', async (req, res) => {
    const scope = transactionScope(req);
    const input = updateTransactionInputSchema.parse(req.body);
    const body: TransactionResponse = { transaction: await updateTransaction(scope, input) };
    res.json(body);
  });

  router.delete('/:transactionId', async (req, res) => {
    await deleteTransaction(transactionScope(req));
    res.status(204).end();
  });

  router.post('/:transactionId/restore', async (req, res) => {
    const body: TransactionResponse = {
      transaction: await restoreTransaction(transactionScope(req)),
    };
    res.json(body);
  });

  router.get('/:transactionId/history', async (req, res) => {
    const body: TransactionHistoryResponse = {
      entries: await getTransactionHistory(transactionScope(req)),
    };
    res.json(body);
  });

  return router;
}
