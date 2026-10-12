import { z } from 'zod';
import { amountMinorSchema } from '../money';
import {
  occurredOnSchema,
  personSchema,
  transactionInputSchema,
  transactionKindSchema,
} from '../transactions';
import { STATEMENT_SOURCES } from './types';

export const statementSourceSchema = z.enum(STATEMENT_SOURCES);

/** Most monthly statements have a few hundred rows at most. */
export const MAX_IMPORT_ROWS = 1000;

export const fingerprintSchema = z.string().min(1).max(300);

export const counterpartySchema = z.string().trim().max(120).nullable();

/** What the check needs to know about a row: no description beyond what matches. */
export const importCheckRowSchema = z.object({
  fingerprint: fingerprintSchema,
  occurredOn: occurredOnSchema,
  kind: transactionKindSchema,
  amount: amountMinorSchema,
});

export const importCheckInputSchema = z.object({
  rows: z.array(importCheckRowSchema).min(1).max(MAX_IMPORT_ROWS),
});

export type ImportCheckInput = z.infer<typeof importCheckInputSchema>;

/**
 * How a row relates to what the household already has, from the caller's side:
 * - `new`: nothing like it yet;
 * - `imported`: the caller imported this very row before (same fingerprint) and still has it;
 * - `undone`: imported before, but that import was undone (importing it again is expected);
 * - `deleted`: imported before, then deleted on its own (probably not wanted);
 * - `possible-duplicate`: the caller paid for a transaction entered by hand with the same
 *   kind and amount within two days (`match` names it). Each hand-entered transaction
 *   matches one row at most.
 */
export const IMPORT_ROW_STATUSES = [
  'new',
  'imported',
  'undone',
  'deleted',
  'possible-duplicate',
] as const;
export const importRowStatusSchema = z.enum(IMPORT_ROW_STATUSES);
export type ImportRowStatus = z.infer<typeof importRowStatusSchema>;

export const importCheckResultSchema = z.object({
  fingerprint: z.string(),
  status: importRowStatusSchema,
  /** The existing transaction the status refers to, if any. */
  match: z.object({ id: z.uuid(), description: z.string(), occurredOn: z.iso.date() }).nullable(),
});

export type ImportCheckResult = z.infer<typeof importCheckResultSchema>;

/** One result per row, in the order sent. */
export const importCheckResponseSchema = z.object({ rows: z.array(importCheckResultSchema) });
export type ImportCheckResponse = z.infer<typeof importCheckResponseSchema>;

/** A row to create: an ordinary transaction plus where it came from. */
export const importRowSchema = z.object({
  fingerprint: fingerprintSchema,
  counterparty: counterpartySchema,
  transaction: transactionInputSchema,
});

export type ImportRow = z.infer<typeof importRowSchema>;

export const importInputSchema = z.object({
  source: statementSourceSchema,
  fileName: z.string().trim().max(200).nullable(),
  rows: z.array(importRowSchema).min(1).max(MAX_IMPORT_ROWS),
});

export type ImportInput = z.infer<typeof importInputSchema>;

export const importBatchSchema = z.object({
  id: z.uuid(),
  source: statementSourceSchema,
  fileName: z.string().nullable(),
  /** Transactions this import created. */
  rowCount: z.number().int().nonnegative(),
  createdBy: personSchema,
  createdAt: z.iso.datetime({ offset: true }),
  undoneAt: z.iso.datetime({ offset: true }).nullable(),
});

export type ImportBatch = z.infer<typeof importBatchSchema>;

export const importResponseSchema = z.object({
  batch: importBatchSchema,
  /** Rows left out because the caller already has them (imported in the meantime). */
  skipped: z.number().int().nonnegative(),
});

export type ImportResponse = z.infer<typeof importResponseSchema>;

export const importListResponseSchema = z.object({ batches: z.array(importBatchSchema) });
export type ImportListResponse = z.infer<typeof importListResponseSchema>;
